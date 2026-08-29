import { describe, expect, it } from "bun:test";
import {
  encodeMidiFile,
  GENERATOR_MIDI_TICKS_PER_QUARTER,
  MAX_GENERATOR_MIDI_NOTES_PER_TRACK,
  MAX_GENERATOR_MIDI_TRACKS,
} from "./midi-encoder";

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function includesSequence(bytes: Uint8Array, sequence: number[]) {
  return bytes.some((_, index) => sequence.every((value, offset) => bytes[index + offset] === value));
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
}

function readVariableLength(bytes: Uint8Array, offset: number) {
  let value = 0;
  let cursor = offset;
  while (cursor < bytes.length) {
    const byte = bytes[cursor] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    cursor += 1;
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return { cursor, value };
}

function trackChunks(bytes: Uint8Array) {
  const chunks: Uint8Array[] = [];
  let cursor = 14;
  while (cursor + 8 <= bytes.length) {
    expect(ascii(bytes, cursor, 4)).toBe("MTrk");
    const length = readU32(bytes, cursor + 4);
    chunks.push(bytes.slice(cursor + 8, cursor + 8 + length));
    cursor += 8 + length;
  }
  return chunks;
}

function trackEndTick(track: Uint8Array) {
  let cursor = 0;
  let tick = 0;
  while (cursor < track.length) {
    const delta = readVariableLength(track, cursor);
    tick += delta.value;
    cursor = delta.cursor;
    const status = track[cursor] ?? 0;
    cursor += 1;
    if (status === 0xff) {
      const metaType = track[cursor] ?? 0;
      cursor += 1;
      const length = readVariableLength(track, cursor);
      cursor = length.cursor + length.value;
      if (metaType === 0x2f) {
        return tick;
      }
      continue;
    }
    if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
      cursor += 1;
      continue;
    }
    cursor += 2;
  }
  return tick;
}

function noteOnTicks(track: Uint8Array) {
  const ticks: number[] = [];
  let cursor = 0;
  let tick = 0;
  while (cursor < track.length) {
    const delta = readVariableLength(track, cursor);
    tick += delta.value;
    cursor = delta.cursor;
    const status = track[cursor] ?? 0;
    cursor += 1;
    if (status === 0xff) {
      cursor += 1;
      const length = readVariableLength(track, cursor);
      cursor = length.cursor + length.value;
      continue;
    }
    if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
      cursor += 1;
      continue;
    }
    const note = track[cursor] ?? 0;
    const velocity = track[cursor + 1] ?? 0;
    cursor += 2;
    if ((status & 0xf0) === 0x90 && velocity > 0) {
      ticks.push(note * 100000 + tick);
    }
  }
  return ticks;
}

function channelEvents(track: Uint8Array) {
  const events: Array<{ data: number[]; status: number; tick: number }> = [];
  let cursor = 0;
  let tick = 0;
  while (cursor < track.length) {
    const delta = readVariableLength(track, cursor);
    tick += delta.value;
    cursor = delta.cursor;
    const status = track[cursor] ?? 0;
    cursor += 1;
    if (status === 0xff) {
      cursor += 1;
      const length = readVariableLength(track, cursor);
      cursor = length.cursor + length.value;
      continue;
    }
    const dataLength = (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
    const data = Array.from(track.slice(cursor, cursor + dataLength));
    cursor += dataLength;
    events.push({ data, status, tick });
  }
  return events;
}

describe("midi encoder", () => {
  it("rejects compositions outside bounded track, note, and name limits", () => {
    const track = {
      channel: 0,
      name: "Lane",
      notes: [{ deltaTicks: 0, durationTicks: 120, note: 60, velocity: 90 }],
      program: 0,
    };
    expect(() => encodeMidiFile({
      bpm: 120,
      tracks: Array.from({ length: MAX_GENERATOR_MIDI_TRACKS + 1 }, () => track),
    })).toThrow(/tracks/);
    expect(() => encodeMidiFile({
      bpm: 120,
      tracks: [{
        ...track,
        notes: Array.from({ length: MAX_GENERATOR_MIDI_NOTES_PER_TRACK + 1 }, () => track.notes[0]!),
      }],
    })).toThrow(/notes/);
    expect(() => encodeMidiFile({
      bpm: 120,
      tracks: [{ ...track, name: "é".repeat(65) }],
    })).toThrow(/track name/);
  });

  it("writes SMF type 1 with tempo, track names, and program changes", () => {
    const bytes = encodeMidiFile({
      bpm: 120,
      tracks: [
        {
          channel: 0,
          name: "Piano",
          notes: [{ deltaTicks: 0, durationTicks: 480, note: 60, velocity: 90 }],
          program: 0,
        },
        {
          channel: 3,
          drums: true,
          name: "Drums",
          notes: [{ deltaTicks: 0, durationTicks: 120, note: 36, velocity: 110 }],
          program: 0,
        },
      ],
    });

    expect(ascii(bytes, 0, 4)).toBe("MThd");
    expect(bytes[9]).toBe(1);
    expect(bytes[11]).toBe(3);
    expect(bytes[12]).toBe(1);
    expect(bytes[13]).toBe(224);
    expect(includesSequence(bytes, [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20])).toBe(true);
    expect(includesSequence(bytes, [0xff, 0x03, 0x05, 0x50, 0x69, 0x61, 0x6e, 0x6f])).toBe(true);
    expect(includesSequence(bytes, [0xc0, 0x00])).toBe(true);
    expect(includesSequence(bytes, [0xc9, 0x00])).toBe(true);
    expect(includesSequence(bytes, [0x99, 36, 110])).toBe(true);
  });

  it("ends every track at the default four-bar loop boundary", () => {
    const bytes = encodeMidiFile({
      bpm: 124,
      tracks: [
        {
          channel: 0,
          name: "Short Motif",
          notes: [
            { deltaTicks: 0, durationTicks: 480, note: 60, velocity: 90 },
            { deltaTicks: 480, durationTicks: 240, note: 64, velocity: 84 },
          ],
          program: 0,
        },
      ],
    });

    expect(trackChunks(bytes).map(trackEndTick)).toEqual([
      GENERATOR_MIDI_TICKS_PER_QUARTER * 16,
      GENERATOR_MIDI_TICKS_PER_QUARTER * 16,
    ]);
  });

  it("writes a non-audible boundary controller at the loop end for DAW clip sizing", () => {
    const bytes = encodeMidiFile({
      bpm: 124,
      loopBars: 16,
      tracks: [
        {
          channel: 0,
          name: "Short Motif",
          notes: [
            { deltaTicks: 0, durationTicks: 480, note: 60, velocity: 90 },
            { deltaTicks: 480, durationTicks: 240, note: 64, velocity: 84 },
          ],
          program: 0,
        },
      ],
    });

    const instrumentTrack = trackChunks(bytes)[1] ?? new Uint8Array();
    expect(channelEvents(instrumentTrack).at(-1)).toEqual({
      data: [123, 0],
      status: 0xb0,
      tick: GENERATOR_MIDI_TICKS_PER_QUARTER * 64,
    });
  });

  it("truncates notes past the selected loop boundary", () => {
    const bytes = encodeMidiFile({
      bpm: 124,
      loopBars: 2,
      tracks: [
        {
          channel: 0,
          name: "Overlong Motif",
          notes: [
            { deltaTicks: 0, durationTicks: GENERATOR_MIDI_TICKS_PER_QUARTER * 20, note: 60, velocity: 90 },
            { deltaTicks: GENERATOR_MIDI_TICKS_PER_QUARTER * 9, durationTicks: 240, note: 67, velocity: 84 },
          ],
          program: 0,
        },
      ],
    });

    const chunks = trackChunks(bytes);
    const endTick = GENERATOR_MIDI_TICKS_PER_QUARTER * 8;
    expect(chunks.map(trackEndTick)).toEqual([endTick, endTick]);
    expect(noteOnTicks(chunks[1] ?? new Uint8Array()).some((value) => Math.floor(value / 100000) === 67)).toBe(false);
  });
});
