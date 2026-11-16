import { describe, test } from "bun:test";
import { RuleTester } from "eslint";

function withBunRegistration(register: () => void) {
  const previousDescribe = RuleTester.describe;
  const previousIt = RuleTester.it;
  try {
    // Bun defers nested suites, so each callback must restore its own runner bindings.
    RuleTester.describe = (name, callback) => describe(name, () => withBunRegistration(callback));
    RuleTester.it = test;
    register();
  } finally {
    RuleTester.describe = previousDescribe;
    RuleTester.it = previousIt;
  }
}

export function runBunRuleTests(tester: RuleTester, ...args: Parameters<RuleTester["run"]>) {
  withBunRegistration(() => tester.run(...args));
}
