import { z } from "zod";
import { afterEach, describe, expect, it } from "bun:test";
import { buildFallbackTracker } from "./generator-fallback";
import { buildGeneratorPromptEnvelope } from "./generator-prompt";
import { generateMidiTemplate } from "./generator-client";
import { parseDeltaTickTracker } from "./generator-tracker";
import {
  GENERATOR_MIDI_TICKS_PER_QUARTER,
} from "./midi-encoder";
import {
  firstTrackEndTick,
  withoutTracks,
  structuredEnvelopeResponse,
  restoreCodexClientTestEnvironment,
} from "./codex-client.test-helpers";

describe("codex client client", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("propagates caller cancellation instead of building a fallback", async () => {
    const controller = new AbortController();
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async (_input: RequestInfo | URL, init?: RequestInit) => {
      controller.abort(new DOMException("superseded", "AbortError"));
      throw init?.signal?.reason;
    })), { preconnect() {} });

    await expect(generateMidiTemplate({}, {
      onLog: (line) => logs.push(line),
      signal: controller.signal,
    })).rejects.toThrow("superseded");
    expect(logs.some((line) => line.startsWith("fallback"))).toBe(false);
  });

  it("uses local model responses when available", async () => {
    let requestBody = "";
    globalThis.fetch = Object.assign(((async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        response: buildFallbackTracker({}),
      }));
    })), { preconnect() {} });

    const result = await generateMidiTemplate({});

    expect(result.source).toBe("local-model");
    expect(result.tracks.length).toBeGreaterThanOrEqual(4);
    const request = z.object({ model: z.string(), prompt: z.string(), provider: z.string() }).passthrough().parse(JSON.parse(requestBody));
    expect(request).toMatchObject({
      model: "5.5 low fast",
      provider: "cursor",
      responseSchemaName: "generator-model-envelope-v1",
    });
    expect(request).toHaveProperty("responseSchema");
    expect(request.prompt).toContain("Scale/Mode:");
    expect(request.prompt).not.toContain("Scale/Key:");
    expect(request.prompt).toContain("Scale/Mode: A Dorian");
    expect(request.prompt).toContain("Mode Only: Dorian");
    expect(request.prompt).toContain("Length Bars: 4");
    expect(request.prompt).toContain("Selector Tags:");
    expect(request.prompt).toContain("Intent Tags:");
    expect(request.prompt).toContain("!TAGS:THEME=");
    expect(request.prompt).toContain("!PLAN:STYLE=");
    expect(request.prompt).toContain("!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!");
    expect(request.prompt).toContain("Musician Plan:");
    expect(request.prompt).toContain("Quality Gate:");
    expect(request.prompt).toContain("Layer budget:");
    expect(request.prompt).not.toContain("No fixed track cap");
    expect(request.prompt).not.toContain("three bass role lanes");
    expect(request.prompt).not.toContain("Build 3-5");
    expect(result.selectedKey).toBe("A");
    expect(result.selectedMode).toBe("Dorian");
    expect(result.selectedScale).toBe("A Dorian");
    expect(result.lengthBars).toBe(4);
  });

  it("accepts a structured model envelope with tracker text", async () => {
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(buildFallbackTracker({ genre: "Lofi" }), {
      confidence: 0.91,
      repairAvoided: ["kept model groove"],
      validationNotes: ["tracker grammar checked"],
    }))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" });

    expect(result.source).toBe("local-model");
    expect(result.rawTracker).toContain("!SCHEMA:generator-model-envelope-v1;GRAMMAR=delta-tracker-v2!");
    expect(result.rawTracker).toContain("!PLAN:");
    expect(result.rawTracker).toContain("!TAGS:");
    expect(result.audit?.modelEnvelope?.validationNotes).toEqual(["tracker grammar checked"]);
    expect(result.audit?.modelEnvelope?.repairAvoided).toEqual(["kept model groove"]);
    expect(result.audit?.validationReport?.schemaVersion).toBe("generator-model-envelope-v1");
  });

  it("rejects structured envelopes missing schema-required planning fields", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: JSON.stringify({
        confidence: 0.91,
        grammarVersion: "delta-tracker-v2",
        repairAvoided: [],
        schemaVersion: "generator-model-envelope-v1",
        tracker: buildFallbackTracker({ genre: "Lofi" }),
        validationNotes: [],
      }),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("arrangementPlan missing");
    expect(result.audit?.modelFailure?.reason).toContain("arrangementPlan missing");
  });

  it("rejects structured envelopes with partial nested planning fields", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(buildFallbackTracker({ genre: "Lofi" }), {
      groovePlan: {
        grid: "half-time",
      },
    }))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("groovePlan missing");
    expect(result.audit?.modelFailure?.reason).toContain("groovePlan missing");
  });

  it("preserves structured planning envelope diagnostics in the audit", async () => {
    const arrangementPlan = {
      bass: "808-lead",
      confidence: 0.93,
      form: "starter-turnaround",
      grid: "half-time",
      motif: "riff",
      phraseFunction: "statement-answer",
      roles: ["drum groove", "chord comp", "808 lead", "lead motif"],
      style: "drill",
    };
    const lanePlan = [
      { bassRole: "", function: "kick-snare anchors", lane: "drums", name: "Model Lane A", role: "drum groove" },
      { bassRole: "808 lead", function: "slides resolve to roots", lane: "bass", name: "Model Lane C", role: "808 lead" },
    ];
    const groovePlan = {
      anchors: ["kick one", "snare three"],
      grid: "half-time",
      microtiming: "late hats, centered kick/snare",
      rhythmCell: "3+3+2 answers",
      swing: "tight",
    };
    const chordPlan = [
      {
        bar: 1,
        bassRelation: "root",
        function: "i with resolved +1 upper tension",
        inversion: "root",
        quality: "minor add b2",
        resolutionTarget: "C",
        roman: "i(add b2 resolve)",
        root: "C",
        tensionClass: "drill +1 chord tension",
        topNoteIntent: "resolve up",
        voicingRange: "low-mid",
      },
    ];
    const harmonicTolerancePolicy = {
      absoluteWrong: ["unresolved melody outside scale", "strong beat bass outside scale"],
      allowedTensions: ["drill +1 chord tension", "diminished passing"],
      avantAllowed: [],
      fixingFactor: 0.12,
      mode: "tension",
      source: "fixture",
    };
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(buildFallbackTracker({ genre: "Drill" }), {
      arrangementPlan,
      chordPlan,
      groovePlan,
      harmonicTolerancePolicy,
      lanePlan,
    }))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Drill" });

    expect(result.source).toBe("local-model");
    expect(result.audit?.modelEnvelope).toMatchObject({
      arrangementPlan: {
        bass: "808-lead",
        confidence: 0.93,
        phraseFunction: "statement-answer",
        roles: ["drum-groove", "chord-comp", "808-lead", "lead-motif"],
        style: "drill",
      },
      chordPlan: [
        {
          bar: 1,
          resolutionTarget: "C",
          tensionClass: "drill-+1-chord-tension",
        },
      ],
      groovePlan: {
        grid: "half-time",
        microtiming: "late hats, centered kick/snare",
      },
      harmonicTolerancePolicy: {
        allowedTensions: ["drill +1 chord tension", "diminished passing"],
        mode: "tension",
        source: "fixture",
      },
      lanePlan: [
        { function: "kick-snare-anchors", lane: "drums", name: "Model Lane A", role: "drum-groove" },
        { bassRole: "808-lead", function: "slides-resolve-to-roots", lane: "bass", name: "Model Lane C", role: "808-lead" },
      ],
    });
  });

  it("rejects structured envelopes with mismatched grammar before fallback", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: JSON.stringify({
        confidence: 0.91,
        grammarVersion: "delta-tracker-v1",
        repairAvoided: [],
        schemaVersion: "generator-model-envelope-v1",
        tracker: buildFallbackTracker({ genre: "Lofi" }),
        validationNotes: [],
      }),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("grammarVersion mismatch");
    expect(result.audit?.modelFailure?.reason).toContain("grammarVersion mismatch");
  });

  it("repairs and keeps high-scoring local model output instead of falling back", async () => {
    const logs: string[] = [];
    const rawTracker = buildFallbackTracker({ genre: "House", lengthBars: 8 }).replace(/#TRK:[^,\n]*Drums/, "#TRK:Groove Kit");
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: rawTracker,
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "House", lengthBars: 8 }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("local-model");
    expect(logs.join("\n")).toContain("massage gradient");
    expect(logs.join("\n")).toContain("massage quality delta");
    expect(logs.join("\n")).not.toContain("fallback quality gate rejected model output");
  });

  it("rejects thin local model output before exporting it", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: "!BPM:90!\n#TRK:Piano,CH:0,PG:0\n[0,60,90,480]",
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({}, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("quality gate rejected model output");
    expect(result.tracks.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps structured model diagnostics when valid envelopes fall back on quality", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse("!BPM:90!\n#TRK:Piano,CH:0,PG:0\n[0,60,90,480]", {
      validationNotes: ["schema valid but musically thin"],
    }))), { preconnect() {} });

    const result = await generateMidiTemplate({}, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("quality gate rejected model output");
    expect(result.audit?.modelEnvelope?.validationNotes).toEqual(["schema valid but musically thin"]);
    expect(result.audit?.modelValidationReport?.passed).toBe(false);
  });

  it("rejects structured envelopes with schema-forbidden extra fields", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => structuredEnvelopeResponse(buildFallbackTracker({ genre: "Lofi" }), {
      extra: "hallucinated",
    }))), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("additional fields");
  });

  it("uses the Codex CLI dev route when devtools are enabled", async () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "true";
    let requestUrl = "";
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({
        response: buildFallbackTracker({ genre: "Lofi" }),
        source: "codex-cli",
      }));
    })), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(requestUrl).toBe("/api/dev/generator/codex");
    expect(result.source).toBe("codex-cli");
    expect(result.originalModel?.filename).toContain("original-model.mid");
    expect(result.originalModel?.midiData.length).toBeGreaterThan(64);
    expect(result.originalModel?.rawTracker).toContain("#TRK:");
    expect(logs.join("\n")).toContain("dev compare");
    expect(result.tracks.length).toBeGreaterThanOrEqual(4);
  });

  it("logs detailed Codex route errors before falling back", async () => {
    const logs: string[] = [];
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      error: {
        code: "codex_generator_failed",
        message: "Codex CLI exited with 1.\nstderr:\nunexpected argument '--ask-for-approval'",
      },
    }), { status: 502 }))), { preconnect() {} });

    const result = await generateMidiTemplate({}, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(logs.join("\n")).toContain("HTTP 502");
    expect(logs.join("\n")).toContain("codex_generator_failed");
    expect(logs.join("\n")).toContain("unexpected argument '--ask-for-approval'");
  });

  it("keeps Amapiano log drum bass as bass, not a drum lane", async () => {
    globalThis.fetch = Object.assign(((async () => {
      throw new Error("offline");
    })), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Amapiano", lengthBars: 8 });
    const logDrumBass = result.tracks.find((track) => /log drum bass/i.test(track.name));

    expect(result.source).toBe("fallback");
    expect(logDrumBass).toBeDefined();
    expect(logDrumBass?.drums).toBe(false);
  });

  it("falls back instead of inventing a drum lane for drumless Drill model output", async () => {
    const input = { genre: "Drill", lengthBars: 8 } as const;
    const rawTracker = withoutTracks(buildFallbackTracker(input), /drum|kit|perc|groove/i);
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({ response: rawTracker })))), { preconnect() {} });

    const result = await generateMidiTemplate(input);

    expect(result.source).toBe("fallback");
    expect(result.audit?.modelFailure?.reason).toContain("missing required drum groove identity");
    expect(result.audit?.modelValidationReport?.metrics.style.requirements).toContain("drum-groove");
    expect(result.audit?.modelValidationReport?.metrics.style.deductions).toBe(12);
    expect(result.tracks.some((track) => track.drums)).toBe(true);
  });

  it("keeps explicit user notes ahead of selector tags and obeys no-drums no-808 hints", () => {
    const input = {
      complexity: "Strummed Comping",
      density: 0.8,
      genre: "Drill",
      lengthBars: 8,
      mood: "Dark",
      notes: "NO DRUMS use harp and no 808",
    };
    const envelope = buildGeneratorPromptEnvelope(input);
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(envelope.intentPlan.tags.raw.slice(0, 4)).toEqual([
      "no-808",
      "no-drums",
      "no-drums-use-harp-and-no-808",
      "808-slide-pocket",
    ]);
    expect(envelope.intentPlan.tags.all).toContain("harp");
    expect(envelope.intentPlan.tags.all).toContain("no-drums");
    expect(envelope.intentPlan.tags.all).toContain("no-808");
    expect(envelope.intentPlan.tags.avoid.join("\n")).toContain("avoid adding drums");
    expect(names).toMatch(/Harp/);
    expect(names).not.toMatch(/Drums|808|Sub Glide/i);
  });

  it("default fallback export ends on the four-bar boundary", async () => {
    globalThis.fetch = Object.assign(((async () => {
      throw new Error("offline");
    })), { preconnect() {} });

    const result = await generateMidiTemplate({});

    expect(result.filename).toMatch(/^generator-\d+-a-dorian-[a-z0-9]+-combined\.mid$/);
    expect(firstTrackEndTick(result.combinedMidi)).toBe(GENERATOR_MIDI_TICKS_PER_QUARTER * 16);
    expect(result.trackFiles.map((trackFile) => firstTrackEndTick(trackFile.midiData))).toEqual(
      Array.from({ length: result.trackFiles.length }, () => GENERATOR_MIDI_TICKS_PER_QUARTER * 16),
    );
  });

  it("ends fallback exports at the selected length boundary", async () => {
    globalThis.fetch = Object.assign(((async () => {
      throw new Error("offline");
    })), { preconnect() {} });

    const result = await generateMidiTemplate({ genre: "Cinematic", lengthBars: 8 });

    expect(result.lengthBars).toBe(8);
    expect(firstTrackEndTick(result.combinedMidi)).toBe(GENERATOR_MIDI_TICKS_PER_QUARTER * 32);
  });

  it("truncates local model exports to the selected length boundary", async () => {
    globalThis.fetch = Object.assign(((async () => new Response(JSON.stringify({
      response: [
        buildFallbackTracker({ lengthBars: 2 }),
        "#TRK:Long Pad,CH:11,PG:89",
        "[0,60,90,60000][60000,64,90,480]",
      ].join("\n"),
    })))), { preconnect() {} });

    const result = await generateMidiTemplate({ lengthBars: 2 });

    expect(result.source).toBe("local-model");
    expect(firstTrackEndTick(result.combinedMidi)).toBe(GENERATOR_MIDI_TICKS_PER_QUARTER * 8);
  });

  it("includes the chosen key and mode in generated filenames", async () => {
    globalThis.fetch = Object.assign(((async () => {
      throw new Error("offline");
    })), { preconnect() {} });

    const result = await generateMidiTemplate({ scaleKey: "F# Major Pentatonic" });

    expect(result.selectedScale).toBe("F# Major Pentatonic");
    expect(result.filename).toMatch(/^generator-\d+-f-sharp-major-pentatonic-[a-z0-9]+-combined\.mid$/);
    expect(result.trackFiles.every((trackFile) => trackFile.filename.includes("f-sharp-major-pentatonic"))).toBe(true);
  });
});
