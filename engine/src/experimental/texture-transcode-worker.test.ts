import { expect, test } from "bun:test";
import { createTextureTranscodeScheduler } from "./texture-transcode-worker.ts";

class MockWorker {
  readonly messages: { message: any; transfer: readonly Transferable[] }[] = [];
  listener?: (event: { data: unknown }) => void;
  postMessage(message: unknown, transfer: readonly Transferable[] = []) { this.messages.push({ message, transfer }); }
  addEventListener(_type: "message", listener: (event: { data: unknown }) => void) { this.listener = listener; }
  removeEventListener() { this.listener = undefined; }
  respond(data: unknown) { this.listener?.({ data }); }
}

test("texture transcode scheduler bounds concurrency and forwards transferable sources", async () => {
  const worker = new MockWorker();
  const scheduler = createTextureTranscodeScheduler({ worker, maxInFlight: 1, maxQueuedJobs: 2, maxQueuedBytes: 16 });
  const first = scheduler.transcode({ source: new ArrayBuffer(4), container: "ktx2", preferredFormats: ["bc7"] });
  const second = scheduler.transcode({ source: new ArrayBuffer(4), container: "basis", preferredFormats: ["astc"] });
  expect(worker.messages).toHaveLength(1);
  expect(worker.messages[0].transfer).toHaveLength(1);
  worker.respond({ type: "texture-transcode-result", id: 1, ok: true, data: new ArrayBuffer(8), format: "bc7", width: 4, height: 4, levels: 1 });
  expect((await first).format).toBe("bc7");
  expect(worker.messages).toHaveLength(2);
  worker.respond({ type: "texture-transcode-result", id: 2, ok: false, error: "unsupported" });
  expect(second).rejects.toThrow("unsupported");
});

test("texture transcode scheduler rejects bounded queue overflow", async () => {
  const worker = new MockWorker();
  const scheduler = createTextureTranscodeScheduler({ worker, maxInFlight: 1, maxQueuedJobs: 1, maxQueuedBytes: 4 });
  const active = scheduler.transcode({ source: new ArrayBuffer(4), container: "ktx2", preferredFormats: ["rgba8"] });
  expect(scheduler.transcode({ source: new ArrayBuffer(5), container: "ktx2", preferredFormats: ["rgba8"] })).rejects.toThrow("capacity");
  scheduler.dispose();
  expect(active).rejects.toThrow("disposed");
});
