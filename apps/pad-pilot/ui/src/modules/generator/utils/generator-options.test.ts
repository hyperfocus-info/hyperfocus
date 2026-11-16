import { describe, expect, it } from "bun:test";
import { buildGeneratorIntentPromptLines, buildGeneratorSelectorPromptLines, buildGeneratorSelectorState, createEmptyGeneratorFields, normalizeGeneratorIntentTags } from "./generator-selector-options";
import { buildMagicSuggestion, buildRandomSuggestion, resetGeneratorDropdowns } from "./generator-magic-options";
import { DEFAULT_GENERATOR_AI_SETTINGS, DEFAULT_GENERATOR_ADVANCED_SETTINGS, GENERATOR_AI_PROVIDER_OPTIONS, GENERATOR_FIELD_KEYS, GENERATOR_LENGTH_OPTIONS, GENERATOR_OPTION_GROUPS, GENERATOR_OPTION_TOTAL, type GeneratorDashboardFields, type GeneratorFieldKey } from "./generator-option-catalog";
import { GENERATOR_MAGIC_GENRE_PROFILES, resolveMagicSuggestionProfileLabels } from "./generator-magic-profiles";

function emptyFields() {
  return createEmptyGeneratorFields();
}

function fixedRng(value = 0) {
  return () => value;
}

function lcg(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function repeatedSuggestions(input: GeneratorDashboardFields, count: number, chaos: number, seed = 0x12345678) {
  const rng = lcg(seed);
  let avoid: Partial<Record<GeneratorFieldKey, string>> = {};
  return Array.from({ length: count }, () => {
    const suggestion = buildMagicSuggestion(input, {}, { avoid, chaos, rng });
    avoid = {
      complexity: suggestion.complexity,
      era: suggestion.era,
      genre: suggestion.genre,
      mood: suggestion.mood,
      scaleKey: suggestion.scaleKey,
    };
    return suggestion;
  });
}

function profileSignature(label: string) {
  return JSON.stringify(resolveMagicSuggestionProfileLabels("genre", label));
}

function expectDistinctGenreProfiles(labels: readonly string[]) {
  expect(new Set(labels.map(profileSignature)).size).toBe(labels.length);
}

function expectGenrePrimitives(label: string, primitives: readonly string[]) {
  expect(resolveMagicSuggestionProfileLabels("genre", label).complexity).toEqual(expect.arrayContaining([...primitives]));
}

function selectorLinesForGenre(label: string) {
  return buildGeneratorSelectorPromptLines({ genre: label }).join("\n");
}

describe("generator options", () => {
  it("keeps five selector dictionaries evenly split across 500 entries", () => {
    expect(Object.values(GENERATOR_OPTION_GROUPS).map((items) => items.length)).toEqual([100, 100, 100, 100, 100]);
    expect(GENERATOR_OPTION_TOTAL).toBe(500);
  });

  it("keeps scale choices mode-only without key names", () => {
    const modes = GENERATOR_OPTION_GROUPS.scaleKey.map((item) => item.label);

    expect(modes.some((mode) => /^[A-G](?:#|b)?\s/.test(mode))).toBe(false);
    expect(modes).toContain("Minor Pentatonic");
    expect(modes).toContain("Lydian");
    expect(modes).toContain("Blues");
    expect(modes).toContain("Japanese Insen");
    expect(modes).toContain("Maqam Hijaz");
    expect(modes).toContain("Klezmer");
  });

  it("gives every genre at least five valid weighted options in each bucket", () => {
    const genreLabels = GENERATOR_OPTION_GROUPS.genre.map((item) => item.label);

    for (const [genre, profile] of Object.entries(GENERATOR_MAGIC_GENRE_PROFILES)) {
      expect(genreLabels).toContain(genre);
      for (const key of GENERATOR_FIELD_KEYS) {
        const bucketLabels = GENERATOR_OPTION_GROUPS[key].map((item) => item.label);
        expect(profile[key].length).toBeGreaterThanOrEqual(5);
        for (const label of profile[key]) {
          expect(bucketLabels).toContain(label);
        }
      }
    }
  });

  it("resolves at least five valid weighted options for every selectable value", () => {
    for (const selectedKey of GENERATOR_FIELD_KEYS) {
      for (const selectedItem of GENERATOR_OPTION_GROUPS[selectedKey]) {
        const labels = resolveMagicSuggestionProfileLabels(selectedKey, selectedItem.label);
        for (const key of GENERATOR_FIELD_KEYS) {
          const bucketLabels = GENERATOR_OPTION_GROUPS[key].map((item) => item.label);
          expect(labels[key].length).toBeGreaterThanOrEqual(5);
          for (const label of labels[key]) {
            expect(bucketLabels).toContain(label);
          }
        }
      }
    }
  });

  it("fills only empty fields and can vary for the same source input", () => {
    const input = { ...emptyFields(), mood: "Chill" };
    const first = buildMagicSuggestion(input, {}, { rng: lcg(1) });
    const second = buildMagicSuggestion(input, {}, { rng: lcg(2) });

    expect(first.mood).toBe("Chill");
    expect(second.mood).toBe("Chill");
    expect(first.genre.length).toBeGreaterThan(0);
    expect(first.scaleKey.length).toBeGreaterThan(0);
    expect([first.genre, first.era, first.complexity, first.scaleKey]).not.toEqual([second.genre, second.era, second.complexity, second.scaleKey]);
  });

  it("changes empty-field pools from pair interactions instead of mood alone", () => {
    const glitch = buildMagicSuggestion({ ...emptyFields(), genre: "Glitch Hop", mood: "Hypnotic" }, {}, { chaos: 0.15, rng: fixedRng() });
    const blues = buildMagicSuggestion({ ...emptyFields(), genre: "Blues", mood: "Hypnotic" }, {}, { chaos: 0.15, rng: fixedRng() });

    expect(glitch).toMatchObject({
      complexity: "Polyrhythmic",
      era: "LA Beat Scene",
      scaleKey: "Chromatic",
    });
    expect(["Call And Response", "Motif Variation", "Walking Bass"]).toContain(blues.complexity);
    expect(["60s Tape", "70s Studio", "Noir Jazz"]).toContain(blues.era);
    expect(["Blues", "Minor Pentatonic", "Mixolydian"]).toContain(blues.scaleKey);
  });

  it("lets mode color paired suggestions without dominating genre alone", () => {
    const major = buildMagicSuggestion({ ...emptyFields(), complexity: "Call And Response", scaleKey: "Major" }, {}, { chaos: 0.15, rng: fixedRng() });
    const minor = buildMagicSuggestion({ ...emptyFields(), complexity: "Call And Response", scaleKey: "Natural Minor" }, {}, { chaos: 0.15, rng: fixedRng() });

    expect(major).toMatchObject({
      genre: "Gospel",
    });
    expect(["Joyful", "Uplifting", "Hopeful", "Warm"]).toContain(major.mood);
    expect(["Blues", "Boom Bap", "Trip Hop"]).toContain(minor.genre);
    expect(["Smoky", "Melancholic", "Warm", "Bittersweet"]).toContain(minor.mood);
    expect(minor.genre).not.toBe(major.genre);
  });

  it("uses random selection and avoid hints instead of deterministic seed cycling", () => {
    const input = { ...emptyFields(), genre: "Blues", mood: "Hypnotic" };
    const rng = lcg(0x515151);
    const first = buildMagicSuggestion(input, {}, { chaos: 0.15, rng });
    const second = buildMagicSuggestion(input, {}, {
      avoid: {
        complexity: first.complexity,
        era: first.era,
        scaleKey: first.scaleKey,
      },
      chaos: 0.15,
      rng,
    });

    expect(second).not.toEqual(first);
    expect(second).toMatchObject({
      genre: "Blues",
      mood: "Hypnotic",
    });
    expect(second.complexity).not.toBe(first.complexity);
    expect(second.era).not.toBe(first.era);
    expect(second.scaleKey).not.toBe(first.scaleKey);
  });

  it("rerolls Gospel through common combinator buckets even at zero chaos", () => {
    const suggestions = repeatedSuggestions({ ...emptyFields(), genre: "Gospel" }, 24, 0, 0x7777);
    const moods = new Set(suggestions.map((suggestion) => suggestion.mood));
    const eras = new Set(suggestions.map((suggestion) => suggestion.era));
    const complexities = new Set(suggestions.map((suggestion) => suggestion.complexity));

    expect(moods.size).toBeGreaterThanOrEqual(6);
    expect([...moods]).toEqual(expect.arrayContaining(["Warm", "Uplifting", "Celebratory", "Devotional"]));
    expect([...eras]).toEqual(expect.arrayContaining(["70s Studio", "60s Tape", "New Jack Swing"]));
    expect([...complexities]).toEqual(expect.arrayContaining(["Call And Response", "Three Voice Harmony", "Release Cadence"]));
  });

  it("flattens bucket weighting as chaos rises", () => {
    const gospelMoods = new Set(resolveMagicSuggestionProfileLabels("genre", "Gospel").mood);
    const lowChaosMoods = new Set(repeatedSuggestions({ ...emptyFields(), genre: "Gospel" }, 24, 0, 0x1010).map((suggestion) => suggestion.mood));
    const highChaosMoods = new Set(repeatedSuggestions({ ...emptyFields(), genre: "Gospel" }, 48, 1, 0x1010).map((suggestion) => suggestion.mood));

    expect([...lowChaosMoods].every((mood) => gospelMoods.has(mood))).toBe(true);
    expect([...highChaosMoods].some((mood) => !gospelMoods.has(mood))).toBe(true);
  });

  it("does not pin Acid Jazz to Warm at high chaos", () => {
    const suggestions = repeatedSuggestions({ ...emptyFields(), genre: "Acid Jazz" }, 24, 0.79, 0xaaaa);
    const moods = suggestions.map((suggestion) => suggestion.mood);

    expect(moods.filter((mood) => mood === "Warm").length).toBeLessThan(4);
    expect(new Set(moods).size).toBeGreaterThanOrEqual(12);
    expect(moods.some((mood) => !resolveMagicSuggestionProfileLabels("genre", "Acid Jazz").mood.includes(mood))).toBe(true);
  });

  it("spreads repeated suggestions across genre, mood, and paired buckets", () => {
    const scenarios: Array<{ chaos: number; fields: Partial<Record<GeneratorFieldKey, string>>; seed: number }> = [
      { chaos: 0, fields: { genre: "Gospel" }, seed: 0x1001 },
      { chaos: 0, fields: { mood: "Gritty" }, seed: 0x1002 },
      { chaos: 0.35, fields: { genre: "Gospel", mood: "Dark" }, seed: 0x1003 },
      { chaos: 0.35, fields: { genre: "Gospel", mood: "Haunted" }, seed: 0x1004 },
      { chaos: 0.85, fields: { genre: "Acid Jazz" }, seed: 0x1005 },
    ];

    for (const scenario of scenarios) {
      const sourceKeys = new Set(Object.keys(scenario.fields));
      const targetKeys = GENERATOR_FIELD_KEYS.filter((key) => !sourceKeys.has(key));
      const suggestions = repeatedSuggestions({ ...emptyFields(), ...scenario.fields }, 24, scenario.chaos, scenario.seed);
      const signatures = new Set(suggestions.map((suggestion) => targetKeys.map((key) => suggestion[key]).join("|")));

      expect(signatures.size).toBeGreaterThanOrEqual(16);
      for (const key of targetKeys) {
        const values = suggestions.map((suggestion) => suggestion[key]);
        expect(new Set(values).size).toBeGreaterThanOrEqual(4);
        for (let index = 1; index < values.length; index += 1) {
          expect(values[index]).not.toBe(values[index - 1]);
        }
      }
    }
  });

  it("combines selected buckets instead of using genre alone", () => {
    const gospel = buildMagicSuggestion({ ...emptyFields(), genre: "Gospel" }, {}, { chaos: 0, rng: fixedRng() });
    const darkGospel = buildMagicSuggestion({ ...emptyFields(), genre: "Gospel", mood: "Dark" }, {}, { chaos: 0, rng: fixedRng() });
    const hauntedGospel = buildMagicSuggestion({ ...emptyFields(), genre: "Gospel", mood: "Haunted" }, {}, { chaos: 0, rng: fixedRng() });

    expect(darkGospel).not.toMatchObject({
      complexity: gospel.complexity,
      era: gospel.era,
      scaleKey: gospel.scaleKey,
    });
    expect(hauntedGospel).not.toMatchObject({
      complexity: darkGospel.complexity,
      era: darkGospel.era,
      scaleKey: darkGospel.scaleKey,
    });
  });

  it("routes every mood label through a musical bucket", () => {
    const neutral = JSON.stringify(resolveMagicSuggestionProfileLabels("genre", "Crystalline swamp bounce"));
    const neutralMoods = GENERATOR_OPTION_GROUPS.mood
      .filter((item) => JSON.stringify(resolveMagicSuggestionProfileLabels("mood", item.label)) === neutral)
      .map((item) => item.label);

    expect(neutralMoods).toEqual([]);
  });

  it("starts from a high-energy fallback when all fields are empty", () => {
    const suggestion = buildMagicSuggestion(emptyFields(), {}, { rng: fixedRng() });

    expect(["Liquid Drum & Bass", "Synthwave", "Modern Trap", "Retro Future"]).toContain(suggestion.genre);
    expect(["Euphoric", "Aggressive", "Urgent", "Bold", "Restless"]).toContain(suggestion.mood);
  });

  it("uses direct genre profiles for high-risk dialects instead of hash fallback", () => {
    const amapiano = resolveMagicSuggestionProfileLabels("genre", "Amapiano");
    const cityPop = resolveMagicSuggestionProfileLabels("genre", "City Pop");
    const jersey = resolveMagicSuggestionProfileLabels("genre", "Jersey Club");
    const psytrance = resolveMagicSuggestionProfileLabels("genre", "Psytrance");

    expect(amapiano.era).toContain("Durban 2020");
    expect(amapiano.complexity).toContain("Minimal Bass");
    expect(amapiano.genre).not.toContain("Liquid Drum & Bass");
    expect(cityPop.genre).toContain("Neo Soul");
    expect(cityPop.genre).not.toContain("Cinematic");
    expect(jersey.era).toContain("Jersey 2023");
    expect(jersey.complexity).toContain("Call Response Bass");
    expect(psytrance.era).toContain("Trance 1998");
    expect(psytrance.complexity).toContain("Ostinato Driven");
  });

  it("keeps house, deep house, and techno magic profiles primitive-distinct", () => {
    expectDistinctGenreProfiles(["House", "Deep House", "Techno"]);
    expectGenrePrimitives("House", ["Straight Groove", "Sidechain Pump", "Offbeat Stabs"]);
    expectGenrePrimitives("Deep House", ["Swing Heavy", "Rootless Voicings", "Guide Tone Shells"]);
    expectGenrePrimitives("Techno", ["Quantized Club", "Minimal Bass", "Pedal Tone"]);

    expect(selectorLinesForGenre("House")).toContain("offbeat bass pump");
    expect(selectorLinesForGenre("Deep House")).toContain("warm seventh voicings");
    expect(selectorLinesForGenre("Techno")).toContain("minimal chord motion");
  });

  it("keeps boom bap and modern trap profiles out of shared hip-hop collapse", () => {
    expectDistinctGenreProfiles(["Boom Bap", "Modern Trap"]);
    expectGenrePrimitives("Boom Bap", ["Swing Heavy", "Ghost Note Groove", "Guide Tone Shells"]);
    expectGenrePrimitives("Modern Trap", ["808 Slide Focus", "Sub Minimal", "Sparse Motif"]);

    expect(selectorLinesForGenre("Boom Bap")).toContain("dusty bass loop");
    expect(selectorLinesForGenre("Boom Bap")).toContain("jazz shell voicings");
    expect(selectorLinesForGenre("Modern Trap")).toContain("808 slide lead");
    expect(selectorLinesForGenre("Modern Trap")).toContain("sparse two-chord loop");
  });

  it("keeps reggaeton and dancehall profiles rhythmically separate", () => {
    expectDistinctGenreProfiles(["Reggaeton", "Dancehall"]);
    expectGenrePrimitives("Reggaeton", ["Syncopated Groove", "Bassline First", "Offbeat Stabs"]);
    expectGenrePrimitives("Dancehall", ["Syncopated Bass", "Call Response Bass", "Humanized Loose"]);

    expect(selectorLinesForGenre("Reggaeton")).toContain("reggaeton bass pulse");
    expect(selectorLinesForGenre("Reggaeton")).toContain("offbeat chord skank");
    expect(selectorLinesForGenre("Reggaeton")).not.toContain("dancehall");
    expect(selectorLinesForGenre("Dancehall")).toContain("dancehall bass answer");
    expect(selectorLinesForGenre("Dancehall")).toContain("sound-system chord stab");
    expect(selectorLinesForGenre("Dancehall")).not.toContain("dembow");
  });

  it("keeps afro house, afro tech, and organic house profiles primitive-distinct", () => {
    expectDistinctGenreProfiles(["Afro House", "Afro Tech", "Organic House"]);
    expectGenrePrimitives("Afro House", ["Three Three Two", "Minimal Bass", "Offbeat Stabs"]);
    expectGenrePrimitives("Afro Tech", ["Quantized Club", "Minimal Bass", "Tension Build"]);
    expectGenrePrimitives("Organic House", ["Humanized Loose", "Broken Chords", "Strummed Comping"]);

    expect(selectorLinesForGenre("Afro House")).toContain("warm modal vamp");
    expect(selectorLinesForGenre("Afro Tech")).toContain("pedal bass tension");
    expect(selectorLinesForGenre("Afro Tech")).toContain("minimal chord flashes");
    expect(selectorLinesForGenre("Organic House")).toContain("live bass movement");
    expect(selectorLinesForGenre("Organic House")).toContain("broken warm chords");
  });

  it("keeps UK garage, future garage, and two-step primitives explicit", () => {
    expectDistinctGenreProfiles(["UK Garage", "Future Garage"]);
    expectGenrePrimitives("UK Garage", ["Two Step Skips", "Syncopated Bass", "Offbeat Stabs"]);
    expectGenrePrimitives("Future Garage", ["Two Step Skips", "Reese Movement", "Broken Chords"]);

    const twoStep = resolveMagicSuggestionProfileLabels("complexity", "Two Step Skips");
    expect(twoStep.genre).toEqual(expect.arrayContaining(["UK Garage", "Future Garage"]));
    expect(twoStep.complexity).toEqual(expect.arrayContaining(["Syncopated Bass", "Reese Movement", "Broken Chords"]));
    expect(selectorLinesForGenre("UK Garage")).toContain("organ stab chops");
    expect(selectorLinesForGenre("Future Garage")).toContain("reese sub undertow");
  });

  it("maps recognized groove selectors away from neutral fallback", () => {
    const slide = buildMagicSuggestion({ ...emptyFields(), complexity: "808 Slide Focus" }, {}, { chaos: 0.15, rng: fixedRng() });
    const twoStep = buildMagicSuggestion({ ...emptyFields(), complexity: "Two Step Skips" }, {}, { chaos: 0.15, rng: fixedRng() });

    expect(["Modern Trap", "Drill", "Jersey Club", "Jersey Drill", "Phonk", "Memphis Rap"]).toContain(slide.genre);
    expect(["Liquid Drum & Bass", "Jungle", "Breakbeat", "UK Garage", "Future Garage", "Footwork"]).toContain(twoStep.genre);
    expect(slide.genre).not.toBe("House");
    expect(twoStep.genre).not.toBe("House");
  });

  it("routes typed unknown genres by recognizable primitives or neutral profile", () => {
    const jungle = buildMagicSuggestion({ ...emptyFields(), genre: "Custom Jungle" }, {}, { chaos: 0.15, rng: fixedRng() });
    const unknown = buildMagicSuggestion({ ...emptyFields(), genre: "Crystalline swamp bounce" }, {}, { chaos: 0.15, rng: fixedRng() });

    expect(jungle.era).toBe("Jungle 1994");
    expect(["Double Time", "Syncopated Groove"]).toContain(jungle.complexity);
    expect(unknown.era).toBe("2020s Hybrid");
    expect(unknown.mood).toBe("Focused");
    expect(unknown.genre).toBe("Crystalline swamp bounce");
  });

  it("keeps length choices fixed to musical bar counts and defaults to four bars", () => {
    expect(GENERATOR_LENGTH_OPTIONS.map((option) => option.value)).toEqual([2, 4, 8, 16, 32]);
    expect(DEFAULT_GENERATOR_ADVANCED_SETTINGS.lengthBars).toBe(4);
  });

  it("scores advanced ranges through the same factor graph", () => {
    const glitch = buildMagicSuggestion({ ...emptyFields(), genre: "Glitch Hop", mood: "Hypnotic" }, {}, { chaos: 0.15, rng: fixedRng() });
    const chill = buildMagicSuggestion({ ...emptyFields(), genre: "Lofi", mood: "Chill" }, {}, { chaos: 0.15, rng: fixedRng() });

    expect(glitch.creativity).toBeGreaterThan(chill.creativity);
    expect(glitch.temperature).toBeGreaterThan(chill.temperature);
    expect(glitch.density).toBeGreaterThan(chill.density);
    expect([2, 4, 8, 16, 32]).toContain(glitch.lengthBars);
  });

  it("keeps locked fields immune to magic, random, and reset", () => {
    const input = {
      ...emptyFields(),
      genre: "Lofi",
      mood: "Chill",
      notes: "leave notes",
    };
    const locks = { genre: true };

    expect(buildMagicSuggestion(input, locks).genre).toBe("Lofi");
    expect(buildRandomSuggestion(input, locks, () => 0.99).genre).toBe("Lofi");
    expect(resetGeneratorDropdowns(input, locks)).toMatchObject({
      genre: "Lofi",
      mood: "",
      notes: "leave notes",
    });
  });

  it("defines Cursor as the default global AI provider and 5.5 low fast as model", () => {
    expect(GENERATOR_AI_PROVIDER_OPTIONS.map((item) => item.label)).toEqual(["Cursor"]);
    expect(DEFAULT_GENERATOR_AI_SETTINGS).toEqual({
      model: "5.5 low fast",
      provider: "cursor",
    });
  });

  it("builds strength-aware selector prompt tags from catalogue and typed values", () => {
    const lines = buildGeneratorSelectorPromptLines({
      genre: "Melodic House",
      mood: "a hint of velvet",
      notes: "STRONG FRONT FACING bass with fast CRAZY 808 slides",
    }).join("\n");

    expect(lines).toContain("STRONG Genre \"Melodic House\"");
    expect(lines).toContain("singable motif");
    expect(lines).toContain("four-on-floor pulse");
    expect(lines).toContain("HINT Mood/Vibe \"a hint of velvet\"");
    expect(lines).toContain("FRONT-FACING User Detail");
    expect(lines).toContain("808 slides");
  });

  it("builds weighted selector state with provenance, locks, and avoid rules", () => {
    const state = buildGeneratorSelectorState({
      genre: "Amapiano",
      notes: "NO DRUMS use harp and no 808",
    }, { genre: true });

    expect(state.weightedTags).toContainEqual(expect.objectContaining({
      locked: true,
      provenance: "genre",
      tag: "amapiano",
    }));
    expect(state.weightedTags).toContainEqual(expect.objectContaining({
      provenance: "notes",
      tag: "no-drums-use-harp-and-no-808",
    }));
    expect(state.avoidRules.join("\n")).toContain("avoid adding drums");
    expect(state.avoidRules.join("\n")).toContain("avoid 808 bass lanes");
    expect(state.avoidRules.join("\n")).toContain("avoid replacing log-drum pocket");
  });

  it("builds normalized theme and groove intent prompt tags", () => {
    const lines = buildGeneratorIntentPromptLines({
      genre: "Boom Bap Hip Hop",
      mood: "Soulful jazzy chords",
      notes: "industrial and syncopated",
    }).join("\n");

    expect(lines).toContain("Themes normalized:");
    expect(lines).toContain("soulful");
    expect(lines).toContain("jazzy-chords");
    expect(lines).toContain("industrial");
    expect(lines).toContain("Grooves normalized:");
    expect(lines).toContain("boom-bap");
    expect(lines).toContain("syncopated");
    expect(lines).toContain("!TAGS:THEME=soulful,jazzy-chords;GROOVE=boom-bap,syncopated!");
  });

  it("keeps high-risk global groove dialect tags distinct", () => {
    const amapiano = buildGeneratorIntentPromptLines({ genre: "Amapiano" }).join("\n");
    const baile = buildGeneratorIntentPromptLines({ genre: "Baile Funk" }).join("\n");
    const bossa = buildGeneratorIntentPromptLines({ genre: "Bossa Nova" }).join("\n");
    const dembow = buildGeneratorIntentPromptLines({ genre: "Reggaeton" }).join("\n");

    expect(amapiano).toContain("log-drum");
    expect(amapiano).not.toContain("clave");
    expect(baile).toContain("tamborzao");
    expect(bossa).toContain("son-clave");
    expect(dembow).toContain("dembow");
  });

  it("keeps Afro house selectors out of dembow and generic house collapse", () => {
    const profile = GENERATOR_MAGIC_GENRE_PROFILES["Afro House"];
    const labels = resolveMagicSuggestionProfileLabels("genre", "Afro House");

    expect(profile.genre).toContain("Afro Tech");
    expect(profile.genre).toContain("Organic House");
    expect(profile.genre).not.toContain("Reggaeton");
    expect(profile.genre).not.toContain("Dancehall");
    expect(labels.genre).toContain("Afro House");
    expect(labels.genre).toContain("Organic House");
    expect(labels.genre).not.toContain("Reggaeton");
    expect(labels.genre).not.toContain("Dancehall");
  });

  it("does not leak 808 tags into garage or subtle text", () => {
    const garage = buildGeneratorIntentPromptLines({ genre: "UK Garage" }).join("\n");
    const subtle = buildGeneratorIntentPromptLines({ notes: "subtle piano pad" }).join("\n");

    expect(garage).toContain("two-step");
    expect(garage).toContain("broken-garage");
    expect(garage).not.toContain("808-slide-pocket");
    expect(subtle).not.toContain("808-slide-pocket");
    expect(subtle).not.toContain("half-time");
  });

  it("does not flatten garage or club dialects into four-on-floor house", () => {
    const garage = buildGeneratorIntentPromptLines({ genre: "UK Garage" }).join("\n");
    const futureGarage = buildGeneratorIntentPromptLines({ genre: "Future Garage" }).join("\n");
    const jersey = buildGeneratorIntentPromptLines({ genre: "Jersey Club" }).join("\n");

    expect(garage).toContain("two-step");
    expect(garage).not.toContain("four-on-floor");
    expect(futureGarage).toContain("ghost-snares");
    expect(futureGarage).not.toContain("four-on-floor");
    expect(jersey).not.toContain("four-on-floor");
  });

  it("keeps future bass and wave labels out of retro synth fallback tags", () => {
    const futureBass = buildGeneratorSelectorPromptLines({ genre: "Future Bass" }).join("\n");
    const futureGarage = buildGeneratorSelectorPromptLines({ genre: "Future Garage" }).join("\n");
    const newWave = resolveMagicSuggestionProfileLabels("era", "New Wave 1983");

    expect(futureBass).not.toContain("analog pad color");
    expect(futureGarage).not.toContain("arpeggiated pulse");
    expect(newWave.genre).not.toContain("Future Bass");
    expect(newWave.genre).not.toContain("Dubstep");
  });

  it("routes Drill Magic through sparse 808 grammar", () => {
    const labels = resolveMagicSuggestionProfileLabels("genre", "Drill");

    expect(labels.complexity).toContain("808 Slide Focus");
    expect(labels.complexity).toContain("Sub Minimal");
    expect(labels.era).toContain("Drill 2020");
  });

  it("aligns Indie Dance Magic with guitar-rock fallback grammar", () => {
    const labels = resolveMagicSuggestionProfileLabels("genre", "Indie Dance");

    expect(labels.genre).toContain("Post Rock");
    expect(labels.genre).toContain("Folk Electronic");
    expect(labels.complexity).toContain("Motif Variation");
    expect(labels.genre).not.toContain("Techno");
  });

  it("keeps broad mood-only Magic out of regional genre buckets", () => {
    const joyful = resolveMagicSuggestionProfileLabels("mood", "Joyful");
    const earthy = resolveMagicSuggestionProfileLabels("mood", "Earthy");
    const regional = ["Afrobeat", "Reggaeton", "Dancehall", "Amapiano", "Afro House", "Moombahton"];

    expect(joyful.genre.some((label) => regional.includes(label))).toBe(false);
    expect(earthy.genre.some((label) => regional.includes(label))).toBe(false);
  });

  it("normalizes messy AI intent tags", () => {
    expect(normalizeGeneratorIntentTags(["Boom Bap", "syncopation", "Jazzy Chords", "3+3+2"])).toEqual([
      "boom-bap",
      "syncopated",
      "jazzy-chords",
      "three-three-two",
    ]);
  });

  it("marks unrecognized selector values for one-turn AI tag derivation", () => {
    const lines = buildGeneratorSelectorPromptLines({
      genre: "Crystalline swamp bounce",
    }).join("\n");

    expect(lines).toContain("Unrecognized typed value");
    expect(lines).toContain("infer closest style tags in this AI turn");
  });
});
