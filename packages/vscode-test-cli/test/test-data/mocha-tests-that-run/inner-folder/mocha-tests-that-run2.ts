import { expect } from "chai";
import { function1 } from "../../tested-sources/tested-file";

describe("these tests run from inner folder", () => {
  it("first test should pass", () => {
    expect(function1()).to.equal(1);
  });

  it("second test should pass", () => {
    expect(function1() + 1).to.equal(2);
  });
});
