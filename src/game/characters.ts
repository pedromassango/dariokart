export type CharacterId = 'dario' | 'luigio' | 'pearl' | 'yoshio' | 'bowzer' | 'donkeyjr' | 'toadie' | 'koopo';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  /** kart body color */
  color: string;
  /** secondary/trim color */
  trim: string;
  skin: string;
  hat: string;
  /** emblem letter on the cap/kart */
  letter: string;
  // stats 1..5 like SMK classes
  accel: number;
  topSpeed: number;
  handling: number;
  weight: number;
}

// SMK-style classes: balanced (Dario/Luigio), accel (Pearl/Yoshio), heavy (Bowzer/DonkeyJr), handling (Toadie/Koopo)
export const CHARACTERS: CharacterDef[] = [
  { id: 'dario', name: 'Dario', color: '#e52521', trim: '#2050c8', skin: '#ffc49a', hat: '#e52521', letter: 'D', accel: 3, topSpeed: 3, handling: 3, weight: 3 },
  { id: 'luigio', name: 'Luigio', color: '#2fae3c', trim: '#2050c8', skin: '#ffc49a', hat: '#2fae3c', letter: 'L', accel: 3, topSpeed: 3, handling: 3, weight: 3 },
  { id: 'pearl', name: 'Pearl', color: '#ff7fc4', trim: '#ffffff', skin: '#ffd8b0', hat: '#ffd23f', letter: 'P', accel: 5, topSpeed: 2, handling: 3, weight: 2 },
  { id: 'yoshio', name: 'Yoshio', color: '#6bd13a', trim: '#e02020', skin: '#6bd13a', hat: '#6bd13a', letter: 'Y', accel: 5, topSpeed: 2, handling: 3, weight: 2 },
  { id: 'bowzer', name: 'Bowzer', color: '#f7a400', trim: '#2a8030', skin: '#f0c040', hat: '#e05010', letter: 'B', accel: 1, topSpeed: 5, handling: 2, weight: 5 },
  { id: 'donkeyjr', name: 'Donkey Jr', color: '#8b5a2b', trim: '#e02020', skin: '#f0b080', hat: '#8b5a2b', letter: 'J', accel: 2, topSpeed: 5, handling: 2, weight: 5 },
  { id: 'toadie', name: 'Toadie', color: '#2a6fe0', trim: '#ffffff', skin: '#ffd8b0', hat: '#ffffff', letter: 'T', accel: 4, topSpeed: 2, handling: 5, weight: 1 },
  { id: 'koopo', name: 'Koopo', color: '#ffd23f', trim: '#2fae3c', skin: '#ffe070', hat: '#2fae3c', letter: 'K', accel: 4, topSpeed: 2, handling: 5, weight: 1 },
];

export function charById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
