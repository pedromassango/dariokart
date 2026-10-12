import * as THREE from 'three';
import { mulberry32 } from '../game/util';

/** Procedural canvas textures for the 3D courses (no image assets needed). */

const cache = new Map<string, THREE.Texture>();
let maxAniso = 4;
export function setMaxAnisotropy(v: number) { maxAniso = v; }

function canvasTex(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** fills with base color + per-pixel noise of given amplitude, plus optional blotches */
function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, amp: number, seed: number, blotch = 0) {
  const [r, g, b] = hexRgb(base);
  const img = ctx.createImageData(w, h);
  const rnd = mulberry32(seed);
  // low-frequency value noise for blotches
  const grid = 16;
  const lf: number[] = [];
  for (let i = 0; i < grid * grid; i++) lf.push(rnd() * 2 - 1);
  const lfAt = (x: number, y: number) => {
    const gx = (x / w) * grid, gy = (y / h) * grid;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
    const v = (ix: number, iy: number) => lf[((iy % grid) * grid + (ix % grid)) % lf.length];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
    const c = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
    return a + (c - a) * sy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (rnd() * 2 - 1) * amp + (blotch ? lfAt(x, y) * blotch : 0);
      const i = (y * w + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r + n));
      img.data[i + 1] = Math.max(0, Math.min(255, g + n));
      img.data[i + 2] = Math.max(0, Math.min(255, b + n));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const tex = {
  asphalt: () => canvasTex('asphalt', 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#4a4c55', 18, 11, 10);
    const rnd = mulberry32(5);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }),
  grass: (base = '#4fae3c') => canvasTex('grass' + base, 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, base, 14, 21, 14);
    // mowed stripes
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(0, (i * h) / 8, w, h / 8);
    }
    const rnd = mulberry32(9);
    for (let i = 0; i < 2600; i++) {
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(20,90,20,0.35)' : 'rgba(170,230,120,0.25)';
      const x = rnd() * w, y = rnd() * h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4); ctx.stroke();
    }
  }),
  sand: () => canvasTex('sand', 512, 512, (ctx, w, h) => noiseFill(ctx, w, h, '#e8d098', 16, 31, 12)),
  dirt: () => canvasTex('dirt', 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#b88a55', 20, 41, 18);
    const rnd = mulberry32(3);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? '90,60,30' : '230,200,150'},0.5)`;
      ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }),
  planks: () => canvasTex('planks', 512, 512, (ctx, w, h) => {
    const rnd = mulberry32(7);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const tone = 100 + rnd() * 40;
      ctx.fillStyle = `rgb(${tone + 30},${tone},${tone - 40})`;
      ctx.fillRect(0, (i * h) / n, w, h / n);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(60,35,15,${0.15 + rnd() * 0.2})`;
        const y = (i * h) / n + rnd() * (h / n);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + rnd() * 4 - 2, w * 0.6, y + rnd() * 4 - 2, w, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20,10,5,0.85)';
      ctx.fillRect(0, (i * h) / n, w, 3);
      ctx.fillStyle = 'rgba(40,40,45,0.9)';
      for (const x of [w * 0.1, w * 0.9]) { ctx.beginPath(); ctx.arc(x, (i + 0.5) * (h / n), 3, 0, 7); ctx.fill(); }
    }
  }),
  bricks: () => canvasTex('bricks', 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#77737f', 14, 51, 8);
    const rows = 8, cols = 4;
    ctx.strokeStyle = 'rgba(30,25,35,0.9)'; ctx.lineWidth = 4;
    for (let r = 0; r < rows; r++) {
      const y = (r * h) / rows;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      for (let c = 0; c <= cols; c++) {
        const x = ((c + (r % 2) * 0.5) * w) / cols;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h / rows); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let r = 0; r < rows; r++) ctx.fillRect(0, (r * h) / rows + 4, w, 6);
  }),
  lava: () => canvasTex('lava', 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#d02a00', 30, 61, 60);
    const rnd = mulberry32(8);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,${180 + rnd() * 70},40,${0.3 + rnd() * 0.4})`;
      ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 26, 3 + rnd() * 10, rnd() * 3, 0, 7); ctx.fill();
    }
  }),
  water: () => canvasTex('water', 512, 512, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#1d74c8', 8, 71, 18);
    const rnd = mulberry32(4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 30;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + l / 2, y - 4, x + l, y); ctx.stroke();
    }
  }),
  rainbow: () => canvasTex('rainbow', 64, 512, (ctx, w, h) => {
    const cols = ['#ff4060', '#ff9030', '#ffe040', '#50e060', '#40a0ff', '#a060ff'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, (i * h) / cols.length, w, h / cols.length + 1); });
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, (i * h) / 6, w, 4);
  }),
  curb: (a: string, b: string) => canvasTex('curb' + a + b, 64, 128, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = b; ctx.fillRect(0, h / 2, w, h / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, h / 2 - 2, w, 4);
  }),
  checker: () => canvasTex('checker', 256, 64, (ctx, w, h) => {
    const n = 16, m = 4;
    for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#f4f4f4';
      ctx.fillRect((x * w) / n, (y * h) / m, w / n, h / m);
    }
  }, false),
  dash: () => canvasTex('dash', 128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#ff6a00'); g.addColorStop(1, '#ffd000');
    ctx.fillStyle = '#ff7a00'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = g;
    for (let i = 0; i < 2; i++) {
      const y = i * (h / 2);
      ctx.beginPath(); ctx.moveTo(w * 0.15, y + h * 0.4); ctx.lineTo(w * 0.5, y + h * 0.08); ctx.lineTo(w * 0.85, y + h * 0.4); ctx.lineTo(w * 0.85, y + h * 0.5); ctx.lineTo(w * 0.5, y + h * 0.2); ctx.lineTo(w * 0.15, y + h * 0.5); ctx.fill();
    }
  }),
  stone: () => canvasTex('stone', 256, 256, (ctx, w, h) => noiseFill(ctx, w, h, '#6d6875', 22, 81, 20)),
  concrete: () => canvasTex('concrete', 256, 256, (ctx, w, h) => {
    noiseFill(ctx, w, h, '#d8d8dc', 10, 91, 6);
    ctx.fillStyle = '#e02020'; ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }),
  emblem: (letter: string, color: string) => canvasTex('emblem' + letter + color, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.36, 0, 7); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(w * 0.46)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + 3);
  }, false),
  glow: () => canvasTex('glow', 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }, false),
  stars: () => canvasTex('stars', 1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#02010a'); g.addColorStop(1, '#140a38');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(2);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,255,${200 + rnd() * 55},${0.3 + rnd() * 0.7})`;
      const s = rnd() < 0.05 ? 2.2 : 1;
      ctx.fillRect(rnd() * w, rnd() * h, s, s);
    }
    for (let i = 0; i < 5; i++) {
      const gg = ctx.createRadialGradient(rnd() * w, rnd() * h * 0.7, 0, 0, 0, 0);
      void gg;
    }
  }),
};
