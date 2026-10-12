/**
 * Headless race simulation: runs full races on every track and difficulty with the bot AI
 * (one "human" kart is driven by the AI too) and reports lap times, falls and sanity checks.
 * Usage: npx tsx scripts/simulate.ts [trackId] [difficulty]
 */
import { Race, type Difficulty } from '../src/game/race';
import { Kart, type KartInput } from '../src/game/kart';
import { TRACKS } from '../src/game/tracks';
import { CHARACTERS } from '../src/game/characters';
import { botInput } from '../src/game/ai';
import { formatTime } from '../src/game/util';

const onlyTrack = process.argv[2];
const onlyDiff = process.argv[3] as Difficulty | undefined;
let failures = 0;

for (const def of TRACKS) {
  if (onlyTrack && onlyTrack !== 'all' && def.id !== onlyTrack) continue;
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    if (onlyDiff && diff !== onlyDiff) continue;
    const race = new Race({ track: def, laps: 3, difficulty: diff, mode: 'race', items: true, seed: 1234 });
    CHARACTERS.forEach((c, i) => {
      const k = new Kart(c.id, c.name, c, i === 7 ? 'local' : 'bot');
      race.addKart(k, i);
    });
    const human = race.karts[7];
    const falls = new Map<string, number>();
    let hits = 0;
    const dt = 1 / 60;
    let t = 0;
    while (race.phase !== 'done' && t < 400) {
      const inputs = new Map<string, KartInput>();
      // the "human" is an AI at medium skill (botInput treats non-bots as medium)
      if (race.phase === 'racing') inputs.set(human.id, botInput(race, human, dt));
      race.update(dt, inputs);
      for (const e of race.events) {
        if (e.type === 'sfx' && e.name === 'fall' && e.kart) falls.set(e.kart.id, (falls.get(e.kart.id) ?? 0) + 1);
        if (e.type === 'sfx' && (e.name === 'spinOut' || e.name === 'shellHit')) hits++;
      }
      race.events.length = 0;
      for (const k of race.karts) {
        if (!Number.isFinite(k.x) || !Number.isFinite(k.y) || !Number.isFinite(k.raceDist)) { console.log('NaN!', k.id); failures++; t = 1e9; }
      }
      t += dt;
    }
    const st = race.finalStandings();
    const finished = race.karts.filter((k) => k.finished).length;
    const hl = human.lapTimes.map((x) => formatTime(x)).join(' ');
    const ok = race.phase === 'done' && human.finished;
    if (!ok) failures++;
    const fallTotal = [...falls.values()].reduce((a, b) => a + b, 0);
    console.log(`${ok ? 'OK ' : 'BAD'} ${def.id.padEnd(8)} ${diff.padEnd(6)} sim ${t.toFixed(0)}s  human: ${human.place}${human.finished ? '' : '(dnf)'} laps[${hl}]  finished ${finished}/8  falls ${fallTotal}  hits ${hits}  winner ${st[0].name} ${formatTime(st[0].finishTime)}`);
  }
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL RACES COMPLETED');
process.exit(failures ? 1 : 0);
