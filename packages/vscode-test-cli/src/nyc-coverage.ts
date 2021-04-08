import { isFunction, isPlainObject } from "lodash";
import {
  ENV_VAR_NYC_CWD,
  ENV_VAR_NYC_CONFIG_PATH,
  ENV_VAR_BASE_TEST_PATH,
} from "./constants";

// nyc doesn't have type definitions, but this is what we expect
export type Nyc = {
  new (args: unknown): Nyc;
  writeProcessIndex(): Promise<void>;
  writeCoverageFile(): void;
  reset(): Promise<void>;
  addAllFiles(): Promise<void>;
  wrap(): void;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires -- nyc doesn't have type definitions
const Nyc = require("nyc") as Nyc;

async function setupCoverage(): Promise<Nyc> {
  const nycCwd = process.env[ENV_VAR_NYC_CWD];
  const nyConfigPath = process.env[ENV_VAR_NYC_CONFIG_PATH];
  if (nyConfigPath === undefined || nycCwd === undefined) {
    throw new Error(
      `The following environment variables must be defined for nyc: ${ENV_VAR_NYC_CWD}, ${ENV_VAR_NYC_CONFIG_PATH}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires -- we can't use import to require a js configuration file
  const nycConfig = require(nyConfigPath) as Record<string, unknown>;

  const nyc = new Nyc({
    ...nycConfig,
    cwd: nycCwd,
    // Integrate with vs code
    instrument: true,
    hookRequire: true,
    hookRunInContext: true,
    hookRunInThisContext: true,
  });

  await nyc.reset();
  if (nycConfig.all === true) {
    await nyc.addAllFiles();
  }

  nyc.wrap();

  return nyc;
}

export async function run(): Promise<void> {
  try {
    const baseRunPath = process.env[ENV_VAR_BASE_TEST_PATH];
    if (baseRunPath === undefined) {
      throw new Error(
        `The following environment variable must be defined for coverage: ${ENV_VAR_BASE_TEST_PATH}`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires -- we have to use require to import arbitrary modules
    const baseRunImport = require(baseRunPath) as unknown;
    if (!isPlainObject(baseRunImport)) {
      throw new Error(`The import result of ${baseRunPath} must be an object`);
    }
    const baseRunImportObj = baseRunImport as Record<string, unknown>;
    if (!isFunction(baseRunImportObj.run)) {
      throw new Error(`${baseRunPath} must export a "run" function`);
    }

    const nyc = await setupCoverage();
    try {
      await baseRunImportObj.run();
    } finally {
      // Write coverage files
      await nyc.writeProcessIndex();
      nyc.writeCoverageFile();

      // Note: we cannot write the text report here because it prints to process.stdout
      // which is not visible for this process (vscode started from typescript).
      // The reports and check for coverage thresholds is done in npm script "report-coverage".
    }
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- e should be an Error
    console.log(e.message);
    throw e;
  }
}
