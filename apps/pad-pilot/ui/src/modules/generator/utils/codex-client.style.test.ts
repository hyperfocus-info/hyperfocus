import { afterEach, describe, expect, it } from "bun:test";
import {
  buildFallbackTracker,
  buildGeneratorIntentPlan,
  buildMusicianPlan,
  generateMidiTemplate,
  inferStyleDna,
  parseDeltaTickTracker,
  scoreGeneratorComposition,
  validateGeneratorStyleFit,
} from "./codex-client";
import {
  withDenseFirstTrackClusters,
  restoreCodexClientTestEnvironment,
} from "./codex-client.test-helpers";

describe("codex client style", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("uses sparse style DNA as a harmonic ceiling for over-extended model chords", async () => {
    const input = {
      creativity: 0.94,
      density: 0.82,
      genre: "UK Drill",
      lengthBars: 8,
      mood: "Dark",
    };
    const logs: string[] = [];
    globalThis.fetch = ((async () => new Response(JSON.stringify({
      response: withDenseFirstTrackClusters(buildFallbackTracker(input)),
    }))) as unknown) as typeof fetch;

    const result = await generateMidiTemplate(input, { onLog: (line) => logs.push(line) });
    const parsed = parseDeltaTickTracker(result.rawTracker);
    const plan = buildMusicianPlan(input, result.selectedMode);
    const quality = scoreGeneratorComposition(parsed, plan, 8);

    expect(result.source).toBe("local-model");
    expect(quality.metrics.maxChordCluster).toBeLessThanOrEqual(plan.quality.maxChordClusterSize);
    expect(logs.join("\n")).toContain("harmonic ceiling");
    expect(logs.join("\n")).toMatch(/stripped|regenerated lanes/);
  });

  it("lets sparse ambient plans pass with one bass role and fewer lanes", () => {
    const input = {
      complexity: "Minimal Draft",
      density: 0.25,
      genre: "Ambient",
      lengthBars: 8,
      mood: "Sparse",
    };
    const plan = buildMusicianPlan(input, "Dorian");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const quality = scoreGeneratorComposition(parsed, plan, 8);
    const trackNames = parsed.tracks.map((track) => track.name).join("\n");

    expect(plan.layers.minTracks).toBeLessThan(6);
    expect(plan.quality.minBassRoles).toBe(1);
    expect(parsed.tracks.length).toBeLessThan(6);
    expect(quality.metrics.bassRoles).toBe(1);
    expect(quality.passed).toBe(true);
    expect(trackNames).not.toMatch(/808 Sub Bass.*Offbeat Pulse/s);
  });

  it("routes typed dance punk and new wave through their own style DNA", () => {
    const dancePunk = inferStyleDna({ genre: "Dance Punk" });
    const newWave = inferStyleDna({ genre: "New Wave" });
    const dancePunkNames = parseDeltaTickTracker(buildFallbackTracker({ genre: "Dance Punk" })).tracks.map((track) => track.name).join("\n");

    expect(dancePunk.instrumentDialect.join(" ")).toMatch(/guitar|riff|accents/i);
    expect(dancePunkNames).toMatch(/Guitar|Indie|Shoegaze|Math Rock/i);
    expect(newWave.instrumentDialect.join(" ")).toContain("Juno/analog pad colors");
    expect(newWave.instrumentDialect.join(" ")).not.toContain("drop-ready one-shots");
  });

  it("musician plan maps existing knobs into harmony, layer, and counterline policy", () => {
    const plan = buildMusicianPlan({
      complexity: "Complex Polyphonic",
      creativity: 0.86,
      density: 0.82,
      genre: "Neo Soul",
      humanize: 0.68,
      lengthBars: 8,
      temperature: 0.78,
    }, "Dorian");

    expect(plan.harmony.chordLanguage).toBe("extended");
    expect(plan.harmony.extensions).toContain("13");
    expect(plan.layers.required).toContain("countermelody");
    expect(plan.layers.required).toContain("riff layer");
    expect(plan.quality.phraseFillRequired).toBe(true);
  });

  it("keeps high-creativity drill triad-first with narrow voice leading", () => {
    const plan = buildMusicianPlan({
      creativity: 0.95,
      density: 0.82,
      genre: "Drill",
      mood: "Dark",
    }, "Natural Minor");

    expect(plan.harmony.chordLanguage).toBe("triads");
    expect(plan.harmony.changesPerFourBars).toBe(2);
    expect(plan.harmony.rootless).toBe(false);
    expect(plan.harmony.voicingRange).toBe("narrow");
  });

  it("infers style DNA for unsupported typed genre names", () => {
    const dna = inferStyleDna({
      complexity: "Riff Based",
      creativity: 0.92,
      density: 0.8,
      genre: "UK Drill",
      mood: "Menacing",
    });
    const plan = buildMusicianPlan({
      complexity: "Riff Based",
      creativity: 0.92,
      density: 0.8,
      genre: "UK Drill",
      mood: "Menacing",
    }, "Phrygian");

    expect(dna.bassRole).toBe("808-lead");
    expect(dna.densityBudget).toBe("space");
    expect(dna.harmonicDensity).toBe("sparse");
    expect(dna.melodicRole).toBe("riff");
    expect(plan.harmony.chordLanguage).toBe("triads");
    expect(plan.harmony.voicingRange).toBe("narrow");
  });

  it("keeps plain high-creativity trap simple but lets melodic trap use extensions", () => {
    const plainTrap = buildMusicianPlan({
      creativity: 0.94,
      density: 0.74,
      genre: "Modern Trap",
      mood: "Heavy",
    }, "Natural Minor");
    const melodicTrap = buildMusicianPlan({
      creativity: 0.94,
      density: 0.74,
      genre: "Modern Trap",
      mood: "Dreamy",
      notes: "melodic atmospheric hook",
    }, "Natural Minor");

    expect(plainTrap.harmony.chordLanguage).toBe("triads");
    expect(plainTrap.harmony.voicingRange).toBe("narrow");
    expect(melodicTrap.harmony.chordLanguage).toBe("extended");
    expect(melodicTrap.harmony.extensions).toContain("11");
  });

  it("keeps happy pop straightforward unless the user asks for harmony-forward writing", () => {
    const happyPop = buildMusicianPlan({
      creativity: 0.94,
      density: 0.62,
      genre: "Synth Pop",
      mood: "Happy",
    }, "Major");
    const harmonyPop = buildMusicianPlan({
      complexity: "Harmony Forward",
      creativity: 0.66,
      density: 0.62,
      genre: "Synth Pop",
      mood: "Happy",
    }, "Major");

    expect(happyPop.harmony.chordLanguage).toBe("triads");
    expect(happyPop.harmony.changesPerFourBars).toBe(4);
    expect(happyPop.harmony.rootless).toBe(false);
    expect(harmonyPop.harmony.chordLanguage).toBe("sevenths");
  });

  it("gives gospel and jazz-family selections dense wide-range harmony natively", () => {
    const plan = buildMusicianPlan({
      creativity: 0.42,
      density: 0.58,
      genre: "Gospel",
      mood: "Uplifting",
    }, "Mixolydian");

    expect(plan.harmony.chordLanguage).toBe("extended");
    expect(plan.harmony.changesPerFourBars).toBe(8);
    expect(plan.harmony.extensions).toContain("13");
    expect(plan.harmony.rootless).toBe(true);
    expect(plan.harmony.voicingRange).toBe("wide");
    expect(plan.quality.minChordClusterSize).toBe(5);
  });

  it("uses genre and mood DNA for blank scale selection only", async () => {
    globalThis.fetch = ((async () => {
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    const gospel = await generateMidiTemplate({
      genre: "Gospel",
      mood: "Joyful",
    });
    const explicit = await generateMidiTemplate({
      genre: "Gospel",
      mood: "Joyful",
      scaleKey: "Minor Pentatonic",
    });

    expect(["Major Pentatonic", "Mixolydian", "Major", "Blues"]).toContain(gospel.selectedMode);
    expect(explicit.selectedMode).toBe("Minor Pentatonic");
  });

  it("rejects drill output that has no drum lane", () => {
    const input = { genre: "Drill", lengthBars: 8 } as const;
    const plan = buildMusicianPlan(input, "Natural Minor");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const withoutDrums = {
      ...parsed,
      tracks: parsed.tracks.filter((track) => !track.drums),
    };
    const quality = scoreGeneratorComposition(
      withoutDrums,
      plan,
      8,
      undefined,
      buildGeneratorIntentPlan(input, "Natural Minor", "C Natural Minor", 8, plan),
    );

    expect(quality.passed).toBe(false);
    expect(quality.reasons).toContain("missing required drum groove identity");
  });

  it("respects an explicit no-drums constraint over the drill style default", () => {
    const input = { genre: "Drill", lengthBars: 8, notes: "NO DRUMS, use harp and no 808" } as const;
    const plan = buildMusicianPlan(input, "Natural Minor");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const quality = scoreGeneratorComposition(
      parsed,
      plan,
      8,
      undefined,
      buildGeneratorIntentPlan(input, "Natural Minor", "C Natural Minor", 8, plan),
    );

    expect(quality.reasons).not.toContain("missing required drum groove identity");
  });

  it("rejects ambient output with busy phrase-fill percussion", () => {
    const input = { genre: "Ambient", lengthBars: 8 } as const;
    const plan = buildMusicianPlan(input, "Dorian");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const houseDrums = parseDeltaTickTracker(buildFallbackTracker({ genre: "House", lengthBars: 8 }))
      .tracks.find((track) => track.drums);
    expect(houseDrums).toBeDefined();
    const busy = {
      ...parsed,
      tracks: [...parsed.tracks, houseDrums!],
    };
    const quality = scoreGeneratorComposition(
      busy,
      plan,
      8,
      undefined,
      buildGeneratorIntentPlan(input, "Dorian", "C Dorian", 8, plan),
    );

    expect(quality.passed).toBe(false);
    expect(quality.reasons).toContain("ambient phrase-fill activity conflicts with negative space");
  });

  it("rejects competing House and Neo Soul bass lanes and excessive pitched density", () => {
    for (const genre of ["House", "Neo Soul"] as const) {
      const input = { density: 0.9, genre, lengthBars: 8 } as const;
      const plan = buildMusicianPlan(input, "Dorian");
      const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
      const bass = parsed.tracks.find((track) => /bass|808|sub/i.test(track.name));
      expect(bass).toBeDefined();
      const overloaded = {
        ...parsed,
        tracks: [
          ...parsed.tracks,
          { ...bass!, name: `${bass!.name} Competing Double` },
          ...parsed.tracks.filter((track) => !track.drums).map((track) => ({ ...track, name: `${track.name} Dense Double` })),
        ],
      };
      const quality = scoreGeneratorComposition(
        overloaded,
        plan,
        8,
        undefined,
        buildGeneratorIntentPlan(input, "Dorian", "C Dorian", 8, plan),
      );

      expect(quality.passed).toBe(false);
      expect(quality.reasons.some((reason) => reason.startsWith(`${genre === "House" ? "house" : "neo-soul"} competing bass lanes`))).toBe(true);
      expect(quality.reasons.some((reason) => reason.startsWith(`${genre === "House" ? "house" : "neo-soul"} note density`))).toBe(true);
    }
  });

  it("requires Amapiano log-drum bass and interlocking percussion identities", () => {
    const input = { genre: "Amapiano", lengthBars: 8 } as const;
    const plan = buildMusicianPlan(input, "Dorian");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const genericized = {
      ...parsed,
      tracks: parsed.tracks.map((track) => track.drums
        ? {
            ...track,
            name: "Straight Kit",
            notes: track.notes.map((note, index) => ({ ...note, note: index % 2 === 0 ? 36 : 38 })),
          }
        : /log.?drum|amapiano|durban/i.test(track.name)
          ? { ...track, name: "Deep Bass" }
          : track),
    };
    const quality = scoreGeneratorComposition(
      genericized,
      plan,
      8,
      undefined,
      buildGeneratorIntentPlan(input, "Dorian", "C Dorian", 8, plan),
    );

    expect(quality.passed).toBe(false);
    expect(quality.reasons).toContain("missing log-drum bass identity");
    expect(quality.reasons).toContain("missing interlocking percussion identity");
  });

  it("passes style-aware fallback fixtures for the audited producer styles", () => {
    for (const input of [
      { genre: "Drill", lengthBars: 8 },
      { genre: "Ambient", lengthBars: 8 },
      { genre: "House", lengthBars: 8 },
      { genre: "Neo Soul", lengthBars: 8 },
      { genre: "Amapiano", lengthBars: 8 },
    ] as const) {
      const plan = buildMusicianPlan(input);
      const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
      const styleQuality = validateGeneratorStyleFit(
        parsed,
        buildGeneratorIntentPlan(input, undefined, undefined, 8, plan),
        8,
      );

      expect(styleQuality.reasons).toEqual([]);
      expect(styleQuality.deductions).toBe(0);
    }
  });
});
