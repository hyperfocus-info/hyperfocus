import { GeneratorFieldKey, GeneratorAdvancedKey, GENERATOR_FIELD_KEYS, genreLabels, GENERATOR_OPTION_GROUPS } from "./generator-option-catalog";

export type MagicProfile = Record<GeneratorFieldKey, readonly string[]>;

export const profilePresets = {
  bass: {
    complexity: ["Syncopated Groove", "Double Time", "Percussion Forward", "Bassline First", "Polyrhythmic", "Drop Template"],
    era: ["Jungle 1994", "UKG 1998", "London Pirate Radio", "Rave 1992", "Bristol 1995", "Garage Revival"],
    genre: ["Liquid Drum & Bass", "Jungle", "Breakbeat", "UK Garage", "Future Garage", "Footwork"],
    mood: ["Euphoric", "Urgent", "Restless", "Dense", "Focused", "Radiant"],
    scaleKey: ["Dorian", "Natural Minor", "Minor Pentatonic", "Phrygian", "Blues", "Dorian b2"],
  },
  ukGarage: {
    complexity: ["Two Step Skips", "Swing Heavy", "Syncopated Bass", "Ghost Note Groove", "Offbeat Stabs", "Bassline First"],
    era: ["UKG 1998", "London Pirate Radio", "Garage Revival", "Bristol 1995", "Early 2000s Club", "Rave 1992"],
    genre: ["UK Garage", "Future Garage", "Breakbeat", "House", "Grime", "Jungle"],
    mood: ["Elastic", "Kinetic", "Playful", "Restless", "Locked In", "Late Night"],
    scaleKey: ["Dorian", "Natural Minor", "Minor Pentatonic", "Blues", "Mixolydian", "Dorian b2"],
  },
  futureGarage: {
    complexity: ["Two Step Skips", "Layered Pads", "Sparse Motif", "Reese Movement", "Broken Chords", "Humanized Loose"],
    era: ["Future Garage 2011", "Dubstep 2007", "Bristol 1995", "Post Dub 2004", "London Pirate Radio", "Mid 2010s Internet"],
    genre: ["Future Garage", "UK Garage", "Dubstep", "Downtempo", "Ambient", "Wave"],
    mood: ["Liminal", "Nocturnal", "Hazy", "Weightless", "Melancholic", "Detached"],
    scaleKey: ["Natural Minor", "Dorian", "Minor Pentatonic", "Japanese Insen", "Aeolian", "Phrygian"],
  },
  chilled: {
    complexity: ["Minimal Draft", "Sparse Motif", "Texture Focused", "Layered Pads", "Humanized Loose", "Four Bar Loop"],
    era: ["Chillhop 2018", "Vapor 2012", "Tape Library 1978", "Bristol 1995", "LA Beat Scene", "Mid 2010s Internet"],
    genre: ["Lofi", "Ambient", "Downtempo", "Trip Hop", "Chillwave", "Vaporwave"],
    mood: ["Chill", "Nostalgic", "Dreamy", "Serene", "Warm", "Weightless"],
    scaleKey: ["Major Pentatonic", "Minor Pentatonic", "Japanese Insen", "Dorian", "Natural Minor", "Egyptian"],
  },
  cinematic: {
    complexity: ["Full Arrangement", "Tension Build", "Release Cadence", "Layered Pads", "Harmony Forward", "Drone Based"],
    era: ["Vintage Hollywood", "Cinematic Trailer 2010s", "Spaghetti Western", "Noir Jazz", "2020s Hybrid", "Space Age Bachelor Pad"],
    genre: ["Cinematic", "Orchestral", "Trailer Hybrid", "Post Rock", "Ambient", "Cyberpunk"],
    mood: ["Heroic", "Mystical", "Suspenseful", "Lush", "Bittersweet", "Elegant"],
    scaleKey: ["Harmonic Minor", "Lydian", "Phrygian Dominant", "Double Harmonic", "Hungarian Minor", "Byzantine"],
  },
  experimental: {
    complexity: ["Odd Meter Feel", "Polyrhythmic", "Motif Variation", "Maximal Stack", "Drone Based", "Texture Focused"],
    era: ["LA Beat Scene", "Cloud Rap 2012", "Hyperpop 2021", "Dubstep 2007", "Berlin Warehouse", "Mid 2010s Internet"],
    genre: ["IDM", "Glitch Hop", "Hyperpop", "Industrial", "Cyberpunk", "Footwork"],
    mood: ["Anxious", "Broken", "Detached", "Cosmic", "Nervous", "Heavy"],
    scaleKey: ["Chromatic", "Whole Tone", "Altered", "Enigmatic", "Prometheus", "Augmented"],
  },
  global: {
    complexity: ["Percussion Forward", "Syncopated Groove", "Call And Response", "Humanized Loose", "Melody Forward", "Straight Groove"],
    era: ["Afro Futurist", "Organic House 2024", "Early 2000s Club", "Garage Revival", "70s Studio", "2020s Hybrid"],
    genre: ["Afrobeat", "Reggaeton", "Dancehall", "Folk Electronic", "Disco", "House"],
    mood: ["Earthy", "Joyful", "Warm", "Uplifting", "Playful", "Radiant"],
    scaleKey: ["Mixolydian", "Dorian", "Major Pentatonic", "Egyptian", "Yo", "Balinese"],
  },
  afroHouse: {
    complexity: ["Percussion Forward", "Syncopated Groove", "Three Three Two", "Minimal Bass", "Layered Pads", "Offbeat Stabs"],
    era: ["Afro House 2023", "Organic House 2024", "Afro Futurist", "Lagos 2022", "Berlin Warehouse", "2020s Hybrid"],
    genre: ["Afro House", "Afro Tech", "Organic House", "Afrobeat", "Amapiano", "Melodic House"],
    mood: ["Earthy", "Hypnotic", "Warm", "Uplifting", "Locked In", "Radiant"],
    scaleKey: ["Mixolydian", "Dorian", "Major Pentatonic", "Egyptian", "Yo", "Minor Pentatonic"],
  },
  afroTech: {
    complexity: ["Quantized Club", "Three Three Two", "Minimal Bass", "Ostinato Driven", "Percussion Forward", "Tension Build"],
    era: ["Berlin Warehouse", "Afro House 2023", "Detroit 1987", "Minimal 2001", "Lagos 2022", "2020s Hybrid"],
    genre: ["Afro Tech", "Afro House", "Techno", "Minimal Tech", "Amapiano", "Dub Techno"],
    mood: ["Locked In", "Hypnotic", "Metallic", "Earthy", "Dense", "Nocturnal"],
    scaleKey: ["Dorian", "Natural Minor", "Minor Pentatonic", "Egyptian", "Phrygian", "Mixolydian"],
  },
  organicHouse: {
    complexity: ["Layered Pads", "Humanized Loose", "Broken Chords", "Pedal Tone", "Three Three Two", "Strummed Comping"],
    era: ["Organic House 2024", "Organic Downtempo 2020", "Balearic 1988", "Ibiza 1999", "Afro Futurist", "2020s Hybrid"],
    genre: ["Organic House", "Melodic House", "Afro House", "Folk Electronic", "Downtempo", "Deep House"],
    mood: ["Earthy", "Warm", "Serene", "Floating", "Pastoral", "Lush"],
    scaleKey: ["Dorian", "Mixolydian", "Major Pentatonic", "Egyptian", "Yo", "Minor Pentatonic"],
  },
  gospel: {
    complexity: ["Call And Response", "Three Voice Harmony", "Harmony Forward", "Full Arrangement", "Release Cadence", "Chord Sketch"],
    era: ["70s Studio", "60s Tape", "New Jack Swing", "Vintage Hollywood", "2020s Hybrid", "Golden Era Hip Hop"],
    genre: ["Gospel", "Soul", "R&B", "Neo Soul", "Acid Jazz", "Blues"],
    mood: ["Uplifting", "Hopeful", "Joyful", "Warm", "Celebratory", "Devotional", "Radiant", "Tender"],
    scaleKey: ["Major Pentatonic", "Mixolydian", "Major", "Blues", "Minor Pentatonic", "Lydian"],
  },
  house: {
    complexity: ["Four Bar Loop", "Straight Groove", "Sidechain Pump", "Offbeat Stabs", "Block Chords", "Drop Template"],
    era: ["Chicago 1985", "Detroit 1987", "French Touch", "Berlin Warehouse", "Progressive 1999", "Organic House 2024"],
    genre: ["House", "Deep House", "Techno", "Dub Techno", "Minimal Tech", "Lo-Fi House"],
    mood: ["Hypnotic", "Confident", "Focused", "Elegant", "Uplifting", "Dense"],
    scaleKey: ["Dorian", "Minor Pentatonic", "Mixolydian", "Lydian Dominant", "Natural Minor", "Dominant Bebop"],
  },
  deepHouse: {
    complexity: ["Swing Heavy", "Offbeat Stabs", "Rootless Voicings", "Broken Chords", "Guide Tone Shells", "Humanized Loose"],
    era: ["Paradise Garage 1982", "French House 1997", "Chicago 1985", "Ibiza 1999", "Balearic 1988", "Organic House 2024"],
    genre: ["Deep House", "Lo-Fi House", "House", "French House", "Melodic House", "Organic House"],
    mood: ["Velvet", "Late Night", "Warm", "Hypnotic", "Elegant", "Satin"],
    scaleKey: ["Dorian", "Minor Pentatonic", "Mixolydian", "Major Pentatonic", "Dominant Bebop", "Lydian Dominant"],
  },
  techno: {
    complexity: ["Quantized Club", "Ostinato Driven", "Minimal Bass", "Locked Drums", "Pedal Tone", "Tension Build"],
    era: ["Detroit 1987", "Berlin Warehouse", "Berlin Minimal 2007", "Minimal 2001", "Acid House 1988", "Rave 1992"],
    genre: ["Techno", "Minimal Tech", "Dub Techno", "Hard Techno", "Acid House", "Ambient Techno"],
    mood: ["Hypnotic", "Stoic", "Metallic", "Focused", "Locked In", "Nocturnal"],
    scaleKey: ["Dorian", "Natural Minor", "Phrygian", "Minor Pentatonic", "Diminished Half-Whole", "Chromatic"],
  },
  hipHop: {
    complexity: ["Humanized Loose", "Swing Heavy", "Bassline First", "Drumline First", "Hook Focused", "Half Time"],
    era: ["Golden Era Hip Hop", "Memphis Cassette", "Atlanta 2016", "Cloud Rap 2012", "Drill 2020", "LA Beat Scene"],
    genre: ["Boom Bap", "Modern Trap", "Jazz Hop", "Grime", "Drill", "Glitch Hop"],
    mood: ["Gritty", "Confident", "Smoky", "Raw", "Focused", "Heavy"],
    scaleKey: ["Minor Pentatonic", "Blues", "Natural Minor", "Phrygian", "Dorian", "Freygish"],
  },
  boomBap: {
    complexity: ["Swing Heavy", "Drumline First", "Humanized Loose", "Ghost Note Groove", "Guide Tone Shells", "Walking Bass"],
    era: ["Golden Era Hip Hop", "90s Underground", "G-Funk 1993", "Blue Note 1964", "Tape Library 1978", "LA Beat Scene"],
    genre: ["Boom Bap", "Jazz Hop", "Lofi", "Trip Hop", "Soul", "Acid Jazz"],
    mood: ["Gritty", "Smoky", "Raw", "Nostalgic", "Warm", "Introspective"],
    scaleKey: ["Minor Pentatonic", "Blues", "Dorian", "Major Pentatonic", "Natural Minor", "Mixolydian"],
  },
  modernTrap: {
    complexity: ["808 Slide Focus", "Half Time", "Sub Minimal", "Sparse Motif", "Hook Focused", "Call Response Bass"],
    era: ["Atlanta 2016", "SoundCloud 2017", "Drill 2020", "Hypertrap 2022", "Cloud Rap 2012", "Dirty South 2004"],
    genre: ["Modern Trap", "Drill", "Cloud Rap", "Rage", "Vapor Trap", "Trap Soul"],
    mood: ["Heavy", "Woozy", "Confident", "Locked In", "Dark", "Menacing"],
    scaleKey: ["Natural Minor", "Phrygian", "Minor Pentatonic", "Harmonic Minor", "Blues", "Freygish"],
  },
  latin: {
    complexity: ["Percussion Forward", "Syncopated Groove", "Call And Response", "Straight Groove", "Melody Forward", "Humanized Loose"],
    era: ["2020s Hybrid", "Early 2000s Club", "Organic House 2024", "Afro Futurist", "70s Studio", "Garage Revival"],
    genre: ["Reggaeton", "Dancehall", "Afrobeat", "Disco", "House", "Funk"],
    mood: ["Playful", "Joyful", "Confident", "Warm", "Radiant", "Urgent"],
    scaleKey: ["Phrygian Dominant", "Minor Pentatonic", "Mixolydian", "Major Pentatonic", "Spanish Gypsy", "Arabic Hijaz"],
  },
  retroElectronic: {
    complexity: ["Arpeggiated", "Ostinato Driven", "Melodic", "Layered Pads", "Drop Template", "Block Chords"],
    era: ["80s Analog", "Retro Future", "Synth Pop 1984", "Electro 1983", "Retro Arcade", "Future Bass 2015"],
    genre: ["Synthwave", "Retro Future", "Synth Pop", "Chillwave", "Vaporwave", "Darkwave"],
    mood: ["Nostalgic", "Euphoric", "Dreamy", "Radiant", "Dark", "Cosmic"],
    scaleKey: ["Dorian", "Lydian", "Minor Pentatonic", "Mixolydian", "Aeolian Dominant", "Lydian Augmented"],
  },
  rockFolk: {
    complexity: ["Motif Variation", "Legato Phrase", "Drone Based", "Melody Forward", "Texture Focused", "Release Cadence"],
    era: ["70s Studio", "60s Tape", "Krautrock 1974", "Tape Library 1978", "Post Dub 2004", "Vintage Hollywood"],
    genre: ["Post Rock", "Folk Electronic", "Blues", "Ambient", "Orchestral", "Soul"],
    mood: ["Earthy", "Bittersweet", "Hopeful", "Introspective", "Warm", "Wistful"],
    scaleKey: ["Dorian", "Mixolydian", "Minor Pentatonic", "Major Pentatonic", "Blues", "Japanese Insen"],
  },
  soul: {
    complexity: ["Chord Sketch", "Walking Bass", "Broken Chords", "Call And Response", "Melody Forward", "Humanized Loose"],
    era: ["70s Studio", "60s Tape", "New Jack Swing", "French Touch", "Noir Jazz", "Golden Era Hip Hop"],
    genre: ["Neo Soul", "Funk", "Soul", "R&B", "Acid Jazz", "Gospel"],
    mood: ["Warm", "Tender", "Romantic", "Joyful", "Elegant", "Smoky"],
    scaleKey: ["Major Pentatonic", "Minor Pentatonic", "Blues", "Mixolydian", "Dorian", "Dominant Bebop"],
  },
  amapiano: {
    complexity: ["Percussion Forward", "Bassline First", "Minimal Bass", "Syncopated Groove", "Call Response Bass", "Three Three Two"],
    era: ["Durban 2020", "Amapiano 2021", "Lagos 2022", "Afro House 2023", "Organic House 2024", "2020s Hybrid"],
    genre: ["Amapiano", "Afro House", "Afrobeat", "Organic House", "Dancehall", "Reggaeton"],
    mood: ["Hypnotic", "Earthy", "Warm", "Locked In", "Joyful", "Playful"],
    scaleKey: ["Mixolydian", "Dorian", "Major Pentatonic", "Minor Pentatonic", "Egyptian", "Yo"],
  },
  bassFestival: {
    complexity: ["Drop Template", "Bassline First", "Sub Minimal", "Reese Movement", "Call Response Bass", "One Shot Accents"],
    era: ["Dubstep 2010", "Brostep 2012", "Future Bass 2016", "Rave 1992", "Berlin Warehouse", "2020s Hybrid"],
    genre: ["Future Bass", "Dubstep", "Brostep", "Riddim", "Trapstep", "Hardwave"],
    mood: ["Euphoric", "Heavy", "Volatile", "Cosmic", "Urgent", "Bold"],
    scaleKey: ["Dorian", "Natural Minor", "Minor Pentatonic", "Lydian", "Phrygian", "Chromatic"],
  },
  baileFunk: {
    complexity: ["Percussion Forward", "Syncopated Groove", "One Shot Accents", "Call Response Bass", "Drumline First", "Percussion Fills"],
    era: ["Rio Baile 2005", "Early 2000s Club", "2020s Hybrid", "SoundCloud 2017", "Afro Futurist", "Lagos 2022"],
    genre: ["Baile Funk", "Reggaeton", "Dancehall", "Moombahton", "Afrobeat", "Funk"],
    mood: ["Punchy", "Feverish", "Raw", "Visceral", "Confident", "Reckless"],
    scaleKey: ["Minor Pentatonic", "Phrygian Dominant", "Spanish Phrygian", "Mixolydian", "Dorian", "Blues"],
  },
  dembow: {
    complexity: ["Percussion Forward", "Syncopated Groove", "Call And Response", "Offbeat Stabs", "Drumline First", "Percussion Fills"],
    era: ["Early 2000s Club", "Rio Baile 2005", "Lagos 2022", "2020s Hybrid", "Garage Revival", "Afro Futurist"],
    genre: ["Reggaeton", "Dancehall", "Moombahton", "Baile Funk", "Afrobeat", "Funk"],
    mood: ["Confident", "Playful", "Joyful", "Punchy", "Feverish", "Warm"],
    scaleKey: ["Phrygian Dominant", "Minor Pentatonic", "Mixolydian", "Major Pentatonic", "Spanish Gypsy", "Dorian"],
  },
  reggaeton: {
    complexity: ["Percussion Forward", "Syncopated Groove", "Offbeat Stabs", "Bassline First", "One Shot Accents", "Percussion Fills"],
    era: ["Early 2000s Club", "Rio Baile 2005", "Dirty South 2004", "SoundCloud 2017", "Lagos 2022", "2020s Hybrid"],
    genre: ["Reggaeton", "Moombahton", "Baile Funk", "Dancehall", "Salsa", "Cumbia"],
    mood: ["Confident", "Punchy", "Playful", "Joyful", "Feverish", "Warm"],
    scaleKey: ["Phrygian Dominant", "Minor Pentatonic", "Mixolydian", "Spanish Gypsy", "Dorian", "Major Pentatonic"],
  },
  dancehall: {
    complexity: ["Syncopated Bass", "Call Response Bass", "Humanized Loose", "One Shot Accents", "Offbeat Stabs", "Drumline First"],
    era: ["Early 2000s Club", "90s Underground", "Lagos 2022", "Afro Futurist", "2020s Hybrid", "Bristol 1995"],
    genre: ["Dancehall", "Reggaeton", "Afrobeat", "Moombahton", "Baile Funk", "Cumbia"],
    mood: ["Raw", "Warm", "Playful", "Confident", "Earthy", "Punchy"],
    scaleKey: ["Minor Pentatonic", "Mixolydian", "Dorian", "Phrygian Dominant", "Blues", "Major Pentatonic"],
  },
  jerseyClub: {
    complexity: ["Call Response Bass", "Drumline First", "One Shot Accents", "Syncopated Bass", "Percussion Fills", "Half Time"],
    era: ["Jersey 2023", "South London 2019", "Drill 2020", "SoundCloud 2017", "Memphis Cassette", "2020s Hybrid"],
    genre: ["Jersey Club", "Jersey Drill", "Modern Trap", "Drill", "Phonk", "Memphis Rap"],
    mood: ["Punchy", "Urgent", "Restless", "Confident", "Heavy", "Locked In"],
    scaleKey: ["Minor Pentatonic", "Natural Minor", "Phrygian", "Blues", "Dorian", "Freygish"],
  },
  latinAcoustic: {
    complexity: ["Clave Pattern", "Three Three Two", "Strummed Comping", "Call And Response", "Broken Chords", "Humanized Loose"],
    era: ["70s Studio", "60s Tape", "Organic Downtempo 2020", "Afro Futurist", "Early 2000s Club", "2020s Hybrid"],
    genre: ["Bossa Nova", "Salsa", "Samba", "Cumbia", "Afrobeat", "Folk Electronic"],
    mood: ["Elegant", "Earthy", "Joyful", "Warm", "Romantic", "Playful"],
    scaleKey: ["Mixolydian", "Major Pentatonic", "Minor Pentatonic", "Dorian", "Spanish Gypsy", "Flamenco"],
  },
  neutral: {
    complexity: ["Four Bar Loop", "Melodic", "Chord Sketch", "Straight Groove", "Sparse Motif", "Texture Focused"],
    era: ["2020s Hybrid", "70s Studio", "Mid 2010s Internet", "Early 2000s Club", "90s Underground", "80s Analog"],
    genre: ["House", "Lofi", "Synth Pop", "Folk Electronic", "Boom Bap", "Cinematic"],
    mood: ["Focused", "Warm", "Introspective", "Late Night", "Hopeful", "Lucid"],
    scaleKey: ["Dorian", "Major Pentatonic", "Minor Pentatonic", "Natural Minor", "Mixolydian", "Major"],
  },
  psytrance: {
    complexity: ["Ostinato Driven", "Quantized Club", "Arpeggiated", "Tension Build", "Layered Pads", "Drop Template"],
    era: ["Trance 1998", "Rave 1992", "Berlin Warehouse", "Ibiza 1999", "Progressive 1999", "Eurodance 1995"],
    genre: ["Psytrance", "Trance", "Techno", "Hard Techno", "Acid House", "Eurodance"],
    mood: ["Hypnotic", "Urgent", "Cosmic", "Restless", "Futuristic", "Euphoric"],
    scaleKey: ["Phrygian", "Dorian", "Natural Minor", "Persian", "Hungarian Minor", "Chromatic"],
  },
} as const satisfies Record<string, MagicProfile>;

export const GENERATOR_MAGIC_GENRE_PROFILES = {
  "Synthwave": profilePresets.retroElectronic,
  "Lofi": profilePresets.chilled,
  "Liquid Drum & Bass": profilePresets.bass,
  "Boom Bap": profilePresets.boomBap,
  "Cinematic": profilePresets.cinematic,
  "Blues": profilePresets.rockFolk,
  "Modern Trap": profilePresets.modernTrap,
  "Retro Future": profilePresets.retroElectronic,
  "Ambient": profilePresets.chilled,
  "Electro Funk": profilePresets.soul,
  "House": profilePresets.house,
  "Deep House": profilePresets.deepHouse,
  "Techno": profilePresets.techno,
  "UK Garage": profilePresets.ukGarage,
  "Future Garage": profilePresets.futureGarage,
  "Jazz Hop": profilePresets.hipHop,
  "Neo Soul": profilePresets.soul,
  "Funk": profilePresets.soul,
  "Disco": profilePresets.house,
  "Industrial": profilePresets.experimental,
  "IDM": profilePresets.experimental,
  "Chillwave": profilePresets.chilled,
  "Vaporwave": profilePresets.retroElectronic,
  "Darkwave": profilePresets.retroElectronic,
  "Synth Pop": profilePresets.retroElectronic,
  "Progressive House": profilePresets.house,
  "Dub Techno": profilePresets.techno,
  "Trip Hop": profilePresets.chilled,
  "Downtempo": profilePresets.chilled,
  "Afrobeat": profilePresets.afroHouse,
  "Reggaeton": profilePresets.reggaeton,
  "Dancehall": profilePresets.dancehall,
  "Grime": profilePresets.hipHop,
  "Drill": profilePresets.modernTrap,
  "Hyperpop": profilePresets.experimental,
  "Glitch Hop": profilePresets.experimental,
  "Breakbeat": profilePresets.bass,
  "Jungle": profilePresets.bass,
  "Footwork": profilePresets.bass,
  "Minimal Tech": profilePresets.house,
  "Post Rock": profilePresets.rockFolk,
  "Orchestral": profilePresets.cinematic,
  "Trailer Hybrid": profilePresets.cinematic,
  "Cyberpunk": profilePresets.experimental,
  "Lo-Fi House": profilePresets.deepHouse,
  "Acid Jazz": profilePresets.soul,
  "Gospel": profilePresets.gospel,
  "Soul": profilePresets.soul,
  "R&B": profilePresets.soul,
  "Folk Electronic": profilePresets.rockFolk,
  "Melodic House": profilePresets.organicHouse,
  "Organic House": profilePresets.organicHouse,
  "Amapiano": profilePresets.amapiano,
  "Jersey Club": profilePresets.jerseyClub,
  "Jersey Drill": profilePresets.jerseyClub,
  "Phonk": profilePresets.hipHop,
  "Memphis Rap": profilePresets.hipHop,
  "Rage": profilePresets.experimental,
  "PluggnB": profilePresets.soul,
  "Cloud Rap": profilePresets.hipHop,
  "Trap Soul": profilePresets.soul,
  "Future Bass": profilePresets.bassFestival,
  "Future Funk": profilePresets.retroElectronic,
  "Nu Disco": profilePresets.house,
  "French House": profilePresets.house,
  "Italo Disco": profilePresets.retroElectronic,
  "City Pop": profilePresets.soul,
  "Vapor Trap": profilePresets.modernTrap,
  "Witch House": profilePresets.experimental,
  "Hardwave": profilePresets.bassFestival,
  "Wave": profilePresets.bassFestival,
  "Dubstep": profilePresets.bassFestival,
  "Brostep": profilePresets.bassFestival,
  "Riddim": profilePresets.bassFestival,
  "Trapstep": profilePresets.bassFestival,
  "Neurofunk": profilePresets.bass,
  "Tech House": profilePresets.house,
  "Acid House": profilePresets.techno,
  "Hard Techno": profilePresets.techno,
  "Trance": profilePresets.retroElectronic,
  "Psytrance": profilePresets.psytrance,
  "Eurodance": profilePresets.retroElectronic,
  "Garage Rock": profilePresets.rockFolk,
  "Indie Dance": profilePresets.rockFolk,
  "Alt R&B": profilePresets.soul,
  "Quiet Storm": profilePresets.soul,
  "Afro House": profilePresets.afroHouse,
  "Afro Tech": profilePresets.afroTech,
  "Baile Funk": profilePresets.baileFunk,
  "Moombahton": profilePresets.dembow,
  "Bossa Nova": profilePresets.latinAcoustic,
  "Salsa": profilePresets.latinAcoustic,
  "Samba": profilePresets.latinAcoustic,
  "Cumbia": profilePresets.latinAcoustic,
  "Cinematic Pop": profilePresets.cinematic,
  "Trailer Trap": profilePresets.cinematic,
  "Ambient Techno": profilePresets.techno,
  "Drone": profilePresets.cinematic,
  "Shoegaze": profilePresets.rockFolk,
  "Math Rock": profilePresets.rockFolk,
} as const satisfies Record<(typeof genreLabels)[number], MagicProfile>;

export function fallbackMagicProfile(_key: GeneratorFieldKey, _value: string) {
  return profilePresets.neutral;
}

export const moodOnlyRegionalProfiles = new Set<MagicProfile>([
  profilePresets.afroHouse,
  profilePresets.afroTech,
  profilePresets.amapiano,
  profilePresets.baileFunk,
  profilePresets.dancehall,
  profilePresets.dembow,
  profilePresets.global,
  profilePresets.latin,
  profilePresets.latinAcoustic,
  profilePresets.organicHouse,
  profilePresets.reggaeton,
]);

export function directGenreMagicProfile(value: string) {
  const option = GENERATOR_OPTION_GROUPS.genre.find((item) => item.label.toLowerCase() === value.toLowerCase());
  return option ? GENERATOR_MAGIC_GENRE_PROFILES[option.label as keyof typeof GENERATOR_MAGIC_GENRE_PROFILES] : undefined;
}

export const typedMagicProfileRules: ReadonlyArray<{ match: RegExp; profiles: readonly MagicProfile[] }> = [
  { match: /amapiano|log drum|durban/i, profiles: [profilePresets.amapiano] },
  { match: /afro tech/i, profiles: [profilePresets.afroTech] },
  { match: /organic house/i, profiles: [profilePresets.organicHouse] },
  { match: /afrobeat|afro house|afro futurist/i, profiles: [profilePresets.afroHouse] },
  { match: /jersey|club kick|bed squeak/i, profiles: [profilePresets.jerseyClub] },
  { match: /baile|funk carioca|rio/i, profiles: [profilePresets.baileFunk] },
  { match: /reggaeton|dembow|moombahton/i, profiles: [profilePresets.reggaeton] },
  { match: /dancehall/i, profiles: [profilePresets.dancehall] },
  { match: /bossa|salsa|samba|cumbia|clave/i, profiles: [profilePresets.latinAcoustic] },
  { match: /psytrance|goa|trance/i, profiles: [profilePresets.psytrance] },
  { match: /future bass|dubstep|brostep|riddim|hardwave|trapstep|(?<!new\s)wave/i, profiles: [profilePresets.bassFestival] },
  { match: /future garage/i, profiles: [profilePresets.futureGarage] },
  { match: /ukg|uk garage|2[-\s]?step|two[-\s]?step/i, profiles: [profilePresets.ukGarage] },
  { match: /jungle|drum.?and.?bass|dnb|breakbeat|amen|garage|footwork|juke/i, profiles: [profilePresets.bass] },
  { match: /boom.?bap|golden era|sample.?based/i, profiles: [profilePresets.boomBap] },
  { match: /modern trap|808|drill|trap|phonk|memphis|pluggnb|cloud rap/i, profiles: [profilePresets.modernTrap] },
  { match: /ambient|drone|downtempo|lofi|lo-fi|chill/i, profiles: [profilePresets.chilled] },
  { match: /deep house/i, profiles: [profilePresets.deepHouse] },
  { match: /techno|warehouse/i, profiles: [profilePresets.techno] },
  { match: /house|club/i, profiles: [profilePresets.house] },
  { match: /gospel|soul|r&b|rnb|jazz/i, profiles: [profilePresets.soul, profilePresets.gospel] },
  { match: /cinematic|orchestral|trailer|score/i, profiles: [profilePresets.cinematic] },
  { match: /glitch|idm|industrial|hyperpop|deconstructed/i, profiles: [profilePresets.experimental] },
  { match: /synth|retro|vapor|italo|city pop|electro/i, profiles: [profilePresets.retroElectronic] },
  { match: /folk|rock|guitar|shoegaze|math|dance punk|post punk/i, profiles: [profilePresets.rockFolk] },
];

export const moodMagicProfileRules: ReadonlyArray<{ match: RegExp; profiles: readonly MagicProfile[] }> = [
  { match: /aggressive|reckless|vengeful|visceral|cathartic/i, profiles: [profilePresets.modernTrap, profilePresets.bassFestival, profilePresets.experimental] },
  { match: /airy|floating|glassy|iridescent|lucid|zen/i, profiles: [profilePresets.chilled, profilePresets.organicHouse, profilePresets.cinematic] },
  { match: /brooding|clandestine|cold|grim|haunted|hollow|paranoid|shadowy|stormy|tense|thorny/i, profiles: [profilePresets.cinematic, profilePresets.experimental, profilePresets.modernTrap, profilePresets.retroElectronic] },
  { match: /celebratory|devotional|gushing|optimistic|sacred|sincere|sunlit|transcendent/i, profiles: [profilePresets.gospel, profilePresets.soul, profilePresets.global] },
  { match: /determined|sleek/i, profiles: [profilePresets.house, profilePresets.deepHouse, profilePresets.techno] },
  { match: /dizzy|feverish/i, profiles: [profilePresets.experimental, profilePresets.baileFunk, profilePresets.bass] },
  { match: /fragile|moody|reflective|yearning/i, profiles: [profilePresets.chilled, profilePresets.rockFolk, profilePresets.soul] },
  { match: /pastoral|wide open/i, profiles: [profilePresets.rockFolk, profilePresets.organicHouse, profilePresets.latinAcoustic] },
  { match: /silky/i, profiles: [profilePresets.soul, profilePresets.deepHouse, profilePresets.chilled] },
  { match: /sparse/i, profiles: [profilePresets.chilled, profilePresets.modernTrap, profilePresets.techno] },
  { match: /swung/i, profiles: [profilePresets.boomBap, profilePresets.deepHouse, profilePresets.ukGarage] },
];

export function inferredMagicProfiles(key: GeneratorFieldKey, value: string) {
  const rules = key === "mood" ? [...moodMagicProfileRules, ...typedMagicProfileRules] : typedMagicProfileRules;
  const matches = rules
    .filter((rule) => rule.match.test(value))
    .flatMap((rule) => rule.profiles);
  return Array.from(new Set(matches));
}

export function matchingMagicProfiles(key: GeneratorFieldKey, value: string) {
  if (!value) {
    return [];
  }

  if (key === "genre") {
    const directProfile = directGenreMagicProfile(value);
    if (directProfile) {
      return [directProfile];
    }
  }

  const matches: MagicProfile[] = [];
  const profileList: readonly MagicProfile[] = Object.values(GENERATOR_MAGIC_GENRE_PROFILES);
  for (const profile of profileList) {
    if (key === "mood" && moodOnlyRegionalProfiles.has(profile)) {
      continue;
    }
    const bucket: readonly string[] = profile[key];
    if (bucket.includes(value) && !matches.includes(profile)) {
      matches.push(profile);
    }
  }
  if (matches.length > 0) {
    return matches;
  }
  const inferred = inferredMagicProfiles(key, value);
  return inferred.length > 0 ? inferred : [fallbackMagicProfile(key, value)];
}

export function profileLabels(profiles: readonly MagicProfile[], key: GeneratorFieldKey) {
  return Array.from(new Set(profiles.flatMap((profile) => profile[key])));
}

export function resolveMagicSuggestionProfileLabels(key: GeneratorFieldKey, value: string) {
  const profiles = matchingMagicProfiles(key, value);
  const labels: Record<GeneratorFieldKey, string[]> = {
    complexity: [],
    era: [],
    genre: [],
    mood: [],
    scaleKey: [],
  };
  for (const fieldKey of GENERATOR_FIELD_KEYS) {
    labels[fieldKey] = profileLabels(profiles, fieldKey);
  }
  return labels;
}

export type ScoreTable = Record<GeneratorFieldKey, Record<string, number>>;
export type MagicBoosts = Partial<Record<GeneratorFieldKey, Record<string, number>>>;
export type MagicAdvancedTargets = Partial<Record<GeneratorAdvancedKey, number>>;

export type MagicFactor = {
  advanced?: MagicAdvancedTargets;
  boosts: MagicBoosts;
  match: Partial<Record<GeneratorFieldKey, string>>;
  risk?: number;
};

export const profileInfluence = {
  complexity: { complexity: 0.25, era: 0.45, genre: 0.52, mood: 0.42, scaleKey: 0.34 },
  era: { complexity: 0.42, era: 0.25, genre: 0.58, mood: 0.34, scaleKey: 0.24 },
  genre: { complexity: 0.95, era: 1, genre: 0.2, mood: 0.82, scaleKey: 0.7 },
  mood: { complexity: 0.38, era: 0.32, genre: 0.28, mood: 0.18, scaleKey: 0.34 },
  scaleKey: { complexity: 0.22, era: 0.1, genre: 0.12, mood: 0.16, scaleKey: 0.18 },
} satisfies Record<GeneratorFieldKey, Record<GeneratorFieldKey, number>>;

export const magicInteractionFactors: readonly MagicFactor[] = [
  {
    advanced: { creativity: 0.68, density: 0.58, humanize: 0.58, lengthBars: 4, temperature: 0.62 },
    boosts: {
      complexity: { "808 Slide Focus": 20, "Call Response Bass": 12, "Half Time": 10 },
      era: { "Drill 2020": 16, "Atlanta 2016": 12, "Jersey 2023": 10, "Memphis Cassette": 8 },
      genre: { Drill: 18, "Modern Trap": 16, "Jersey Drill": 14, "Jersey Club": 10, Phonk: 8 },
      mood: { Dark: 10, Heavy: 10, Haunted: 8, "Locked In": 12 },
      scaleKey: { "Minor Pentatonic": 14, "Natural Minor": 12, Phrygian: 8, Blues: 6 },
    },
    match: { complexity: "808 Slide Focus" },
  },
  {
    advanced: { creativity: 0.66, density: 0.74, humanize: 0.42, lengthBars: 8, temperature: 0.64 },
    boosts: {
      complexity: { "Two Step Skips": 20, "Syncopated Groove": 14, "Percussion Forward": 10 },
      era: { "UKG 1998": 18, "London Pirate Radio": 14, "Future Garage 2011": 12, "Bristol 1995": 8 },
      genre: { "UK Garage": 18, "Future Garage": 16, Breakbeat: 12, "Liquid Drum & Bass": 8 },
      mood: { Elastic: 10, Kinetic: 12, "Locked In": 8, Restless: 6 },
      scaleKey: { Dorian: 12, "Natural Minor": 10, "Minor Pentatonic": 8 },
    },
    match: { complexity: "Two Step Skips" },
  },
  {
    advanced: { creativity: 0.88, density: 0.78, humanize: 0.3, lengthBars: 8, temperature: 0.76 },
    boosts: {
      complexity: { "Odd Meter Feel": 12, "Polyrhythmic": 18, "Texture Focused": 14 },
      era: { "Berlin Warehouse": 12, "Hyperpop 2021": 14, "LA Beat Scene": 18 },
      genre: { "Glitch Hop": 8, "IDM": 10, "Industrial": 7 },
      mood: { Broken: 9, Dense: 12, Detached: 8 },
      scaleKey: { Altered: 12, Chromatic: 18, "Dorian b2": 10, "Whole Tone": 16 },
    },
    match: { genre: "Glitch Hop", mood: "Hypnotic" },
  },
  {
    advanced: { creativity: 0.58, density: 0.46, humanize: 0.62, lengthBars: 4, temperature: 0.48 },
    boosts: {
      complexity: { "Call And Response": 14, "Legato Phrase": 9, "Motif Variation": 12, "Walking Bass": 16 },
      era: { "60s Tape": 14, "70s Studio": 16, "Noir Jazz": 14 },
      genre: { Blues: 12, "Post Rock": 7, Soul: 9 },
      mood: { Bittersweet: 8, Smoky: 13, Wistful: 9 },
      scaleKey: { Blues: 18, "Minor Pentatonic": 13, Mixolydian: 15 },
    },
    match: { genre: "Blues", mood: "Hypnotic" },
  },
  {
    advanced: { creativity: 0.6, density: 0.58, humanize: 0.7, lengthBars: 4, temperature: 0.44 },
    boosts: {
      era: { "60s Tape": 9, "70s Studio": 14, "New Jack Swing": 10 },
      genre: { Afrobeat: 9, Gospel: 18, "Neo Soul": 11, "R&B": 10, Soul: 15 },
      mood: { Hopeful: 12, Joyful: 14, Uplifting: 18, Warm: 11 },
      scaleKey: { Major: 10, "Major Pentatonic": 16, Mixolydian: 12 },
    },
    match: { complexity: "Call And Response", scaleKey: "Major" },
  },
  {
    advanced: { creativity: 0.54, density: 0.44, humanize: 0.64, lengthBars: 4, temperature: 0.42 },
    boosts: {
      era: { "Bristol 1995": 9, "Golden Era Hip Hop": 13, "Noir Jazz": 12 },
      genre: { Blues: 14, "Boom Bap": 12, Cinematic: 8, "Trip Hop": 11 },
      mood: { Bittersweet: 13, Introspective: 9, Melancholic: 16, Smoky: 11 },
      scaleKey: { Blues: 12, Dorian: 11, "Minor Pentatonic": 16, "Natural Minor": 10 },
    },
    match: { complexity: "Call And Response", scaleKey: "Natural Minor" },
  },
  {
    advanced: { creativity: 0.74, density: 0.6, humanize: 0.42, lengthBars: 8, temperature: 0.66 },
    boosts: {
      era: { "80s Analog": 15, "Electro 1983": 10, "Retro Future": 14, "Synth Pop 1984": 12 },
      genre: { Chillwave: 8, Synthwave: 18, "Synth Pop": 12, Vaporwave: 9 },
      mood: { Cosmic: 7, Dreamy: 8, Euphoric: 10, Nostalgic: 13 },
      scaleKey: { Dorian: 16, Lydian: 14, "Lydian Augmented": 9, "Minor Pentatonic": 8 },
    },
    match: { era: "80s Analog" },
  },
  {
    advanced: { creativity: 0.42, density: 0.38, humanize: 0.58, lengthBars: 4, temperature: 0.38 },
    boosts: {
      complexity: { "Four Bar Loop": 9, "Humanized Loose": 11, "Sparse Motif": 14, "Texture Focused": 12 },
      genre: { Ambient: 8, Chillwave: 7, Downtempo: 9, Lofi: 18, "Trip Hop": 8 },
      scaleKey: { Dorian: 10, "Japanese Insen": 9, "Major Pentatonic": 15, "Minor Pentatonic": 12 },
    },
    match: { mood: "Chill" },
  },
  {
    advanced: { creativity: 0.92, density: 0.68, humanize: 0.5, lengthBars: 8, temperature: 0.86 },
    boosts: {
      complexity: { "Dense Harmony": 9, "Odd Meter Feel": 10, "Three Voice Harmony": 7 },
      era: { "Noir Jazz": 8, "Space Age Bachelor Pad": 9 },
      genre: { "Acid Jazz": 9, Gospel: 5, Industrial: 8 },
      mood: { Anxious: 12, Mystical: 8, Tense: 10 },
      scaleKey: { Altered: 10, Chromatic: 15, Enigmatic: 13 },
    },
    match: { genre: "Gospel", scaleKey: "Chromatic" },
    risk: 0.68,
  },
];

export const advancedProfileTargets = [
  { profile: profilePresets.bass, target: { creativity: 0.74, density: 0.82, humanize: 0.36, lengthBars: 8, temperature: 0.68 } },
  { profile: profilePresets.ukGarage, target: { creativity: 0.66, density: 0.72, humanize: 0.52, lengthBars: 8, temperature: 0.62 } },
  { profile: profilePresets.futureGarage, target: { creativity: 0.62, density: 0.5, humanize: 0.58, lengthBars: 8, temperature: 0.58 } },
  { profile: profilePresets.chilled, target: { creativity: 0.46, density: 0.38, humanize: 0.64, lengthBars: 4, temperature: 0.36 } },
  { profile: profilePresets.cinematic, target: { creativity: 0.7, density: 0.5, humanize: 0.52, lengthBars: 16, temperature: 0.54 } },
  { profile: profilePresets.experimental, target: { creativity: 0.9, density: 0.66, humanize: 0.42, lengthBars: 8, temperature: 0.84 } },
  { profile: profilePresets.global, target: { creativity: 0.62, density: 0.7, humanize: 0.66, lengthBars: 8, temperature: 0.56 } },
  { profile: profilePresets.afroHouse, target: { creativity: 0.64, density: 0.72, humanize: 0.62, lengthBars: 8, temperature: 0.56 } },
  { profile: profilePresets.afroTech, target: { creativity: 0.66, density: 0.76, humanize: 0.48, lengthBars: 8, temperature: 0.6 } },
  { profile: profilePresets.organicHouse, target: { creativity: 0.58, density: 0.56, humanize: 0.7, lengthBars: 8, temperature: 0.48 } },
  { profile: profilePresets.gospel, target: { creativity: 0.58, density: 0.58, humanize: 0.7, lengthBars: 4, temperature: 0.46 } },
  { profile: profilePresets.house, target: { creativity: 0.55, density: 0.76, humanize: 0.26, lengthBars: 8, temperature: 0.52 } },
  { profile: profilePresets.deepHouse, target: { creativity: 0.56, density: 0.62, humanize: 0.54, lengthBars: 8, temperature: 0.5 } },
  { profile: profilePresets.techno, target: { creativity: 0.58, density: 0.78, humanize: 0.2, lengthBars: 8, temperature: 0.56 } },
  { profile: profilePresets.hipHop, target: { creativity: 0.66, density: 0.58, humanize: 0.72, lengthBars: 4, temperature: 0.58 } },
  { profile: profilePresets.boomBap, target: { creativity: 0.6, density: 0.55, humanize: 0.72, lengthBars: 4, temperature: 0.54 } },
  { profile: profilePresets.modernTrap, target: { creativity: 0.68, density: 0.6, humanize: 0.42, lengthBars: 4, temperature: 0.62 } },
  { profile: profilePresets.amapiano, target: { creativity: 0.62, density: 0.7, humanize: 0.66, lengthBars: 8, temperature: 0.54 } },
  { profile: profilePresets.baileFunk, target: { creativity: 0.72, density: 0.78, humanize: 0.58, lengthBars: 8, temperature: 0.68 } },
  { profile: profilePresets.bassFestival, target: { creativity: 0.78, density: 0.76, humanize: 0.34, lengthBars: 8, temperature: 0.72 } },
  { profile: profilePresets.dembow, target: { creativity: 0.62, density: 0.68, humanize: 0.62, lengthBars: 8, temperature: 0.56 } },
  { profile: profilePresets.reggaeton, target: { creativity: 0.62, density: 0.68, humanize: 0.58, lengthBars: 8, temperature: 0.56 } },
  { profile: profilePresets.dancehall, target: { creativity: 0.6, density: 0.64, humanize: 0.68, lengthBars: 8, temperature: 0.54 } },
  { profile: profilePresets.jerseyClub, target: { creativity: 0.7, density: 0.64, humanize: 0.46, lengthBars: 4, temperature: 0.64 } },
  { profile: profilePresets.latinAcoustic, target: { creativity: 0.58, density: 0.58, humanize: 0.72, lengthBars: 8, temperature: 0.48 } },
  { profile: profilePresets.psytrance, target: { creativity: 0.74, density: 0.82, humanize: 0.24, lengthBars: 8, temperature: 0.7 } },
  { profile: profilePresets.retroElectronic, target: { creativity: 0.68, density: 0.62, humanize: 0.34, lengthBars: 8, temperature: 0.62 } },
  { profile: profilePresets.rockFolk, target: { creativity: 0.56, density: 0.44, humanize: 0.72, lengthBars: 4, temperature: 0.44 } },
  { profile: profilePresets.soul, target: { creativity: 0.6, density: 0.52, humanize: 0.74, lengthBars: 4, temperature: 0.48 } },
] as const satisfies ReadonlyArray<{ profile: MagicProfile; target: MagicAdvancedTargets }>;
