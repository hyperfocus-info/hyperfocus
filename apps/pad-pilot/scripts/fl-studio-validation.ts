import decode from "audio-decode";
import path from "node:path";

export type FlStudioTargetId = "fl21" | "fl26";

type AudioData = {
  readonly channelData: readonly Float32Array[];
  readonly sampleRate: number;
};

type HostRender = {
  readonly controls: AudioData;
  readonly unity: AudioData;
};

export const flStudioTargetDefaults = Object.freeze({
  fl21: "C:/Program Files/Image-Line/FL Studio 21/FL64.exe",
  fl26: "C:/Program Files/Image-Line/FL Studio 2026/FL64.exe",
});

export const flStudioFixtureNames = Object.freeze({
  fl21: Object.freeze({
    controls: "padpilot-controls-fl21.flp",
    unity: "padpilot-unity-fl21.flp",
  }),
  fl26: Object.freeze({
    controls: "padpilot-controls-fl26.flp",
    unity: "padpilot-unity-fl26.flp",
  }),
  reference: "padpilot-host-input.wav",
});

const referenceSampleRate = 48_000;
const referenceSeconds = 1;
const referencePeakAmplitude = 10 ** (-18 / 20);
const segmentMarginSeconds = 0.1;

export function parseFlStudioValidationArguments(args: string[]) {
  let action: "prepare" | "probe" | "validate" = "validate";
  let actionSet = false;
  let fixtureDirectory = "";
  let fl21Executable = "";
  let fl26Executable = "";
  let only: "all" | FlStudioTargetId = "all";
  let outputDirectory = "";
  const assigned = new Set<string>();

  const takeValue = (argument: string, index: number) => {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    return value;
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--prepare" || argument === "--probe") {
      if (actionSet) throw new Error("Specify only one FL Studio validation action.");
      action = argument === "--prepare" ? "prepare" : "probe";
      actionSet = true;
      continue;
    }
    if (!argument || assigned.has(argument)) {
      throw new Error(`Unknown or repeated argument: ${argument}`);
    }
    assigned.add(argument);
    switch (argument) {
      case "--fixtures":
        fixtureDirectory = takeValue(argument, index++);
        break;
      case "--fl21":
        fl21Executable = takeValue(argument, index++);
        break;
      case "--fl26":
        fl26Executable = takeValue(argument, index++);
        break;
      case "--only": {
        const value = takeValue(argument, index++);
        if (value !== "all" && value !== "fl21" && value !== "fl26") {
          throw new Error("--only must be all, fl21, or fl26.");
        }
        only = value;
        break;
      }
      case "--output":
        outputDirectory = takeValue(argument, index++);
        break;
      default:
        throw new Error(`Unknown or repeated argument: ${argument}`);
    }
  }

  return {
    action,
    fixtureDirectory,
    fl21Executable,
    fl26Executable,
    only,
    outputDirectory,
  };
}

export function createFlStudioReferenceWaveBytes() {
  const channelCount = 2;
  const frameCount = referenceSampleRate * referenceSeconds;
  const samples = new Float32Array(frameCount * channelCount);
  let rawPeak = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / referenceSampleRate;
    const envelope = 0.72 + Math.sin(Math.PI * 2 * 2 * time) * 0.18;
    const left = envelope * (
      Math.sin(Math.PI * 2 * 997 * time) * 0.72
      + Math.sin(Math.PI * 2 * 113 * time) * 0.28
    );
    const right = envelope * (
      Math.sin(Math.PI * 2 * 997 * time + 0.31) * 0.68
      + Math.sin(Math.PI * 2 * 173 * time) * 0.32
    );
    samples[frame * channelCount] = left;
    samples[frame * channelCount + 1] = right;
    rawPeak = Math.max(rawPeak, Math.abs(left), Math.abs(right));
  }
  const scale = referencePeakAmplitude / rawPeak;

  const bytesPerSample = 4;
  const dataBytes = samples.length * bytesPerSample;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(3, 20);
  wave.writeUInt16LE(channelCount, 22);
  wave.writeUInt32LE(referenceSampleRate, 24);
  wave.writeUInt32LE(referenceSampleRate * channelCount * bytesPerSample, 28);
  wave.writeUInt16LE(channelCount * bytesPerSample, 32);
  wave.writeUInt16LE(bytesPerSample * 8, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    wave.writeFloatLE(samples[index] * scale, 44 + index * bytesPerSample);
  }
  return new Uint8Array(wave);
}

export function fixturePaths(fixtureDirectory: string, target: FlStudioTargetId) {
  const names = flStudioFixtureNames[target];
  const root = path.resolve(fixtureDirectory);
  return Object.freeze({
    controls: path.join(root, names.controls),
    reference: path.join(root, flStudioFixtureNames.reference),
    unity: path.join(root, names.unity),
  });
}

export function buildFlStudioRenderCommand(
  executable: string,
  fixture: string,
  outputWave: string,
) {
  return [
    path.resolve(executable),
    "/D",
    "/Ewav",
    `/R${path.resolve(outputWave)}`,
    path.resolve(fixture),
  ];
}

export function buildFlStudioProcessCheckCommand() {
  return [
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "@(Get-Process -Name FL64 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)",
  ];
}

function amplitudeToDb(value: number) {
  return value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY;
}

function deltaDb(left: number, right: number) {
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  return Math.abs(left - right);
}

export function measureAudio(audio: AudioData, startSeconds = 0, endSeconds?: number) {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0 || audio.channelData.length === 0) {
    throw new Error("Audio measurement requires channels and a positive sample rate.");
  }
  const frameCount = Math.min(...audio.channelData.map((channel) => channel.length));
  const startFrame = Math.max(0, Math.min(frameCount, Math.round(startSeconds * audio.sampleRate)));
  const requestedEnd = endSeconds === undefined ? frameCount : Math.round(endSeconds * audio.sampleRate);
  const endFrame = Math.max(startFrame, Math.min(frameCount, requestedEnd));
  let invalidSampleCount = 0;
  let peak = 0;
  let sampleCount = 0;
  let squareSum = 0;
  for (const channel of audio.channelData) {
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const sample = channel[frame];
      sampleCount += 1;
      if (!Number.isFinite(sample)) {
        invalidSampleCount += 1;
        continue;
      }
      peak = Math.max(peak, Math.abs(sample));
      squareSum += sample * sample;
    }
  }
  const rms = sampleCount > invalidSampleCount
    ? Math.sqrt(squareSum / (sampleCount - invalidSampleCount))
    : Number.NaN;
  return Object.freeze({
    channelCount: audio.channelData.length,
    durationSeconds: frameCount / audio.sampleRate,
    invalidSampleCount,
    peak,
    peakDbfs: amplitudeToDb(peak),
    rms,
    rmsDbfs: amplitudeToDb(rms),
    sampleRate: audio.sampleRate,
  });
}

function compareReference(
  failures: string[],
  label: string,
  reference: ReturnType<typeof measureAudio>,
  candidate: ReturnType<typeof measureAudio>,
  toleranceDb: number,
) {
  if (candidate.invalidSampleCount !== 0) failures.push(`${label}: non-finite samples.`);
  if (candidate.channelCount !== reference.channelCount) failures.push(`${label}: channel count changed.`);
  if (candidate.sampleRate !== reference.sampleRate) {
    failures.push(
      `${label}: sample rate is ${candidate.sampleRate} Hz; expected ${reference.sampleRate} Hz `
      + "(set FL Options > Audio Settings > Sample rate).",
    );
  }
  if (deltaDb(candidate.peakDbfs, reference.peakDbfs) > toleranceDb) {
    failures.push(`${label}: peak differs by more than ${toleranceDb} dB.`);
  }
  if (deltaDb(candidate.rmsDbfs, reference.rmsDbfs) > toleranceDb) {
    failures.push(`${label}: RMS differs by more than ${toleranceDb} dB.`);
  }
}

function compareAlignedSamples(
  failures: string[],
  label: string,
  reference: AudioData,
  candidate: AudioData,
  referenceStartSeconds: number,
  candidateStartSeconds: number,
  durationSeconds: number,
  maximumAbsoluteError: number,
) {
  if (reference.sampleRate !== candidate.sampleRate
      || reference.channelData.length !== candidate.channelData.length) {
    return;
  }
  const frameCount = Math.round(durationSeconds * reference.sampleRate);
  const referenceStart = Math.round(referenceStartSeconds * reference.sampleRate);
  const candidateStart = Math.round(candidateStartSeconds * candidate.sampleRate);
  if (frameCount <= 0 || reference.channelData.some((channel) => referenceStart + frameCount > channel.length)
      || candidate.channelData.some((channel) => candidateStart + frameCount > channel.length)) {
    failures.push(`${label}: aligned sample window is incomplete.`);
    return;
  }
  let invalidSampleCount = 0;
  let maximumError = 0;
  for (let channelIndex = 0; channelIndex < reference.channelData.length; channelIndex += 1) {
    const referenceChannel = reference.channelData[channelIndex];
    const candidateChannel = candidate.channelData[channelIndex];
    for (let frame = 0; frame < frameCount; frame += 1) {
      const referenceSample = referenceChannel[referenceStart + frame];
      const candidateSample = candidateChannel[candidateStart + frame];
      if (!Number.isFinite(referenceSample) || !Number.isFinite(candidateSample)) {
        invalidSampleCount += 1;
        continue;
      }
      maximumError = Math.max(maximumError, Math.abs(referenceSample - candidateSample));
    }
  }
  if (invalidSampleCount > 0) failures.push(`${label}: non-finite aligned samples.`);
  if (maximumError > maximumAbsoluteError) {
    failures.push(`${label}: maximum sample error ${maximumError} exceeds ${maximumAbsoluteError}.`);
  }
}

export function evaluateFlStudioHostRender(referenceAudio: AudioData, render: HostRender) {
  const failures: string[] = [];
  const reference = measureAudio(referenceAudio);
  const unity = measureAudio(render.unity);
  if (Math.abs(unity.durationSeconds - reference.durationSeconds) > 1 / reference.sampleRate) {
    failures.push(
      `unity: duration is ${unity.durationSeconds} s; expected ${reference.durationSeconds} s `
      + "(the Unity project must contain exactly one source clip).",
    );
  }
  compareReference(failures, "unity", reference, unity, 0.01);
  compareAlignedSamples(
    failures,
    "unity waveform",
    referenceAudio,
    render.unity,
    0,
    0,
    reference.durationSeconds,
    1e-5,
  );

  const controls = measureAudio(render.controls);
  if (Math.abs(controls.durationSeconds - 4) > 0.05) {
    failures.push(`controls: duration is ${controls.durationSeconds} s; expected 4 s (use four contiguous source clips).`);
  }
  const segment = (index: number) => measureAudio(
    render.controls,
    index + segmentMarginSeconds,
    index + 1 - segmentMarginSeconds,
  );
  const dry = segment(0);
  const wet = segment(1);
  const secondDry = segment(2);
  const restoredWet = segment(3);
  compareReference(failures, "controls dry", reference, dry, 0.01);
  compareAlignedSamples(
    failures,
    "controls dry waveform",
    referenceAudio,
    render.controls,
    segmentMarginSeconds,
    segmentMarginSeconds,
    1 - segmentMarginSeconds * 2,
    1e-5,
  );
  compareReference(failures, "controls second dry", reference, secondDry, 0.01);
  compareAlignedSamples(
    failures,
    "controls second dry waveform",
    referenceAudio,
    render.controls,
    segmentMarginSeconds,
    2 + segmentMarginSeconds,
    1 - segmentMarginSeconds * 2,
    1e-5,
  );
  if (wet.invalidSampleCount !== 0 || restoredWet.invalidSampleCount !== 0) {
    failures.push("controls wet: non-finite samples.");
  }
  const wetDifference = Math.max(
    deltaDb(wet.peakDbfs, reference.peakDbfs),
    deltaDb(wet.rmsDbfs, reference.rmsDbfs),
  );
  if (wetDifference < 0.5) {
    failures.push(
      `controls wet: effect changed level by only ${wetDifference.toFixed(3)} dB; expected at least 0.5 dB `
      + "(apply the Controls preset and automate PadPilot Master Wet/Dry, not the wrapper Mix level).",
    );
  }
  if (wet.peak >= 1 || restoredWet.peak >= 1) failures.push("controls wet: clipped full scale.");
  if (deltaDb(wet.peakDbfs, restoredWet.peakDbfs) > 0.01
      || deltaDb(wet.rmsDbfs, restoredWet.rmsDbfs) > 0.01) {
    failures.push("controls restored wet: output does not match first wet segment within 0.01 dB.");
  }
  compareAlignedSamples(
    failures,
    "controls restored wet waveform",
    render.controls,
    render.controls,
    1 + segmentMarginSeconds,
    3 + segmentMarginSeconds,
    1 - segmentMarginSeconds * 2,
    2e-5,
  );

  return Object.freeze({
    failures: Object.freeze(failures),
    metrics: Object.freeze({ controls, dry, reference, restoredWet, secondDry, unity, wet }),
    passed: failures.length === 0,
  });
}

export function evaluateFlStudioCrossVersion(
  fl21: ReturnType<typeof evaluateFlStudioHostRender>,
  fl26: ReturnType<typeof evaluateFlStudioHostRender>,
) {
  const failures: string[] = [];
  for (const segment of ["unity", "dry", "wet", "secondDry", "restoredWet"] as const) {
    const left = fl21.metrics[segment];
    const right = fl26.metrics[segment];
    if (deltaDb(left.peakDbfs, right.peakDbfs) > 0.05
        || deltaDb(left.rmsDbfs, right.rmsDbfs) > 0.05) {
      failures.push(`${segment}: FL21 and FL26 differ by more than 0.05 dB.`);
    }
  }
  return Object.freeze({ failures: Object.freeze(failures), passed: failures.length === 0 });
}

export async function decodeAudioData(bytes: Uint8Array) {
  const audio = await decode(bytes);
  return Object.freeze({ channelData: audio.channelData, sampleRate: audio.sampleRate });
}
