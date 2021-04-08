import { AssertionError, expect } from "chai";
import { remove } from "fs-extra";
import {
  assign,
  clone,
  isRegExp,
  keys,
  map,
  remove as removeFromArray,
} from "lodash";
import * as sinon from "sinon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- can't define a generic function type without "any"
export type SinonStubType<T extends (...args: any[]) => any> = T extends (
  ...args: infer TArgs
) => infer TReturnValue
  ? sinon.SinonStub<TArgs, TReturnValue>
  : never;

export class PathRemover {
  constructor(private paths: string[] = []) {}

  add(...paths: string[]): void {
    this.paths.push(...paths);
  }

  async remove(): Promise<void> {
    await Promise.all(map(this.paths, (path) => remove(path)));
    this.paths = [];
  }
}

export function deleteRequireCache(): void {
  for (const path of keys(require.cache)) {
    delete require.cache[path];
  }
}

export function stubEnv(
  additionalProps: Record<string, string | undefined>
): void {
  const originalEnv = process.env;
  const newEnv = assign({}, originalEnv, additionalProps);
  sinon.stub(process, "env").get(() => newEnv);
}

/**
 * Assert all array values are matched by at least one matcher, and all matchers match at least one value.
 * A string matcher is matched if it is equal to the value. A regular expression matcher is matched if the value matches it.
 * Note: matchers are checked in order. More specific matchers should be first in the matchers list.
 */
export function assertArrayValues(
  values: string[],
  matchers: (string | RegExp)[]
): void {
  expect(values).to.be.an("array");
  const unmatchedValues = clone(values);
  const unmatchedMatchers: (string | RegExp)[] = [];
  for (const matcher of matchers) {
    let found = false;
    if (typeof matcher === "string") {
      removeFromArray(unmatchedValues, (value) => {
        if (found) {
          return;
        }
        if (value === matcher) {
          found = true;
          return true;
        }
        return false;
      });
    } else {
      removeFromArray(unmatchedValues, (value) => {
        if (found) {
          return;
        }
        if (matcher.exec(value) !== null) {
          found = true;
          return true;
        }
        return false;
      });
    }
    if (!found) {
      unmatchedMatchers.push(matcher);
    }
  }

  // Check all matchers found a value
  if (unmatchedMatchers.length > 0) {
    throw new AssertionError(
      "The following matchers did not match any value: " +
        JSON.stringify(unmatchedMatchers, (_, matcher: string | RegExp) =>
          isRegExp(matcher) ? matcher.toString() : matcher
        )
    );
  }

  // Check all values were matched
  if (unmatchedValues.length > 0) {
    throw new AssertionError(
      "The following values were not matched by any matchers: " +
        JSON.stringify(unmatchedValues)
    );
  }
}
