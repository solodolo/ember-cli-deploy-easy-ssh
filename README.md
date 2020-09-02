ember-cli-deploy-easy-ssh
==============================================================================

This is an addon to deploy ember-cli based apps to our backends over SSH.  The
deployment steps are as follows:

1. The Ember app is built and the assets are stored somewhere.
2. For each host defined in the config, upload the assets over SSH.
3. Optionally make the uploaded asset active by symlinking it.
4. Optionally delete old releases.

**Note** Step 1 is not performed by this addon.  It is expected that the assets
are already built either by `ember build` or another addon like
`ember-cli-deploy-build`.


Compatibility
------------------------------------------------------------------------------

* Ember.js v3.8 or above
* Ember CLI v2.13 or above
* Node.js v8 or above


Installation
------------------------------------------------------------------------------

```
ember install ember-cli-deploy-easy-ssh
```

`ember-cli-deploy` will add a deployment file to your app at `config/deploy.js`.
This addon requires some configuration to be set in that file.

### Required config
```
ENV['easy-ssh'] = {
  hosts: [
    {
      username: 'foo',
      host: 'server1.baz'
    },
    {
      username: 'bar',
      host: 'server2.baz'
    }
  ],
  targetDir: '/var/www/app_dir',
  sourceDir: 'build/staging',
}
```

**hosts** - An array of hosts to push built assets to. The user will be used to
connect to the host and will be the owner of the files.

**targetDir** - The directory on the hosts to upload to.  New assets will be pushed
to a directory called `releases` (see *releasesDir* below) inside of targetDir.

**sourceDir** - The directory containing the assets to upload.  Everything inside
sourceDir will be uploaded to each host.

### Optional config

**releasesDir** - The name of the directory inside targetDir that holds the releases
of the application.  Defaults to `releases`. Releases can be provided by any addon
that sets the `revisionKey` attribute.  Falls back to a timestamp format if this
is not set.

**targetLink** - The name of the symlink to the current release directory.  Defaults
to `current`.

**keep** - The number of past revisions to keep, ordered from most recent to least.
Defaults to `5`.

Usage
------------------------------------------------------------------------------

To upload the built assets run the following from your project's directory
where --environment is the target environment like `--staging` or `--production`.

```
ember deploy --environment
```

The above command will not symlink the new revision or delete old revisions. To do
so, add the `--activate` flag.

See
[https://github.com/ember-cli-deploy/ember-cli-deploy](https://github.com/ember-cli-deploy/ember-cli-deploy)
for more information.


Contributing
------------------------------------------------------------------------------

See the [Contributing](CONTRIBUTING.md) guide for details.


License
------------------------------------------------------------------------------

This project is licensed under the [MIT License](LICENSE.md).
