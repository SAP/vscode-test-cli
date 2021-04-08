import { expect, use } from "chai";
import * as sinon from "sinon";
import * as chaiAsPromised from "chai-as-promised";
import { join } from "path";
import {
  deleteRequireCache,
  PathRemover,
  SinonStubType,
  stubEnv,
} from "./test-utils";
import { writeFile, writeJson } from "fs-extra";
import { ENV_VAR_MOCHA_CONFIG_PATH, ENV_VAR_MOCHA_CWD } from "../src/constants";
import * as proxyquire from "proxyquire";
import { run } from "../src/mocha-tests";
import * as Mocha from "mocha";

use(chaiAsPromised);

type MochaTestsType = typeof import("../src/mocha-tests");

describe("mocha-tests", () => {
  it("contains a run function", () => {
    // This should be the same path as in vscode-tests.spec.ts
    // eslint-disable-next-line @typescript-eslint/no-var-requires -- requiring the file the same way vscode does
    const mochaTests = require("../src/mocha-tests") as unknown;
    expect(mochaTests).to.be.an("object");
    expect((mochaTests as Record<string, unknown>).run).to.be.a("function");
  });

  describe("run", () => {
    const pathsRemover = new PathRemover();
    const configPath = join(__dirname, "config.json");
    const failingTestsSpec =
      "./test-data/mocha-tests-that-run/**/mocha-tests*.js";
    const passingTestsSpec =
      "./test-data/mocha-tests-that-run/**/inner-folder/mocha-tests*.js";

    const validEnvProps = {
      [ENV_VAR_MOCHA_CONFIG_PATH]: configPath,
      [ENV_VAR_MOCHA_CWD]: __dirname,
    };

    beforeEach(() => {
      pathsRemover.add(configPath);
      // We must reset the require cache because require is called for reading configuration,
      // requiring modules and in mocha
      deleteRequireCache();
    });

    afterEach(async () => {
      sinon.restore();
      await pathsRemover.remove();
    });

    context("validations", () => {
      it("throws an error when VSCODE_TEST_CLI_MOCHA_CWD env var is not set", async () => {
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_MOCHA_CWD"]: undefined,
        });
        await expect(run()).to.be.rejectedWith("VSCODE_TEST_CLI_MOCHA_CWD");
      });

      it("throws an error when VSCODE_TEST_CLI_MOCHA_CONFIG_PATH env var is not set", async () => {
        stubEnv({
          ...validEnvProps,
          ["VSCODE_TEST_CLI_MOCHA_CONFIG_PATH"]: undefined,
        });
        await expect(run()).to.be.rejectedWith(
          "VSCODE_TEST_CLI_MOCHA_CONFIG_PATH"
        );
      });

      it("throws an error when config file doesn't exist", async () => {
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith(configPath);
      });

      it("throws an error when config file is in an invalid format", async () => {
        await writeFile(configPath, "not json");
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith(configPath);
      });

      it("throws an error when spec is missing", async () => {
        await writeJson(configPath, {});
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith("spec");
      });

      it("throws an error when spec is not a string", async () => {
        await writeJson(configPath, { spec: true });
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith("spec");
      });

      it("throws an error when require contains a non-string value", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, require: [1] });
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith("require");
      });

      it("throws an error when require contains a non-existing module", async () => {
        await writeJson(configPath, {
          spec: passingTestsSpec,
          require: ["you cannot require this"],
        });
        stubEnv(validEnvProps);
        await expect(run()).to.be.rejectedWith("you cannot require this");
      });
    });

    context("mocha runs", () => {
      let stubbedRun: typeof run;
      let mochaConstructorStub: SinonStubType<
        (options: Mocha.MochaOptions | undefined) => void
      >;
      class MochaMock extends Mocha {
        constructor(options: Mocha.MochaOptions | undefined) {
          super(options);
          mochaConstructorStub(options);
        }
      }
      let mochaAddFileStub: SinonStubType<typeof Mocha.prototype.addFile>;

      beforeEach(() => {
        stubbedRun = (proxyquire(require.resolve("../src/mocha-tests"), {
          mocha: MochaMock,
        }) as MochaTestsType).run;
        mochaConstructorStub = sinon.stub();
        mochaAddFileStub = sinon.stub(MochaMock.prototype, "addFile");
        mochaAddFileStub.callThrough();
      });

      it("requires the packages defined in requires", async () => {
        const requiredModule = join(
          __dirname,
          "test-data/requires-modules/required-module"
        );
        await writeJson(configPath, {
          spec: passingTestsSpec,
          color: false,
          require: [requiredModule],
        });
        stubEnv(validEnvProps);
        await stubbedRun();
        expect(require.cache[require.resolve(requiredModule)]).to.exist;
      });

      it("requires the package defined in requires when it's a string", async () => {
        const requiredModule = join(
          __dirname,
          "test-data/requires-modules/required-module"
        );
        await writeJson(configPath, {
          spec: passingTestsSpec,
          color: false,
          require: requiredModule,
        });
        stubEnv(validEnvProps);
        await stubbedRun();
        expect(require.cache[require.resolve(requiredModule)]).to.exist;
      });

      it("doesn't add any files when mocha cwd is not a folder", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, color: false });
        stubEnv({
          ...validEnvProps,
          [ENV_VAR_MOCHA_CWD]: __filename,
        });
        await stubbedRun();
        expect(
          mochaAddFileStub.callCount,
          "mocha.addFiles call count"
        ).to.equal(0);
      });

      it("doesn't add any files when no files are found with spec in mocha cwd", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, color: false });
        stubEnv({
          ...validEnvProps,
          [ENV_VAR_MOCHA_CWD]: __filename,
        });
        await stubbedRun();
        expect(
          mochaAddFileStub.callCount,
          "mocha.addFiles call count"
        ).to.equal(0);
      });

      it("runs mocha with the configuration from the config file", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, color: false });
        stubEnv(validEnvProps);
        await stubbedRun();
        expect(
          mochaConstructorStub.callCount,
          "new Mocha() call count"
        ).to.equal(1);
        expect(mochaConstructorStub.firstCall.args).to.deep.equal([
          { color: false },
        ]);
      });

      it("runs mocha with the configuration from the config file when it's a js file", async () => {
        const configPath = join(__dirname, "config.js");
        pathsRemover.add(configPath);
        await writeFile(
          configPath,
          "module.exports = " +
            JSON.stringify({ spec: passingTestsSpec, color: false })
        );
        stubEnv({
          ...validEnvProps,
          [ENV_VAR_MOCHA_CONFIG_PATH]: configPath,
        });
        await stubbedRun();
        expect(
          mochaConstructorStub.callCount,
          "new Mocha() call count"
        ).to.equal(1);
        expect(mochaConstructorStub.firstCall.args).to.deep.equal([
          { color: false },
        ]);
      });

      it("succeeds when all the tests in the files specified in spec pass", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, color: false });
        stubEnv(validEnvProps);
        await stubbedRun();
        expect(
          mochaAddFileStub.callCount,
          "mocha.addFiles call count"
        ).to.equal(1);
        expect(mochaAddFileStub.firstCall.args).to.deep.equal([
          require.resolve(
            "./test-data/mocha-tests-that-run/inner-folder/mocha-tests-that-run2"
          ),
        ]);
      });

      it("fails when one of the files from spec contains a failing test", async () => {
        await writeJson(configPath, { spec: failingTestsSpec, color: false });
        stubEnv(validEnvProps);
        await expect(stubbedRun()).to.be.rejectedWith("1 tests failed.");
        expect(
          mochaAddFileStub.callCount,
          "mocha.addFiles call count"
        ).to.equal(2);
        expect(mochaAddFileStub.args).to.deep.equal([
          // Glob results are sorted
          [
            require.resolve(
              "./test-data/mocha-tests-that-run/inner-folder/mocha-tests-that-run2"
            ),
          ],
          [
            require.resolve(
              "./test-data/mocha-tests-that-run/mocha-tests-that-run1"
            ),
          ],
        ]);
      });

      it("fails when mocha.run throws an error", async () => {
        await writeJson(configPath, { spec: passingTestsSpec, color: false });
        stubEnv(validEnvProps);
        sinon
          .stub(MochaMock.prototype, "run")
          .throws(new Error("an error from mocha.run"));
        await expect(stubbedRun()).to.be.rejectedWith(
          "an error from mocha.run"
        );
      });
    });
  });
});
