// Shared drawing helpers for the Dariokart art.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, mix, withAlpha, parseColor } from '../riv-writer.mjs';

export { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, mix, withAlpha, parseColor };

export const OUT = '#1a1020';
export const WHITE = '#ffffff';
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);
export const alpha = (c, a) => withAlpha(c, a);

/** outline stroke */
export const ol = (w = 3, color = OUT) => ({ color, width: w, join: 'round', cap: 'round' });
/** vertical gradient within a shape's local space */
export const vgrad = (y1, y2, c1, c2, extra) => linear(0, y1, 0, y2, extra ? [[0, c1], ...extra, [1, c2]] : [[0, c1], [1, c2]]);
export const hgrad = (x1, x2, c1, c2) => linear(x1, 0, x2, 0, [[0, c1], [1, c2]]);

/** Simple outlined blob */
export function blob(props, paths, fill, w = 3) {
  return shape(props, paths, fill, w ? ol(w) : null);
}
/** Unoutlined translucent white highlight */
export function shine(paths, a = 0.55, props = {}) {
  // rotate single parametric highlights about their own centre
  if (props.rotation && paths.length === 1 && (paths[0].type === 'ellipse' || paths[0].type === 'rect')) {
    const p = paths[0];
    return shape({ ...props, x: (props.x || 0) + p.x, y: (props.y || 0) + p.y }, [{ ...p, x: 0, y: 0 }], alpha('#ffffff', a));
  }
  return shape(props, paths, alpha('#ffffff', a));
}
/** Unoutlined shade */
export function shade(paths, color, props = {}) {
  return shape(props, paths, color);
}

/** Sampled loop track (sine). total frames, period frames. */
export function sineKeys(base, amp, period, total, phase = 0, step = 4) {
  const keys = [];
  for (let f = 0; f <= total; f += step) keys.push([f, base + amp * Math.sin(((f / period) + phase) * Math.PI * 2), 'linear']);
  if (keys[keys.length - 1][0] !== total) keys.push([total, base + amp * Math.sin(((total / period) + phase) * Math.PI * 2), 'linear']);
  return keys;
}
export function track(target, prop, keys, interp) { return { target, prop, keys, interp }; }

/** Five point star polygon points */
export function starPts(cx, cy, R, r, n = 5, rot = -90, rad = 0) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180; const rr = i % 2 ? r : R;
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a), rad]);
  }
  return pts;
}

/** Checkerboard as a list of small rects (returns {dark, light} path lists) inside x,y,w,h with n cols m rows */
export function checker(x, y, w, h, cols, rows) {
  const dark = []; const cw = w / cols, chh = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) dark.push(rect(x + i * cw, y + j * chh, cw, chh));
  return dark;
}

/** Checkered flag drawn with a waving cloth. Origin = top of pole. */
export function checkeredFlag(name, w = 40, h = 28, poleLen = 60, opts = {}) {
  const cols = opts.cols ?? 5, rows = opts.rows ?? 4;
  // waving cloth outline via cubic top/bottom edges
  const wave = opts.wave ?? 4;
  const cloth = svg(`M0 0 C ${w * 0.33} ${-wave} ${w * 0.66} ${wave} ${w} 0 L ${w} ${h} C ${w * 0.66} ${h + wave} ${w * 0.33} ${h - wave} 0 ${h} Z`);
  const squares = [];
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) {
    // offset each column by the wave
    const x0 = i * cw, x1 = x0 + cw;
    const yo = (x) => wave * Math.sin((x / w) * Math.PI * 2) * -0.75;
    squares.push(poly([[x0, j * ch + yo(x0)], [x1, j * ch + yo(x1)], [x1, (j + 1) * ch + yo(x1)], [x0, (j + 1) * ch + yo(x0)]]));
  }
  return node({ name }, [
    blob({}, rect(-2, -3, 4, poleLen + 3, 2), '#c8c0d0', 2),
    blob({}, circle(0, -4, 3.5), '#ffd23f', 2),
    shape({ name: name + 'Cloth' }, cloth, '#ffffff'),
    shape({}, squares, OUT),
    shape({}, cloth, null, ol(2)),
  ]);
}
