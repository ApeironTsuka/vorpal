'use strict';

/**
 * Module dependencies.
 */

import { EventEmitter } from 'node:events';
import Option from './option.js';
import VorpalUtil from './util.js';
import _ from 'lodash';

/**
 * Converts string to camel case.
 *
 * @param {String} flag
 * @return {String}
 * @api private
 */

function camelcase(flag) {
  return flag.split('-').reduce((str, word) => {
    return `${str}${word[0].toUpperCase()}${word.slice(1)}`;
  });
}

/**
 * Initialize a new `Command` instance.
 *
 * @param {String} name
 * @param {Vorpal} parent
 * @return {Command}
 * @api public
 */

export class Command extends EventEmitter {
  commands = [];
  options = [];
  _args = [];
  _aliases = [];
  _relay = false;
  _hidden = false;
  _mode = false;
  _name = undefined;
  _catch = false;
  _help = undefined;
  _init = undefined;
  _parent = undefined;
  _after = undefined;
  _allowUnknownOptions = false;
  _autocomplete = undefined;
  _delimiter = undefined;
  _types = undefined;
  _description = undefined;

  constructor(name, parent) {
    super();
    this._name = name;
    this._parent = parent;
  }
  get name() { return this._name; }
  /**
   * Registers an option for given command.
   *
   * @param {String} flags
   * @param {String} description
   * @param {Function} fn
   * @param {String} defaultValue
   * @return {Command}
   * @api public
   */
  option(flags, description, autocomplete) {
    const option = new Option(flags, description, autocomplete),
          oname = option.name(),
          name = camelcase(oname);
    let defaultValue;

    // preassign default value only for --no-*, [optional], or <required>
    if ((option.bool === false) || (option.optional) || (option.required)) {
      // when --no-* we make sure default is true
      if (option.bool === false) {
        defaultValue = true;
      }
      // preassign only if we have a default
      if (defaultValue !== undefined) {
        this[name] = defaultValue;
      }
    }
    // register the option
    this.options.push(option);
    
    // when it's passed assign the value
    // and conditionally invoke the callback
    this.on(oname, (val) => {
      // unassigned or bool
      if ((typeof this[name] === 'boolean') || (typeof this[name] === 'undefined')) {
        // if no value, bool true, and we have a default, then use it!
        if (val === null) {
          this[name] = option.bool ?
            defaultValue || true :
            false;
        } else {
          this[name] = val;
        }
      } else if (val !== null) {
        // reassign
        this[name] = val;
      }
    });
    return this;
  }

  /**
   * Defines an action for a given command.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  action(fn) {
    this._fn = fn;
    return this;
  }

  /**
   * Let's you compose other funtions to extend the command.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  use(fn) {
    return fn(this);
  }

  /**
   * Defines a function to validate arguments
   * before action is performed. Arguments
   * are valid if no errors are thrown from
   * the function.
   *
   * @param fn
   * @returns {Command}
   * @api public
   */

  validate(fn) {
    this._validate = fn;
    return this;
  }

  /**
   * Defines a function to be called when the
   * command is canceled.
   *
   * @param fn
   * @returns {Command}
   * @api public
   */

  cancel(fn) {
    this._cancel = fn;
    return this;
  }

  /**
   * Defines a method to be called when
   * the command set has completed.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  done(fn) {
    this._done = fn;
    return this;
  }

  /**
   * Defines tabbed auto-completion
   * for the given command.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  autocomplete(obj) {
    this._autocomplete = obj;
    return this;
  }

  /**
   * Defines an init action for a mode command.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  init(fn) {
    if (this._mode !== true) {
      throw new Error('Cannot call init from a non-mode action.');
    }
    this._init = fn;
    return this;
  }

  /**
   * Defines a prompt delimiter for a
   * mode once entered.
   *
   * @param {String} delimiter
   * @return {Command}
   * @api public
   */

  delimiter(delimiter) {
    this._delimiter = delimiter;
    return this;
  }

  /**
   * Sets args for static typing of options
   * using minimist.
   *
   * @param {Object} types
   * @return {Command}
   * @api public
   */

  types(types) {
    const supported = [ 'string', 'boolean' ];
    for (const item in types) {
      if (supported.indexOf(item) === -1) {
        throw new Error(`An invalid type was passed into command.types(): ${item}`); 
      }
      types[item] = !Array.isArray(types[item]) ? [ types[item] ] : types[item];
    }
    this._types = types;
    return this;
  }

  /**
   * Defines an alias for a given command.
   *
   * @param {String} alias
   * @return {Command}
   * @api public
   */

  alias(...args) {
    for (let i = 0, l = args.length; i < l; i++) {
      const alias = args[i];
      if (Array.isArray(alias)) {
        for (let j = 0, jl = alias.length; j < jl; j++) {
          this.alias(alias[j]);
        }
        return this;
      }
      this._parent.commands.forEach((cmd) => {
        if (!_.isEmpty(cmd._aliases)) {
          if (_.includes(cmd._aliases, alias)) {
            throw new Error(`Duplicate alias "${alias}" for command "${this._name}" detected. Was first reserved by command "${cmd._name}".`);
          }
        }
      });
      this._aliases.push(alias);
    }
    return this;
  }

  /**
   * Defines description for given command.
   *
   * @param {String} str
   * @return {Command}
   * @api public
   */

  description(str) {
    if (arguments.length === 0) {
      return this._description;
    }
    this._description = str;
    return this;
  }

  /**
   * Removes self from Vorpal instance.
   *
   * @return {Command}
   * @api public
   */

  remove() {
    this._parent.commands = _.reject(this._parent.commands, (command) => {
      if (command.name === this._name) {
        return true;
      }
    });
    return this;
  }

  /**
   * Returns the commands arguments as string.
   *
   * @param {String} desc
   * @return {String}
   * @api public
   */

  arguments(desc) {
    return this._parseExpectedArgs(desc.split(/ +/));
  }

  /**
   * Returns the help info for given command.
   *
   * @return {String}
   * @api public
   */

  helpInformation() {
    let desc = [],
        cmdName = this._name,
        alias = '',
        cmds = [],
        usage, help, options;

    if (this._description) {
      desc = [
        `  ${this._description}`,
        ''
      ];
    }

    if (this._aliases.length > 0) {
      alias = `  Alias: ${this._aliases.join(' | ')}\n`;
    }
    usage = [
      '',
      `  Usage: ${cmdName} ${this.usage()}`,
      ''
    ];
    help = String(this.optionHelp().replace(/^/gm, '    '));
    options = [
      '  Options:',
      '',
      help,
      ''
    ];
    return usage
      .concat(cmds)
      .concat(alias)
      .concat(desc)
      .concat(options)
      .join('\n')
      .replace(/\n\n\n/g, '\n\n');
  }

  /**
   * Doesn't show command in the help menu.
   *
   * @return {Command}
   * @api public
   */

  hidden() {
    this._hidden = true;
    return this;
  }

  /**
   * Allows undeclared options to be passed in with the command.
   *
   * @param {Boolean} [allowUnknownOptions=true]
   * @return {Command}
   * @api public
   */

  allowUnknownOptions(allowUnknownOptions = true) {
   this._allowUnknownOptions = !!(allowUnknownOptions === 'false' ? false : allowUnknownOptions);
   return this;
  }

  /**
   * Returns the command usage string for help.
   *
   * @param {String} str
   * @return {String}
   * @api public
   */

  usage(str) {
    if (arguments.length === 0) {
      const args = this._args.map((arg) => {
        return VorpalUtil.humanReadableArgName(arg);
      });
      const usage = `[options]${this.commands.length ? ' [command]' : ''}${this._args.length ? ' ' + args.join(' ') : ''}`;
      return this._usage || usage;
    }
    
    this._usage = str;
    return this;
  }

  /**
   * Returns the help string for the command's options.
   *
   * @return {String}
   * @api public
   */

  optionHelp() {
    const width = this._largestOptionLength();
    
    // Prepend the help information
    return [ `${VorpalUtil.pad('--help', width)}  output usage information` ]
      .concat(this.options.map((option) => {
        return `${VorpalUtil.pad(option.flags, width)}  ${option.description}`;
      }))
      .join('\n');
  }

  /**
   * Returns the length of the longest option.
   *
   * @return {Integer}
   * @api private
   */

  _largestOptionLength() {
    return this.options.reduce((max, option) => {
      return Math.max(max, option.flags.length);
    }, 0);
  }

  /**
   * Adds a custom handling for the --help flag.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  help(fn) {
    if (_.isFunction(fn)) {
      this._help = fn;
    }
    return this;
  }

  /**
   * Edits the raw command string before it
   * is executed.
   *
   * @param {String} str
   * @return {String} str
   * @api public
   */

  parse(fn) {
    if (_.isFunction(fn)) {
      this._parse = fn;
    }
    return this;
  }

  /**
   * Adds a command to be executed after command completion.
   *
   * @param {Function} fn
   * @return {Command}
   * @api public
   */

  after(fn) {
    if (_.isFunction(fn)) {
      this._after = fn;
    }
    return this;
  }

  /**
   * Parses and returns expected command arguments.
   *
   * @param {String} args
   * @return {Array}
   * @api private
   */

  _parseExpectedArgs(args) {
    if (!args.length) {
      return;
    }
    args.forEach((arg) => {
      let argDetails = {
        required: false,
        name: '',
        variadic: false
      };
      
      switch (arg[0]) {
        case '<':
          argDetails.required = true;
          argDetails.name = arg.slice(1, -1);
          break;
        case '[':
          argDetails.name = arg.slice(1, -1);
          break;
        default:
          break;
      }
      
      if ((argDetails.name.length > 3) && (argDetails.name.slice(-3) === '...')) {
        argDetails.variadic = true;
        argDetails.name = argDetails.name.slice(0, -3);
      }
      if (argDetails.name) {
        this._args.push(argDetails);
      }
    });
    
    // If the user entered args in a weird order,
    // properly sequence them.
    if (this._args.length > 1) {
      this._args = this._args.sort((argu1, argu2) => {
        if ((argu1.required) && (!argu2.required)) {
          return -1;
        } else if ((argu2.required) && (!argu1.required)) {
          return 1;
        } else if ((argu1.variadic) && (!argu2.variadic)) {
          return 1;
        } else if ((argu2.variadic) && (!argu1.variadic)) {
          return -1;
        }
        return 0;
      });
    }
  }
}
export default Command;
