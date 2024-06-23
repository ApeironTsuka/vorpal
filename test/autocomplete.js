import Vorpal from '../lib/vorpal.js';
import assert from 'assert';
import _ from 'lodash';
const vorpal = new Vorpal();

describe('session._autocomplete', () => {
  it('should return longest possible match', () => {
    const result = vorpal.session._autocomplete('c', [ 'cmd', 'cme', 'def' ]);
    assert.equal(result, 'cm');
  });

  it('should return list of matches when there are no more common characters', () => {
    const result = vorpal.session._autocomplete('c', [ 'cmd', 'ced' ]);
    assert.equal(result.length, 2);
    assert.equal(result[0], 'ced');
    assert.equal(result[1], 'cmd');
  });

  it('should return list of matches even if we have a complete match', () => {
    const result = vorpal.session._autocomplete('cmd', [ 'cmd', 'cmd2' ]);
    assert.equal(result.length, 2);
    assert.equal(result[0], 'cmd');
    assert.equal(result[1], 'cmd2');
  });

  it('should return undefined if no match', () => {
    const result = vorpal.session._autocomplete('cmd', [ 'def', 'xyz' ]);
    assert.equal(result, undefined);
  });

  it('should return the match if only a single possible match exists', () => {
    const result = vorpal.session._autocomplete('d', [ 'def', 'xyz' ]);
    assert.equal(result, 'def ');
  });

  
  it('should return the prefix along with the partial match when supplied with a prefix input', () => {
    const result = vorpal.session._autocomplete('foo/de', [ 'dally','definitive', 'definitop', 'bob' ]);
    assert.equal(result, "foo/definit");
  });

  it("should return a list of matches when supplied with a prefix but no value post prefix", () => {
    const result = vorpal.session._autocomplete('foo/', [ 'dally','definitive', 'definitop', 'bob' ]);
    assert.equal(result.length, 4);
    assert.equal(result[0], "bob");
    assert.equal(result[1], "dally");
    assert.equal(result[2], "definitive");
    assert.equal(result[3], "definitop");
  });
});
