import { expect, test } from "bun:test";
import { protobufContentType, protobufResponse, readProtobufBody } from "./http";

test("HTTP sends binary values and reads legacy JSON with the same meaning", async () => {
  const value = { message: "雪", items: [false, null, 3] };
  const response = protobufResponse(value, { status: 201 });
  expect(response.headers.get("content-type")).toBe(protobufContentType);
  expect(response.status).toBe(201);
  expect(await readProtobufBody(response)).toEqual(value);
  expect(await readProtobufBody(Response.json(value))).toEqual(value);
  await expect(readProtobufBody(new Response("{}"))).rejects.toThrow("content type");
  await expect(readProtobufBody(new Response("{}", { headers: { "content-type": protobufContentType } }))).rejects.toThrow();
});

test("HTTP rejects declared and streaming overflow and cancels the reader", async () => {
  await expect(readProtobufBody(new Response("{}", { headers: { "content-type": "application/json", "content-length": "100" } }), { maxBytes: 4 })).rejects.toThrow("byte limit");
  let canceled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { canceled = true; },
  }), { headers: { "content-type": protobufContentType } });
  await expect(readProtobufBody(response, { maxBytes: 4 })).rejects.toThrow("byte limit");
  expect(canceled).toBe(true);
  canceled = false;
  const emptyChunks = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(0)); },
    cancel() { canceled = true; },
  }), { headers: { "content-type": protobufContentType } });
  await expect(readProtobufBody(emptyChunks)).rejects.toThrow("chunk limit");
  expect(canceled).toBe(true);
});
