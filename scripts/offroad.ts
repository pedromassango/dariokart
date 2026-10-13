/**
 * Measures how much bots leave the road (off-road / grass and corner cutting) on every track.
 * Usage: npx tsx scripts/offroad.ts [trackId]
 */
import { Race, type Difficulty } from '../src/game/race';
import { Kart, type KartInput } from '../src/game/kart';
import { TRACKS } from '../src/game/tracks';
import { CHARACTERS } from '../src/game/characters';
import { botInput } from '../src/game/ai';

const only = process.argv[2];
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const race = new Race({ track: def, laps: 3, difficulty: diff, mode: 'race', items: false, seed: 77 });
    CHARACTERS.forEach((c, i) => race.addKart(new Kart(c.id, c.name, c, i === 7 ? 'local' : 'bot'), i));
    const human = race.karts[7];
    let samples = 0, off = 0, curb = 0, worst = 0;
    const dt = 1 / 60;
    let t = 0;
    while (race.phase !== 'done' && t < 400) {
      const inputs = new Map<string, KartInput>();
      if (race.phase === 'racing') inputs.set(human.id, botInput(race, human, dt));
      race.update(dt, inputs);
      race.events.length = 0;
      if (race.phase === 'racing') for (const k of race.karts) {
        if (k === human || k.finished || k.fallTimer > 0) continue;
        samples++;
        if (k.surface === 'offroad') off++;
        if (k.surface === 'curb') curb++;
        const q = race.track.query(k.x, k.y);
        worst = Math.max(worst, Math.abs(q.lateral) - race.track.halfW);
      }
      t += dt;
    }
    console.log(`${def.id.padEnd(8)} ${diff.padEnd(6)} offroad ${(100 * off / samples).toFixed(1)}%  curb ${(100 * curb / samples).toFixed(1)}%  max beyond road edge ${worst.toFixed(0)}`);
  }
}
