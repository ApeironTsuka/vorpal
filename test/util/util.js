import Vantage from '../../lib/vorpal.js';
import _ from 'lodash';
import path from 'node:path';
import url from 'node:url';

const exports {

  instances: [],

  spawn: function (options, cb) {
    options = options || {};
    options = _.defaults(options, {
      ports: [],
      ssl: false
    });

    for (let i = 0; i < options.ports.length; ++i) {
      let vorpal = new Vantage();
      let port = options.ports[i];
      vorpal
        .delimiter(port + ':')
        .use(path.join(path.dirname(url.fileURLToPath(import.meta.url)), '/server'))
        .listen(port);
      exports.instances.push(vorpal);
    }

    cb(undefined, exports.instances);
  },

  kill: function (what, cb) {
    cb = cb || () => {};
    cb();
  }
};
export exports;
export default exports;
