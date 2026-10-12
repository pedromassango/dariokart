// Records the game's own procedural audio (music + SFX + engine) in real time, following the demo timeline.
// usage: node audio.mjs <out.webm>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const out = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.dariokart?.audio, null, { timeout: 30000 });

const b64 = await page.evaluate(async () => {
  const A = window.dariokart.audio;
  await A.unlock();
  const tap = A.debugTap();
  const ctx = tap.analyser.context;
  const dest = ctx.createMediaStreamDestination();
  tap.analyser.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const T = 43.3;
  // timeline (seconds) matching record.mjs
  const ev = [
    [0.0, () => A.playMusic('title')],
    [2.5, () => { A.playSfx('menuSelect'); A.playMusic('menu'); }],
    [3.8, () => A.playSfx('menuMove')], [4.5, () => A.playSfx('menuSelect')],
    [5.5, () => A.playSfx('menuMove')], [6.0, () => A.playSfx('menuSelect')],
    [7.5, () => A.playSfx('menuMove')], [8.1, () => A.playSfx('menuMove')], [8.7, () => A.playSfx('menuSelect')],
    [10.2, () => { A.playSfx('menuSelect'); A.setMusicTempo(1, true); A.playMusic('circuit'); }],
    [12.8, () => { A.playSfx('countdownBeep'); A.setEngine({ running: true, speed01: 0.05, onRoad: true, drifting: false, boosting: false }); }],
    [13.8, () => A.playSfx('countdownBeep')],
    [14.8, () => { A.playSfx('countdownGo'); A.playSfx('boost'); A.setEngine({ running: true, speed01: 0.9, onRoad: true, drifting: false, boosting: true }); }],
    [15.8, () => A.setEngine({ running: true, speed01: 0.85, onRoad: true, drifting: false, boosting: false })],
    [16.4, () => A.playSfx('itemBox')], [16.6, () => A.playSfx('coin')],
    [17.2, () => { A.playSfx('boost'); A.setEngine({ running: true, speed01: 1, onRoad: true, drifting: false, boosting: true }); }],
    [18.4, () => A.setEngine({ running: true, speed01: 0.85, onRoad: true, drifting: true, boosting: false })],
    [19.5, () => { A.playSfx('shellFire'); A.setEngine({ running: true, speed01: 0.85, onRoad: true, drifting: false, boosting: false }); }],
    [20.6, () => A.playSfx('shellHit', { volume: 0.6 })],
    [21.9, () => A.playMusic('castle')],
    [23.0, () => A.playSfx('driftStart')], [23.1, () => A.setEngine({ running: true, speed01: 0.8, onRoad: true, drifting: true, boosting: false })],
    [24.2, () => { A.playSfx('miniTurbo'); A.setEngine({ running: true, speed01: 0.95, onRoad: true, drifting: false, boosting: true }); }],
    [24.5, () => { A.playMusic('plains'); A.setEngine({ running: true, speed01: 0.85, onRoad: true, drifting: false, boosting: false }); }],
    [26.0, () => A.playSfx('coin')],
    [27.2, () => A.playMusic('beach')],
    [28.4, () => A.playSfx('itemBox')],
    [29.9, () => A.playMusic('beach')],
    [32.2, () => A.playMusic('ghost')],
    [33.4, () => A.playSfx('bananaHit', { volume: 0.5 })],
    [34.5, () => { A.playMusic('rainbow'); A.setMusicTempo(1.15); A.playSfx('finalLap'); }],
    [37.5, () => { A.playSfx('finishWin'); A.setEngine({ running: false, speed01: 0, onRoad: true, drifting: false, boosting: false }); }],
    [38.8, () => { A.setMusicTempo(1); A.playMusic('results'); }],
  ];
  rec.start(250);
  const t0 = performance.now();
  for (const [t, fn] of ev) {
    const wait = t * 1000 - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    fn();
  }
  await new Promise((r) => setTimeout(r, T * 1000 - (performance.now() - t0)));
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
await browser.close();
console.log('audio bytes', fs.statSync(out).size);
