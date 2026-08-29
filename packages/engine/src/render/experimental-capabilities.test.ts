import { expect, test } from "bun:test";
import { inspectExperimentalCapabilities } from "./experimental-capabilities.ts";

test("experimental capabilities distinguish constructor presence from deployability", () => {
  const report = inspectExperimentalCapabilities({
    SharedArrayBuffer: function SharedArrayBufferFixture() {},
    crossOriginIsolated: false,
    VideoEncoder: function VideoEncoderFixture() {},
    VideoDecoder: function VideoDecoderFixture() {},
    navigator: { gpu: {} }
  });
  expect(report.sharedArrayBuffer).toEqual({ supported: false, reason: "cross-origin isolation is required" });
  expect(report.webCodecs.supported).toBe(true);
  expect(report.webGpu.supported).toBe(true);
  expect(report.audioWorklet.supported).toBe(false);
});

test("experimental capability reports are immutable top-level records", () => {
  const report = inspectExperimentalCapabilities({});
  expect(Object.isFrozen(report)).toBe(true);
  expect(report.webCodecs.reason).toContain("unavailable");
});
