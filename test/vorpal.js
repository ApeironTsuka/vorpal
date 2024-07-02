 /**
  * This is the new testing file, as
  * the current one totally sucks.
  * eventually move all tests over to
  * this one.
  */

import Vorpal from '../lib/vorpal.js';
import should from 'should';
import assert from 'assert';
import intercept from '../lib/intercept.js';

let vorpal;

// Normalize inputs to objects.
function obj(inp) {
  if (typeof inp === 'String') {
    return JSON.stringify(JSON.parse('(' + inp + ')'));
  } else {
    return JSON.stringify(inp);
  }
}

let stdout = '',
    mute = () => {
      unmute = intercept((str) => {
        stdout += str;
        return '';
      });
    },
    unmute;

vorpal = new Vorpal();
vorpal
  .command('foo [args...]')
  .option('-b, --bool')
  .option('-r, --required <str>')
  .option('-o, --optional [str]')
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('bar')
  .allowUnknownOptions(true)
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('baz')
  .allowUnknownOptions(true)
  .allowUnknownOptions(false)
  .action(function (args, cb) {
      return args;
  });

vorpal
  .command('optional [str]')
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('required <str>')
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('multiple <req> [opt] [variadic...]')
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('wrong-sequence [opt] <req> [variadic...]')
  .action(function (args, cb) {
    return args;
  });

vorpal
  .command('multi word command [variadic...]')
  .action(function (args, cb) {
    return args;
  });

describe('argument parsing', () => {
  it('should execute a command with no args', () => {
    const fixture = obj({ options: {} });
    obj(vorpal.execSync('foo')).should.equal(fixture);
  });

  it('should execute a command without an optional arg', () => {
    const fixture = obj({ options: {} });
    obj(vorpal.execSync('optional')).should.equal(fixture);
  });

  it('should execute a command with an optional arg', () => {
    const fixture = obj({ options: {}, str: 'bar' });
    obj(vorpal.execSync('optional bar')).should.equal(fixture);
  });

  it('should execute a command with a required arg', () => {
    const fixture = obj({ options: {}, str: 'bar' });
    obj(vorpal.execSync('required bar')).should.equal(fixture);
  });

  it('should throw help when not passed a required arg', () => {
    mute();
    const fixture = '\n  Missing required argument. Showing Help:';
    vorpal.execSync('required').should.equal(fixture);
    unmute();
  });

  it('should execute a command with multiple arg types', () => {
    const fixture = obj({ options: {}, req: 'foo', opt: 'bar', variadic:  [ 'joe', 'smith' ] });
    obj(vorpal.execSync('multiple foo bar joe smith')).should.equal(fixture);
  });

  it('should correct a command with wrong arg sequences declared', () => {
    const fixture = obj({ options: {}, req: 'foo', opt: 'bar', variadic:  [ 'joe', 'smith' ] });
    obj(vorpal.execSync('multiple foo bar joe smith')).should.equal(fixture);
  });

  it('should normalize key=value pairs', () => {
    const fixture = obj({ options: {},
      req: "a='b'",
      opt: "c='d and e'",
      variadic:  [ "wombat='true'", "a", "fizz='buzz'", "hello='goodbye'" ] });
    obj(vorpal.execSync('multiple a=\'b\' c="d and e" wombat=true a fizz=\'buzz\' "hello=\'goodbye\'"')).should.equal(fixture);
  });

  it('should NOT normalize key=value pairs when isCommandArgKeyPairNormalized is false', () => {
    const fixture = obj({ options: {},
      req: "hello=world",
      opt: 'hello="world"',
      variadic: [ 'hello=`world`' ]
    });
    vorpal.isCommandArgKeyPairNormalized = false;
    obj(vorpal.execSync('multiple "hello=world" \'hello="world"\' "hello=`world`"')).should.equal(fixture);
    vorpal.isCommandArgKeyPairNormalized = true;
  });

  it('should execute multi-word command with arguments', () => {
    const fixture = obj({ options: {}, variadic:  [ 'and', 'so', 'on' ] });
    obj(vorpal.execSync('multi word command and so on')).should.equal(fixture);
  });

  it('should parse command with undefine in it as invalid', () => {
    const fixture = obj("Invalid command.");
    obj(vorpal.execSync('has undefine in it')).should.equal(fixture);
  })
});

describe('option parsing', () => {
  it('should execute a command with no options', () => {
    const fixture = obj({ options: {} });
    obj(vorpal.execSync('foo')).should.equal(fixture);
  });

  it('should execute a command with args and no options', () => {
    const fixture = obj({ options: {}, args: [ 'bar', 'smith' ] });
    obj(vorpal.execSync('foo bar smith')).should.equal(fixture);
  });

  describe('options before an arg', () => {
    it('should accept a short boolean option', () => {
      const fixture = obj({ options: { bool: true }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo -b bar smith')).should.equal(fixture);
    });

    it('should accept a long boolean option', () => {
      const fixture = obj({ options: { bool: true }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo --bool bar smith')).should.equal(fixture);
    });

    it('should accept a short optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo --o cheese bar smith')).should.equal(fixture);
    });

    it('should accept a long optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo --optional cheese bar smith')).should.equal(fixture);
    });

    it('should accept a short required option', () => {
      const fixture = obj({ options: { required: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo -r cheese bar smith')).should.equal(fixture);
    });

    it('should accept a long required option', () => {
      const fixture = obj({ options: { required: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo --required cheese bar smith')).should.equal(fixture);
    });
  });

  describe('options after args', () => {
    it('should accept a short boolean option', () => {
      const fixture = obj({ options: { bool: true }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith -b ')).should.equal(fixture);
    });

    it('should accept a long boolean option', () => {
      const fixture = obj({ options: { bool: true }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith --bool ')).should.equal(fixture);
    });

    it('should accept a short optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith --o cheese ')).should.equal(fixture);
    });

    it('should accept a long optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith --optional cheese ')).should.equal(fixture);
    });

    it('should accept a short required option', () => {
      const fixture = obj({ options: { required: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith -r cheese ')).should.equal(fixture);
    });

    it('should accept a long required option', () => {
      const fixture = obj({ options: { required: 'cheese' }, args: [ 'bar', 'smith' ] });
      obj(vorpal.execSync('foo bar smith --required cheese ')).should.equal(fixture);
    });
  });

  describe('options without an arg', () => {
    it('should accept a short boolean option', () => {
      const fixture = obj({ options: { bool: true }});
      obj(vorpal.execSync('foo -b ')).should.equal(fixture);
    });

    it('should accept a long boolean option', () => {
      const fixture = obj({ options: { bool: true }});
      obj(vorpal.execSync('foo --bool ')).should.equal(fixture);
    });

    it('should accept a short optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }});
      obj(vorpal.execSync('foo --o cheese ')).should.equal(fixture);
    });

    it('should accept a long optional option', () => {
      const fixture = obj({ options: { optional: 'cheese' }});
      obj(vorpal.execSync('foo --optional cheese ')).should.equal(fixture);
    });

    it('should accept a short required option', () => {
      const fixture = obj({ options: { required: 'cheese' }});
      obj(vorpal.execSync('foo -r cheese ')).should.equal(fixture);
    });

    it('should accept a long required option', () => {
      const fixture = obj({ options: { required: 'cheese' }});
      obj(vorpal.execSync('foo --required cheese ')).should.equal(fixture);
    });
  });

  describe('option validation', () => {
    it('should execute a boolean option without an arg', () => {
      const fixture = obj({ options: { bool: true }});
      obj(vorpal.execSync('foo -b')).should.equal(fixture);
    });

    it('should execute an optional option without an arg', () => {
      const fixture = obj({ options: { optional: true }});
      obj(vorpal.execSync('foo -o')).should.equal(fixture);
    });

    it('should execute an optional option with an arg', () => {
      const fixture = obj({ options: { optional: 'cows' }});
      obj(vorpal.execSync('foo -o cows')).should.equal(fixture);
    });

    it('should execute a required option with an arg', () => {
      const fixture = obj({ options: { required: 'cows' }});
      obj(vorpal.execSync('foo -r cows')).should.equal(fixture);
    });

    it('should throw help on a required option without an arg', () => {
      const fixture = "\n  Missing required value for option --required. Showing Help:";
      mute();
      vorpal.execSync('foo -r').should.equal(fixture);
      unmute();
    });
  });

  describe('negated options', () => {
    it('should make a boolean option false', () => {
      const fixture = obj({ options: { bool: false }, args: [ 'cows' ] });
      obj(vorpal.execSync('foo --no-bool cows')).should.equal(fixture);
    });

    it('should make an unfilled optional option false', () => {
      const fixture = obj({ options: { optional: false }, args: [ 'cows' ] });
      obj(vorpal.execSync('foo --no-optional cows')).should.equal(fixture);
    });

    it('should ignore a filled optional option', () => {
      const fixture = obj({ options: { optional: false }, args: [ 'cows' ] });
      obj(vorpal.execSync('foo --no-optional cows')).should.equal(fixture);
    });

    it('should return help on a required option', () => {
      const fixture = "\n  Missing required value for option --required. Showing Help:";
      mute();
      vorpal.execSync('foo --no-required cows').should.equal(fixture);
      unmute();
    });

    it('should throw help on an unknown option', () => {
      const fixture = "\n  Invalid option: 'unknown'. Showing Help:";
      vorpal.execSync('foo --unknown').should.equal(fixture);
    });

    it('should allow unknown options when allowUnknownOptions is set to true', () => {
      const fixture = obj({ options: { unknown: true }});
      obj(vorpal.execSync('bar --unknown')).should.equal(fixture);
    });

    it('should allow the allowUnknownOptions state to be set with a boolean', () => {
        const fixture = "\n  Invalid option: 'unknown'. Showing Help:";
        vorpal.execSync('baz --unknown').should.equal(fixture);
    });
  });
});


describe('help menu', () => {
  const longFixture = 'Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch. Twas brillig and the slithy toves, did gyre and gimble in the wabe. All mimsy were the borogoves. And the mome wraths outgrabe. Beware the Jabberwock, my son. The claws that bite, the jaws that catch. Beware the jubjub bird and shun, the frumious bandersnatch.';
  const shortFixture = 'Twas brillig and the slithy toves.';
  let help;

  /*before(() => {
    help = new Vorpal();
    help.command('foo [args...]')
      .action(function (args, cb) {
        return args;
      });
  });
  after(() => {
    help.destroy();
  });*/

  /*it.skip('show help on an invalid command', () => {
    stdout = '';
    mute();
    const fixture = '\n  Invalid Command. Showing Help:\n\n  Commands:\n\n    help [command...] Provides help for a given command.\n    exit              Exits application.\n    foo [args...]     \n\n';
    help.execSync('cows');
    unmute();
    stdout.should.equal(fixture);
  });*/
});

describe('descriptors', () => {
  let instance;

  beforeEach(() => {
    if (instance) { instance.destroy(); }
    instance = new Vorpal();
  });

  it('sets the version', () => {
    instance.version('1.2.3');
    assert.equal(instance._version, '1.2.3');
  });

  it('sets the title', () => {
    instance.title('Vorpal');
    assert.equal(instance._title, 'Vorpal');
  });

  it('sets the description', () => {
    instance.description('A CLI tool.');
    assert.equal(instance._description, 'A CLI tool.');
  });

  it('sets the banner', () => {
    instance.banner('VORPAL');
    assert.equal(instance._banner, 'VORPAL');
  });
});
describe('cleanup', () => {
  it('cleanup', () => {
    vorpal.destroy();
  });
});
