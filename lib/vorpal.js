'use strict';

/**
 * Module dependencies.
 */

import { EventEmitter } from 'node:events';
import os from 'node:os';
import _ from 'lodash';
import minimist from 'minimist';
import chalk from 'chalk';
import wrap from 'wrap-ansi';
import Command from './command.js';
import CommandInstance from './command-instance.js';
import VorpalUtil from './util.js';
import ui from './ui.js';
import Session from './session.js';
import intercept from './intercept.js';
import commons from './vorpal-commons.js';
import History from './history.js';
import LocalStorage from './local-storage.js';

/**
 * Initialize a new `Vorpal` instance.
 *
 * @return {Vorpal}
 * @api public
 */

export class Vorpal extends EventEmitter {
  // Program version
  // Exposed through vorpal.version(str);
  _version = '';
  
  // Program title
  _title = '';
  
  // Program description
  _description = '';

  // Program baner
  _banner = '';

  // Registered `vorpal.command` commands and
  // their options.
  commands = [];

  // Queue of IP requests, executed async, in sync.
  _queue = [];

  // Current command being executed.
  _command = undefined;

  // Expose UI.
  ui = ui;

  // Expose chalk as a convenience.
  chalk = chalk;

  // Expose lodash as a convenience.
  lodash = _;

  // Placeholder for vantage server. If vantage
  // is used, this will be over-written.
  server = {
    sessions: []
  };

  // Whether all stdout is being hooked through a function.
  _hooked = false;

  // Expose common utilities, like padding.
  util = VorpalUtil;

  Session = Session;

  // Allow unix-like key value pair normalization to be turned off by toggling this switch on.
  isCommandArgKeyPairNormalized = true;

  // History module used to get command history
  CmdHistoryExtension = History;

  constructor() {
    super();

    // Command line history instance
    this.cmdHistory = new this.CmdHistoryExtension();

    // Exposed through vorpal.delimiter(str).
    this._delimiter = `local@${String(os.hostname()).split('.')[0]}~$ `;
    ui.setDelimiter(this._delimiter);

    // Active vorpal server session.
    this.session = new this.Session({
      local: true,
      user: 'local',
      parent: this,
      delimiter: this._delimiter
    });

    this._init();
  }

  get activeCommand() {
    const result = this._command ? this._command.commandInstance : undefined;
    return result;
  }

  /**
   * Extension to `constructor`.
   * @api private
   */
  _init() {
    ui.on('vorpal_ui_keypress', this._init_kp = async (data) => {
      this.emit('keypress', data);
      await this._onKeypress(data.key, data.value);
    });
    
    this.use(commons);
  }

  /**
   * Clean up _init aftermath
   * @api public
   */
  destroy() {
    ui.off('vorpal_ui_keypress', this._init_kp);
    delete this._init_kp;
  }

  /**
   * Parses `process.argv` and executes
   * a Vorpal command based on it.
   * @api public
   */
  parse(args, options = {}) {
    const catchExists = !(_.find(this.commands, { _catch: true }) === undefined);
    let result = this;
    args.shift();
    args.shift();
    if ((args.length > 0) || (catchExists)) {
      if (options.use === 'minimist') {
        result = minimist(args);
      } else {
        // Wrap the sapced args back in quotes.
        for (let i = 1, l = args.length; i < l; i++) {
          if (args[i].indexOf(' ') > -1) {
            args[i] = `"${args[i]}"`;
          }
        }
        this.exec(args.join(' '), (err) => {
          if ((err !== undefined) && (err !== null)) {
            throw new Error(err);
          }
          process.exit(0);
        });
      }
    }
    return result;
  }

  /**
   * Sets version of your application's API.
   *
   * @param {String} version
   * @return {Vorpal}
   * @api public
   */
  version(version) {
    this._version = version;
    return this;
  }

  /**
   * Sets the title of your application.
   *
   * @param {String} title
   * @return {Vorpal}
   * @api public
   */
  title(title) {
    this._title = title;
    return this;
  }

  /**
   * Sets the description of your application.
   *
   * @param {String} description
   * @return {Vorpal}
   * @api public
   */
  description(description) {
    this._description = description;
    return this;
  }

  /**
   * Sets the banner of your application.
   *
   * @param {String} banner
   * @return {Vorpal}
   * @api public
   */
  banner(banner) {
    this._banner = banner;
    return this;
  }

  /**
   * Sets the permanent delimiter for this
   * Vorpal server instance.
   *
   * @param {String} str
   * @return {Vorpal}
   * @api public
   */
  delimiter(str) {
    this._delimiter = str;
    if ((this.session.isLocal()) && (!this.session.client)) {
      this.session.delimiter(str);
    }
    return this;
  }

  /**
   * Imports a library of Vorpal API commands
   * from another Node module as an extension
   * of Vorpal.
   *
   * @param {Array} commands
   * @return {Vorpal} OR {Promise}
   * @api public
   */
  use(commands, options = {}) {
    if (!commands) { return this; }
    if (_.isFunction(commands)) {
      commands.call(this, this, options);
    } else if (_.isString(commands)) {
      let mod = import(commands);
      return mod.then((cmd) => { this.use(cmd.default, options); });
    } else {
      commands = Array.isArray(commands) ? commands : [ commands ];
      for (let i = 0, l = commands.length; i < l; i++) {
        let cmd = commands[i];
        if (cmd.command) {
          let command = this.command(cmd.command);
          if (cmd.description) { command.description(cmd.description); }
          if (cmd.options) {
            cmd.options = Array.isArray(cmd.options) ? cmd.options : [ cmd.options ];
            for (let j = 0, jl = cmd.options.length; j < jl; j++) {
              command.option(cmd.options[j][0], cmd.options[j][1]);
            }
          }
          if (cmd.action) { command.action(cmd.action); }
        }
      }
    }
    return this;
  }

  /**
   * Registers a new command in the vorpal API.
   *
   * @param {String} name
   * @param {String} desc
   * @param {Object} opts
   * @return {Command}
   * @api public
   */
  command(name, desc, opts = {}) {
    name = String(name);
    
    const argsRegExp = /(\[[^\]]*\]|\<[^\>]*\>)/g,
          args = [],
          cmdNameRegExp = /^([^\[\<]*)/,
          cmdName = cmdNameRegExp.exec(name)[0].trim(),
          cmd = new Command(cmdName, this);
    let exists = false,
        arg;
    
    while ((arg = argsRegExp.exec(name)) !== null) {
      args.push(arg[1]);
    }
    if (desc) {
      cmd.description(desc);
      this.executables = true;
    }
    cmd._noHelp = Boolean(opts.noHelp);
    cmd._mode = opts.mode || false;
    cmd._catch = opts.catch || false;
    cmd._parseExpectedArgs(args);
    cmd.parent = this;
    
    for (let i = 0, l = this.commands.length; i < l; i++) {
      exists = this.commands[i]._name === cmd._name ? true : exists;
      if (exists) {
        this.commands[i] = cmd;
        break;
      }
    }
    if (!exists) {
      this.commands.push(cmd);
    } else {
      console.warn(chalk.yellow(`Warning: command named "${name}" was registered more than once.\nIf you intend to override a command, you should explicitly remove the first command with command.remove().`));
    }
    
    this.emit('command_registered', { command: cmd, name });
    
    return cmd;
  }

  /**
   * Registers a new 'mode' command in the vorpal API.
   *
   * @param {String} name
   * @param {String} desc
   * @param {Object} opts
   * @return {Command}
   * @api public
   */
  mode(name, desc, opts) {
    return this.command(name, desc, _.extend(opts || {}, { mode: true }));
  }

  /**
   * Registers a 'catch' command in the vorpal API.
   * This is executed when no command matches are found.
   *
   * @param {String} name
   * @param {String} desc
   * @param {Object} opts
   * @return {Command}
   * @api public
   */
  catch(name, desc, opts) {
    return this.command(name, desc, _.extend(opts || {}, { catch: true }));
  }

  /**
   * An alias to the `catch` command.
   *
   * @param {String} name
   * @param {String} desc
   * @param {Object} opts
   * @return {Command}
   * @api public
   */
  default(name, desc, opts) {
    return this.catch(name, desc, opts);
  }

  /**
   * Delegates to ui.log.
   *
   * @param {String} log
   * @return {Vorpal}
   * @api public
   */
  log(...args) {
    this.ui.log(...args);
    return this;
  }

  /**
   * Intercepts all logging through `vorpal.log`
   * and runs it through the function declared by
   * `vorpal.pipe()`.
   *
   * @param {Function} fn
   * @return {Vorpal}
   * @api public
   */
  pipe(fn) {
    if (this.ui) {
      this.ui._pipeFn = fn;
    }
    return this;
  }

  /**
   * If Vorpal is the local terminal,
   * hook all stdout, through a fn.
   *
   * @return {Vorpal}
   * @api private
   */
  hook(fn) {
    if (fn !== undefined) {
      this._hook(fn);
    } else {
      this._unhook();
    }
    return this;
  }

  /**
   * Unhooks stdout capture.
   *
   * @return {Vorpal}
   * @api public
   */
  unhook() {
    if ((this._hooked) && (this._unhook !== undefined)) {
      this._unhook();
      this._hooked = false;
    }
    return this;
  }

  /**
   * Hooks all stdout through a given function.
   *
   * @param {Function} fn
   * @return {Vorpal}
   * @api public
   */
  _hook(fn) {
    if ((this._hooked) && (this._unhook !== undefined)) {
      this._unhook();
    }
    this._unhook = intercept(fn);
    this._hooked = true;
    return this;
  }

  /**
   * Set id for command line history
   * @param id
   * @return {Vorpal}
   * @api public
   */
  history(id) {
    this.cmdHistory.setId(id);
    return this;
  }

  /**
   * Set id for local storage
   * @param id
   * @return {Vorpal}
   * @api public
   */
  localStorage(id) {
    const ls = Object.create(LocalStorage);
    ls.setId(id);
    _.extend(this.localStorage, ls);
    return this;
  }

  /**
   * Set the path to where command line history is persisted.
   * Must be called before vorpal.history
   * @param path
   * @return {Vorpal}
   * @api public
   */
  historyStoragePath(path) {
    this.cmdHistory.setStoragePath(path);
    return this;
  }

  /**
   * Hook the tty prompt to this given instance
   * of vorpal.
   *
   * @return {Vorpal}
   * @api public
   */
  show() {
    ui.attach(this);
    return this;
  }

  /**
   * Disables the vorpal prompt on the
   * local terminal.
   *
   * @return {Vorpal}
   * @api public
   */
  hide() {
    ui.detach(this);
    return this;
  }

  /**
   * Listener for a UI keypress. Either
   * handles the keypress locally or sends
   * it upstream.
   *
   * @param {String} key
   * @param {String} value
   * @api private
   */
  async _onKeypress(key, value) {
    if ((this.session.isLocal()) && (!this.session.client) && (!this._command)) {
      const result = await this.session.getKeypressResult(key, value);
      if (result !== undefined) {
        if (Array.isArray(result)) {
          const formatted = VorpalUtil.prettifyArray(result);
          this.ui.imprint();
          this.session.log(formatted);
        } else {
          this.ui.input(result);
        }
      }
    } else {
      this._send('vantage-keypress-upstream', 'upstream', {
        key,
        value,
        sessionId: this.session.id
      });
    }
  }

  /**
   * For use in vorpal API commands, sends
   * a prompt command downstream to the local
   * terminal. Executes a prompt and returns
   * the response upstream to the API command.
   *
   * @param {Object} options
   * @param {Function} userCallback
   * @return {Vorpal}
   * @api public
   */
  async prompt(options = {}, userCallback) {
    return new Promise((resolve) => {
      const ssn = this.getSessionById(options.sessionId),
            // Setup callback to also resolve promise
            cb = (response) => {
              // Does not currently handle Inquirer validation errors.
              resolve(response);
              if (userCallback) {
                userCallback(response);
              }
            },
            handler = (data) => {
              const response = data.value;
              this.removeListener('vantage-prompt-upstream', handler);
              cb(response);
            };
      
      if (!ssn) {
        throw new Error('Vorpal.prompt was called without a passed Session ID.');
      }
      
      if (ssn.isLocal()) {
        ui.setDelimiter(options.message || ssn.delimiter());
        return ui.prompt(options, (result) => {
          ui.setDelimiter(ssn.delimiter());
          cb(result);
        });
      } else {
        this.on('vantage-prompt-upstream', handler);
        this._send('vantage-prompt-downstream', 'downstream', { options, value: undefined, sessionId: ssn.id });
      }
    });
  }

  /**
   * Renders the CLI prompt or sends the
   * request to do so downstream.
   *
   * @param {Object} data
   * @return {Vorpal}
   * @api private
   */
  _prompt(data = {}) {
    let ssn, prompt;
    if (!data.sessionId) {
      data.sessionId = this.session.id;
    }
    ssn = this.getSessionById(data.sessionId);
    
    // If we somehow got to _prompt and aren't the
    // local client, send the command downstream.
    if (!ssn.isLocal()) {
      this._send('vantage-resume-downstream', 'downstream', { sessionId: data.sessionId });
      return this;
    }
    
    if (ui.midPrompt()) {
      return this;
    }
    
    prompt = ui.prompt({
      type: 'input',
      name: 'command',
      message: ssn.fullDelimiter()
    }, (result) => {
      if (this.ui._cancelled === true) {
        this.ui._cancelled = false;
        return;
      }
      const str = String(result.command).trim();
      this.emit('client_prompt_submit', str);
      if ((str === '') || (str === 'undefined')) {
        this._prompt(data);
        return;
      }
      this.exec(str, () => { this._prompt(data); });
    });
    
    return prompt;
  }

  /**
   * Executes a vorpal API command and
   * returns the response either through a
   * callback or Promise in the absence
   * of a callback.
   *
   * A little black magic here - because
   * we sometimes have to send commands 10
   * miles upstream through 80 other instances
   * of vorpal and we aren't going to send
   * the callback / promise with us on that
   * trip, we store the command, callback,
   * resolve and reject objects (as they apply)
   * in a local vorpal._command variable.
   *
   * When the command eventually comes back
   * downstream, we dig up the callbacks and
   * finally resolve or reject the promise, etc.
   *
   * Lastly, to add some more complexity, we throw
   * command and callbacks into a queue that will
   * be unearthed and sent in due time.
   *
   * @param {String} cmd
   * @param {Function} cb
   * @return {Promise or Vorpal}
   * @api public
   */
  exec(cmd, args = {}, cb) {
    let ssn = this.session;
    
    cb = _.isFunction(args) ? args : cb;
    
    if (args.sessionId) {
      ssn = this.getSessionById(args.sessionId);
    }
    
    const command = {
      command: cmd,
      args,
      callback: cb,
      session: ssn
    };
    
    if (cb !== undefined) {
      this._queue.push(command);
      this._queueHandler();
      return this;
    }

    return new Promise((resolve, reject) => {
      command.resolve = resolve;
      command.reject = reject;
      this._queue.push(command);
      this._queueHandler();
    });
  }

  /**
   * Executes a Vorpal command in sync.
   *
   * @param {String} cmd
   * @param {Object} args
   * @return {*} stdout
   * @api public
   */
  execSync(cmd, options = {}) {
    const ssn = options.sessionId ? this.getSessionById(options.sessionId) : this.session,
          command = {
            command: cmd,
            args: options,
            session: ssn,
            sync: true,
            options
          };
    
    return this._execQueueItem(command);
  }

  /**
   * Commands issued to Vorpal server
   * are executed in sequence. Called once
   * when a command is inserted or completes,
   * shifts the next command in the queue
   * and sends it to `vorpal._execQueueItem`.
   *
   * @api private
   */
  _queueHandler() {
    if ((this._queue.length > 0) && (this._command === undefined)) {
      const item = this._queue.shift();
      this._execQueueItem(item);
    }
  }

  /**
   * Fires off execution of a command - either
   * calling upstream or executing locally.
   *
   * @param {Object} cmd
   * @api private
   */
  _execQueueItem(cmd) {
    this._command = cmd;
    if ((cmd.session.isLocal()) && (!cmd.session.client)) {
      return this._exec(cmd);
    }
    this._send('vantage-command-upstream', 'upstream', {
      command: cmd.command,
      args: cmd.args,
      completed: false,
      sessionId: cmd.session.id
    });
  }

  /**
   * Executes a vorpal API command.
   * Warning: Dragons lie beyond this point.
   *
   * @param {String} item
   * @api private
   */
  _exec(item = {}) {
    item.command = item.command || '';
    const modeCommand = item.command;
    let promptCancelled = false;
    item.command = item.session._mode ? item.session._mode : item.command;
    
    if (this.ui._midPrompt) {
      promptCancelled = true;
      this.ui.cancel();
    }
    
    if (!item.session) {
      throw new Error(`Fatal Error: No session was passed into command for exection: ${item}`); 
    }
    
    if (item.command === undefined) {
      throw new Error('vorpal._exec was called with an undefined command.');
    }
    
    // History for our 'up' and 'down' arrows.
    item.session.history(item.session._mode ? modeCommand : item.command);
    
    const commandData = this.util.parseCommand(item.command, this.commands),
          { match, matchArgs } = commandData;
    item.command = commandData.command;
    item.pipes = commandData.pipes;
    
    function throwHelp(cmd, msg, alternativeMatch) {
      if (msg) {
        cmd.session.log(msg);
      }
      const pickedMatch = alternativeMatch || match;
      cmd.session.log(pickedMatch.helpInformation());
    }
    
    const callback = (cmd, err, msg, argus) => {
      // Resume the prompt if we had to cancel
      // an active prompt, due to programmatic
      // execution.
      if (promptCancelled) {
        this._prompt();
      }
      if (cmd.sync) {
        // If we want the command to be fatal,
        // throw a real error. Otherwise, silently
        // return the error.
        delete this._command;
        if (err) {
          if ((cmd.options) && ((cmd.options.fatal === true) || (this._fatal === true))) {
            throw new Error(err);
          }
          return err;
        }
        return msg;
      } else if (cmd.callback) {
        if (argus) {
          cmd.callback.apply(this, argus);
        } else {
          cmd.callback.call(this, err, msg);
        }
      } else if ((!err) && (cmd.resolve)) {
        cmd.resolve(msg);
      } else if ((err) && (cmd.reject)) {
        cmd.reject(msg);
      }
      delete this._command;
      this._queueHandler();
    };
    
    if (match) {
      item.fn = match._fn;
      item._cancel = match._cancel;
      item.validate = match._validate;
      item.commandObject = match;
      let init = match._init || ((args, cb) => { cb(); }),
          delimiter = match._delimiter || `${item.command}:`;
      
      item.args = this.util.buildCommandArgs(matchArgs, match, item, this.isCommandArgKeyPairNormalized);
      
      // If we get a string back, it's a validation error.
      // Show help and return.
      if ((_.isString(item.args)) || (!_.isObject(item.args))) {
        throwHelp(item, item.args);
        return callback(item, undefined, item.args);
      }
      
      // Build the piped commands.
      let allValid = true;
      for (let j = 0, jl = item.pipes.length; j < jl; j++) {
        let commandParts = this.util.matchCommand(item.pipes[j], this.commands);
        if (!commandParts.command) {
          item.session.log(this._commandHelp(item.pipes[j]));
          allValid = false;
          break;
        }
        commandParts.args = this.util.buildCommandArgs(commandParts.args, commandParts.command);
        if ((_.isString(commandParts.args)) || (!_.isObject(commandParts.args))) {
          throwHelp(item, commandParts.args, commandParts.command);
          allValid = false;
          break;
        }
        item.pipes[j] = commandParts;
      }
      
      // If invalid piped commands, return.
      if (!allValid) {
        return callback(item);
      }
      
      // If `--help` or `/?` is passed, do help.
      if ((item.args.options.help) && (_.isFunction(match._help))) {
        // If the command has a custom help function, run it
        // as the action "command". In this way it can go through
        // the whole cycle and expect a callback.
        item.fn = match._help;
        delete item.validate;
        delete item._cancel;
      } else if (item.args.options.help) {
        // Otherwise, throw the standard help.
        throwHelp(item, '');
        return callback(item);
      }
      
      // If this command throws us into a 'mode',
      // prepare for it.
      if ((match._mode === true) && (!item.session._mode)) {
        // Assign vorpal to be in a 'mode'.
        item.session._mode = item.command;
        // Execute the mode's `init` function
        // instead of the `action` function.
        item.fn = init;
        delete item.validate;
        
        this.cmdHistory.enterMode();
        item.session.modeDelimiter(delimiter);
      } else if (item.session._mode) {
        if (String(modeCommand).trim() === 'exit') {
          this._exitMode({ sessionId: item.session.id });
          return callback(item);
        }
        // This executes when actually in a 'mode'
        // session. We now pass in the raw text of what
        // is typed into the first param of `action`
        // instead of arguments.
        item.args = modeCommand;
      }
      if (item.sync === true) {
        // If we're running synchronous commands,
        // we don't support piping.
        let response, error;
        try {
          response = item.fn.call(new CommandInstance({
            downstream: undefined,
            commandWrapper: item,
            commandObject: item.commandObject,
            args: item.args
          }), item.args);
        } catch (e) {
          error = e;
        }
        return callback(item, error, response);
      }
      
      // Builds commandInstance object for every
      // command and piped command included in the
      // execution string.
      
      // Build the instances for each pipe.
      item.pipes = item.pipes.map((pipe) => {
        return new CommandInstance({
          commandWrapper: item,
          command: pipe.command._name,
          commandObject: pipe.command,
          args: pipe.args
        });
      });
      
      // Reverse through the pipes and assign the
      // `downstream` object of each parent to its
      // child command.
      for (let k = item.pipes.length - 1; k >= 0; k--) {
        item.pipes[k].downstream = item.pipes[k + 1];
      }
      
      item.session.execCommandSet(item, (wrapper, err, data, args) => {
        callback(wrapper, err, data, args);
      });
    } else {
      // If no command match, just return.
      item.session.log(this._commandHelp(item.command));
      return callback(item, undefined, 'Invalid command.');
    }
  }

  /**
   * Exits out of a give 'mode' one is in.
   * Reverts history and delimiter back to
   * regular vorpal usage.
   *
   * @api private
   */
  _exitMode(options) {
    const ssn = this.getSessionById(options.sessionId);
    ssn._mode = false;
    this.cmdHistory.exitMode();
    ssn.modeDelimiter(false);
    this.emit('mode_exit', this.cmdHistory.peek());
  }

  /**
   * Registers a custom handler for SIGINT.
   * Vorpal exits with 0 by default
   * on a sigint.
   *
   * @param {Function} fn
   * @return {Vorpal}
   * @api public
   */
  sigint(fn) {
    if (_.isFunction(fn)) {
      ui.sigint(fn);
    } else {
      throw new Error('vorpal.sigint must be passed in a valid function.');
    }
    return this;
  }

  /**
   * Returns the instance of  given command.
   *
   * @param {String} cmd
   * @return {Command}
   * @api public
   */
  find(name) {
    return _.find(this.commands, { _name: name });
  }

  /**
   * Registers custom help.
   *
   * @param {Function} fn
   * @return {Vorpal}
   * @api public
   */
  help(fn) {
    this._help = fn;
  }

  /**
   * Returns help string for a given command.
   *
   * @param {String} command
   * @api private
   */
  _commandHelp(command) {
    if (!this.commands.length) {
      return '';
    }
    
    if ((this._help !== undefined) && (_.isFunction(this._help))) {
      return this._help(command);
    }
    
    let matches = [],
        singleMatches = [];
    
    command = command ? String(command).trim() : undefined;
    for (let i = 0, l = this.commands.length; i < l; i++) {
      const parts = String(this.commands[i]._name).split(' ');
      let str = '';
      if ((parts.length === 1) && (parts[0] === command) && (!this.commands[i]._hidden) && (!this.commands[i]._catch)) {
        singleMatches.push(command);
      }
      for (let j = 0, jl = parts.length; j < jl; j++) {
        str = `${str} ${parts[j]}`.trim();
        if ((str === command) && (!this.commands[i]._hidden) && (!this.commands[i]._catch)) {
          matches.push(this.commands[i]);
          break;
        }
      }
    }
    
    const invalidString =
            (command) && (matches.length === 0) && (singleMatches.length === 0) ?
            '\n  Invalid Command. Showing Help:\n\n' :
            '',
          commandMatch = matches.length > 0,
          commandMatchLength = commandMatch ? String(command).trim().split(' ').length + 1 : 1;
    matches = matches.length === 0 ? this.commands : matches;
    
    const skipGroups = !((matches.length + 6) > process.stdout.rows);
    
    const commands = matches.filter((cmd) => {
      return !cmd._noHelp;
    }).filter((cmd) => {
      return !cmd._catch;
    }).filter((cmd) => {
      return !cmd._hidden;
    }).filter((cmd) => {
      if (skipGroups === true) {
        return true;
      }
      return String(cmd._name).trim().split(' ').length <= commandMatchLength;
    }).map((cmd) => {
      const args = cmd._args.map((arg) => {
        return VorpalUtil.humanReadableArgName(arg);
      }).join(' ');
      
      return [
        cmd._name +
          (cmd._alias ?
            `|${cmd._alias}` :
            '') +
          (cmd.options.length ?
            ' [options]' :
            '') +
          ' ' + args,
        cmd.description() || ''
      ];
    });
    
    const width = commands.reduce((max, commandX) => {
      return Math.max(max, commandX[0].length);
    }, 0);
    
    let counts = {}, groups = [];
    
    if (!skipGroups) {
      groups = _.uniq(matches.filter((cmd) => {
        return String(cmd._name).trim().split(' ').length > commandMatchLength;
      }).map((cmd) => {
        return String(cmd._name).split(' ').slice(0, commandMatchLength).join(' ');
      }).map((cmd) => {
        counts[cmd] = counts[cmd] || 0;
        counts[cmd]++;
        return cmd;
      })).map((cmd) => {
        let prefix = `    ${VorpalUtil.pad(cmd + ' *', width)}  ${counts[cmd]} sub-command${counts[cmd] === 1 ? '' : 's'}.`;
        return prefix;
      });
    }
    
    const descriptionWidth = process.stdout.columns - (width + 4),
          commandString = commands.length < 1 ? '' : '\n  Commands:\n\n' +
            commands.map((cmd) => {
              const prefix = `    ${VorpalUtil.pad(cmd[0], width)} `;
              let suffix = wrap(cmd[1], descriptionWidth - 8).split('\n');
              for (let i = 1, l = suffix.length; i < l; i++) {
                suffix[i] = VorpalUtil.pad('', width + 6) + suffix[i];
              }
              suffix = suffix.join('\n');
              return prefix + suffix;
            })
            .join('\n') +
            '\n\n',
         groupString = groups.length < 1 ?
           '' :
           `  Command Groups:\n\n${groups.join('\n')}\n`,
         results = String(
           this._helpHeader(!!invalidString) +
           invalidString +
           commandString + '\n' +
           groupString
         )
         .replace(/\n\n\n/g, '\n\n')
         .replace(/\n\n$/, '\n');
    return results;
  }

  _helpHeader(hideTitle) {
    let header = [];
    
    if (this._banner) {
      header.push(VorpalUtil.padRow(this._banner), '');
    }
    
    // Only show under specific conditions
    if ((this._title) && (!hideTitle)) {
      let title = this._title;
      
      if (this._version) {
        title += ` v${this._version}`;
      }
      
      header.push(VorpalUtil.padRow(title));
      
      if (this._description) {
        const descWidth = process.stdout.columns * 0.75; // Only 75% of the screen
        
        header.push(VorpalUtil.padRow(wrap(this._description, descWidth)));
      }
    }
    
    // Pad the top and bottom
    if (header.length) {
      header.unshift('');
      header.push('');
    }
    
    return header.join('\n');
  }

  /**
   * Abstracts the logic for sending and
   * receiving sockets upstream and downstream.
   *
   * To do: Has the start of logic for vorpal sessions,
   * which I haven't fully confronted yet.
   *
   * @param {String} str
   * @param {String} direction
   * @param {String} data
   * @param {Object} options
   * @api private
   */
  _send(str, direction, data = {}, options = {}) {
    const ssn = this.getSessionById(data.sessionId);
    if (!ssn) {
      throw new Error(`No Sessions logged for ID ${data.sessionId} in vorpal._send.`);
    }
    if (direction === 'upstream') {
      if (ssn.client) {
        ssn.client.emit(str, data);
      }
    } else if (direction === 'downstream') {
      if (ssn.server) {
        ssn.server.emit(str, data);
      }
    }
  }

  /**
   * Handles the 'middleman' in a 3+-way vagrant session.
   * If a vagrant instance is a 'client' and 'server', it is
   * now considered a 'proxy' and its sole purpose is to proxy
   * information through, upstream or downstream.
   *
   * If vorpal is not a proxy, it resolves a promise for further
   * code that assumes one is now an end user. If it ends up
   * piping the traffic through, it never resolves the promise.
   *
   * @param {String} str
   * @param {String} direction
   * @param {String} data
   * @param {Object} options
   * @api private
   */
  _proxy(str, direction, data, options) {
    const ssn = this.getSessionsById(data.sessionId);
    if ((ssn) && (!ssn.isLocal()) && (ssn.client)) {
      this._send(str, direction, data, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Returns session by id.
   *
   * @param {Integer} id
   * @return {Session}
   * @api public
   */
  getSessionById(id) {
    if (!id) {
      throw new Error('vorpal.getSessionById was called with no ID passed.');
    } else if (_.isObject(id)) {
      throw new Error(`vorpal.getSessionById: id ${JSON.stringify(id)} should not be an object.`);
    }
    let ssn = this.session.id === id ? this.session :  _.find(this.server.sessions, { id });
    if (!ssn) {
      const sessions = {
        local: this.session.id,
        server: _.map(this.server.sessions, 'id')
      };
      throw new Error(`No session found for id ${id} in vorpal.getSessionById. Sessions: ${JSON.stringify(sessions)}`);
    }
    return ssn;
  }

  /**
   * Kills a remote vorpal session. If user
   * is running on a direct terminal, will kill
   * node instance after confirmation.
   *
   * @param {Object} options
   * @param {Function} cb
   * @api private
   */
  exit(options) {
    const ssn = this.getSessionById(options.sessionId);
    this.emit('vorpal_exit');
    if (ssn.isLocal()) {
      process.exit(0);
    } else {
      ssn.server.emit('vantage-close-downstream', { sessionId: ssn.id });
    }
  }
}

export default Vorpal;
