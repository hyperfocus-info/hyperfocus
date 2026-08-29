import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-options";
import { type AbsoluteGeneratorNote, type GeneratorMusicianPlan, type StyleDnaFilterStats } from "./generator-contracts";
import { fitNoteToRange } from "./generator-music";
import { hashString } from "./generator-selection";
import { absoluteTrackNotes, clampInteger, deltaTrackNotes, isSupportingTrack, loopTicks, maxNoteClusterSize, motifScore } from "./generator-tracker";
import { TrackMassageDecision, StyleMassageBudget, decisionForTrack, repairPressure, roleRepairPressure, consumeAdditiveRepair } from "./generator-massage-scoring";
import { groupNotesByAttack, hasTrackRole } from "./generator-massage-repair";

export function unusedChannel(tracks: readonly GeneratorMidiTrack[], fallback: number) {
  const used = new Set(tracks.map((track) => track.channel));
  const candidates = [fallback, 11, 12, 13, 14, 15, 4, 5, 6, 7, 8, 10, 0, 1, 2, 3];
  return candidates.find((channel) => channel !== GENERATOR_MIDI_DRUM_CHANNEL && !used.has(channel)) ?? clampInteger(fallback, 0, 15);
}

export function chordCarrierTrack(composition: GeneratorMidiComposition) {
  return composition.tracks.find((track) => !track.drums && /chord|harmony|keys|piano|organ|guitar|stab|pad|string/i.test(track.name))
    ?? composition.tracks
      .filter((track) => !track.drums)
      .sort((left, right) => maxNoteClusterSize(right) - maxNoteClusterSize(left))[0];
}

export function patchUpperColorSingleVoice(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[], budget: StyleMassageBudget) {
  if (plan.style.harmonicDensity === "sparse" || hasTrackRole(composition.tracks, /upper color|single voice/i)) {
    return composition;
  }
  const carrier = chordCarrierTrack(composition);
  if (!carrier) {
    return composition;
  }
  const pressure = repairPressure(decisionForTrack(decisions, carrier), ["chord format", "harmonic ceiling"]);
  if (pressure < 0.78 || !consumeAdditiveRepair(budget, stats, "upper-color")) {
    return composition;
  }
  const endTick = loopTicks(lengthBars);
  const groups = groupNotesByAttack(absoluteTrackNotes(carrier))
    .filter((group) => group.length >= 3 && (group[0]?.tick ?? endTick) < endTick);
  if (groups.length === 0) {
    return composition;
  }
  const notes = groups.map((group, index) => {
    const root = group.reduce((lowest, note) => note.note < lowest.note ? note : lowest, group[0]!);
    const sourceDuration = group.reduce((duration, note) => Math.max(duration, note.durationTicks), 0);
    const tick = group[0]?.tick ?? 0;
    return {
      deltaTicks: 0,
      durationTicks: Math.min(Math.max(180, sourceDuration), Math.max(1, endTick - tick)),
      note: fitNoteToRange(root.note + 17 + (index % 2 === 0 ? 0 : 12), 72, 96),
      tick,
      velocity: clampInteger(Math.max(...group.map((note) => note.velocity)) - 18, 42, 76),
    } satisfies AbsoluteGeneratorNote;
  });
  stats.upperColorNotes += notes.length;
  return {
    ...composition,
    tracks: [
      ...composition.tracks,
      {
        channel: unusedChannel(composition.tracks, 11),
        name: "Upper Color Single Voice",
        notes: deltaTrackNotes(notes),
        program: carrier.program,
      },
    ],
  } satisfies GeneratorMidiComposition;
}

export function oneShotCandidateEvents(lengthBars: GeneratorLengthBars) {
  const barTicks = GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER;
  const endTick = loopTicks(lengthBars);
  const phraseStarts = Array.from({ length: Math.ceil(lengthBars / 4) }, (_, phraseIndex) => phraseIndex * 4 * barTicks)
    .filter((tick) => tick < endTick);
  const phraseEnds = Array.from({ length: Math.ceil(lengthBars / 4) }, (_, phraseIndex) => Math.min(endTick - 120, (phraseIndex + 1) * 4 * barTicks - 120))
    .filter((tick) => tick >= 0 && tick < endTick);
  return Array.from(new Set([...phraseStarts, ...phraseEnds])).map((tick, index) => {
    const isEnd = phraseEnds.includes(tick);
    return {
      deltaTicks: 0,
      durationTicks: 120,
      note: isEnd ? 49 : 57,
      tick,
      velocity: clampInteger(isEnd ? 102 + index * 2 : 86 + index * 2, 1, 127),
    } satisfies AbsoluteGeneratorNote;
  });
}

export function patchOneShotEmphasis(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[], budget: StyleMassageBudget) {
  if (decisions.some((decision) => decision.role === "drums") && roleRepairPressure(decisions, "drums", ["tag accents", "groove"]) < 0.75) {
    return composition;
  }
  if (!consumeAdditiveRepair(budget, stats, "one-shots")) {
    return composition;
  }
  const candidates = oneShotCandidateEvents(lengthBars);
  const drumIndex = composition.tracks.findIndex((track) => track.drums || /drum|rhythm|perc/i.test(track.name));
  if (drumIndex < 0) {
    stats.oneShotEvents += candidates.length;
    return {
      ...composition,
      tracks: [
        ...composition.tracks,
        {
          channel: GENERATOR_MIDI_DRUM_CHANNEL,
          drums: true,
          name: "One-Shot Emphasis",
          notes: deltaTrackNotes(candidates),
          program: 0,
        },
      ],
    } satisfies GeneratorMidiComposition;
  }
  const drumTrack = composition.tracks[drumIndex];
  const existing = absoluteTrackNotes(drumTrack!);
  const additions = candidates.filter((candidate) =>
    !existing.some((note) => Math.abs(note.tick - candidate.tick) <= 60 && note.note === candidate.note),
  );
  if (additions.length === 0) {
    return composition;
  }
  stats.oneShotEvents += additions.length;
  return {
    ...composition,
    tracks: composition.tracks.map((track, index) => index === drumIndex
      ? {
          ...track,
          channel: GENERATOR_MIDI_DRUM_CHANNEL,
          drums: true,
          notes: deltaTrackNotes([...existing, ...additions]),
        }
      : track),
  } satisfies GeneratorMidiComposition;
}

export function patchChordDependentTurnaroundFill(composition: GeneratorMidiComposition, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[], budget: StyleMassageBudget) {
  if (hasTrackRole(composition.tracks, /chord dependent|turnaround fill/i)) {
    return composition;
  }
  const carrier = chordCarrierTrack(composition);
  if (!carrier) {
    return composition;
  }
  const pressure = repairPressure(decisionForTrack(decisions, carrier), ["chord format", "harmonic ceiling", "bass phrase"]);
  if (pressure < 0.72 || !consumeAdditiveRepair(budget, stats, "chord-fill")) {
    return composition;
  }
  const endTick = loopTicks(lengthBars);
  const sourceGroup = groupNotesByAttack(absoluteTrackNotes(carrier))
    .filter((group) => group.length >= 2 && (group[0]?.tick ?? 0) < endTick)
    .at(-1);
  if (!sourceGroup) {
    return composition;
  }
  const startTick = Math.max(0, endTick - GENERATOR_MIDI_TICKS_PER_QUARTER);
  const sourceNotes = [...sourceGroup].sort((left, right) => left.note - right.note).slice(0, pressure >= 0.75 ? 4 : 3);
  const fillNotes = sourceNotes.map((note, index) => ({
    deltaTicks: 0,
    durationTicks: 120,
    note: fitNoteToRange(note.note + (index > 1 ? 12 : 0), 60, 96),
    tick: startTick + index * 120,
    velocity: clampInteger(64 + index * 3, 1, 127),
  } satisfies AbsoluteGeneratorNote));
  stats.chordDependentFillNotes += fillNotes.length;
  return {
    ...composition,
    tracks: [
      ...composition.tracks,
      {
        channel: unusedChannel(composition.tracks, 12),
        name: "Chord Dependent Turnaround Fill",
        notes: deltaTrackNotes(fillNotes),
        program: carrier.program,
      },
    ],
  } satisfies GeneratorMidiComposition;
}

export function patchEarwormLead(composition: GeneratorMidiComposition, fallback: GeneratorMidiComposition, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[], budget: StyleMassageBudget) {
  const hasLead = hasTrackRole(composition.tracks, /lead|hook|motif|topline|riff|call[-\s]?response/i);
  if (hasLead && motifScore(composition) >= 2) {
    return composition;
  }
  if (hasLead && roleRepairPressure(decisions, "melody", ["motif", "rhythmic symmetry", "groove"]) < 0.3) {
    return composition;
  }
  if (!consumeAdditiveRepair(budget, stats, "earworm")) {
    return composition;
  }
  const fallbackLead = fallback.tracks.find((track) => /lead motif|topline|hook|lead|riff/i.test(track.name));
  if (!fallbackLead) {
    return composition;
  }
  stats.earwormLeadPatched = true;
  return {
    ...composition,
    tracks: [
      ...composition.tracks,
      {
        ...fallbackLead,
        channel: unusedChannel(composition.tracks, fallbackLead.channel),
        name: hasLead ? "Repaired Earworm Lead Motif" : `Repaired Earworm ${fallbackLead.name}`,
      },
    ],
  } satisfies GeneratorMidiComposition;
}

export function supportingTrackVelocityCap(track: GeneratorMidiTrack) {
  if (/guide|upper color|single voice/i.test(track.name)) return 66;
  if (/texture|pad|shimmer|drone/i.test(track.name)) return 58;
  if (/counter|riff|fill|stab/i.test(track.name)) return 76;
  return 72;
}

export function balanceSupportingElements(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[]) {
  const maxGroupsPerBar = plan.style.densityBudget === "space" ? 4 : plan.style.densityBudget === "dense" ? 12 : 8;
  return {
    ...composition,
    tracks: composition.tracks.map((track) => {
      const pressure = repairPressure(decisionForTrack(decisions, track), ["support balance", "groove"]);
      if (!isSupportingTrack(track) || pressure < 0.3) {
        return track;
      }
      const groups = groupNotesByAttack(absoluteTrackNotes(track));
      const maxGroups = Math.max(1, maxGroupsPerBar * lengthBars);
      const stride = pressure >= 0.55 && groups.length > maxGroups ? Math.ceil(groups.length / maxGroups) : 1;
      const cap = supportingTrackVelocityCap(track);
      const keptGroups = groups.filter((_, index) => stride === 1 || index % stride === 0 || index === groups.length - 1);
      stats.supportThinnedNotes += groups.flat().length - keptGroups.flat().length;
      const notes = keptGroups.flatMap((group) => group.map((note) => {
        const velocity = Math.min(note.velocity, cap);
        if (velocity !== note.velocity) {
          stats.supportBalancedNotes += 1;
        }
        return { ...note, velocity };
      }));
      return {
        ...track,
        notes: deltaTrackNotes(notes),
      } satisfies GeneratorMidiTrack;
    }),
  } satisfies GeneratorMidiComposition;
}

export function applyCreativeEventModulation(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, seed: string, stats: StyleDnaFilterStats, decisions: readonly TrackMassageDecision[]) {
  if (!plan.performance.eventModulation) {
    return composition;
  }
  const endTick = loopTicks(lengthBars);
  return {
    ...composition,
    tracks: composition.tracks.map((track, trackIndex) => {
      const pressure = repairPressure(decisionForTrack(decisions, track), ["groove", "motif", "rhythmic symmetry", "chord format", "support balance", "bass phrase"]);
      if (track.drums || /upper color|single voice|one-shot|turnaround fill/i.test(track.name) || pressure < 0.45) {
        return track;
      }
      const notes = absoluteTrackNotes(track).map((note, noteIndex) => {
        const hash = hashString(`${seed}:${trackIndex}:${noteIndex}:mod`);
        const velocityShift = (hash % 13) - 6;
        const durationShift = ((hash >> 4) % 5) * 12 - 24;
        const velocity = clampInteger(note.velocity + velocityShift, 1, 127);
        const durationTicks = clampInteger(note.durationTicks + durationShift, 60, Math.max(60, endTick - note.tick));
        if (velocity !== note.velocity || durationTicks !== note.durationTicks) {
          stats.eventModulatedNotes += 1;
        }
        return {
          ...note,
          durationTicks,
          velocity,
        } satisfies AbsoluteGeneratorNote;
      });
      return {
        ...track,
        notes: deltaTrackNotes(notes),
      } satisfies GeneratorMidiTrack;
    }),
  } satisfies GeneratorMidiComposition;
}
