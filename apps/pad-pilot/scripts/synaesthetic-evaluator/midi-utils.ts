import { mean, standardDeviation } from "./statistics";

export type MidiNoteEvent = {
  readonly note: number;
  readonly velocity: number;
  readonly channel: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly durationTicks: number;
  readonly frequencyHz: number;
  readonly pitchClass: number;
};

export type PitchBendEvent = {
  readonly channel: number;
  readonly tick: number;
  readonly value: number;
};

export type MidiTempoChange = {
  readonly tick: number;
  readonly bpm: number;
};

export type MidiTimeSignatureChange = {
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
};

export type MidiSummary = {
  readonly notes: readonly MidiNoteEvent[];
  readonly pitchBends: readonly PitchBendEvent[];
  readonly tempoChanges: readonly MidiTempoChange[];
  readonly timeSignatureChanges: readonly MidiTimeSignatureChange[];
  readonly pitchClassHistogram: readonly number[];
  readonly onsetTicks: readonly number[];
  readonly onsetDeltas: readonly number[];
  readonly intervalSemitones: readonly number[];
  readonly simultaneityIntervals: readonly number[];
  readonly velocities: readonly number[];
  readonly noteCount: number;
  readonly meanPitch: number;
  readonly meanVelocity: number;
  readonly velocityStdDev: number;
  readonly pitchSpan: number;
  readonly minNote: number;
  readonly maxNote: number;
  readonly totalTicks: number;
  readonly ticksPerBeat: number;
  readonly smpteTiming: boolean;
  readonly tempoBpm: number;
  readonly hasExplicitTempo: boolean;
  readonly timeSignatureNumerator: number;
  readonly timeSignatureDenominator: number;
  readonly hasExplicitTimeSignature: boolean;
  readonly densityPerBeat: number;
  readonly bassEnergy: number;
  readonly midEnergy: number;
  readonly trebleEnergy: number;
  readonly rhythmicEntropy: number;
  readonly pitchEntropy: number;
};

type ActiveNote = {
  readonly note: number;
  readonly velocity: number;
  readonly channel: number;
  readonly startTick: number;
};

type MutableSummaryParts = {
  notes: MidiNoteEvent[];
  pitchBends: PitchBendEvent[];
  tempoChanges: MidiTempoChange[];
  timeSignatureChanges: MidiTimeSignatureChange[];
  maxTick: number;
  ticksPerBeat: number;
  smpteTiming: boolean;
  eventCount: number;
  activeNoteCount: number;
};

const MIDI_HEADER = [77, 84, 104, 100] as const;
const TRACK_HEADER = [77, 84, 114, 107] as const;
const DEFAULT_TICKS_PER_BEAT = 480;
export const MAX_MIDI_EVENTS = 100_000;
export const MAX_MIDI_NOTES = 50_000;
export const MAX_MIDI_PITCH_BENDS = 50_000;
export const MAX_MIDI_ACTIVE_NOTES = 4_096;
export const MAX_MIDI_TRACKS = 256;
export const MAX_SIMULTANEITY_INTERVALS = 16_384;
const MAX_MIDI_TICK = 0x7fff_ffff;

export function midiNoteToFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

export function normalizePitchClass(note: number) {
  return ((Math.round(note) % 12) + 12) % 12;
}

export function summarizeMidi(midi: Uint8Array) {
  const parts = looksLikeStandardMidiFile(midi) ? parseStandardMidiFile(midi) : parseRawMidiStream(midi);
  const sortedNotes = parts.notes
    .filter((note) => note.durationTicks >= 0)
    .sort((left, right) => left.startTick - right.startTick || left.note - right.note || left.channel - right.channel);

  const pitchClassHistogram = Array.from({ length: 12 }, () => 0);
  const velocities: number[] = [];
  const onsetTicks: number[] = [];
  const intervalSemitones: number[] = [];
  const simultaneityIntervals: number[] = [];

  let totalPitch = 0;
  let minNote = 127;
  let maxNote = 0;
  let bassEnergy = 0;
  let midEnergy = 0;
  let trebleEnergy = 0;

  for (let index = 0; index < sortedNotes.length; index += 1) {
    const note = sortedNotes[index]!;
    const weight = Math.max(1, note.durationTicks) * Math.max(1, note.velocity) / 127;
    pitchClassHistogram[note.pitchClass] += weight;
    velocities.push(note.velocity);
    onsetTicks.push(note.startTick);
    totalPitch += note.note;
    minNote = Math.min(minNote, note.note);
    maxNote = Math.max(maxNote, note.note);

    if (note.note < 48) {
      bassEnergy += weight;
    } else if (note.note < 72) {
      midEnergy += weight;
    } else {
      trebleEnergy += weight;
    }

    const previous = sortedNotes[index - 1];
    if (previous) {
      intervalSemitones.push(Math.abs(note.note - previous.note) % 12);
    }
  }

  const onsetDeltas = buildOnsetDeltas(onsetTicks);
  simultaneousPairs: for (let leftIndex = 0; leftIndex < sortedNotes.length; leftIndex += 1) {
    const left = sortedNotes[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < sortedNotes.length; rightIndex += 1) {
      if (simultaneityIntervals.length >= MAX_SIMULTANEITY_INTERVALS) {
        break simultaneousPairs;
      }
      const right = sortedNotes[rightIndex]!;
      if (right.startTick !== left.startTick) {
        break;
      }
      simultaneityIntervals.push(Math.abs(right.note - left.note) % 12);
    }
  }

  const totalEnergy = bassEnergy + midEnergy + trebleEnergy;
  const ticksPerBeat = parts.ticksPerBeat;
  const totalTicks = Math.max(parts.maxTick, sortedNotes.at(-1)?.endTick ?? 0, ticksPerBeat);
  const meanPitch = sortedNotes.length > 0 ? totalPitch / sortedNotes.length : 0;
  const meanVelocity = mean(velocities);
  const firstTempo = parts.tempoChanges[0];
  const firstTimeSignature = parts.timeSignatureChanges[0];

  return {
    notes: sortedNotes,
    pitchBends: parts.pitchBends,
    tempoChanges: parts.tempoChanges,
    timeSignatureChanges: parts.timeSignatureChanges,
    pitchClassHistogram,
    onsetTicks,
    onsetDeltas,
    intervalSemitones,
    simultaneityIntervals,
    velocities,
    noteCount: sortedNotes.length,
    meanPitch,
    meanVelocity,
    velocityStdDev: standardDeviation(velocities),
    pitchSpan: sortedNotes.length > 0 ? maxNote - minNote : 0,
    minNote: sortedNotes.length > 0 ? minNote : 0,
    maxNote: sortedNotes.length > 0 ? maxNote : 0,
    totalTicks,
    ticksPerBeat,
    smpteTiming: parts.smpteTiming,
    tempoBpm: firstTempo?.bpm ?? 120,
    hasExplicitTempo: firstTempo !== undefined,
    timeSignatureNumerator: firstTimeSignature?.numerator ?? 4,
    timeSignatureDenominator: firstTimeSignature?.denominator ?? 4,
    hasExplicitTimeSignature: firstTimeSignature !== undefined,
    densityPerBeat: sortedNotes.length / Math.max(1, totalTicks / ticksPerBeat),
    bassEnergy: totalEnergy > 0 ? bassEnergy / totalEnergy : 0,
    midEnergy: totalEnergy > 0 ? midEnergy / totalEnergy : 0,
    trebleEnergy: totalEnergy > 0 ? trebleEnergy / totalEnergy : 0,
    rhythmicEntropy: entropy(onsetDeltas),
    pitchEntropy: entropy(pitchClassHistogram),
  } satisfies MidiSummary;
}

export function getMidiSummary(midi: Uint8Array, state: { midiSummary?: MidiSummary } | undefined) {
  if (state?.midiSummary) {
    return state.midiSummary;
  }

  const summary = summarizeMidi(midi);
  if (state) {
    state.midiSummary = summary;
  }
  return summary;
}

function looksLikeStandardMidiFile(bytes: Uint8Array) {
  return MIDI_HEADER.every((value, index) => bytes[index] === value);
}

function parseStandardMidiFile(bytes: Uint8Array) {
  const parts = createMutableSummaryParts();
  if (bytes.length < 14 || !looksLikeStandardMidiFile(bytes)) {
    return parts;
  }

  const headerLength = readU32(bytes, 4);
  const trackCount = readU16(bytes, 10);
  const division = readU16(bytes, 12);
  if ((division & 0x8000) === 0) {
    parts.ticksPerBeat = Math.max(1, division);
  } else {
    parts.smpteTiming = true;
  }
  if (headerLength < 6 || headerLength > bytes.length - 8) {
    return parts;
  }
  let offset = 8 + headerLength;

  for (let trackIndex = 0;
    trackIndex < Math.min(trackCount, MAX_MIDI_TRACKS) &&
    parts.eventCount < MAX_MIDI_EVENTS &&
    offset + 8 <= bytes.length;
    trackIndex += 1) {
    if (!TRACK_HEADER.every((value, index) => bytes[offset + index] === value)) {
      break;
    }

    const trackLength = readU32(bytes, offset + 4);
    const trackStart = offset + 8;
    parseTrack(bytes, trackStart, Math.min(bytes.length, trackStart + trackLength), parts);
    offset = Math.min(bytes.length, trackStart + trackLength);
  }

  return parts;
}

function parseTrack(bytes: Uint8Array, startOffset: number, endOffset: number, parts: MutableSummaryParts) {
  const active = new Map<string, ActiveNote[]>();
  let tick = 0;
  let offset = startOffset;
  let runningStatus = 0;

  while (offset < endOffset && parts.eventCount < MAX_MIDI_EVENTS) {
    const delta = readVariableLength(bytes, offset, endOffset);
    tick = addTicks(tick, delta.value);
    offset = delta.offset;
    parts.maxTick = Math.max(parts.maxTick, tick);

    let status = bytes[offset] ?? 0;
    if (status >= 0x80) {
      offset += 1;
      if (status < 0xf0) {
        runningStatus = status;
      }
    } else {
      status = runningStatus;
    }
    parts.eventCount += 1;

    if (status === 0xff) {
      const metaType = bytes[offset] ?? 0;
      offset += 1;
      const length = readVariableLength(bytes, offset, endOffset);
      const dataStart = length.offset;
      const dataEnd = Math.min(endOffset, dataStart + length.value);
      applyMetaEvent(parts, tick, metaType, bytes.subarray(dataStart, dataEnd));
      offset = dataEnd;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVariableLength(bytes, offset, endOffset);
      offset = Math.min(endOffset, length.offset + length.value);
      continue;
    }

    const eventType = status & 0xf0;
    const channel = status & 0x0f;
    const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    const first = bytes[offset] ?? 0;
    const second = dataLength > 1 ? bytes[offset + 1] ?? 0 : 0;
    offset += dataLength;

    applyChannelEvent(parts, active, tick, eventType, channel, first, second);
  }

  flushActiveNotes(parts, active, addTicks(parts.maxTick, Math.ceil(parts.ticksPerBeat / 4)));
}

function parseRawMidiStream(bytes: Uint8Array) {
  const parts = createMutableSummaryParts();
  const active = new Map<string, ActiveNote[]>();
  let offset = 0;
  let tick = 0;
  let runningStatus = 0;

  while (offset < bytes.length && parts.eventCount < MAX_MIDI_EVENTS) {
    parts.eventCount += 1;
    let status = bytes[offset] ?? 0;
    if (status >= 0x80) {
      offset += 1;
      if (status < 0xf0) {
        runningStatus = status;
      }
    } else {
      status = runningStatus;
    }

    if (status < 0x80 || status >= 0xf0) {
      offset += 1;
      continue;
    }

    const eventType = status & 0xf0;
    const channel = status & 0x0f;
    const dataLength = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    const first = bytes[offset] ?? 0;
    const second = dataLength > 1 ? bytes[offset + 1] ?? 0 : 0;
    offset += dataLength;
    tick = addTicks(tick, 1);
    parts.maxTick = tick;

    applyChannelEvent(parts, active, tick, eventType, channel, first, second);
  }

  flushActiveNotes(parts, active, parts.maxTick + 1);
  return parts;
}

function createMutableSummaryParts() {
  const parts: MutableSummaryParts = {
    notes: [],
    pitchBends: [],
    tempoChanges: [],
    timeSignatureChanges: [],
    maxTick: 0,
    ticksPerBeat: DEFAULT_TICKS_PER_BEAT,
    smpteTiming: false,
    eventCount: 0,
    activeNoteCount: 0,
  };
  return parts;
}

function applyMetaEvent(parts: MutableSummaryParts, tick: number, metaType: number, data: Uint8Array) {
  if (metaType === 0x51 && data.length === 3) {
    const microsecondsPerBeat = ((data[0] ?? 0) << 16) | ((data[1] ?? 0) << 8) | (data[2] ?? 0);
    if (microsecondsPerBeat > 0) {
      parts.tempoChanges.push({ tick, bpm: 60_000_000 / microsecondsPerBeat });
    }
    return;
  }

  if (metaType === 0x58 && data.length >= 2) {
    const numerator = Math.max(1, data[0] ?? 4);
    const denominatorPower = Math.min(7, data[1] ?? 2);
    parts.timeSignatureChanges.push({ tick, numerator, denominator: 2 ** denominatorPower });
  }
}

function applyChannelEvent(
  parts: MutableSummaryParts,
  active: Map<string, ActiveNote[]>,
  tick: number,
  eventType: number,
  channel: number,
  first: number,
  second: number,
) {
  if (eventType === 0x90 && second > 0) {
    if (parts.activeNoteCount >= MAX_MIDI_ACTIVE_NOTES) {
      return;
    }
    const note = clampMidiByte(first);
    const key = `${channel}:${note}`;
    const stack = active.get(key) ?? [];
    stack.push({ note, velocity: clampMidiByte(second), channel, startTick: tick });
    active.set(key, stack);
    parts.activeNoteCount += 1;
    return;
  }

  if (eventType === 0x80 || (eventType === 0x90 && second === 0)) {
    closeActiveNote(parts, active, tick, channel, clampMidiByte(first));
    return;
  }

  if (eventType === 0xe0) {
    const value = ((clampMidiByte(second) << 7) | clampMidiByte(first)) - 8192;
    if (parts.pitchBends.length < MAX_MIDI_PITCH_BENDS) {
      parts.pitchBends.push({ channel, tick, value });
    }
  }
}

function closeActiveNote(parts: MutableSummaryParts, active: Map<string, ActiveNote[]>, tick: number, channel: number, note: number) {
  const key = `${channel}:${note}`;
  const stack = active.get(key);
  const started = stack?.shift();
  if (!started) {
    return;
  }
  parts.activeNoteCount = Math.max(0, parts.activeNoteCount - 1);

  if (stack && stack.length === 0) {
    active.delete(key);
  }

  const endTick = Math.max(tick, started.startTick);
  if (parts.notes.length < MAX_MIDI_NOTES) {
    parts.notes.push({
      note,
      velocity: started.velocity,
      channel,
      startTick: started.startTick,
      endTick,
      durationTicks: Math.max(0, endTick - started.startTick),
      frequencyHz: midiNoteToFrequency(note),
      pitchClass: normalizePitchClass(note),
    });
  }
}

function flushActiveNotes(parts: MutableSummaryParts, active: Map<string, ActiveNote[]>, endTick: number) {
  for (const stack of active.values()) {
    for (const started of stack) {
      if (parts.notes.length >= MAX_MIDI_NOTES) {
        parts.activeNoteCount = 0;
        return;
      }
      const resolvedEnd = Math.max(endTick, started.startTick + 1);
      parts.notes.push({
        note: started.note,
        velocity: started.velocity,
        channel: started.channel,
        startTick: started.startTick,
        endTick: resolvedEnd,
        durationTicks: resolvedEnd - started.startTick,
        frequencyHz: midiNoteToFrequency(started.note),
        pitchClass: normalizePitchClass(started.note),
      });
    }
  }
  parts.activeNoteCount = 0;
}

function buildOnsetDeltas(onsets: readonly number[]) {
  const unique = [...new Set(onsets)].sort((left, right) => left - right);
  const deltas: number[] = [];
  for (let index = 1; index < unique.length; index += 1) {
    deltas.push(Math.max(0, unique[index]! - unique[index - 1]!));
  }
  return deltas;
}

function readU16(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
}

function addTicks(tick: number, delta: number) {
  return Math.min(MAX_MIDI_TICK, tick + Math.max(0, delta));
}

function readVariableLength(bytes: Uint8Array, offset: number, endOffset: number) {
  let value = 0;
  let cursor = offset;
  for (let index = 0; index < 4 && cursor < endOffset; index += 1) {
    const byte = bytes[cursor] ?? 0;
    cursor += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { value, offset: cursor };
}

function clampMidiByte(value: number) {
  return Math.max(0, Math.min(127, value | 0));
}

function entropy(values: readonly number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return 0;
  }

  let bits = 0;
  let occupied = 0;
  for (const value of values) {
    if (value <= 0) {
      continue;
    }
    occupied += 1;
    const probability = value / total;
    bits -= probability * Math.log2(probability);
  }

  return occupied > 1 ? bits / Math.log2(occupied) : 0;
}
