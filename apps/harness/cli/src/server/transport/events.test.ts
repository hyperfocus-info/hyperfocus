import { expect, test } from "bun:test";
import { parseServerEventFrame } from "@hyperfocus/ai-core/protocol";
import { controlEventBatcher, emitTerminalAttachReadyToClient, type ControlEventSocket } from "./events";

function socket(clientId: string, connectionId = clientId) {
  const sent: string[] = [];
  const value: ControlEventSocket = { data: { kind: "control", clientKind: "native", clientId, connectionId },
    send(data) { if (typeof data === "string") sent.push(data); return 1; }, close() {} };
  return { value, sent };
}

test("sends terminal attach credentials only to the requesting control client", () => {
  const requester = socket("duplicate", "origin"), peer = socket("duplicate", "peer");
  emitTerminalAttachReadyToClient(new Set([requester.value, peer.value]), {
    requestId: "request", connectionId: "origin", sessionId: "session", snapshot: "",
    attachToken: { token: "0123456789abcdef", sessionId: "session", clientId: "duplicate", expiresAt: new Date().toISOString() }
  });
  controlEventBatcher.flush(requester.value); controlEventBatcher.flush(peer.value);
  expect(parseServerEventFrame(JSON.parse(requester.sent[0]!))[0]?.type).toBe("terminal.session.attach-ready");
  expect(peer.sent).toHaveLength(0);
});
