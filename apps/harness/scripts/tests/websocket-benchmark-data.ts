import { type ServerEvent } from "@hyperfocus/ai-core/protocol";

export type BenchArgs = {
  events: number;
  batchSize: number;
  runs: number;
  network: boolean;
};

export function parseArgs(rawArgs: string[]): BenchArgs {
  const getNumber = (name: string, fallback: number) => {
    const prefix = `--${name}=`;
    const value = rawArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  };

  return {
    events: getNumber("events", 20_000),
    batchSize: getNumber("batch-size", 32),
    runs: getNumber("runs", 5),
    network: !rawArgs.includes("--no-network")
  };
}

export function createAssistantDeltaEvents(count: number): ServerEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "assistant.chat.delta",
    requestId: `bench-${index}`,
    payload: {
      assistantId: "assistant-bench",
      sessionId: "session-bench",
      delta: `chunk-${index % 100}:abcdefghijklmnopqrstuvwxyz`
    }
  }));
}

export function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
