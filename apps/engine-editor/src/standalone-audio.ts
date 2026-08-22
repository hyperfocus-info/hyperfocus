import { createAudioEngine, type AudioEngine, type AudioVoiceHandle } from "../../../engine/src/audio/index.ts";
import type { PlayableAudioCommand } from "../../../engine/src/project/runtime-2d.ts";

const MAX_PENDING_COMMANDS = 4_096;

export type StandaloneAudioAsset = { id: string; mimeType: string; bytes: Uint8Array };

type StandaloneAudioEngine = Pick<AudioEngine, "decode" | "dispose" | "hasBuffer" | "playBuffer" | "setMasterGain" | "unlock">;

export type StandaloneAudioControllerOptions = {
  engine?: StandaloneAudioEngine;
  masterVolume?: number;
  onError?: (error: Error) => void;
};

/** Bridges deterministic world commands to the first-party bounded Web Audio engine. */
export function createStandaloneAudioController(assets: readonly StandaloneAudioAsset[], options: StandaloneAudioControllerOptions = {}) {
  const engine = options.engine ?? createAudioEngine();
  const audioAssets = new Map(assets.filter((asset) => asset.mimeType.startsWith("audio/")).map((asset) => [asset.id, new Uint8Array(asset.bytes)]));
  const pending: PlayableAudioCommand[] = [];
  const voicesByScene = new Map<string, Set<AudioVoiceHandle>>();
  const decoding = new Map<string, Promise<void>>();
  let unlocked = false;
  let disposed = false;
  let flushChain = Promise.resolve();

  function enqueue(commands: readonly PlayableAudioCommand[]) {
    if (disposed) return;
    for (const command of commands) {
      if (command.type === "stop-scene") stopScene(command.sceneId);
      else if (pending.length < MAX_PENDING_COMMANDS) pending.push({ ...command });
      else options.onError?.(new Error(`Standalone audio queue reached its ${MAX_PENDING_COMMANDS} command limit.`));
    }
    if (unlocked) scheduleFlush();
  }

  async function unlockAndFlush() {
    if (disposed) return;
    if (!unlocked) {
      await engine.unlock();
      engine.setMasterGain(clamp(options.masterVolume ?? 1, 0, 1));
      unlocked = true;
    }
    scheduleFlush();
    await flushChain;
  }

  function scheduleFlush() {
    flushChain = flushChain.then(flush).catch((cause) => {
      options.onError?.(cause instanceof Error ? cause : new Error(String(cause)));
    });
  }

  async function flush() {
    while (unlocked && pending.length && !disposed) {
      const command = pending.shift()!;
      if (command.type !== "play") continue;
      const bytes = audioAssets.get(command.assetId);
      if (!bytes) {
        options.onError?.(new Error(`Standalone audio asset is missing from assets.hfp: ${command.assetId}`));
        continue;
      }
      if (!engine.hasBuffer(command.assetId)) {
        let operation = decoding.get(command.assetId);
        if (!operation) {
          operation = engine.decode(command.assetId, bytes).then(() => undefined).finally(() => decoding.delete(command.assetId));
          decoding.set(command.assetId, operation);
        }
        await operation;
      }
      const result = engine.playBuffer(command.assetId, {
        bus: command.bus,
        gain: command.gain,
        pan: command.pan,
        loop: command.loop,
        priority: command.priority,
      });
      if (!result.ok) {
        options.onError?.(new Error(result.message));
        continue;
      }
      let voices = voicesByScene.get(command.sceneId);
      if (!voices) voicesByScene.set(command.sceneId, voices = new Set());
      for (const voice of voices) if (!voice.active) voices.delete(voice);
      voices.add(result.voice);
    }
  }

  function stopScene(sceneId: string) {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index]?.type === "play" && pending[index].sceneId === sceneId) pending.splice(index, 1);
    }
    const voices = voicesByScene.get(sceneId);
    if (!voices) return;
    for (const voice of voices) voice.stop();
    voicesByScene.delete(sceneId);
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    pending.length = 0;
    for (const sceneId of [...voicesByScene.keys()]) stopScene(sceneId);
    await engine.dispose();
  }

  return {
    enqueue,
    unlockAndFlush,
    stopScene,
    dispose,
    pendingCount() { return pending.length; },
    isUnlocked() { return unlocked; },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
