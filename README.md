# VS Code Test Commnad Line Interface

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This repository contains packages which provide tools for testing VS Code extensions in a VS Code environment in a simple way.

## Running tests in a VS Code environment

By running the tests in a VS Code environment, you can use [VS Code APIs](https://code.visualstudio.com/api/references/vscode-api) from the tested code without the need for mocking it, and you can also use VS Code APIs directly from the tests.

This allows the tests to run in a production-like environment, where the result of the APIs is the actual result and not a mock that might not reflect the real runtime behavior of the extension.

This also allows you to test the integration of the extension with VS Code, for example:

- Checking that your extension correctly searches for files in the workspace (including a multi-root workspace)
- Checking that a command is properly registered by running it from VS Code APIs
- Checking that a task provider is properly registered by fetching its tasks from VS Code APIs and running them
- Checking that your extension responds correctly to file system events and other VS Code events, like workspace changes and editor focus changes
- Checking that your extensions adds diagnostics correctly by fetching them from VS Code APIs

## Packages

The following packages are included in this repository:

### [`@sap/vscode-test-cli`](packages/vscode-test-cli)

This package helps you run the tests for your VS Code extension in a VS Code environment by configuring the extension parameters in a configuration file and running the tests from the `scripts` section of the `package.json`, using a command line interface.

## Support

For support requests, please open an [issue](https://github.com/SAP/vscode-test-cli/issues) on Github.

## Contributing

Contributions are welcome. Please see the [contribution guide](CONTRIBUTING.md) for details.

Before implementing a major contribution please open an issue to discuss your contribution first.
