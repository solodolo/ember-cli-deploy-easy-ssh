ember-cli-deploy-easy-ssh
==============================================================================

This is an addon to deploy ember-cli based apps to our backends over SSH.  The
deployment steps are as follows:

1. The Ember app is built and the assets are stored somewhere.  Note that this addon does not perform the build step itself.
2. For each host defined in the config, upload the assets over SSH.
3. Optionally make the uploaded asset active by symlinking it.
4. Optionally delete old releases.


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


Usage
------------------------------------------------------------------------------

[Longer description of how to use the addon in apps.]


Contributing
------------------------------------------------------------------------------

See the [Contributing](CONTRIBUTING.md) guide for details.


License
------------------------------------------------------------------------------

This project is licensed under the [MIT License](LICENSE.md).
