import {
  parseDeltaTickTracker,
  shouldKeepMassagedModel,
} from "./codex-client";

const originalFetch = globalThis.fetch;
const originalDevtoolsEnv = process.env.PADPILOT_DEVTOOLS_ENABLED;

export function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
}

export function readVariableLength(bytes: Uint8Array, offset: number) {
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

export function firstTrackEndTick(bytes: Uint8Array) {
  const trackStart = 22;
  const trackEnd = trackStart + readU32(bytes, 18);
  let cursor = trackStart;
  let tick = 0;
  while (cursor < trackEnd) {
    const delta = readVariableLength(bytes, cursor);
    tick += delta.value;
    cursor = delta.cursor;
    const status = bytes[cursor] ?? 0;
    cursor += 1;
    if (status !== 0xff) {
      cursor += (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
      continue;
    }
    const metaType = bytes[cursor] ?? 0;
    cursor += 1;
    const length = readVariableLength(bytes, cursor);
    cursor = length.cursor + length.value;
    if (metaType === 0x2f) {
      return tick;
    }
  }
  return tick;
}

export function compositionEndTick(rawTracker: string) {
  const composition = parseDeltaTickTracker(rawTracker);
  return composition.tracks.reduce((outerMax, track) => {
    let cursor = 0;
    return Math.max(
      outerMax,
      track.notes.reduce((innerMax, note) => {
        cursor += note.deltaTicks;
        return Math.max(innerMax, cursor + note.durationTicks);
      }, 0),
    );
  }, 0);
}

export function trackEndTick(track: ReturnType<typeof parseDeltaTickTracker>["tracks"][number]) {
  let cursor = 0;
  return track.notes.reduce((endTick, note) => {
    cursor += note.deltaTicks;
    return Math.max(endTick, cursor + note.durationTicks);
  }, 0);
}

export function absoluteNotes(track: ReturnType<typeof parseDeltaTickTracker>["tracks"][number]) {
  let cursor = 0;
  return track.notes.map((note) => {
    cursor += note.deltaTicks;
    return {
      ...note,
      tick: cursor,
    };
  });
}

export function deltaNotes(notes: ReturnType<typeof absoluteNotes>) {
  let previousTick = 0;
  return [...notes]
    .sort((left, right) => left.tick - right.tick || left.note - right.note)
    .map((note) => {
      const deltaTicks = Math.max(0, note.tick - previousTick);
      previousTick = note.tick;
      return {
        deltaTicks,
        durationTicks: note.durationTicks,
        note: note.note,
        velocity: note.velocity,
      };
    });
}

export function trackerFromComposition(composition: ReturnType<typeof parseDeltaTickTracker>) {
  return [
    `!BPM:${composition.bpm}!`,
    ...composition.tracks.flatMap((track) => [
      `#TRK:${track.name},CH:${track.channel},PG:${track.program}`,
      track.notes.map((note) => `[${note.deltaTicks},${note.note},${note.velocity},${note.durationTicks}]`).join(""),
    ]),
  ].join("\n");
}

export function qualityFixture(score: number, passed = true) {
  return {
    metrics: {
      bassRoles: 1,
      declaredRoleMisses: [],
      maxChordCluster: 3,
      melodicLayers: 1,
      melodyPhraseScore: 5,
      motifScore: 2,
      nonDrumNotesPerBar: 12,
      offbeatRatio: 0.4,
      phraseFill: true,
      phraseVariations: 2,
      shortTracks: 0,
      style: {
        bassTracks: 1,
        deductions: 0,
        drumNotesPerBar: 8,
        drumTracks: 1,
        requirements: [],
      },
      tracks: 4,
    },
    passed,
    reasons: [],
    score,
  };
}

export function styleStatsFixture(patch: Partial<Parameters<typeof shouldKeepMassagedModel>[2]> = {}) {
  return {
    chordDependentFillNotes: 0,
    earwormLeadPatched: false,
    eventModulatedNotes: 0,
    massageDecisionLines: [],
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
    ...patch,
  } satisfies Parameters<typeof shouldKeepMassagedModel>[2];
}

export function withDenseFirstTrackClusters(rawTracker: string) {
  const composition = parseDeltaTickTracker(rawTracker);
  const firstTrack = composition.tracks[0];
  if (!firstTrack) {
    return rawTracker;
  }
  const denseNotes = absoluteNotes(firstTrack).flatMap((note) => [
    note,
    { ...note, note: Math.min(127, note.note + 12) },
    { ...note, note: Math.min(127, note.note + 19) },
  ]);
  return trackerFromComposition({
    ...composition,
    tracks: [
      {
        ...firstTrack,
        notes: deltaNotes(denseNotes),
      },
      ...composition.tracks.slice(1),
    ],
  });
}

export function withWeakDrumAccents(rawTracker: string) {
  const composition = parseDeltaTickTracker(rawTracker);
  return trackerFromComposition({
    ...composition,
    tracks: composition.tracks.map((track) => (track.drums || /drums|rhythm|perc|kit|groove/i.test(track.name))
      ? {
          ...track,
          notes: track.notes.map((note) => ({
            ...note,
            velocity: Math.min(note.velocity, 52),
          })),
        }
      : track),
  });
}

export function withoutTracks(rawTracker: string, matcher: RegExp) {
  const composition = parseDeltaTickTracker(rawTracker);
  return trackerFromComposition({
    ...composition,
    tracks: composition.tracks.filter((track) => !matcher.test(track.name)),
  });
}

export function withOffsetNonDrumStarts(rawTracker: string, offsetTicks: number) {
  const composition = parseDeltaTickTracker(rawTracker);
  return trackerFromComposition({
    ...composition,
    tracks: composition.tracks.map((track) => track.drums
      ? track
      : {
          ...track,
          notes: deltaNotes(absoluteNotes(track).map((note) => ({
            ...note,
            tick: note.tick + offsetTicks,
          }))),
        }),
  });
}

export function withBrokenLeadMotif(rawTracker: string) {
  const composition = parseDeltaTickTracker(rawTracker);
  return trackerFromComposition({
    ...composition,
    tracks: composition.tracks.map((track) => /lead motif|topline|hook/i.test(track.name)
      ? {
          ...track,
          notes: deltaNotes([{
            deltaTicks: 0,
            durationTicks: 31,
            note: 24,
            tick: 37,
            velocity: 22,
          }]),
        }
      : track),
  });
}

export function withOutsideScaleHarmony(rawTracker: string) {
  const composition = parseDeltaTickTracker(rawTracker);
  return trackerFromComposition({
    ...composition,
    tracks: composition.tracks.map((track) => track.drums
      ? track
      : {
          ...track,
          notes: deltaNotes(absoluteNotes(track).map((note, index) => ({
            ...note,
            note: index % 2 === 0 ? 65 : note.note,
          }))),
        }),
  });
}

export function structuredEnvelopeResponse(tracker: string, extras: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    response: JSON.stringify({
      arrangementPlan: {
        bass: "root",
        confidence: 0.9,
        form: "starter-turnaround",
        grid: "straight",
        motif: "hook",
        phraseFunction: "statement-answer",
        roles: ["drum-groove", "chord-comp", "root-bass", "lead-motif"],
        style: "fixture",
      },
      chordPlan: [],
      confidence: 0.94,
      groovePlan: {
        anchors: ["downbeat"],
        grid: "straight",
        microtiming: "centered",
        rhythmCell: "steady",
        swing: "none",
      },
      grammarVersion: "delta-tracker-v2",
      harmonicTolerancePolicy: {
        absoluteWrong: [],
        allowedTensions: [],
        avantAllowed: [],
        fixingFactor: 0.18,
        mode: "strict",
        source: "fixture",
      },
      lanePlan: [
        { bassRole: "", function: "groove", lane: "drums", name: "Fixture Drums", role: "drum-groove" },
      ],
      repairAvoided: ["fixture preserves model intent"],
      schemaVersion: "generator-model-envelope-v1",
      tracker,
      validationNotes: ["fixture validated"],
      ...extras,
    }),
  }));
}

export function trackerFromCompositionWithHeaders(
  composition: ReturnType<typeof parseDeltaTickTracker>,
  metadataLines: readonly string[],
  headerForTrack: (track: ReturnType<typeof parseDeltaTickTracker>["tracks"][number]) => string,
) {
  return [
    `!BPM:${composition.bpm}!`,
    ...metadataLines,
    ...composition.tracks.flatMap((track) => [
      `#TRK:${track.name.replace(/,/g, " ")},CH:${track.channel},PG:${track.program}${headerForTrack(track)}`,
      track.notes.map((note) => `[${note.deltaTicks},${note.note},${note.velocity},${note.durationTicks}]`).join(""),
    ]),
  ].join("\n");
}

export function microtimedNoteCount(rawTracker: string) {
  return parseDeltaTickTracker(rawTracker)
    .tracks
    .flatMap((track) => track.drums ? [] : absoluteNotes(track))
    .filter((note) => note.tick % 120 !== 0)
    .length;
}


export function restoreCodexClientTestEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalDevtoolsEnv === undefined) {
    delete process.env.PADPILOT_DEVTOOLS_ENABLED;
  } else {
    process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsEnv;
  }
}
