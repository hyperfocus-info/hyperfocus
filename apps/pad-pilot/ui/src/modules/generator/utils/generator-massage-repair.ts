import { GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { type GeneratorLengthBars } from "./generator-options";
import { type AbsoluteGeneratorNote, type GeneratorMusicianPlan, type StyleDnaFilterStats } from "./generator-contracts";
import { primaryBassLayer } from "./generator-prompt";
import { absoluteTrackNotes, clampInteger, deltaTrackNotes, isSupportingTrack, loopTicks, trackMetadata, trackRole } from "./generator-tracker";
import { roundToStep, grooveGridStepTicks, syncopationCeiling, TrackMassageDecision, StyleMassageBudget, decisionForTrack, selectedMassageIssues, repairPressure, consumeRegeneration } from "./generator-massage-scoring";

export function dedupeAbsoluteNotes(notes: readonly AbsoluteGeneratorNote[]) {
  const merged = new Map<string, AbsoluteGeneratorNote>();
  for (const note of notes) {
    const key = `${note.tick}:${note.note}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, note);
      continue;
    }
    merged.set(key, {
      ...existing,
      durationTicks: Math.max(existing.durationTicks, note.durationTicks),
      velocity: Math.max(existing.velocity, note.velocity),
    });
  }
  return [...merged.values()].sort((left, right) => left.tick - right.tick || left.note - right.note);
}

export function groupNotesByAttack(notes: readonly AbsoluteGeneratorNote[], toleranceTicks = 72) {
  const groups: AbsoluteGeneratorNote[][] = [];
  for (const note of [...notes].sort((left, right) => left.tick - right.tick || left.note - right.note)) {
    const group = groups[groups.length - 1];
    const groupStart = group?.[0]?.tick;
    if (group && groupStart !== undefined && note.tick - groupStart <= toleranceTicks) {
      group.push(note);
      continue;
    }
    groups.push([note]);
  }
  return groups;
}

export function clampTrackSyncopation(notes: readonly AbsoluteGeneratorNote[], plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats) {
  if (plan.groove.syncopation === "high") {
    return [...notes];
  }
  const endTick = loopTicks(lengthBars);
  const groups = groupNotesByAttack(notes);
  const offbeatGroups = groups.filter((group) => (group[0]?.tick ?? 0) % GENERATOR_MIDI_TICKS_PER_QUARTER !== 0);
  if (offbeatGroups.length === 0) {
    return [...notes];
  }
  const minimumOffbeats = Math.ceil(groups.length * plan.quality.minOffbeatRatio);
  const maximumOffbeats = Math.max(minimumOffbeats, Math.floor(groups.length * syncopationCeiling(plan)));
  let offbeatIndex = 0;
  const adjusted: AbsoluteGeneratorNote[] = [];
  for (const group of groups) {
    const groupStart = group[0]?.tick ?? 0;
    if (groupStart % GENERATOR_MIDI_TICKS_PER_QUARTER === 0) {
      adjusted.push(...group);
      continue;
    }
    if (offbeatIndex < maximumOffbeats) {
      adjusted.push(...group);
      offbeatIndex += 1;
      continue;
    }
    const snappedTick = clampInteger(
      roundToStep(groupStart, GENERATOR_MIDI_TICKS_PER_QUARTER),
      0,
      Math.max(0, endTick - GENERATOR_MIDI_TICKS_PER_QUARTER),
    );
    const shift = snappedTick - groupStart;
    stats.syncopationClampedNotes += group.length;
    adjusted.push(...group.map((note) => {
      const tick = clampInteger(note.tick + shift, 0, Math.max(0, endTick - 1));
      return {
        ...note,
        durationTicks: Math.min(note.durationTicks, Math.max(1, endTick - tick)),
        tick,
      };
    }));
    offbeatIndex += 1;
  }
  return adjusted;
}

export function boundTrackToLoop(track: GeneratorMidiTrack, lengthBars: GeneratorLengthBars) {
  const endTick = loopTicks(lengthBars);
  const notes = absoluteTrackNotes(track)
    .filter((note) => note.tick < endTick)
    .map((note) => ({
      ...note,
      durationTicks: Math.min(note.durationTicks, Math.max(1, endTick - note.tick)),
    }));
  return {
    ...track,
    channel: track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL ? GENERATOR_MIDI_DRUM_CHANNEL : track.channel,
    drums: track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL || /drum|rhythm|perc|kit|groove/i.test(track.name),
    notes: deltaTrackNotes(dedupeAbsoluteNotes(notes)),
  } satisfies GeneratorMidiTrack;
}

export function gridDistance(tick: number, step: number) {
  const offset = tick % step;
  return Math.min(offset, step - offset);
}

export function sanitizeTrackToStyleGrid(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars, stats: StyleDnaFilterStats, decision: TrackMassageDecision | undefined) {
  const endTick = loopTicks(lengthBars);
  const isDrumTrack = track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL;
  const gridStep = isDrumTrack ? Math.min(grooveGridStepTicks(plan), 120) : grooveGridStepTicks(plan);
  const pressure = repairPressure(decision, ["groove"]);
  if (pressure < 0.3) {
    return boundTrackToLoop(track, lengthBars);
  }
  const durationStep = Math.min(gridStep, GENERATOR_MIDI_TICKS_PER_QUARTER);
  const maxStartTick = Math.max(0, endTick - gridStep);
  const loosePocket = /laid-back/i.test(plan.groove.microtiming);
  const tolerance = loosePocket && !isDrumTrack
    ? Math.min(96, Math.max(48, gridStep / 2))
    : Math.min(18, Math.max(8, gridStep / 8));
  const fullGridRewrite = pressure >= 0.58;
  const quantized = absoluteTrackNotes(track)
    .map((note) => {
      const shouldMoveStart = fullGridRewrite || gridDistance(note.tick, gridStep) > tolerance;
      const tick = shouldMoveStart ? clampInteger(roundToStep(note.tick, gridStep), 0, maxStartTick) : clampInteger(note.tick, 0, maxStartTick);
      const maxDuration = Math.max(1, endTick - tick);
      const minDuration = Math.min(60, maxDuration);
      const durationTicks = fullGridRewrite
        ? clampInteger(roundToStep(note.durationTicks, durationStep), minDuration, maxDuration)
        : clampInteger(note.durationTicks, minDuration, maxDuration);
      if (tick !== note.tick || durationTicks !== note.durationTicks) {
        stats.quantizedNotes += 1;
      }
      return {
        ...note,
        durationTicks,
        tick,
      } satisfies AbsoluteGeneratorNote;
    })
    .filter((note) => note.tick < endTick && note.durationTicks > 0);
  const deduped = dedupeAbsoluteNotes(quantized);
  const clamped = isDrumTrack || pressure < 0.64 ? deduped : clampTrackSyncopation(deduped, plan, lengthBars, stats);
  return {
    ...track,
    channel: isDrumTrack ? GENERATOR_MIDI_DRUM_CHANNEL : track.channel,
    drums: isDrumTrack || /drum|rhythm|perc|kit|groove/i.test(track.name),
    notes: deltaTrackNotes(dedupeAbsoluteNotes(clamped)),
  } satisfies GeneratorMidiTrack;
}

export function selectChordCeilingNotes(cluster: readonly AbsoluteGeneratorNote[], limit: number) {
  const uniqueNotes = [...cluster]
    .sort((left, right) => left.note - right.note || left.tick - right.tick)
    .filter((note, index, notes) => notes.findIndex((candidate) => candidate.note === note.note) === index);
  const root = uniqueNotes[0];
  if (!root) {
    return [];
  }
  const preferredIntervals = new Set(limit <= 3 ? [0, 3, 4, 5, 7] : [0, 2, 3, 4, 5, 7, 10, 11]);
  const selected = [root];
  for (const note of uniqueNotes.slice(1)) {
    if (selected.length >= limit) {
      break;
    }
    const interval = (note.note - root.note + 120) % 12;
    if (preferredIntervals.has(interval)) {
      selected.push(note);
    }
  }
  for (const note of uniqueNotes) {
    if (selected.length >= limit) {
      break;
    }
    if (!selected.includes(note)) {
      selected.push(note);
    }
  }
  return selected.sort((left, right) => left.tick - right.tick || left.note - right.note);
}

export function simplifyTrackHarmonicCeiling(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, stats: StyleDnaFilterStats, decision: TrackMassageDecision | undefined) {
  const pressure = repairPressure(decision, ["chord format", "harmonic ceiling"]);
  if (pressure < 0.3 || track.drums || (plan.style.harmonicDensity !== "sparse" && plan.style.harmonicDensity !== "simple")) {
    return track;
  }
  const limit = plan.style.harmonicDensity === "sparse" ? 3 : 4;
  const groups = groupNotesByAttack(absoluteTrackNotes(track));
  const notes: AbsoluteGeneratorNote[] = [];
  for (const group of groups) {
    if (group.length <= limit) {
      notes.push(...group);
      continue;
    }
    const selected = selectChordCeilingNotes(group, limit);
    stats.simplifiedChordClusters += 1;
    stats.strippedChordNotes += Math.max(0, group.length - selected.length);
    notes.push(...selected);
  }
  return {
    ...track,
    notes: deltaTrackNotes(notes),
  } satisfies GeneratorMidiTrack;
}

export function hasTrackRole(tracks: readonly GeneratorMidiTrack[], matcher: RegExp) {
  return tracks.some((track) => {
    const metadata = trackMetadata(track);
    return matcher.test(`${track.name} ${metadata?.role ?? ""} ${metadata?.function ?? ""} ${metadata?.bassRole ?? ""}`);
  });
}

export function bassPatchRolesForPlan(plan: GeneratorMusicianPlan) {
  const patchRoles = [
    { label: "house-strobe bass", matcher: /house|strobe|offbeat|pump/i },
    { label: "live-passing bass", matcher: /live|passing|finger|upright|fretless|electric bass/i },
    { label: "808/sub bass", matcher: /808|sub/i },
  ] as const;
  const required = new Set(plan.layers.required);
  const matched = patchRoles.filter((role) => required.has(role.label));
  return matched.length > 0 ? matched : patchRoles.filter((role) => role.label === primaryBassLayer(plan.style));
}

export function patchMissingBassRoles(composition: GeneratorMidiComposition, fallback: GeneratorMidiComposition, plan: GeneratorMusicianPlan, stats: StyleDnaFilterStats) {
  const tracks = [...composition.tracks];
  for (const role of bassPatchRolesForPlan(plan)) {
    if (hasTrackRole(tracks, role.matcher)) {
      continue;
    }
    const patchTrack = fallback.tracks.find((track) => role.matcher.test(track.name));
    if (!patchTrack) {
      continue;
    }
    tracks.push(patchTrack);
    stats.patchedTrackRoles.push(role.label);
  }
  return {
    ...composition,
    tracks,
  } satisfies GeneratorMidiComposition;
}

export function fallbackReplacementForDecision(fallback: GeneratorMidiComposition, decision: TrackMassageDecision) {
  return fallback.tracks.find((track) => trackRole(track) === decision.role && absoluteTrackNotes(track).length > 0)
    ?? fallback.tracks.find((track) => {
      if (decision.role === "drums") return track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL;
      if (decision.role === "melody") return /lead|hook|motif|topline|riff/i.test(track.name);
      if (decision.role === "chords") return /chord|harmony|keys|piano|organ|guitar|stab|string/i.test(track.name);
      if (decision.role === "bass") return /808|sub|bass|reese/i.test(track.name);
      if (decision.role === "support" || decision.role === "texture") return isSupportingTrack(track);
      return false;
    });
}

export function regenerateSeverelyWrongTracks(composition: GeneratorMidiComposition, fallback: GeneratorMidiComposition, decisions: readonly TrackMassageDecision[], stats: StyleDnaFilterStats, budget: StyleMassageBudget) {
  return {
    ...composition,
    tracks: composition.tracks.map((track) => {
      const decision = decisionForTrack(decisions, track);
      const selectedWorst = decision ? selectedMassageIssues(decision)[0] : undefined;
      if (!decision || decision.massageFactor < 0.82 || decision.incorrectness < 0.6 || !selectedWorst || selectedWorst.score < 0.6) {
        return track;
      }
      const replacement = fallbackReplacementForDecision(fallback, decision);
      if (!replacement) {
        return track;
      }
      if (!consumeRegeneration(budget)) {
        return track;
      }
      stats.regeneratedTracks.push(`${track.name} (${selectedWorst.tag})`);
      return {
        ...replacement,
        channel: track.drums || replacement.drums ? GENERATOR_MIDI_DRUM_CHANNEL : track.channel,
        drums: track.drums || replacement.drums,
        name: track.name,
      } satisfies GeneratorMidiTrack;
    }),
  } satisfies GeneratorMidiComposition;
}
