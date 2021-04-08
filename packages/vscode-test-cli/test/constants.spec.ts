import { expect } from "chai";
import { keys } from "lodash";
import * as constants from "../src/constants";

describe("constants", () => {
  const constNames = keys(constants) as (keyof typeof constants)[];
  for (const constName of constNames) {
    if (constName.startsWith("ENV_VAR_")) {
      it(`env var ${constName} starts with VSCODE_TEST_CLI_ prefix`, () => {
        expect(constants[constName]).to.match(/VSCODE_TEST_CLI_.*/);
      });
    }
  }
});
