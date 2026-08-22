import { createAudioEngine } from "@hyperfocus/engine/audio";

export type ArenaAudioMix = {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
};

export function createArenaAudioRuntime(masterScale: number) {
  const engine = createAudioEngine({ buses: ["music", "sfx"], maxVoices: 0 });
  const graph: {
    context: AudioContext | null;
    master: GainNode | null;
    music: GainNode | null;
    sfx: GainNode | null;
  } = { context: null, master: null, music: null, sfx: null };

  function apply(mix: ArenaAudioMix) {
    if (!graph.context) return;
    engine.setMasterGain(masterScale * mix.master * (mix.muted ? 0 : 1));
    engine.setBusGain("music", 0.18 * mix.music);
    engine.setBusGain("sfx", 0.72 * mix.sfx);
  }

  function ensure(mix: ArenaAudioMix): AudioContext | null {
    if (graph.context) {
      void engine.unlock().catch(() => undefined);
      apply(mix);
      return graph.context;
    }
    try {
      graph.context = engine.withBus("master", (context, destination) => {
        graph.master = destination as GainNode;
        return context as AudioContext;
      });
      engine.withBus("music", (_context, destination) => { graph.music = destination as GainNode; });
      engine.withBus("sfx", (_context, destination) => { graph.sfx = destination as GainNode; });
      apply(mix);
      void engine.unlock().catch(() => undefined);
      return graph.context;
    } catch {
      return null;
    }
  }

  return { graph, ensure, apply, dispose: () => engine.dispose() };
}
