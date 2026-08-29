export type SfxEvent =
  | "attack"
  | "spell"
  | "gather"
  | "hit"
  | "hurt"
  | "kill"
  | "boss"
  | "npc-claw"
  | "npc-cast"
  | "npc-void"
  | "npc-sap"
  | "npc-spark"
  | "npc-heal"
  | "npc-phase"
  | "mace-cast"
  | "mace-projectile"
  | "mace-impact"
  | "bow-cast"
  | "bow-projectile"
  | "bow-impact"
  | "staff-cast"
  | "staff-projectile"
  | "staff-impact"
  | "wand-cast"
  | "wand-projectile"
  | "wand-impact"
  | "twin-cast"
  | "twin-projectile"
  | "twin-impact"
  | "blade-cast"
  | "blade-projectile"
  | "blade-impact"
  | "loot"
  | "quest"
  | "level"
  | "hazard"
  | "interact"
  | "death";

export type SfxPlayer = {
  unlock(): void;
  play(event: SfxEvent, intensity?: number): void;
};

type SfxAudioContext = Omit<AudioContextLike, "createBufferSource" | "createGain"> & Pick<
  AudioContext,
  "createBiquadFilter" | "createBuffer" | "createBufferSource" | "createGain" | "createOscillator" | "sampleRate"
>;

function isSfxAudioContext(context: AudioContextLike): context is SfxAudioContext {
  return "sampleRate" in context
    && typeof context.sampleRate === "number"
    && "createBuffer" in context
    && typeof context.createBuffer === "function"
    && "createOscillator" in context
    && typeof context.createOscillator === "function"
    && "createBiquadFilter" in context
    && typeof context.createBiquadFilter === "function";
}

function isBrowserAudioNode(node: AudioNodeLike): node is AudioNodeLike & AudioNode {
  return typeof AudioNode === "function" && node instanceof AudioNode;
}

function playTone(audio: AudioEngine, freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) {
  audio.withBus("sfx", (audioContext, destination) => {
    if (!isSfxAudioContext(audioContext)) throw new Error("SFX playback requires a browser AudioContext");
    if (!isBrowserAudioNode(destination)) throw new Error("SFX playback requires a browser AudioNode destination");
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  });
}

function playNoise(audio: AudioEngine, duration: number, gain: number, filterFreq: number) {
  audio.withBus("sfx", (audioContext, destination) => {
    if (!isSfxAudioContext(audioContext)) throw new Error("SFX playback requires a browser AudioContext");
    if (!isBrowserAudioNode(destination)) throw new Error("SFX playback requires a browser AudioNode destination");
    const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
    const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const amp = audioContext.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    amp.gain.setValueAtTime(gain, audioContext.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start();
  });
}

export function createSfx(): SfxPlayer {
  const audio = createAudioEngine({ buses: ["sfx"], maxVoices: 0 });
  let unlocked = false;
  const lastPlay = new Map<SfxEvent, number>();

  function unlock() {
    unlocked = true;
    void audio.unlock().then(() => audio.setMasterGain(0.22)).catch(() => { unlocked = false; });
  }

  function tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number) {
    playTone(audio, freq, duration, type, gain, slideTo);
  }

  function noise(duration: number, gain: number, filterFreq: number) {
    playNoise(audio, duration, gain, filterFreq);
  }

  function play(event: SfxEvent, intensity = 1) {
    if (!unlocked) return;
    const nowMs = performance.now();
    const last = lastPlay.get(event) ?? 0;
    if (nowMs - last < 38) return;
    lastPlay.set(event, nowMs);
    const power = Math.max(0.4, Math.min(1.8, intensity));
    switch (event) {
      case "attack":
        tone(220 * power, 0.08, "square", 0.045);
        noise(0.045, 0.025, 1800);
        break;
      case "spell":
        tone(320, 0.16, "sawtooth", 0.04, 680 * power);
        tone(640, 0.1, "triangle", 0.025);
        break;
      case "gather":
        tone(140, 0.07, "triangle", 0.04, 95);
        noise(0.08, 0.026, 950);
        break;
      case "hit":
        tone(150 * power, 0.075, "sawtooth", 0.05, 90);
        noise(0.055, 0.035, 1200);
        break;
      case "hurt":
        tone(180, 0.18, "sawtooth", 0.055, 82);
        break;
      case "kill":
        tone(180, 0.09, "square", 0.05, 320);
        tone(420, 0.12, "triangle", 0.035, 720);
        break;
      case "boss":
        tone(85, 0.28, "sawtooth", 0.07, 55);
        tone(260, 0.24, "square", 0.035, 130);
        noise(0.18, 0.045, 700);
        break;
      case "npc-claw":
        tone(132 * power, 0.09, "sawtooth", 0.042, 76);
        noise(0.065, 0.03, 1500);
        break;
      case "npc-cast":
        tone(260, 0.13, "triangle", 0.032, 540 * power);
        noise(0.05, 0.014, 2200);
        break;
      case "npc-void":
        tone(180, 0.16, "sawtooth", 0.04, 62);
        tone(360, 0.08, "triangle", 0.022, 250);
        break;
      case "npc-sap":
        tone(110 * power, 0.11, "triangle", 0.045, 82);
        noise(0.08, 0.024, 680);
        break;
      case "npc-spark":
        tone(620, 0.05, "square", 0.036, 900 * power);
        tone(310, 0.06, "triangle", 0.02);
        noise(0.045, 0.018, 3200);
        break;
      case "npc-heal":
        tone(360, 0.12, "sine", 0.032, 540);
        tone(540, 0.15, "triangle", 0.024, 720 * power);
        break;
      case "npc-phase":
        tone(420, 0.12, "triangle", 0.028, 840);
        tone(210, 0.14, "sine", 0.022, 315);
        break;
      case "mace-cast":
        tone(118, 0.11, "triangle", 0.042, 86);
        noise(0.07, 0.026, 700);
        break;
      case "mace-projectile":
        tone(150, 0.15, "sawtooth", 0.038, 92);
        noise(0.12, 0.03, 540);
        break;
      case "mace-impact":
        tone(96 * power, 0.14, "square", 0.058, 52);
        noise(0.105, 0.046, 680);
        break;
      case "bow-cast":
        tone(250, 0.09, "triangle", 0.026, 175);
        noise(0.035, 0.014, 1800);
        break;
      case "bow-projectile":
        tone(540, 0.055, "triangle", 0.034, 840 * power);
        noise(0.026, 0.014, 3600);
        break;
      case "bow-impact":
        tone(210 * power, 0.07, "square", 0.038, 118);
        noise(0.045, 0.026, 2400);
        break;
      case "staff-cast":
        tone(310, 0.17, "triangle", 0.036, 660 * power);
        tone(465, 0.12, "sine", 0.022, 930);
        break;
      case "staff-projectile":
        tone(520, 0.1, "triangle", 0.032, 980 * power);
        tone(260, 0.08, "sine", 0.018, 390);
        break;
      case "staff-impact":
        tone(220 * power, 0.13, "sawtooth", 0.044, 440);
        noise(0.075, 0.022, 1900);
        break;
      case "wand-cast":
        tone(720, 0.07, "sine", 0.028, 940);
        tone(480, 0.1, "triangle", 0.02, 720 * power);
        break;
      case "wand-projectile":
        tone(760, 0.05, "square", 0.026, 1160 * power);
        tone(520, 0.06, "triangle", 0.018, 780);
        break;
      case "wand-impact":
        tone(360 * power, 0.1, "sawtooth", 0.036, 180);
        noise(0.045, 0.018, 2600);
        break;
      case "twin-cast":
        tone(310, 0.045, "square", 0.032, 520);
        tone(420, 0.045, "square", 0.026, 250);
        break;
      case "twin-projectile":
        tone(620, 0.045, "triangle", 0.03, 380);
        noise(0.032, 0.014, 3000);
        break;
      case "twin-impact":
        tone(260 * power, 0.065, "sawtooth", 0.04, 140);
        noise(0.05, 0.025, 1700);
        break;
      case "blade-cast":
        tone(190, 0.1, "sawtooth", 0.038, 130);
        noise(0.05, 0.018, 1250);
        break;
      case "blade-projectile":
        tone(430, 0.095, "sawtooth", 0.034, 720 * power);
        noise(0.06, 0.02, 2800);
        break;
      case "blade-impact":
        tone(135 * power, 0.11, "square", 0.052, 78);
        tone(270, 0.07, "triangle", 0.022, 185);
        noise(0.065, 0.034, 1500);
        break;
      case "loot":
        tone(520, 0.08, "triangle", 0.035, 780);
        tone(780, 0.1, "triangle", 0.025, 1040);
        break;
      case "quest":
        tone(330, 0.12, "triangle", 0.04, 660);
        tone(495, 0.14, "triangle", 0.032, 990);
        break;
      case "level":
        tone(392, 0.14, "triangle", 0.045, 784);
        tone(523, 0.18, "triangle", 0.035, 1046);
        break;
      case "hazard":
        tone(240, 0.13, "sawtooth", 0.035, 120);
        noise(0.1, 0.022, 600);
        break;
      case "interact":
        tone(420, 0.08, "sine", 0.03, 500);
        break;
      case "death":
        tone(150, 0.34, "sawtooth", 0.06, 48);
        noise(0.22, 0.04, 520);
        break;
    }
  }

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  return { unlock, play };
}
import {
  createAudioEngine,
  type AudioContextLike,
  type AudioEngine,
  type AudioNodeLike
} from "@hyperfocus/engine/audio";
