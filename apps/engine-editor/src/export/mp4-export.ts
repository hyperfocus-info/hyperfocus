import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

export type Mp4ExportOptions = {
  width: number;
  height: number;
  fps: 30 | 60;
  frameCount: number;
  audio?: AudioBuffer;
  renderFrame(context: CanvasRenderingContext2D, frame: number): void;
  onProgress?(progress: number): void;
};

/** Encodes a browser-native H.264/AAC MP4. The result contains no network references. */
export async function encodeCanvasSequenceMp4(options: Mp4ExportOptions) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("MP4 export needs a browser with WebCodecs video encoding.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Could not create the MP4 render surface.");

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new CanvasSource(canvas, {
    codec: "avc",
    quality: new Quality("high"),
    keyFrameInterval: 2,
    latencyMode: "quality",
  });
  output.addVideoTrack(video, { frameRate: options.fps, maximumPacketCount: options.frameCount });

  const audio = options.audio
    ? new AudioBufferSource({ codec: "aac", quality: new Quality("high") })
    : undefined;
  if (audio) output.addAudioTrack(audio);

  await output.start();
  const duration = 1 / options.fps;
  const encodeVideo = async () => {
    for (let frame = 0; frame < options.frameCount; frame += 1) {
      options.renderFrame(context, frame);
      await video.add(frame * duration, duration, { keyFrame: frame % (options.fps * 2) === 0 });
      options.onProgress?.((frame + 1) / options.frameCount * 0.94);
    }
    video.close();
  };
  const encodeAudio = async () => {
    if (!audio || !options.audio) return;
    await audio.add(options.audio);
    audio.close();
  };
  await Promise.all([encodeVideo(), encodeAudio()]);
  await output.finalize();
  if (!target.buffer) throw new Error("MP4 muxing finished without an output buffer.");
  options.onProgress?.(1);
  return new Blob([target.buffer], { type: "video/mp4" });
}
