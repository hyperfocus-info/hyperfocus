import { expect, test } from "bun:test";
import { readProcessorSource } from "./processor-source-contract";

test("native A/B snapshots stay module-scoped and recall through runtime state application", async () => {
  const source = await readProcessorSource();
  const header = await Bun.file(
    new URL("../core/pad-pilot-processor.h", import.meta.url),
  ).text();

  expect(header).toContain("std::array<ModuleStateSnapshot, 2> moduleStateComparisonSnapshots_");
  expect(source).toContain('capability == "module-state" && payloadBytes.empty()');
  expect(source).toContain("snapshot.moduleId != moduleId");
  expect(source).toContain("applyPresetPayloadWhileStateTransitionLocked(moduleId, payload)");
  expect(source).not.toContain("scriptHost_.loadModule(snapshot");
});
