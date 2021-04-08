/**
 * Configuration file for vscode-test-cli.
 * All paths in this file are resolved relative to the configuration file folder.
 */
export type Configuration = {
  /** The vscode version to use. Version number, "stable" (latest stable version) or "insiders". Default: "stable". */
  vscodeVersion?: string | "stable" | "insiders";
  /** Path to the workspace the tests run on. The workspace can be a workspace file or an existing folder. Workspace files must have a ".code-workspace" suffix. Default: "test.code-workspace". */
  workspacePath?: string;
  /** Should the workspace file be initialized to an empty workspace before running the tests. Can only be true for workspace file and not a folder. Default: false if workspacePath exists, true if it doesn't exist. */
  initWorkspace?: boolean;
  /** The user data directory to run vscode with. Optional. When running as root (e.g. in Jenkins) you have to send the user data dir. */
  userDataDir?: string;
  /** Root folder of the extension. Default: the folder of the configuration file. */
  extensionDevelopmentPath?: string;
  /** Path to Mocha configuration file. Must be a JSON or JavaScript file. Required. */
  mochaConfigPath: string;
  /** Path to Nyc configuration file. Must be a JSON or JavaScript file. Required for code coverage. */
  nycConfigPath?: string;
  /** Folders with additional vsix files to install before running the tests. Optional. All vsix files in these folders will be installed. Note: the search for vsix files is not recursive. */
  additionalExtensionFolders?: string[];
  /** Extension IDs to uninstall before running the tests. Optional. Note: the extension IDs must include the publisher. */
  uninstallExtensionIDs?: string[];
  /** Extension IDs to disable when running the tests. These extensions will not be loaded. Optional. Note: the extension IDs must include the publisher. */
  disabledExtensionIDs?: string[];
  /** Disable all installed extensions except the tested extension (from extensionDevelopmentPath). Default: true if additionalExtensionFolders is empty, false if not. Important: send false if your extension has dependencies which are not specified in additionalExtensionFolders. */
  disableAllExtensions?: boolean;
};
