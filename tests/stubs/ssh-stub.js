'use strict';

const RSVP = require('rsvp');

module.exports = class SSHStub {
  commands = [];
  directories = [];
  isDisposed = false;

  connect() {
    return RSVP.Promise.resolve(this);
  }

  execCommand(cmd) {
    this.commands.push(cmd);
    return RSVP.Promise.resolve(this);
  }

  putDirectory(local, remote) {
    this.directories.push({local: local, remote: remote});
    return RSVP.Promise.resolve(this);
  }

  dispose() {
    this.isDisposed = true;
  }

  hasCommand(expr) {
    return this.commands.some(c => c.match(expr));
  }

  putLocalDir(expr) {
    return this.directories.some(d => d.local.match(expr));
  }

  putRemoteDir(expr) {
    return this.directories.some(d => d.remote.match(expr));
  }
}