// Generates public/assets/dariokart.riv and validates it with the Rive runtime.
// Usage: node scripts/rivgen/build.mjs [--only=Logo,Kart_] [--no-validate]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAssets } from './assets.mjs';
import { validate } from './validate.mjs';
import { CONTRACT } from './contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../public/assets/dariokart.riv');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');

const file = buildAssets({ only });
const bytes = file.build();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bytes);
if (file.glyphWidths) {
  const gj = path.join(path.dirname(out), 'glyphs.json');
  // flat { char: artboardWidth } map; height is always 64, baseline y=56. 'x' and '×' both map to Glyph_x.
  const flat = Object.fromEntries(Object.entries(file.glyphWidths).filter(([c]) => c !== ' '));
  fs.writeFileSync(gj, JSON.stringify(flat) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), gj)}`);
}
console.log(`wrote ${path.relative(process.cwd(), out)} (${(bytes.length / 1024).toFixed(1)} KB, ${file.artboards.length} artboards)`);

if (!args.includes('--no-validate')) {
  const expect = only ? Object.fromEntries(Object.entries(CONTRACT).filter(([k]) => only.some((o) => k.startsWith(o)))) : CONTRACT;
  try {
    const r = await validate(bytes, expect, { verbose: true });
    console.log(`validation OK (${r.artboards.length} artboards)`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
