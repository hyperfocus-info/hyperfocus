import { describe } from "bun:test";
import { registerBackgroundThreadRoutingTests } from "./background-thread-routing-tests";
import { registerGitPreflightTests } from "./git-preflight-tests";
import { registerRefreshReconnectTests } from "./refresh-reconnect-tests";
import { registerRetryContextTests } from "./retry-context-tests";
import { registerRunRefreshStatusTests } from "./run-refresh-status-tests";
import { registerThreadMutationTests } from "./thread-mutation-tests";
import { registerWorkspaceProjectTests } from "./workspace-project-tests";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";

export function registerServerProjectsAndHistoryTests(options: ServerTestShardOptions = {}) {
  describe("harness server projects and history", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useServerSuiteFixture({ fixtureName: "server-projects-history", persistentDatabase: true });
    registerRefreshReconnectTests(serverTest, fixture);
    registerBackgroundThreadRoutingTests(serverTest, fixture);
    registerThreadMutationTests(serverTest, fixture);
    registerRunRefreshStatusTests(serverTest, fixture);
    registerWorkspaceProjectTests(serverTest, fixture);
    registerGitPreflightTests(serverTest, fixture);
    registerRetryContextTests(serverTest, fixture);
  });
}
