import type { RiveAssets } from '../rive/assets';
import type { RiveRuntime } from '../rive/runtime';

/**
 * Bakes the Rive billboard artboards (trees, bushes, flags, signs, the start banner, the crowd…) into one
 * RGBA texture atlas with a mip chain. The GPU world uploads it once and draws those billboards inside
 * its depth-tested pass, so scenery is hidden by whatever stands in front of it (karts, walls, hills)
 * instead of being painted over the 3D world.
 */

export interface AtlasEntry { artboard: string; inputs?: Record<string, number | boolean> }
export interface AtlasRect { u0: number; v0: number; u1: number; v1: number }

export interface SpriteAtlas {
  rects: Map<string, AtlasRect>;
  /** "width,height,levels;<base64 of every mip level, largest first>" for the World view model */
  text: string;
}

export const ATLAS_SIZE = 1024;
const PAD = 6;

/** atlas key of an artboard drawn with the given state machine inputs */
export function atlasKey(artboard: string, inputs?: Record<string, number | boolean>): string {
  if (!inputs) return artboard;
  return artboard + '?' + Object.keys(inputs).sort().map((k) => k + '=' + inputs[k]).join('&');
}

/** pixel height each artboard gets in the atlas (tall scenery gets more texels) */
const HEIGHT: Record<string, number> = {
  Tree: 220, Palm: 236, DeadTree: 220, Cactus: 200, Lamp: 240, Flag: 236, Bush: 100,
  Boo: 112, Penguin: 112, Mole: 96, Item_star: 100, Banner: 120, TurnSign: 176, Crowd: 136, AdBoard_1: 120,
  AdBoard_2: 120, AdBoard_3: 120, AdBoard_4: 120,
};

let cache: SpriteAtlas | null = null;

/** canvas-advanced commits a renderer's draws when the Rive animation frame that issued them ends */
function inRiveFrame(rive: RiveRuntime, fn: () => void): Promise<void> {
  return new Promise((resolve) => rive.requestAnimationFrame(() => { fn(); resolve(); }));
}

export async function buildSpriteAtlas(rive: RiveRuntime, assets: RiveAssets, entries: AtlasEntry[]): Promise<SpriteAtlas | null> {
  if (cache) {
    if (entries.every((e) => cache!.rects.has(atlasKey(e.artboard, e.inputs)))) return cache;
  }
  const file = assets.file;
  if (!file) return null;
  // every artboard that can appear, so one atlas serves all courses
  const all = new Map<string, AtlasEntry>();
  for (const e of [...defaultEntries(), ...entries]) if (assets.has(e.artboard)) all.set(atlasKey(e.artboard, e.inputs), e);

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const renderer = rive.makeRenderer(canvas);
  // shelf packing, tallest first
  const items = [...all.entries()].map(([key, e]) => {
    const ab = file.artboardByName(e.artboard);
    const b = ab.bounds;
    const aspect = (b.maxX - b.minX) / Math.max(1, b.maxY - b.minY);
    let h = HEIGHT[e.artboard] ?? 140;
    let w = Math.round(h * aspect);
    if (w > 600) { h = Math.round(h * 600 / w); w = 600; }
    return { key, e, ab, w, h };
  }).sort((a, b) => b.h - a.h);
  const rects = new Map<string, AtlasRect>();
  let x = PAD, y = PAD, rowH = 0;
  await inRiveFrame(rive, () => {
    renderer.clear();
    for (const it of items) {
      if (x + it.w + PAD > ATLAS_SIZE) { x = PAD; y += rowH + PAD * 2; rowH = 0; }
      if (y + it.h + PAD > ATLAS_SIZE) { console.warn('[dariokart] sprite atlas full at', it.key); break; }
      const ab = it.ab;
      if (ab.stateMachineCount() > 0) {
        const sm = new rive.StateMachineInstance(ab.stateMachineByName('Main') ?? ab.stateMachineByIndex(0), ab);
        for (let i = 0; i < sm.inputCount(); i++) {
          const inp = sm.input(i), v = it.e.inputs?.[inp.name];
          if (v === undefined) continue;
          if (inp.type === rive.SMIInput.bool) inp.asBool().value = !!v;
          else if (inp.type === rive.SMIInput.number) inp.asNumber().value = Number(v);
        }
        sm.advance(0);
        sm.advance(0.4);
      }
      ab.advance(0.4);
      renderer.save();
      renderer.align(rive.Fit.fill, rive.Alignment.center, { minX: x, minY: y, maxX: x + it.w, maxY: y + it.h }, ab.bounds);
      ab.draw(renderer);
      renderer.restore();
      // half a texel inset keeps bilinear filtering inside the cell
      rects.set(it.key, { u0: (x + 0.5) / ATLAS_SIZE, v0: (y + 0.5) / ATLAS_SIZE, u1: (x + it.w - 0.5) / ATLAS_SIZE, v1: (y + it.h - 0.5) / ATLAS_SIZE });
      x += it.w + PAD * 2;
      rowH = Math.max(rowH, it.h);
    }
    renderer.flush?.();
  });
  await inRiveFrame(rive, () => {});
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (import.meta.env.DEV) (window as unknown as { __dkAtlas: HTMLCanvasElement }).__dkAtlas = canvas;
  const base = ctx.getImageData(0, 0, ATLAS_SIZE, ATLAS_SIZE).data;
  bleed(base, ATLAS_SIZE, ATLAS_SIZE);
  const levels: Uint8ClampedArray[] = [base];
  for (let s = ATLAS_SIZE; s > 1; s >>= 1) levels.push(halve(levels[levels.length - 1], s));
  let total = 0;
  for (const l of levels) total += l.length;
  const all8 = new Uint8Array(total);
  let o = 0;
  for (const l of levels) { all8.set(l, o); o += l.length; }
  cache = { rects, text: `${ATLAS_SIZE},${ATLAS_SIZE},${levels.length};${toBase64(all8)}` };
  return cache;
}

function defaultEntries(): AtlasEntry[] {
  return ['Tree', 'Bush', 'Palm', 'DeadTree', 'Cactus', 'Lamp', 'Flag', 'Boo', 'Penguin', 'Mole', 'Item_star', 'Banner', 'Crowd',
    'AdBoard_1', 'AdBoard_2', 'AdBoard_3', 'AdBoard_4'].map((artboard): AtlasEntry => ({ artboard }))
    .concat([{ artboard: 'TurnSign', inputs: { dir: 1 } }, { artboard: 'TurnSign', inputs: { dir: -1 } }]);
}

/** copies the colour of opaque neighbours into transparent texels so filtering does not pull in black fringes */
function bleed(px: Uint8ClampedArray, w: number, h: number) {
  for (let pass = 0; pass < 4; pass++) {
    const src = px.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 0) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        if (src[j + 3] === 0 && (src[j] | src[j + 1] | src[j + 2]) === 0) continue;
        r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
      }
      if (n) { px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; }
    }
  }
}

/** box-filtered half-size level; colour weighted by alpha so edges keep their hue */
function halve(src: Uint8ClampedArray, s: number): Uint8ClampedArray {
  const d = s >> 1, out = new Uint8ClampedArray(d * d * 4);
  for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((y * 2 + oy) * s + x * 2 + ox) * 4, al = src[i + 3] + 1;
      r += src[i] * al; g += src[i + 1] * al; b += src[i + 2] * al; a += al;
    }
    const o = (y * d + x) * 4;
    out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a;
    let alpha = 0;
    for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) alpha += src[((y * 2 + oy) * s + x * 2 + ox) * 4 + 3];
    out[o + 3] = alpha / 4;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}
