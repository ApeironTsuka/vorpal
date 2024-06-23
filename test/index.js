import Vorpal from '../lib/vorpal.js';
import should from 'should';
import assert from 'assert';

const vorpal = new Vorpal();

describe('vorpal', () => {
  describe('constructor', () => {
    it('should exist and be a function', () => {
      should.exist(Vorpal);
      Vorpal.should.be.type('function');
    });
  });

  describe('.parse', () => {
    it('should exist and be a function', () => {
      should.exist(vorpal.parse);
      vorpal.parse.should.be.type('function');
    });

    it('should expose minimist', () => {
      const result = vorpal.parse([ 'a', 'b', 'foo', 'bar', '-r' ], { use: 'minimist' });
      result.r.should.be.true;
      (result._.indexOf('foo') > -1).should.be.true;
      (result._.indexOf('bar') > -1).should.be.true;
      result._.length.should.equal(2);
    });
  });

  describe('mode context', () => {
    it('parent should have the same context in init and action', (done) => {
      const vorpal = new Vorpal();
      let initCtx;
      vorpal
        .mode('ooga')
        .init(function (args, cb) {
          initCtx = this.parent;
          cb();
        })
        .action(function (args, cb) {
          this.parent.should.equal(initCtx);
          cb();
          done();
        });
      vorpal.exec('ooga').then(() => {
        vorpal.exec('booga');
      })
    });
  });
});
