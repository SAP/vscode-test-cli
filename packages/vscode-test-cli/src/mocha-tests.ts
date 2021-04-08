import { resolve } from "path";
import * as Mocha from "mocha";
import * as glob from "glob";
import { isArray } from "lodash";
import { ENV_VAR_MOCHA_CONFIG_PATH, ENV_VAR_MOCHA_CWD } from "./constants";

export async function run(): Promise<void> {
  try {
    const mochaCwd = process.env[ENV_VAR_MOCHA_CWD];
    const configPath = process.env[ENV_VAR_MOCHA_CONFIG_PATH];
    if (configPath === undefined || mochaCwd === undefined) {
      throw new Error(
        `The following environment variables must be defined for mocha tests: ${ENV_VAR_MOCHA_CWD}, ${ENV_VAR_MOCHA_CONFIG_PATH}`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires -- we have to use require to read config files
    const config = require(configPath) as Record<string, unknown>;

    // Handle special properties from config file
    const globPattern = handleSpec(config);
    handleRequire(config);

    await runMocha(globPattern, config, mochaCwd);
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- e should be an Error
    console.error(e.message);
    throw e;
  }
}

function handleSpec(config: Record<string, unknown>): string {
  // Get the spec glob pattern from the config file
  // (it is not part of the parameters supported by the Mocha constructor, but it's supported in the mocha config file)
  const spec = config.spec;
  if (typeof spec !== "string") {
    throw new Error(
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands -- concatenating to get the string representation of the value
      "spec property in Mocha configuration must be a string. Unexpected value: " +
        spec
    );
  }
  delete config.spec;
  return spec;
}

function handleRequire(config: Record<string, unknown>): void {
  let requireModules = config.require;
  delete config.require;
  if (typeof requireModules === "string") {
    requireModules = [requireModules];
  }
  if (isArray(requireModules)) {
    for (const module of requireModules) {
      if (typeof module !== "string") {
        throw new Error(
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands -- concatenating to get the string representation of the vallue
          "require property in Mocha configuration must be a string or array of strings. Unexpected value: " +
            module
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- we have to use require to import arbitrary modules
      require(module);
    }
  }
}

async function runMocha(
  globPattern: string,
  config: Record<string, unknown>,
  mochaCwd: string
): Promise<void> {
  const mocha = new Mocha(config);
  return new Promise<void>((resolvePromise, rejectPromise) => {
    glob(globPattern, { cwd: mochaCwd }, (err, files) => {
      // istanbul ignore next -- this only happens when the OS returns some error in special cases like network shares
      if (err !== null) {
        rejectPromise(err);
        return;
      }

      files.forEach((f) => mocha.addFile(resolve(mochaCwd, f)));

      try {
        mocha.run((failures) => {
          if (failures > 0) {
            rejectPromise(new Error(`${failures} tests failed.`));
          } else {
            resolvePromise();
          }
        });
      } catch (err) {
        rejectPromise(err);
      }
    });
  });
}
