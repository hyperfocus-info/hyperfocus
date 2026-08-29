import { clamp } from "../../utils/math";

export const RECUT_ANALYSIS_WINDOW_SIZE = 1024;
export const RECUT_ANALYSIS_HOP_SIZE = 256;
export const RECUT_MINIMUM_SLICE_SPACING = 512;

const AUTO_DENSITY_MIN_ADMISSION = 0.10;
const AUTO_DENSITY_MAX_ADMISSION = 0.75;
const AUTO_MIN_CONFIDENCE = 0.08;

type FftPlan = {
  bitReverse: Uint16Array;
  cos: Float32Array;
  sin: Float32Array;
};

type BucketSelection = {
  slotIndex: number;
  candidate: RecutTransientCandidate;
};

export type RecutTransientCandidate = {
  bucketIndex: number;
  frame: number;
  intensity: number;
};

export type RecutTransientDetection = {
  candidateFrames: number[];
  candidates: RecutTransientCandidate[];
};

export type RecutAutoSlice = {
  markers: Array<{
    confidence: number;
    endFrame: number;
    padIndex: number;
    startFrame: number;
    transientFrame: number;
  }>;
  padAssignments: Array<{
    bank: number;
    chokeGroupId: number;
    faceButton: string;
    isEmpty: boolean;
    padIndex: number;
    sliceIndex: number;
  }>;
};

let cachedFftPlan: FftPlan | null = null;
let cachedWindow: Float32Array | null = null;

function getFftPlan(size: number) {
  if (cachedFftPlan && cachedWindow && cachedWindow.length === size) {
    return { plan: cachedFftPlan, window: cachedWindow };
  }

  const bitReverse = new Uint16Array(size);
  let bits = 0;
  while ((1 << bits) < size) {
    bits += 1;
  }
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>= 1;
    }
    bitReverse[index] = reversed;
  }

  const cos = new Float32Array(size / 2);
  const sin = new Float32Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    const angle = (-2 * Math.PI * index) / size;
    cos[index] = Math.cos(angle);
    sin[index] = Math.sin(angle);
  }

  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));
  }

  cachedFftPlan = { bitReverse, cos, sin };
  cachedWindow = window;
  return { plan: cachedFftPlan, window: cachedWindow };
}

function fftMagnitudes(samples: ArrayLike<number>, offset: number, plan: FftPlan, window: Float32Array) {
  const size = window.length;
  const real = new Float32Array(size);
  const imaginary = new Float32Array(size);

  for (let index = 0; index < size; index += 1) {
    real[index] = (samples[offset + index] ?? 0) * window[index]!;
  }

  for (let index = 0; index < size; index += 1) {
    const reversed = plan.bitReverse[index]!;
    if (reversed <= index) {
      continue;
    }
    const tempReal = real[index]!;
    const tempImaginary = imaginary[index]!;
    real[index] = real[reversed]!;
    imaginary[index] = imaginary[reversed]!;
    real[reversed] = tempReal;
    imaginary[reversed] = tempImaginary;
  }

  for (let length = 2; length <= size; length <<= 1) {
    const half = length >> 1;
    const step = size / length;
    for (let start = 0; start < size; start += length) {
      for (let index = 0; index < half; index += 1) {
        const twiddle = index * step;
        const cos = plan.cos[twiddle]!;
        const sin = plan.sin[twiddle]!;
        const evenIndex = start + index;
        const oddIndex = evenIndex + half;
        const oddReal = real[oddIndex]!;
        const oddImaginary = imaginary[oddIndex]!;
        const tempReal = oddReal * cos - oddImaginary * sin;
        const tempImaginary = oddReal * sin + oddImaginary * cos;

        real[oddIndex] = real[evenIndex]! - tempReal;
        imaginary[oddIndex] = imaginary[evenIndex]! - tempImaginary;
        real[evenIndex] += tempReal;
        imaginary[evenIndex] += tempImaginary;
      }
    }
  }

  const magnitudes = new Float32Array(size / 2);
  for (let index = 0; index < size / 2; index += 1) {
    const realValue = real[index]!;
    const imaginaryValue = imaginary[index]!;
    magnitudes[index] = Math.sqrt(realValue * realValue + imaginaryValue * imaginaryValue);
  }
  return magnitudes;
}

function median(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function neighborhoodMedian(values: readonly number[], index: number, radius: number) {
  const start = Math.max(0, index - radius);
  const end = Math.min(values.length, index + radius + 1);
  return median(values.slice(start, end));
}

function admissionThreshold(intensities: readonly number[], density: number) {
  if (intensities.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const sorted = [...intensities].sort((left, right) => right - left);
  const keepRatio = AUTO_DENSITY_MIN_ADMISSION + clamp(density, 0, 1) * (AUTO_DENSITY_MAX_ADMISSION - AUTO_DENSITY_MIN_ADMISSION);
  const keepCount = clamp(Math.ceil(sorted.length * keepRatio), 1, sorted.length);
  return sorted[keepCount - 1] ?? sorted[sorted.length - 1] ?? 0;
}

function createPadAssignments(length = 16) {
  return Array.from({ length }, (_, index) => ({
    bank: Math.floor(index / 4),
    chokeGroupId: 0,
    faceButton: ["X", "Y", "A", "B"][index % 4] ?? "X",
    isEmpty: true,
    padIndex: index,
    sliceIndex: 0,
  }));
}

function assignSparsePads(count: number) {
  if (count <= 0) {
    return [];
  }
  if (count === 1) {
    return [0];
  }

  const padIndices: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const remainingSlices = count - index - 1;
    const suggested = Math.round((index * 15) / (count - 1));
    const lowerBound = index === 0 ? 0 : (padIndices[index - 1] ?? 0) + 1;
    const upperBound = 15 - remainingSlices;
    padIndices.push(clamp(suggested, lowerBound, upperBound));
  }
  return padIndices;
}

function findBorrowCandidate(
  bucketIndex: number,
  bucketCenters: readonly number[],
  candidates: readonly RecutTransientCandidate[],
  usedFrames: ReadonlySet<number>,
) {
  for (let radius = 1; radius < 16; radius += 1) {
    const ring = candidates.filter((candidate) =>
      !usedFrames.has(candidate.frame) &&
      Math.abs(candidate.bucketIndex - bucketIndex) === radius,
    );
    if (ring.length === 0) {
      continue;
    }
    return ring.sort((left, right) => {
      if (right.intensity !== left.intensity) {
        return right.intensity - left.intensity;
      }
      const leftDistance = Math.abs(left.frame - (bucketCenters[bucketIndex] ?? left.frame));
      const rightDistance = Math.abs(right.frame - (bucketCenters[bucketIndex] ?? right.frame));
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.frame - right.frame;
    })[0] ?? null;
  }
  return null;
}

function candidateValidForNeighbors(
  selections: readonly BucketSelection[],
  slotIndex: number,
  candidate: RecutTransientCandidate,
  closeThreshold: number,
) {
  const sorted = selections
    .filter((selection) => selection.slotIndex !== slotIndex)
    .concat({ slotIndex, candidate })
    .sort((left, right) => left.candidate.frame - right.candidate.frame);
  const index = sorted.findIndex((selection) => selection.slotIndex === slotIndex);
  if (index < 0) {
    return false;
  }
  const previous = sorted[index - 1]?.candidate;
  const next = sorted[index + 1]?.candidate;
  if (previous && candidate.frame - previous.frame < closeThreshold) {
    return false;
  }
  if (next && next.frame - candidate.frame < closeThreshold) {
    return false;
  }
  return true;
}

function findReplacementCandidate(
  selections: readonly BucketSelection[],
  slotIndex: number,
  slotBucketIndex: number,
  admitted: readonly RecutTransientCandidate[],
  closeThreshold: number,
) {
  const usedFrames = new Set(
    selections
      .filter((selection) => selection.slotIndex !== slotIndex)
      .map((selection) => selection.candidate.frame),
  );
  for (let radius = 0; radius < 16; radius += 1) {
    const pool = admitted.filter((candidate) =>
      !usedFrames.has(candidate.frame) &&
      Math.abs(candidate.bucketIndex - slotBucketIndex) === radius,
    );
    if (pool.length === 0) {
      continue;
    }
    const ordered = pool.sort((left, right) => {
      if (right.intensity !== left.intensity) {
        return right.intensity - left.intensity;
      }
      return left.frame - right.frame;
    });
    for (const candidate of ordered) {
      if (candidateValidForNeighbors(selections, slotIndex, candidate, closeThreshold)) {
        return candidate;
      }
    }
  }
  return null;
}

function repairTooCloseSelections(
  selections: BucketSelection[],
  admitted: readonly RecutTransientCandidate[],
  bucketWidth: number,
) {
  const closeThreshold = Math.max(RECUT_MINIMUM_SLICE_SPACING, Math.round(bucketWidth / 4));
  if (selections.length < 2) {
    return selections;
  }

  let updated = [...selections];
  for (let pass = 0; pass < 2; pass += 1) {
    const ordered = [...updated].sort((left, right) => left.candidate.frame - right.candidate.frame);
    let changed = false;
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1]!;
      const right = ordered[index]!;
      if (right.candidate.frame - left.candidate.frame >= closeThreshold) {
        continue;
      }
      const weaker = left.candidate.intensity < right.candidate.intensity ? left : right;
      const replacement = findReplacementCandidate(updated, weaker.slotIndex, weaker.slotIndex, admitted, closeThreshold);
      if (!replacement || replacement.frame === weaker.candidate.frame) {
        continue;
      }
      updated = updated.map((selection) =>
        selection.slotIndex === weaker.slotIndex
          ? { slotIndex: weaker.slotIndex, candidate: replacement }
          : selection,
      );
      changed = true;
    }
    if (!changed) {
      break;
    }
  }
  return updated;
}

export function detectRecutTransientCandidates(samples: ArrayLike<number>, sampleRate: number) {
  if (samples.length < RECUT_ANALYSIS_WINDOW_SIZE) {
    return { candidateFrames: [], candidates: [] };
  }

  const safeSampleRate = Math.max(1, sampleRate);
  const { plan, window } = getFftPlan(RECUT_ANALYSIS_WINDOW_SIZE);
  const previousMagnitudes = new Float32Array(RECUT_ANALYSIS_WINDOW_SIZE / 2);
  const fluxScores: number[] = [];
  const energyScores: number[] = [];

  for (let offset = 0; offset + RECUT_ANALYSIS_WINDOW_SIZE < samples.length; offset += RECUT_ANALYSIS_HOP_SIZE) {
    const magnitudes = fftMagnitudes(samples, offset, plan, window);
    let flux = 0;
    for (let bin = 0; bin < magnitudes.length; bin += 1) {
      const current = magnitudes[bin] ?? 0;
      const delta = Math.max(0, current - (previousMagnitudes[bin] ?? 0));
      flux += delta;
      previousMagnitudes[bin] = current;
    }

    let energy = 0;
    for (let index = 0; index < RECUT_ANALYSIS_WINDOW_SIZE; index += 1) {
      const sample = samples[offset + index] ?? 0;
      energy += sample * sample;
    }
    energyScores.push(Math.sqrt(energy / RECUT_ANALYSIS_WINDOW_SIZE));
    fluxScores.push(flux / Math.max(1, safeSampleRate / 48000));
  }

  if (fluxScores.length < 3) {
    return { candidateFrames: [], candidates: [] };
  }

  const fluxMedian = median(fluxScores);
  const fluxMad = Math.max(1.0e-6, median(fluxScores.map((score) => Math.abs(score - fluxMedian))));
  const energyMedian = Math.max(1.0e-5, median(energyScores));
  const detections: RecutTransientCandidate[] = [];

  for (let index = 1; index + 1 < fluxScores.length; index += 1) {
    const flux = fluxScores[index] ?? 0;
    const left = fluxScores[index - 1] ?? 0;
    const right = fluxScores[index + 1] ?? 0;
    if (flux <= left || flux < right) {
      continue;
    }

    const localEnergyMedian = neighborhoodMedian(energyScores, index, 4);
    const energyFloor = Math.max(energyMedian * 1.05, localEnergyMedian * 1.1, 1.0e-4);
    const energy = energyScores[index] ?? 0;
    if (energy < energyFloor) {
      continue;
    }

    const normalizedFlux = (flux - fluxMedian) / fluxMad;
    if (normalizedFlux < AUTO_MIN_CONFIDENCE) {
      continue;
    }

    const candidate: RecutTransientCandidate = {
      bucketIndex: 0,
      frame: index * RECUT_ANALYSIS_HOP_SIZE,
      intensity: clamp(normalizedFlux / 8, 0, 1),
    };
    if (detections.length > 0 && candidate.frame - (detections[detections.length - 1]?.frame ?? 0) < RECUT_MINIMUM_SLICE_SPACING) {
      if (candidate.intensity > (detections[detections.length - 1]?.intensity ?? 0)) {
        detections[detections.length - 1] = candidate;
      }
      continue;
    }
    detections.push(candidate);
  }

  return {
    candidateFrames: detections.map((candidate) => candidate.frame),
    candidates: detections,
  };
}

export function buildRecutAutoSlice(candidates: readonly RecutTransientCandidate[], density: number, lengthFrames: number) {
  const safeLength = Math.max(1, lengthFrames);
  if (candidates.length === 0) {
    return {
      markers: [{
        confidence: 0.5,
        endFrame: safeLength - 1,
        padIndex: 0,
        startFrame: 0,
        transientFrame: 0,
      }],
      padAssignments: createPadAssignments().map((assignment, index) => ({
        ...assignment,
        isEmpty: index !== 0,
      })),
    };
  }

  const threshold = admissionThreshold(candidates.map((candidate) => candidate.intensity), density);
  const admitted = candidates
    .filter((candidate) => candidate.intensity >= threshold)
    .map((candidate) => ({
      ...candidate,
      bucketIndex: clamp(Math.floor((candidate.frame / safeLength) * 16), 0, 15),
    }));
  const ranked = admitted.length > 0
    ? admitted
    : [{ ...candidates.reduce((best, candidate) => candidate.intensity > best.intensity ? candidate : best), bucketIndex: 0 }];

  if (ranked.length <= 16) {
    const ordered = [...ranked].sort((left, right) => left.frame - right.frame);
    const sparsePads = assignSparsePads(ordered.length);
    const markers = ordered.map((candidate, index) => ({
      confidence: candidate.intensity,
      endFrame: Math.max(candidate.frame + 1, ordered[index + 1]?.frame ?? safeLength - 1),
      padIndex: sparsePads[index] ?? index,
      startFrame: candidate.frame,
      transientFrame: candidate.frame,
    }));
    const padAssignments = createPadAssignments();
    markers.forEach((marker, sliceIndex) => {
      const assignment = padAssignments[marker.padIndex];
      if (!assignment) {
        return;
      }
      assignment.isEmpty = false;
      assignment.sliceIndex = sliceIndex;
    });
    return { markers, padAssignments };
  }

  const bucketWidth = Math.max(1, safeLength / 16);
  const bucketCenters = Array.from({ length: 16 }, (_, index) => Math.round(index * bucketWidth + bucketWidth / 2));
  const selectedBySlot: Array<BucketSelection | null> = Array.from({ length: 16 }, () => null);
  const usedFrames = new Set<number>();

  for (let bucketIndex = 0; bucketIndex < 16; bucketIndex += 1) {
    const winner = ranked
      .filter((candidate) => candidate.bucketIndex === bucketIndex)
      .sort((left, right) => {
        if (right.intensity !== left.intensity) {
          return right.intensity - left.intensity;
        }
        return left.frame - right.frame;
      })[0] ?? null;
    if (!winner) {
      continue;
    }
    selectedBySlot[bucketIndex] = { candidate: winner, slotIndex: bucketIndex };
    usedFrames.add(winner.frame);
  }

  for (let bucketIndex = 0; bucketIndex < 16; bucketIndex += 1) {
    if (selectedBySlot[bucketIndex]) {
      continue;
    }
    const borrowed = findBorrowCandidate(bucketIndex, bucketCenters, ranked, usedFrames);
    if (!borrowed) {
      continue;
    }
    selectedBySlot[bucketIndex] = { candidate: borrowed, slotIndex: bucketIndex };
    usedFrames.add(borrowed.frame);
  }

  const selections = repairTooCloseSelections(
    selectedBySlot.flatMap((selection) => selection ? [selection] : []),
    ranked,
    bucketWidth,
  ).sort((left, right) => left.candidate.frame - right.candidate.frame);

  const markers = selections.slice(0, 16).map((selection, index, all) => ({
    confidence: selection.candidate.intensity,
    endFrame: Math.max(selection.candidate.frame + 1, all[index + 1]?.candidate.frame ?? safeLength - 1),
    padIndex: index,
    startFrame: selection.candidate.frame,
    transientFrame: selection.candidate.frame,
  }));
  const padAssignments = createPadAssignments().map((assignment, index) => ({
    ...assignment,
    isEmpty: index >= markers.length,
    sliceIndex: clamp(index, 0, Math.max(0, markers.length - 1)),
  }));

  return { markers, padAssignments };
}
