import { describe } from "bun:test";
import { registerExecutionControlTests } from "./execution-control-tests";
import { registerPlanningLifecycleTests } from "./planning-lifecycle-tests";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";

export function registerServerExecutionMainTests(options: ServerTestShardOptions = {}) {
  describe("harness server execution main", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useServerSuiteFixture({ fixtureName: "server-execution-main" });
    registerExecutionControlTests(serverTest, fixture);
    registerPlanningLifecycleTests(serverTest, fixture);
  });
}
