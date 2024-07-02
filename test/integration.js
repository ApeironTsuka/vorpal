'use strict';

import Vorpal from '../lib/vorpal.js';
import commands from './util/server.js';
import BlueBirdPromise from 'bluebird';
import fs from 'node:fs';
import intercept from '../lib/intercept.js';
import assert from 'assert';
import should from 'should';

const vorpal = new Vorpal();

let _all = '',
    _stdout = '',
    _excess = '';

let onStdout = (str) => {
  _stdout += str;
  _all += str;
  return '';
};

const stdout = () => {
  const out = _stdout;
  _stdout = '';
  return String(out || '');
};

describe('integration tests:', () => {
  describe('vorpal', () => {
    it('should overwrite duplicate commands', (done) => {
      const arr = [ 'a', 'b', 'c' ];
      arr.forEach((item) => {
        vorpal
          .command('overwritten', 'This command gets overwritten.')
          .action(function (args, cb) {
            cb(undefined, item);
          });
        vorpal
          .command('overwrite me')
          .action(function (args, cb) {
            cb(undefined, item);
          });
      });

      vorpal.exec('overwritten', function (err, data) {
        (err === undefined).should.be.true;
        data.should.equal('c');
        vorpal.exec('overwrite me', function (err, data) {
          (err === undefined).should.be.true;
          data.should.equal('c');
          done();
        });
      });
    });

    it('should register and execute aliases', (done) => {
      vorpal
        .command('i go by other names', 'This command has many aliases.')
        .alias('donald trump')
        .alias('sinterclaus', ['linus torvalds', 'nan nan nan nan nan nan nan watman!'])
        .action(function (args, cb) {
          cb(undefined, 'You have found me.');
        });

      let ctr = 0,
          arr = [ 'donald trump', 'sinterclaus', 'linus torvalds', 'nan nan nan nan nan nan nan watman!' ];
      function go() {
        if (arr[ctr]) {
          vorpal.exec(arr[ctr], function (err, data) {
            (err === undefined).should.be.true;
            data.should.equal('You have found me.');
            ctr++;
            if (!arr[ctr]) {
              done();
            } else {
              go();
            }
          });
        }
      }
      go();
    });

    it('should fail on duplicate alias', (done) => {
      (() => {
        vorpal
          .command('This command should crash!', 'Any moment now...')
          .alias('Oh no!')
          .alias('Here it comes!')
          .alias('Oh no!');
      }).should.throw(Error);
      done();
    });

    it('should validate arguments', (done) => {
      const errorThrown = new Error('Invalid Argument');
      vorpal
        .command('validate-me [arg]', 'This command only allows argument "valid"')
        .validate(function (args) {
          this.checkInstance = 'this is the instance';
          if ((!args) || (args.arg !== 'valid')) {
            throw errorThrown;
          }
        })
        .action(function (args, cb) {
          this.checkInstance.should.equal('this is the instance');
          cb();
        });

      vorpal.exec('validate-me valid', function (err) {
        (err === undefined).should.be.true;
        vorpal.exec('validate-me invalid', function (err) {
          err.should.equal(errorThrown);
          done();
        });
      });
    });
  });

  describe('vorpal execution', () => {
    before('preparation', () => {
      vorpal.pipe(onStdout).use(commands);
    });

    afterEach(() => {
      _excess += stdout();
    });

    const exec = function (cmd, done, cb) {
      vorpal.exec(cmd).then((data) => {
        cb(undefined, data);
      }).catch((err) => {
        console.log(err);
        done(err);
      });
    };

    describe('promise execution', () => {
      it('should not fail', (done) => {
        vorpal.exec('fail me not').then(() => {
          true.should.be.true; done();
        }).catch((err) => {
          console.log(stdout());
          console.log('b', err.stack);
          true.should.not.be.true; done(err);
        });
      });

      it('should fail', (done) => {
        vorpal.exec('fail me yes').then(() => {
          true.should.not.be.true; done();
        }).catch(() => {
          true.should.be.true; done();
        });
      });
    });

    describe('command execution', () => {
      it('should execute a simple command', (done) => {
        exec('fuzzy', done, (err) => {
          stdout().should.equal('wuzzy');
          done(err);
        });
      });

      it('should execute help', (done) => {
        exec('help', done, (err) => {
          String(stdout()).toLowerCase().should.containEql('help');
          done(err);
        });
      });

      it('should chain two async commands', (done) => {
        vorpal.exec('foo').then(() => {
          stdout().should.equal('bar');
          return vorpal.exec('fuzzy');
        }).then(() => {
          stdout().should.equal('wuzzy');
          done();
        }).catch((err) => {
          (err === undefined).should.be.true;
          done(err);
        });
      });

      it('should execute a two-word-deep command', (done) => {
        exec('deep command arg', done, (err) => {
          stdout().should.equal('arg');
          done(err);
        });
      });

      it('should execute a three-word-deep command', (done) => {
        exec('very deep command arg', done, (err) => {
          stdout().should.equal('arg');
          done(err);
        });
      });

      // This has ... promise ... problems.
      /*it.skip('should execute 50 async commands in sync', (done) => {
        this.timeout(4000);
        let dones = 0,
            result = '',
            should = '',
            total = 50;
        const handler = () => {
          dones++;
          if (dones === (total - 1)) {
            result.should.equal(should);
            done();
          }
        };
        const hnFn = () => {
          result += stdout();
          handler();
        };
        const cFn = (err) => {
          done(err);
        };
        for (let i = 1; i < total; ++i) {
          should += i;
          vorpal.exec('count ' + i).then(hnFn).catch(cFn);
        }
      });*/
    });

    describe('inquirer prompt', () => {
      const parent = new Vorpal();

      beforeEach(() => {
        // attach a parent so the prompt will run
         vorpal.ui.attach(parent);
      });

      afterEach(() => {
        vorpal.ui.detach(parent);
      });

      after(() => {
        parent.destroy();
      });

      it('should show the default value', (done) => {
        const execPromise = vorpal.exec('prompt default myawesomeproject');
        vorpal.ui.inquirerStdout.join('\n').should.containEql('(myawesomeproject)');
        execPromise
          .then((s) => {
            s.project.should.equal('myawesomeproject');
            // stdout should have cleared once the prompt is finished
            vorpal.ui.inquirerStdout.join('\n').should.not.containEql('(myawesomeproject)');
            done();
          })
          .catch((err) => {
            console.log(stdout());
            console.log('b', err.stack);
            true.should.not.be.true;
            done(err);
          });
        // submit the default
        vorpal.ui.submit();
      });
    });

    describe('synchronous execution', () => {
      it('should execute a sync command', () => {
        const result = vorpal.execSync('sync');
        result.should.equal('no args were passed');
      });

      it('should execute a sync command with args', () => {
        const result = vorpal.execSync('sync foobar');
        result.should.equal('you said foobar');
      });

      it('should fail silently', () => {
        const result = vorpal.execSync('sync throwme');
        result.message.should.equal('You said so...');
      });

      it('should fail loudly if you tell it to', () => {
        (() => {
          vorpal.execSync('sync throwme', {fatal: true});
        }).should.throw();
      });
    });

    describe('.command.help', () => {
      it('should execute a custom help command.', (done) => {
        exec('custom-help --help', done, (err) => {
          String(stdout()).should.containEql('This is a custom help output.');
          done(err);
        });
      });
    });

    describe('.command.parse', () => {
      it('should add on details to an existing command.', (done) => {
        exec('parse me in-reverse', done, (err) => {
          String(stdout()).should.containEql('esrever-ni');
          done(err);
        });
      });
    });

    describe('piped commands', () => {
      it('should execute a piped command', (done) => {
        exec('say cheese | reverse', done, () => {
          stdout().should.equal('eseehc');
          done();
        });
      });

      it('should execute a piped command with double quoted pipe character', (done) => {
        exec('say "cheese|meat" | reverse', done, () => {
          stdout().should.equal('taem|eseehc');
          done();
        });
      });

      it('should execute a piped command with single quoted pipe character', (done) => {
        exec('say \'cheese|meat\' | reverse', done, () => {
          stdout().should.equal('taem|eseehc');
          done();
        });
      });

      it('should execute a piped command with angle quoted pipe character', (done) => {
        exec('say `cheese|meat` | reverse', done, () => {
          stdout().should.equal('taem|eseehc');
          done();
        });
      });

      it('should execute multiple piped commands', (done) => {
        exec('say donut | reverse | reverse | array', done, () => {
          stdout().should.equal('d,o,n,u,t');
          done();
        });
      });
    });

    describe('command parsing and validation', () => {
      it('should parse double quoted command option', (done) => {
        exec('say "Vorpal\'s command parsing is great"', done, () => {
          stdout().should.equal('Vorpal\'s command parsing is great');
          done();
        });
      });

      it('should parse single quoted command option', (done) => {
        exec('say \'My name is "Vorpal"\', done', done, () => {
          stdout().should.equal('My name is "Vorpal"');
          done();
        });
      });

      it('should parse angle quoted command option', (done) => {
        exec('say `He\'s "Vorpal"`, done', done, () => {
          stdout().should.equal('He\'s "Vorpal"');
          done();
        });
      });

      it('should parse double quotes pipe character in command argument', (done) => {
        exec('say "(vorpal|Vorpal)", done', done, () => {
          stdout().should.equal('(vorpal|Vorpal)');
          done();
        });
      });

      it('should parse single quoted pipe character in command argument', (done) => {
        exec('say \'(vorpal|Vorpal)\', done', done, () => {
          stdout().should.equal('(vorpal|Vorpal)');
          done();
        });
      });

      it('should parse angle quoted pipe character in command argument', (done) => {
        exec('say `(vorpal|Vorpal)`, done', done, () => {
          stdout().should.equal('(vorpal|Vorpal)');
          done();
        });
      });

      it('should execute a command when not passed an optional variable', (done) => {
        exec('optional', done, () => {
          stdout().should.equal('');
          done();
        });
      });

      it('should understand --no-xxx options', (done) => {
        exec('i want --no-cheese', done, () => {
          stdout().should.equal('false');
          done();
        });
      });

      it('should parse hyphenated options', (done) => {
        exec('hyphenated-option --dry-run', done, () => {
          stdout().should.equal('true');
          done();
        });
      });

      it('should use minimist\'s parse through the .types() method', (done) => {
        exec('typehappy --numberify 4 -s 5', done, (err, data) => {
          (err === undefined).should.be.true;
          data.options.numberify.should.equal(4);
          data.options.stringify.should.equal('5');
          done();
        });
      });

      it('should ignore variadic arguments when not warranted', (done) => {
        exec('required something with extra something', done, (err, data) => {
          (err === undefined).should.be.true;
          data.arg.should.equal('something');
          done();
        });
      });

      it('should receive variadic arguments as array', (done) => {
        exec('variadic pepperoni olives pineapple anchovies', done, (err, data) => {
          (err === undefined).should.be.true;
          data.pizza.should.equal('pepperoni');
          data.ingredients[0].should.equal('olives');
          data.ingredients[1].should.equal('pineapple');
          data.ingredients[2].should.equal('anchovies');
          done();
        });
      });

      it('should receive variadic arguments as array when quoted', (done) => {
        exec('variadic "pepperoni" \'olives\' `pineapple` anchovies', done, (err, data) => {
          (err === undefined).should.be.true;
          data.pizza.should.equal('pepperoni');
          data.ingredients[0].should.equal('olives');
          data.ingredients[1].should.equal('pineapple');
          data.ingredients[2].should.equal('anchovies');
          done();
        });
      });

      it('should accept variadic args as the first arg', (done) => {
        exec('variadic-pizza olives pineapple anchovies', done, (err, data) => {
          (err === undefined).should.be.true;
          data.ingredients[0].should.equal('olives');
          data.ingredients[1].should.equal('pineapple');
          data.ingredients[2].should.equal('anchovies');
          done();
        });
      });

      context('when first variadic argument has falsy value', () => {
        context('when variadic argument comes last', () => {
          it('should parse variadic arguments properly', (done) => {
            exec('variadic pepperoni 0 1 olives ', done, (err, data) => {
              (err === undefined).should.be.true;
              data.pizza.should.equal('pepperoni');
              data.ingredients[0].should.equal(0);
              data.ingredients[1].should.equal(1);
              data.ingredients[2].should.equal('olives');
              done();
            });
          });
        })
        context('when one and only argument is variadic', () => {
          it('should parse variadic arguments properly', (done) => {
            exec('variadic-pizza 0 1 olives ', done, (err, data) => {
              (err === undefined).should.be.true;
              data.ingredients[0].should.equal(0);
              data.ingredients[1].should.equal(1);
              data.ingredients[2].should.equal('olives');
              done();
            });
          });
        })
      })

      it('should accept a lot of arguments', (done) => {
        exec('cmd that has a ton of arguments', done, (err, data) => {
          (err === undefined).should.be.true;
          data.with.should.equal('that');
          data.one.should.equal('has');
          data.million.should.equal('a');
          data.arguments.should.equal('ton');
          data.in.should.equal('of');
          data.it.should.equal('arguments');
          done();
        });
      });

      it('should show help when not passed a required variable', (done) => {
        exec('required', done, () => {
          (stdout().indexOf('Missing required argument') > -1).should.equal(true);
          done();
        });
      });

      it('should show help when passed an unknown option', (done) => {
        exec('unknown-option --unknown-opt', done, () => {
          (stdout().indexOf('Invalid option') > -1).should.equal(true);
          done();
        });
      });

      it('should should execute a command when passed a required variable', (done) => {
        exec('required foobar', done, () => {
          stdout().should.equal('foobar');
          done();
        });
      });

      it('should show help when passed an invalid command', (done) => {
        exec('gooblediguck', done, () => {
          (stdout().indexOf('Invalid Command. Showing Help:') > -1).should.equal(true);
          done();
        });
      });

      it('should show subcommand help on invalid subcommand', (done) => {
        exec('very complicated', done, () => {
          stdout().should.containEql('very complicated deep');
          done();
        });
      });
    });

    describe('mode', () => {
      it('should enter REPL mode', (done) => {
        vorpal.exec('repl').then(() => {
          stdout().should.containEql('Entering REPL Mode');
          done();
        }).catch((err) => {
          done(err);
        });
      });

      it('should execute arbitrary JS', (done) => {
        vorpal.exec('3*9').then((data) => {
          (parseFloat(data) || '').should.equal(27);
          parseFloat(stdout()).should.equal(27);
          done();
        }).catch((err) => {
          done(err);
        });
      });

      it('should exit REPL mode properly', (done) => {
        vorpal.exec('exit').then(() => {
          stdout();
          return vorpal.exec('help');
        }).then(() => {
          stdout().should.containEql('exit');
          done();
        }).catch((err) => {
          done(err);
        });
      });
    });

    describe('history', () => {
      let vorpalHistory;
      let UNIT_TEST_STORAGE_PATH = './.unit_test_cmd_history';
      before(() => {
        vorpalHistory = new Vorpal();
        vorpalHistory.historyStoragePath(UNIT_TEST_STORAGE_PATH);
        vorpalHistory.history('unit_test');
        vorpalHistory.exec('command1');
        vorpalHistory.exec('command2');
      });

      after((done) => {
        // Clean up history
        vorpalHistory.cmdHistory.clear();
        vorpalHistory.destroy();

        // Clean up directory created to store history
        fs.rmdir(UNIT_TEST_STORAGE_PATH, () => {
          done();
        });
      });

      it('should be able to get history', () => {
        vorpalHistory.session.getHistory('up').should.equal('command2');
        vorpalHistory.session.getHistory('up').should.equal('command1');
        vorpalHistory.session.getHistory('down').should.equal('command2');
        vorpalHistory.session.getHistory('down').should.equal('');
      });

      it('should keep separate history for mode', () => {
        vorpalHistory.cmdHistory.enterMode();
        vorpalHistory.exec('command3');

        vorpalHistory.session.getHistory('up').should.equal('command3');
        vorpalHistory.session.getHistory('up').should.equal('command3');
        vorpalHistory.session.getHistory('down').should.equal('');

        vorpalHistory.cmdHistory.exitMode();

        vorpalHistory.session.getHistory('up').should.equal('command2');
        vorpalHistory.session.getHistory('up').should.equal('command1');
        vorpalHistory.session.getHistory('down').should.equal('command2');
        vorpalHistory.session.getHistory('down').should.equal('');
      });

      it('should persist history', () => {
        const vorpalHistory2 = new Vorpal();
        vorpalHistory2.historyStoragePath(UNIT_TEST_STORAGE_PATH);
        vorpalHistory2.history('unit_test');
        vorpalHistory2.session.getHistory('up').should.equal('command2');
        vorpalHistory2.session.getHistory('up').should.equal('command1');
        vorpalHistory2.session.getHistory('down').should.equal('command2');
        vorpalHistory2.session.getHistory('down').should.equal('');
        vorpalHistory2.destroy();
      });

      it('should ignore consecutive duplicates', () => {
        vorpalHistory.exec('command2');
        vorpalHistory.session.getHistory('up').should.equal('command2');
        vorpalHistory.session.getHistory('up').should.equal('command1');
        vorpalHistory.session.getHistory('down').should.equal('command2');
        vorpalHistory.session.getHistory('down').should.equal('');
      });

      it('should always return last executed command immediately after', () => {
        vorpalHistory.exec('command1');
        vorpalHistory.exec('command2');
        vorpalHistory.session.getHistory('up').should.equal('command2');
        vorpalHistory.exec('command2');
        vorpalHistory.session.getHistory('up').should.equal('command2');
        vorpalHistory.session.getHistory('up').should.equal('command1');
      });
    });

    describe('cancel', () => {
      let longRunningCommand;
      before(() => {
        longRunningCommand = vorpal
          .command('LongRunning', 'This command keeps running.')
          .action(function () {
            this._cancelled = false;
            let cancelInt = setInterval(() => {
              if (this._cancelled) {
                // break off
                clearInterval(cancelInt);
              }
            }, 1000);
            let p = new BlueBirdPromise(() => {});
            p.cancellable();
            return p;
          });
      });
      it('should cancel promise', (done) => {
        vorpal.exec('LongRunning')
          .then(() => {
            true.should.not.be.true;
            done();
          }).catch((instance) => {
            instance._cancelled = true;
            done();
          });
        vorpal.session.cancelCommands();
      });
      it('should call registered cancel function', (done) => {
        longRunningCommand
          .cancel(function () {
            this._cancelled = true;
            done();
          });
        vorpal.exec('LongRunning');
        vorpal.session.cancelCommands();
      });
      it('should be able to call cancel in action', (done) => {
        vorpal
          .command('SelfCancel', 'This command cancels itself.')
          .action(function () {
            this.cancel();
          })
          .cancel(function () {
            true.should.be.true;
            done();
          });

        vorpal.exec('SelfCancel');
      });
      it('should handle event client_command_cancelled', (done) => {
        vorpal.on('client_command_cancelled', function () {
          true.should.be.true;
          done();
        });
        longRunningCommand
          .cancel(function () {
            this._cancelled = true;
          });
        vorpal.exec('LongRunning');
        vorpal.session.cancelCommands();
      });
    });

    describe('events', () => {
      it('should handle event command_registered', (done) => {
        vorpal.on('command_registered', function () {
          true.should.be.true; done();
        }).command('newMethod');
      });
      it('should handle event client_keypress', (done) => {
        vorpal.on('client_keypress', function () {
          vorpal.hide();
          done();
        }).delimiter('').show()
          .ui._activePrompt.onKeypress({key: 'k'});
      });
      it('should handle event client_prompt_submit', (done) => {
        vorpal.on('client_prompt_submit', function (result) {
          result.should.equal('');
          vorpal.hide();
          done();
        }).delimiter('')
          .show()
          .ui.submit('');
      });
      it('should handle event client_command_executed', (done) => {
        vorpal.on('client_command_executed', function () {
          true.should.be.true; done();
        });
        vorpal.exec('help');
      });
      it('should handle event client_command_error', (done) => {
        vorpal.on('client_command_error', function () {
          true.should.be.true; done();
        });
        vorpal.exec('fail me plzz');
      });
      it('should handle piped event client_command_error', (done) => {
        let vorpal2 = new Vorpal();
        vorpal2.on('client_command_error', function () {
          true.should.be.true; done();
        })
        .command('fail')
        .action(function (args, cb) {
          cb('failed');
        });
        vorpal2.exec('help | fail | help');
        vorpal2.destroy();
      });
    });

    describe('local storage', () => {
      it('should error if not initialized', () => {
        (() => {
          vorpal.localStorage.setItem();
        }).should.throw();
        (() => {
          vorpal.localStorage.getItem();
        }).should.throw();
        (() => {
          vorpal.localStorage.removeItem();
        }).should.throw();
      });

      it('should error if not passed a unique id', () => {
        (() => {
          vorpal.localStorage();
        }).should.throw();
      });

      it('should set and get items', () => {
        const a = new Vorpal();
        a.localStorage('foo');
        a.localStorage.setItem('cow', 'lick');
        a.localStorage.getItem('cow').should.equal('lick');
        a.destroy();
      });
    });
  });
  describe('cleanup', () => {
    it('cleanup', () => {
      vorpal.destroy();
    });
  });
});
