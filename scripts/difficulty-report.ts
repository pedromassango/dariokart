/**
 * Measures how bot difficulty changes racing: average bot lap time, best bot lap,
 * off-track falls, and how many item hits bots land, per difficulty, over all courses.
 * Usage: npx tsx scripts/difficulty-report.ts
 */
import { Race, type Difficulty } from '../src/game/race';
import { Kart } from '../src/game/kart';
import { TRACKS } from '../src/game/tracks';
import { CHARACTERS } from '../src/game/characters';
import { botInput } from '../src/game/ai';

const rows: string[] = [];
for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
  let lapSum = 0, laps = 0, best = Infinity, falls = 0, hits = 0, drifts = 0, races = 0;
  for (const def of TRACKS) {
    for (const seed of [1, 2]) {
      const race = new Race({ track: def, laps: 3, difficulty: diff, mode: 'race', items: true, seed });
      CHARACTERS.forEach((c, i) => race.addKart(new Kart(c.id, c.name, c, i === 7 ? 'local' : 'bot'), i));
      const human = race.karts[7];
      const dt = 1 / 60;
      for (let t = 0; t < 400 && race.phase !== 'done'; t += dt) {
        const inputs = new Map();
        if (race.phase === 'racing') inputs.set(human.id, botInput(race, human, dt));
        race.update(dt, inputs);
        for (const e of race.events) if (e.type === 'sfx') {
          if (e.name === 'fall' && e.kart?.control === 'bot') falls++;
          if ((e.name === 'spinOut' || e.name === 'shellHit') && e.kart) hits++;
          if (e.name === 'driftStart' && e.kart?.control === 'bot') drifts++;
        }
        race.events.length = 0;
      }
      races++;
      for (const k of race.karts) if (k.control === 'bot') for (const lt of k.lapTimes) { lapSum += lt; laps++; best = Math.min(best, lt); }
    }
  }
  rows.push(`${diff.padEnd(7)} avg bot lap ${(lapSum / laps / 1000).toFixed(2)}s  best ${(best / 1000).toFixed(2)}s  drifts/race ${(drifts / races).toFixed(1)}  falls/race ${(falls / races).toFixed(1)}  spin-outs/race ${(hits / races).toFixed(1)}`);
}
console.log(rows.join('\n'));
