import { clamp01 } from "../utils/math";
import type { DevSignalSettings } from "./types";

const TWO_PI = Math.PI * 2;

function triangle(phase: number) {
  const wrapped = ((phase % 1) + 1) % 1;
  return 1 - Math.abs(wrapped * 2 - 1);
}

function pulse(phase: number, dutyCycle: number) {
  return (((phase % 1) + 1) % 1) < dutyCycle ? 1 : 0;
}

export function createProceduralSignalFrame(nowMs: number, settings: DevSignalSettings) {
  if (!settings.running || settings.profile === "idle") {
    return {
      energy: 0,
      leftEnergy: 0,
      modulation: 0,
      noise: 0,
      phase: 0,
      rightEnergy: 0,
      spectrumTilt: 0,
      spread: 0,
      transient: 0,
    };
  }

  const beatsPerSecond = Math.max(0.25, settings.tempo / 60);
  const phase = (nowMs / 1000) * beatsPerSecond;
  const wrapped = ((phase % 1) + 1) % 1;
  const intensity = clamp01(settings.intensity);
  const width = clamp01(settings.stereoWidth);

  let energy = 0;
  let transient = 0;
  let noise = 0;
  let modulation = 0;
  let spectrumTilt = 0;

  switch (settings.profile) {
    case "steady-tone":
      energy = 0.42 + 0.22 * Math.sin(TWO_PI * phase);
      transient = 0.12 + 0.08 * Math.sin(TWO_PI * phase * 2);
      noise = 0.03;
      modulation = 0.5 + 0.5 * Math.sin(TWO_PI * phase * 0.5);
      spectrumTilt = 0.2;
      break;
    case "noise-burst":
      energy = 0.2 + 0.45 * pulse(phase, 0.18) + 0.18 * Math.sin(TWO_PI * phase * 3);
      transient = 0.65 * pulse(phase, 0.08);
      noise = 0.85;
      modulation = 0.5 + 0.5 * Math.sin(TWO_PI * phase * 1.5);
      spectrumTilt = -0.25;
      break;
    case "sweep":
      energy = 0.24 + 0.38 * triangle(phase * 0.5) + 0.12 * Math.sin(TWO_PI * phase);
      transient = 0.18 + 0.08 * Math.sin(TWO_PI * phase * 0.75);
      noise = 0.08;
      modulation = triangle(phase * 0.4);
      spectrumTilt = Math.sin(TWO_PI * phase * 0.2) * 0.75;
      break;
    case "pulsed-groove":
    default:
      energy = 0.2 + 0.35 * pulse(phase, 0.28) + 0.16 * Math.sin(TWO_PI * phase * 2);
      transient = 0.4 * pulse(phase, 0.06) + 0.08 * Math.sin(TWO_PI * phase * 4);
      noise = 0.12 + 0.08 * pulse(phase, 0.18);
      modulation = 0.5 + 0.5 * Math.sin(TWO_PI * phase);
      spectrumTilt = 0.1 + 0.2 * Math.sin(TWO_PI * phase * 0.25);
      break;
  }

  energy = clamp01(energy * (0.45 + intensity * 0.75));
  transient = clamp01(transient * (0.35 + intensity * 0.8));
  noise = clamp01(noise * (0.25 + intensity * 0.75));

  const pan = Math.sin(TWO_PI * phase * 0.5) * width;
  const leftEnergy = clamp01(energy * (1 - pan * 0.45));
  const rightEnergy = clamp01(energy * (1 + pan * 0.45));

  return {
    energy,
    leftEnergy,
    modulation,
    noise,
    phase: wrapped,
    rightEnergy,
    spectrumTilt,
    spread: width,
    transient,
  };
}
