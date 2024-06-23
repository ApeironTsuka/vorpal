'use strict';

import Vorpal from '../../lib/vorpal.js';

const vorpal = new Vorpal();

vorpal.command('login', 'Login (u: root p: vorpal)')
  .action(function (args, cb) {
    const promise = this.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Username: '
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password: '
      }
    ], function (answers) {
      // You can use callbacks...
    });

    promise.then((answers) => {
      // Or promises!
      if ((answers.username === 'root') && (answers.password === 'vorpal')) {
        this.log('Successful login.');
      } else {
        this.log('Login failed! Try username "root" and password "vorpal"!');
      }
      cb();
    });
  });

vorpal
  .show()
  .parse(process.argv);
