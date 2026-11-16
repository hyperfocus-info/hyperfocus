import { createHash } from "node:crypto";
import type { SwarmInvestigationInstrument } from "@hyperfocus/ai-core/swarm";

export function swarmInstrumentIdentity(instrument: SwarmInvestigationInstrument) {
  return createHash("sha256").update(JSON.stringify(instrument)).digest("hex");
}

export function swarmProbeIdentity(instrument: SwarmInvestigationInstrument, timeoutMs: number) {
  return createHash("sha256").update(JSON.stringify({ command: instrument.command, lane: instrument.lane, artifactPaths: instrument.artifactPaths, timeoutMs })).digest("hex");
}
