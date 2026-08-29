import { afterEach, describe, expect, it } from "bun:test";
import {
  buildMusicianPlan,
  extractGeneratorArrangementPlan,
  MAX_DELTA_TRACKER_UTF8_BYTES,
  parseDeltaTickTracker,
  scoreGeneratorComposition,
} from "./codex-client";
import {
  MAX_GENERATOR_MIDI_NOTES_PER_TRACK,
  MAX_GENERATOR_MIDI_TRACKS,
} from "./midi-encoder";
import {
  restoreCodexClientTestEnvironment,
} from "./codex-client.test-helpers";

describe("codex client tracker", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("parses compact delta-tick tracker output into normalized tracks", () => {
    const parsed = parseDeltaTickTracker(`
!BPM:172!
#TRK:Drums,CH:0,PG:0
[0,36,110,120][240,38,105,120]
#TRK:Piano,CH:0,PG:0
[0,60,90,480][480,64,85,480]
`);

    expect(parsed.bpm).toBe(172);
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0]?.channel).toBe(9);
    expect(parsed.tracks[0]?.drums).toBe(true);
    expect(parsed.tracks[1]?.notes[1]?.deltaTicks).toBe(480);
  });

  it("bounds hostile tracker text, tracks, metadata, notes, and cluster scoring", () => {
    expect(() => parseDeltaTickTracker(`!BPM:120!${"x".repeat(MAX_DELTA_TRACKER_UTF8_BYTES + 1)}`))
      .toThrow(/text exceeded/);

    const tooManyTracks = [
      "!BPM:120!",
      ...Array.from({ length: MAX_GENERATOR_MIDI_TRACKS + 1 }, (_, index) =>
        `#TRK:Lane ${index},CH:0,PG:0\n[0,60,90,120]`),
    ].join("\n");
    expect(() => parseDeltaTickTracker(tooManyTracks)).toThrow(/tracks/);
    expect(() => parseDeltaTickTracker(
      `!BPM:120!\n#TRK:${"n".repeat(129)},CH:0,PG:0\n[0,60,90,120]`,
    )).toThrow(/track name/);
    expect(() => parseDeltaTickTracker(
      `!BPM:120!\n!PLAN:${"m".repeat(2_049)}!\n#TRK:Lane,CH:0,PG:0\n[0,60,90,120]`,
    )).toThrow(/metadata line/);

    const noteBlock = "[0,60,90,120]";
    expect(() => parseDeltaTickTracker(
      `!BPM:120!\n#TRK:Dense,CH:0,PG:0\n${noteBlock.repeat(MAX_GENERATOR_MIDI_NOTES_PER_TRACK + 1)}`,
    )).toThrow(/note limit/);

    const denseTracker = `!BPM:120!\n#TRK:Dense,CH:0,PG:0\n${Array.from(
      { length: MAX_GENERATOR_MIDI_NOTES_PER_TRACK },
      (_, index) => `[0,${index % 128},90,120]`,
    ).join("")}`;
    const dense = parseDeltaTickTracker(denseTracker);
    const startedAt = performance.now();
    const quality = scoreGeneratorComposition(dense, buildMusicianPlan({ genre: "House" }), 4);
    expect(Number.isFinite(quality.score)).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });

  it("parses tracker names containing commas without losing the lane", () => {
    const parsed = parseDeltaTickTracker(`
!BPM:96!
#TRK:Warm Rhodes, soft comp,CH:0,PG:4
[0,60,84,480][480,64,82,480]
`);

    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]?.name).toBe("Warm Rhodes, soft comp");
  });

  it("rejects invalid tracker values instead of clamping model grammar", () => {
    expect(() => parseDeltaTickTracker(`
!BPM:999!
#TRK:Bad Lane,CH:20,PG:999
[-120,200,200,0]
`)).toThrow(/out of range/);
  });

  it("rejects malformed tracker blocks and headers instead of dropping lanes", () => {
    expect(() => parseDeltaTickTracker(`
!BPM:120!
#TRK:Bad Lane,CH:0,PG:0
[0,60,90,240][BAD]
`)).toThrow(/malformed note block/);

    expect(() => parseDeltaTickTracker(`
!BPM:120!
#TRK:Bad Lane,CH:0
[0,60,90,240]
#TRK:Good Lane,CH:0,PG:0
[0,64,90,240]
`)).toThrow(/malformed track header/);
  });

  it("uses channel and metadata to identify generic drum lanes", () => {
    const parsed = parseDeltaTickTracker(`
!BPM:124!
#TRK:Model Lane A,CH:9,PG:0,ROLE=drum-groove,LANE=drums
[0,36,110,120][480,38,104,120]
`);

    expect(parsed.tracks[0]?.channel).toBe(9);
    expect(parsed.tracks[0]?.drums).toBe(true);
  });

  it("scores GM bass programs as bass roles without relying on track names", () => {
    const plan = buildMusicianPlan({ genre: "Drill" });
    const parsed = parseDeltaTickTracker(`
!BPM:140!
#TRK:Moog Low End,CH:1,PG:38
[0,36,92,480][480,38,88,480][480,39,90,480][480,41,92,480]
#TRK:Haunted Koto,CH:0,PG:107
[0,72,86,240][240,75,84,240][240,74,84,480][480,70,86,480]
#TRK:Cold Pad,CH:2,PG:88
[0,48,68,960][0,55,66,960][0,58,64,960]
#TRK:Trap Drums,CH:9,PG:0
[0,36,110,120][960,38,104,120][480,42,84,120][240,46,90,120]
`);

    expect(scoreGeneratorComposition(parsed, plan, 4).metrics.bassRoles).toBeGreaterThanOrEqual(1);
  });

  it("counts one combined bass lane as one role", () => {
    const plan = buildMusicianPlan({ density: 0.82, genre: "House" });
    const parsed = parseDeltaTickTracker(`
!BPM:124!
#TRK:808 Electric Bass Offbeat Pulse Passing Movement,CH:1,PG:38
[0,36,92,240][480,43,88,240][480,48,90,240][480,43,88,240]
#TRK:Chord Stab,CH:0,PG:4
[0,60,84,240][0,64,82,240][0,67,80,240][960,62,84,240][0,65,82,240][0,69,80,240]
#TRK:Lead Motif,CH:2,PG:81
[0,72,88,240][240,76,86,240][240,79,88,480][960,76,84,240]
#TRK:House Drums,CH:9,PG:0
[0,36,110,120][480,42,82,120][480,38,104,120][480,42,82,120]
`);

    expect(scoreGeneratorComposition(parsed, plan, 4).metrics.bassRoles).toBe(1);
  });

  it("fails model quality when declared plan roles are missing from tracks", () => {
    const plan = buildMusicianPlan({ genre: "Drill" });
    const rawTracker = `
!BPM:140!
!PLAN:STYLE=drill;GRID=half-time;BASS=808;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=hook;ROLES=drum-groove,chord-comp,808-lead;CONFIDENCE=0.88!
#TRK:Trap Drums,CH:9,PG:0
[0,36,110,120][480,38,104,120][480,42,84,120][480,46,90,120]
#TRK:Cold Chord Pad,CH:0,PG:88
[0,48,68,960][0,55,66,960][0,58,64,960]
#TRK:Lead Motif,CH:2,PG:81
[0,72,88,240][240,76,86,240][240,79,88,480]
`;
    const quality = scoreGeneratorComposition(parseDeltaTickTracker(rawTracker), plan, 4, extractGeneratorArrangementPlan(rawTracker));

    expect(quality.metrics.declaredRoleMisses).toEqual(["808-lead"]);
    expect(quality.reasons.join("\n")).toContain("declared roles missing 808-lead");
    expect(quality.passed).toBe(false);
  });

  it("uses ROLE/LANE/FUNCTION tracker headers for declared role validation", () => {
    const plan = buildMusicianPlan({ genre: "Drill" });
    const rawTracker = `
!BPM:140!
!PLAN:STYLE=drill;GRID=half-time;BASS=808;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=hook;ROLES=drum-groove,chord-comp,808-lead,lead-motif;CONFIDENCE=0.88!
#TRK:Model Lane A,CH:9,PG:0,ROLE:drum-groove,LANE:drums,FUNCTION:pulse
[0,36,110,120][720,38,104,120][240,42,84,120][480,46,90,120]
#TRK:Model Lane B,CH:0,PG:4,ROLE:chord-comp,LANE:harmony,FUNCTION:stabs
[0,60,84,240][0,63,82,240][0,67,80,240][960,58,84,240][0,62,82,240][0,65,80,240]
#TRK:Model Lane C,CH:1,PG:38,ROLE:808-lead,LANE:bass,FUNCTION:sub-slides
[0,36,94,480][480,43,90,480][480,39,92,480][480,41,88,480]
#TRK:Model Lane D,CH:2,PG:81,ROLE:lead-motif,LANE:melody,FUNCTION:hook
[0,72,88,240][240,75,84,240][240,74,84,480][480,70,86,480]
`;
    const quality = scoreGeneratorComposition(parseDeltaTickTracker(rawTracker), plan, 4, extractGeneratorArrangementPlan(rawTracker));

    expect(quality.metrics.declaredRoleMisses).toEqual([]);
    expect(quality.reasons.join("\n")).not.toContain("declared roles missing");
  });

  it("does not let a lead motif satisfy a declared 808 lead role", () => {
    const plan = buildMusicianPlan({ genre: "Drill" });
    const rawTracker = `
!BPM:140!
!PLAN:STYLE=drill;GRID=half-time;BASS=808;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=hook;ROLES=drum-groove,chord-comp,808-lead,lead-motif;CONFIDENCE=0.88!
#TRK:Model Lane A,CH:9,PG:0,ROLE=drum-groove,LANE=drums
[0,36,110,120][480,38,104,120][480,42,84,120][480,46,90,120]
#TRK:Cold Chord Pad,CH:0,PG:88,ROLE=chord-comp
[0,48,68,960][0,55,66,960][0,58,64,960]
#TRK:Top Melody,CH:2,PG:81,ROLE=lead-motif
[0,72,88,240][240,76,86,240][240,79,88,480]
`;
    const quality = scoreGeneratorComposition(parseDeltaTickTracker(rawTracker), plan, 4, extractGeneratorArrangementPlan(rawTracker));

    expect(quality.metrics.declaredRoleMisses).toEqual(["808-lead"]);
  });
});
