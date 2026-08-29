import { describe } from "bun:test";
import { registerAssistantBackgroundJobTests, registerAssistantJobPageTests } from "./assistant-background-job-tests";
import { registerAssistantRoutingTests } from "./assistant-routing-tests";
import { registerBackgroundRunControlTests } from "./background-run-control-tests";
import { registerChatPlanPresentationTests } from "./chat-plan-presentation-tests";
import { registerIntentRoutingTests } from "./intent-routing-tests";
import { registerModeGatingTests } from "./mode-gating-tests";
import { registerPreferencesStorageTests } from "./preferences-storage-tests";
import { registerRuntimeModelSelectionTests } from "./runtime-model-selection-tests";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";

export function registerServerPreferencesAndModesTests(options: ServerTestShardOptions = {}) {
  describe("harness server preferences and modes", () => {
    const serverTest = createServerTestRegistrar(options);
    const fixture = useServerSuiteFixture({ fixtureName: "server-preferences", persistentDatabase: true });
    registerPreferencesStorageTests(serverTest, fixture);
    registerRuntimeModelSelectionTests(serverTest, fixture);
    registerChatPlanPresentationTests(serverTest, fixture);
    registerAssistantRoutingTests(serverTest, fixture);
    registerAssistantBackgroundJobTests(serverTest, fixture);
    registerAssistantJobPageTests(serverTest, fixture);
    registerBackgroundRunControlTests(serverTest, fixture);
    registerModeGatingTests(serverTest, fixture);
    registerIntentRoutingTests(serverTest, fixture);
  });
}
