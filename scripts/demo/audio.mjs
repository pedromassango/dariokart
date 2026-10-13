// Records the game's own procedural audio (music + SFX + engine) in real time by replaying the audio calls
// record.mjs logged frame by frame (cues.json), so every boost, shell and star lands on its frame.
// usage: node audio.mjs <cues.json> <out.webm>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const { seconds, cues } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.dariokart?.audio, null, { timeout: 30000 });

const b64 = await page.evaluate(async ({ seconds, cues }) => {
  const A = window.dariokart.audio;
  await A.unlock();
  const tap = A.debugTap();
  const ctx = tap.analyser.context;
  const dest = ctx.createMediaStreamDestination();
  tap.analyser.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const T = seconds + 0.5;
  // group the logged calls by frame (30 fps)
  const ev = [];
  for (const [f, m, a] of cues) {
    const last = ev[ev.length - 1];
    if (last && last[0] === f / 30) last[1].push([m, a]); else ev.push([f / 30, [[m, a]]]);
  }
  rec.start(250);
  const t0 = performance.now();
  for (const [t, calls] of ev) {
    const wait = t * 1000 - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    for (const [m, a] of calls) {
      // each staged clip restarts its course; keep the song flowing across cuts that stay on the same music
      if (m === 'playMusic' && a[0] === A.getMusic()) continue;
      A[m](...a);
    }
  }
  await new Promise((r) => setTimeout(r, T * 1000 - (performance.now() - t0)));
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}, { seconds, cues });
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
await browser.close();
console.log('audio bytes', fs.statSync(out).size);
