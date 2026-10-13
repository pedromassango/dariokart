// Records a deterministic 30fps demo of Dariokart: every frame advances the game exactly 1/30 s.
// usage: node record.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
page.on('pageerror', (e) => console.log('page error:', e.message));

let n = 0;
async function frames(count, each) {
  for (let i = 0; i < count; i++) {
    if (each) await each(i);
    await page.evaluate((f) => { window.__frame = f; return window.dariokart.app.requestStep(); }, n);
    await page.screenshot({ path: path.join(out, `f${String(n++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
}
const key = (k) => page.keyboard.press(k);
const js = (fn, arg) => page.evaluate(fn, arg);

await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.dariokart?.app, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await js(() => { window.dariokart.app.stepMode = true; });
await page.waitForTimeout(300);
// log every audio call the game makes, stamped with its frame, so audio.mjs can replay the exact soundtrack;
// while __mute is set (off-camera fast-forwards) only the music choice is kept
await js(() => {
  const A = window.dariokart.audio;
  window.__frame = 0; window.__mute = false;
  window.__cues = [[0, 'playMusic', [A.getMusic() ?? 'title']]];
  for (const m of ['playSfx', 'playMusic', 'stopMusic', 'setMusicTempo', 'setEngine']) {
    const f = A[m].bind(A);
    A[m] = (...a) => {
      if (!window.__mute || m === 'playMusic' || m === 'setMusicTempo') window.__cues.push([window.__frame, m, JSON.parse(JSON.stringify(a))]);
      return f(...a);
    };
  }
});
const shots = {};

// 1) title over the live 3D attract race
await frames(75);
// 2) menus: main → VS race → difficulty → driver → course
await key('Enter'); await frames(40);
await key('ArrowDown'); await frames(20);
await key('Enter'); await frames(30); // difficulty
await key('ArrowUp'); await frames(15); // highlight EASY
await key('Enter'); await frames(45); // driver select
await key('ArrowRight'); await frames(18); await key('ArrowLeft'); await frames(18);
await key('Enter'); await frames(45); shots.select = n - 5; // course select
await key('Enter'); // start race on Dario Circuit
// 3) intro flyover + countdown; rocket start on the last light
await frames(150, async (i) => { if (i === 128) await page.keyboard.down('ArrowUp'); });
// autopilot drives the player kart (camera still follows it)
await js(() => { const s = window.dariokart.app.session; s.race.karts.find((k) => k.control === 'local').control = 'bot'; });
await page.keyboard.up('ArrowUp');
await frames(90);

/**
 * One staged highlight: start `track`, skip its intro off camera, put the player on sample `at` at full speed with
 * the camera snapped behind, and line opponents up `[ahead samples, lane -1..1, speed factor]` in front.
 */
async function clip(track, at, lane, pack, noBoxes = false) {
  await js((t) => { window.__mute = true; window.dariokart.app.endSession(); window.dariokart.menus.quickStart('race', t); }, track);
  await page.waitForTimeout(200);
  await js(({ at, lane, pack, noBoxes }) => {
    const s = window.dariokart.app.session, r = s.race, t = r.track;
    for (let i = 0; i < 60 * 9; i++) s.update(1 / 60);
    const me = r.karts.find((k) => k.id === 'p1');
    me.control = 'bot';
    const others = r.karts.filter((k) => k !== me);
    const place = (k, i, lat, speed) => {
      i = ((i % t.n) + t.n) % t.n;
      if (lat === 'line') lat = t.racingLine[i];
      k.x = t.x[i] + t.nx[i] * lat * t.halfW; k.y = t.y[i] + t.ny[i] * lat * t.halfW; k.z = 0; k.vz = 0;
      k.heading = Math.atan2(t.ty[i], t.tx[i]); k.idx = i; k.lastSafeIdx = i;
      k.uidx = t.n + i; k.raceDist = k.uidx; k.speed = speed;
      k.vx = Math.cos(k.heading) * speed; k.vy = Math.sin(k.heading) * speed;
      k.spinTimer = 0; k.squishTimer = 0; k.shrinkTimer = 0; k.starTimer = 0; k.boostTimer = 0; k.invulnTimer = 0; k.fallTimer = 0;
      k.drift = 0; k.item = null; k.rouletteTimer = 0; k.ai.itemDelay = 99; k.ai.mistakeTimer = 0;
    };
    const top = r.maxSpeedFor(me);
    place(me, at, lane, top);
    // spread the rest of the field far behind so only the staged pack is on screen
    others.forEach((k, j) => j < pack.length ? place(k, at + pack[j][0], pack[j][1], top * pack[j][2]) : place(k, at - 40 - j * 6, (j % 2) - 0.5, top * 0.8));
    r.items.length = 0;
    if (noBoxes) t.itemBoxes.length = 0;
    me.ai.itemDelay = 99;
    s.cams[0].init = false; s.cams[0].hx = 0;
    window.__reel = {
      me, r,
      fire(item, aim = -1) {
        me.item = item; r.useItemIfPressed(me, { steer: 0, accel: true, brake: false, hop: false, item: true, back: false });
        // aim a straight shot at a staged kart (lead it by its speed), like a player throwing at an angle
        const e = r.items[r.items.length - 1], o = aim >= 0 ? others[aim] : null;
        if (e && o) {
          const sp = Math.hypot(e.vx, e.vy), tt = Math.hypot(o.x - e.x, o.y - e.y) / Math.max(1, sp - o.speed * 0.5);
          const dx = o.x + o.vx * tt - e.x, dy = o.y + o.vy * tt - e.y, d = Math.hypot(dx, dy);
          e.vx = dx / d * sp; e.vy = dy / d * sp;
        }
      },
    };
    window.__mute = false;
  }, { at, lane, pack, noBoxes });
}
const fire = (item, aim = -1) => js(([it, a]) => window.__reel.fire(it, a), [item, aim]);

// action reel (this part becomes the README GIF): mushroom, shells, star and lightning, each staged on a straight
const reelStart = n;
// mushroom: blast through the pack on the circuit's main straight
await clip('circuit', 446, 0, [[5, -0.45, 0.82], [7, 0.4, 0.82], [10, -0.05, 0.84], [13, 0.5, 0.86], [15, -0.45, 0.86]]);
await frames(12); await fire('mushroom'); await frames(58); shots.race = n - 48;
// red shell curves in on the kart ahead
await clip('circuit', 359, 'line', [[8, 0.35, 0.62]], true);
await frames(10); await fire('redShell'); await frames(40);
// green shell straight down the castle's lava bridge
await clip('castle', 507, -0.2, [[8, 0.4, 0.6], [13, -0.4, 0.8]], true);
await frames(8); await fire('greenShell', 0); await frames(40);
// star: plough through the pack
await clip('circuit', 359, 0, [[3, -0.2, 0.72], [5, 0.25, 0.72], [7, -0.25, 0.74], [9, 0.2, 0.74], [12, 0, 0.76]]);
await frames(6); await fire('star'); await frames(80); shots.star = n - 26;
// lightning shrinks the field
await clip('circuit', 450, 0, [[4, 0.0, 0.8], [7, 0.4, 0.82], [9, -0.4, 0.82]]);
await frames(10); await fire('lightning'); await frames(56);
fs.writeFileSync(path.join(out, 'gif-range.txt'), `${reelStart} ${n - reelStart}\n`);

// 5) quick cuts to other courses (skip their intros off-camera)
async function cut(track, count, setup) {
  await js((t) => { window.__mute = true; window.dariokart.app.endSession(); window.dariokart.menus.quickStart('race', t); }, track);
  await page.waitForTimeout(200);
  await js(() => { const s = window.dariokart.app.session; for (let i = 0; i < 60 * 5.3; i++) s.update(1 / 60); const me = s.race.karts.find((k) => k.id === 'p1'); me.control = 'bot'; for (let i = 0; i < 60 * 6; i++) s.update(1 / 60); window.__mute = false; });
  if (setup) await js(setup);
  await frames(count);
}
await cut('choco', 70); shots.choco = n - 30;
await cut('ice', 60); shots.ice = n - 25;
await cut('beach', 60);
await cut('ghost', 60);
// 6) Prism Road: finish the final lap → referee flag, GOAL banner, results
await cut('rainbow', 60);
await js(() => {
  const s = window.dariokart.app.session; const r = s.race; const me = r.karts.find((k) => k.id === 'p1');
  const n = r.track.n; const i = n - 14;
  me.x = r.track.x[i]; me.y = r.track.y[i]; me.heading = Math.atan2(r.track.ty[i], r.track.tx[i]); me.idx = i;
  me.control = 'local'; me.uidx = n * 3 - 14; me.raceDist = me.uidx; me.maxLapStarted = 3; me.lapTimes = [26310, 24870];
  me.vx = Math.cos(me.heading) * 120; me.vy = Math.sin(me.heading) * 120;
  for (const k of r.karts) if (k !== me) { k.uidx = Math.min(k.uidx, me.uidx - 40); k.raceDist = k.uidx; }
});
await page.keyboard.down('ArrowUp');
await frames(200); shots.prism = n - 120;
await page.keyboard.up('ArrowUp');
fs.writeFileSync(path.join(out, 'shots.txt'), Object.entries(shots).map(([k, v]) => `${String(v).padStart(5, '0')}:${k}`).join(' ') + '\n');
fs.writeFileSync(path.join(out, 'cues.json'), JSON.stringify({ seconds: n / 30, cues: await js(() => window.__cues) }));
await browser.close();
console.log('frames', n);
