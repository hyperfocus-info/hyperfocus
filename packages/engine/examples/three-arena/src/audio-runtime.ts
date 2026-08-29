import { createAudioEngine, type AudioContextLike, type AudioNodeLike } from "@hyperfocus/engine/audio";

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
        if (!isBrowserAudioContext(context)) throw new Error("Three Arena requires a browser AudioContext.");
        graph.master = requireGainNode(destination, "master");
        return context;
      });
      engine.withBus("music", (_context, destination) => { graph.music = requireGainNode(destination, "music"); });
      engine.withBus("sfx", (_context, destination) => { graph.sfx = requireGainNode(destination, "sfx"); });
      apply(mix);
      void engine.unlock().catch(() => undefined);
      return graph.context;
    } catch {
      return null;
    }
  }

  return { graph, ensure, apply, dispose: () => engine.dispose() };
}

function isBrowserAudioContext(context: AudioContextLike): context is AudioContext {
  return typeof Reflect.get(context, "createBiquadFilter") === "function"
    && typeof Reflect.get(context, "createBuffer") === "function"
    && typeof Reflect.get(context, "createOscillator") === "function"
    && typeof Reflect.get(context, "sampleRate") === "number";
}

function requireGainNode(node: AudioNodeLike, bus: string): GainNode {
  if (!isBrowserGainNode(node)) {
    throw new Error(`Three Arena audio bus ${bus} did not provide a GainNode.`);
  }
  return node;
}

function isBrowserGainNode(node: AudioNodeLike): node is GainNode {
  return "gain" in node
    && typeof node.gain === "object"
    && node.gain !== null
    && "context" in node
    && typeof Reflect.get(node, "addEventListener") === "function";
}
