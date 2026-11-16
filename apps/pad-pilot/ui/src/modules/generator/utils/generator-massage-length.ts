import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-option-catalog";
import { type AbsoluteGeneratorNote, type GeneratorMusicianPlan } from "./generator-contracts";
import { TRACK_LENGTH_TOLERANCE_TICKS } from "./generator-prompt";
import { hashString } from "./generator-selection";
import { absoluteTrackNotes, clampInteger, deltaTrackNotes, isDrumFillTrack, isSupportingTrack, loopTicks, missingPhraseFillWindows, trackLengthDiagnostics } from "./generator-tracker";

export function variedRepeatVelocity(note: AbsoluteGeneratorNote, trackIndex: number, repeatIndex: number, noteIndex: number, seed: string) {
  const swing = (hashString(`${seed}:${trackIndex}:${repeatIndex}:${noteIndex}:velocity`) % 9) - 4;
  return clampInteger(note.velocity + swing, 1, 127);
}

export function variedRepeatDuration(note: AbsoluteGeneratorNote, repeatIndex: number, noteIndex: number, maxDurationTicks: number) {
  const phraseNudge = repeatIndex > 1 && noteIndex % 4 === 0 ? 60 : 0;
  return clampInteger(note.durationTicks + phraseNudge, 1, maxDurationTicks);
}

export function shouldPreserveShortTrack(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan) {
  return plan.quality.maxShortTracks > 0 && isSupportingTrack(track);
}

export function repairTrackLength(track: GeneratorMidiTrack, lengthBars: GeneratorLengthBars, seed: string, trackIndex: number, plan: GeneratorMusicianPlan) {
  if (shouldPreserveShortTrack(track, plan)) {
    return track;
  }
  const endTick = loopTicks(lengthBars);
  const barTicks = GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER;
  const sourceNotes = absoluteTrackNotes(track).filter((note) => note.tick < endTick);
  const sourceEndTick = sourceNotes.reduce((latest, note) => Math.max(latest, note.tick + note.durationTicks), 0);
  if (sourceEndTick >= endTick - TRACK_LENGTH_TOLERANCE_TICKS || sourceNotes.length === 0) {
    return track;
  }

  const sourceBars = Math.max(1, Math.min(lengthBars, Math.ceil(sourceEndTick / barTicks)));
  const sourcePeriodTicks = sourceBars * barTicks;
  const repairedNotes = [...sourceNotes];
  let repeatIndex = 1;
  for (let offset = sourcePeriodTicks; offset < endTick; offset += sourcePeriodTicks) {
    sourceNotes.forEach((note, noteIndex) => {
      const tick = note.tick + offset;
      if (tick >= endTick) {
        return;
      }
      const maxDurationTicks = Math.max(1, endTick - tick);
      repairedNotes.push({
        ...note,
        durationTicks: variedRepeatDuration(note, repeatIndex, noteIndex, maxDurationTicks),
        tick,
        velocity: variedRepeatVelocity(note, trackIndex, repeatIndex, noteIndex, seed),
      });
    });
    repeatIndex += 1;
  }

  const repairedEndTick = repairedNotes.reduce((latest, note) => Math.max(latest, note.tick + note.durationTicks), 0);
  if (repairedEndTick < endTick - TRACK_LENGTH_TOLERANCE_TICKS) {
    const anchor = sourceNotes[sourceNotes.length - 1];
    if (anchor) {
      const durationTicks = Math.min(Math.max(120, anchor.durationTicks), TRACK_LENGTH_TOLERANCE_TICKS);
      repairedNotes.push({
        ...anchor,
        durationTicks,
        tick: Math.max(0, endTick - durationTicks),
        velocity: variedRepeatVelocity(anchor, trackIndex, repeatIndex, sourceNotes.length, seed),
      });
    }
  }

  return {
    ...track,
    notes: deltaTrackNotes(repairedNotes),
  };
}

export function repairCompositionLength(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars, seed: string, plan: GeneratorMusicianPlan) {
  const before = trackLengthDiagnostics(composition, lengthBars);
  if (!before.some((diagnostic) => diagnostic.short)) {
    return { composition, diagnostics: before, repairedCount: 0 };
  }
  const repairedComposition: GeneratorMidiComposition = {
    ...composition,
    tracks: composition.tracks.map((track, index) => repairTrackLength(track, lengthBars, seed, index, plan)),
  };
  const after = trackLengthDiagnostics(repairedComposition, lengthBars);
  return {
    composition: repairedComposition,
    diagnostics: after,
    repairedCount: before.filter((diagnostic, index) => diagnostic.short && !after[index]?.short).length,
  };
}

export function phraseFillRepairEvents(windows: readonly { end: number; start: number }[]) {
  return windows.flatMap((window) => [
    { deltaTicks: 0 as const, durationTicks: 120 as const, note: 38 as const, tick: window.start, velocity: 112 as const },
    { deltaTicks: 0 as const, durationTicks: 120 as const, note: 45 as const, tick: window.start + 120, velocity: 106 as const },
    { deltaTicks: 0 as const, durationTicks: 120 as const, note: 47 as const, tick: window.start + 240, velocity: 102 as const },
    { deltaTicks: 0 as const, durationTicks: 120 as const, note: 49 as const, tick: Math.min(window.start + 360, window.end - 120), velocity: 110 as const },
  ]);
}

export function repairPhraseFill(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars) {
  const missingWindows = missingPhraseFillWindows(composition, lengthBars);
  if (missingWindows.length === 0) {
    return { composition, repaired: false };
  }
  const fillEvents = phraseFillRepairEvents(missingWindows);
  const drumIndex = composition.tracks.findIndex(isDrumFillTrack);
  if (drumIndex < 0) {
    return {
      composition: {
        ...composition,
        tracks: [
          ...composition.tracks,
          {
            channel: GENERATOR_MIDI_DRUM_CHANNEL,
            drums: true as const,
            name: "Repaired Drum Fill" as const,
            notes: deltaTrackNotes(fillEvents),
            program: 0 as const,
          },
        ],
      },
      repaired: true,
    };
  }
  return {
    composition: {
      ...composition,
      tracks: composition.tracks.map((track, index) => index === drumIndex
        ? {
            ...track,
            channel: GENERATOR_MIDI_DRUM_CHANNEL,
            drums: true as const,
            notes: deltaTrackNotes([...absoluteTrackNotes(track), ...fillEvents]),
          }
        : track),
    },
    repaired: true,
  };
}

export function repairCompositionForPlan(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, seed: string) {
  const lengthRepair = repairCompositionLength(composition, lengthBars, seed, plan);
  const fillRepair = plan.quality.phraseFillRequired && lengthRepair.composition.tracks.some(isDrumFillTrack)
    ? repairPhraseFill(lengthRepair.composition, lengthBars)
    : { composition: lengthRepair.composition, repaired: false };
  return {
    composition: fillRepair.composition,
    diagnostics: trackLengthDiagnostics(fillRepair.composition, lengthBars),
    phraseFillRepaired: fillRepair.repaired,
    repairedCount: lengthRepair.repairedCount,
  };
}
