// Validates a .riv file with the real Rive WASM runtime (@rive-app/canvas-advanced).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pkg = path.join(root, 'node_modules/@rive-app/canvas-advanced');

let rivePromise = null;
export function loadRive() {
  if (!rivePromise) {
    rivePromise = (async () => {
      const mod = await import(path.join(pkg, 'canvas_advanced.mjs'));
      return mod.default({ wasmBinary: fs.readFileSync(path.join(pkg, 'rive.wasm')) });
    })();
  }
  return rivePromise;
}

const TYPE_NAMES = { 56: 'number', 59: 'bool', 58: 'trigger' };

/**
 * expect: { [artboardName]: { width, height, inputs: { name: 'number'|'bool'|'trigger' } } }
 * Returns a report object; throws on failure.
 */
export async function validate(bytes, expect = {}, { verbose = false, frames = 240 } = {}) {
  const rive = await loadRive();
  const file = await rive.load(new Uint8Array(bytes));
  if (!file) throw new Error('Rive runtime rejected the file (null)');
  const count = file.artboardCount();
  const report = [];
  const errors = [];
  const names = [];
  for (let i = 0; i < count; i++) {
    const ab = file.artboardByIndex(i);
    names.push(ab.name);
  }
  for (const name of Object.keys(expect)) if (!names.includes(name)) errors.push(`missing artboard ${name}`);
  for (const name of names) {
    const ab = file.artboardByName(name);
    const b = ab.bounds;
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    const exp = expect[name] || {};
    if ((exp.width && Math.abs(w - exp.width) > 0.01) || (exp.height && Math.abs(h - exp.height) > 0.01)) errors.push(`${name}: size ${w}x${h} != ${exp.width}x${exp.height}`);
    const sm = ab.stateMachineByName('Main');
    if (!sm) { errors.push(`${name}: no state machine 'Main'`); continue; }
    const smi = new rive.StateMachineInstance(sm, ab);
    const inputs = {};
    for (let j = 0; j < smi.inputCount(); j++) {
      const inp = smi.input(j);
      inputs[inp.name] = { type: TYPE_NAMES[inp.type] ?? inp.type, inp };
    }
    for (const [iname, itype] of Object.entries(exp.inputs || {})) {
      if (!inputs[iname]) errors.push(`${name}: missing input ${iname}`);
      else if (inputs[iname].type !== itype) errors.push(`${name}: input ${iname} is ${inputs[iname].type}, expected ${itype}`);
    }
    // exercise
    const step = 1 / 60;
    const scenarios = exp.scenarios || [{}];
    let changes = 0;
    for (const sc of scenarios) {
      for (const [k, v] of Object.entries(sc)) {
        const ii = inputs[k]; if (!ii) continue;
        if (ii.type === 'number') ii.inp.asNumber().value = v;
        else if (ii.type === 'bool') ii.inp.asBool().value = v;
        else if (ii.type === 'trigger' && v) ii.inp.asTrigger().fire();
      }
      for (let f = 0; f < frames / scenarios.length; f++) {
        smi.advance(step);
        ab.advance(step);
        changes += smi.stateChangedCount();
      }
    }
    report.push({ name, size: `${w}x${h}`, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.type])), stateChanges: changes });
    smi.delete?.();
    ab.delete?.();
  }
  if (verbose) for (const r of report) console.log(`  ${r.name.padEnd(18)} ${r.size.padEnd(9)} inputs=${JSON.stringify(r.inputs)} stateChanges=${r.stateChanges}`);
  if (errors.length) throw new Error('Validation failed:\n  ' + errors.join('\n  '));
  return { artboards: names, report };
}

// CLI: node validate.mjs [file.riv]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = process.argv[2] || path.join(root, 'public/assets/dariokart.riv');
  const { CONTRACT } = await import('./contract.mjs');
  validate(fs.readFileSync(f), CONTRACT, { verbose: true })
    .then((r) => console.log(`OK: ${r.artboards.length} artboards valid in ${f}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
