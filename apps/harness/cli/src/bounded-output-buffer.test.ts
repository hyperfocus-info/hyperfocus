import { describe, expect, test } from "bun:test";
import { createBoundedOutputBuffer, readBoundedResponseBody } from "./bounded-output-buffer";

describe("createBoundedOutputBuffer", () => {
  test("retains only bounded tail after cap exceeded", () => {
    const buffer = createBoundedOutputBuffer(6);
    buffer.append("hello");
    const snapshot = buffer.append(" world");

    expect(snapshot.exceeded).toBe(true);
    expect(snapshot.bytesSeen).toBe(11);
    expect(snapshot.bytesDropped).toBe(5);
    expect(snapshot.text).toBe(" world");
  });
});

describe("bounded response body", () => {
  test("reads bodies at the exact limit", async () => {
    const result = await readBoundedResponseBody(new Response("1234"), {
      maxBytes: 4,
      label: "Attachment"
    });
    expect(result.toString()).toBe("1234");
  });

  test("rejects declared and streamed bodies beyond the limit", async () => {
    await expect(readBoundedResponseBody(new Response("12345", {
      headers: { "content-length": "5" }
    }), { maxBytes: 4, label: "Attachment" })).rejects.toThrow("4 byte response budget");

    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"));
        controller.enqueue(new TextEncoder().encode("45"));
        controller.close();
      }
    }));
    await expect(readBoundedResponseBody(response, { maxBytes: 4, label: "Attachment" }))
      .rejects.toThrow("4 byte response budget");
  });
});
