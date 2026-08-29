import { clampInteger } from "../../../utils/math";

export const GENERATOR_MIDI_TICKS_PER_QUARTER = 480;
export const GENERATOR_MIDI_DRUM_CHANNEL = 9;
export const GENERATOR_MIDI_BEATS_PER_BAR = 4;
export const GENERATOR_MIDI_LOOP_BARS = 4;
export const MAX_GENERATOR_MIDI_TRACKS = 64;
export const MAX_GENERATOR_MIDI_NOTES_PER_TRACK = 4_096;
export const MAX_GENERATOR_MIDI_TOTAL_NOTES = 32_768;
export const MAX_GENERATOR_MIDI_TRACK_NAME_BYTES = 128;

export interface GeneratorMidiNote {
  /** Delta ticks from previous note start in this track. */
  deltaTicks: number;
  /** MIDI note number, 0-127. */
  note: number;
  /** Note-on velocity, 1-127. */
  velocity: number;
  /** Note duration in ticks. */
  durationTicks: number;
}

export interface GeneratorMidiTrack {
  /** Instrument or rhythm label used for the SMF track name. */
  name: string;
  /** Zero-indexed MIDI channel. Drums should use 9 for channel 10. */
  channel: number;
  /** General MIDI program number, 0-127. */
  program: number;
  /** Sequential delta-tick notes for this track. */
  notes: readonly GeneratorMidiNote[];
  /** Forces General MIDI rhythm channel 10. */
  drums?: boolean;
}

export interface GeneratorMidiComposition {
  /** Composition tempo in beats per minute. */
  bpm: number;
  /** Concurrent instrument tracks. */
  tracks: readonly GeneratorMidiTrack[];
  /** Generated loop length in 4/4 bars. Defaults to four bars. */
  loopBars?: number;
  /** Optional PPQ division. */
  ticksPerQuarter?: number;
}

type MidiEvent = {
  bytes: number[];
  priority: number;
  tick: number;
};

const encoder = new TextEncoder();

function normalizeChannel(track: GeneratorMidiTrack) {
  if (track.drums || /drum|rhythm|perc/i.test(track.name)) {
    return GENERATOR_MIDI_DRUM_CHANNEL;
  }
  return clampInteger(track.channel, 0, 15);
}

function encodeText(value: string) {
  const normalized = value.trim() || "Track";
  if (normalized.length > MAX_GENERATOR_MIDI_TRACK_NAME_BYTES) {
    throw new Error(`MIDI track name exceeded ${MAX_GENERATOR_MIDI_TRACK_NAME_BYTES} UTF-8 bytes.`);
  }
  const encoded = encoder.encode(normalized);
  if (encoded.byteLength > MAX_GENERATOR_MIDI_TRACK_NAME_BYTES) {
    throw new Error(`MIDI track name exceeded ${MAX_GENERATOR_MIDI_TRACK_NAME_BYTES} UTF-8 bytes.`);
  }
  return Array.from(encoded);
}

function writeAscii(out: number[], value: string) {
  for (let index = 0; index < value.length; index += 1) {
    out.push(value.charCodeAt(index) & 0xff);
  }
}

function writeU16(out: number[], value: number) {
  out.push((value >> 8) & 0xff, value & 0xff);
}

function writeU32(out: number[], value: number) {
  out.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function writeVariableLength(out: number[], input: number) {
  let value = clampInteger(input, 0, 0x0fffffff);
  let buffer = value & 0x7f;
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    out.push(buffer & 0xff);
    if ((buffer & 0x80) === 0) {
      break;
    }
    buffer >>= 8;
  }
}

function metaEvent(type: number, data: number[]) {
  const bytes = [0xff, type & 0xff];
  writeVariableLength(bytes, data.length);
  bytes.push(...data);
  return bytes;
}

function trackChunk(trackData: number[]) {
  const out: number[] = [];
  writeAscii(out, "MTrk");
  writeU32(out, trackData.length);
  out.push(...trackData);
  return out;
}

function buildTempoTrack(bpm: number, endTick: number) {
  const data: number[] = [];
  const microsecondsPerQuarter = clampInteger(60_000_000 / Math.max(1, bpm), 1, 0xffffff);
  writeVariableLength(data, 0);
  data.push(...metaEvent(0x51, [
    (microsecondsPerQuarter >> 16) & 0xff,
    (microsecondsPerQuarter >> 8) & 0xff,
    microsecondsPerQuarter & 0xff,
  ]));
  writeVariableLength(data, 0);
  data.push(...metaEvent(0x58, [4, 2, 24, 8]));
  writeVariableLength(data, endTick);
  data.push(...metaEvent(0x2f, []));
  return trackChunk(data);
}

function noteEvents(track: GeneratorMidiTrack, endTick: number) {
  const channel = normalizeChannel(track);
  const events: MidiEvent[] = [
    {
      bytes: metaEvent(0x03, encodeText(track.name)),
      priority: 0,
      tick: 0,
    },
    {
      bytes: [0xc0 | channel, clampInteger(track.program, 0, 127)],
      priority: 1,
      tick: 0,
    },
  ];
  events.push({
    bytes: [0xb0 | channel, 123, 0],
    priority: 4,
    tick: endTick,
  });
  let cursor = 0;
  for (const note of track.notes) {
    cursor += clampInteger(note.deltaTicks, 0, 0x0fffffff);
    if (cursor >= endTick) {
      continue;
    }
    const durationTicks = Math.min(clampInteger(note.durationTicks, 1, 0x0fffffff), endTick - cursor);
    if (durationTicks <= 0) {
      continue;
    }
    const midiNote = clampInteger(note.note, 0, 127);
    const velocity = clampInteger(note.velocity, 1, 127);
    events.push({
      bytes: [0x90 | channel, midiNote, velocity],
      priority: 3,
      tick: cursor,
    });
    events.push({
      bytes: [0x80 | channel, midiNote, 0],
      priority: 2,
      tick: cursor + durationTicks,
    });
  }

  return events.sort((left, right) => left.tick - right.tick || left.priority - right.priority);
}

function loopBoundaryTicks(input: GeneratorMidiComposition, ticksPerQuarter: number) {
  const loopBars = clampInteger(input.loopBars ?? GENERATOR_MIDI_LOOP_BARS, 1, 64);
  return loopBars * GENERATOR_MIDI_BEATS_PER_BAR * ticksPerQuarter;
}

function buildInstrumentTrack(track: GeneratorMidiTrack, endTick: number) {
  const data: number[] = [];
  let previousTick = 0;
  for (const event of noteEvents(track, endTick)) {
    writeVariableLength(data, event.tick - previousTick);
    data.push(...event.bytes);
    previousTick = event.tick;
  }
  writeVariableLength(data, Math.max(0, endTick - previousTick));
  data.push(...metaEvent(0x2f, []));
  return trackChunk(data);
}

function buildHeader(format: number, trackCount: number, ticksPerQuarter: number) {
  const out: number[] = [];
  writeAscii(out, "MThd");
  writeU32(out, 6);
  writeU16(out, format);
  writeU16(out, trackCount);
  writeU16(out, ticksPerQuarter);
  return out;
}

export function encodeMidiFile(input: GeneratorMidiComposition) {
  if (!Array.isArray(input.tracks) || input.tracks.length > MAX_GENERATOR_MIDI_TRACKS) {
    throw new Error(`MIDI composition exceeded ${MAX_GENERATOR_MIDI_TRACKS} tracks.`);
  }
  let totalNotes = 0;
  for (const track of input.tracks) {
    if (typeof track.name !== "string") {
      throw new Error("MIDI track name must be a string.");
    }
    encodeText(track.name);
    if (!Array.isArray(track.notes) || track.notes.length > MAX_GENERATOR_MIDI_NOTES_PER_TRACK) {
      throw new Error(`MIDI track exceeded ${MAX_GENERATOR_MIDI_NOTES_PER_TRACK} notes.`);
    }
    totalNotes += track.notes.length;
    if (totalNotes > MAX_GENERATOR_MIDI_TOTAL_NOTES) {
      throw new Error(`MIDI composition exceeded ${MAX_GENERATOR_MIDI_TOTAL_NOTES} notes.`);
    }
  }
  const tracks = input.tracks.map((track) => ({
    ...track,
    channel: normalizeChannel(track),
  }));
  const ticksPerQuarter = clampInteger(input.ticksPerQuarter ?? GENERATOR_MIDI_TICKS_PER_QUARTER, 24, 9600);
  const endTick = loopBoundaryTicks(input, ticksPerQuarter);
  const out = buildHeader(1, tracks.length + 1, ticksPerQuarter);
  out.push(...buildTempoTrack(input.bpm, endTick));
  for (const track of tracks) {
    out.push(...buildInstrumentTrack(track, endTick));
  }
  return new Uint8Array(out);
}

export function encodeMidiTrackFile(input: GeneratorMidiComposition, track: GeneratorMidiTrack) {
  return encodeMidiFile({
    bpm: input.bpm,
    loopBars: input.loopBars,
    ticksPerQuarter: input.ticksPerQuarter,
    tracks: [track],
  });
}
