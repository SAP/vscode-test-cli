import { expect } from "chai";
import { function1 } from "./tested-sources/tested-file";

describe("these tests don't run", () => {
  it("first test", () => {
    expect(function1()).to.equal(1);
  });

  it("second test", () => {
    expect(function1()).to.equal(2);
  });
});
