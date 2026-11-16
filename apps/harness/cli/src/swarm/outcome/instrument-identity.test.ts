import { expect, test } from "bun:test";
import { swarmInvestigationInstrumentSchema } from "@hyperfocus/ai-core/swarm";
import { swarmInstrumentIdentity, swarmProbeIdentity } from "./instrument-identity";

test("raw evidence reuse separates immutable command identity from each trusted interpretation", () => {
  const instrument = swarmInvestigationInstrumentSchema.parse({ id: "probe", methodId: "causal-probe", claim: "Measured work exists.", command: "trusted", timeoutMs: 1_000, maxComputeUsd: 0.1, lane: "investigation", supports: { path: ["value"], operator: "gt", value: 0 }, contradicts: { path: ["value"], operator: "eq", value: 0 }, limitations: [] });
  const otherInterpretation = { ...instrument, claim: "Another interpretation.", supports: instrument.contradicts };
  expect(swarmInstrumentIdentity(otherInterpretation)).not.toBe(swarmInstrumentIdentity(instrument));
  expect(swarmProbeIdentity(otherInterpretation, 1_000)).toBe(swarmProbeIdentity(instrument, 1_000));
  for (const changed of [{ ...instrument, command: "changed" }, { ...instrument, artifactPaths: ["raw.json"] }, { ...instrument, lane: "benchmark" as const }]) {
    expect(swarmProbeIdentity(changed, 1_000)).not.toBe(swarmProbeIdentity(instrument, 1_000));
  }
  expect(swarmProbeIdentity(instrument, 500)).not.toBe(swarmProbeIdentity(instrument, 1_000));
});
