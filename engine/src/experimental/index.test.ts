import { expect, test } from "bun:test";
import {
  createAudioWorkletWasmHost,
  createBoundedChunkStreamer,
  createCapabilityGatedInstanceCuller3D,
  createDeterministicSoundscape,
  createLocalNpcRuntime,
  createSpeechIntentMapper,
  createTextureTranscodeScheduler,
  createVoiceoverQueue,
  createWebCodecsReplayStream
} from "./index.ts";

test("experimental barrel exposes capability-gated adapter factories", () => {
  for (const factory of [
    createAudioWorkletWasmHost,
    createBoundedChunkStreamer,
    createCapabilityGatedInstanceCuller3D,
    createDeterministicSoundscape,
    createLocalNpcRuntime,
    createSpeechIntentMapper,
    createTextureTranscodeScheduler,
    createVoiceoverQueue,
    createWebCodecsReplayStream
  ]) expect(factory).toBeFunction();
});
