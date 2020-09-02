'use strict';

const BasePlugin = require('ember-cli-deploy-plugin');
const RSVP = require('rsvp');
const Client = require('node-ssh').NodeSSH;
const path = require('path');

let iso8601DirectoryName = function() {
  return (new Date()).toISOString().replace(/[-:\.]/g, '').slice(0, 13);
};

module.exports = {
  name: 'ember-cli-deploy-easy-ssh',

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        releasesDir: 'releases',
        targetLink: 'current',
        keep: 5
      },

      requiredConfig: ['hosts', 'targetDir', 'sourceDir'],

      setup() {
        // try to reach each host and store connection if successful
        let promises = [];

        this.readConfig('hosts').forEach(h => {
          const conn = new Client();
          promises.push(
            conn.connect({
              host: h.host,
              username: h.username,
              agent: process.env.SSH_AUTH_SOCK
            })
            .then(conn => { return {conn: conn, host: h.host }})
          );
        });

        return RSVP.all(promises).then((connections) => {
          return {connections: connections};
        });
      },

      willUpload(context) {
        // check for releases directory and create if it doesn't exist
        const targetDir = this.readConfig('targetDir');
        const releasesDir = this.readConfig('releasesDir');
        const releasesPath = path.posix.join(targetDir, releasesDir);

        let releaseName = "";
        if(context.revisionData && context.revisionData.revisionKey){
          releaseName = context.revisionData.revisionKey;
        }
        else {
          releaseName = iso8601DirectoryName();
        }

        const releasePath = path.posix.join(releasesPath, releaseName);
        this.log(`Creating directory ${releasePath}`, {color: 'green'});
        // create revision directory and allow apache to read and navigate it
        return this._execCommandAll(context, `mkdir -p ${releasePath}`)
          .then(() => {
            return this._execCommandAll(context, `chmod 750 ${releasesPath}`)
              .then(() => {
                return {
                  releasePath: releasePath, // full path to latest release
                  releasesPath: releasesPath, // all releases
                  releaseName: releaseName // name of latest release
                };
              });
          });
      },

      upload(context) {
        const local = path.join(process.cwd(), this.readConfig('sourceDir'));
        const remote = context.releasePath;

        let promises = [];
        context.connections.forEach(conn => {
          this.log(`Uploading build dir ${local} to ${conn.host}:${remote}...`, {color: 'green'});

          // upload the entire build directory to the revision folder
          let promise = conn.conn.putDirectory(local, remote)
            .then(() => {
              this.log(`Successfully uploaded to ${conn.host}`, {color: 'green'});
            })
            .catch(e => {
              this.log(`Failed to upload to ${conn.host}: ${e}`, {color: 'red'});
            });

          promises.push(promise);
        });

        return RSVP.all(promises)
          .then(() => this.log(`Finished uploading`, {color: 'green'}))
          .catch(e => this.log(`There was an upload error: ${e}`, {color: 'red'}));
      },

      activate(context) {
        // change current revision symlink to the one we just uploaded
        const linkPromise = this._linkRelease(context)
          .then(() => this.log('Successfully activated latest revision', {color: 'green'}))
          .catch(e => this.log(`Failed to activate latest revision: ${e}`, {color: 'red'}));

        // allow web server to read files
        const permPromise = this._setFilePermissions(context)
          .then(() => this.log('Successfully set permissions of latest revison', {color: 'green'}))
          .catch(e => this.log(`Failed to set permissions of latest revision: ${e}`, {color: 'red'}));

        return RSVP.all([linkPromise, permPromise])
          .then(() => this.log('Finished activation'), {color: 'green'})
          .catch(() => this.log('Activation failed', {color: 'red'}));
      },

      didActivate(context) {
        // keep latest releases and delete the rest
        return new RSVP.Promise((resolve, reject) => {
          // get releases from newest to oldest
          const releases = this._fetchReleasesByDate(context);
          releases.then((hostReleases) => {
            Object.keys(hostReleases).forEach(h => {
              // from the list of releases, select the ones to delete
              const del = this._fetchReleasesToDelete(context, hostReleases[h]);

              if(del.length == 0) {
                this.log(`Nothing to delete`, {color: 'green'});
                resolve(true);
              }
              else {
                this.log(`Preparing to delete ${del} on ${h}`, {color: 'yellow'});

                this._deleteReleases(context, del)
                  .then(() => {
                    this.log(`Successfully deleted old releases`, {color: 'green'});
                    resolve(true)
                  })
                  .catch(e => {
                    this.log(`Failed to delete old releases ${e}`, {color: 'red'});
                    reject(false);
                  });
              }
            });
          }).catch(e => {
            this.log(`There was a problem finding releases: ${e}`, {color: 'red'});
            reject(false);
          });
        });
      },

      teardown(context) {
        context.connections.forEach(conn => conn.conn.dispose());
        this.log("Connections closed", {color: 'green'});
      },

      _execCommandAll(context, command) {
        // run `command` on every connection in `context`
        let promises = [];
        context.connections.forEach(conn => {
          promises.push(this._execCommand(conn.conn, command));
        });

        return new RSVP.Promise((resolve, reject) => {
          RSVP.all(promises).then((results) => {
            resolve(results);
          }).catch((reason) => reject(reason));
        })
      },

      _execCommand(conn, command) {
        return new RSVP.Promise((resolve, reject) => {
          conn.execCommand(command, {stream: 'both'}).then((result) => {
            if (result.stderr) {
              this.log(`Error running ${command}: ${result.stderr}`, {color: 'green'});
              reject(result.stderr);
            };

            resolve(result.stdout);
          })
          .catch(error => {
            this.log(`Command failed: ${error}`, {color: 'red'});
            reject(error);
          });
        });
      },

      _setFilePermissions(context) {
        const revision = context.releasePath;

        this.log(`Setting permissions of ${revision}`, {color: 'green'});

        // allow group directory traversal and file read
        const cmd = `test -e ${revision}` +
          ` && find ${revision} -type d -exec chmod 0750 {} \\;` +
          ` && find ${revision} -type f -exec chmod 0640 {} \\;`;

        return this._execCommandAll(context, cmd);
      },

      _linkRelease(context) {
        const target = context.releasePath;
        const linkName = path.posix.join(this.readConfig('targetDir'), this.readConfig('targetLink'));

        this.log(`Linking ${linkName} to ${target}`, {color: 'green'});

        // symlink the new release as the current release
        const cmd = "test -e " + target
          + " && ln -sfn " + target + " " + linkName
          + " || >&2 echo \"Release is missing!\"";

        return this._execCommandAll(context, cmd);
      },

      _fetchReleasesByDate(context) {
        let hostReleases = {};
        let promises = [];

        const cmd = `ls -t ${context.releasesPath}`;

        context.connections.forEach(conn => {
          const promise = this._execCommand(conn.conn, cmd);

          promise.then(stdout => {
            const releases = stdout.split("\n");
            hostReleases[conn.host] = releases;
          })
          .catch(stderr => {
            this.log(`stderr ${stderr}`, {color: 'red'});
          });

          promises.push(promise);
        });

        return RSVP.all(promises)
          .then(() => hostReleases)
          .catch(e => {
            this.log(`Failed to fetch releases: ${e}`, {color: 'red'});
            return {};
          });
      },

      _fetchReleasesToDelete(context, releases) {
        const keep = this.readConfig('keep');
        const delIndex = keep - 1; // delete after this index

        this.log(`Keeping ${keep} releases`, {color: 'green'});

        let del = [];
        releases.forEach((r,i) => {
          // make sure we don't delete the release we just linked
          if(i > delIndex && r != context.releaseName) {
            del.push(r);
          }
        });

        return del;
      },

      _deleteReleases(context, del) {
        const delStr = del.map(r => `./${r}`).join(' ');
        const cmd = `cd ${context.releasesPath}`
          + ` && rm -rf ${delStr}`;

        return this._execCommandAll(context, cmd);
      }
    });

    return new DeployPlugin();
  }
};
