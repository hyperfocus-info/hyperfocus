import { countMassaged } from "../codex-client.test-helpers";
import { afterEach, describe, expect, it } from "bun:test";
import { buildFallbackTracker } from "../generator-fallback";
import { generateMidiTemplate } from "../generator-client";
import { parseDeltaTickTracker } from "../generator-tracker";
import { shouldKeepMassagedModel } from "../generator-quality";
import {
  GENERATOR_MIDI_TICKS_PER_QUARTER,
} from "../midi-encoder";
import {
  trackEndTick,
  absoluteNotes,
  deltaNotes,
  trackerFromComposition,
  qualityFixture,
  styleStatsFixture,
  withWeakDrumAccents,
  withoutTracks,
  withOffsetNonDrumStarts,
  withBrokenLeadMotif,
  withOutsideScaleHarmony,
  structuredEnvelopeResponse,
  trackerFromCompositionWithHeaders,
  microtimedNoteCount,
  restoreCodexClientTestEnvironment,
} from "../codex-client.test-helpers";

describe("codex client massage", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("filters dirty model timing onto the style groove grid", async () => {
    const input = { genre: "House", lengthBars: 8 };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withOffsetNonDrumStarts(buildFallbackTracker(input), 37),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const nonDrumTicks = parsed.tracks.flatMap((track) => track.drums ? [] : absoluteNotes(track).map((note) => note.tick));

    expect(result.source).toBe("local-model");
    expect(nonDrumTicks.every((tick) => tick % 120 === 0)).toBe(true);
    expect(logs.join("\n")).toContain("quantized");
    expect(logs.join("\n")).toContain("wrong");
    expect(logs.join("\n")).toContain("fix: groove");
  });

  it("keeps high-humanize microtiming instead of broad quantizing the model", async () => {
    const input = {
      complexity: "Humanized Loose",
      density: 0.62,
      genre: "Neo Soul",
      humanize: 0.92,
      lengthBars: 8,
      mood: "Warm",
    };
    const rawTracker = withOffsetNonDrumStarts(buildFallbackTracker(input), 23);
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const patchLines = result.audit?.repairPatch?.patchLines.join("\n") ?? "";

    expect(result.source).toBe("local-model");
    expect(microtimedNoteCount(result.rawTracker)).toBeGreaterThanOrEqual(Math.floor(microtimedNoteCount(rawTracker) * 0.9));
    expect(patchLines).not.toContain("quantized");
  });

  it("patches missing model bass lanes from deterministic fallback material", async () => {
    const input = { genre: "Drill", lengthBars: 8 };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withoutTracks(buildFallbackTracker(input), /808|sub/i),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("local-model");
    expect(result.tracks.some((track) => /808|sub/i.test(track.name))).toBe(true);
    expect(logs.join("\n")).toContain("patched missing bass roles: 808/sub bass");
  });

  it("patches a missing lead without stacking decorative repair lanes", async () => {
    const input = { creativity: 0.8, genre: "Melodic House", lengthBars: 8 };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withoutTracks(buildFallbackTracker(input), /lead|riff|counter|motif/i),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });
    const names = result.tracks.map((track) => track.name).join("\n");
    const logText = logs.join("\n");

    expect(result.source).toBe("local-model");
    expect(result.tracks.some((track) => /lead motif|earworm/i.test(track.name))).toBe(true);
    expect(logText).toContain("patched earworm lead motif");
    expect(names).not.toContain("Upper Color Single Voice");
    expect(names).not.toContain("Chord Dependent Turnaround Fill");
  });

  it("does not add a repaired lead when an existing riff has motif identity", async () => {
    const input = {
      genre: "Gospel",
      lengthBars: 16,
      notes: "sick guitar riff, syncopated organ stabs, ascending progression, resolve on 1",
      scaleKey: "Minor Pentatonic",
    };
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: buildFallbackTracker(input),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);

    expect(result.tracks.some((track) => /repaired earworm/i.test(track.name))).toBe(false);
  });

  it("adds one-shot accents when drum accents miss the selected tag groove", async () => {
    const input = { genre: "House", lengthBars: 8 };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withWeakDrumAccents(buildFallbackTracker(input)),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("local-model");
    expect(logs.join("\n")).toContain("one-shot accents");
    expect(logs.join("\n")).toContain("tag accents");
    expect(logs.join("\n")).toContain("fix: tag accents");
  });

  it("uses low creativity and low temperature to increase deterministic massage factor", async () => {
    const rawTracker = buildFallbackTracker({ genre: "House", lengthBars: 8 });

    const highLogs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    await generateMidiTemplate({
      creativity: 0.95,
      genre: "House",
      lengthBars: 8,
      temperature: 0.95,
    }, { onLog: (line) => highLogs.push(line) });

    const lowLogs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    await generateMidiTemplate({
      creativity: 0.05,
      genre: "House",
      lengthBars: 8,
      temperature: 0.05,
    }, { onLog: (line) => lowLogs.push(line) });

    expect(countMassaged(lowLogs)).toBeGreaterThanOrEqual(countMassaged(highLogs));
  });

  it("regenerates severely wrong lanes at high gradient pressure", async () => {
    const input = { genre: "House", lengthBars: 8 };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withBrokenLeadMotif(buildFallbackTracker(input)),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const lead = parsed.tracks.find((track) => /lead motif/i.test(track.name));

    expect(result.source).toBe("local-model");
    expect(lead ? absoluteNotes(lead).length : 0).toBeGreaterThan(4);
    expect(logs.join("\n")).toContain("regenerated lanes");
    expect(logs.join("\n")).toContain("motif");
  });

  it("keeps supporting model lanes below lead velocity", async () => {
    const input = { density: 0.82, genre: "Neo Soul", lengthBars: 8 };
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: buildFallbackTracker(input),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const supportNotes = parsed.tracks
      .filter((track) => /guide|upper color|texture|counter|riff|fill/i.test(track.name) && !/lead motif/i.test(track.name))
      .flatMap(absoluteNotes);

    expect(supportNotes.length).toBeGreaterThan(0);
    expect(Math.max(...supportNotes.map((note) => note.velocity))).toBeLessThanOrEqual(76);
  });

  it("keeps explicit scale mode locked after model and massage repairs", async () => {
    const input = {
      genre: "Gospel",
      lengthBars: 8,
      notes: "sick guitar riff, syncopated organ stabs",
      scaleKey: "A Minor Pentatonic",
    };
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: withOutsideScaleHarmony(buildFallbackTracker(input)),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const allowed = new Set([9, 0, 2, 4, 7]);
    const pitchedNotes = parsed.tracks.flatMap((track) => track.drums ? [] : absoluteNotes(track));

    expect(pitchedNotes.every((note) => allowed.has(note.note % 12))).toBe(true);
    expect(logs.join("\n")).toContain("scale-corrected");
  });

  it("preserves model-declared blue notes through scale repair", async () => {
    const input = { genre: "Blues", lengthBars: 4, scaleKey: "C Major" };
    const composition = parseDeltaTickTracker(buildFallbackTracker(input));
    const leadIndex = composition.tracks.findIndex((track) => /lead motif/i.test(track.name));
    expect(leadIndex).toBeGreaterThanOrEqual(0);
    const rawTracker = trackerFromComposition({
      ...composition,
      tracks: composition.tracks.map((track, trackIndex) => trackIndex === leadIndex
        ? {
            ...track,
            notes: track.notes.map((note, noteIndex) => ({
              ...note,
              note: noteIndex === 0 ? 63 : noteIndex === 1 ? 61 : noteIndex === 2 ? 68 : note.note,
            })),
          }
        : track),
    }).replace(
      "\n#TRK:",
      "\n!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!\n!PLAN:STYLE=blues;GRID=swing;BASS=walking;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=hook;ROLES=drum-groove,chord-comp,live-passing-bass,lead-motif;CONFIDENCE=0.88!\n!TAGS:THEME=blue-note,warm-chords;GROOVE=laid-back-pocket,swing!\n#TRK:",
    );
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({ response: rawTracker })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const leadNotes = parsed.tracks.find((track) => /lead motif/i.test(track.name))?.notes ?? [];

    expect(leadNotes.some((note) => note.note === 63)).toBe(true);
    expect(leadNotes.some((note) => note.note === 61)).toBe(false);
    expect(leadNotes.some((note) => note.note === 68)).toBe(false);
  });

  it("preserves resolved drill +1 chord tension while snapping unresolved melody and bass notes", async () => {
    const input = {
      genre: "Drill",
      lengthBars: 4,
      mood: "Dark",
      notes: "preserve resolved drill +1 chord tension; snap wrong melody and bass notes",
      scaleKey: "C Natural Minor",
    };
    const composition = parseDeltaTickTracker(buildFallbackTracker(input));
    const rawTracker = trackerFromCompositionWithHeaders({
      ...composition,
      tracks: composition.tracks.map((track) => {
        const notes = absoluteNotes(track);
        if (/chord|pad/i.test(track.name)) {
          return {
            ...track,
            notes: deltaNotes(notes.map((note, index) => index === 0
              ? { ...note, note: 61 }
              : index === 2
                ? { ...note, note: 60 }
                : note)),
          };
        }
        if (/lead motif/i.test(track.name)) {
          return {
            ...track,
            notes: deltaNotes(notes.map((note, index) => index === 0 ? { ...note, note: 66 } : note)),
          };
        }
        if (/808|sub|bass/i.test(track.name)) {
          return {
            ...track,
            notes: deltaNotes(notes.map((note, index) => index === 0 ? { ...note, note: 49 } : note)),
          };
        }
        return track;
      }),
    }, [
      "!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!",
      "!PLAN:STYLE=drill;GRID=half-time;BASS=808-lead;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=riff;ROLES=chord-comp,808-sub-bass,lead-motif;CONFIDENCE=0.9!",
      "!TAGS:THEME=drill,drill-semitone-lift;GROOVE=half-time,808-slide-pocket!",
    ], (track) => {
      if (/chord|pad/i.test(track.name)) return ",ROLE:chord-comp,LANE:harmony,FUNCTION:resolved-drill-semitone-lift";
      if (/808|sub|bass/i.test(track.name)) return ",ROLE:808-sub-bass,LANE:bass,FUNCTION:root";
      if (/lead|motif|riff/i.test(track.name)) return ",ROLE:lead-motif,LANE:melody,FUNCTION:hook";
      return "";
    });
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(rawTracker, {
      harmonicTolerancePolicy: {
        absoluteWrong: ["unresolved melody outside scale", "strong beat bass outside scale"],
        allowedTensions: ["drill-semitone-lift"],
        avantAllowed: [],
        fixingFactor: 0.1,
        mode: "tension",
        source: "fixture",
      },
    }))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const chordNotes = parsed.tracks.filter((track) => /chord|pad/i.test(track.name)).flatMap(absoluteNotes);
    const leadNotes = parsed.tracks.filter((track) => /lead motif/i.test(track.name)).flatMap(absoluteNotes);
    const bassNotes = parsed.tracks.filter((track) => /808|sub|bass/i.test(track.name)).flatMap(absoluteNotes);

    expect(result.source).toBe("local-model");
    expect(chordNotes.some((note) => note.note === 61)).toBe(true);
    expect(leadNotes.some((note) => note.note === 66)).toBe(false);
    expect(bassNotes.some((note) => note.note === 49)).toBe(false);
  });

  it("snaps unresolved chord tensions even when model fixingFactor is low", async () => {
    const input = {
      genre: "House",
      lengthBars: 4,
      scaleKey: "C Major",
    };
    const composition = parseDeltaTickTracker(buildFallbackTracker(input));
    const rawTracker = trackerFromComposition({
      ...composition,
      tracks: composition.tracks.map((track) => /chord|keys|piano|stab/i.test(track.name)
        ? {
            ...track,
            notes: deltaNotes(absoluteNotes(track).map((note, index) => index === 0 ? { ...note, note: 66 } : note)),
          }
        : track),
    });
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(rawTracker, {
      harmonicTolerancePolicy: {
        absoluteWrong: ["unresolved chord outside scale"],
        allowedTensions: [],
        avantAllowed: [],
        fixingFactor: 0.1,
        mode: "tension",
        source: "fixture",
      },
    }))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const chordNotes = parsed.tracks.filter((track) => /chord|keys|piano|stab/i.test(track.name)).flatMap(absoluteNotes);

    expect(result.source).toBe("local-model");
    expect(chordNotes.some((note) => note.note % 12 === 6)).toBe(false);
  });

  it("preserves resolved gospel diminished passing chords through scale repair", async () => {
    const input = {
      creativity: 0.48,
      density: 0.66,
      genre: "Gospel",
      lengthBars: 8,
      mood: "Uplifting",
      scaleKey: "C Major",
    };
    const composition = parseDeltaTickTracker(buildFallbackTracker(input));
    let patchedChordTrack = false;
    const rawTracker = trackerFromCompositionWithHeaders({
      ...composition,
      tracks: composition.tracks.map((track) => {
        if (patchedChordTrack || !(/chord|organ|keys|piano|string|brass|guitar/i.test(track.name) && !/lead|riff/i.test(track.name))) {
          return track;
        }
        patchedChordTrack = true;
        const notes = absoluteNotes(track);
        const firstTick = notes[0]?.tick ?? 0;
        const resolveTick = firstTick + GENERATOR_MIDI_TICKS_PER_QUARTER;
        const passing = [61, 64, 67, 70, 73];
        const resolved = [62, 65, 69, 72, 76];
        return {
          ...track,
          notes: deltaNotes(notes.map((note, index) => index < passing.length
            ? { ...note, note: passing[index] ?? note.note, tick: firstTick + index * 12 }
            : index < passing.length + resolved.length
              ? { ...note, note: resolved[index - passing.length] ?? note.note, tick: resolveTick + (index - passing.length) * 12 }
              : note)),
        };
      }),
    }, [
      "!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!",
      "!PLAN:STYLE=gospel;GRID=swing;BASS=walking;FORM=starter-turnaround;PHRASE=statement-answer;MOTIF=call-response;ROLES=drum-groove,chord-comp,live-passing-bass,lead-motif,guide-tone-harmonic-layer;CONFIDENCE=0.9!",
      "!TAGS:THEME=gospel,passing-diminished,resolved-chromatic;GROOVE=laid-back-pocket,swing!",
    ], (track) => {
      if (/guide/i.test(track.name)) return ",ROLE:guide-tone-harmonic-layer,LANE:harmony,FUNCTION:guide-tones";
      if (/chord|organ|keys|piano|string|brass|guitar/i.test(track.name) && !/lead|riff/i.test(track.name)) return ",ROLE:chord-comp,LANE:harmony,FUNCTION:resolved-diminished-passing";
      if (/bass/i.test(track.name)) return ",ROLE:live-passing-bass,LANE:bass,FUNCTION:walking";
      if (/lead|motif|riff|counter|sax|vocal|harmonica/i.test(track.name)) return ",ROLE:lead-motif,LANE:melody,FUNCTION:call-response";
      if (/drum|kit|perc|groove|brush/i.test(track.name)) return ",ROLE:drum-groove,LANE:drums,FUNCTION:backbeat";
      return "";
    });
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(rawTracker, {
      harmonicTolerancePolicy: {
        absoluteWrong: ["unresolved final melody outside scale", "strong beat bass outside scale"],
        allowedTensions: ["diminished-passing", "chromatic-approach"],
        avantAllowed: [],
        fixingFactor: 0.1,
        mode: "tension",
        source: "fixture",
      },
    }))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const chordNotes = parseDeltaTickTracker(result.rawTracker)
      .tracks
      .filter((track) => /chord|organ|keys|piano|string|brass|guitar/i.test(track.name) && !/lead|riff/i.test(track.name))
      .flatMap(absoluteNotes);

    expect(result.source).toBe("local-model");
    expect(chordNotes.some((note) => note.note === 61)).toBe(true);
    expect(chordNotes.some((note) => note.note === 70)).toBe(true);
    expect(chordNotes.some((note) => note.note === 73)).toBe(true);
  });

  it("does not loop-fill sparse ambient support rests declared in tracker headers", async () => {
    const input = {
      density: 0.2,
      genre: "Ambient",
      lengthBars: 8,
      mood: "Sparse",
      scaleKey: "C Major",
    };
    const rawTracker = [
      buildFallbackTracker(input),
      "#TRK:Model Lane 4,CH:5,PG:89,ROLE:support,LANE:texture,FUNCTION:short-bloom-rest",
      "[0,72,48,960][960,76,44,960]",
    ].join("\n");
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const supportTrack = parseDeltaTickTracker(result.rawTracker).tracks.find((track) => track.name === "Model Lane 4");

    expect(result.source).toBe("local-model");
    expect(supportTrack).toBeDefined();
    expect(supportTrack?.notes).toHaveLength(2);
    expect(supportTrack ? trackEndTick(supportTrack) : 0).toBeLessThan(GENERATOR_MIDI_TICKS_PER_QUARTER * 8);
  });

  it("keeps passed baseline over tied or lower creative massage", () => {
    const baseline = qualityFixture(100);

    expect(shouldKeepMassagedModel(baseline, qualityFixture(99), styleStatsFixture({
      eventModulatedNotes: 12,
      regeneratedTracks: ["Lead Motif (motif)"],
    }))).toBe(false);
    expect(shouldKeepMassagedModel(baseline, qualityFixture(100), styleStatsFixture({
      eventModulatedNotes: 12,
    }))).toBe(false);
    expect(shouldKeepMassagedModel(baseline, qualityFixture(100), styleStatsFixture({
      quantizedNotes: 12,
    }))).toBe(true);
  });

  it("repairs missing drum fills at each four-bar phrase boundary", async () => {
    const input = { genre: "House", lengthBars: 8 };
    const composition = parseDeltaTickTracker(buildFallbackTracker(input));
    const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * 4;
    const rawTracker = trackerFromComposition({
      ...composition,
      tracks: composition.tracks.map((track) => track.drums
        ? {
            ...track,
            notes: deltaNotes(absoluteNotes(track).filter((note) => !(note.tick >= barTicks * 3 + GENERATOR_MIDI_TICKS_PER_QUARTER * 3 && note.tick < barTicks * 4))),
          }
        : track),
    });
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);
    const drumNotes = parseDeltaTickTracker(result.rawTracker).tracks.filter((track) => track.drums).flatMap(absoluteNotes);
    const phraseWindows = [
      { end: barTicks * 4, start: barTicks * 3 + GENERATOR_MIDI_TICKS_PER_QUARTER * 3 },
      { end: barTicks * 8, start: barTicks * 7 + GENERATOR_MIDI_TICKS_PER_QUARTER * 3 },
    ];

    expect(result.source).toBe("local-model");
    expect(phraseWindows.every((window) => drumNotes.filter((note) => note.tick >= window.start && note.tick < window.end).length >= 3)).toBe(true);
  });

  it("logs and repairs model tracks that end before the selected length", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: buildFallbackTracker({ lengthBars: 4 }),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({ lengthBars: 16 }, { onLog: (line) => logs.push(line) });
    const loopEnd = GENERATOR_MIDI_TICKS_PER_QUARTER * 64;

    expect(result.source).toBe("local-model");
    expect(logs.join("\n")).toContain("repaired");
    expect(logs.join("\n")).not.toContain("coverage ");
    expect(result.tracks.map(trackEndTick).every((endTick) => endTick >= loopEnd - GENERATOR_MIDI_TICKS_PER_QUARTER)).toBe(true);
  });
});
