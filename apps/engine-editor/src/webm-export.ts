export type WebMExportOptions = {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  codec: "vp8" | "vp9";
  bitrate?: number;
  renderFrame(context: CanvasRenderingContext2D, frame: number): void;
  onProgress?(progress: number): void;
};

type EncodedFrame = { timestamp: number; duration: number; key: boolean; data: Uint8Array };

export async function encodeCanvasSequenceWebM(options: WebMExportOptions) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") throw new Error("This browser does not expose WebCodecs VideoEncoder.");
  const codec = options.codec === "vp9" ? "vp09.00.10.08" : "vp8";
  const config: VideoEncoderConfig = { codec, width: options.width, height: options.height, framerate: options.fps, bitrate: options.bitrate ?? Math.max(1_500_000, Math.round(options.width * options.height * options.fps * .095)), latencyMode: "quality" };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) throw new Error(`${options.codec.toUpperCase()} encoding is not supported at ${options.width}×${options.height}.`);
  const canvas = document.createElement("canvas"); canvas.width = options.width; canvas.height = options.height;
  const context = canvas.getContext("2d", { alpha: false }); if (!context) throw new Error("Could not create the export render surface.");
  const frames: EncodedFrame[] = [];
  let encoderError: DOMException | undefined;
  const encoder = new VideoEncoder({
    output(chunk) { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); frames.push({ timestamp: chunk.timestamp, duration: chunk.duration ?? Math.round(1_000_000 / options.fps), key: chunk.type === "key", data }); },
    error(error) { encoderError = error; },
  });
  encoder.configure(support.config ?? config);
  const duration = Math.round(1_000_000 / options.fps);
  for (let frame = 0; frame < options.frameCount; frame += 1) {
    options.renderFrame(context, frame);
    const videoFrame = new VideoFrame(canvas, { timestamp: frame * duration, duration });
    encoder.encode(videoFrame, { keyFrame: frame % Math.max(1, options.fps * 2) === 0 });
    videoFrame.close();
    if (encoder.encodeQueueSize > 8) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    options.onProgress?.((frame + 1) / options.frameCount * .86);
  }
  await encoder.flush(); encoder.close();
  if (encoderError) throw encoderError;
  frames.sort((a, b) => a.timestamp - b.timestamp);
  const blob = muxWebM(frames, options.width, options.height, options.fps, options.codec);
  options.onProgress?.(1);
  return blob;
}

function muxWebM(frames: readonly EncodedFrame[], width: number, height: number, fps: number, codec: "vp8" | "vp9") {
  const durationMs = frames.length / fps * 1000;
  const ebmlHeader = element(0x1a45dfa3, join(
    element(0x4286, uint(1)), element(0x42f7, uint(1)), element(0x42f2, uint(4)), element(0x42f3, uint(8)),
    element(0x4282, text("webm")), element(0x4287, uint(4)), element(0x4285, uint(2)),
  ));
  const info = element(0x1549a966, join(element(0x2ad7b1, uint(1_000_000)), element(0x4d80, text("Catalog Engine Editor")), element(0x5741, text("Catalog WebCodecs")), element(0x4489, float64(durationMs))));
  const video = element(0xe0, join(element(0xb0, uint(width)), element(0xba, uint(height))));
  const trackEntry = element(0xae, join(element(0xd7, uint(1)), element(0x73c5, uint(1)), element(0x83, uint(1)), element(0x86, text(codec === "vp9" ? "V_VP9" : "V_VP8")), element(0x23e383, uint(Math.round(1_000_000_000 / fps))), video));
  const tracks = element(0x1654ae6b, trackEntry);
  const clusters: Uint8Array[] = [];
  let clusterStartMs = -1; let blocks: Uint8Array[] = [];
  const flush = () => { if (clusterStartMs < 0) return; clusters.push(element(0x1f43b675, join(element(0xe7, uint(clusterStartMs)), ...blocks))); blocks = []; };
  for (const frame of frames) {
    const timestampMs = Math.round(frame.timestamp / 1000);
    if (clusterStartMs < 0 || (frame.key && timestampMs - clusterStartMs >= 2_000) || timestampMs - clusterStartMs > 30_000) { flush(); clusterStartMs = timestampMs; }
    const relative = timestampMs - clusterStartMs;
    const blockHeader = new Uint8Array([0x81, (relative >> 8) & 0xff, relative & 0xff, frame.key ? 0x80 : 0]);
    blocks.push(element(0xa3, join(blockHeader, frame.data)));
  }
  flush();
  const segment = element(0x18538067, join(info, tracks, ...clusters));
  return new Blob([ebmlHeader, segment], { type: "video/webm" });
}

function element(id: number, data: Uint8Array) { return join(idBytes(id), vint(data.byteLength), data); }
function join(...parts: Uint8Array[]) { const size = parts.reduce((sum, part) => sum + part.byteLength, 0); const output = new Uint8Array(size); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.byteLength; } return output; }
function idBytes(value: number) { const width = value > 0xffffff ? 4 : value > 0xffff ? 3 : value > 0xff ? 2 : 1; const output = new Uint8Array(width); for (let index = width - 1; index >= 0; index -= 1) { output[index] = value & 0xff; value >>>= 8; } return output; }
function vint(value: number) { let width = 1; while (width < 8 && value >= 2 ** (7 * width) - 1) width += 1; const output = new Uint8Array(width); for (let index = width - 1; index >= 0; index -= 1) { output[index] = value & 0xff; value = Math.floor(value / 256); } output[0] |= 1 << (8 - width); return output; }
function uint(value: number) { let width = 1; while (width < 8 && value >= 2 ** (8 * width)) width += 1; const output = new Uint8Array(width); for (let index = width - 1; index >= 0; index -= 1) { output[index] = value & 0xff; value = Math.floor(value / 256); } return output; }
function float64(value: number) { const output = new Uint8Array(8); new DataView(output.buffer).setFloat64(0, value); return output; }
function text(value: string) { return new TextEncoder().encode(value); }
