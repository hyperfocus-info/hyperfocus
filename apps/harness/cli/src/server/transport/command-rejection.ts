import type { HarnessConnection } from "../core/contracts";
import { sendEvent } from "./events";
import { commandRejectionCodeSchema, createRequestId } from "@hyperfocus/ai-core/protocol";
import type { CommandRejectionCode } from "@hyperfocus/ai-core/protocol";

export function sendCommandRejected(
  ws: Bun.ServerWebSocket<HarnessConnection>,
  message: string,
  detail: string,
  requestId: string = createRequestId(),
  code?: CommandRejectionCode
) {
  sendEvent(ws, { type: "command.rejected", requestId, payload: { message, detail, code } });
}

export function getCommandRejectionCode(error: unknown): CommandRejectionCode | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const parsed = commandRejectionCodeSchema.safeParse(error.code);
  return parsed.success ? parsed.data : undefined;
}
