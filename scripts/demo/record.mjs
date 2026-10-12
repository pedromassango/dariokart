// Records a deterministic 30fps demo of Dariokart: every frame advances the game exactly 1/30 s.
// usage: node record.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.log('console error:', m.text()); });
page.on('pageerror', (e) => console.log('page error:', e.message));

let n = 0;
async function frames(count, each) {
  for (let i = 0; i < count; i++) {
    if (each) await each(i);
    await page.evaluate(() => window.dariokart.app.requestStep());
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

// 1) title over the live 3D attract race
await frames(75);
// 2) menus: main → VS race → difficulty → driver → course
await key('Enter'); await frames(40);
await key('ArrowDown'); await frames(20);
await key('Enter'); await frames(30); // difficulty
await key('ArrowUp'); await frames(15); // highlight EASY
await key('Enter'); await frames(45); // driver select
await key('ArrowRight'); await frames(18); await key('ArrowLeft'); await frames(18);
await key('Enter'); await frames(45); // course select
await key('Enter'); // start race on Dario Circuit
// 3) intro flyover + countdown; rocket start on the last light
await frames(150, async (i) => { if (i === 128) await page.keyboard.down('ArrowUp'); });
// autopilot drives the player kart (camera still follows it)
await js(() => { const s = window.dariokart.app.session; s.race.karts.find((k) => k.control === 'local').control = 'bot'; });
await page.keyboard.up('ArrowUp');
await frames(200, async (i) => {
  if (i === 60) await js(() => { const s = window.dariokart.app.session; s.race.karts.find((k) => k.id === 'p1').item = 'mushroom'; });
  if (i === 130) await js(() => { const s = window.dariokart.app.session; s.race.karts.find((k) => k.id === 'p1').item = 'redShell'; });
});

// 4) quick cuts to other courses (skip their intros off-camera)
async function cut(track, count, setup) {
  await js((t) => { window.dariokart.app.endSession(); window.dariokart.menus.quickStart('race', t); }, track);
  await page.waitForTimeout(200);
  await js(() => { const s = window.dariokart.app.session; for (let i = 0; i < 60 * 5.3; i++) s.update(1 / 60); const me = s.race.karts.find((k) => k.id === 'p1'); me.control = 'bot'; for (let i = 0; i < 60 * 6; i++) s.update(1 / 60); });
  if (setup) await js(setup);
  await frames(count);
}
await cut('castle', 80);
await cut('choco', 80);
await cut('ice', 80);
await cut('beach', 70);
await cut('ghost', 70);
// 5) Prism Road: finish the final lap → referee flag, GOAL banner, results
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
await frames(200);
await page.keyboard.up('ArrowUp');
await browser.close();
console.log('frames', n);
