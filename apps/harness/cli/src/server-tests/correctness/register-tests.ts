import { describe } from "bun:test";
import { registerCorrectnessFollowupTests } from "./correctness-followup-tests";
import { registerCorrectionPolicyTests } from "./correction-policy-tests";
import { registerReviewOwnershipTests } from "./review-ownership-tests";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";

export function registerServerCorrectnessTests(options: ServerTestShardOptions = {}) {
  describe("harness server correctness", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useServerSuiteFixture({ fixtureName: "server-correctness", useFastOsAdapters: false });
    registerCorrectnessFollowupTests(serverTest, fixture);
    registerCorrectionPolicyTests(serverTest, fixture);
    registerReviewOwnershipTests(serverTest, fixture);
  });
}
