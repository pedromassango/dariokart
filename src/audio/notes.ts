// Note / chord parsing helpers for the procedural music engine.

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#5" / "Bb4" / "E6" -> MIDI number (C4 = 60). Returns NaN on bad input. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return NaN;
  let n = NOTE_INDEX[m[1]];
  if (m[2] === '#') n += 1;
  else if (m[2] === 'b') n -= 1;
  return n + (parseInt(m[3], 10) + 1) * 12;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
};

export interface Chord {
  /** pitch class 0..11 */
  root: number;
  /** semitone intervals from root, ascending */
  intervals: number[];
}

export function parseChord(sym: string): Chord {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  if (!m) return { root: 0, intervals: [0, 4, 7] };
  let root = NOTE_INDEX[m[1]];
  if (m[2] === '#') root += 1;
  else if (m[2] === 'b') root -= 1;
  root = (root + 12) % 12;
  const intervals = QUALITIES[m[3]] ?? QUALITIES[''];
  return { root, intervals };
}

/** MIDI of chord root placed so that it lies within [low, low+11]. */
export function rootInRange(chord: Chord, low: number): number {
  return low + ((chord.root - (low % 12) + 120) % 12);
}
