'use strict';

/**
 * Module dependencies.
 */

import _ from 'lodash';
import util from './util.js';
import ut from 'node:util';

/**
 * Initialize a new `Logger` instance.
 *
 * @return {Logger}
 * @api public
 */

function viewed(str) {
  const re = /\u001b\[\d+m/gm;
  return String(str).replace(re, '');
}

function trimTo(str, amt) {
  let raw = '',
      visual = viewed(str).slice(0, amt),
      result = '',
      found = false,
      newResult;
  for (let i = 0, l = str.length; i < l; i++) {
    raw += str[i];
    if (viewed(raw) === visual) {
      result = raw;
      break;
    }
  }
  
  if (result.length < amt - 10) {
    return result;
  }
  
  newResult = result;
  for (let i = result.length; i > 0; i--) {
    if (result[i] === ' ') {
      found = true;
      break;
    } else {
      newResult = newResult.slice(0, newResult.length - 1);
    }
  }
  
  if (found === true) {
    return newResult;
  }
  return result;
}

export function Logger(cons) {
  let logger = cons || console;
  let log = this.log = function (...args) {
    logger.log(...args);
  };
  
  log.cols = function (...input) {
    let width = process.stdout.columns,
        pads = 0,
        padsWidth = 0,
        cols = 0,
        colsWidth = 0,
        lines = [];
    for (let h = 0, hl = args.length; h < hl; h++) {
      if (typeof args[h] === 'number') {
        padsWidth += args[h];
        pads++;
      }
      if ((Array.isArray(args[h])) && (typeof args[h][0] === 'number')) {
        padsWidth += args[h][0];
        pads++;
      }
    }
    
    cols = args.length - pads;
    colsWidth = Math.floor((width - padsWidth) / cols);
    
    const go = () => {
      let str = '',
          done = true;
      for (let i = 0, l = input.length; i < l; i++) {
        if (typeof input[i] === 'number') {
          str += util.pad('', input[i], ' ');
        } else if ((Array.isArray(input[i])) && (typeof input[i][0] === 'number')) {
          str += util.pad('', input[i][0], input[i][1]);
        } else {
          let chosenWidth = colsWidth + 0,
              trimmed = trimTo(input[i], colsWidth),
              trimmedLength = trimmed.length,
              re = /\\u001b\[\d+m/gm,
              matches = ut.inspect(trimmed).match(re),
              color = '';
          // Ugh. We're chopping a line, so we have to look for unfinished
          // color assignments and throw them on the next line.
          if ((matches) && (matches[matches.length - 1] !== '\\u001b[39m')) {
            trimmed += '\u001b[39m';
            const number = String(matches[matches.length - 1]).slice(7, 9);
            color = `\x1b[${number}m`;
          }
          input[i] = color + String(input[i].slice(trimmedLength, input[i].length)).trim();
          str += util.pad(String(trimmed).trim(), chosenWidth, ' ');
          if (viewed(input[i]).trim() !== '') {
            done = false;
          }
        }
      }
      lines.push(str);
      if (!done) {
        go();
      }
    };
    go();
    for (let i = 0, l = lines.length; i < l; i++) {
      logger.log(lines[i]);
    }
    return this;
  };
  
  log.br = function () {
    logger.log(' ');
    return this;
  };
  
  return log;
}

export default Logger;
