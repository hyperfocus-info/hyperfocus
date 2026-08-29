import { GENERATOR_MIDI_BEATS_PER_BAR, GENERATOR_MIDI_DRUM_CHANNEL, GENERATOR_MIDI_TICKS_PER_QUARTER, type GeneratorMidiComposition, type GeneratorMidiTrack } from "./midi-encoder";
import { type GeneratorIntentTags, type GeneratorLengthBars } from "./generator-options";
import { type GeneratorMusicianPlan, type GeneratorPromptInput, type StyleDnaFilterStats } from "./generator-contracts";
import { clamp01, trackSourceText } from "./generator-prompt";
import { absoluteTrackNotes, isSupportingTrack, maxNoteClusterSize, trackRole } from "./generator-tracker";
import { groupNotesByAttack } from "./generator-massage-repair";
import { supportingTrackVelocityCap } from "./generator-massage-patches";

export function createStyleDnaFilterStats() {
  return {
    chordDependentFillNotes: 0,
    earwormLeadPatched: false,
    eventModulatedNotes: 0,
    massageDecisionLines: new Array<string>(),
    massagedTrackCount: 0,
    normalizedIntentTagLine: "",
    oneShotEvents: 0,
    patchedTrackRoles: [],
    pitchCorrectedNotes: 0,
    quantizedNotes: 0,
    regeneratedTracks: [],
    simplifiedChordClusters: 0,
    skippedAdditiveRepairs: [],
    strippedChordNotes: 0,
    supportBalancedNotes: 0,
    supportThinnedNotes: 0,
    syncopationClampedNotes: 0,
    upperColorNotes: 0,
  } satisfies StyleDnaFilterStats;
}

export function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function grooveGridStepTicks(plan: GeneratorMusicianPlan) {
  if (plan.style.grooveGrid === "double-time") {
    return 60;
  }
  if (plan.style.grooveGrid === "triplet" || plan.style.grooveGrid === "swing") {
    return 160;
  }
  if (plan.style.grooveGrid === "half-time") {
    return 240;
  }
  return 120;
}

export function syncopationCeiling(plan: GeneratorMusicianPlan) {
  return plan.groove.syncopation === "high" ? 0.78 : plan.groove.syncopation === "low" ? 0.32 : 0.56;
}

export type TrackMassageIssueTag =
  | "bass phrase"
  | "chord format"
  | "groove"
  | "harmonic ceiling"
  | "motif"
  | "probabilistic polish"
  | "rhythmic symmetry"
  | "support balance"
  | "tag accents";

export type TrackMassageIssue = {
  score: number;
  tag: TrackMassageIssueTag;
};

export type TrackMassageDecision = {
  incorrectness: number;
  likelihood: number;
  massageFactor: number;
  name: string;
  issues: readonly TrackMassageIssue[];
  role: string;
};

export type StyleMassageBudget = {
  addedRepairs: number;
  maxAddedRepairs: number;
  maxRegeneratedTracks: number;
  regeneratedTracks: number;
};

export function trackAttackGroups(track: GeneratorMidiTrack) {
  return groupNotesByAttack(absoluteTrackNotes(track));
}

export function trackGrooveWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan) {
  const notes = absoluteTrackNotes(track);
  if (notes.length === 0) {
    return 1;
  }
  const step = track.drums || track.channel === GENERATOR_MIDI_DRUM_CHANNEL ? Math.min(grooveGridStepTicks(plan), 120) : grooveGridStepTicks(plan);
  const loosePocket = /laid-back/i.test(plan.groove.microtiming);
  const tolerance = loosePocket && !track.drums
    ? Math.min(96, Math.max(48, step / 2))
    : Math.min(18, Math.max(8, step / 8));
  const wrong = notes.filter((note) => {
    const offset = note.tick % step;
    const distance = Math.min(offset, step - offset);
    return distance > tolerance;
  }).length;
  return wrong / notes.length;
}

export function barRhythmSignatures(track: GeneratorMidiTrack, lengthBars: GeneratorLengthBars) {
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const groups = trackAttackGroups(track);
  return Array.from({ length: lengthBars }, (_, barIndex) => {
    const barStart = barIndex * barTicks;
    const barEnd = barStart + barTicks;
    return groups
      .filter((group) => {
        const tick = group[0]?.tick ?? -1;
        return tick >= barStart && tick < barEnd;
      })
      .map((group) => Math.round((((group[0]?.tick ?? 0) - barStart) / 60)))
      .join(".");
  });
}

export function rhythmicSymmetryWrongness(track: GeneratorMidiTrack, lengthBars: GeneratorLengthBars) {
  const comparable = barRhythmSignatures(track, lengthBars)
    .filter((signature, barIndex) => signature && (barIndex + 1) % 4 !== 0 && barIndex !== lengthBars - 1);
  if (comparable.length < 2) {
    return comparable.length === 0 ? 1 : 0;
  }
  const counts = comparable.reduce<Record<string, number>>((next, signature) => {
    next[signature] = (next[signature] ?? 0) + 1;
    return next;
  }, {});
  const best = Math.max(...Object.values(counts));
  return 1 - best / comparable.length;
}

export function trackMotifWrongness(track: GeneratorMidiTrack) {
  const notes = absoluteTrackNotes(track);
  if (notes.length < 4) {
    return 1;
  }
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const pitchClasses = notes.map((note) => note.note % 12);
  const rhythmicCells = notes.map((note) => Math.round((note.tick % barTicks) / 60));
  const repeatedPitchClasses = new Set(pitchClasses.filter((pitch, index) => pitchClasses.indexOf(pitch) !== index));
  const repeatedRhythms = new Set(rhythmicCells.filter((tick, index) => rhythmicCells.indexOf(tick) !== index));
  const score = (Math.min(1, repeatedPitchClasses.size / 3) + Math.min(1, repeatedRhythms.size / 3)) / 2;
  return 1 - score;
}

export function expectedDrumAccentOffsets(source: string, plan: GeneratorMusicianPlan) {
  if (/house|techno|disco|trance|eurodance|club|warehouse|four-on-floor|four on floor/i.test(source) || plan.style.bassRole === "offbeat-pump") {
    return [0, 480, 960, 1440];
  }
  if (/reggaeton|dancehall|moombahton|dembow/i.test(source)) {
    return [0, 720, 960, 1440];
  }
  if (/amapiano|log-drum|durban/i.test(source)) {
    return [0, 720, 960, 1200, 1440];
  }
  if (/baile|tamborzao|tamborzão|funk-carioca|rio-baile/i.test(source)) {
    return [0, 480, 720, 960, 1440];
  }
  if (/bossa|salsa|samba|cumbia|clave/i.test(source) || plan.style.grooveGrid === "clave") {
    return [0, 720, 1200, 1440];
  }
  if (/latin|afro/i.test(source)) {
    return [0, 720, 1200, 1440];
  }
  if (/jungle|breakbeat|drum.?and.?bass|dnb|garage|footwork|juke|neuro/i.test(source) || plan.style.grooveGrid === "double-time") {
    return [0, 360, 960, 1320, 1680];
  }
  if (/trap|drill|phonk|memphis|jersey/i.test(source)) {
    return [0, 720, 960, 1440];
  }
  return [0, 960];
}

export function drumAccentWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags, lengthBars: GeneratorLengthBars) {
  const notes = absoluteTrackNotes(track);
  if (notes.length === 0) {
    return 1;
  }
  const source = trackSourceText(input, plan, intentTags);
  const offsets = expectedDrumAccentOffsets(source, plan);
  const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * GENERATOR_MIDI_BEATS_PER_BAR;
  const hits = Array.from({ length: lengthBars }, (_, barIndex) => barIndex * barTicks)
    .flatMap((barStart) => offsets.map((offset) => barStart + offset))
    .filter((target) => notes.some((note) => Math.abs(note.tick - target) <= 90 && note.velocity >= 68)).length;
  return 1 - hits / Math.max(1, offsets.length * lengthBars);
}

export function chordStrumRatio(track: GeneratorMidiTrack) {
  const clusters = trackAttackGroups(track).filter((group) => group.length >= 2);
  if (clusters.length === 0) {
    return 0;
  }
  const strummed = clusters.filter((group) => {
    const ticks = group.map((note) => note.tick);
    const spread = Math.max(...ticks) - Math.min(...ticks);
    return spread >= 8 && spread <= 144;
  }).length;
  return strummed / clusters.length;
}

export function chordFormattingWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags) {
  return Math.max(chordStrumWrongness(track, plan, input, intentTags), harmonicCeilingWrongness(track, plan));
}

export function chordStrumWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags) {
  const source = trackSourceText(input, plan, intentTags);
  const needsStrum = /rock|folk|acoustic|americana|pop|house|garage|funk|soul|r&b|guitar|strum|stab|indie/i.test(source);
  return needsStrum ? 1 - chordStrumRatio(track) : 0;
}

export function harmonicCeilingWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan) {
  const cluster = maxNoteClusterSize(track);
  return cluster > plan.quality.maxChordClusterSize
    ? Math.min(1, (cluster - plan.quality.maxChordClusterSize) / Math.max(1, plan.quality.maxChordClusterSize))
    : cluster < plan.quality.minChordClusterSize && plan.harmony.chordLanguage !== "triads"
      ? 0.35
      : 0;
}

export function supportWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars) {
  const notes = absoluteTrackNotes(track);
  if (notes.length === 0) {
    return 1;
  }
  const cap = supportingTrackVelocityCap(track);
  const loudRatio = notes.filter((note) => note.velocity > cap).length / notes.length;
  const groupsPerBar = trackAttackGroups(track).length / Math.max(1, lengthBars);
  const maxGroupsPerBar = plan.style.densityBudget === "space" ? 4 : plan.style.densityBudget === "dense" ? 12 : 8;
  const densityWrongness = groupsPerBar > maxGroupsPerBar ? Math.min(1, (groupsPerBar - maxGroupsPerBar) / maxGroupsPerBar) : 0;
  return Math.max(loudRatio, densityWrongness);
}

export function bassWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars) {
  return Math.max(trackGrooveWrongness(track, plan), bassPhraseWrongness(track, lengthBars));
}

export function bassPhraseWrongness(track: GeneratorMidiTrack, lengthBars: GeneratorLengthBars) {
  const notes = absoluteTrackNotes(track);
  if (notes.length === 0) {
    return 1;
  }
  const barTicks = GENERATOR_MIDI_BEATS_PER_BAR * GENERATOR_MIDI_TICKS_PER_QUARTER;
  const finalBarStart = Math.max(0, (lengthBars - 1) * barTicks);
  const hasPhraseFill = notes.some((note) => note.tick >= finalBarStart + 1320 && note.tick < finalBarStart + barTicks);
  return hasPhraseFill ? 0 : 0.34;
}

export function melodyWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, lengthBars: GeneratorLengthBars) {
  return Math.max(
    trackGrooveWrongness(track, plan),
    rhythmicSymmetryWrongness(track, lengthBars),
    trackMotifWrongness(track),
  );
}

export function roleWrongness(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags, lengthBars: GeneratorLengthBars) {
  const scores = trackWrongnessIssues(track, plan, input, intentTags, lengthBars).map((issue) => issue.score);
  return scores.length === 0 ? 0 : Math.max(...scores);
}

export function trackMassageIssue(tag: TrackMassageIssueTag, score: number) {
  return {
    score: clamp01(score, 0),
    tag,
  } satisfies TrackMassageIssue;
}

export function trackWrongnessIssues(track: GeneratorMidiTrack, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags, lengthBars: GeneratorLengthBars) {
  const role = trackRole(track);
  const reasons = [
    trackMassageIssue("groove", trackGrooveWrongness(track, plan)),
    ...(role === "melody" ? [
      trackMassageIssue("rhythmic symmetry", rhythmicSymmetryWrongness(track, lengthBars)),
      trackMassageIssue("motif", trackMotifWrongness(track)),
    ] : []),
    ...(role === "drums" ? [
      trackMassageIssue("tag accents", drumAccentWrongness(track, plan, input, intentTags, lengthBars)),
    ] : []),
    ...(role === "chords" ? [
      trackMassageIssue("chord format", chordStrumWrongness(track, plan, input, intentTags)),
      trackMassageIssue("harmonic ceiling", harmonicCeilingWrongness(track, plan)),
    ] : []),
    ...(role === "support" || role === "texture" || isSupportingTrack(track) ? [
      trackMassageIssue("support balance", supportWrongness(track, plan, lengthBars)),
    ] : []),
    ...(role === "bass" ? [
      trackMassageIssue("bass phrase", bassPhraseWrongness(track, lengthBars)),
    ] : []),
  ];
  return reasons
    .filter((reason) => reason.score >= 0.08)
    .sort((left, right) => right.score - left.score || left.tag.localeCompare(right.tag));
}

export function trackMassageLikelihood(incorrectness: number, input: GeneratorPromptInput) {
  const creativity = clamp01(input.creativity, 0.65);
  const temperature = clamp01(input.temperature, 0.7);
  return clamp01(incorrectness * 0.3 + (1 - creativity) * 0.6 + (1 - temperature) * 0.1, 0);
}

export function trackMassageFactor(incorrectness: number, likelihood: number) {
  return incorrectness >= 0.3 ? Math.max(incorrectness, likelihood) : likelihood;
}

export function buildTrackMassageDecisions(composition: GeneratorMidiComposition, plan: GeneratorMusicianPlan, input: GeneratorPromptInput, intentTags: GeneratorIntentTags, lengthBars: GeneratorLengthBars) {
  return composition.tracks.map((track) => {
    const issues = trackWrongnessIssues(track, plan, input, intentTags, lengthBars);
    const incorrectness = clamp01(roleWrongness(track, plan, input, intentTags, lengthBars), 0);
    const likelihood = trackMassageLikelihood(incorrectness, input);
    const massageFactor = trackMassageFactor(incorrectness, likelihood);
    return {
      incorrectness,
      issues,
      likelihood,
      massageFactor,
      name: track.name,
      role: trackRole(track),
    } satisfies TrackMassageDecision;
  });
}

export function decisionForTrack(decisions: readonly TrackMassageDecision[], track: GeneratorMidiTrack) {
  return decisions.find((decision) => decision.name === track.name);
}

export function selectedMassageIssues(decision: TrackMassageDecision) {
  const severeIssueCount = decision.issues.filter((issue) => issue.score >= 0.3).length;
  const pressureBudget = decision.massageFactor >= 0.85
    ? 3
    : decision.massageFactor >= 0.7
      ? 2
      : decision.massageFactor >= 0.55
        ? 2
        : decision.massageFactor >= 0.4
          ? 1
          : decision.massageFactor >= 0.25
            ? 1
            : 0;
  return decision.issues.slice(0, Math.min(3, Math.max(severeIssueCount > 0 ? 1 : 0, pressureBudget)));
}

export function issueScore(decision: TrackMassageDecision | undefined, tags: readonly TrackMassageIssueTag[]) {
  if (!decision) {
    return 0;
  }
  return Math.max(0, ...decision.issues.filter((issue) => tags.includes(issue.tag)).map((issue) => issue.score));
}

export function issueSelected(decision: TrackMassageDecision | undefined, tags: readonly TrackMassageIssueTag[]) {
  if (!decision) {
    return false;
  }
  return selectedMassageIssues(decision).some((issue) => tags.includes(issue.tag));
}

export function repairPressure(decision: TrackMassageDecision | undefined, tags: readonly TrackMassageIssueTag[]) {
  if (!decision) {
    return 0;
  }
  const score = issueScore(decision, tags);
  if (issueSelected(decision, tags)) {
    return Math.max(score, decision.massageFactor);
  }
  return score >= 0.3 ? score : Math.max(0, decision.massageFactor * 0.35);
}

export function roleRepairPressure(decisions: readonly TrackMassageDecision[], role: string, tags: readonly TrackMassageIssueTag[]) {
  return Math.max(0, ...decisions
    .filter((decision) => decision.role === role)
    .map((decision) => repairPressure(decision, tags)));
}

export function createStyleMassageBudget(decisions: readonly TrackMassageDecision[]) {
  const maxFactor = Math.max(0, ...decisions.map((decision) => decision.massageFactor));
  return {
    addedRepairs: 0,
    maxAddedRepairs: maxFactor >= 0.9 ? 2 : 1,
    maxRegeneratedTracks: 1,
    regeneratedTracks: 0,
  } satisfies StyleMassageBudget;
}

export function consumeAdditiveRepair(budget: StyleMassageBudget, stats: StyleDnaFilterStats, label: string) {
  if (budget.addedRepairs >= budget.maxAddedRepairs) {
    stats.skippedAdditiveRepairs.push(label);
    return false;
  }
  budget.addedRepairs += 1;
  return true;
}

export function consumeRegeneration(budget: StyleMassageBudget) {
  if (budget.regeneratedTracks >= budget.maxRegeneratedTracks) {
    return false;
  }
  budget.regeneratedTracks += 1;
  return true;
}
