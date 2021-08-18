import { expect, use } from "chai";
import * as sinon from "sinon";
import { join, resolve, extname } from "path";
import {
  readCommandLineParameters,
  readConfiguration,
  ResolvedConfiguration,
  toLowerDriveLetter,
  validateAndResolveConfiguration,
} from "../src/vscode-tests";
import { mkdirp, pathExists, readJson, writeFile, writeJson } from "fs-extra";
import { cosmiconfig } from "cosmiconfig";
import * as proxyquire from "proxyquire";
import * as chaiAsPromised from "chai-as-promised";
import { Configuration } from "..";
import {
  ENV_VAR_BASE_TEST_PATH,
  ENV_VAR_MOCHA_CONFIG_PATH,
  ENV_VAR_MOCHA_CWD,
  ENV_VAR_NYC_CONFIG_PATH,
  ENV_VAR_NYC_CWD,
} from "../src/constants";
import { PathRemover, SinonStubType } from "./test-utils";

use(chaiAsPromised);
type VSCodeTestsType = typeof import("../src/vscode-tests");
type VSCodeTestLibType = typeof import("@vscode/test-electron");

describe("vscode-tests", () => {
  const pathsRemover = new PathRemover();
  afterEach(async () => {
    await pathsRemover.remove();
  });

  describe("readCommandLineParameters", () => {
    it("returns the default values when no arguments are specified", () => {
      expect(readCommandLineParameters([])).to.deep.equal({
        configPath: undefined,
        isCoverage: false,
      });
    });

    it("returns the config path when specified", () => {
      expect(
        readCommandLineParameters(["--config", "some/path"])
      ).to.deep.equal({ configPath: "some/path", isCoverage: false });
    });

    it("returns the coverage when specified", () => {
      expect(readCommandLineParameters(["--coverage"])).to.deep.equal({
        configPath: undefined,
        isCoverage: true,
      });
    });

    it("returns both config and coverage", () => {
      expect(
        readCommandLineParameters(["--config", "some/path", "--coverage"])
      ).to.deep.equal({ configPath: "some/path", isCoverage: true });
    });
  });

  describe("readConfiguration", () => {
    const configPath = join(__dirname, "config.json");
    beforeEach(() => {
      pathsRemover.add(configPath);
    });

    afterEach(() => {
      sinon.restore();
    });

    it("returns the configuration from the specified path when sent", async () => {
      const configObj = { someProp: "someValue" };
      await writeJson(configPath, configObj);

      const result = await readConfiguration(configPath);

      expect(result).to.deep.equal({
        config: configObj,
        filepath: configPath,
      });
    });

    it("returns the configuration from cosmiconfig when path is not sent", async () => {
      const explorer = cosmiconfig("vscode-test-cli");
      const configObj = { someProp: "someValue" };
      sinon.stub(explorer, "search").resolves({
        config: configObj,
        filepath: configPath,
      });
      const { readConfiguration } = proxyquire(
        require.resolve("../src/vscode-tests"),
        {
          cosmiconfig: {
            cosmiconfig: () => explorer,
          },
        }
      ) as VSCodeTestsType;

      const result = await readConfiguration(undefined);

      expect(result).to.deep.equal({
        config: configObj,
        filepath: configPath,
      });
    });

    it("throws an error when config is sent and not found", async () => {
      await expect(readConfiguration(configPath)).to.be.rejectedWith(Error);
    });

    it("throws an error when config is not sent and not found", async () => {
      const explorer = cosmiconfig("vscode-test-cli");
      sinon.stub(explorer, "search").resolves(null);
      const { readConfiguration } = proxyquire(
        require.resolve("../src/vscode-tests"),
        {
          cosmiconfig: {
            cosmiconfig: () => explorer,
          },
        }
      ) as VSCodeTestsType;

      await expect(readConfiguration(undefined)).to.be.rejectedWith(
        /No configuration file found/
      );
    });
  });

  describe("validateAndResolveConfiguration", () => {
    const configPath = join(__dirname, "config.json");
    let baseValidConfig: Configuration;
    let baseValidCoverageConfig: Configuration;

    beforeEach(() => {
      baseValidConfig = {
        mochaConfigPath: "mocha.config.js",
      };

      baseValidCoverageConfig = {
        ...baseValidConfig,
        nycConfigPath: "nyc.config.js",
      };
    });

    it("validates and resolves a minimal valid config file with default values", async () => {
      const resolved = await validateAndResolveConfiguration(
        configPath,
        baseValidConfig,
        false
      );
      const expected: ResolvedConfiguration = {
        mochaConfigPath: join(__dirname, "mocha.config.js"),
        disableAllExtensions: true,
        extensionDevelopmentPath: __dirname,
        initWorkspace: true,
        workspacePath: join(__dirname, "test.code-workspace"),
        additionalExtensionFolders: undefined,
        disabledExtensionIDs: undefined,
        nycConfigPath: undefined,
        uninstallExtensionIDs: undefined,
        userDataDir: undefined,
        vscodeVersion: undefined,
      };
      expect(resolved).to.deep.equal(expected);
    });

    it("validates and resolves a minimal valid config file with default values when coverage is true", async () => {
      const resolved = await validateAndResolveConfiguration(
        configPath,
        baseValidCoverageConfig,
        true
      );
      const expected: ResolvedConfiguration = {
        mochaConfigPath: join(__dirname, "mocha.config.js"),
        nycConfigPath: join(__dirname, "nyc.config.js"),
        disableAllExtensions: true,
        extensionDevelopmentPath: __dirname,
        initWorkspace: true,
        workspacePath: join(__dirname, "test.code-workspace"),
        additionalExtensionFolders: undefined,
        disabledExtensionIDs: undefined,
        uninstallExtensionIDs: undefined,
        userDataDir: undefined,
        vscodeVersion: undefined,
      };
      expect(resolved).to.deep.equal(expected);
    });

    context("required properties", () => {
      const requiredProps: (keyof Configuration)[] = ["mochaConfigPath"];
      for (const prop of requiredProps) {
        it(`throws an error when ${prop} is missing in the configuration`, async () => {
          const configWithoutProp = baseValidConfig;
          delete configWithoutProp[prop];
          await expect(
            validateAndResolveConfiguration(
              configPath,
              configWithoutProp,
              false
            )
          ).to.be.rejectedWith(prop);
        });
      }

      const requiredPropsForCoverage = ["nycConfigPath"] as const;
      for (const prop of requiredPropsForCoverage) {
        it(`throws an error when ${prop} is missing in the configuration and coverage is true`, async () => {
          const configWithoutProp = baseValidCoverageConfig;
          delete configWithoutProp[prop];
          await expect(
            validateAndResolveConfiguration(configPath, configWithoutProp, true)
          ).to.be.rejectedWith(prop);
        });
      }
    });

    context("boolean properties", () => {
      const booleanProps = ["disableAllExtensions", "initWorkspace"] as const;
      for (const prop of booleanProps) {
        it(`throws an error when ${prop} type is not a boolean`, async () => {
          const configWithBadProp = baseValidCoverageConfig;
          (configWithBadProp[prop] as unknown) = "not a boolean";
          await expect(
            validateAndResolveConfiguration(configPath, configWithBadProp, true)
          ).to.be.rejectedWith(prop);
        });
      }
    });

    context("string properties", () => {
      const stringProps = [
        "mochaConfigPath",
        "extensionDevelopmentPath",
        "nycConfigPath",
        "userDataDir",
        "vscodeVersion",
        "workspacePath",
      ] as const;
      for (const prop of stringProps) {
        it(`throws an error when ${prop} type is not string`, async () => {
          const configWithBadProp = baseValidCoverageConfig;
          (configWithBadProp[prop] as unknown) = true;
          await expect(
            validateAndResolveConfiguration(configPath, configWithBadProp, true)
          ).to.be.rejectedWith(prop);
        });
      }
    });

    context("pass-through string properties", () => {
      const passThroughStringProps = ["vscodeVersion"] as const;
      for (const prop of passThroughStringProps) {
        it(`returns the same value when ${prop} type is string`, async () => {
          baseValidCoverageConfig[prop] = "some value";
          const resolved = await validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            false
          );
          expect(resolved[prop]).to.equal("some value");
        });
      }
    });

    context("path properties", () => {
      const pathProps = [
        "userDataDir",
        "mochaConfigPath",
        "nycConfigPath",
        "extensionDevelopmentPath",
      ] as const;
      for (const prop of pathProps) {
        it(`returns the resolved path when ${prop} type is string`, async () => {
          baseValidCoverageConfig[prop] = "somePath";
          const resolved = await validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            true
          );
          expect(resolved[prop]).to.equal(join(__dirname, "somePath"));
        });
      }

      it("returns undefined for nycConfigPath when coverage is false", async () => {
        baseValidCoverageConfig.nycConfigPath = "somePath";
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.nycConfigPath).to.be.undefined;
      });
    });

    context("string array properties", () => {
      const stringArrayProps = [
        "additionalExtensionFolders",
        "disabledExtensionIDs",
        "uninstallExtensionIDs",
      ] as const;
      for (const prop of stringArrayProps) {
        it(`throws an error when ${prop} type is not a string array`, async () => {
          const configWithBadProp = baseValidCoverageConfig;
          (configWithBadProp[prop] as unknown) = "not an array";
          await expect(
            validateAndResolveConfiguration(configPath, configWithBadProp, true)
          ).to.be.rejectedWith(prop);
        });

        it(`throws an error when ${prop} contains a value which is not a string`, async () => {
          const configWithBadProp = baseValidCoverageConfig;
          (configWithBadProp[prop] as unknown) = ["string value", 2];
          await expect(
            validateAndResolveConfiguration(configPath, configWithBadProp, true)
          ).to.be.rejectedWith(prop);
        });
      }
    });

    context("pass-through string array properties", () => {
      const passThroughStringProps = [
        "uninstallExtensionIDs",
        "disabledExtensionIDs",
      ] as const;
      for (const prop of passThroughStringProps) {
        it(`returns the same value when ${prop} type is a string array`, async () => {
          baseValidCoverageConfig[prop] = ["first value", "second.value"];
          const resolved = await validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            false
          );
          expect(resolved[prop]).to.deep.equal(["first value", "second.value"]);
        });
      }
    });

    context("path array properties", () => {
      const pathProps = ["additionalExtensionFolders"] as const;
      for (const prop of pathProps) {
        it(`returns the resolved paths when ${prop} type is string array`, async () => {
          baseValidCoverageConfig[prop] = ["somePath", ".."];
          const resolved = await validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            true
          );
          expect(resolved[prop]).to.deep.equal([
            join(__dirname, "somePath"),
            resolve(__dirname, ".."),
          ]);
        });
      }

      it("returns undefined for nycConfigPath when coverage is false", async () => {
        baseValidCoverageConfig.nycConfigPath = "somePath";
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.nycConfigPath).to.be.undefined;
      });
    });

    describe("workspacePath", () => {
      it("is resolved to a folder when the folder exists", async () => {
        baseValidCoverageConfig.workspacePath = ".";
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.workspacePath).to.equal(__dirname);
      });

      it("is resolved to a vscode workspace file", async () => {
        baseValidCoverageConfig.workspacePath = join(
          "..",
          "someWorkspace.code-workspace"
        );
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.workspacePath).to.equal(
          resolve(__dirname, "..", "someWorkspace.code-workspace")
        );
      });

      it("throws an error when it is not a vscode workspace file or existing folder", async () => {
        baseValidCoverageConfig.workspacePath = "unknownPath";
        await expect(
          validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            false
          )
        ).to.be.rejectedWith("workspacePath");
      });
    });

    describe("initWorkspace", () => {
      it("is true by default when workspacePath is a non-existing workspace file", async () => {
        baseValidCoverageConfig.workspacePath = join(
          "..",
          "someWorkspace.code-workspace"
        );
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.initWorkspace).to.equal(true);
      });

      it("is false by default when workspacePath is an existing workspace file", async () => {
        baseValidCoverageConfig.workspacePath = join(
          "..",
          "someWorkspace.code-workspace"
        );
        pathsRemover.add(
          resolve(__dirname, baseValidCoverageConfig.workspacePath)
        );
        await writeJson(
          resolve(__dirname, baseValidCoverageConfig.workspacePath),
          { folders: [] }
        );

        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.initWorkspace).to.equal(false);
      });

      it("is false by default when workspacePath is an existing folder", async () => {
        baseValidCoverageConfig.workspacePath = ".";
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.initWorkspace).to.equal(false);
      });

      it("is resolved to true when set to true and workspacePath is an existing workspace file", async () => {
        baseValidCoverageConfig.workspacePath = join(
          "..",
          "someWorkspace.code-workspace"
        );
        pathsRemover.add(
          resolve(__dirname, baseValidCoverageConfig.workspacePath)
        );
        await writeJson(
          resolve(__dirname, baseValidCoverageConfig.workspacePath),
          { folders: [] }
        );
        baseValidCoverageConfig.initWorkspace = true;

        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.initWorkspace).to.equal(true);
      });

      it("is resolved to false when set to false and workspacePath is a non-existing workspace file", async () => {
        baseValidCoverageConfig.workspacePath = join(
          "..",
          "someWorkspace.code-workspace"
        );
        baseValidCoverageConfig.initWorkspace = false;

        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.initWorkspace).to.equal(false);
      });

      it("throws an error when set to true and workspacePath is an existing folder", async () => {
        baseValidCoverageConfig.workspacePath = ".";
        baseValidCoverageConfig.initWorkspace = true;
        await expect(
          validateAndResolveConfiguration(
            configPath,
            baseValidCoverageConfig,
            false
          )
        ).to.be.rejectedWith("initWorkspace");
      });
    });

    describe("disableAllExtensions", () => {
      it("is true by default when additionalExtensionFolders is empty", async () => {
        baseValidCoverageConfig.additionalExtensionFolders = [];
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.disableAllExtensions).to.equal(true);
      });

      it("is false by default when additionalExtensionFolders is not empty", async () => {
        baseValidCoverageConfig.additionalExtensionFolders = ["."];
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.disableAllExtensions).to.equal(false);
      });

      it("is resolved to true when set to true and additionalExtensionFolders is not empty", async () => {
        baseValidCoverageConfig.additionalExtensionFolders = ["."];
        baseValidCoverageConfig.disableAllExtensions = true;
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.disableAllExtensions).to.equal(true);
      });

      it("is resolved to false when set to false and additionalExtensionFolders is empty", async () => {
        baseValidCoverageConfig.additionalExtensionFolders = [];
        baseValidCoverageConfig.disableAllExtensions = false;
        const resolved = await validateAndResolveConfiguration(
          configPath,
          baseValidCoverageConfig,
          false
        );
        expect(resolved.disableAllExtensions).to.equal(false);
      });
    });
  });

  describe("runVSCodeTests", () => {
    let runVSCodeTests: VSCodeTestsType["runVSCodeTests"];

    let resolveCliPathFromVSCodeExecutablePathStub: SinonStubType<
      VSCodeTestLibType["resolveCliPathFromVSCodeExecutablePath"]
    >;
    let downloadAndUnzipVSCodeStub: SinonStubType<
      VSCodeTestLibType["downloadAndUnzipVSCode"]
    >;
    let runTestsStub: SinonStubType<VSCodeTestLibType["runTests"]>;
    let spawnSyncStub: SinonStubType<typeof import("child_process").spawnSync>;

    const mochaTestsPath = removeExtension(
      require.resolve("../src/mocha-tests")
    );
    const nycCoveragePath = removeExtension(
      require.resolve("../src/nyc-coverage")
    );

    beforeEach(() => {
      resolveCliPathFromVSCodeExecutablePathStub = sinon.stub();
      downloadAndUnzipVSCodeStub = sinon.stub();
      runTestsStub = sinon.stub();
      spawnSyncStub = sinon.stub();
      runVSCodeTests = (proxyquire(require.resolve("../src/vscode-tests"), {
        "@vscode/test-electron": {
          resolveCliPathFromVSCodeExecutablePath: resolveCliPathFromVSCodeExecutablePathStub,
          downloadAndUnzipVSCode: downloadAndUnzipVSCodeStub,
          runTests: runTestsStub,
        },
        child_process: {
          spawnSync: spawnSyncStub,
        },
      }) as VSCodeTestsType).runVSCodeTests;
    });

    afterEach(() => {
      sinon.restore();
    });

    function getSpawnSyncResult(): ReturnType<typeof spawnSyncStub> {
      return {
        pid: 0,
        output: [],
        signal: null,
        status: null,
        stderr: Buffer.from(""),
        stdout: Buffer.from(""),
      };
    }

    function removeExtension(path: string): string {
      return path.substr(0, path.length - extname(path).length);
    }

    it("runs mocha tests in the specified workspace and doesn't create it when initWorkspace is false", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      // Ensure we don't initialize the workspace file when initWorkspace is false
      runTestsStub.callsFake(async () => {
        expect(
          await pathExists(workspacePath),
          "workspace file exists during runTests"
        ).to.be.false;
        return 0;
      });

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: false,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("runs mocha tests with cwd starting with lowercase on Windows", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());
      runTestsStub.resolves(0);

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      sinon.stub(process, "platform").value("win32");

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: false,
        extensionDevelopmentPath: `C:\\some\\path`,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: `C:\\some\\path`,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: `c:\\some\\path`,
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("runs mocha tests without changing the cwd on Linux", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());
      runTestsStub.resolves(0);

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      sinon.stub(process, "platform").value("linux");

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: false,
        extensionDevelopmentPath: `C:\\some\\path`,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: `C:\\some\\path`,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: `C:\\some\\path`,
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    context("coverage is true", () => {
      it("runs nyc with mocha tests", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const nycConfigPath = join(__dirname, "nyc.js");

        await runVSCodeTests(true, {
          workspacePath,
          mochaConfigPath,
          nycConfigPath,
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: nycCoveragePath,
            launchArgs: [workspacePath],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
              [ENV_VAR_BASE_TEST_PATH]: mochaTestsPath,
              [ENV_VAR_NYC_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_NYC_CONFIG_PATH]: nycConfigPath,
            },
          },
        ]);

        // Check we didn't perform unnecessary calls
        expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
      });

      it("runs nyc with mocha tests with cwd starting with lowercase on Windows", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const nycConfigPath = join(__dirname, "nyc.js");

        sinon.stub(process, "platform").value("win32");

        await runVSCodeTests(true, {
          workspacePath,
          mochaConfigPath,
          nycConfigPath,
          initWorkspace: false,
          extensionDevelopmentPath: `C:\\some\\path`,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: `C:\\some\\path`,
            extensionTestsPath: nycCoveragePath,
            launchArgs: [workspacePath],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: `c:\\some\\path`,
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
              [ENV_VAR_BASE_TEST_PATH]: mochaTestsPath,
              [ENV_VAR_NYC_CWD]: `c:\\some\\path`,
              [ENV_VAR_NYC_CONFIG_PATH]: nycConfigPath,
            },
          },
        ]);

        // Check we didn't perform unnecessary calls
        expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
      });
    });

    it("creates workspace file when initWorkspace is true and deletes it at the end", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      let workspaceFileContent: unknown;
      runTestsStub.callsFake(async () => {
        expect(
          await pathExists(workspacePath),
          "workspace file exists during runTests"
        ).to.be.true;
        workspaceFileContent = await readJson(workspacePath);
        return 0;
      });

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: true,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check the workspace file was created with the correct parameters
      expect(workspaceFileContent, "workspace file content").to.deep.equal({
        folders: [],
      });

      // Check the workspace file was deleted
      expect(await pathExists(workspacePath), "workspace file exists").to.be
        .false;

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("doesn't delete an existing workspace file when initWorkspace is false", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");
      pathsRemover.add(workspacePath);
      await writeJson(workspacePath, { prop1: "value1" });

      runTestsStub.callsFake(async () => {
        expect(
          await pathExists(workspacePath),
          "workspace file exists during runTests"
        ).to.be.true;
        return 0;
      });

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: false,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check the workspace file was not deleted or changed
      expect(await pathExists(workspacePath), "workspace file exists").to.be
        .true;
      const workspaceFileContent: unknown = await readJson(workspacePath);
      expect(workspaceFileContent, "workspace file content").to.deep.equal({
        prop1: "value1",
      });

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("runs tests in userDataDir when sent", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());
      runTestsStub.resolves(0);

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");
      const userDataDir = join(__dirname, "someDir");

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        userDataDir,
        initWorkspace: false,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath, "--user-data-dir", userDataDir],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("disables all extensions when disableAllExtensions is true", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());
      runTestsStub.resolves(0);

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        initWorkspace: false,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: true,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [workspacePath, "--disable-extensions"],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    it("disables the extensions sent in disabledExtensionIDs", async () => {
      downloadAndUnzipVSCodeStub.resolves("vscode-path");
      resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
      spawnSyncStub.returns(getSpawnSyncResult());
      runTestsStub.resolves(0);

      const workspacePath = join(__dirname, "some.code-workspace");
      const mochaConfigPath = join(__dirname, "mocha.js");

      await runVSCodeTests(false, {
        workspacePath,
        mochaConfigPath,
        disabledExtensionIDs: ["my.ext", "my.ext2"],
        initWorkspace: false,
        extensionDevelopmentPath: __dirname,
        disableAllExtensions: false,
      });

      // Check we ran the tests with the expected parameters
      expect(runTestsStub.callCount, "runTests call count").to.equal(1);
      expect(runTestsStub.firstCall.args).to.deep.equal([
        {
          vscodeExecutablePath: "vscode-path",
          extensionDevelopmentPath: __dirname,
          extensionTestsPath: mochaTestsPath,
          launchArgs: [
            workspacePath,
            "--disable-extension",
            "my.ext",
            "--disable-extension",
            "my.ext2",
          ],
          extensionTestsEnv: {
            [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
            [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
          },
        },
      ]);

      // Check we didn't perform unnecessary calls
      expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
    });

    context("install/uninstall extensions", () => {
      it("installs the vsix files from additionalExtensionFolders in userDataDir before running the tests", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const userDataDir = join(__dirname, "userData");

        const additionalFolder1 = join(__dirname, "additionalFolder1");
        const additionalFolder2 = join(__dirname, "additionalFolder2");
        pathsRemover.add(additionalFolder1, additionalFolder2);

        await mkdirp(additionalFolder1);
        await mkdirp(additionalFolder2);
        const firstExt = join(additionalFolder1, "first.vsix");
        const secondExt = join(additionalFolder2, "second.vsix");
        const thirdExt = join(additionalFolder2, "third.vsix");
        for (const extPath of [firstExt, secondExt, thirdExt]) {
          await writeFile(extPath, "extension file content");
        }

        await runVSCodeTests(false, {
          workspacePath,
          mochaConfigPath,
          userDataDir,
          additionalExtensionFolders: [additionalFolder1, additionalFolder2],
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: mochaTestsPath,
            launchArgs: [workspacePath, "--user-data-dir", userDataDir],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
            },
          },
        ]);

        // Check we performed the install/uninstall calls
        expect(spawnSyncStub.callCount, "spawnSync call count").to.equal(1);
        expect(spawnSyncStub.firstCall.args[0], "spawnSync first arg").to.equal(
          "vscode-cli-path"
        );
        expect(
          spawnSyncStub.firstCall.args[1],
          "spawnSync second arg"
        ).to.deep.equal([
          "--install-extension",
          firstExt,
          "--install-extension",
          secondExt,
          "--install-extension",
          thirdExt,
          "--force",
          "--user-data-dir",
          userDataDir,
        ]);

        // Check the calls were performed in the expected order
        sinon.assert.callOrder(spawnSyncStub, runTestsStub);
      });

      it("retries to installs the vsix files from additionalExtensionFolders if installation failed", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        const failedSpawnSyncResult = {
          pid: 0,
          output: [],
          signal: null,
          status: null,
          stderr: Buffer.from(
            "Installing extensions...\nPlease restart VS Code before reinstalling MyExtension.\nFailed Installing Extensions: /the/extensions/path.vsix"
          ),
          stdout: Buffer.from(""),
        };
        spawnSyncStub.onFirstCall().returns(failedSpawnSyncResult);
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const userDataDir = join(__dirname, "userData");

        const additionalFolder1 = join(__dirname, "additionalFolder1");
        pathsRemover.add(additionalFolder1);

        await mkdirp(additionalFolder1);
        const firstExt = join(additionalFolder1, "first.vsix");
        for (const extPath of [firstExt]) {
          await writeFile(extPath, "extension file content");
        }

        await runVSCodeTests(false, {
          workspacePath,
          mochaConfigPath,
          userDataDir,
          additionalExtensionFolders: [additionalFolder1],
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: mochaTestsPath,
            launchArgs: [workspacePath, "--user-data-dir", userDataDir],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
            },
          },
        ]);

        // Check we performed the install/uninstall calls
        expect(spawnSyncStub.callCount, "spawnSync call count").to.equal(2);
        expect(spawnSyncStub.firstCall.args[0], "spawnSync first arg").to.equal(
          "vscode-cli-path"
        );
        expect(
          spawnSyncStub.firstCall.args[1],
          "spawnSync second arg"
        ).to.deep.equal([
          "--install-extension",
          firstExt,
          "--force",
          "--user-data-dir",
          userDataDir,
        ]);

        // Check the second call is performed with the same parameters
        expect(
          spawnSyncStub.secondCall.args[0],
          "spawnSync first arg"
        ).to.equal("vscode-cli-path");
        expect(
          spawnSyncStub.secondCall.args[1],
          "spawnSync second arg"
        ).to.deep.equal([
          "--install-extension",
          firstExt,
          "--force",
          "--user-data-dir",
          userDataDir,
        ]);

        // Check the calls were performed in the expected order
        sinon.assert.callOrder(spawnSyncStub, spawnSyncStub, runTestsStub);
      });

      it("uninstalls the extensions from uninstallExtensionIDs in userDataDir when there are no new extensions to install", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const userDataDir = join(__dirname, "userData");

        await runVSCodeTests(false, {
          workspacePath,
          mochaConfigPath,
          userDataDir,
          uninstallExtensionIDs: ["my.ext", "my.ext2"],
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: mochaTestsPath,
            launchArgs: [workspacePath, "--user-data-dir", userDataDir],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
            },
          },
        ]);

        // Check we performed the install/uninstall calls
        expect(spawnSyncStub.callCount, "spawnSync call count").to.equal(1);
        expect(spawnSyncStub.firstCall.args[0], "spawnSync first arg").to.equal(
          "vscode-cli-path"
        );
        expect(
          spawnSyncStub.firstCall.args[1],
          "spawnSync second arg"
        ).to.deep.equal([
          "--uninstall-extension",
          "my.ext",
          "--uninstall-extension",
          "my.ext2",
          "--force",
          "--user-data-dir",
          userDataDir,
        ]);

        // Check the calls were performed in the expected order
        sinon.assert.callOrder(spawnSyncStub, runTestsStub);
      });

      it("uninstalls the extensions from uninstallExtensionIDs before installing new extensions", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");

        const additionalFolder1 = join(__dirname, "additionalFolder1");
        const additionalFolder2 = join(__dirname, "additionalFolder2");
        pathsRemover.add(additionalFolder1, additionalFolder2);

        await mkdirp(additionalFolder1);
        await mkdirp(additionalFolder2);
        const firstExt = join(additionalFolder1, "first.vsix");
        const secondExt = join(additionalFolder2, "second.vsix");
        const thirdExt = join(additionalFolder2, "third.vsix");
        for (const extPath of [firstExt, secondExt, thirdExt]) {
          await writeFile(extPath, "extension file content");
        }

        await runVSCodeTests(false, {
          workspacePath,
          mochaConfigPath,
          additionalExtensionFolders: [additionalFolder1, additionalFolder2],
          uninstallExtensionIDs: ["my.ext", "my.ext2"],
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        });

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: mochaTestsPath,
            launchArgs: [workspacePath],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
            },
          },
        ]);

        // Check we performed the install/uninstall calls
        expect(spawnSyncStub.callCount, "spawnSync call count").to.equal(2);
        expect(
          spawnSyncStub.firstCall.args[0],
          "spawnSync first call first arg"
        ).to.equal("vscode-cli-path");
        expect(
          spawnSyncStub.firstCall.args[1],
          "spawnSync first call second arg"
        ).to.deep.equal([
          "--uninstall-extension",
          "my.ext",
          "--uninstall-extension",
          "my.ext2",
          "--force",
        ]);

        expect(
          spawnSyncStub.secondCall.args[0],
          "spawnSync second call first arg"
        ).to.equal("vscode-cli-path");
        expect(
          spawnSyncStub.secondCall.args[1],
          "spawnSync second call second arg"
        ).to.deep.equal([
          "--install-extension",
          firstExt,
          "--install-extension",
          secondExt,
          "--install-extension",
          thirdExt,
          "--force",
        ]);

        // Check the calls were performed in the expected order
        sinon.assert.callOrder(spawnSyncStub, spawnSyncStub, runTestsStub);
      });

      it("throws an error when one of the additionalExtensionFolders doesn't exist", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const userDataDir = join(__dirname, "userData");

        const additionalFolder1 = join(__dirname, "additionalFolder1");
        const additionalFolder2 = join(__dirname, "additionalFolder2");
        pathsRemover.add(additionalFolder1);

        await mkdirp(additionalFolder1);
        const firstExt = join(additionalFolder1, "first.vsix");
        await writeFile(firstExt, "extension file content");

        await expect(
          runVSCodeTests(false, {
            workspacePath,
            mochaConfigPath,
            userDataDir,
            additionalExtensionFolders: [additionalFolder1, additionalFolder2],
            initWorkspace: false,
            extensionDevelopmentPath: __dirname,
            disableAllExtensions: false,
          })
        ).to.be.rejectedWith(additionalFolder2);
      });

      it("throws an error when no vsix files are found in one of the additionalExtensionFolders", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");
        const userDataDir = join(__dirname, "userData");

        const additionalFolder1 = join(__dirname, "additionalFolder1");
        const additionalFolder2 = join(__dirname, "additionalFolder2");
        pathsRemover.add(additionalFolder1, additionalFolder2);

        await mkdirp(additionalFolder1);
        await mkdirp(additionalFolder2);
        const firstExt = join(additionalFolder1, "first.vsix");
        await writeFile(firstExt, "extension file content");

        await expect(
          runVSCodeTests(false, {
            workspacePath,
            mochaConfigPath,
            userDataDir,
            additionalExtensionFolders: [additionalFolder1, additionalFolder2],
            initWorkspace: false,
            extensionDevelopmentPath: __dirname,
            disableAllExtensions: false,
          })
        ).to.be.rejectedWith(additionalFolder2);
      });
    });

    // This describe is inside runVSCodeTests for convenience of using the stubs
    describe("runTestsFromCommandLineInner", () => {
      let runTestsFromCommandLineInner: VSCodeTestsType["runTestsFromCommandLineInner"];
      beforeEach(() => {
        runTestsFromCommandLineInner = (proxyquire(
          require.resolve("../src/vscode-tests"),
          {
            "@vscode/test-electron": {
              resolveCliPathFromVSCodeExecutablePath: resolveCliPathFromVSCodeExecutablePathStub,
              downloadAndUnzipVSCode: downloadAndUnzipVSCodeStub,
              runTests: runTestsStub,
            },
            child_process: {
              spawnSync: spawnSyncStub,
            },
          }
        ) as VSCodeTestsType).runTestsFromCommandLineInner;
      });

      it("reads the configuration from the command line parameter and runs the tests", async () => {
        downloadAndUnzipVSCodeStub.resolves("vscode-path");
        resolveCliPathFromVSCodeExecutablePathStub.returns("vscode-cli-path");
        spawnSyncStub.returns(getSpawnSyncResult());
        runTestsStub.resolves(0);

        const workspacePath = join(__dirname, "some.code-workspace");
        const mochaConfigPath = join(__dirname, "mocha.js");

        const configPath = join(__dirname, "config.json");
        pathsRemover.add(configPath);
        const configObj = {
          workspacePath,
          mochaConfigPath,
          initWorkspace: false,
          extensionDevelopmentPath: __dirname,
          disableAllExtensions: false,
        };
        await writeJson(configPath, configObj);

        await runTestsFromCommandLineInner(["--config", configPath]);

        // Check we ran the tests with the expected parameters
        expect(runTestsStub.callCount, "runTests call count").to.equal(1);
        expect(runTestsStub.firstCall.args).to.deep.equal([
          {
            vscodeExecutablePath: "vscode-path",
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: mochaTestsPath,
            launchArgs: [workspacePath],
            extensionTestsEnv: {
              [ENV_VAR_MOCHA_CWD]: toLowerDriveLetter(__dirname),
              [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
            },
          },
        ]);

        // Check we didn't perform unnecessary calls
        expect(spawnSyncStub.called, "spawnSync was called").to.be.false;
      });
    });
  });
});
