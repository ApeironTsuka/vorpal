'use strict';

import _ from 'lodash';
import strip from 'strip-ansi';

export const autocomplete = {
  /**
   * Handles tabbed autocompletion.
   *
   * - Initial tabbing lists all registered commands.
   * - Completes a command halfway typed.
   * - Recognizes options and lists all possible options.
   * - Recognizes option arguments and lists them.
   * - Supports cursor positions anywhere in the string.
   * - Supports piping.
   *
   * @param {String} str
   * @return {Promise or String}
   * @api public
   */

  exec: function (str, cb) {
    const input = parseInput(str, this.parent.ui._activePrompt.screen.rl.cursor),
          commands = getCommandNames(this.parent.commands),
          vorpalMatch = getMatch(input.context, commands, { ignoreSlashes: true });
    let freezeTabs = false;

    const end = (str) => {
          const res = handleTabCounts.call(this, str, freezeTabs);
          cb(undefined, res);
        },
        evaluateTabs = (input) => {
          if ((input.context) && (input.context[input.context.length - 1] === '/')) {
            freezeTabs = true;
          } 
        };
    if (vorpalMatch) {
      input.context = vorpalMatch;
      evaluateTabs(input);
      end(assembleInput(input));
      return;
    }
    
    input = getMatchObject.call(this, input, commands);
    if (input.match) {
      input = parseMatchSection.call(this, input);
      getMatchData.call(this, input, (data) => {
        const dataMatch = getMatch(input.context, data);
        if (dataMatch) {
          input.context = dataMatch;
          evaluateTabs(input);
          end(assembleInput(input));
        }
        end(filterData(input.context, data));
      });
      return;
    }
    end(filterData(input.context, commands));
  },

  /**
   * Independent / stateless auto-complete function.
   * Parses an array of strings for the best match.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api private
   */
  match: function (str, arr = [], options = {}) {
    arr.sort();
    let arrX = _.clone(arr),
        strX = String(str),
        prefix = '',
        matches = [],
        longestMatchLength;

    if (options.ignoreSlashes !== true) {
      const parts = strX.split('/');
      strX = parts.pop();
      prefix = parts.join('/');
      prefix = parts.length > 0 ? `${prefix}/` : prefix;
    }

    for (let i = 0, l = arrX.length; i < l; i++) {
      if (strip(arrX[i]).slice(0, strX.length) === strX) {
        matches.push(arrX[i]);
      }
    }
    if (matches.length === 1) {
      // If we have a slash, don't add a space after match.
      const space = (String(strip(matches[0])).slice(strip(matches[0]).length - 1) === '/') ? '' : ' ';
      return `${prefix}${matches[0]}${space}`;
    } else if (matches.length === 0) {
      return undefined;
    } else if (strX.length === 0) {
      return matches;
    }

    longestMatchLength = matches
      .reduce((previous, current) => {
        for (let i = 0, l = current.length; i < l; i++) {
          if ((previous[i]) && (current[i] !== previous[i])) {
            return current.substr(0, i);
          }
        }
        return previous;
      }).length;

    // couldn't resolve any further, return all matches
    if (longestMatchLength === strX.length) {
      return matches;
    }

    // return the longest matching portion along with the prefix
    return `${prefix}${matches[0].substr(0, longestMatchLength)}`;
  }
};

/**
 * Tracks how many times tab was pressed
 * based on whether the UI changed.
 *
 * @param {String} str
 * @return {String} result
 * @api private
 */

function handleTabCounts(str, freezeTabs) {
  let result;
  if (Array.isArray(str)) {
    this._tabCtr += 1;
    if (this._tabCtr > 1) {
      result = (str.length === 0) ? undefined : str;
    }
  } else {
    this._tabCtr = (freezeTabs === true) ? this._tabCtr + 1 : 0;
    result = str;
  }
  return result;
}

/**
 * Looks for a potential exact match
 * based on given data.
 *
 * @param {String} ctx
 * @param {Array} data
 * @return {String}
 * @api private
 */

function getMatch(ctx, data, options) {
  // Look for a command match, eliminating and then
  // re-introducing leading spaces.
  const len = ctx.length,
        trimmed = ctx.replace(/^\s+/g, ''),
        prefix = ' '.repeat((len - trimmed.length) + 1);
  let match = autocomplete.match(trimmed, data.slice(), options);
  if (Array.isArray(match)) {
    return match;
  }
  // If we get an autocomplete match on a command, finish it.
  if (match) {
    // Put the leading spaces back in.
    match = `${prefix}${match}`;
    return match;
  }
  return undefined;
}

/**
 * Takes the input object and assembles
 * the final result to display on the screen.
 *
 * @param {Object} input
 * @return {String}
 * @api private
 */

function assembleInput(input) {
  if (Array.isArray(input.context)) {
    return input.context;
  }
  const result =
    (input.prefix || '') +
    (input.context || '') +
    (input.suffix || '');
  return strip(result);
}

/**
 * Reduces an array of possible
 * matches to list based on a given
 * string.
 *
 * @param {String} str
 * @param {Array} data
 * @return {Array}
 * @api private
 */

function filterData(str, data = []) {
  let ctx = String(str || '').trim(),
      slashParts = ctx.split('/');
  ctx = slashParts.pop();
  let wordParts = String(ctx).trim().split(' '),
      res = data.filter((item) => {
        return strip(item).slice(0, ctx.length) === ctx;
      });
  res = res.map((item) => {
    let parts = String(item).trim().split(' ');
    if (parts.length > 1) {
      parts = parts.slice(wordParts.length);
      return parts.join(' ');
    }
    return item;
  });
  return res;
}

/**
 * Takes the user's current prompt
 * string and breaks it into its
 * integral parts for analysis and
 * modification.
 *
 * @param {String} str
 * @param {Integer} idx
 * @return {Object}
 * @api private
 */

function parseInput(str, idx) {
  const raw = String(str || ''),
      sliced = raw.slice(0, idx),
      sections = sliced.split('|'),
      suffix = getSuffix(raw.slice(idx)),
      context = sections[sections.length - 1];
  let prefix = sections.slice(0, sections.length - 1) || [];
  prefix.push('');
  prefix = prefix.join('|');
  return {
    raw,
    prefix,
    suffix,
    context
  };
}

/**
 * Takes the context after a
 * matched command and figures
 * out the applicable context,
 * including assigning its role
 * such as being an option
 * parameter, etc.
 *
 * @param {Object} input
 * @return {Object}
 * @api private
 */

function parseMatchSection(input) {
  const parts = (input.context || '').split(' '),
        last = parts.pop(),
        beforeLast = strip(parts[parts.length - 1] || '').trim();
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast;
  }
  input.context = last;
  input.prefix = `${input.prefix || ''}${parts.join(' ')} `;
  return input;
}

/**
 * Returns a cleaned up version of the
 * remaining text to the right of the cursor.
 *
 * @param {String} suffix
 * @return {String}
 * @api private
 */

function getSuffix(suffix) {
  suffix = suffix.slice(0, 1) === ' ' ?
    suffix :
    suffix.replace(/.+?(?=\s)/, '');
  return suffix.slice(1, suffix.length);
}

/**
 * Compile all available commands and aliases
 * in alphabetical order.
 *
 * @param {Array} cmds
 * @return {Array}
 * @api private
 */

function getCommandNames(cmds) {
  let commands = _.map(cmds, '_name');
  commands = commands.concat(...(_.map(cmds, '_aliases')));
  commands.sort();
  return commands;
}

/**
 * When we know that we've
 * exceeded a known command, grab
 * on to that command and return it,
 * fixing the overall input context
 * at the same time.
 *
 * @param {Object} input
 * @param {Array} commands
 * @return {Object}
 * @api private
 */

function getMatchObject(input, commands) {
  const len = input.context.length,
        trimmed = String(input.context).replace(/\s+/g, '');
  let prefix = ' '.repeaet((len - trimmed.length) + 1),
      match, suffix, matchObject;
  commands.forEach((cmd) => {
    const nextChar = trimmed.substr(cmd.length, 1);
    if ((trimmed.substr(0, cmd.length) === cmd) && (String(cmd).trim() !== '') && (nextChar === ' ')) {
      match = cmd;
      suffix = trimmed.substr(cmd.length);
      prefix += trimmed.substr(0, cmd.length);
    }
  });

  matchObject = match ?
    _.find(this.parent.commands, { _name: String(match).trim() }) :
    undefined;

  if (!matchObject) {
    this.parent.commands.forEach((cmd) => {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd;
      }
      return;
    });
  }

  if (!matchObject) {
    matchObject = _.find(this.parent.commands, { _catch: true });
    if (matchObject) {
      suffix = input.context;
    }
  }

  if (!matchObject) {
    prefix = input.context;
    suffix = '';
  }

  if (matchObject) {
    input.match = matchObject;
    input.prefix += prefix;
    input.context = suffix;
  }

  return input;
}

/**
 * Takes a known matched command, and reads
 * the applicable data by calling its autocompletion
 * instructions, whether it is the command's
 * autocompletion or one of its options.
 *
 * @param {Object} input
 * @return {Array}
 * @api private
 */

function getMatchData(input, cb) {
  const string = input.context,
      cmd = input.match,
      midOption = (String(string).trim().slice(0, 1) === '-'),
      afterOption = input.option !== undefined;

  if ((midOption === true) && (!cmd._allowUnknownOptions)) {
    const results = [];
    for (let i = 0, l = cmd.options.length; i < l; i++) {
      const { long, short } = cmd.options[i];
      if ((!long) && (short)) {
        results.push(short);
      } else if (long) {
        results.push(long);
      }
    }
    cb(results);
    return;
  }

  function handleDataFormat(str, config, callback) {
    const data = [];
    if (Array.isArray(config)) {
      data = config;
    } else if (_.isFunction(config)) {
      const cbk = config.length < 2 ? (() => {}) : ((res) => { callback(res || []); });
      const res = config(str, cbk);
      if ((res) && (_.isFunction(res.then))) {
        res.then((resp) => {
          callback(resp);
        }).catch((err) => {
          callback(err);
        });
      } else if (config.length < 2) {
        callback(res);
      }
      return undefined;
    }
    callback(data);
  }

  if (afterOption === true) {
    const opt = strip(input.option).trim(),
          shortMatch = _.find(cmd.options, { short: opt }),
          longMatch = _.find(cmd.options, { long: opt }),
          match = longMatch || shortMatch;
    if (match) {
      const config = match.autocomplete;
      handleDataFormat(string, config, cb);
      return;
    }
  }

  let conf = cmd._autocomplete;
  conf = (conf && conf.data) ? conf.data : conf;
  handleDataFormat(string, conf, cb);
}

export default autocomplete;
