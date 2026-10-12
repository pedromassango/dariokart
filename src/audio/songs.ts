// Original chiptune compositions for Dariokart.
//
// Notation
// --------
// chords : one entry per bar separated by '|'. Several chords in a bar split it evenly.
// melody : space separated tokens `<note>:<steps>` (e.g. `C5:4`) or `r:<steps>` for a rest.
//          The step length defaults to `defLen`. '|' is ignored (visual bar lines).
// bass   : per-bar pattern, one char per step: R root, O octave, 5 fifth, 3 third,
//          7 seventh (or octave on triads), L fifth below root, '-' hold, '.' rest.
// arp    : per-bar pattern: digit = chord-tone index (wrapping up octaves),
//          C = full chord stab, '-' hold, '.' rest.
// drums  : per-bar pattern: k kick, s snare, h hat, o open hat, c crash+kick,
//          t tom, x click, K kick+hat, S snare+hat, '.' rest.
// Patterns given as arrays cycle bar by bar. `fill` replaces the drum bar every 8th bar.

export type MusicName = 'title' | 'menu' | 'circuit' | 'plains' | 'ghost' | 'beach' | 'rainbow' | 'star' | 'results' | 'castle';

export interface SongDef {
  bpm: number;
  stepsPerBar: number;
  defLen?: number;
  chords: string;
  melody: string;
  lead: string;
  /** auto harmony voice: nearest chord tone below the melody */
  harmony?: string;
  arp?: string;
  arpPattern?: string[];
  /** lowest MIDI note for arp chord roots */
  arpLow?: number;
  bass: string;
  bassPattern: string[];
  /** lowest MIDI note for bass roots */
  bassLow?: number;
  drums?: string[];
  fill?: string;
  /** 0..0.5, delays every off 16th by this fraction of a step */
  swing?: number;
  echo?: { mix: number; feedback: number; steps: number };
  vibrato?: { rate: number; depth: number };
  mix?: Partial<Record<'lead' | 'harmony' | 'arp' | 'bass' | 'drums', number>>;
}

// ------------------------------------------------------------------ title --
// Heroic fanfare in C major.
const titleMel =
  'G4:2 C5:2 E5:2 G5:6 E5:2 G5:2 | C6:8 B5:2 A5:2 G5:4 | A5:4 F5:2 A5:2 C6:4 A5:4 | G5:12 r:4 |' +
  'E5:2 A5:2 C6:2 E6:6 D6:2 C6:2 | D6:4 C6:2 A5:2 F5:8 | G5:2 A5:2 B5:2 D6:6 C6:2 B5:2 | A5:4 B5:4 D6:8 |' +
  'E6:6 D6:2 C6:4 G5:4 | G#5:6 B5:2 E6:8 | A5:2 C6:2 E6:2 A6:6 G6:2 E6:2 | F6:4 E6:2 D6:2 C6:8 |' +
  'D6:2 E6:2 F6:4 A5:2 D6:2 F6:4 | G6:4 F6:2 E6:2 D6:4 B5:4 | C6:12 G5:2 E5:2 | F5:2 G5:2 A5:2 B5:2 D6:4 G5:4';

const title: SongDef = {
  bpm: 132,
  stepsPerBar: 16,
  chords: 'C|C|F|C|Am|F|G|G|C|E7|Am|F|Dm|G|C|G7',
  melody: titleMel,
  lead: 'brass',
  harmony: 'lead12',
  arp: 'stab',
  arpPattern: ['C..C..C.C...C.C.'],
  bass: 'bass',
  bassPattern: ['R.R.R.5.O.O.5.R.'],
  drums: ['K.h.S.h.K.K.S.hh', 'K.h.S.h.K.h.S.KS'],
  fill: 'K.h.S.h.t.t.ttSS',
  echo: { mix: 0.25, feedback: 0.3, steps: 3 },
  vibrato: { rate: 5.5, depth: 12 },
};

// ------------------------------------------------------------------- menu --
// Bouncy F major shuffle.
const menuMel =
  'C5:2 F5:2 A5:2 F5:2 C6:3 A5:1 F5:4 | D5:2 F5:2 A5:2 D6:2 C6:4 A5:4 | Bb5:2 A5:2 G5:2 D5:2 G5:4 Bb5:4 | C6:4 Bb5:2 A5:2 G5:4 E5:4 |' +
  'C5:2 F5:2 A5:2 F5:2 C6:3 A5:1 F5:4 | D6:2 C6:2 A5:2 F5:2 D5:4 F5:4 | D5:2 F5:2 Bb5:4 E5:2 G5:2 C6:4 | F5:4 A5:2 C6:2 F6:4 r:4 |' +
  'D6:3 C6:1 Bb5:2 F5:2 D5:4 F5:4 | E6:3 D6:1 C6:2 G5:2 E5:4 G5:4 | C6:2 B5:2 A5:2 E5:2 C6:2 E6:2 A5:4 | F6:4 E6:2 D6:2 A5:4 F5:4 |' +
  'G5:2 A5:2 Bb5:2 D6:2 G6:4 F6:2 D6:2 | E6:4 C6:2 G5:2 E5:4 G5:4 | A5:2 C6:2 F6:2 C6:2 A5:2 F5:2 C5:4 | Bb4:2 C5:2 E5:2 G5:2 Bb5:4 C6:4';

const menu: SongDef = {
  bpm: 140,
  stepsPerBar: 16,
  chords: 'F|Dm|Gm|C|F|Dm|Bb C|F|Bb|C|Am|Dm|Gm|C|F|C7',
  melody: menuMel,
  lead: 'lead12',
  arp: 'arp25',
  arpPattern: ['..C...C...C...C.'],
  bass: 'bassPluck',
  bassPattern: ['R...5...R...5.3.', 'R...5...O...5...'],
  drums: ['k.h.s.h.k.h.s.h.', 'k.h.s.h.k.k.s.ho'],
  fill: 'k.h.s.h.k.s.s.ss',
  swing: 0.28,
  echo: { mix: 0.2, feedback: 0.25, steps: 3 },
  vibrato: { rate: 6, depth: 6 },
};

// ---------------------------------------------------------------- circuit --
// Bright driving rock in D major, A A' B A' form.
const circA =
  'A4:2 D5:2 F#5:2 A5:4 F#5:2 A5:2 B5:2 | A5:6 F#5:2 E5:4 D5:4 | B4:2 D5:2 G5:2 B5:4 A5:2 G5:2 E5:2 | A5:4 C#6:4 E6:4 C#6:4 |' +
  'D6:4 C#6:2 B5:2 F#5:4 B5:4 | B5:2 A5:2 G5:2 D5:2 G5:4 A5:4 |';
const circA1 = circA + 'B5:4 G5:2 E5:2 G5:2 B5:2 E6:4 | C#6:8 A5:2 B5:2 C#6:2 E6:2 |';
const circA2 = circA + 'E6:2 D6:2 B5:2 G5:2 E5:4 G5:4 | A5:4 E5:2 A5:2 C#6:4 E6:4 |';
const circB =
  'F#5:6 E5:2 D5:4 B4:4 | D5:6 E5:2 G5:4 B5:4 | A5:6 G5:2 F#5:4 D5:4 | E5:6 F#5:2 A5:8 |' +
  'B5:4 A5:2 B5:2 D6:4 B5:4 | G5:4 A5:2 B5:2 D6:4 G6:4 | F#6:4 E6:2 D6:2 B5:4 G5:4 | A5:2 B5:2 C#6:2 E6:2 G6:4 A6:4 |';
const circChA = 'D|D|G|A|Bm|G|Em|A|';
const circChB = 'Bm|G|D|A|Bm|G|Em|A7|';

const circuit: SongDef = {
  bpm: 152,
  stepsPerBar: 16,
  chords: circChA + circChA + circChB + circChA,
  melody: circA1 + circA2 + circB + circA2,
  lead: 'lead25',
  harmony: 'lead12',
  arp: 'arp12',
  arpPattern: ['0.1.2.1.0.1.2.4.'],
  bass: 'bass',
  bassPattern: ['R.R.O.R.R.R.O.R.', 'R.R.O.R.5.5.O.3.'],
  drums: ['K.h.S.h.K.K.S.h.', 'K.h.S.h.K.hKS.hh'],
  fill: 'K.h.S.h.S.SSt.tt',
  echo: { mix: 0.18, feedback: 0.25, steps: 3 },
  vibrato: { rate: 6, depth: 10 },
  mix: { harmony: 0.1 },
};

// ----------------------------------------------------------------- plains --
// Breezy G major with a flute-like lead.
const plainsMel =
  'D5:4 G5:2 A5:2 B5:6 A5:2 | G5:4 E5:4 B4:8 | C5:2 E5:2 G5:2 C6:6 B5:2 A5:2 | A5:12 F#5:4 |' +
  'D5:4 G5:2 A5:2 B5:4 D6:4 | E6:4 D6:2 B5:2 G5:8 | A5:2 B5:2 C6:4 E6:4 C6:4 | D6:12 r:4 |' +
  'E6:6 D6:2 C6:4 G5:4 | F#5:6 G5:2 A5:8 | D6:6 B5:2 F#5:8 | G5:4 A5:2 B5:2 E6:8 |' +
  'E6:4 D6:4 C6:4 B5:4 | A5:4 B5:2 C6:2 D6:8 | B5:6 A5:2 G5:8 | F#5:4 A5:4 C6:4 D6:4';

const plains: SongDef = {
  bpm: 128,
  stepsPerBar: 16,
  chords: 'G|Em|C|D|G|Em|Am|D|C|D|Bm|Em|C|D|G|D7',
  melody: plainsMel,
  lead: 'flute',
  arp: 'arp25',
  arpPattern: ['0.1.2.4.2.1.0.1.', '0.2.4.2.1.2.3.2.'],
  arpLow: 55,
  bass: 'bassPluck',
  bassPattern: ['R..R..5.R...5.3.'],
  drums: ['k.h.s.hhk.h.s.h.', 'k.h.s.hhk.hks.ho'],
  fill: 'k.h.s.h.k.s.s.ts',
  echo: { mix: 0.22, feedback: 0.3, steps: 4 },
  vibrato: { rate: 5, depth: 14 },
  mix: { arp: 0.08 },
};

// ------------------------------------------------------------------ ghost --
// Spooky D minor waltz on a wobbly organ.
const ghostMel =
  'D5:4 F5:4 A5:4 | Bb5:4 A5:4 C#5:4 | D5:8 F5:4 | E5:2 F5:2 E5:2 D5:6 |' +
  'G5:4 Bb5:4 D6:4 | F5:4 A5:4 D6:4 | E5:4 G5:4 Bb5:4 | C#6:6 A5:6 |' +
  'D6:4 F6:4 D6:4 | Bb5:4 G5:4 D5:4 | A5:6 F5:2 E5:2 D5:2 | F5:6 G5:2 F5:2 D5:2 |' +
  'G5:4 A5:4 Bb5:4 | C#6:4 E6:4 G6:4 | F6:6 E6:2 D6:4 | C#6:4 A5:4 E5:4';

const ghost: SongDef = {
  bpm: 104,
  stepsPerBar: 12,
  chords: 'Dm|A7|Dm|Dm|Gm|Dm|Edim7|A7|Bb|Gm|Dm|Bb|Gm|A7|Dm|A7',
  melody: ghostMel,
  lead: 'organ',
  arp: 'pad',
  arpPattern: ['....C---C---'],
  arpLow: 55,
  bass: 'bass',
  bassPattern: ['R-----......', 'R-----L-----'],
  bassLow: 38,
  drums: ['k.....x...x.', 'k.....x.x.x.'],
  fill: 'k.....t.t.t.',
  echo: { mix: 0.38, feedback: 0.45, steps: 3 },
  vibrato: { rate: 4.2, depth: 22 },
  mix: { arp: 0.06, drums: 0.25 },
};

// ------------------------------------------------------------------ beach --
// Calypso in F with a steel-drum lead.
const beachMel1 = 'C5:2 F5:2 A5:2 F5:1 A5:1 C6:4 A5:4 |';
const beachMel =
  beachMel1 + 'G5:2 A5:2 G5:2 F5:2 D5:4 C5:4 | D5:2 F5:2 Bb5:3 D6:1 r:2 D6:2 C6:2 Bb5:2 | C6:3 Bb5:3 G5:2 E5:4 C5:4 |' +
  beachMel1 + 'F5:2 A5:2 D6:3 C6:3 A5:2 F5:4 | G5:2 Bb5:2 D6:4 C6:2 Bb5:2 G5:4 | F5:3 F5:3 A5:2 F5:8 |' +
  'F5:2 Bb5:2 D6:3 Bb5:3 D6:2 F6:4 | E6:2 F6:2 C6:3 A5:3 F5:2 A5:4 | G5:2 A5:2 Bb5:3 C6:3 E6:2 G6:4 | F6:3 E6:1 C6:4 A5:4 F5:4 |' +
  'D6:3 D6:3 C6:2 Bb5:3 A5:3 G5:2 | A5:3 A5:3 G5:2 F5:3 C5:3 F5:2 | G5:3 Bb5:3 D6:2 C6:3 G5:3 E5:2 | F5:4 C5:2 F5:2 A5:4 r:4';

const beach: SongDef = {
  bpm: 118,
  stepsPerBar: 16,
  chords: 'F|F|Bb|C|F|Dm|Gm C|F|Bb|F|C|F|Bb|F|Gm C|F',
  melody: beachMel,
  lead: 'steel',
  harmony: 'steel',
  arp: 'stab',
  arpPattern: ['..C...C...C..C..'],
  bass: 'bassPluck',
  bassPattern: ['R-.R..5-.5..O-3.'],
  drums: ['k..x..k.s..xk.x.', 'k..x..k.s..xk.ho'],
  fill: 'k..x..k.t.t.t.ss',
  echo: { mix: 0.22, feedback: 0.28, steps: 3 },
  mix: { harmony: 0.12, lead: 0.26 },
};

// ---------------------------------------------------------------- rainbow --
// Spacey synth arpeggios floating over maj7 colours.
const rainbowMel =
  'E5:4 A5:4 C6:4 E6:4 | D6:8 B5:4 G5:4 | B5:6 D6:2 G6:8 | E6:12 r:4 |' +
  'A5:4 C6:4 E6:4 G6:4 | D6:6 E6:2 B5:8 | D6:8 E6:8 | C#6:16 |' +
  'F6:6 E6:2 D6:4 A5:4 | G6:6 F#6:2 E6:4 B5:4 | A6:4 G6:4 E6:4 C6:4 | D6:4 B5:4 G5:4 D6:4 |' +
  'C6:6 B5:2 A5:4 E5:4 | F5:4 A5:4 C6:4 E6:4 | D6:8 F6:8 | G#5:4 B5:4 D6:4 E6:4';

const rainbow: SongDef = {
  bpm: 136,
  stepsPerBar: 16,
  chords: 'Fmaj7|G|Em7|Am7|Fmaj7|G|Asus4|A|Dm7|Em7|Fmaj7|G|Am7|Fmaj7|Bb|E7',
  melody: rainbowMel,
  lead: 'synth',
  harmony: 'pad',
  arp: 'arp12',
  arpPattern: ['0123432101234321', '0246420246864202'],
  arpLow: 53,
  bass: 'bass',
  bassPattern: ['R-------O---5---'],
  bassLow: 38,
  drums: ['k...x...k.k.x...', 'k...x...k.k.x.xx'],
  fill: 'k...x...t.t.t.tt',
  echo: { mix: 0.4, feedback: 0.48, steps: 3 },
  vibrato: { rate: 5, depth: 15 },
  mix: { harmony: 0.07, arp: 0.09, drums: 0.28 },
};

// ------------------------------------------------------------------- star --
// Frantic invincibility loop.
const starA =
  'C5:1 E5:1 G5:1 C6:1 G5:2 E5:2 C6:2 G5:2 E5:2 G5:2 | F5:1 A5:1 C6:1 F6:1 C6:2 A5:2 F6:2 C6:2 A5:2 C6:2 |' +
  'G5:1 B5:1 D6:1 G6:1 D6:2 B5:2 G6:2 D6:2 B5:2 D6:2 | E6:2 D6:2 C6:2 G5:2 C6:4 r:4 |';
const starB =
  'A5:2 C6:2 E6:2 A5:2 C6:2 E6:2 A6:4 | F6:2 E6:2 C6:2 A5:2 F5:4 A5:4 |' +
  'G5:2 B5:2 D6:2 G6:2 F6:2 D6:2 B5:2 G5:2 | D6:2 E6:2 F6:2 G6:2 A6:2 B6:2 G6:4 |';

const star: SongDef = {
  bpm: 192,
  stepsPerBar: 16,
  chords: 'C|F|G|C|Am|F|G|G7|C|F|G|C|Am|F|G|G7',
  melody: starA + starB + starA + starB,
  lead: 'square',
  arp: 'arp12',
  arpPattern: ['0.2.1.2.0.2.1.2.'],
  bass: 'bassPluck',
  bassPattern: ['R.O.R.O.R.O.R.O.'],
  drums: ['K.hhS.hhK.hhS.hh', 'K.hhS.hhK.KhS.SS'],
  fill: 'KhShKhShSSSStttt',
  echo: { mix: 0.12, feedback: 0.2, steps: 2 },
  vibrato: { rate: 8, depth: 8 },
};

// ---------------------------------------------------------------- results --
// Celebratory, laid-back podium tune.
const resultsMel =
  'E5:4 G5:4 C6:6 B5:2 | A5:4 C6:4 E6:8 | F6:6 E6:2 D6:4 A5:4 | B5:8 G5:4 r:4 |' +
  'E6:4 D6:2 C6:2 G5:4 E5:4 | G#5:6 B5:2 D6:8 | C6:4 A5:4 F5:4 A5:4 | D6:12 r:4 |' +
  'A5:4 C6:4 F6:6 E6:2 | D6:4 B5:4 G5:8 | G5:4 B5:4 E6:6 D6:2 | C6:8 A5:8 |' +
  'D6:4 F6:4 A6:6 G6:2 | F6:4 D6:4 B5:8 | C6:12 E6:4 | D6:4 B5:4 G5:4 D5:4';

const results: SongDef = {
  bpm: 96,
  stepsPerBar: 16,
  chords: 'C|Am|Dm|G|C|E7|F|G|F|G|Em|Am|Dm|G|C|G',
  melody: resultsMel,
  lead: 'brass',
  harmony: 'lead12',
  arp: 'arp25',
  arpPattern: ['0.1.2.1.3.1.2.1.'],
  bass: 'bass',
  bassPattern: ['R-..5-..O-..5-3-'],
  drums: ['k.h.s.h.k.hks.h.'],
  fill: 'k.h.s.h.k.t.t.ts',
  swing: 0.3,
  echo: { mix: 0.28, feedback: 0.35, steps: 3 },
  vibrato: { rate: 5, depth: 12 },
  mix: { harmony: 0.1 },
};

// ----------------------------------------------------------------- castle --
// Ominous lava-fortress march in C minor: pounding low ostinato, brass lead, organ harmony.
const castleMel =
  'C5:4 Eb5:2 G5:2 C6:6 B5:2 | C6:2 D6:2 Eb6:4 D6:2 C6:2 G5:4 | Ab5:6 G5:2 F5:2 Eb5:2 C5:4 | B4:4 D5:4 G5:8 |' +
  'C5:4 Eb5:2 G5:2 C6:6 D6:2 | Eb6:4 D6:2 C6:2 Bb5:2 G5:2 Eb5:4 | F5:2 Ab5:2 C6:4 B5:2 Ab5:2 F5:4 | G5:4 B5:4 D6:4 F6:4 |' +
  'Eb6:6 C6:2 Ab5:8 | F6:6 D6:2 Bb5:8 | G6:4 F6:2 Eb6:2 Bb5:4 G5:4 | C6:12 r:4 |' +
  'Ab5:2 C6:2 Eb6:2 Ab6:6 G6:2 F6:2 | F6:4 Eb6:2 C6:2 Ab5:4 F5:4 | D6:4 F6:4 Ab6:4 F6:4 | G6:2 F6:2 D6:2 B5:2 G5:4 B4:4';

const castle: SongDef = {
  bpm: 150,
  stepsPerBar: 16,
  chords: 'Cm|Cm|Ab|G|Cm|Cm|Fm|G7|Ab|Bb|Eb|Cm|Ab|Fm|Ddim|G7',
  melody: castleMel,
  lead: 'brass',
  harmony: 'organ',
  arp: 'stab',
  arpPattern: ['C..C..C.........', 'C..C..C...C.C...'],
  arpLow: 55,
  bass: 'bass',
  bassPattern: ['R.RRO.RR5.RRO.3.', 'R.RRO.RR5.RR3.5.'],
  bassLow: 36,
  drums: ['K.hkS.hhK.KhS.hh', 'K.hkS.hhK.KhS.SS'],
  fill: 'K.hkS.hhttttSSSS',
  echo: { mix: 0.24, feedback: 0.32, steps: 3 },
  vibrato: { rate: 5.5, depth: 14 },
  mix: { harmony: 0.08, arp: 0.08, bass: 0.36 },
};

export const SONGS: Record<MusicName, SongDef> = {
  title,
  menu,
  circuit,
  plains,
  ghost,
  beach,
  rainbow,
  star,
  results,
  castle,
};
