import { SearchableComboboxItem } from "../../../components/elements/searchable-combobox";

export type GeneratorFieldKey = "complexity" | "era" | "genre" | "mood" | "scaleKey";

export type GeneratorRangeKey = "creativity" | "density" | "humanize" | "temperature";

export type GeneratorLengthBars = 2 | 4 | 8 | 16 | 32;

export type GeneratorAdvancedKey = GeneratorRangeKey | "lengthBars";

export type GeneratorLockKey = GeneratorFieldKey | GeneratorAdvancedKey;

export type GeneratorDashboardFields = Record<GeneratorFieldKey, string> & {
  creativity: number;
  density: number;
  humanize: number;
  lengthBars: GeneratorLengthBars;
  notes: string;
  temperature: number;
};

export type GeneratorFieldLocks = Partial<Record<GeneratorLockKey, boolean>>;

export type GeneratorAiProvider = "cursor";

export interface GeneratorAiSettings {
  provider: GeneratorAiProvider;
  model: string;
}

export interface GeneratorMagicOptions {
  avoid?: Partial<Record<GeneratorFieldKey, string>>;
  chaos?: number;
  rng?: () => number;
  reroll?: number;
}

export const GENERATOR_FIELD_KEYS: GeneratorFieldKey[] = ["genre", "mood", "era", "complexity", "scaleKey"];

export const GENERATOR_RANGE_KEYS: GeneratorRangeKey[] = ["creativity", "temperature", "density", "humanize"];

export const GENERATOR_ADVANCED_KEYS: GeneratorAdvancedKey[] = ["creativity", "temperature", "lengthBars", "density", "humanize"];

export const GENERATOR_LENGTH_OPTIONS: Array<{ label: string; value: GeneratorLengthBars }> = [
  { label: "2 bars", value: 2 },
  { label: "4 bars", value: 4 },
  { label: "8 bars", value: 8 },
  { label: "16 bars", value: 16 },
  { label: "32 bars", value: 32 },
] as const;

export const DEFAULT_GENERATOR_ADVANCED_SETTINGS: Pick<GeneratorDashboardFields, GeneratorAdvancedKey> = {
  creativity: 0.65,
  density: 0.55,
  humanize: 0.35,
  lengthBars: GENERATOR_LENGTH_OPTIONS[1].value,
  temperature: 0.7,
};

export const DEFAULT_GENERATOR_AI_SETTINGS: GeneratorAiSettings = {
  model: "5.5 low fast",
  provider: "cursor",
};

export const GENERATOR_AI_PROVIDER_OPTIONS: SearchableComboboxItem[] = [
  {
    description: "AI Provider",
    id: "cursor",
    kind: "Provider",
    label: "Cursor",
  },
];

export const GENERATOR_AI_MODEL_OPTIONS: SearchableComboboxItem[] = [
  {
    description: "Fast low-reasoning generator",
    id: "5-5-low-fast",
    kind: "Model",
    label: DEFAULT_GENERATOR_AI_SETTINGS.model,
  },
];

export const genreLabels = [
  "Synthwave", "Lofi", "Liquid Drum & Bass", "Boom Bap", "Cinematic", "Blues", "Modern Trap", "Retro Future", "Ambient", "Electro Funk",
  "House", "Deep House", "Techno", "UK Garage", "Future Garage", "Jazz Hop", "Neo Soul", "Funk", "Disco", "Industrial",
  "IDM", "Chillwave", "Vaporwave", "Darkwave", "Synth Pop", "Progressive House", "Dub Techno", "Trip Hop", "Downtempo", "Afrobeat",
  "Reggaeton", "Dancehall", "Grime", "Drill", "Hyperpop", "Glitch Hop", "Breakbeat", "Jungle", "Footwork", "Minimal Tech",
  "Post Rock", "Orchestral", "Trailer Hybrid", "Cyberpunk", "Lo-Fi House", "Acid Jazz", "Gospel", "Soul", "R&B", "Folk Electronic",
  "Melodic House", "Organic House", "Amapiano", "Jersey Club", "Jersey Drill", "Phonk", "Memphis Rap", "Rage", "PluggnB", "Cloud Rap",
  "Trap Soul", "Future Bass", "Future Funk", "Nu Disco", "French House", "Italo Disco", "City Pop", "Vapor Trap", "Witch House", "Hardwave",
  "Wave", "Dubstep", "Brostep", "Riddim", "Trapstep", "Neurofunk", "Tech House", "Acid House", "Hard Techno", "Trance",
  "Psytrance", "Eurodance", "Garage Rock", "Indie Dance", "Alt R&B", "Quiet Storm", "Afro House", "Afro Tech", "Baile Funk", "Moombahton",
  "Bossa Nova", "Salsa", "Samba", "Cumbia", "Cinematic Pop", "Trailer Trap", "Ambient Techno", "Drone", "Shoegaze", "Math Rock",
] as const;

export const moodLabels = [
  "Dark", "Euphoric", "Nostalgic", "Chill", "Anxious", "Aggressive", "Dreamy", "Melancholic", "Hopeful", "Suspenseful",
  "Romantic", "Confident", "Gritty", "Warm", "Cold", "Floating", "Urgent", "Playful", "Haunted", "Serene",
  "Uplifting", "Introspective", "Hypnotic", "Bold", "Moody", "Tender", "Stoic", "Restless", "Heroic", "Mystical",
  "Raw", "Elegant", "Menacing", "Bittersweet", "Cosmic", "Earthy", "Sparse", "Dense", "Nervous", "Lush",
  "Tense", "Joyful", "Wistful", "Focused", "Broken", "Radiant", "Smoky", "Detached", "Heavy", "Weightless",
  "Airy", "Brooding", "Celebratory", "Clandestine", "Devotional", "Determined", "Dizzy", "Elastic", "Feverish", "Fragile",
  "Futuristic", "Glassy", "Grim", "Gushing", "Hazy", "Hollow", "Iridescent", "Kinetic", "Late Night", "Liminal",
  "Lucid", "Metallic", "Nocturnal", "Optimistic", "Paranoid", "Pastoral", "Punchy", "Reckless", "Reflective", "Sacred",
  "Satin", "Shadowy", "Silky", "Sincere", "Sleek", "Stormy", "Sunlit", "Swung", "Thorny", "Transcendent",
  "Velvet", "Vengeful", "Visceral", "Volatile", "Wide Open", "Yearning", "Zen", "Cathartic", "Locked In", "Woozy",
] as const;

export const eraLabels = [
  "80s Analog", "90s Underground", "Modern Trap", "Retro Future", "70s Studio", "60s Tape", "Early 2000s Club", "Mid 2010s Internet", "2020s Hybrid", "Vintage Hollywood",
  "Golden Era Hip Hop", "Bloghouse", "Rave 1992", "Detroit 1987", "Chicago 1985", "Bristol 1995", "LA Beat Scene", "Memphis Cassette", "Atlanta 2016", "London Pirate Radio",
  "Berlin Warehouse", "Tokyo City Pop", "French Touch", "New Jack Swing", "Progressive 1999", "Nu Disco Revival", "Vapor 2012", "Future Bass 2015", "Synth Pop 1984", "Acid House 1988",
  "Jungle 1994", "UKG 1998", "Dubstep 2007", "Chillhop 2018", "Post Dub 2004", "Cinematic Trailer 2010s", "Spaghetti Western", "Noir Jazz", "Space Age Bachelor Pad", "Krautrock 1974",
  "Electro 1983", "Minimal 2001", "Cloud Rap 2012", "Drill 2020", "Hyperpop 2021", "Organic House 2024", "Afro Futurist", "Retro Arcade", "Tape Library 1978", "Garage Revival",
  "Y2K R&B", "Blog Rap 2010", "SoundCloud 2017", "Jersey 2023", "South London 2019", "UK Drill 2018", "Atlanta Plugg 2021", "Chicago Footwork 2011", "Durban 2020", "Lagos 2022",
  "Rio Baile 2005", "Ibiza 1999", "Balearic 1988", "Paradise Garage 1982", "Studio 54 1979", "Motown 1966", "Stax 1968", "Muscle Shoals 1971", "Blue Note 1964", "ECM 1978",
  "Krautrock 1972", "Seattle 1992", "Midwest Emo 1999", "Shoegaze 1991", "Post Punk 1980", "New Wave 1983", "Italo Disco 1984", "Eurodance 1995", "Trance 1998", "Dubstep 2010",
  "Brostep 2012", "Future Bass 2016", "PC Music 2014", "Deconstructed Club 2018", "Hypertrap 2022", "Phonk 2021", "Memphis Underground 1994", "Dirty South 2004", "Bay Area Hyphy 2006", "G-Funk 1993",
  "French House 1997", "Berlin Minimal 2007", "Romanian Minimal 2010", "Amapiano 2021", "Afro House 2023", "Organic Downtempo 2020", "Modern Worship 2019", "Trailer Hybrid 2024", "AI Bedroom Pop 2026", "Future Garage 2011",
] as const;

export const complexityLabels = [
  "Minimal Draft", "Melodic", "Complex Polyphonic", "Sparse Motif", "Four Bar Loop", "Eight Bar Loop", "Ostinato Driven", "Countermelody Rich", "Call And Response", "Dense Harmony",
  "Modal Jam", "Syncopated Groove", "Straight Groove", "Polyrhythmic", "Half Time", "Double Time", "Chord Sketch", "Full Arrangement", "Bassline First", "Drumline First",
  "Hook Focused", "Texture Focused", "Arpeggiated", "Block Chords", "Broken Chords", "Walking Bass", "Pedal Tone", "Layered Pads", "Staccato Pattern", "Legato Phrase",
  "Odd Meter Feel", "Triplet Feel", "Swing Heavy", "Quantized Tight", "Humanized Loose", "Riff Based", "Drone Based", "Motif Variation", "Minimal Bass", "Maximal Stack",
  "Two Voice Counterpoint", "Three Voice Harmony", "Percussion Forward", "Melody Forward", "Harmony Forward", "Tension Build", "Release Cadence", "Intro Template", "Drop Template", "Bridge Template",
  "Topline Hook", "Earworm Chorus", "Motif Callbacks", "Phrase Mutation", "Turnaround Fill", "One Shot Accents", "Ghost Note Groove", "Velocity Swell", "Sidechain Pump", "Offbeat Stabs",
  "Three Three Two", "Clave Pattern", "Amen Edits", "Two Step Skips", "808 Slide Focus", "Sub Minimal", "Reese Movement", "Chord Melody", "Upper Extension Layer", "Guide Tone Shells",
  "Rootless Voicings", "Quartal Harmony", "Suspended Chords", "Passing Diminished", "Pedal Reharm", "Dropout Bars", "Pickup Notes", "Anticipated Chords", "Delayed Downbeat", "Syncopated Bass",
  "Locked Drums", "Loose Drums", "Stutter Edits", "Glitch Bursts", "Reverse Swells", "Crescendo Arc", "Tension Pedal", "Cinematic Hits", "Percussion Fills", "Shimmer Texture",
  "Drone Swell", "Sparse Counterline", "Dense Counterpoint", "Minimal Hook", "Maximal Drums", "Call Response Bass", "Strummed Comping", "Broken Arp", "Live Feel", "Quantized Club",
] as const;

export const scaleLabels = [
  "Major", "Natural Minor", "Harmonic Minor", "Melodic Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian", "Minor Pentatonic",
  "Major Pentatonic", "Blues", "Dorian b2", "Lydian Dominant", "Altered", "Whole Tone", "Diminished Half-Whole", "Diminished Whole-Half", "Chromatic", "Japanese Insen",
  "Hirajoshi", "Iwato", "Kumoi", "Yo", "In", "Egyptian", "Hungarian Minor", "Ukrainian Dorian", "Double Harmonic", "Byzantine",
  "Persian", "Arabic Hijaz", "Freygish", "Neapolitan Minor", "Neapolitan Major", "Phrygian Dominant", "Aeolian Dominant", "Mixolydian b6", "Lydian Augmented", "Major Bebop",
  "Dominant Bebop", "Minor Bebop", "Enigmatic", "Prometheus", "Balinese", "Pelog", "Spanish Gypsy", "Romanian Minor", "Acoustic", "Augmented",
  "Ionian", "Aeolian", "Minor Blues", "Major Blues", "Dorian Pentatonic", "Lydian Pentatonic", "Mixolydian Pentatonic", "Suspended Pentatonic", "Raga Bhairav", "Raga Yaman",
  "Raga Todi", "Raga Kafi", "Raga Kirwani", "Raga Charukeshi", "Maqam Hijaz", "Maqam Bayati", "Maqam Rast", "Maqam Nahawand", "Flamenco", "Andalusian",
  "Spanish Phrygian", "Gypsy Minor", "Oriental", "Hungarian Major", "Lydian Minor", "Lydian b7", "Super Locrian", "Locrian Natural 2", "Half Diminished", "Bebop Major",
  "Bebop Minor", "Bebop Dominant", "Minor Major", "Harmonic Major", "Neapolitan Dorian", "Phrygian b4", "Lydian #2", "Mixolydian b2", "Mixolydian #11", "Dorian #4",
  "Major b6", "Sixth Diminished", "Augmented Hexatonic", "Tritone", "Messiaen Mode 2", "Messiaen Mode 3", "Whole Half Bebop", "Pelog Barang", "Slendro", "Klezmer",
] as const;

export function toId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function toItems(labels: readonly string[], kind: string) {
  return labels.map((label) => ({
    description: kind,
    id: toId(label),
    kind,
    label,
  }));
}

export const GENERATOR_OPTION_GROUPS = {
  complexity: toItems(complexityLabels, "Complexity"),
  era: toItems(eraLabels, "Era"),
  genre: toItems(genreLabels, "Genre"),
  mood: toItems(moodLabels, "Mood/Vibe"),
  scaleKey: toItems(scaleLabels, "Scale/Mode"),
};

export const GENERATOR_OPTION_TOTAL = Object.values(GENERATOR_OPTION_GROUPS).reduce((sum, items) => sum + items.length, 0);

export type GeneratorSelectorPromptStrength = "front-facing" | "hint" | "strong" | "supporting";

export type GeneratorSelectorPromptTag = {
  grooveTags: readonly string[];
  key: GeneratorFieldKey | "notes";
  label: string;
  recognized: boolean;
  strength: GeneratorSelectorPromptStrength;
  tags: readonly string[];
  themeTags: readonly string[];
};

export type GeneratorSelectorTagProvenance = GeneratorFieldKey | "notes";

export type GeneratorWeightedSelectorTag = {
  locked: boolean;
  provenance: GeneratorSelectorTagProvenance;
  tag: string;
  weight: number;
};

export type GeneratorSelectorState = {
  avoidRules: readonly string[];
  fields: Partial<Record<GeneratorFieldKey | "notes", string>>;
  locks: GeneratorFieldLocks;
  weightedTags: readonly GeneratorWeightedSelectorTag[];
};

export type GeneratorIntentTags = {
  grooveTags: readonly string[];
  themeTags: readonly string[];
};
