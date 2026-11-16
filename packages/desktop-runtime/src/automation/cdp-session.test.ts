import { expect, test } from "bun:test";
import { connectCdpSession, evaluateCdp, requireJsonRecord } from "./cdp-session";

test("CDP routes actual WebSocket responses, events, protocol failures and evaluation exceptions", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) { if (server.upgrade(request)) return; return new Response(null, { status: 400 }); },
    websocket: { message(socket, raw) {
      const packet = requireJsonRecord(JSON.parse(String(raw)), "request");
      if (packet.method === "Page.enable") socket.send(JSON.stringify({ method: "Page.ready", params: { enabled: true } }));
      if (packet.method === "fail") socket.send(JSON.stringify({ id: packet.id, error: { message: "unsupported command" } }));
      else if (packet.method === "Runtime.evaluate") {
        const params = requireJsonRecord(packet.params, "params");
        const result = params.expression === "throws"
          ? { exceptionDetails: { text: "fixture exception" } } : { result: { value: { answer: 42 } } };
        socket.send(JSON.stringify({ id: packet.id, result }));
      } else socket.send(JSON.stringify({ id: packet.id, result: { method: packet.method } }));
    } },
  });
  const session = await connectCdpSession(`ws://127.0.0.1:${server.port}`);
  try {
    let event: unknown;
    session.on("Page.ready", params => { event = params; });
    expect(await session.command("Page.enable")).toEqual({ method: "Page.enable" });
    expect(event).toEqual({ enabled: true });
    expect(await evaluateCdp(session, "value")).toEqual({ answer: 42 });
    await expect(evaluateCdp(session, "throws")).rejects.toThrow("fixture exception");
    await expect(session.command("fail")).rejects.toThrow("unsupported command");
  } finally { session.close(); await server.stop(true); }
});

test("CDP timeouts and owned close reject pending requests without crossing connection lifetimes", async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch(request, server) { if (server.upgrade(request)) return; return new Response(null, { status: 400 }); },
    websocket: { message() {} },
  });
  const session = await connectCdpSession(`ws://127.0.0.1:${server.port}`);
  try {
    await expect(session.command("never", {}, 5)).rejects.toThrow("timed out: never");
    const pending = session.command("pending", {}, 10_000);
    session.close("owner disposed");
    await expect(pending).rejects.toThrow("owner disposed");
    await expect(session.command("after-close", {}, 5)).rejects.toThrow("owner disposed");
  } finally { session.close(); await server.stop(true); }
});

test("CDP rejects an array in an object response boundary", () => {
  expect(() => requireJsonRecord([], "response")).toThrow(TypeError);
});
