import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER, MAX_GENERATOR_MIDI_NOTES_PER_TRACK, MAX_GENERATOR_MIDI_TOTAL_NOTES, MAX_GENERATOR_MIDI_TRACK_NAME_BYTES, MAX_GENERATOR_MIDI_TRACKS, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { normalizeGeneratorIntentTags } from "./generator-selector-options";
import { type GeneratorLengthBars } from "./generator-option-catalog";
import { type AbsoluteGeneratorNote, type GeneratorArrangementPlanHeader, type GeneratorIntentPlan, type GeneratorMidiTrackWithMetadata, type GeneratorMusicianPlan, type GeneratorTrackMetadata } from "./generator-contracts";
import { MAX_DELTA_TRACKER_HEADER_BYTES, MAX_DELTA_TRACKER_METADATA_LINE_BYTES, MAX_DELTA_TRACKER_METADATA_LINES, MAX_DELTA_TRACKER_METADATA_VALUE_BYTES, MAX_DELTA_TRACKER_UTF8_BYTES, MAX_TRACKER_TICK, schemaMetadataLine, tagSetHas, TRACK_LENGTH_TOLERANCE_TICKS } from "./generator-prompt";
import { clampInteger } from "../../../utils/math";


export { clampInteger };

export function parseIntegerInRange(value: string | undefined, min: number, max: number, label: string) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`Delta tracker ${label} out of range.`);
  }
  return numberValue;
}

export function parseNoteBlocks(section: string, maximumNotes: number) {
  const notes: Array<GeneratorMidiTrack["notes"][number]> = [];
  const blockPattern = /^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\]$/;
  let cursor = 0;
  for (;;) {
    const start = section.indexOf("[", cursor);
    if (start < 0) {
      break;
    }
    const end = section.indexOf("]", start + 1);
    if (end < 0) {
      throw new Error("Delta tracker malformed note block.");
    }
    const bracket = section.slice(start, end + 1);
    const match = blockPattern.exec(bracket);
    if (!match) {
      throw new Error("Delta tracker malformed note block.");
    }
    if (notes.length >= maximumNotes) {
      throw new Error("Delta tracker note limit exceeded.");
    }
    notes.push({
      deltaTicks: parseIntegerInRange(match[1], 0, MAX_TRACKER_TICK, "delta ticks"),
      durationTicks: parseIntegerInRange(match[4], 1, MAX_TRACKER_TICK, "duration"),
      note: parseIntegerInRange(match[2], 0, 127, "note"),
      velocity: parseIntegerInRange(match[3], 1, 127, "velocity"),
    });
    cursor = end + 1;
  }
  return notes;
}

export function normalizeTrackName(value: string) {
  const trimmed = value.trim().replace(/[\r\n]+/g, " ");
  const normalized = trimmed || "Track";
  assertBoundedUtf8(normalized, MAX_GENERATOR_MIDI_TRACK_NAME_BYTES, "track name");
  return normalized;
}

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "generator";
}

export function scaleSlug(value: string) {
  return slug(value.replace(/#/g, " sharp ").replace(/\b([A-Ga-g])b(?=\s|$)/g, "$1 flat"));
}

export function parseDeltaTickTracker(buffer: string) {
  assertBoundedUtf8(buffer, MAX_DELTA_TRACKER_UTF8_BYTES, "text");
  validateTrackerMetadataLines(buffer);
  const bpmMatch = /!BPM:\s*(\d+(?:\.\d+)?)\s*!/i.exec(buffer);
  if (!bpmMatch) {
    throw new Error("Delta tracker BPM header missing.");
  }
  const bpmValue = Number(bpmMatch[1]);
  if (!Number.isFinite(bpmValue) || bpmValue < 20 || bpmValue > 320) {
    throw new Error("Delta tracker BPM out of range.");
  }
  const bpm = Math.round(bpmValue);
  const tracks: GeneratorMidiTrack[] = [];
  const trackPattern = /#TRK:\s*([\s\S]*?)\s*,\s*CH:\s*(\d+)\s*,\s*PG:\s*(\d+)([\s\S]*?)(?=#TRK:|$)/gi;
  const expectedTrackHeaders = countTrackHeaders(buffer);
  let parsedTrackHeaders = 0;
  let totalNotes = 0;
  for (const match of buffer.matchAll(trackPattern)) {
    parsedTrackHeaders += 1;
    const name = normalizeTrackName(match[1] ?? "");
    if (/#TRK:|\[/.test(name)) {
      throw new Error("Delta tracker malformed track header.");
    }
    const header = trackerHeader(match[0] ?? "");
    assertBoundedUtf8(header, MAX_DELTA_TRACKER_HEADER_BYTES, "track header");
    const metadata = parseTrackMetadata(header);
    const channel = parseIntegerInRange(match[2], 0, 15, "channel");
    const program = parseIntegerInRange(match[3], 0, 127, "program");
    const metadataText = `${metadata.role ?? ""} ${metadata.lane ?? ""} ${metadata.function ?? ""}`;
    const bassText = `${name} ${metadataText}`.toLowerCase();
    const bassLike = /bass|808|sub|reese|low end|log drum/.test(bassText) && !/kit|drums|percussion/.test(bassText);
    const drums = channel === GENERATOR_MIDI_DRUM_CHANNEL || (!bassLike && /drum|rhythm|perc|kit|groove/i.test(`${name} ${metadataText}`));
    const notes = parseNoteBlocks(
      match[4] ?? "",
      Math.min(MAX_GENERATOR_MIDI_NOTES_PER_TRACK, MAX_GENERATOR_MIDI_TOTAL_NOTES - totalNotes),
    );
    if (notes.length === 0) {
      continue;
    }
    totalNotes += notes.length;
    const track: GeneratorMidiTrackWithMetadata = {
      channel: drums ? GENERATOR_MIDI_DRUM_CHANNEL : channel,
      drums,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      name,
      notes,
      program,
    };
    tracks.push(track);
  }

  if (parsedTrackHeaders !== expectedTrackHeaders) {
    throw new Error("Delta tracker malformed track header.");
  }

  if (tracks.length === 0) {
    throw new Error("Delta tracker did not include any playable tracks.");
  }

  return {
    bpm,
    tracks,
  };
}

export function normalizeTrackMetadataValue(value: string | undefined) {
  assertBoundedUtf8(value ?? "", MAX_DELTA_TRACKER_METADATA_VALUE_BYTES, "track metadata value");
  return normalizeGeneratorIntentTags([value ?? ""])[0];
}

export function assertBoundedUtf8(value: string, maximumBytes: number, label: string) {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index) ?? 0;
    if (codePoint > 0xffff) {
      index += 1;
    }
    byteLength += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (byteLength > maximumBytes) {
      throw new Error(`Delta tracker ${label} exceeded ${maximumBytes} UTF-8 bytes.`);
    }
  }
}

export function countTrackHeaders(buffer: string) {
  const pattern = /#TRK:/gi;
  let count = 0;
  while (pattern.exec(buffer)) {
    count += 1;
    if (count > MAX_GENERATOR_MIDI_TRACKS) {
      throw new Error(`Delta tracker exceeded ${MAX_GENERATOR_MIDI_TRACKS} tracks.`);
    }
  }
  return count;
}

export function trackerHeader(section: string) {
  const separators = [section.indexOf("\r"), section.indexOf("\n"), section.indexOf("[")]
    .filter((index) => index >= 0);
  return section.slice(0, separators.length > 0 ? Math.min(...separators) : section.length);
}

export function validateTrackerMetadataLines(buffer: string) {
  const pattern = /!(SCHEMA|PLAN|TAGS):[^!\r\n]*!/gi;
  let count = 0;
  for (const match of buffer.matchAll(pattern)) {
    count += 1;
    if (count > MAX_DELTA_TRACKER_METADATA_LINES) {
      throw new Error("Delta tracker metadata line limit exceeded.");
    }
    assertBoundedUtf8(match[0], MAX_DELTA_TRACKER_METADATA_LINE_BYTES, "metadata line");
  }
}

export function parseTrackMetadata(header: string) {
  const metadata: GeneratorTrackMetadata = {};
  for (const match of header.matchAll(/,\s*(ROLE|LANE|FUNCTION|BASS_ROLE|BASSROLE|PHRASE|MOTIF_ID|MOTIFID)\s*[:=]\s*([^,\r\n]+)/gi)) {
    const key = (match[1] ?? "").toUpperCase();
    const value = normalizeTrackMetadataValue(match[2]);
    if (!value) {
      continue;
    }
    if (key === "ROLE") metadata.role = value;
    if (key === "LANE") metadata.lane = value;
    if (key === "FUNCTION") metadata.function = value;
    if (key === "BASS_ROLE" || key === "BASSROLE") metadata.bassRole = value;
    if (key === "PHRASE") metadata.phrase = value;
    if (key === "MOTIF_ID" || key === "MOTIFID") metadata.motifId = value;
  }
  return metadata;
}

export function trackMetadata(track: GeneratorMidiTrackWithMetadata) {
  return track.metadata;
}

export function isSupportingTrack(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  if (!track.drums && /support|texture|guide|counter|fill|upper-color|short-bloom|pad/.test(`${metadata?.role ?? ""} ${metadata?.lane ?? ""} ${metadata?.function ?? ""}`)) {
    return !/lead|808|sub|bass/.test(`${metadata?.role ?? ""} ${metadata?.lane ?? ""} ${metadata?.function ?? ""}`);
  }
  return !track.drums
    && /texture|pad|guide|counter|riff|fill|upper color|single voice|shimmer|drone|stab/i.test(track.name)
    && !/lead motif|topline|808|sub|house strobe|live passing/i.test(track.name);
}

export function trackRole(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  const declared = `${metadata?.role ?? ""} ${metadata?.function ?? ""}`;
  if (/drum|groove|rhythm|perc|kit/.test(declared)) return "drums";
  if (/bass|808|sub|reese|root|pedal|low/.test(declared) || metadata?.bassRole) return "bass";
  if (/chord|comp|harmony|keys|stab|voicing/.test(declared)) return "chords";
  if (/lead|hook|motif|melody|topline|riff|counter/.test(declared)) return "melody";
  if (/support|texture|pad|fill|upper-color|guide/.test(declared)) return "support";
  const name = track.name.toLowerCase();
  if (track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL || /drum|rhythm|perc|kit|groove/i.test(track.name)) return "drums";
  if (isBassTrack(track)) return "bass";
  if (/chord|harmony|keys|piano|organ|stab|string/i.test(name) || (/guitar/i.test(name) && !/lead|riff|counter|melody/i.test(name))) return "chords";
  if (/lead|hook|motif|melody|topline|riff|call[-\s]?response/i.test(name)) return "melody";
  if (isSupportingTrack(track)) return "support";
  if (/pad|texture|drone|shimmer|atmos/i.test(name)) return "texture";
  return "lane";
}

export function trackMetadataSuffix(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  if (!metadata) {
    return "";
  }
  return [
    metadata.role ? `ROLE:${metadata.role}` : "",
    metadata.lane ? `LANE:${metadata.lane}` : "",
    metadata.function ? `FUNCTION:${metadata.function}` : "",
    metadata.bassRole ? `BASS_ROLE:${metadata.bassRole}` : "",
    metadata.phrase ? `PHRASE:${metadata.phrase}` : "",
    metadata.motifId ? `MOTIF_ID:${metadata.motifId}` : "",
  ].filter(Boolean).map((value) => `,${value}`).join("");
}

export function loopTicks(lengthBars: GeneratorLengthBars) {
  return lengthBars * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER;
}

export function absoluteTrackNotes(track: GeneratorMidiTrack) {
  let cursor = 0;
  return track.notes.map((note) => {
    cursor += clampInteger(note.deltaTicks, 0, MAX_TRACKER_TICK);
    return {
      deltaTicks: 0 as const,
      durationTicks: clampInteger(note.durationTicks, 1, MAX_TRACKER_TICK),
      note: clampInteger(note.note, 0, 127),
      tick: cursor,
      velocity: clampInteger(note.velocity, 1, 127),
    };
  });
}

export function deltaTrackNotes(notes: readonly AbsoluteGeneratorNote[]) {
  let previousTick = 0;
  return [...notes]
    .sort((left, right) => left.tick - right.tick || left.note - right.note || left.velocity - right.velocity)
    .map((note) => {
      const tick = clampInteger(note.tick, 0, MAX_TRACKER_TICK);
      const deltaTicks = Math.max(0, tick - previousTick);
      previousTick = tick;
      return {
        deltaTicks,
        durationTicks: clampInteger(note.durationTicks, 1, MAX_TRACKER_TICK),
        note: clampInteger(note.note, 0, 127),
        velocity: clampInteger(note.velocity, 1, 127),
      };
    });
}

export function trackerMetadataLines(rawTracker: string) {
  return [
    /!SCHEMA:[^!]+!/i.exec(rawTracker)?.[0] ?? schemaMetadataLine(),
    /!PLAN:[^!]+!/i.exec(rawTracker)?.[0] ?? "",
    /!TAGS:[^!]+!/i.exec(rawTracker)?.[0] ?? "",
  ].filter(Boolean);
}

export function trackerFromComposition(composition: GeneratorMidiComposition, rawTracker?: string) {
  return [
    `!BPM:${composition.bpm}!`,
    ...(rawTracker ? trackerMetadataLines(rawTracker) : [schemaMetadataLine()]),
    ...composition.tracks.flatMap((track) => [
      `#TRK:${track.name.replace(/,/g, " ")},CH:${track.channel},PG:${track.program}${trackMetadataSuffix(track)}`,
      track.notes.map((note) => `[${note.deltaTicks},${note.note},${note.velocity},${note.durationTicks}]`).join(""),
    ]),
  ].join("\n");
}

export function trackEndTicks(track: GeneratorMidiTrack) {
  return absoluteTrackNotes(track).reduce((latest, note) => Math.max(latest, note.tick + note.durationTicks), 0);
}

export function formatBars(ticks: number) {
  const bars = ticks / (GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER);
  return Number.isInteger(bars) ? String(bars) : bars.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");
}

export function trackLengthDiagnostics(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  const endTick = loopTicks(lengthBars);
  return composition.tracks.map((track) => {
    const lastNoteEndTick = Math.min(trackEndTicks(track), endTick);
    return {
      lastNoteEndTick,
      name: track.name,
      short: lastNoteEndTick < endTick - TRACK_LENGTH_TOLERANCE_TICKS,
    };
  });
}

export function maxNoteClusterSize(track: GeneratorMidiTrack, toleranceTicks = 72) {
  const notes = absoluteTrackNotes(track);
  const pitchCounts = new Uint32Array(128);
  const tolerance = Math.max(0, toleranceTicks);
  let left = 0;
  let distinctPitches = 0;
  let maxSize = 0;
  for (let right = 0; right < notes.length; right += 1) {
    const note = notes[right]!;
    if (pitchCounts[note.note] === 0) {
      distinctPitches += 1;
    }
    pitchCounts[note.note] += 1;
    while (left <= right && note.tick - notes[left]!.tick > tolerance) {
      const removedPitch = notes[left]!.note;
      pitchCounts[removedPitch] -= 1;
      if (pitchCounts[removedPitch] === 0) {
        distinctPitches -= 1;
      }
      left += 1;
    }
    maxSize = Math.max(maxSize, distinctPitches);
  }
  return maxSize;
}

export function nonDrumNotes(composition: GeneratorMidiComposition) {
  return composition.tracks.flatMap((track) => track.drums ? [] : absoluteTrackNotes(track));
}

export function structuralNonDrumAttacks(composition: GeneratorMidiComposition) {
  return composition.tracks.flatMap((track) => {
    if (track.drums) {
      return [];
    }
    const notes = absoluteTrackNotes(track).sort((left, right) => left.tick - right.tick || left.note - right.note);
    const attacks: AbsoluteGeneratorNote[] = [];
    for (const note of notes) {
      const previous = attacks[attacks.length - 1];
      if (previous && note.tick - previous.tick <= 90) {
        continue;
      }
      attacks.push(note);
    }
    return attacks;
  });
}

export function offbeatRatio(composition: GeneratorMidiComposition) {
  const notes = structuralNonDrumAttacks(composition);
  if (notes.length === 0) {
    return 0;
  }
  const offbeats = notes.filter((note) => note.tick % GENERATOR_MIDI_TICKS_PER_QUARTER !== 0);
  return offbeats.length / notes.length;
}

export function phraseFillWindows(lengthBars: GeneratorLengthBars) {
  const boundaries = lengthBars <= 4
    ? [lengthBars]
    : Array.from({ length: Math.floor(lengthBars / 4) }, (_, index) => (index + 1) * 4);
  return boundaries.map((boundaryBar) => {
    const phraseStart = Math.max(0, (boundaryBar - 1) * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER);
    return {
      end: boundaryBar * GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER,
      start: phraseStart + GENERATOR_MIDI_TICKS_PER_QUARTER * 3,
    };
  });
}

export function isDrumFillTrack(track: GeneratorMidiTrack) {
  return track.drums || /drum|rhythm|perc|kit|groove/i.test(track.name);
}

export function trackHasFillInWindow(track: GeneratorMidiTrack, window: { end: number; start: number }) {
  const fillNotes = absoluteTrackNotes(track).filter((note) => note.tick >= window.start && note.tick < window.end);
  const fillColorNotes = fillNotes.filter((note) => ![36, 42, 44, 46].includes(note.note));
  return fillColorNotes.length >= 2
    || (fillColorNotes.length >= 1 && fillNotes.length >= 3);
}

export function missingPhraseFillWindows(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  const drumTracks = composition.tracks.filter(isDrumFillTrack);
  return phraseFillWindows(lengthBars).filter((window) => !drumTracks.some((track) => trackHasFillInWindow(track, window)));
}

export function phraseFillPresent(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  return missingPhraseFillWindows(composition, lengthBars).length === 0;
}

export function isBassTrack(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  if (metadata?.bassRole || /bass|808|sub|root|pedal|low/.test(metadata?.role ?? "")) {
    return !track.drums;
  }
  return !track.drums && (
    /808|sub|bass|reese|low end|moog/i.test(track.name)
    || (track.program >= 32 && track.program <= 39)
  );
}

export function bassTrackRole(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  if (metadata?.bassRole) {
    if (/808|sub|reese/.test(metadata.bassRole)) return "sub";
    if (/offbeat|pump|strobe|pulse/.test(metadata.bassRole)) return "offbeat";
    if (/live|passing|walking|movement/.test(metadata.bassRole)) return "live";
    if (/root|pedal/.test(metadata.bassRole)) return "root";
    return metadata.bassRole;
  }
  if (metadata?.role && /808|sub|reese/.test(metadata.role)) return "sub";
  if (metadata?.role && /offbeat|pump|strobe|pulse/.test(metadata.role)) return "offbeat";
  const name = track.name.toLowerCase();
  if (/house|strobe|offbeat|pulse|pump/.test(name)) {
    return "offbeat";
  }
  if (/live|passing|movement|finger|upright|fretless|electric bass/.test(name) || track.program >= 32 && track.program <= 37) {
    return "live";
  }
  if (/808|sub|reese|low end|moog/.test(name) || track.program >= 38 && track.program <= 39) {
    return "sub";
  }
  return "root";
}

export function bassRoleCount(composition: GeneratorMidiComposition) {
  const bassTracks = composition.tracks.filter(isBassTrack);
  if (bassTracks.length === 0) {
    return 0;
  }
  return new Set(bassTracks.map(bassTrackRole)).size;
}

export function trackSatisfiesDeclaredRole(track: GeneratorMidiTrack, role: string) {
  const name = track.name.toLowerCase();
  const metadata = trackMetadata(track);
  const declared = `${metadata?.role ?? ""} ${metadata?.function ?? ""} ${metadata?.bassRole ?? ""}`;
  if (/drum|groove|rhythm|perc|kit/.test(role)) {
    return track.drums || /drum|groove|rhythm|perc|kit/.test(name);
  }
  if (/808|sub|reese/.test(role)) {
    return isBassTrack(track) && (/808|sub|reese|low end|moog/.test(`${name} ${declared}`) || track.program >= 38 && track.program <= 39);
  }
  if (/bass|low|root|pedal/.test(role)) {
    return isBassTrack(track);
  }
  if (/chord|comp|harmony|pad|keys|stab|voicing/.test(role)) {
    return !track.drums && (
      /chord|comp|harmony|pad|keys|rhodes|piano|organ|stab/.test(name)
      || maxNoteClusterSize(track) >= 2
    );
  }
  if (/lead|motif|melody|hook|riff|topline|counter/.test(role)) {
    return !track.drums && /lead|motif|melody|hook|riff|topline|counter/.test(`${name} ${declared}`);
  }
  const roleParts = role.split(/[-\s]+/).filter((part) => part.length > 2);
  if (declared && roleParts.length > 0 && roleParts.every((part) => declared.includes(part))) {
    return true;
  }
  return true;
}

export function declaredRoleMisses(composition: GeneratorMidiComposition, arrangementPlan?: GeneratorArrangementPlanHeader) {
  return (arrangementPlan?.roles ?? []).filter((role) => !composition.tracks.some((track) => trackSatisfiesDeclaredRole(track, role)));
}

export function melodicLayerCount(composition: GeneratorMidiComposition) {
  return composition.tracks.filter((track) => trackRole(track) === "melody" || /lead|riff|counter|hook|melody|motif/i.test(track.name)).length;
}

export function motifScore(composition: GeneratorMidiComposition) {
  const candidateTracks = composition.tracks.filter((track) => !track.drums && (trackRole(track) === "melody" || /lead|riff|counter|hook|melody|motif/i.test(track.name)));
  return candidateTracks.reduce((score, track) => {
    const notes = absoluteTrackNotes(track);
    const pitchClasses = notes.map((note) => note.note % 12);
    const repeatedPitchClasses = new Set(pitchClasses.filter((pitch, index) => pitchClasses.indexOf(pitch) !== index));
    const rhythmicCells = notes.map((note) => note.tick % (GENERATOR_MIDI_TICKS_PER_QUARTER * 4));
    const repeatedRhythms = new Set(rhythmicCells.filter((tick, index) => rhythmicCells.indexOf(tick) !== index));
    return score + (repeatedPitchClasses.size >= 2 ? 1 : 0) + (repeatedRhythms.size >= 2 ? 1 : 0);
  }, 0);
}

export function melodyPhraseScore(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const endTick = loopTicks(lengthBars);
  const candidateTracks = composition.tracks.filter((track) => !track.drums && (trackRole(track) === "melody" || /lead|riff|counter|hook|melody|motif/i.test(track.name)));
  return candidateTracks.reduce((bestScore, track) => {
    const notes = absoluteTrackNotes(track).sort((left, right) => left.tick - right.tick);
    if (notes.length < 4) {
      return bestScore;
    }
    const pitchRange = Math.max(...notes.map((note) => note.note)) - Math.min(...notes.map((note) => note.note));
    const directions = notes
      .slice(1)
      .map((note, index) => Math.sign(note.note - (notes[index]?.note ?? note.note)))
      .filter((direction) => direction !== 0);
    const directionChanges = directions.filter((direction, index) => index > 0 && direction !== directions[index - 1]).length;
    const barCoverage = new Set(notes.map((note) => Math.floor(note.tick / barTicks))).size;
    const hasPhraseEndResolution = notes.some((note) => note.tick >= Math.max(0, endTick - barTicks));
    const hasBreath = notes.some((note, index) => {
      const previous = notes[index - 1];
      return previous ? note.tick - (previous.tick + previous.durationTicks) >= GENERATOR_MIDI_TICKS_PER_QUARTER / 2 : false;
    });
    const phraseScore = [
      pitchRange >= 5,
      directionChanges >= 1,
      barCoverage >= Math.min(4, lengthBars),
      hasPhraseEndResolution,
      hasBreath,
    ].filter(Boolean).length;
    return Math.max(bestScore, phraseScore);
  }, 0);
}

export type GeneratorStyleValidationReport = {
  deductions: number;
  metrics: {
    bassTracks: number;
    deductions: number;
    drumNotesPerBar: number;
    drumTracks: number;
    requirements: readonly string[];
  };
  reasons: readonly string[];
};

export function styleTrackIdentity(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  return [
    track.name,
    metadata?.role,
    metadata?.lane,
    metadata?.function,
    metadata?.bassRole,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function emptyStyleValidation() {
  return {
    deductions: 0 as const,
    metrics: {
      bassTracks: 0 as const,
      deductions: 0 as const,
      drumNotesPerBar: 0 as const,
      drumTracks: 0 as const,
      requirements: [],
    },
    reasons: [],
  };
}

export function validateGeneratorStyleFit(composition: GeneratorMidiComposition, intentPlan: GeneratorIntentPlan, lengthBars: GeneratorLengthBars) {
  const tags = new Set(intentPlan.tags.all);
  const drumTracks = composition.tracks.filter(isDrumFillTrack);
  const bassTracks = composition.tracks.filter(isBassTrack);
  const drumNotesPerBar = drumTracks.reduce((count, track) => count + absoluteTrackNotes(track).length, 0) / Math.max(1, lengthBars);
  const requirements: string[] = [];
  const reasons: string[] = [];
  const explicitNoDrums = tagSetHas(tags, ["no-drums", "without-drums"]);
  const drillPocket = tagSetHas(tags, ["drill", "uk-drill", "brooklyn-drill", "chicago-drill", "drill-2020", "808-slide-pocket"]);
  const ambientSpace = tagSetHas(tags, ["ambient", "drone", "wide-space"]);
  const housePocket = tagSetHas(tags, ["house", "deep-house", "tech-house", "minimal-tech", "four-on-floor", "offbeat-pump"]);
  const neoSoulPocket = tagSetHas(tags, ["neo-soul"]);
  const amapianoPocket = tagSetHas(tags, ["amapiano", "log-drum", "durban", "amapiano-2021"]);

  if (drillPocket && !explicitNoDrums) {
    requirements.push("drum-groove");
    if (drumTracks.length === 0) {
      reasons.push("missing required drum groove identity");
    }
  }

  if (ambientSpace && !tagSetHas(tags, ["percussion-forward", "drumline-first"])) {
    requirements.push("ambient-negative-space");
    if (drumNotesPerBar > 6) {
      reasons.push(`ambient percussion density ${drumNotesPerBar.toFixed(1)}/6 per bar`);
    }
    if (drumTracks.length > 0 && phraseFillPresent(composition, lengthBars)) {
      reasons.push("ambient phrase-fill activity conflicts with negative space");
    }
    const ambientDensityCeiling = Math.min(48, intentPlan.validation.maxNonDrumNotesPerBar);
    const pitchedNotesPerBar = nonDrumNotes(composition).length / Math.max(1, lengthBars);
    if (pitchedNotesPerBar > ambientDensityCeiling) {
      reasons.push(`ambient note density ${pitchedNotesPerBar.toFixed(1)}/${ambientDensityCeiling} per bar`);
    }
  }

  if (housePocket || neoSoulPocket) {
    const label = neoSoulPocket ? "neo-soul" : "house";
    const densityCeiling = Math.min(neoSoulPocket ? 96 : 64, intentPlan.validation.maxNonDrumNotesPerBar);
    const pitchedNotesPerBar = nonDrumNotes(composition).length / Math.max(1, lengthBars);
    requirements.push(`${label}-single-bass-identity`);
    if (bassTracks.length > 1) {
      reasons.push(`${label} competing bass lanes ${bassTracks.length}/1`);
    }
    if (pitchedNotesPerBar > densityCeiling) {
      reasons.push(`${label} note density ${pitchedNotesPerBar.toFixed(1)}/${densityCeiling} per bar`);
    }
  }

  if (amapianoPocket) {
    requirements.push("log-drum-bass", "interlocking-percussion");
    const hasLogDrumBass = bassTracks.some((track) => /log.?drum|amapiano|durban/.test(styleTrackIdentity(track)));
    const hasPercussionIdentity = drumTracks.some((track) => {
      const identity = styleTrackIdentity(track);
      return /shaker|amapiano|durban|log.?drum|interlock/.test(identity);
    });
    if (!hasLogDrumBass) {
      reasons.push("missing log-drum bass identity");
    }
    if (!hasPercussionIdentity) {
      reasons.push("missing interlocking percussion identity");
    }
  }

  return {
    deductions: reasons.length * 12,
    metrics: {
      bassTracks: bassTracks.length,
      deductions: reasons.length * 12,
      drumNotesPerBar,
      drumTracks: drumTracks.length,
      requirements,
    },
    reasons,
  };
}

export function phraseVariationCount(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  const phraseTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR * 4;
  const phraseCount = Math.max(1, Math.ceil(lengthBars / 4));
  const signatures = Array.from({ length: phraseCount }, (_, phraseIndex) => {
    const phraseStart = phraseIndex * phraseTicks;
    const phraseEnd = Math.min(loopTicks(lengthBars), phraseStart + phraseTicks);
    return composition.tracks
      .map((track, trackIndex) => {
        const events = absoluteTrackNotes(track)
          .filter((note) => note.tick >= phraseStart && note.tick < phraseEnd)
          .map((note) => [
            trackIndex,
            Math.round((note.tick - phraseStart) / 60),
            Math.round(note.durationTicks / 60),
            note.note,
          ].join(":"));
        return events.join(",");
      })
      .join("|");
  });
  return new Set(signatures).size;
}

export function scoreGeneratorComposition(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, arrangementPlan?: GeneratorArrangementPlanHeader, intentPlan?: GeneratorIntentPlan) {
  const diagnostics = trackLengthDiagnostics(composition, lengthBars);
  const nonDrums = nonDrumNotes(composition);
  const missingDeclaredRoles = declaredRoleMisses(composition, arrangementPlan);
  const styleValidation = intentPlan ? validateGeneratorStyleFit(composition, intentPlan, lengthBars) : emptyStyleValidation();
  const metrics = {
    bassRoles: bassRoleCount(composition),
    declaredRoleMisses: missingDeclaredRoles,
    maxChordCluster: composition.tracks.reduce((maxSize, track) => track.drums ? maxSize : Math.max(maxSize, maxNoteClusterSize(track)), 0),
    melodicLayers: melodicLayerCount(composition),
    melodyPhraseScore: melodyPhraseScore(composition, lengthBars),
    motifScore: motifScore(composition),
    nonDrumNotesPerBar: nonDrums.length / Math.max(1, lengthBars),
    offbeatRatio: offbeatRatio(composition),
    phraseVariations: phraseVariationCount(composition, lengthBars),
    phraseFill: phraseFillPresent(composition, lengthBars),
    shortTracks: diagnostics.filter((diagnostic) => diagnostic.short).length,
    style: styleValidation.metrics,
    tracks: composition.tracks.length,
  };
  const densityScore = metrics.nonDrumNotesPerBar <= plan.quality.maxNonDrumNotesPerBar
    ? 10
    : Math.max(0, 10 - ((metrics.nonDrumNotesPerBar - plan.quality.maxNonDrumNotesPerBar) / Math.max(1, plan.quality.maxNonDrumNotesPerBar)) * 16);
  const chordClusterScore = metrics.maxChordCluster < plan.quality.minChordClusterSize
    ? metrics.maxChordCluster * 4
    : metrics.maxChordCluster > plan.quality.maxChordClusterSize
      ? Math.max(0, 20 - (metrics.maxChordCluster - plan.quality.maxChordClusterSize) * 6)
      : 20;
  const minBassRoles = Math.max(1, plan.quality.minBassRoles);
  const shortTrackScore = metrics.shortTracks <= plan.quality.maxShortTracks
    ? 10
    : Math.max(0, 10 - (metrics.shortTracks - plan.quality.maxShortTracks) * 2);
  const genericScore = [
    Math.min(14, (metrics.tracks / Math.max(1, plan.layers.minTracks)) * 14),
    Math.min(12, (metrics.bassRoles / minBassRoles) * 12),
    chordClusterScore,
    metrics.offbeatRatio >= plan.quality.minOffbeatRatio ? 15 : Math.max(0, (metrics.offbeatRatio / Math.max(0.01, plan.quality.minOffbeatRatio)) * 15),
    plan.quality.phraseFillRequired ? metrics.phraseFill ? 10 : 0 : 10,
    Math.min(10, metrics.melodicLayers * 3 + metrics.motifScore + metrics.melodyPhraseScore),
    shortTrackScore,
    metrics.phraseVariations >= plan.quality.minPhraseVariations ? 9 : metrics.phraseVariations * 3,
    densityScore,
  ].reduce((sum, value) => sum + value, 0);
  const score = Math.max(0, genericScore - styleValidation.deductions);
  const reasons = [
    ...(metrics.tracks < plan.layers.minTracks ? [`tracks ${metrics.tracks}/${plan.layers.minTracks}`] : []),
    ...(metrics.bassRoles < plan.quality.minBassRoles ? [`bass roles ${metrics.bassRoles}/${plan.quality.minBassRoles}`] : []),
    ...(metrics.maxChordCluster < plan.quality.minChordClusterSize ? [`chord cluster ${metrics.maxChordCluster}/${plan.quality.minChordClusterSize}`] : []),
    ...(metrics.maxChordCluster > plan.quality.maxChordClusterSize ? [`chord cluster over style ${metrics.maxChordCluster}/${plan.quality.maxChordClusterSize}`] : []),
    ...(metrics.offbeatRatio < plan.quality.minOffbeatRatio ? [`offbeat ${(metrics.offbeatRatio * 100).toFixed(0)}%/${Math.round(plan.quality.minOffbeatRatio * 100)}%`] : []),
    ...(plan.quality.phraseFillRequired && !metrics.phraseFill ? ["missing phrase fill"] : []),
    ...(plan.melody.counterline && metrics.melodicLayers < 2 ? [`melodic layers ${metrics.melodicLayers}/2`] : []),
    ...(metrics.melodicLayers > plan.quality.maxMelodicLayers ? [`melodic layers over style ${metrics.melodicLayers}/${plan.quality.maxMelodicLayers}`] : []),
    ...(metrics.phraseVariations < plan.quality.minPhraseVariations ? [`phrase variations ${metrics.phraseVariations}/${plan.quality.minPhraseVariations}`] : []),
    ...(metrics.nonDrumNotesPerBar > plan.quality.maxNonDrumNotesPerBar ? [`note density ${metrics.nonDrumNotesPerBar.toFixed(0)}/${plan.quality.maxNonDrumNotesPerBar} per bar`] : []),
    ...(metrics.shortTracks > plan.quality.maxShortTracks ? [`short tracks ${metrics.shortTracks}/${plan.quality.maxShortTracks}`] : []),
    ...(missingDeclaredRoles.length > 0 ? [`declared roles missing ${missingDeclaredRoles.join(", ")}`] : []),
    ...styleValidation.reasons,
  ];
  return {
    metrics,
    passed: score >= plan.quality.minScore && reasons.length === 0,
    reasons,
    score,
  };
}
