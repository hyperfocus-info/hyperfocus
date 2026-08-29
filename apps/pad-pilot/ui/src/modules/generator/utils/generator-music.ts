import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_TICKS_PER_QUARTER, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { isPadPilotDevtoolsEnabled } from "../../../runtime-flags";
import { type GeneratorIntentTags, type GeneratorLengthBars } from "./generator-options";
import { type AbsoluteGeneratorNote, type CodexClientOptions, type GeneratorHarmonicTolerancePolicy, type GeneratorMusicianPlan, type GeneratorPromptInput, type StyleDnaFilterStats } from "./generator-contracts";
import { blueNotesRequested, derivedHarmonicTolerancePolicy, selectedScaleInfo } from "./generator-prompt";
import { canonicalScaleRootName, semitoneByRoot } from "./generator-selection";
import { absoluteTrackNotes, deltaTrackNotes, loopTicks, trackMetadata, trackRole } from "./generator-tracker";

export const scaleIntervalMap: Record<string, readonly number[]> = {
  "acoustic": [0, 2, 4, 6, 7, 9, 10, 12],
  "aeolian dominant": [0, 2, 4, 5, 7, 8, 10, 12],
  "aeolian": [0, 2, 3, 5, 7, 8, 10, 12],
  "altered": [0, 1, 3, 4, 6, 8, 10, 12],
  "andalusian": [0, 1, 4, 5, 7, 8, 10, 12],
  "arabic hijaz": [0, 1, 4, 5, 7, 8, 10, 12],
  "augmented": [0, 3, 4, 7, 8, 11, 12],
  "augmented hexatonic": [0, 3, 4, 7, 8, 11, 12],
  "balinese": [0, 1, 3, 7, 8, 12],
  "bebop dominant": [0, 2, 4, 5, 7, 9, 10, 11, 12],
  "bebop major": [0, 2, 4, 5, 7, 8, 9, 11, 12],
  "bebop minor": [0, 2, 3, 4, 5, 7, 9, 10, 12],
  "blues": [0, 3, 5, 6, 7, 10, 12],
  "byzantine": [0, 1, 4, 5, 7, 8, 11, 12],
  "chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  "diminished half-whole": [0, 1, 3, 4, 6, 7, 9, 10, 12],
  "diminished whole-half": [0, 2, 3, 5, 6, 8, 9, 11, 12],
  "dominant bebop": [0, 2, 4, 5, 7, 9, 10, 11, 12],
  "dorian": [0, 2, 3, 5, 7, 9, 10, 12],
  "dorian #4": [0, 2, 3, 6, 7, 9, 10, 12],
  "dorian b2": [0, 1, 3, 5, 7, 9, 10, 12],
  "dorian pentatonic": [0, 2, 3, 7, 10, 12],
  "double harmonic": [0, 1, 4, 5, 7, 8, 11, 12],
  "egyptian": [0, 2, 5, 7, 10, 12],
  "enigmatic": [0, 1, 4, 6, 8, 10, 11, 12],
  "flamenco": [0, 1, 4, 5, 7, 8, 10, 12],
  "freygish": [0, 1, 4, 5, 7, 8, 10, 12],
  "gypsy minor": [0, 2, 3, 6, 7, 8, 11, 12],
  "half diminished": [0, 2, 3, 5, 6, 8, 10, 12],
  "harmonic major": [0, 2, 4, 5, 7, 8, 11, 12],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11, 12],
  "hirajoshi": [0, 2, 3, 7, 8, 12],
  "hungarian major": [0, 3, 4, 6, 7, 9, 10, 12],
  "hungarian minor": [0, 2, 3, 6, 7, 8, 11, 12],
  "in": [0, 1, 5, 7, 8, 12],
  "ionian": [0, 2, 4, 5, 7, 9, 11, 12],
  "iwato": [0, 1, 5, 6, 10, 12],
  "japanese insen": [0, 1, 5, 7, 10, 12],
  "klezmer": [0, 1, 4, 5, 7, 8, 10, 12],
  "kumoi": [0, 2, 3, 7, 9, 12],
  "locrian": [0, 1, 3, 5, 6, 8, 10, 12],
  "locrian natural 2": [0, 2, 3, 5, 6, 8, 10, 12],
  "lydian": [0, 2, 4, 6, 7, 9, 11, 12],
  "lydian #2": [0, 3, 4, 6, 7, 9, 11, 12],
  "lydian augmented": [0, 2, 4, 6, 8, 9, 11, 12],
  "lydian b7": [0, 2, 4, 6, 7, 9, 10, 12],
  "lydian dominant": [0, 2, 4, 6, 7, 9, 10, 12],
  "lydian minor": [0, 2, 4, 6, 7, 8, 10, 12],
  "lydian pentatonic": [0, 4, 6, 7, 11, 12],
  "maqam bayati": [0, 1, 3, 5, 7, 8, 10, 12],
  "maqam hijaz": [0, 1, 4, 5, 7, 8, 10, 12],
  "maqam nahawand": [0, 2, 3, 5, 7, 8, 10, 12],
  "maqam rast": [0, 2, 4, 5, 7, 9, 10, 12],
  "major": [0, 2, 4, 5, 7, 9, 11, 12],
  "major b6": [0, 2, 4, 5, 7, 8, 11, 12],
  "major bebop": [0, 2, 4, 5, 7, 8, 9, 11, 12],
  "major blues": [0, 2, 3, 4, 7, 9, 12],
  "major pentatonic": [0, 2, 4, 7, 9, 12],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11, 12],
  "messiaen mode 2": [0, 1, 3, 4, 6, 7, 9, 10, 12],
  "messiaen mode 3": [0, 2, 3, 4, 6, 7, 8, 10, 11, 12],
  "minor": [0, 2, 3, 5, 7, 8, 10, 12],
  "minor bebop": [0, 2, 3, 4, 5, 7, 9, 10, 12],
  "minor blues": [0, 3, 5, 6, 7, 10, 12],
  "minor major": [0, 2, 3, 5, 7, 8, 11, 12],
  "minor pentatonic": [0, 3, 5, 7, 10, 12],
  "mixolydian": [0, 2, 4, 5, 7, 9, 10, 12],
  "mixolydian #11": [0, 2, 4, 6, 7, 9, 10, 12],
  "mixolydian b2": [0, 1, 4, 5, 7, 9, 10, 12],
  "mixolydian b6": [0, 2, 4, 5, 7, 8, 10, 12],
  "mixolydian pentatonic": [0, 4, 5, 7, 10, 12],
  "natural minor": [0, 2, 3, 5, 7, 8, 10, 12],
  "neapolitan dorian": [0, 1, 3, 5, 7, 9, 10, 12],
  "neapolitan major": [0, 1, 3, 5, 7, 9, 11, 12],
  "neapolitan minor": [0, 1, 3, 5, 7, 8, 11, 12],
  "oriental": [0, 1, 4, 5, 6, 9, 10, 12],
  "pelog": [0, 1, 3, 7, 8, 12],
  "pelog barang": [0, 2, 3, 7, 9, 12],
  "persian": [0, 1, 4, 5, 6, 8, 11, 12],
  "phrygian": [0, 1, 3, 5, 7, 8, 10, 12],
  "phrygian b4": [0, 1, 2, 5, 7, 8, 10, 12],
  "phrygian dominant": [0, 1, 4, 5, 7, 8, 10, 12],
  "prometheus": [0, 2, 4, 6, 9, 10, 12],
  "raga bhairav": [0, 1, 4, 5, 7, 8, 11, 12],
  "raga charukeshi": [0, 2, 4, 5, 7, 8, 10, 12],
  "raga kafi": [0, 2, 3, 5, 7, 9, 10, 12],
  "raga kirwani": [0, 2, 3, 5, 7, 8, 11, 12],
  "raga todi": [0, 1, 3, 6, 7, 8, 11, 12],
  "raga yaman": [0, 2, 4, 6, 7, 9, 11, 12],
  "romanian minor": [0, 2, 3, 6, 7, 9, 10, 12],
  "sixth diminished": [0, 2, 4, 5, 7, 8, 9, 11, 12],
  "slendro": [0, 2, 5, 7, 9, 12],
  "spanish gypsy": [0, 1, 4, 5, 7, 8, 10, 12],
  "spanish phrygian": [0, 1, 4, 5, 7, 8, 10, 12],
  "super locrian": [0, 1, 3, 4, 6, 8, 10, 12],
  "suspended pentatonic": [0, 2, 5, 7, 10, 12],
  "tritone": [0, 1, 4, 6, 7, 10, 12],
  "ukrainian dorian": [0, 2, 3, 6, 7, 9, 10, 12],
  "whole half bebop": [0, 2, 3, 5, 6, 8, 9, 10, 11, 12],
  "whole tone": [0, 2, 4, 6, 8, 10, 12],
  "yo": [0, 2, 5, 7, 9, 12],
};

export function normalizedScaleMode(scaleKey: string | undefined) {
  const trimmed = scaleKey?.trim() ?? "";
  const legacyKeyMatch = /^[A-G](?:#|b)?\s+(.+)$/i.exec(trimmed);
  return (legacyKeyMatch?.[1] ?? trimmed).toLowerCase().replace(/\s+/g, " ").trim();
}

export function scaleIntervals(scaleKey: string | undefined) {
  return scaleIntervalMap[normalizedScaleMode(scaleKey)] ?? scaleIntervalMap.major ?? [0, 2, 4, 5, 7, 9, 11, 12];
}

export function scalePitchClasses(root: number, intervals: readonly number[]) {
  return new Set(intervals.map((interval) => (root + interval + 120) % 12));
}

export function blueNotePitchClasses(root: number) {
  return [3, 6, 10].map((interval) => (root + interval + 120) % 12);
}

export function nearestScaleNote(note: number, allowedPitchClasses: ReadonlySet<number>) {
  if (allowedPitchClasses.has((note + 120) % 12)) {
    return note;
  }
  const candidates = Array.from({ length: 25 }, (_, index) => index - 12)
    .map((offset) => note + offset)
    .filter((candidate) => candidate >= 0 && candidate <= 127 && allowedPitchClasses.has(candidate % 12))
    .sort((left, right) => Math.abs(left - note) - Math.abs(right - note) || left - right);
  return candidates[0] ?? note;
}

export function scaleViolationCount(composition: GeneratorMidiComposition, selectedKey: string, selectedMode: string) {
  const root = 60 + semitoneByRoot[canonicalScaleRootName(selectedKey)];
  const allowedPitchClasses = scalePitchClasses(root, scaleIntervals(selectedMode));
  return composition.tracks.reduce((sum, track) => {
    if (track.drums) {
      return sum;
    }
    return sum + absoluteTrackNotes(track).filter((note) => !allowedPitchClasses.has(note.note % 12)).length;
  }, 0);
}

export function compositionNoteCount(composition: GeneratorMidiComposition) {
  return composition.tracks.reduce((sum, track) => sum + absoluteTrackNotes(track).length, 0);
}

export function logDevCompareMetrics(
  options: CodexClientOptions,
  original: GeneratorMidiComposition,
  final: GeneratorMidiComposition,
  selectedKey: string,
  selectedMode: string,
) {
  if (!isPadPilotDevtoolsEnabled()) {
    return;
  }
  const originalNames = new Set(original.tracks.map((track) => track.name));
  const addedLanes = final.tracks.filter((track) => !originalNames.has(track.name)).map((track) => track.name);
  options.onLog?.([
    "dev compare",
    `scale ${scaleViolationCount(original, selectedKey, selectedMode)}->${scaleViolationCount(final, selectedKey, selectedMode)}`,
    `tracks ${original.tracks.length}->${final.tracks.length}`,
    `notes ${compositionNoteCount(original)}->${compositionNoteCount(final)}`,
    `added ${addedLanes.length ? addedLanes.join(", ") : "none"}`,
  ].join("; "));
}

export function hasNearScaleResolution(notes: readonly AbsoluteGeneratorNote[], index: number, allowedPitchClasses: ReadonlySet<number>) {
  const source = notes[index];
  if (!source) {
    return false;
  }
  return notes.slice(index + 1).some((candidate) =>
    candidate.tick > source.tick
    && candidate.tick <= source.tick + GENERATOR_MIDI_TICKS_PER_QUARTER * 2
    && Math.abs(candidate.note - source.note) <= 2
    && allowedPitchClasses.has(candidate.note % 12),
  );
}

export function isPhraseResolutionTick(note: AbsoluteGeneratorNote, lengthBars: GeneratorLengthBars) {
  return note.tick >= loopTicks(lengthBars) - GENERATOR_MIDI_TICKS_PER_QUARTER;
}

export function isTensionSlot(note: AbsoluteGeneratorNote, plan: GeneratorMusicianPlan) {
  const beatOffset = note.tick % GENERATOR_MIDI_TICKS_PER_QUARTER;
  const barOffset = note.tick % (GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR);
  return beatOffset !== 0
    || barOffset >= GENERATOR_MIDI_TICKS_PER_QUARTER * 3
    || plan.harmony.changesPerFourBars >= 6
    || plan.harmony.chordLanguage === "altered";
}

export function policyHasNamedTension(policy: GeneratorHarmonicTolerancePolicy) {
  return policy.allowedTensions.length > 0 || policy.avantAllowed.length > 0;
}

export function trackDeclaresHarmonicTension(track: GeneratorMidiTrack) {
  const metadata = trackMetadata(track);
  const source = [
    track.name,
    metadata?.role ?? "",
    metadata?.function ?? "",
    metadata?.lane ?? "",
  ].join(" ");
  return /altered|chromatic|diminished|passing|semitone|tension|resolved/.test(source);
}

export function shouldPreserveOutsidePitch(
  track: GeneratorMidiTrack,
  note: AbsoluteGeneratorNote,
  notes: readonly AbsoluteGeneratorNote[],
  index: number,
  allowedPitchClasses: ReadonlySet<number>,
  policy: GeneratorHarmonicTolerancePolicy,
  plan: GeneratorMusicianPlan,
  lengthBars: GeneratorLengthBars,
) {
  if (policy.mode === "strict") {
    return false;
  }
  const role = trackRole(track);
  const resolves = hasNearScaleResolution(notes, index, allowedPitchClasses);
  const tensionSlot = isTensionSlot(note, plan);
  if (isPhraseResolutionTick(note, lengthBars) && !(resolves && (role === "chords" || role === "support" || role === "texture"))) {
    return false;
  }
  if ((role === "chords" || role === "support" || role === "texture") && (policy.mode === "tension" || policy.mode === "avant")) {
    const declaredTension = trackDeclaresHarmonicTension(track);
    return resolves
      && (declaredTension || (tensionSlot && plan.harmony.chordLanguage === "altered"))
      && (policyHasNamedTension(policy) || plan.harmony.chordLanguage === "altered");
  }
  if (role === "melody" && policy.mode === "avant") {
    return resolves && tensionSlot;
  }
  if (role === "bass") {
    return policy.mode === "avant" && resolves && tensionSlot;
  }
  return false;
}

export function enforceCompositionScale(
  composition: GeneratorMidiComposition,
  input: GeneratorPromptInput,
  intentTags: GeneratorIntentTags,
  stats: StyleDnaFilterStats,
  lengthBars: GeneratorLengthBars,
  plan: GeneratorMusicianPlan,
  modelPolicy?: GeneratorHarmonicTolerancePolicy,
) {
  const { selectedKey, selectedMode } = selectedScaleInfo(input);
  const root = 60 + semitoneByRoot[canonicalScaleRootName(selectedKey)];
  const policy = derivedHarmonicTolerancePolicy(input, intentTags, plan, modelPolicy);
  const allowedPitchClasses = scalePitchClasses(root, scaleIntervals(selectedMode));
  if (blueNotesRequested(input, intentTags) || policy.allowedTensions.some((tag) => /blue/.test(tag))) {
    for (const pitchClass of blueNotePitchClasses(root)) {
      allowedPitchClasses.add(pitchClass);
    }
  }
  return {
    ...composition,
    tracks: composition.tracks.map((track) => {
      if (track.drums) {
        return track;
      }
      const sourceNotes = absoluteTrackNotes(track);
      const notes = sourceNotes.map((note, index) => {
        if (
          !allowedPitchClasses.has(note.note % 12)
          && shouldPreserveOutsidePitch(track, note, sourceNotes, index, allowedPitchClasses, policy, plan, lengthBars)
        ) {
          return note;
        }
        const snapped = nearestScaleNote(note.note, allowedPitchClasses);
        if (snapped !== note.note) {
          stats.pitchCorrectedNotes += 1;
        }
        return {
          ...note,
          note: snapped,
        } satisfies AbsoluteGeneratorNote;
      });
      return {
        ...track,
        notes: deltaTrackNotes(notes),
      } satisfies GeneratorMidiTrack;
    }),
  } satisfies GeneratorMidiComposition;
}

export function scaleNote(root: number, intervals: readonly number[], degree: number, octave = 0) {
  const normalized = Math.max(0, degree);
  const stepsPerOctave = Math.max(1, intervals.length - 1);
  const octaveOffset = Math.floor(normalized / stepsPerOctave) * 12;
  return root + octave * 12 + octaveOffset + (intervals[normalized % stepsPerOctave] ?? 0);
}

export function chordDegreeOffsets(plan: GeneratorMusicianPlan, index: number) {
  if (plan.harmony.chordLanguage === "altered") {
    return plan.harmony.rootless ? [2, 6, 8, 10, 12] : [0, 2, 6, 8, 10, 12];
  }
  if (plan.harmony.chordLanguage === "extended") {
    if (plan.harmony.voicingRange === "wide") {
      return plan.harmony.rootless ? [2, 6, 8, 10, 12] : [0, 2, 6, 8, 10, 12];
    }
    return plan.harmony.rootless ? [2, 6, 8, index % 2 === 0 ? 12 : 10] : [0, 2, 6, 8];
  }
  if (plan.harmony.chordLanguage === "sevenths") {
    return plan.harmony.rootless ? [2, 6, 8, 11] : [0, 2, 4, 6];
  }
  return [0, 2, 4];
}

export function fitNoteToRange(note: number, low: number, high: number) {
  let next = note;
  while (next < low) next += 12;
  while (next > high) next -= 12;
  return next;
}

export function compactVoicing(notes: readonly number[], range: GeneratorMusicianPlan["harmony"]["voicingRange"] = "medium") {
  const low = range === "wide" ? 45 : range === "narrow" ? 54 : 52;
  const high = range === "wide" ? 92 : range === "narrow" ? 76 : 84;
  const maxSpan = range === "wide" ? 30 : range === "narrow" ? 14 : 18;
  const next = notes.map((note) => fitNoteToRange(note, low, high)).sort((left, right) => left - right);
  while (next.length > 0 && (next[next.length - 1] ?? 0) - (next[0] ?? 0) > maxSpan) {
    next[0] = (next[0] ?? 0) + 12;
    next.sort((left, right) => left - right);
  }
  return next;
}

export function rotateVoicing(notes: readonly number[], rotation: number, range: GeneratorMusicianPlan["harmony"]["voicingRange"]) {
  const next = [...notes].sort((left, right) => left - right);
  for (let index = 0; index < rotation; index += 1) {
    const first = next.shift();
    if (first !== undefined) {
      next.push(first + 12);
    }
  }
  return compactVoicing(next, range);
}

export function voicingCost(previous: readonly number[] | undefined, next: readonly number[]) {
  if (!previous || previous.length === 0) {
    return next.reduce((sum, note) => sum + Math.abs(note - 66), 0);
  }
  const length = Math.min(previous.length, next.length);
  let cost = Math.abs(previous.length - next.length) * 4;
  for (let index = 0; index < length; index += 1) {
    cost += Math.abs((previous[index] ?? 0) - (next[index] ?? 0));
  }
  return cost;
}

export function chooseVoiceLedVoicing(root: number, intervals: readonly number[], offset: number, plan: GeneratorMusicianPlan, previous: readonly number[] | undefined, index: number) {
  const base = chordDegreeOffsets(plan, index)
    .map((degreeOffset, noteIndex) => scaleNote(root, intervals, offset + degreeOffset, noteIndex >= 2 ? 0 : 0));
  const candidates = [0, 1, 2, 3]
    .map((rotation) => rotateVoicing(base, rotation, plan.harmony.voicingRange))
    .flatMap((voicing) => [-12, 0, 12].map((shift) => compactVoicing(voicing.map((note) => note + shift), plan.harmony.voicingRange)));
  return candidates.reduce((best, candidate) => voicingCost(previous, candidate) < voicingCost(previous, best) ? candidate : best, candidates[0] ?? compactVoicing(base, plan.harmony.voicingRange));
}

export function voiceLedChordVoicings(progression: readonly number[], root: number, intervals: readonly number[], plan: GeneratorMusicianPlan) {
  const voicings: number[][] = [];
  let previous: readonly number[] | undefined;
  for (const [index, offset] of progression.entries()) {
    const next = chooseVoiceLedVoicing(root, intervals, offset, plan, previous, index).slice(0, plan.quality.maxChordClusterSize);
    voicings.push(next);
    previous = next;
  }
  return voicings;
}

export function colorVoicing(notes: readonly number[], index: number, range: GeneratorMusicianPlan["harmony"]["voicingRange"] = "medium") {
  if (notes.length < 4 || index % 2 === 0) {
    return notes;
  }
  const next = [...notes];
  const topIndex = next.length - 1;
  next[topIndex] = (next[topIndex] ?? 0) + (index % 4 === 1 ? 2 : -1);
  return compactVoicing(next, range);
}

export function buildGenreProgression(baseProgression: readonly number[], lengthBars: GeneratorLengthBars, plan: GeneratorMusicianPlan, creativity: number) {
  const changesPerFourBars = Math.max(1, plan.harmony.changesPerFourBars);
  const pattern = Array.from({ length: lengthBars }, (_, index) => {
    if (changesPerFourBars <= 1) {
      return baseProgression[Math.floor(index / 4) % baseProgression.length] ?? 0;
    }
    if (changesPerFourBars === 2) {
      return baseProgression[Math.floor(index / 2) % Math.min(2, baseProgression.length)] ?? 0;
    }
    if (changesPerFourBars === 3) {
      const position = index % 4;
      const sourceIndex = position === 3 ? 2 : position;
      return baseProgression[sourceIndex % baseProgression.length] ?? 0;
    }
    return baseProgression[index % baseProgression.length] ?? 0;
  });

  return pattern.map((offset, index) => {
    const gospelPassing = plan.harmony.changesPerFourBars > 4 && index % 2 === 1;
    if (gospelPassing) {
      const next = pattern[(index + 1) % pattern.length] ?? offset;
      return Math.max(0, next + (next >= offset ? -1 : 1));
    }
    const turnaround = plan.form.arc === "starter-turnaround" && index % 4 === 3;
    if (turnaround && plan.harmony.voicingRange !== "narrow") {
      const next = pattern[(index + 1) % pattern.length] ?? offset;
      return Math.max(0, next + (next >= offset ? -1 : 1));
    }
    return creativity > 0.84 && plan.harmony.voicingRange !== "narrow" && index % 4 === 3 ? offset + 1 : offset;
  });
}
