import { fallbackInstrumentPalettes } from "./generator-fallback-palettes";
export { fallbackInstrumentPalettes } from "./generator-fallback-palettes";
import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-options";
import { type FallbackInstrument, type FallbackInstrumentPalette, type FallbackNoteEvent, type GeneratorIntentPlan, type GeneratorMusicianPlan, type GeneratorPromptInput } from "./generator-contracts";
import { buildGenreProgression, chooseVoiceLedVoicing, chordDegreeOffsets, colorVoicing, fitNoteToRange, scaleIntervals, scaleNote, voiceLedChordVoicings } from "./generator-music";
import { arrangementPlanMetadataLine, buildGeneratorIntentPlan, buildMusicianPlan, intentPlanTagList, intentPlanTagSet, intentTagMetadataLine, MAX_TRACKER_TICK, normalizedTag, promptSeed, schemaMetadataLine, selectedLengthBars, selectedScaleInfo, tagSetHas } from "./generator-prompt";
import { hashString, pickSeeded, scaleRoot } from "./generator-selection";
import { clampInteger } from "./generator-tracker";
import { clamp01Or } from "../../../utils/math";


export function noteBlocks(events: readonly FallbackNoteEvent[]) {
  let previousTick = 0;
  return [...events]
    .sort((left, right) => left.tick - right.tick || left.note - right.note)
    .map((event) => {
      const deltaTicks = Math.max(0, event.tick - previousTick);
      previousTick = event.tick;
      return `[${deltaTicks},${event.note},${event.velocity},${event.durationTicks}]`;
    })
    .join("");
}

export function chord(tick: number, notes: readonly number[], velocity: number, durationTicks: number) {
  return notes.map((note) => ({
    durationTicks,
    note,
    tick,
    velocity,
  }));
}

export function phraseEndsBar(index: number, lengthBars: number) {
  return (index + 1) % 4 === 0 || index === lengthBars - 1;
}

export function boundedEvents(events: readonly FallbackNoteEvent[], endTick: number) {
  const next: FallbackNoteEvent[] = [];
  for (const event of events) {
    if (event.tick >= endTick) {
      continue;
    }
    next.push({
      durationTicks: clampInteger(Math.min(event.durationTicks, endTick - event.tick), 1, MAX_TRACKER_TICK),
      note: clampInteger(event.note, 0, 127),
      tick: clampInteger(event.tick, 0, Math.max(0, endTick - 1)),
      velocity: clampInteger(event.velocity, 1, 127),
    });
  }
  return next;
}

export function capFallbackSupportEvents(instrumentName: string, events: readonly FallbackNoteEvent[]) {
  const cap = /guide|upper color|single voice/i.test(instrumentName)
    ? 66
    : /texture|pad|shimmer|drone/i.test(instrumentName)
      ? 58
      : /counter|riff|fill/i.test(instrumentName)
        ? 76
        : undefined;
  return cap === undefined ? [...events] : events.map((event) => ({
    ...event,
    velocity: Math.min(event.velocity, cap),
  }));
}

export function chordRhythmHits(joined: string, isSparse: boolean, isSyncopated: boolean, density: number, creativity: number) {
  if (/gospel|neo soul|r&b|soul|acid jazz|jazz/.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 360, offsetTicks: 0, velocity: 84 },
      { degreeShift: 1, durationTicks: 300, offsetTicks: 480, velocity: 78 },
      { degreeShift: 2, durationTicks: 360, offsetTicks: 960, velocity: 82 },
      { degreeShift: 1, durationTicks: 300, offsetTicks: 1440, velocity: 80 },
    ] as const;
  }

  if (/drill/.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 1320, offsetTicks: 0, velocity: 78 },
      ...(creativity > 0.76 ? [{ degreeShift: 1, durationTicks: 240, offsetTicks: 1440, velocity: 70 }] as const : []),
    ] as const;
  }

  if (/pop|happy|joyful|playful/.test(joined) && !/r&b|soul|jazz/.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 720, offsetTicks: 0, velocity: 82 },
      { degreeShift: 0, durationTicks: 420, offsetTicks: 960, velocity: 74 },
    ] as const;
  }

  if (/triplet|swing|shuffle|jazz/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 420, offsetTicks: 320, velocity: 83 },
      { degreeShift: 1, durationTicks: 420, offsetTicks: 960, velocity: 76 },
      { degreeShift: 0, durationTicks: 300, offsetTicks: 1600, velocity: 80 },
    ] as const;
  }

  if (/house|techno|garage|dub|club|warehouse/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 240, offsetTicks: 240, velocity: 86 },
      { degreeShift: 1, durationTicks: 220, offsetTicks: 720, velocity: 74 },
      { degreeShift: 0, durationTicks: 260, offsetTicks: 1200, velocity: 82 },
      { degreeShift: 1, durationTicks: 180, offsetTicks: 1680, velocity: 72 },
    ] as const;
  }

  if (/amapiano|log-drum|durban/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 360, offsetTicks: 0, velocity: 78 },
      { degreeShift: 0, durationTicks: 240, offsetTicks: 720, velocity: 74 },
      { degreeShift: 1, durationTicks: 300, offsetTicks: 1200, velocity: 80 },
    ] as const;
  }

  if (/reggaeton|dancehall|dembow|moombahton/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 300, offsetTicks: 240, velocity: 82 },
      { degreeShift: 1, durationTicks: 240, offsetTicks: 720, velocity: 78 },
      { degreeShift: 0, durationTicks: 300, offsetTicks: 1200, velocity: 80 },
      { degreeShift: 1, durationTicks: 180, offsetTicks: 1680, velocity: 74 },
    ] as const;
  }

  if (/baile|tamborzao|tamborzão|funk-carioca|rio-baile/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 180, offsetTicks: 0, velocity: 82 },
      { degreeShift: 1, durationTicks: 180, offsetTicks: 540, velocity: 74 },
      { degreeShift: 0, durationTicks: 220, offsetTicks: 1080, velocity: 80 },
    ] as const;
  }

  if (/bossa|salsa|samba|cumbia|clave/i.test(joined)) {
    return [
      { degreeShift: 0, durationTicks: 360, offsetTicks: 240, velocity: 82 },
      { degreeShift: 1, durationTicks: 300, offsetTicks: 720, velocity: 76 },
      { degreeShift: 0, durationTicks: 300, offsetTicks: 1200, velocity: 80 },
      { degreeShift: 1, durationTicks: 240, offsetTicks: 1680, velocity: 74 },
    ] as const;
  }

  if (/funk|soul|latin|afro|syncopated/i.test(joined) || isSyncopated) {
    return [
      { degreeShift: 0, durationTicks: 420, offsetTicks: 240, velocity: 84 },
      { degreeShift: 1, durationTicks: 420, offsetTicks: 720, velocity: 78 },
      { degreeShift: 0, durationTicks: 300, offsetTicks: 1440, velocity: 82 },
    ] as const;
  }

  if (isSparse) {
    return [
      { degreeShift: 0, durationTicks: 840, offsetTicks: 240, velocity: 80 },
      { degreeShift: 1, durationTicks: 480, offsetTicks: 1200, velocity: 72 },
    ] as const;
  }

  if (density > 0.62 || creativity > 0.72) {
    return [
      { degreeShift: 0, durationTicks: 600, offsetTicks: 0, velocity: 82 },
      { degreeShift: 1, durationTicks: 420, offsetTicks: 720, velocity: 74 },
      { degreeShift: 0, durationTicks: 360, offsetTicks: 1440, velocity: 80 },
    ] as const;
  }

  return [
    { degreeShift: 0, durationTicks: 720, offsetTicks: 0, velocity: 82 },
    { degreeShift: 1, durationTicks: 480, offsetTicks: 960, velocity: 76 },
  ] as const;
}

export function strummedChord(tick: number, notes: readonly number[], velocity: number, durationTicks: number, spreadTicks: number, direction: "down" | "up") {
  const orderedNotes = [...notes].sort((left, right) => direction === "down" ? right - left : left - right);
  return orderedNotes.map((note, index) => {
    const offsetTicks = index * spreadTicks;
    const velocityShift = direction === "down" ? -index * 2 : index * 2;
    return {
      durationTicks: Math.max(60, durationTicks - offsetTicks),
      note,
      tick: tick + offsetTicks,
      velocity: clampInteger(velocity + velocityShift, 1, 127),
    } satisfies FallbackNoteEvent;
  });
}

export function phraseStrength(index: number, lengthBars: number) {
  if (index === lengthBars - 1) return 3;
  if ((index + 1) % 8 === 0) return 2;
  if ((index + 1) % 4 === 0) return 1;
  return 0;
}

export function drumFillEvents(start: number, index: number, lengthBars: number, density: number, isHighEnergy: boolean) {
  const strength = phraseStrength(index, lengthBars);
  if (strength === 0) {
    return [];
  }

  if (strength === 1 && density < 0.46 && !isHighEnergy) {
    return [
      { durationTicks: 120, note: 49, tick: start + 1800, velocity: 88 },
    ] satisfies FallbackNoteEvent[];
  }

  const velocity = strength === 3 ? 118 : strength === 2 ? 108 : 96;
  const spacing = strength === 3 ? 120 : 240;
  const voices = strength === 3 ? [38, 45, 47, 50] : strength === 2 ? [38, 42, 45, 49] : [38, 42, 38, 49];
  return voices.map((note, voiceIndex) => ({
    durationTicks: 120,
    note,
    tick: start + 1440 + voiceIndex * spacing,
    velocity: clampInteger(velocity - voiceIndex * 5, 1, 127),
  })) satisfies FallbackNoteEvent[];
}

export function drumGrooveEvents(joined: string, start: number, index: number, lengthBars: number, density: number, isHighEnergy: boolean) {
  const phraseFill = drumFillEvents(start, index, lengthBars, density, isHighEnergy);
  if (/reggaeton|dancehall|dembow|moombahton/i.test(joined)) {
    return [
      { durationTicks: 120, note: 36, tick: start, velocity: 112 },
      { durationTicks: 120, note: 42, tick: start + 480, velocity: 66 },
      { durationTicks: 120, note: 36, tick: start + 720, velocity: 96 },
      { durationTicks: 120, note: 38, tick: start + 960, velocity: 108 },
      { durationTicks: 120, note: 42, tick: start + 1440, velocity: 72 },
      ...phraseFill,
    ] satisfies FallbackNoteEvent[];
  }
  if (/amapiano|log-drum|durban/i.test(joined)) {
    return [
      { durationTicks: 120, note: 36, tick: start, velocity: 104 },
      { durationTicks: 120, note: 42, tick: start + 360, velocity: 62 },
      { durationTicks: 120, note: 44, tick: start + 720, velocity: 82 },
      { durationTicks: 120, note: 36, tick: start + 960, velocity: 94 },
      { durationTicks: 120, note: 44, tick: start + 1200, velocity: 78 },
      { durationTicks: 120, note: 42, tick: start + 1440, velocity: 70 },
      ...phraseFill,
    ] satisfies FallbackNoteEvent[];
  }
  if (/baile|tamborzao|tamborzão|funk-carioca|rio-baile/i.test(joined)) {
    return [
      { durationTicks: 120, note: 36, tick: start, velocity: 116 },
      { durationTicks: 120, note: 42, tick: start + 240, velocity: 68 },
      { durationTicks: 120, note: 36, tick: start + 480, velocity: 100 },
      { durationTicks: 120, note: 39, tick: start + 720, velocity: 104 },
      { durationTicks: 120, note: 38, tick: start + 960, velocity: 108 },
      { durationTicks: 120, note: 42, tick: start + 1200, velocity: 72 },
      { durationTicks: 120, note: 39, tick: start + 1440, velocity: 96 },
      ...phraseFill,
    ] satisfies FallbackNoteEvent[];
  }
  if (/bossa|salsa|samba|cumbia|clave/i.test(joined)) {
    return [
      { durationTicks: 120, note: 75, tick: start, velocity: 86 },
      { durationTicks: 120, note: 36, tick: start + 240, velocity: 92 },
      { durationTicks: 120, note: 42, tick: start + 720, velocity: 68 },
      { durationTicks: 120, note: 38, tick: start + 960, velocity: 96 },
      { durationTicks: 120, note: 75, tick: start + 1200, velocity: 82 },
      { durationTicks: 120, note: 42, tick: start + 1440, velocity: 70 },
      ...phraseFill,
    ] satisfies FallbackNoteEvent[];
  }
  const closedHatVelocity = isHighEnergy ? 78 : 68;
  return [
    { durationTicks: 120, note: 36, tick: start, velocity: 110 },
    { durationTicks: 120, note: 42, tick: start + 480, velocity: closedHatVelocity },
    { durationTicks: 120, note: 38, tick: start + 960, velocity: 104 },
    { durationTicks: 120, note: 42, tick: start + 1440, velocity: 70 },
    ...(isHighEnergy ? [{ durationTicks: 120, note: 42, tick: start + 720, velocity: 64 }] : []),
    ...(density > 0.68 ? [{ durationTicks: 120, note: 42, tick: start + 240, velocity: 58 }] : []),
    ...phraseFill,
  ] satisfies FallbackNoteEvent[];
}

export function houseStrobeBassEvents(progression: readonly number[], root: number, intervals: readonly number[], lengthBars: GeneratorLengthBars, density: number, isHighEnergy: boolean) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const pattern = density < 0.42 ? [240, 1200] : [240, 720, 1200, 1680];
  return progression.flatMap((offset, index) => {
    const start = index * barTicks;
    const rootNote = scaleNote(root, intervals, offset, -2);
    const fifth = scaleNote(root, intervals, offset + 4, -2);
    const octave = scaleNote(root, intervals, offset, -1);
    return pattern.map((tickOffset, noteIndex) => ({
      durationTicks: tickOffset === 1680 && phraseEndsBar(index, lengthBars) ? 240 : 180,
      note: noteIndex % 4 === 3 ? octave : noteIndex % 2 === 0 ? rootNote : fifth,
      tick: start + tickOffset,
      velocity: clampInteger((isHighEnergy ? 98 : 86) - noteIndex * 4, 1, 127),
    })) satisfies FallbackNoteEvent[];
  });
}

export function liveBassEvents(progression: readonly number[], root: number, intervals: readonly number[], lengthBars: GeneratorLengthBars, isSparse: boolean) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  return progression.flatMap((offset, index) => {
    const start = index * barTicks;
    const nextOffset = progression[(index + 1) % progression.length] ?? offset;
    const rootNote = scaleNote(root, intervals, offset, -2);
    const fifth = scaleNote(root, intervals, offset + 4, -2);
    const octave = scaleNote(root, intervals, offset, -1);
    const approach = scaleNote(root, intervals, Math.max(0, nextOffset + (nextOffset >= offset ? -1 : 1)), -2);
    if (isSparse) {
      return [
        { durationTicks: phraseEndsBar(index, lengthBars) ? 1080 : 1440, note: rootNote, tick: start, velocity: 86 },
        ...(phraseEndsBar(index, lengthBars) ? [{ durationTicks: 240, note: approach, tick: start + 1560, velocity: 84 }] : []),
      ] satisfies FallbackNoteEvent[];
    }
    const events = [
      { durationTicks: isSparse ? 720 : 420, note: rootNote, tick: start, velocity: 88 },
      { durationTicks: 300, note: fifth, tick: start + 600, velocity: 78 },
      { durationTicks: 300, note: octave, tick: start + 1080, velocity: 76 },
      { durationTicks: 240, note: approach, tick: start + 1560, velocity: 82 },
    ];
    if (phraseEndsBar(index, lengthBars)) {
      events.push({ durationTicks: 120, note: scaleNote(root, intervals, nextOffset, -2), tick: start + 1800, velocity: 90 });
    }
    return events satisfies FallbackNoteEvent[];
  });
}

export function eightOhEightBassEvents(progression: readonly number[], root: number, intervals: readonly number[], lengthBars: GeneratorLengthBars, isHighEnergy: boolean) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  return progression.flatMap((offset, index) => {
    const start = index * barTicks;
    const nextOffset = progression[(index + 1) % progression.length] ?? offset;
    const rootNote = scaleNote(root, intervals, offset, -3);
    const nextRoot = scaleNote(root, intervals, nextOffset, -3);
    const events: FallbackNoteEvent[] = [
      { durationTicks: phraseEndsBar(index, lengthBars) ? 1080 : 1440, note: rootNote, tick: start, velocity: isHighEnergy ? 104 : 92 },
    ];
    if (isHighEnergy) {
      events.push({ durationTicks: 360, note: rootNote, tick: start + 960, velocity: 78 });
    }
    if (phraseEndsBar(index, lengthBars)) {
      events.push(
        { durationTicks: 120, note: scaleNote(root, intervals, offset + 4, -3), tick: start + 1320, velocity: 82 },
        { durationTicks: 120, note: rootNote + 12, tick: start + 1440, velocity: 86 },
        { durationTicks: 120, note: scaleNote(root, intervals, Math.max(0, nextOffset + 1), -3), tick: start + 1560, velocity: 80 },
        { durationTicks: 240, note: nextRoot, tick: start + 1680, velocity: 94 },
      );
    }
    return events;
  });
}

export function motifEvents(
  progression: readonly number[],
  root: number,
  intervals: readonly number[],
  plan: GeneratorMusicianPlan,
  leadStart: number,
  isSparse: boolean,
  isHighEnergy: boolean,
  offbeat: number,
  loopEndTick: number,
) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const cell = plan.groove.syncopation === "low"
    ? [0, 2, 1, 4]
    : plan.groove.syncopation === "high"
      ? [0, 3, 1, 5, 2]
      : [0, 2, 1, 4, 3];
  const rhythm = plan.groove.syncopation === "low"
    ? [480, 960, 1440]
    : plan.groove.syncopation === "high"
      ? [240, 600, 960, 1320, 1680]
      : [480 + offbeat, 720 + offbeat, 1200, 1560];
  return progression.flatMap((offset, index) => {
    const phraseMutation = phraseStrength(index, progression.length);
    const invert = phraseMutation > 0 && plan.melody.motifStrategy.includes("inversion");
    const start = index * barTicks;
    return rhythm.map((tickOffset, noteIndex) => {
      const sourceDegree = cell[noteIndex % cell.length] ?? 0;
      const mutatedDegree = invert ? Math.max(0, 5 - sourceDegree) : sourceDegree + (phraseMutation === 3 && noteIndex === rhythm.length - 1 ? 2 : 0);
      const tick = start + tickOffset;
      return {
        durationTicks: Math.min(isSparse ? 360 : isHighEnergy ? 180 : 240, Math.max(1, loopEndTick - tick)),
        note: scaleNote(root, intervals, offset + leadStart + mutatedDegree + index % 2, 1),
        tick,
        velocity: clampInteger(82 + phraseMutation * 4 - noteIndex * 2, 1, 127),
      } satisfies FallbackNoteEvent;
    });
  });
}

export function riffLayerEvents(
  progression: readonly number[],
  root: number,
  intervals: readonly number[],
  voicings: readonly (readonly number[])[],
  layerIndex: number,
  plan: GeneratorMusicianPlan,
) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const offsets = layerIndex === 0 ? [0, 360, 720, 1080, 1440] : [240, 600, 960, 1320, 1680];
  return progression.flatMap((offset, index) => {
    const voicing = voicings[index] ?? [];
    const start = index * barTicks;
    return offsets.map((tickOffset, noteIndex) => {
      const sourceNote = voicing[(noteIndex + layerIndex) % Math.max(1, voicing.length)];
      const fallbackDegree = offset + chordDegreeOffsets(plan, index)[noteIndex % chordDegreeOffsets(plan, index).length]!;
      return {
        durationTicks: layerIndex === 0 ? 150 : 120,
        note: sourceNote !== undefined ? fitNoteToRange(sourceNote + 12 + layerIndex * 7, 60, 96) : scaleNote(root, intervals, fallbackDegree, 1),
        tick: start + tickOffset,
        velocity: clampInteger(72 + phraseStrength(index, progression.length) * 5 - layerIndex * 4, 1, 127),
      } satisfies FallbackNoteEvent;
    });
  });
}

export function counterMelodyEvents(
  progression: readonly number[],
  root: number,
  intervals: readonly number[],
  plan: GeneratorMusicianPlan,
  leadStart: number,
) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const rhythm = plan.groove.syncopation === "low" ? [0, 960] : [240, 960, 1680];
  return progression.flatMap((offset, index) => {
    const start = index * barTicks;
    return rhythm.map((tickOffset, noteIndex) => {
      const contraryDegree = Math.max(0, offset + 9 - leadStart - ((index + noteIndex) % 5));
      return {
        durationTicks: tickOffset === 1680 ? 240 : 600,
        note: scaleNote(root, intervals, contraryDegree, 1),
        tick: start + tickOffset,
        velocity: clampInteger(66 + phraseStrength(index, progression.length) * 5 - noteIndex * 3, 1, 127),
      } satisfies FallbackNoteEvent;
    });
  });
}

export function guideToneLayerEvents(progression: readonly number[], voicings: readonly (readonly number[])[], maxClusterSize: number) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  return progression.flatMap((_, index) => {
    const start = index * barTicks;
    const voicing = voicings[index] ?? [];
    return chord(start + 60, voicing.slice(0, Math.min(maxClusterSize, 4, voicing.length)), 54, barTicks - 120);
  });
}



export function pickInstrument(items: readonly FallbackInstrument[], seed: string, index: number) {
  return pickSeeded(items, seed, index) ?? items[0] ?? { name: "Track", program: 0 };
}

export function paletteTagScore(palette: FallbackInstrumentPalette, intentPlan: GeneratorIntentPlan) {
  const tags = new Set(palette.tags.map(normalizedTag));
  const weightedScore = intentPlan.tags.weighted.reduce((score, tag) => score + (tags.has(normalizedTag(tag.tag)) ? tag.weight : 0), 0);
  const supportingScore = [
    { tags: intentPlan.tags.theme, weight: 2 },
    { tags: intentPlan.tags.groove, weight: 2 },
    { tags: intentPlan.tags.selector, weight: 0.5 },
  ].reduce((score, source) =>
    score + source.tags.reduce((sourceScore, tag) => sourceScore + (tags.has(tag) ? source.weight : 0), 0), 0);
  return weightedScore + supportingScore;
}

export function fallbackPaletteForIntentPlan(intentPlan: GeneratorIntentPlan) {
  const defaultPalette = fallbackInstrumentPalettes[fallbackInstrumentPalettes.length - 1];
  const scored = fallbackInstrumentPalettes
    .map((palette) => ({ palette, score: paletteTagScore(palette, intentPlan) }))
    .reduce((best, candidate) => candidate.score > best.score ? candidate : best, { palette: defaultPalette, score: 0 });
  return scored.score > 0 ? scored.palette : defaultPalette;
}

export function fallbackBpm(input: GeneratorPromptInput, intentPlan = buildGeneratorIntentPlan(input)) {
  const tags = intentPlanTagSet(intentPlan);
  if (tagSetHas(tags, ["double-time-breaks", "breakbeat", "jungle", "dnb", "drum-and-bass", "liquid-drum-bass"])) return 172;
  if (tagSetHas(tags, ["drill", "trap", "808-slide-pocket", "808-lead", "half-time", "brooklyn-drill", "uk-drill"])) return 140;
  if (tagSetHas(tags, ["boom-bap", "lofi", "lo-fi", "chillhop", "laid-back-pocket", "sample-based", "chill"])) return 88;
  if (tagSetHas(tags, ["cinematic", "orchestral", "trailer", "slow-arc", "wide-space"])) return 72;
  if (tagSetHas(tags, ["house", "techno", "club", "warehouse", "four-on-floor", "offbeat-pump", "deep-house", "tech-house", "minimal-tech"])) return 124;
  if (tagSetHas(tags, ["dubstep", "brostep", "riddim", "trapstep", "future-bass", "jersey-club", "grime"])) return 140;
  if (tagSetHas(tags, ["baile-funk", "baile", "tamborzao", "tamborzão", "funk-carioca", "rio-baile-2005"])) return 130;
  if (tagSetHas(tags, ["reggaeton", "dancehall", "dembow", "moombahton"])) return 96;
  if (tagSetHas(tags, ["amapiano", "log-drum", "durban-2020", "amapiano-2021"])) return 112;
  if (tagSetHas(tags, ["bossa", "bossa-nova", "salsa", "samba", "cumbia", "clave-pattern"])) return 98;
  if (tagSetHas(tags, ["afrobeat", "afro-house", "afro-tech", "lagos-2022"])) return 112;
  if (tagSetHas(tags, ["blues", "gospel", "soul", "soulful", "rnb", "neo-soul", "jazz", "jazzy-chords", "funk", "quiet-storm", "warm-chords"])) return 96;
  if (tagSetHas(tags, ["aggressive", "euphoric", "future", "bright", "uplifting", "radiant"])) return 128;
  const palette = fallbackPaletteForIntentPlan(intentPlan);
  if (palette.label !== "neutral-balanced") {
    return palette.bpm;
  }
  return 92 + (hashString(JSON.stringify(input)) % 57);
}

export function fallbackInstrumentPlan(intentPlan: GeneratorIntentPlan, seed: string, density: number, creativity: number, isSparse: boolean) {
  const palette = fallbackPaletteForIntentPlan(intentPlan);
  const tags = intentPlanTagSet(intentPlan);
  const explicitHarp = tagSetHas(tags, ["harp"]);
  const no808 = tagSetHas(tags, ["no-808"]);
  const includeTexture = !isSparse && (
    density > 0.58
    || creativity > 0.72
    || tagSetHas(tags, ["ambient", "cinematic", "synth", "synthetic", "house", "techno", "glitch", "idm", "industrial", "wide-space", "neon"])
  );
  const non808Bass = { name: "Electric Bass", program: 33 };
  const pulseBass = no808 ? non808Bass : pickInstrument(palette.bass, seed, 11);
  const passingBass = no808 ? non808Bass : pickInstrument(palette.bass, seed, 16);
  return {
    bass808: no808 ? non808Bass : { name: "808 Sub Bass", program: 38 },
    bassPassing: { name: `${passingBass.name} Passing Movement`, program: passingBass.program },
    bassPulse: { name: `${pulseBass.name} Offbeat Pulse`, program: pulseBass.program },
    chord: explicitHarp ? { name: "Harp Arpeggio", program: 46 } : pickInstrument(palette.chord, seed, 12),
    drums: pickInstrument(palette.drums, seed, 13),
    lead: explicitHarp ? { name: "Harp Lead", program: 46 } : pickInstrument(palette.lead, seed, 14),
    texture: includeTexture ? pickInstrument(palette.texture, seed, 15) : undefined,
  };
}

export function buildFallbackTracker(input: GeneratorPromptInput) {
  const { selectedMode, selectedScale } = selectedScaleInfo(input);
  const plan = buildMusicianPlan(input, selectedMode);
  const lengthBars = selectedLengthBars(input);
  const intentPlan = buildGeneratorIntentPlan(input, selectedMode, selectedScale, lengthBars, plan);
  const bpm = fallbackBpm(input, intentPlan);
  const seed = promptSeed(input);
  const joined = intentPlanTagList(intentPlan).join(" ");
  const creativity = clamp01Or(input.creativity, 0.65);
  const density = clamp01Or(input.density, 0.55);
  const humanize = clamp01Or(input.humanize, 0.35);
  const temperature = clamp01Or(input.temperature, 0.7);
  const tags = intentPlanTagSet(intentPlan);
  const isHighEnergy = tagSetHas(tags, ["aggressive", "euphoric", "liquid", "trap", "future", "urgent", "bold", "bright"]) || plan.style.bassRole === "808-lead" || temperature > 0.78;
  const isSparse = plan.style.densityBudget === "space" || tagSetHas(tags, ["minimal", "sparse", "draft", "ambient", "serene", "chill", "wide-space"]) || density < 0.44;
  const isSyncopated = tagSetHas(tags, ["syncopated", "jungle", "garage", "drum-and-bass", "funk", "swing", "live-pocket", "human"]) || humanize > 0.58;
  const instruments = fallbackInstrumentPlan(intentPlan, seed, density, creativity, isSparse);
  const root = scaleRoot(input.scaleKey || selectedMode, seed);
  const intervals = scaleIntervals(selectedMode);
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const loopTicks = barTicks * lengthBars;
  const chordHits = chordRhythmHits(joined, isSparse, isSyncopated, density, creativity);
  const strumSpread = Math.max(8, Math.round(10 + humanize * 28 + creativity * 8));
  const effectiveBassDensity = plan.style.densityBudget === "space" ? Math.min(density, 0.42) : density;
  const progressions = [
    [0, 4, 5, 3],
    [0, 5, 3, 4],
    [0, 2, 5, 4],
    [0, 3, 4, 1],
    [5, 3, 0, 4],
    [0, 6, 3, 4],
  ] as const;
  const baseProgression = pickSeeded(progressions, seed, 1) ?? progressions[0];
  const progression = buildGenreProgression(baseProgression, lengthBars, plan, creativity);
  const leadStart = pickSeeded([0, 1, 2, 4, 5], seed, 2) ?? 0;
  const humanOffset = Math.round((humanize - 0.35) * 120);
  const offbeat = (isSyncopated ? 240 : 0) + humanOffset;
  const voicings = voiceLedChordVoicings(progression, root, intervals, plan);
  const harmonyEvents = progression.flatMap((offset, index) => {
    const start = index * barTicks;
    const voicing = voicings[index] ?? chordDegreeOffsets(plan, index).map((degreeOffset) => scaleNote(root, intervals, offset + degreeOffset));
    return chordHits.flatMap((hit, hitIndex) => {
      const passingVoicing = plan.harmony.changesPerFourBars > 4 && hitIndex > 0
        ? chooseVoiceLedVoicing(root, intervals, offset + hit.degreeShift, plan, voicing, index + hitIndex)
        : voicing;
      const sourceNotes = colorVoicing(passingVoicing, hit.degreeShift + hitIndex, plan.harmony.voicingRange);
      const direction = (index + hitIndex) % 2 === 0 ? "down" : "up";
      return strummedChord(
        start + hit.offsetTicks,
        sourceNotes,
        hit.velocity,
        hit.durationTicks,
        strumSpread,
        direction,
      );
    });
  });
  const houseBassEvents = houseStrobeBassEvents(progression, root, intervals, lengthBars, effectiveBassDensity, isHighEnergy);
  const livePassingBassEvents = liveBassEvents(progression, root, intervals, lengthBars, isSparse);
  const subBassEvents = eightOhEightBassEvents(progression, root, intervals, lengthBars, isHighEnergy);
  const leadEvents = motifEvents(progression, root, intervals, plan, leadStart, isSparse, isHighEnergy, offbeat, loopTicks);
  const counterEvents = plan.melody.counterline ? counterMelodyEvents(progression, root, intervals, plan, leadStart) : [];
  const riffEvents = Array.from({ length: plan.melody.riffLayers }, (_, index) => riffLayerEvents(progression, root, intervals, voicings, index, plan));
  const guideEvents = plan.harmony.chordLanguage === "triads" && (density < 0.7 || plan.style.densityBudget === "space") ? [] : guideToneLayerEvents(progression, voicings, plan.quality.maxChordClusterSize);
  const textureEvents = progression.flatMap((_, index) => {
    const start = index * barTicks;
    const voicing = voicings[index] ?? [];
    const color = voicing.map((note) => fitNoteToRange(note + 12, 64, 96));
    return chord(start + 240, color, 58, barTicks - 360);
  });
  const drumEvents = progression.flatMap((_, index) => {
    const start = index * barTicks;
    return drumGrooveEvents(joined, start, index, lengthBars, density, isHighEnergy);
  });
  const requiredLayers = new Set(plan.layers.required);
  const tracks = [
    { channel: 0, events: harmonyEvents, instrument: instruments.chord },
  ];
  if (requiredLayers.has("house-strobe bass")) {
    tracks.push({ channel: 1, events: houseBassEvents, instrument: instruments.bassPulse });
  }
  if (requiredLayers.has("live-passing bass")) {
    tracks.push({ channel: 2, events: livePassingBassEvents, instrument: instruments.bassPassing });
  }
  if (requiredLayers.has("808/sub bass")) {
    tracks.push({ channel: 3, events: subBassEvents, instrument: instruments.bass808 });
  }
  if (guideEvents.length > 0) {
    tracks.push({
      channel: 4,
      events: guideEvents,
      instrument: { name: "Guide Tone Harmonic Layer", program: instruments.texture?.program ?? instruments.chord.program },
    });
  }
  if (instruments.texture) {
    tracks.push({ channel: 5, events: textureEvents, instrument: instruments.texture });
  }
  for (const [index, events] of riffEvents.entries()) {
    tracks.push({
      channel: 6 + index,
      events,
      instrument: { name: `${instruments.lead.name} Riff Layer ${index + 1}`, program: instruments.lead.program },
    });
  }
  tracks.push(
    { channel: 8, events: leadEvents, instrument: { name: `${instruments.lead.name} Lead Motif`, program: instruments.lead.program } },
    ...(counterEvents.length > 0
      ? [{ channel: 10, events: counterEvents, instrument: { name: `${instruments.lead.name} Countermelody`, program: instruments.lead.program } }]
      : []),
  );
  if (requiredLayers.has("drum groove")) {
    tracks.push({ channel: GENERATOR_MIDI_DRUM_CHANNEL, events: drumEvents, instrument: instruments.drums });
  }
  return [
    `!BPM:${bpm}!`,
    schemaMetadataLine(),
    arrangementPlanMetadataLine(plan),
    intentTagMetadataLine({ grooveTags: intentPlan.tags.groove, themeTags: intentPlan.tags.theme }),
    ...tracks.flatMap((track) => [
      `#TRK:${track.instrument.name},CH:${track.channel},PG:${track.instrument.program}`,
      noteBlocks(boundedEvents(capFallbackSupportEvents(track.instrument.name, track.events), loopTicks)),
    ]),
  ].join("\n");
}
