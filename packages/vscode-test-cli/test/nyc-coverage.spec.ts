import { expect, use } from "chai";
import * as sinon from "sinon";
import * as chaiAsPromised from "chai-as-promised";
import {
  assertArrayValues,
  deleteRequireCache,
  PathRemover,
  SinonStubType,
  stubEnv,
} from "./test-utils";
import { join, sep } from "path";
import {
  ENV_VAR_BASE_TEST_PATH,
  ENV_VAR_MOCHA_CONFIG_PATH,
  ENV_VAR_MOCHA_CWD,
  ENV_VAR_NYC_CONFIG_PATH,
  ENV_VAR_NYC_CWD,
} from "../src/constants";
import { run, Nyc } from "../src/nyc-coverage";
import { readJson, writeFile, writeJson } from "fs-extra";
import proxyquire = require("proxyquire");
import { clone, isPlainObject, keys } from "lodash";
// eslint-disable-next-line @typescript-eslint/no-var-requires -- nyc doesn't have type definitions
const Nyc = require("nyc") as Nyc;

use(chaiAsPromised);

type NycCoverageType = typeof import("../src/nyc-coverage");

describe("nyc-coverage", () => {
  it("contains a run function", () => {
    // This should be the same path as in vscode-tests.spec.ts
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- requiring the file the same way vscode does
    const mochaTests = require("../src/nyc-coverage") as unknown;
    expect(mochaTests).to.be.an("object");
    expect((mochaTests as Record<string, unknown>).run).to.be.a("function");
  });

  describe("run", () => {
    const pathsRemover = new PathRemover();
    const mochaConfigPath = join(__dirname, "mocha.config.json");
    const nycConfigPath = join(__dirname, "nyc.config.json");

    beforeEach(() => {
      pathsRemover.add(mochaConfigPath, nycConfigPath);
      // We must reset the require cache because require is called for reading configuration,
      // requiring modules and in mocha
      deleteRequireCache();
    });

    afterEach(async () => {
      sinon.restore();
      await pathsRemover.remove();
    });

    const validEnvProps = {
      [ENV_VAR_MOCHA_CONFIG_PATH]: mochaConfigPath,
      [ENV_VAR_MOCHA_CWD]: __dirname,
      [ENV_VAR_BASE_TEST_PATH]: require.resolve("../src/mocha-tests"),
      [ENV_VAR_NYC_CONFIG_PATH]: nycConfigPath,
      [ENV_VAR_NYC_CWD]: __dirname,
    };

    context("validations", () => {
      it("throws an error when VSCODE_TEST_CLI_BASE_TEST_PATH env var is not set", async () => {
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_BASE_TEST_PATH"]: undefined,
        });
        await expect(run()).to.be.rejectedWith(
          "VSCODE_TEST_CLI_BASE_TEST_PATH"
        );
      });

      it("throws an error when VSCODE_TEST_CLI_BASE_TEST_PATH does not exist", async () => {
        const baseRunnerPath = join(__dirname, "non-existing");
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_BASE_TEST_PATH"]: baseRunnerPath,
        });
        await expect(run()).to.be.rejectedWith(baseRunnerPath);
      });

      it("throws an error when VSCODE_TEST_CLI_BASE_TEST_PATH does not export an object", async () => {
        const baseRunnerPath = join(
          __dirname,
          "test-data/base-runners/exports-string"
        );
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_BASE_TEST_PATH"]: baseRunnerPath,
        });
        await expect(run()).to.be.rejectedWith(baseRunnerPath);
      });

      it("throws an error when VSCODE_TEST_CLI_BASE_TEST_PATH exported object does not contain a run function", async () => {
        const baseRunnerPath = join(
          __dirname,
          "test-data/base-runners/exports-string-run"
        );
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_BASE_TEST_PATH"]: baseRunnerPath,
        });
        await expect(run()).to.be.rejectedWith(baseRunnerPath);
      });

      it("throws an error when VSCODE_TEST_CLI_NYC_CWD env var is not set", async () => {
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_NYC_CWD"]: undefined,
        });
        await expect(run()).to.be.rejectedWith("VSCODE_TEST_CLI_NYC_CWD");
      });

      it("throws an error when VSCODE_TEST_CLI_NYC_CONFIG_PATH env var is not set", async () => {
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_NYC_CONFIG_PATH"]: undefined,
        });
        await expect(run()).to.be.rejectedWith(
          "VSCODE_TEST_CLI_NYC_CONFIG_PATH"
        );
      });

      it("throws an error when nyc config file doesn't exist", async () => {
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith(nycConfigPath);
      });

      it("throws an error when nyc config file is in an invalid format", async () => {
        await writeFile(nycConfigPath, "not json");
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith(nycConfigPath);
      });
    });

    context("nyc runs", () => {
      beforeEach(() => {
        pathsRemover.add(
          join(__dirname, ".nyc_output"),
          join(__dirname, "coverage")
        );
      });

      async function writePassingMochaConfig(): Promise<void> {
        await writeJson(mochaConfigPath, {
          spec:
            "./test-data/mocha-tests-that-run/**/inner-folder/mocha-tests*.js",
          color: false,
        });
      }

      async function writeFailingMochaConfig(): Promise<void> {
        await writeJson(mochaConfigPath, {
          spec: "./test-data/mocha-tests-that-run/**/mocha-tests*.js",
          color: false,
        });
      }

      async function writeNycConfig(all: boolean | undefined): Promise<void> {
        await writeJson(nycConfigPath, {
          reporter: ["json-summary"],
          include: ["**/tested-sources/**"],
          all,
        });
      }

      async function writeNycReport(nycInstance: unknown): Promise<void> {
        expect(nycInstance).to.be.an("object");
        const nycWithReport = nycInstance as { report(): Promise<void> };
        // eslint-disable-next-line @typescript-eslint/unbound-method -- we are not running the function, just checking its type
        expect(nycWithReport.report).to.be.a("function");
        await nycWithReport.report();
      }

      async function getSummaryReport(
        nycInstance: unknown
      ): Promise<Record<string, unknown>> {
        // Write the coverage report so we can check what was covered.
        // See json-summary reporter format: https://istanbul.js.org/docs/advanced/alternative-reporters/#json-summary
        await writeNycReport(nycInstance);
        const jsonSummaryReport = (await readJson(
          join(__dirname, "coverage", "coverage-summary.json")
        )) as Record<string, unknown>;
        return jsonSummaryReport;
      }

      // Matching against regular expressions instead of the exact file path because there are leftover values created when initializing
      // the NYC instance (when hooking "require") that prevent the source maps from being calculated correctly for files which are
      // loaded with the "all" property in subsequent NYC instances.
      // This causes the file path to be returned as either the typescript or javascript file, depending on the order of the tests,
      // so we only check the file name.
      const testedFilePath = /[\\/]tested-file\./;
      const notTestedFilePath = /[\\/]not-tested-file\./;

      let stubbedRun: typeof run;
      let nycConstructorStub: SinonStubType<(options: unknown) => void>;
      class NycMock extends Nyc {
        constructor(options: unknown) {
          super(options);
          // Record the parameters and this value of the constructor
          nycConstructorStub.apply(this, [options]);
        }

        _wrapExit() {
          // _wrapExit method registers a function that writes the coverage files when the process exists.
          // We don't want this in the tests (it will try to write in a folder we removed).
        }

        // writeCoverageFile removes the excluded files from the global coverage variable. This messes with the coverage of the
        // tests of this library (vscode-test-cli) so we back them up and restore them after.
        writeCoverageFile() {
          const g = (global as unknown) as Record<string, unknown>;
          const coverageBackup = clone(g.__coverage__);
          try {
            return super.writeCoverageFile();
          } finally {
            g.__coverage__ = coverageBackup;
          }
        }
      }

      beforeEach(() => {
        stubbedRun = (proxyquire(require.resolve("../src/nyc-coverage"), {
          nyc: NycMock,
        }) as NycCoverageType).run;
        nycConstructorStub = sinon.stub();
      });

      afterEach(() => {
        // Remove the test-data files from the global coverage so the next test will not contain leftover coverage info on them
        const g = (global as unknown) as Record<string, unknown>;
        if (isPlainObject(g.__coverage__)) {
          for (const file of keys(g.__coverage__)) {
            if (file.includes(sep + "test-data" + sep)) {
              delete (g.__coverage__ as Record<string, unknown>)[file];
            }
          }
        }
      });

      it("throws an error when the base test runner fails", async () => {
        await writeNycConfig(undefined);
        const baseRunnerPath = join(
          __dirname,
          "test-data/base-runners/throws-error-from-run"
        );
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_BASE_TEST_PATH"]: baseRunnerPath,
        });
        await expect(stubbedRun()).to.be.rejectedWith(
          "The run function threw an error"
        );
      });

      it("runs nyc with the configuration from the config file", async () => {
        await writePassingMochaConfig();
        await writeJson(nycConfigPath, {
          reporter: ["json-summary"],
          extension: ["*.js", "*.ts"],
        });
        stubEnv(validEnvProps);

        await stubbedRun();

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        expect(
          nycConstructorStub.firstCall.args.length,
          "nyc constructor args number"
        ).to.equal(1);
        expect(nycConstructorStub.firstCall.args[0]).to.deep.include({
          reporter: ["json-summary"],
          extension: ["*.js", "*.ts"],
        });
      });

      it("runs nyc with the configuration from the config file when it's a js file", async () => {
        await writePassingMochaConfig();
        const nycConfigPath = join(__dirname, "nyc.config.js");
        await writeFile(
          nycConfigPath,
          "module.exports = " +
            JSON.stringify({
              reporter: ["json-summary"],
              extension: ["*.js", "*.ts"],
            })
        );
        stubEnv({
          ...validEnvProps,
          [ENV_VAR_NYC_CONFIG_PATH]: nycConfigPath,
        });

        await stubbedRun();

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        expect(
          nycConstructorStub.firstCall.args.length,
          "nyc constructor args number"
        ).to.equal(1);
        expect(nycConstructorStub.firstCall.args[0]).to.deep.include({
          reporter: ["json-summary"],
          extension: ["*.js", "*.ts"],
        });
      });

      it("writes the coverage files when the tests pass and all is true", async () => {
        await writePassingMochaConfig();
        await writeNycConfig(true);
        stubEnv(validEnvProps);

        await stubbedRun();

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        const jsonSummaryReport = await getSummaryReport(
          nycConstructorStub.firstCall.thisValue
        );
        assertArrayValues(keys(jsonSummaryReport), [
          "total",
          notTestedFilePath,
          testedFilePath,
        ]);

        // Check the expected coverage values. We check the functions as a sample since it's easiest.
        expect(jsonSummaryReport.total).to.be.an("object");
        expect(
          (jsonSummaryReport.total as Record<string, unknown>).functions
        ).to.deep.include({
          // There are 2 functions in the tested file but only one of them is used in a test.
          // There is also 1 function in the untested file.
          total: 3,
          covered: 1,
        });
      });

      it("writes the coverage files when the tests pass and all is false", async () => {
        await writePassingMochaConfig();
        await writeNycConfig(false);
        stubEnv(validEnvProps);

        await stubbedRun();

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        const jsonSummaryReport = await getSummaryReport(
          nycConstructorStub.firstCall.thisValue
        );
        assertArrayValues(keys(jsonSummaryReport), ["total", testedFilePath]);

        // Check the expected coverage values. We check the functions as a sample since it's easiest.
        expect(jsonSummaryReport.total).to.be.an("object");
        expect(
          (jsonSummaryReport.total as Record<string, unknown>).functions
        ).to.deep.include({
          // There are 2 functions in the tested file but only one of them is used in a test
          total: 2,
          covered: 1,
        });
      });

      it("writes the coverage files when the tests pass and all is not defined", async () => {
        await writePassingMochaConfig();
        await writeNycConfig(undefined);
        stubEnv(validEnvProps);

        await stubbedRun();

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        const jsonSummaryReport = await getSummaryReport(
          nycConstructorStub.firstCall.thisValue
        );
        assertArrayValues(keys(jsonSummaryReport), ["total", testedFilePath]);
      });

      it("writes the coverage files when the tests fail", async () => {
        await writeFailingMochaConfig();
        await writeNycConfig(undefined);
        stubEnv(validEnvProps);

        await expect(stubbedRun()).to.be.rejectedWith("1 tests failed.");

        expect(
          nycConstructorStub.callCount,
          "nyc constructor call count"
        ).to.equal(1);
        const jsonSummaryReport = await getSummaryReport(
          nycConstructorStub.firstCall.thisValue
        );
        assertArrayValues(keys(jsonSummaryReport), ["total", testedFilePath]);
      });
    });
  });
});
