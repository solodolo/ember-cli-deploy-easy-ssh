const chai  = require('chai');
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const RSVP = require('rsvp');
const path = require('path');

var expect = chai.expect;

const SSHStub = require('../stubs/ssh-stub.js');

const stubProject = {
  name: function(){
    return 'ember-cli-deploy-easy-ssh';
  }
};

describe('ember-cli-deploy-easy-ssh', function() {
  var plugin, subject, mockUi, config, context, conn;

  beforeEach(function() {
    subject = require('../../index');
    mockUi = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      },
      hasMessage(expr) {
        return this.messages.some(m => m.match(expr));
      }
    };

    conn = new SSHStub();

    config = {
      hosts: [
        {
          username: 'user',
          host: 'http://test.host',
          connection: conn
        }
      ],
      targetDir: '/path/to/target',
      sourceDir: 'build'
    };

    context = {
      ui: mockUi,
      project: stubProject,
      connections: [{conn: conn, host: 'http://test.host'}],
      config: { "easy-ssh": config }
    };

    plugin = subject.createDeployPlugin({name: 'easy-ssh' });
    plugin.beforeHook(context);
  });

  it('has a name', function() {
    const result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    expect(result.name).to.equal('test-plugin');
  });

  describe('setup', function() {
    beforeEach(function() {
      delete context.connections;
    });

    it('adds connections to the context', function() {
      return expect(plugin.setup(context)).to.be.fulfilled.then((context) => {
        expect(mockUi.hasMessage("Successful connection to http://test.host")).to.be.true;
        expect(context).to.be.an('object').that.has.all.keys('connections');
      });
    });

    it('should log connection failures', function() {
      config.hosts[0].connection.connect = () => RSVP.Promise.reject('connection failure');

      return expect(plugin.setup(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage(/connection failure/), 'Logs error message').to.be.true;
      });
    });
  });

  describe('willUpload', function() {
    beforeEach(function() {
      plugin.configure(context);
    });

    it('should mkdir the releases directory', function() {
      return expect(plugin.willUpload(context)).to.be.fulfilled.then(() => {
        const executed = conn.commands;
        expect(executed.length).to.eq(2);

        const expectedPath = path.posix.join(config.targetDir, 'releases');
        expect(conn.hasCommand(`mkdir -p ${expectedPath}`), 'Called mkdir').to.be.true;
        expect(conn.hasCommand(`chmod 750 ${expectedPath}`), 'Called chmod').to.be.true;
      });
    });

    it('should log stderr messages', function() {
      conn.execCommand = () => RSVP.Promise.resolve({stderr: 'Failure'});

      return expect(plugin.willUpload(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage(/Error running .+: Failure/), 'Logged error message').to.be.true;
      });
    });

    it('should log execution errors', function() {
      conn.execCommand = () => RSVP.Promise.reject('error running cmd');

      return expect(plugin.willUpload(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage(/error running cmd/), 'Logged error message').to.be.true;
      });
    });
  });

  describe('upload', function() {
    beforeEach(function() {
      plugin.configure(context);
    });

    it('should upload the correct directory', function() {
      context.releasePath = '/some/remote/path';
      const expected = path.join(process.cwd(), config.sourceDir);

      return expect(plugin.upload(context)).to.be.fulfilled.then(() => {
        expect(conn.putLocalDir(expected), "Correct local dir").to.be.true;
        expect(conn.putRemoteDir(context.releasePath), "Correct remote dir").to.be.true;
        expect(mockUi.hasMessage(/Successfully uploaded/), "Correct log message").to.be.true;
      });
    });

    it('should log upload errors', function() {
      conn.putDirectory = () => RSVP.Promise.reject('upload error');

      return expect(plugin.upload(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage(/upload error/), 'Logged error message').to.be.true;
      });
    });
  });

  describe('activate', function() {
    beforeEach(function() {
      context.releasePath = '/some/remote/path';
      plugin.configure(context);
    });

    it('should symlink the latest revision', function() {
      return expect(plugin.activate(context)).to.be.fulfilled.then(() => {
        expect(conn.hasCommand("ln -sfn"), 'Executed "ln -sfn"').to.be.true;
      });
    });

    it('should set the permissions of the latest revision', function() {
      return expect(plugin.activate(context)).to.be.fulfilled.then(() => {
        expect(
          conn.hasCommand(`find ${context.releasePath} -type d -exec chmod 0750`),
          'Sets directories to 750'
        );

        expect(
          conn.hasCommand(`find ${context.releasePath} -type f -exec chmod 0640`),
          'Sets files to 640'
        );

        expect(mockUi.hasMessage(/Successfully set permissions/), 'Logs succeess message').to.be.true
      });
    });

    it('should log activation errors', function() {
      conn.execCommand = () => RSVP.Promise.reject(false);

      return expect(plugin.activate(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage(/Failed to activate/), 'Logs symlink error').to.be.true;
        expect(mockUi.hasMessage(/Failed to set permissions/, 'Logs permissions error')).to.be.true;
      });
    });
  });

  describe('didActivate', function() {
    beforeEach(function() {
      conn.execCommand = function(cmd) {
        this.commands.push(cmd);
        return RSVP.Promise.resolve({stdout: "rev1\nrev2\nrev3\nrev4\nrev5\nrev6"});
      }
      context.releasesPath = '/path/to/revisions';
      plugin.configure(context);
    });

    it('should list revsions from newest to oldest', function() {
      return expect(plugin.didActivate(context)).to.be.fulfilled.then(() => {
        expect(conn.hasCommand(/ls -t/)).to.be.true;
      });
    });

    it('should cd into the revisions directory before deleting', function() {
      return expect(plugin.didActivate(context)).to.be.fulfilled.then(() => {
        expect(conn.hasCommand(`^cd ${context.releasesPath} && rm`)).to.be.true;
      });
    });

    it('should keep 5 revisions by default', function() {
      return expect(plugin.didActivate(context)).to.be.fulfilled.then(() => {
        expect(conn.hasCommand('rm -rf ./rev6')).to.be.true;
      });
    });

    it('should keep a configurable number of revisions', function() {
      config.keep = 2;
      plugin.configure(context);

      return expect(plugin.didActivate(context)).to.be.fulfilled.then(() => {
        expect(conn.hasCommand('rm -rf ./rev3 ./rev4 ./rev5 ./rev6')).to.be.true;
      });
    });

    it('should log failures listing revisions', function() {
      conn.execCommand = () => RSVP.Promise.reject('fetch error');

      return expect(plugin.didActivate(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage('fetch error'), 'Logs error message').to.be.true;
      });
    });

    it('should log failures deleting releases', function() {
      plugin._deleteReleases = () => RSVP.Promise.reject('deletion error');

      return expect(plugin.didActivate(context)).to.be.rejected.then(() => {
        expect(mockUi.hasMessage('deletion error'), 'Logs error message').to.be.true;
      });
    })
  });

  describe('teardown', function() {
    it('should dispose of connections', function() {
      plugin.teardown(context);
      expect(conn.isDisposed).to.be.true;
      expect(mockUi.hasMessage('Connections closed'), 'Logs message').to.be.true;
    });
  });
});

