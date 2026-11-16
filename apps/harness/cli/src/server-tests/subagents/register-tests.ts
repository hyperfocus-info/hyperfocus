import { describe } from "bun:test";
import { useAttachmentFetchFixture } from "../../test-support/attachment-fetch-fixture";
import { registerExperimentAttachmentTests } from "./experiment-attachment-tests";
import { registerSubagentMilestoneTests } from "./milestone-tests";
import { registerSubagentOrchestrationTests } from "./orchestration-tests";
import { registerRetryVerificationTests } from "./retry-verification-tests";
import { useServerSuiteFixture } from "../support/server-suite-fixture";
import { createServerTestRegistrar, type ServerTestShardOptions } from "../support/server-test-sharding";

export function registerServerSubagentTests(options: ServerTestShardOptions = {}) {
  describe("harness server subagents", () => {
    const serverTest = createServerTestRegistrar(options);
    const attachmentFetchBodies = useAttachmentFetchFixture();
    const fixture = useServerSuiteFixture({ fixtureName: "server-subagents" });
    registerExperimentAttachmentTests(serverTest, fixture, attachmentFetchBodies);
    registerSubagentOrchestrationTests(serverTest, fixture);
    registerRetryVerificationTests(serverTest, fixture);
    registerSubagentMilestoneTests(serverTest, fixture);
  });
}
