'use strict';

/**
 * Module dependencies.
 */

import { EventEmitter } from 'node:events';
import os from 'node:os';
import _ from 'lodash';
import util from './util.js';
import autocomplete from './autocomplete.js';
import CommandInstance from './command-instance.js';

/**
 * Initialize a new `Session` instance.
 *
 * @param {String} name
 * @return {Session}
 * @api public
 */

export class Session extends EventEmitter {
  _isLocal = undefined;
  _delimiter = undefined;
  _modeDelimiter = undefined;
  _commandSetCallback = undefined;
  _registeredCommands = 0;
  _completedCommands = 0;
  // Keeps history of how many times in a row `tab` was
  // pressed on the keyboard.
  _tabCtr = 0;
  // Special command mode vorpal is in at the moment,
  // such as REPL. See mode documentation.
  _mode = undefined;
  constructor(options = {}) {
    super();
    this.id = options.id || this._guid();
    this.parent = options.parent || undefined;
    this.authenticating = options.authenticating || false;
    this.authenticated = options.authenticated || undefined;
    this.user = options.user || 'guest';
    this.host = options.host;
    this.address = options.address || undefined;
    this._isLocal = options.local || undefined;
    this._delimiter = options.delimiter || `${String(os.hostname()).split('.')[0]}~$`;
    
    this.cmdHistory = this.parent.cmdHistory;
  }

  /**
   * Pipes logging data through any piped
   * commands, and then sends it to ._log for
   * actual logging.
   *
   * @param {String} [... arguments]
   * @return {Session}
   * @api public
   */

  log(...args) {
    return this._log(...args);
  }

  /**
   * Routes logging for a given session.
   * is on a local TTY, or remote.
   *
   * @param {String} [... arguments]
   * @return {Session}
   * @api private
   */

  _log(...args) {
    if (this.isLocal()) {
      this.parent.ui.log(...args);
    } else {
      // If it's an error, expose the stack. Otherwise
      // we get a helpful '{}'.
      let list = [];
      for (let i = 0, l = args.length; i < l; i++) {
        let str = args[i];
        str = ((str) && (str.stack)) ? `Error: ${str.message}` : str;
        list.push(str);
      }
      this.parent._send('vantage-ssn-stdout-downstream', 'downstream', { sessionId: this.id, value: list });
    }
    return this;
  }

  /**
   * Returns whether given session
   * is on a local TTY, or remote.
   *
   * @return {Boolean}
   * @api public
   */

  isLocal() {
    return this._isLocal;
  }

  /**
   * Maps to vorpal.prompt for a session
   * context.
   *
   * @param {Object} options
   * @param {Function} cb
   * @api public
   */

  prompt(options = {}, cb = undefined) {
    options.sessionId = this.id;
    return this.parent.prompt(options, cb);
  }

  /**
   * Gets the full (normal + mode) delimiter
   * for this session.
   *
   * @return {String}
   * @api public
   */

  fullDelimiter() {
    return this._delimiter + (this._modeDelimiter !== undefined ? this._modeDelimiter : '');
  }

  /**
   * Sets the delimiter for this session.
   *
   * @param {String} str
   * @return {Session}
   * @api public
   */

  delimiter(str) {
    if (str === undefined) {
      return this._delimiter;
    }
    this._delimiter = String(str).trim() + ' ';
    if (this.isLocal()) {
      this.parent.ui.refresh();
    } else {
      this.parent._send('vantage-delimiter-downstream', 'downstream', { value: str, sessionId: this.id });
    }
    return this;
  }

  /**
   * Sets the mode delimiter for this session.
   *
   * @param {String} str
   * @return {Session}
   * @api public
   */

  modeDelimiter(str) {
    if (str === undefined) {
      return this._modeDelimiter;
    }
    if (!this.isLocal()) {
      this.parent._send('vantage-mode-delimiter-downstream', 'downstream', { value: str, sessionId: this.id });
    } else {
      if ((str === false) || (str === 'false')) {
        this._modeDelimiter = undefined;
      } else {
        this._modeDelimiter = String(str).trim() + ' ';
      }
      this.parent.ui.refresh();
    }
    return this;
  }

  /**
   * Returns the result of a keypress
   * string, depending on the type.
   *
   * @param {String} key
   * @param {String} value
   * @return {Function}
   * @api private
   */

  async getKeypressResult(key, value) {
    const keyMatch = [ 'up', 'down', 'tab' ].indexOf(key) > -1;
    if (key !== 'tab') {
      this._tabCtr = 0;
    }
    if (keyMatch) {
      if ([ 'up', 'down' ].indexOf(key) > -1) {
        return this.getHistory(key);
      } else if (key === 'tab') {
        return this.getAutocomplete(value);
      }
    } else {
      this._histCtr = 0;
    }
  }

  history(str) {
    if (str) {
      this.cmdHistory.newCommand(str);
    }
  }

  /**
   * Autocomplete.
   *
   * @param {String} str
   * @api private
   */

  async getAutocomplete(str) {
    let res, p = new Promise((r) => { res = r; });
    autocomplete.exec.call(this, str, res);
    return p;
  }
  _autocomplete(str, arr) {
    return autocomplete.match.call(this, str, arr);
  }

  /**
   * Public facing autocomplete helper.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api public
   */

  help(command) {
    this.log(this.parent._commandHelp(command || ''));
  }

  /**
   * Public facing autocomplete helper.
   *
   * @param {String} str
   * @param {Array} arr
   * @return {String}
   * @api public
   */

  match(str, arr) {
    return this._autocomplete(str, arr);
  }

  /**
   * Gets a new command set ready.
   *
   * @return {session}
   * @api public
   */

  execCommandSet(wrapper, callback) {
    let response = {},
        cbk = callback,
        res, commandInstance, valid;
    this._registeredCommands = 1;
    this._completedCommands = 0;
    
    // Create the command instance for the first
    // command and hook it up to the pipe chain.
    commandInstance = new CommandInstance({
      downstream: wrapper.pipes[0],
      commandObject: wrapper.commandObject,
      commandWrapper: wrapper
    });
    
    wrapper.commandInstance = commandInstance;
    
    function sendDones(itm) {
      if ((itm.commandObject) && (itm.commandObject._done)) {
        itm.commandObject._done.call(itm);
      }
      if (itm.downstream) {
        sendDones(itm.downstream);
      }
    }
    
    // Called when command is cancelled
    this.cancelCommands = () => {
      const callCancel = (commandInstance) => {
        if (_.isFunction(commandInstance.commandObject._cancel)) {
          commandInstance.commandObject._cancel.call(commandInstance);
        }
        
        if (commandInstance.downstream) {
          callCancel(commandInstance.downstream);
        }
      };
      
      callCancel(wrapper.commandInstance);
      
      // Check if there is a cancel method on the promise
      if ((res) && (_.isFunction(res.cancel))) {
        res.cancel(wrapper.commandInstance);
      }
      
      this.removeListener('vorpal_command_cancel', this.cancelCommands);
      this.cancelCommands = undefined;
      this._commandSetCallback = undefined;
      this._registeredCommands = 0;
      this._completedCommands = 0;
      this.parent.emit('client_command_cancelled', { command: wrapper.command });
      
      cbk(wrapper);
    };
    
    this.on('vorpal_command_cancel', this.cancelCommands);
    
    // Gracefully handles all instances of the command completing.
    this._commandSetCallback = () => {
      const { error: err, data, args: argus } = response;
      if ((this.isLocal()) && (err)) {
        let stack;
        if ((data) && (data.stack)) {
          stack = data.stack;
        } else if ((err) && (err.stack)) {
          stack = err.stack;
        } else {
          stack = err;
        }
        this.log(stack);
        this.parent.emit('client_command_error', { command: wrapper.command, error: err });
      } else if (this.isLocal()) {
        this.parent.emit('client_command_executed', { command: wrapper.command });
      }
      
      this.removeListener('vorpal_command_cancel', this.cancelCommands);
      this.cancelCommands = undefined;
      cbk(wrapper, err, data, argus);
      sendDones(commandInstance);
    };
    
    const onCompletion = (wrapper, err, data, argus) => {
      response = {
        error: err,
        data,
        args: argus
      };
      this.completeCommand();
    };
    
    if (_.isFunction(wrapper.validate)) {
      try {
        valid = wrapper.validate.call(commandInstance, wrapper.args);
      } catch (e) {
        // Complete with error on validation error
        onCompletion(wrapper, e);
        return this;
      }
    }
    
    if ((valid !== true) && (valid !== undefined)) {
      onCompletion(wrapper, valid || null);
      return this;
    }
    
    if ((wrapper.args) && (typeof wrapper.args === 'object')) {
      wrapper.args.rawCommand = wrapper.command;
    }
    
    // Call the root command.
    res = wrapper.fn.call(commandInstance, wrapper.args, (...args) => {
      onCompletion(wrapper, args[0], args[1], args);
    });
    
    // If the command as declared by the user
    // returns a promise, handle accordingly
    if ((res) && (_.isFunction(res.then))) {
      res.then((data) => {
        onCompletion(wrapper, undefined, data);
      }).catch((err) => {
        onCompletion(wrapper, true, err);
      });
    }
    
    return this;
  }

  /**
   * Adds on a command or sub-command in progress.
   * Session keeps tracked of commands,
   * and as soon as all commands have been
   * compelted, the session returns the entire
   * command set as complete.
   *
   * @return {session}
   * @api public
   */

  registerCommand() {
    this._registeredCommands++;
    return this;
  }

  /**
   * Marks a command or subcommand as having completed.
   * If all commands have completed, calls back
   * to the root command as being done.
   *
   * @return {session}
   * @api public
   */

  completeCommand() {
    this._completedCommands++;
    if (this._registeredCommands <= this._completedCommands) {
      this._registeredCommands = 0;
      this._completedCommands = 0;
      if (this._commandSetCallback) {
        this._commandSetCallback();
      }
      this._commandSetCallback = undefined;
    }
    return this;
  }

  /**
   * Returns the appropriate command history
   * string based on an 'Up' or 'Down' arrow
   * key pressed by the user.
   *
   * @param {String} direction
   * @return {String}
   * @api private
   */

  getHistory(direction) {
    if (direction === 'up') {
      return this.cmdHistory.getPreviousHistory(); 
    } else if (direction === 'down') {
      return this.cmdHistory.getNextHistory();
    }
  }

  /**
   * Generates random GUID for Session ID.
   *
   * @return {GUID}
   * @api private
   */

  _guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }
}
export default Session;
