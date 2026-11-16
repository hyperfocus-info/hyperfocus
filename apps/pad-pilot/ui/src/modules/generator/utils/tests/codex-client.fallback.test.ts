import { afterEach, describe, expect, it } from "bun:test";
import { buildFallbackTracker } from "../generator-fallback";
import { buildMusicianPlan } from "../generator-prompt";
import { generateMidiTemplate } from "../generator-client";
import { parseDeltaTickTracker, scoreGeneratorComposition } from "../generator-tracker";
import {
  GENERATOR_MIDI_TICKS_PER_QUARTER,
} from "../midi-encoder";
import {
  compositionEndTick,
  absoluteNotes,
  restoreCodexClientTestEnvironment,
} from "../codex-client.test-helpers";

describe("codex client fallback", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("builds a playable fallback tracker with combined and separate MIDI files", async () => {
    globalThis.fetch = Object.assign(((async () => {
      throw new Error("offline");
    })), { preconnect() {} });

    const logs: string[] = [];
    const result = await generateMidiTemplate({ mood: "Chill", genre: "Lofi" }, { onLog: (line) => logs.push(line) });

    expect(result.source).toBe("fallback");
    expect(result.bpm).toBe(88);
    expect(result.selectedKey).toBe("D");
    expect(result.selectedMode).toBe("Major Pentatonic");
    expect(result.selectedScale).toBe("D Major Pentatonic");
    expect(result.filename).toMatch(/^generator-88-d-major-pentatonic-[a-z0-9]+-combined\.mid$/);
    expect(result.combinedMidi.length).toBeGreaterThan(64);
    expect(result.trackFiles.length).toBe(result.tracks.length);
    expect(logs.some((line) => line.startsWith("fallback"))).toBe(true);
  });

  it("fallback tracker keeps drums on zero-indexed channel 9", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({ genre: "Liquid Drum & Bass" }));

    expect(parsed.tracks.find((track) => /drums/i.test(track.name))?.channel).toBe(9);
  });

  it("fallback tracker changes instrument palette from style fields", () => {
    const synthwave = parseDeltaTickTracker(buildFallbackTracker({
      era: "80s Analog",
      genre: "Synthwave",
      mood: "Nostalgic",
    }));
    const blues = parseDeltaTickTracker(buildFallbackTracker({
      era: "70s Studio",
      genre: "Blues",
      mood: "Smoky",
    }));

    expect(synthwave.tracks.map((track) => track.name)).not.toEqual(blues.tracks.map((track) => track.name));
    expect(synthwave.tracks.some((track) => /synth|drum/i.test(track.name))).toBe(true);
    expect(blues.tracks.some((track) => /organ|guitar|sax|drums/i.test(track.name))).toBe(true);
    expect(blues.bpm).toBe(96);
  });

  it("keeps mood-only Happy out of gospel and soul fallback instrumentation", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      lengthBars: 4,
      mood: "Happy",
    }));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(names).toContain("Pop");
    expect(names).not.toMatch(/Gospel|Soul|Harmonica|Tenor Sax|Drawbar Organ/);
  });

  it("keeps mood-only Earthy out of regional fallback instrumentation", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      lengthBars: 4,
      mood: "Earthy",
    }));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(names).not.toMatch(/Afrobeat|Dancehall|Kalimba|Pan Flute|World Pad|Bossa|Salsa|Samba|Cumbia|Clave|Nylon|Marimba/);
  });

  it("keeps dancehall fallback distinct from reggaeton naming", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      genre: "Dancehall",
      lengthBars: 4,
    }));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(names).toMatch(/One Drop|Island|Skank|Melodica|Organ/);
    expect(names).not.toMatch(/Reggaeton/i);
  });

  it("keeps explicit genre tags stronger than mood shade tags in fallback palette scoring", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      genre: "Indie Dance",
      lengthBars: 4,
      mood: "Happy",
    }));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(names).toMatch(/Guitar|Indie/);
    expect(names).not.toContain("Pop");
  });

  it("routes Folk Electronic through the folk palette instead of the global percussion bucket", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      genre: "Folk Electronic",
      lengthBars: 4,
    }));
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(names).toMatch(/Guitar|Indie|Shoegaze|Feedback/);
    expect(names).not.toMatch(/Shakuhachi|Pan Flute|Dancehall/);
  });

  it("does not infer drum and bass tempo from loose drum plus bass words", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      genre: "Funk",
      notes: "tight drum kit with bass guitar groove",
    }));

    expect(parsed.bpm).toBe(96);
  });

  it("fallback tracker writes musical material through the fourth bar", () => {
    expect(compositionEndTick(buildFallbackTracker({}))).toBe(GENERATOR_MIDI_TICKS_PER_QUARTER * 16);
  });

  it("fallback output passes the musician quality gate with extensions, riffs, and counterlines", () => {
    const input = {
      complexity: "Complex Polyphonic",
      creativity: 0.86,
      density: 0.82,
      genre: "Neo Soul",
      humanize: 0.68,
      lengthBars: 8,
      temperature: 0.78,
    };
    const plan = buildMusicianPlan(input, "Dorian");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const quality = scoreGeneratorComposition(parsed, plan, 8);
    const trackNames = parsed.tracks.map((track) => track.name);

    expect(quality.passed).toBe(true);
    expect(quality.metrics.maxChordCluster).toBeGreaterThanOrEqual(5);
    expect(quality.metrics.melodyPhraseScore).toBeGreaterThanOrEqual(3);
    expect(trackNames.some((name) => /guide tone/i.test(name))).toBe(true);
    expect(trackNames.some((name) => /riff layer/i.test(name))).toBe(true);
    expect(trackNames.some((name) => /countermelody/i.test(name))).toBe(true);
  });

  it("fallback drill output avoids dense chord clusters even at high creativity", () => {
    const input = {
      creativity: 0.95,
      density: 0.82,
      genre: "Drill",
      lengthBars: 8,
      mood: "Dark",
    };
    const plan = buildMusicianPlan(input, "Natural Minor");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const quality = scoreGeneratorComposition(parsed, plan, 8);

    expect(quality.passed).toBe(true);
    expect(quality.metrics.maxChordCluster).toBeLessThanOrEqual(3);
  });

  it("fallback inventory follows tags for drill plus woozy city-pop prompt conflicts", () => {
    const input = {
      complexity: "Strummed Comping",
      creativity: 0.8,
      density: 0.68,
      era: "Tokyo City Pop",
      genre: "Drill",
      humanize: 0.06,
      lengthBars: 16,
      mood: "Woozy",
      notes: "pop smoke, simple tense chords, layers, haunting melody, super crazy sliding 808s",
      scaleKey: "Natural Minor",
      temperature: 0.7,
    };
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const plan = buildMusicianPlan(input, "Natural Minor");
    const quality = scoreGeneratorComposition(parsed, plan, 16);
    const names = parsed.tracks.map((track) => track.name).join("\n");

    expect(parsed.bpm).toBe(140);
    expect(quality.passed).toBe(true);
    expect(names).toMatch(/808|drill|trap|haunted|koto|chime/i);
    expect(names).not.toMatch(/clean guitar|electric piano|studio drums|house strobe/i);
  });

  it("fallback catalogue resolves single tag prompts beyond legacy buckets", () => {
    const cases = [
      { input: { genre: "Future Bass" }, names: /supersaw|festival|wave|dubstep/i, bpm: 140 },
      { input: { genre: "Math Rock" }, names: /guitar|math rock|indie|feedback/i, bpm: 116 },
      { input: { genre: "Amapiano" }, names: /log drum|amapiano|durban|kalimba|organ/i, bpm: 112 },
      { input: { genre: "Baile Funk" }, names: /tamborzao|baile|carioca|chant/i, bpm: 130 },
      { input: { genre: "Reggaeton" }, names: /dembow|reggaeton|dancehall/i, bpm: 96 },
      { input: { genre: "Bossa Nova" }, names: /clave|bossa|nylon|montuno|latin/i, bpm: 98 },
      { input: { mood: "Metallic" }, names: /fm|metallic|glitch|industrial|alien|bitcrush/i, bpm: 150 },
    ];

    for (const item of cases) {
      const parsed = parseDeltaTickTracker(buildFallbackTracker(item.input));
      const names = parsed.tracks.map((track) => track.name).join("\n");

      expect(parsed.bpm).toBe(item.bpm);
      expect(names).toMatch(item.names);
      expect(names).not.toMatch(/grand piano|studio drums|clean guitar lead/i);
    }
  });

  it("fallback gospel output creates dense passing-chord clusters", () => {
    const input = {
      creativity: 0.48,
      density: 0.66,
      genre: "Gospel",
      lengthBars: 8,
      mood: "Uplifting",
    };
    const plan = buildMusicianPlan(input, "Mixolydian");
    const parsed = parseDeltaTickTracker(buildFallbackTracker(input));
    const quality = scoreGeneratorComposition(parsed, plan, 8);

    expect(quality.passed).toBe(true);
    expect(quality.metrics.maxChordCluster).toBeGreaterThanOrEqual(5);
  });

  it("fallback House keeps one offbeat bass identity without competing bass lanes", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      complexity: "Syncopated Groove",
      density: 0.82,
      genre: "House",
      lengthBars: 8,
    }));
    const trackNames = parsed.tracks.map((track) => track.name);

    expect(parsed.tracks.length).toBeGreaterThan(5);
    expect(trackNames.some((name) => /offbeat pulse/i.test(name))).toBe(true);
    expect(trackNames.some((name) => /passing movement/i.test(name))).toBe(false);
    expect(trackNames.some((name) => /808 sub bass/i.test(name))).toBe(false);
  });

  it("fallback chord track uses offbeat strummed hits", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      complexity: "Syncopated Groove",
      genre: "House",
      humanize: 0.7,
    }));
    const chordTrack = parsed.tracks[0];
    expect(chordTrack).toBeDefined();
    const ticks = absoluteNotes(chordTrack!).map((note) => note.tick);
    const firstOffbeatChordTicks = ticks.filter((tick) => tick >= 240 && tick < 360);

    expect(ticks.some((tick) => tick % (GENERATOR_MIDI_TICKS_PER_QUARTER * 4) !== 0)).toBe(true);
    expect(new Set(firstOffbeatChordTicks).size).toBeGreaterThan(1);
  });

  it("fallback drums add stronger fills at longer phrase endings", () => {
    const parsed = parseDeltaTickTracker(buildFallbackTracker({
      density: 0.82,
      genre: "House",
      lengthBars: 8,
    }));
    const barTicks = GENERATOR_MIDI_TICKS_PER_QUARTER * 4;
    const drums = parsed.tracks.find((track) => /drums/i.test(track.name));
    expect(drums).toBeDefined();
    const drumNotes = absoluteNotes(drums!);
    const barFourFill = drumNotes.filter((note) => note.tick >= barTicks * 3 + 1440 && note.tick < barTicks * 4);
    const barEightFill = drumNotes.filter((note) => note.tick >= barTicks * 7 + 1440 && note.tick < barTicks * 8);
    const maxBarFourVelocity = Math.max(...barFourFill.map((note) => note.velocity));
    const maxBarEightVelocity = Math.max(...barEightFill.map((note) => note.velocity));

    expect(barFourFill.length).toBeGreaterThan(0);
    expect(barEightFill.length).toBeGreaterThan(0);
    expect(maxBarEightVelocity).toBeGreaterThan(maxBarFourVelocity);
  });

  it("fallback tracker varies arrangement from prompt fields", () => {
    const ambient = buildFallbackTracker({
      complexity: "Minimal Draft",
      genre: "Ambient",
      mood: "Serene",
      scaleKey: "Major",
    });
    const funk = buildFallbackTracker({
      complexity: "Syncopated Groove",
      genre: "Funk",
      mood: "Joyful",
      scaleKey: "Blues",
    });

    expect(ambient).not.toBe(funk);
    expect(parseDeltaTickTracker(ambient).bpm).not.toBe(parseDeltaTickTracker(funk).bpm);
  });
});
