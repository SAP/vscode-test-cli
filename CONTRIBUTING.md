# Contribution Guide

This is the common top-level contribution guide for this monorepo.
A sub-package **may** have an additional CONTRIBUTING.md file if needed.

## Developer Certificate of Origin (DCO)

Due to legal reasons, contributors will be asked to accept a DCO before they submit the first pull request to this projects, this happens in an automated fashion during the submission process. SAP uses [the standard DCO text of the Linux Foundation](https://developercertificate.org/).

This is managed automatically via https://cla-assistant.io/ pull request voter.

- https://cla-assistant.io/SAP/vscode-test-cli

## Development Environment

### Pre-requisites

- [Yarn](https://yarnpkg.com/lang/en/docs/install/) >= 1.4.2
- A [Long-Term Support version](https://nodejs.org/en/about/releases/) of node.js
- (optional) [commitizen](https://github.com/commitizen/cz-cli#installing-the-command-line-tool) for managing commit messages.

### Initial Setup

Follow these steps to set up the development environment:

- Clone this repository
- Run `yarn`

### Development Process

All work on VS Code Test CLI happens in GitHub. Both core team members and external contributors send pull requests which go through the same review process.

### Repository Structure

All sub-packages can be found under the `packages` folder.

### Formatting

[Prettier](https://prettier.io/) is used to ensure consistent code formatting in this repository.
This is normally transparent as it automatically activated in a pre-commit hook using [lint-staged](https://github.com/okonet/lint-staged).
However, this does mean that development flows that do not use a full dev env (e.g editing directly on github) may result in voter failures due to formatting errors.

### Compiling

Use the following npm scripts at the repo's **root** to compile **all** the TypeScript sub-packages.

- `yarn compile`
- `yarn compile:watch` (will watch files for changes and re-compile as needed)

These scripts may also be available inside the sub-packages. However, it is recommended to use the top-level compilation scripts to avoid forgetting to (re-)compile a sub-package's dependency.

### Testing

All new code requires tests. All test-related artifacts are under the `test` folder of the specific sub-package.

[Mocha][mocha], [Chai][chai] and [Sinon][sinon] are used for unit testing and [Istanbul/Nyc][istanbul] for coverage reports.

[mocha]: https://mochajs.org/
[chai]: https://www.chaijs.com
[sinon]: https://sinonjs.org/
[istanbul]: https://istanbul.js.org/

To run the tests, after compiling the code run `yarn test` in a specific sub-package.

To run the tests with **coverage** run `yarn coverage` in a specific sub-package.

### Code Coverage

100%\* Code Coverage is enforced for all productive code in this mono repo.

Specific statements/functions may be [excluded][ignore_coverage] from the report. However, the reason for each exclusion must be documented.

[ignore_coverage]: https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md

### Full Build

To run the full **C**ontinuous **I**ntegration build run `yarn ci` in either the top-level package or a specific subpackage.

### Committing Changes

This project enforces the [conventional-commits][conventional_commits] commit message formats.
The possible commits types prefixes are limited to those defined by [conventional-commit-types][commit_types].
This promotes a clean project history and enables automatically generating a changelog.

The commit message format is inspected in a git pre-commit hook. The commit messages are also verified in the PR voters.

Use `git cz` to construct valid conventional commit messages. Note that this requires [commitizen](https://github.com/commitizen/cz-cli#installing-the-command-line-tool) to be installed.

[commit_types]: https://github.com/commitizen/conventional-commit-types/blob/master/index.json
[conventional_commits]: https://www.conventionalcommits.org/en/v1.0.0/

### Pull Requests

After you create commits with changes, you can create a PR with the commits. You can either create a PR by pushing to a new branch to this repository or by creating a fork of the repository, pushing the commits to your fork and creating a PR based on the fork.

Once you have pushed commits to a branch and opened a PR, **do not amend the commits**. To push additional changes and fixes, add new commits to the same branch. To add changes from the `main` branch use `git pull`. This will create a merge commit. Amending commits makes it hard to view the PR history and track the new changes as well as the progress on comments from previous commits.

All voters must pass and a code review approval must be granted for the PR to be merged.

Please make sure the lint passes before pushing the commits. Run the linter with `yarn lint:fix`.

The PR voter will fail if the linter returns an error.

#### Merging the Pull Request

When the PR is merged, all commits are squashed and it is added to the repository as one single commit.

By default, the name for the PR commit is taken from the PR description and all the commits are added to the PR commit description. Before you merge, please check the PR commit:

- The PR commit name should follow the commitizen format described above. The voters will fail if this check does not pass.
- The PR commit description should only contain relevant information, like a description of the changes. Remove any unnecessary information like other commit messages before merging.

### Voters and Jobs

The folliwing jobs run on every branch (including PRs and commits merged to the `main` branch):

- Voter jobs. The pipelines for these jobs are defined in the [circle-ci config.yaml file](.circleci/config.yaml) as `build-node*` for each supported Node.JS version.
- Compliance check for the license.

### Release Life-Cycle

This monorepo uses Lerna [Fixed/Locked][lerna-mode] mode, which means that all the subpackages share the same version number.
The version is defined in the "version" attribute of the [lerna.json](lerna.json) file.

[lerna-mode]: https://github.com/lerna/lerna#fixedlocked-mode-default

### Release Process

Performing a release requires push permissions to the repository.

Releases are created manually. Follow these steps to create a release:

- Ensure you are on the default branch and synced with origin.
- `yarn run release:version`

  This script updates the version and generates a changelog for all the packages in this monorepo based on [conventional commits][conventional_commits]. It then pushes these changes to the `main` branch and tags it with the new version, in the format `/^v[0-9]+(\.[0-9]+)*/`. This triggers the same jobs on the `main` branch as described above, with the addition of creating and uploading a version to npmjs.com and creating a Github release.

- Track the newly pushed **tag** (`/^v[0-9]+(\.[0-9]+)*/`) build in the build system until successful completion
- Inspect the newly artifacts published on npmjs.com and Github Releases.
