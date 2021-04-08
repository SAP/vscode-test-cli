import { resolve, join, dirname } from "path";
import {
  resolveCliPathFromVSCodeExecutablePath,
  downloadAndUnzipVSCode,
  runTests,
} from "vscode-test";
import { spawnSync } from "child_process";
import { readdir, writeJson, unlink, pathExists, mkdirs, stat } from "fs-extra";
import { map, isArray, filter, isEmpty } from "lodash";
import {
  ENV_VAR_MOCHA_CWD,
  ENV_VAR_MOCHA_CONFIG_PATH,
  ENV_VAR_NYC_CWD,
  ENV_VAR_NYC_CONFIG_PATH,
  ENV_VAR_BASE_TEST_PATH,
} from "./constants";
import { Configuration } from "../index";
import * as yargs from "yargs";
import { cosmiconfig } from "cosmiconfig";
import { CosmiconfigResult } from "cosmiconfig/dist/types";

const USER_DATA_DIR_PARAM = "--user-data-dir";

export type ResolvedConfiguration = Configuration & {
  extensionDevelopmentPath: string;
  workspacePath: string;
  initWorkspace: boolean;
  disableAllExtensions: boolean;
};

/**
 * @param processArgs Process arguments. See supported arguments by running this file with --help.
 */
// istanbul ignore next -- can't test functions that exit the process
export async function runTestsFromCommandLine(
  processArgs: string[]
): Promise<void> {
  let exitCode = 0;
  try {
    await runTestsFromCommandLineInner(processArgs);
  } catch (err) {
    exitCode = 1;
    console.error("Failed to run tests", err);
  } finally {
    // This is necessary for JAAS - it doesn't recognize that the node process has ended otherwise
    process.exit(exitCode);
  }
}

export async function runTestsFromCommandLineInner(
  processArgs: string[]
): Promise<void> {
  const { configPath, isCoverage } = readCommandLineParameters(processArgs);
  const configResult = await readConfiguration(configPath);
  const config = await validateAndResolveConfiguration(
    configResult.filepath,
    configResult.config,
    isCoverage
  );
  await runVSCodeTests(isCoverage, config);
}

export function readCommandLineParameters(
  processArgs: string[]
): {
  configPath: string | undefined;
  isCoverage: boolean;
} {
  const options: Record<string, yargs.Options> = {
    coverage: {
      type: "boolean",
      default: false,
      description: "Run the tests with coverage",
    },
    config: {
      type: "string",
      defaultDescription: "(nearest configuration file)",
      description:
        "The configuration file path, relative to the current working directory",
    },
  };
  // Yargs types aren't defined correctly.
  // yargs(arguments) actually returns the yargs.Argv type, and the .options(...) method returns yargs.Arguments,
  // where each key besides "_" and "$0" is defined in the options parameter with a value with the type defined in its type.
  // If there is a mismatch with the user input, the program exits.
  const args: Record<keyof typeof options, unknown> = ((yargs(
    processArgs
  ) as unknown) as yargs.Argv).options(options).argv;
  // See type definitions in the options variable for the casting
  return {
    configPath: args.config as string | undefined,
    isCoverage: args.coverage as boolean,
  };
}

export async function readConfiguration(
  configPath: string | undefined
): Promise<NonNullable<CosmiconfigResult>> {
  const explorer = cosmiconfig("vscode-test-cli");
  let configResult;
  if (configPath !== undefined) {
    configResult = await explorer.load(resolve(configPath));
  } else {
    configResult = await explorer.search();
  }

  if (configResult === null) {
    throw new Error(
      "No configuration file found. Use --config option to specify the configuration file path."
    );
  }

  return configResult;
}

function assertStringOrUndefinedParameter(
  name: keyof Configuration,
  value: unknown
): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Configuration error: ${name} must be a string`);
  }
}

function assertStringArrayOrUndefinedParameter(
  name: keyof Configuration,
  arrayValue: unknown
): asserts arrayValue is string[] | undefined {
  if (arrayValue !== undefined && !isArray(arrayValue)) {
    throw new Error(`Configuration error: ${name} must be a string array`);
  }
  if (arrayValue !== undefined) {
    for (const singleValue of arrayValue) {
      if (typeof singleValue !== "string") {
        throw new Error(`Configuration error: ${name} must be a string array`);
      }
    }
  }
}

function validateNycConfigPath(
  isCoverage: boolean,
  config: Record<string, unknown>,
  configRelPath: string
): string | undefined {
  let nycConfigPath: string | undefined;
  if (isCoverage) {
    assertStringOrUndefinedParameter("nycConfigPath", config.nycConfigPath);
    if (config.nycConfigPath === undefined) {
      throw new Error(
        "Configuration error: nycConfigPath must be defined when coverage is enabled"
      );
    }
    nycConfigPath = resolve(configRelPath, config.nycConfigPath);
  }
  return nycConfigPath;
}

async function validateInitWorkspace(
  config: Record<string, unknown>,
  isWorkspaceFile: boolean,
  workspacePath: string
): Promise<boolean> {
  let initWorkspace: boolean;
  if (
    config.initWorkspace !== undefined &&
    typeof config.initWorkspace !== "boolean"
  ) {
    throw new Error("Configuration error: initWorkspace must be a boolean");
  }
  if (config.initWorkspace !== undefined) {
    initWorkspace = config.initWorkspace;
    if (initWorkspace && !isWorkspaceFile) {
      throw new Error(
        "Configuration error: initWorkspace can be true only for a workspace file and not a folder"
      );
    }
  } else {
    // By default - only create the workspace file if it doesn't exist
    initWorkspace = isWorkspaceFile && !(await pathExists(workspacePath));
  }
  return initWorkspace;
}

export async function validateAndResolveConfiguration(
  configPath: string,
  config: Record<string, unknown>,
  isCoverage: boolean
): Promise<ResolvedConfiguration> {
  // Paths in the config file are relative to the configuration file folder
  const configRelPath = resolve(configPath, "..");

  assertStringOrUndefinedParameter(
    "extensionDevelopmentPath",
    config.extensionDevelopmentPath
  );
  const extensionDevelopmentPath = resolve(
    configRelPath,
    config.extensionDevelopmentPath ?? "."
  );

  assertStringOrUndefinedParameter("userDataDir", config.userDataDir);
  let userDataDir: string | undefined;
  if (config.userDataDir !== undefined) {
    userDataDir = resolve(configRelPath, config.userDataDir);
  }

  assertStringOrUndefinedParameter("vscodeVersion", config.vscodeVersion);

  assertStringArrayOrUndefinedParameter(
    "uninstallExtensionIDs",
    config.uninstallExtensionIDs
  );

  assertStringArrayOrUndefinedParameter(
    "disabledExtensionIDs",
    config.disabledExtensionIDs
  );

  assertStringArrayOrUndefinedParameter(
    "additionalExtensionFolders",
    config.additionalExtensionFolders
  );

  let additionalExtensionFolders: string[] | undefined;
  if (config.additionalExtensionFolders !== undefined) {
    additionalExtensionFolders = map(config.additionalExtensionFolders, (_) =>
      resolve(configRelPath, _)
    );
  }

  assertStringOrUndefinedParameter("mochaConfigPath", config.mochaConfigPath);
  if (config.mochaConfigPath === undefined) {
    throw new Error("Configuration error: mochaConfigPath must be defined");
  }
  const mochaConfigPath = resolve(configRelPath, config.mochaConfigPath);

  const nycConfigPath = validateNycConfigPath(
    isCoverage,
    config,
    configRelPath
  );

  assertStringOrUndefinedParameter("workspacePath", config.workspacePath);
  const workspacePath = resolve(
    configRelPath,
    config.workspacePath ?? "test.code-workspace"
  );
  const isWorkspaceFile = workspacePath.endsWith(".code-workspace");
  if (!isWorkspaceFile) {
    if (
      !(await pathExists(workspacePath)) ||
      !(await stat(workspacePath)).isDirectory()
    ) {
      throw new Error(
        "Configuration error: workspacePath must end with .code-workspace or be an existing folder"
      );
    }
  }

  const initWorkspace = await validateInitWorkspace(
    config,
    isWorkspaceFile,
    workspacePath
  );

  // By default - all extensions are disabled unless there are extensions we need to install for the tests
  let disableAllExtensions = isEmpty(additionalExtensionFolders);
  if (
    config.disableAllExtensions !== undefined &&
    typeof config.disableAllExtensions !== "boolean"
  ) {
    throw new Error(
      "Configuration error: disableAllExtensions must be a boolean"
    );
  }
  if (config.disableAllExtensions !== undefined) {
    disableAllExtensions = config.disableAllExtensions;
  }

  return {
    extensionDevelopmentPath,
    workspacePath,
    initWorkspace,
    mochaConfigPath,
    nycConfigPath,
    userDataDir,
    vscodeVersion: config.vscodeVersion,
    additionalExtensionFolders,
    uninstallExtensionIDs: config.uninstallExtensionIDs,
    disabledExtensionIDs: config.disabledExtensionIDs,
    disableAllExtensions,
  };
}

export function toLowerDriveLetter(path: string): string {
  if (process.platform === "win32" && /^[A-Z]:/.test(path)) {
    return path[0].toLowerCase() + path.substring(1);
  }
  return path;
}

export async function runVSCodeTests(
  isCoverage: boolean,
  config: ResolvedConfiguration
): Promise<void> {
  let workspaceFileToDelete: string | undefined = undefined;
  try {
    const vscodeExecutablePath = await downloadAndUnzipVSCode(
      config.vscodeVersion
    );

    await installExtensions(
      vscodeExecutablePath,
      config.userDataDir,
      config.uninstallExtensionIDs,
      config.additionalExtensionFolders
    );

    // Set environment variables.
    // We have to use env variables to pass parameters to the code that actually runs the tests,
    // because it's run from inside vscode and doesn't share the same memory space (or cwd) as this file.
    const extensionTestsEnv: { [key: string]: string } = {};

    // vscode API Uri.fsPath converts drive letters to lowercase. To make things simpler in tests,
    // we have to set the cwd of mocha and nyc (which must be exactly the same) to lowercase as well.
    const testsCwd = toLowerDriveLetter(config.extensionDevelopmentPath);
    extensionTestsEnv[ENV_VAR_MOCHA_CWD] = testsCwd;
    extensionTestsEnv[ENV_VAR_MOCHA_CONFIG_PATH] = config.mochaConfigPath;

    if (isCoverage) {
      extensionTestsEnv[ENV_VAR_NYC_CWD] = testsCwd;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- when isCoverage is true, config.nycConfigPath is not undefined. This is esnsured in the validation.
      extensionTestsEnv[ENV_VAR_NYC_CONFIG_PATH] = config.nycConfigPath!;
    }

    let extensionTestsPath = resolve(__dirname, "mocha-tests");
    if (isCoverage) {
      extensionTestsEnv[ENV_VAR_BASE_TEST_PATH] = extensionTestsPath;
      extensionTestsPath = resolve(__dirname, "nyc-coverage");
    }

    if (config.initWorkspace) {
      // Start with an empty workspace
      await mkdirs(dirname(config.workspacePath));
      await writeJson(config.workspacePath, { folders: [] });
      workspaceFileToDelete = config.workspacePath;
    }

    const launchArgs = [config.workspacePath];

    if (config.userDataDir !== undefined) {
      launchArgs.push(USER_DATA_DIR_PARAM, config.userDataDir);
    }

    if (config.disabledExtensionIDs !== undefined) {
      for (const disabledExtensionID of config.disabledExtensionIDs) {
        launchArgs.push("--disable-extension", disabledExtensionID);
      }
    }

    if (config.disableAllExtensions) {
      launchArgs.push("--disable-extensions");
    }

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: config.extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      extensionTestsEnv,
    });
  } finally {
    if (workspaceFileToDelete !== undefined) {
      try {
        await unlink(workspaceFileToDelete);
      } catch (e) /* istanbul ignore next -- defensive programming, this should not happen since we created the file */ {
        console.error(
          `Could not delete workspace file at path ${workspaceFileToDelete}`,
          e
        );
      }
    }
  }
}

async function installExtensions(
  vscodeExecutablePath: string,
  userDataDir: string | undefined,
  uninstallExtensionIDs: string[] | undefined,
  installExtensionFolders: string[] | undefined
): Promise<void> {
  if (
    (installExtensionFolders === undefined ||
      installExtensionFolders.length === 0) &&
    (uninstallExtensionIDs === undefined || uninstallExtensionIDs.length === 0)
  ) {
    return;
  }
  const uninstallArgs = [];

  const uninstallExtensionIDsArray = uninstallExtensionIDs ?? [];
  for (const uninstallExtensionID of uninstallExtensionIDsArray) {
    uninstallArgs.push("--uninstall-extension", uninstallExtensionID);
  }

  // Find the vsix files to install
  const installExtensionFoldersArray = installExtensionFolders ?? [];
  const installArgs = await getInstallArgsFromInstallationFolders(
    installExtensionFoldersArray
  );

  installArgs.push("--force");
  uninstallArgs.push("--force");
  if (userDataDir !== undefined) {
    installArgs.push(USER_DATA_DIR_PARAM, userDataDir);
    uninstallArgs.push(USER_DATA_DIR_PARAM, userDataDir);
  }

  const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

  // Uninstall the dependencies with "code --uninstall-extension ..."
  if (uninstallExtensionIDsArray.length > 0) {
    spawnSync(cliPath, uninstallArgs, {
      encoding: "utf-8",
      stdio: "inherit",
      env: process.env,
    });
  }

  // Install the dependencies with "code --install-extension ..."
  if (installExtensionFoldersArray.length > 0) {
    const installResult = spawnSync(cliPath, installArgs, {
      encoding: "utf-8",
      env: process.env,
    });
    // The install command does not return an error when failed. The only way we can know it failed is to check
    // the stderr. To get it we must pipe the output instead of inheriting it.
    // Print the output from the installation process
    console.log(installResult.stdout);
    console.error(installResult.stderr);
    // Check if the installation failed.
    // Example output for failed installation:
    // Please restart VS Code before reinstalling <extension name>.
    // Failed Installing Extensions: <vsix path>
    if (
      installResult.stderr !== undefined &&
      installResult.stderr.includes("Failed") &&
      installResult.stderr.includes("restart")
    ) {
      // Retry - since vscode version 1.53, installation fails the first time if the extension is already installed
      // and it doesn't help to run uninstall first
      console.log("Retrying installation...");
      spawnSync(cliPath, installArgs, {
        encoding: "utf-8",
        stdio: "inherit",
        env: process.env,
      });
    }
  }
}

async function getInstallArgsFromInstallationFolders(
  installExtensionFoldersArray: string[]
): Promise<string[]> {
  const installArgs = [];
  for (const vsixFolder of installExtensionFoldersArray) {
    // Find the vsix file in the folder
    if (!(await pathExists(vsixFolder))) {
      throw new Error(
        `Folder ${vsixFolder} which contains *.vsix dependencies does not exist`
      );
    }
    const files = await readdir(vsixFolder);
    const vsixFiles = filter(files, (fileName) => fileName.endsWith(".vsix"));
    if (vsixFiles.length === 0) {
      throw new Error(`Could not find *.vsix files in ${vsixFolder}`);
    }
    for (const vsixFile of vsixFiles) {
      installArgs.push("--install-extension", join(vsixFolder, vsixFile));
    }
  }
  return installArgs;
}
