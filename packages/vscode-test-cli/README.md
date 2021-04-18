# VS Code Test Command-Line Interface

This package helps you run the tests for your VS Code extension in a VS Code environment by configuring the extension parameters in a configuration file and running the tests from the `scripts` section of the `package.json`, using a command line interface.

This package uses the [`vscode-test`](https://github.com/microsoft/vscode-test) package for running the tests according to the configuration.

Download and installation instructions can be found under the "Usage" section.

## Usage

Follow these steps to use this package:

1. Add a dev dependency to this package (`@sap_oss/vscode-test-cli`) in the `devDependencies` section of your extension's `package.json` file. Use the latest available version.
1. Run `npm install` or `yarn` from the extension root directory (the directory in which the `package.json` file is found).
1. Create a `vscode-test-cli` configuration file in the format specified in [index.d.ts](index.d.ts).
   `vscode-test-cli` uses [`cosmiconfig`](https://github.com/davidtheclark/cosmiconfig) to load the configuration automatically. See the `cosmiconfig` documentation for which file types are supported and where the file should be placed. We recommend creating a file with the name `vscode-test-cli.config.js` and placing it in the extension's root folder. To get code assist for the properties you can define the type of the returned value like the following:

   ```js
   /**@type {import('@sap_oss/vscode-test-cli').Configuration}*/
   const config = {
     // Define configuration properties ...
   };
   module.exports = config;
   ```

   If you prefer to use a different name or a different path you can pass the `--config` parameter with a path to the configuration file (relative to the current working directory) when running `vscode-test-cli`.

1. Add a script for running the tests in the `scripts` section of your extension's `package.json` file:

   ```json
   "test": "vscode-test-cli"
   ```

1. If your extension tests are written in TypeScript, add a dev dependency to `@types/mocha` in the `devDependencies` section of your extension's `package.json` file. To ensure compatibility, the version of `@types/mocha` should be the compatible with the version of `Mocha` defined in this package (for example, you can use `@types/mocha` version `8.2.0`). Run `npm install` or `yarn` from the extension root directory after adding the dependency.
1. Create a [`Mocha`](https://mochajs.org/) configuration file in JSON or JavaScript format and set its path in the `vscode-test-cli` configuration file `mochaConfigPath` property.
1. Write tests for your extension.
1. Use the `test` script to run the tests.

To add test coverage follow these steps:

1. Create an [`nyc`](https://github.com/istanbuljs/nyc) configuration file in JSON or JavaScript format and set its path in the `vscode-test-cli` configuration file `nycConfigPath` property.
1. Add a dev dependency to `nyc` in the `devDependencies` section of your extension's `package.json` file. To ensure compatibility, the version of `nyc` should be the same as the dependency defined in this package (version `15.1.0`). Run `npm install` or `yarn` from the extension root directory after adding the dependency.
1. Add a script for running the tests with code coverage and reporting the code coverage results in the `scripts` section of your extension's `package.json` file:

   ```json
   "test:coverage": "vscode-test-cli --coverage && nyc report"
   ```

See the [code coverage limitations section](#code-coverage-limitation) for information about code for which coverage is not collected.

**Note:** You must run `nyc report` after running the tests to see the code coverage report.

## Configuring `vscode-test-cli`

### Defining the VS Code version

You can define the version of VS Code that is used in the tests by using the `vscodeVersion` configuration property. By default the tests run on the latest stable version, which allows you to recognize issues with new VS Code versions early.

### Using a folder workspace or a multi-root workspace

You can use the `workspacePath` configuration property to specify the workspace path.

The workspace can be either a folder or a workspace file. If it's a folder, it must exist in the file system. If it's a workspace file, and it doesn't exist, it will be initialized with an empty workspace (without any folders) by default unless the `initWorkspace` configuration property is set to `false`.

Using a workspace file allows you to test the extension with a [multi-root workspace](https://code.visualstudio.com/docs/editor/multi-root-workspaces). The workspace file extension must be `.code-workspace`.

You can add and remove folders from a multi-root workspace by updating the workspace file content according to the [workspace file schema](https://code.visualstudio.com/docs/editor/multi-root-workspaces#_workspace-file-schema). See [more information](https://github.com/microsoft/vscode-wiki/blob/main/Adopting-Multi-Root-Workspace-APIs.md) about developing extensions that support multi-root workspaces.

#### Initializing the multi-root workspace

If you use a workspace file you can set the `initWorkspace` configuration property to `true` to initialize it to the empty workspace before running the tests. At the end of the run the workspace file will be deleted.

The workspace file is initialized by default if it doesn't exist.

### Running the tests while a VS Code instance is already open or with the root user

You can use the `userDataDir` configuration property to specify the folder for [VS Code user data directory](https://code.visualstudio.com/docs/editor/command-line#_advanced-cli-options).

Specifying this folder allows you to run VS Code while a VS Code instance is open (with a different user data directory). It also allows you to run VS Code as root, which is not possible if you do not specify a user data direcory.

### Loading the extension during the tests

You can use the `extensionDevelopmentPath` configuration property to specify the root folder of the extension (where the extension's `package.json` can be found). The extension is then loaded when the tests run, so you can use VS Code APIs to interact with it (e.g. running its commands).

By default the `extensionDevelopmentPath` is the folder of the configuration file.

### Running with extension dependencies

If your extension depends on other extensions, you have to install them before running the tests if you would like your extension to be loaded properly during the tests. You can do that by specifying the `additionalExtensionFolders` configuration property. For each specified folder, all `vsix` files in it will be installed before running the tests.

### Disabling other extensions during the tests

You can uninstall or disable extensions when running the tests.

To uninstall extensions, specify their IDs in the `uninstallExtensionIDs` configuration property. These extensions will be uninstalled from VS Code. Note that this happens before installing new extensions.

To disable extensions during the run of the tests, specify their IDs in the `disabledExtensionIDs` configuration property. These extensions will be disabled only for the run of the tests.

If you would like to disable all other (non built-in) extensions during the tests, set the `disableAllExtensions` configuration property to `true`. Note that if your extension depends on other extensions, they will be disabled as well, which will prevent your extension from being loaded properly during the tests, even if you specify them in `additionalExtensionFolders`.

By default, `disableAllExtensions` is `true` if `additionalExtensionFolders` is not empty (i.e. your extension has dependencies), otherwise it is `false`.

**Note:** the extensions IDs include the publisher.

### Running tests with `Mocha`

This package currently supports running tests only with `Mocha`. The supported `Mocha` version is `8.2.1`.

You must specify a `Mocha` configuraion file in JSON or JavaScript format in the `mochaConfigPath` configuration property. The supported configuration options for `Mocha` are:

- `spec` - the glob pattern to find test files. Required. The files are searched relative to the `extensionDevelopmentPath`. This provides the same functionality as the `spec` positional argument in the `Mocha` CLI, but only a single value is supported.
- `require` - an array of node module names (or a single node module name) to require before running the tests. This provides the same functionality as the `require` option in the `Mocha` CLI.
- All properties defined [in the `Mocha` constructor](https://mochajs.org/api/mocha). Note that not all [Mocha command-line options](https://mochajs.org/#command-line-usage) are supported.

### Collecting code coverage information with `nyc`

This package currently supports collecting code coverage information only with `nyc`. The supported `nyc` version is `15.1.0`.

If you would like to collect code coverage information during the tests run, you must specify the `--coverage` command line argument when running `vscode-test-cli` and specify an `nyc` configuration file in JSON or JavaScript format in the `nycConfigPath` configuration property. You can see the supported `nyc` configuration options [here](https://github.com/istanbuljs/nyc#common-configuration-options).

## Limitations

### Supported testing frameworks

This package currently supports running tests only with `Mocha`.

### Supported code coverage frameworks

This package currently supports collecting code coverage information only with `nyc`.

### Code coverage limitation

Code coverage will be collected for all code executed from the tests. However, please note that code that runs from the extension directly, which is loaded by VS Code, will not be included in the code coverage. Therefore, if your tests require the same files specified in the `main` property of the extension's `package.json` file, the code coverage will not be collected.

The reason for this limitation is that this code is loaded by VS Code before the files are instrumented.

## Known Issues

There are no known issues.

## Contributing

See the [contribution guide](../../CONTRIBUTING.md) for details.
