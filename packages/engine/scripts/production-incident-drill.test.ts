import { expect, test } from "bun:test";
import { runProductionIncidentDrill } from "./production-incident-drill.ts";

test("the production incident drill fails closed, drains, rotates, and restores", async () => {
  expect(await runProductionIncidentDrill()).toEqual({
    replayPartitionFailedClosed: true,
    crossProcessReplayRejected: true,
    drainCompleted: true,
    corruptedBackupRejected: true,
    encryptedRestoreCompleted: true,
    signingKeyRotated: true,
  });
});
