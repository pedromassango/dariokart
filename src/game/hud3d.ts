import type { Draw } from '../rive/draw';
import { argb } from '../rive/draw';
import type { RiveAssets } from '../rive/assets';
import { riveText, riveTextWidth } from '../rive/riveText';
import type { Race } from './race';
import type { Kart } from './kart';
import { ITEM_TYPES } from './kart';
import type { Viewport } from './projector';
import { drawItemFallback, ITEM_ARTBOARD } from './itemArt';
import { smkTime, type Banner } from './hud';

const WHITE = argb('#ffffff');
const INK = argb('#141a40');

/** text through the Rive glyph font, falling back to the pixel font */
function text(d: Draw, assets: RiveAssets, s: string, x: number, y: number, h: number, align = 0, color = WHITE) {
  if (!riveText(d, assets, s, x, y, h, align)) d.text(s, x, y, Math.max(1, h / 9), color, { align, outline: INK });
}

const lastPlace = new Map<string, number>();

/** Mario Kart 8 style HUD over a 3D race view (all Rive). */
export function drawHud3D(d: Draw, assets: RiveAssets, race: Race, k: Kart, vp: Viewport, time: number, banner: Banner | null, compact: boolean, key: string) {
  d.save();
  d.translate(vp.x, vp.y);
  const W = vp.w, H = vp.h;
  const u = Math.min(W / 1280, H / 720) * (compact ? 1.25 : 1);
  const pad = 22 * u;

  // item slot (top-left)
  const slot = 150 * u;
  const sx = pad + slot / 2, sy = pad + slot / 2;
  if (!assets.draw(d, 'hud_slot' + key, 'ItemSlot', sx, sy, slot, { anchorY: 0.5 })) {
    d.roundRect(pad, pad, slot, slot, 20 * u, argb('#101830', 0.6), WHITE, 4 * u);
  }
  const icon = (name: string, kk: string) => {
    const ab = ITEM_ARTBOARD[name];
    if (!(ab && assets.draw(d, kk + name, ab, sx, sy, slot * 0.6, { anchorY: 0.5 }))) drawItemFallback(d, name, sx, sy, slot * 0.5, time);
  };
  if (k.rouletteTimer > 0) icon(ITEM_TYPES[Math.floor(time * 16) % ITEM_TYPES.length], 'roul_');
  else if (k.item) icon(k.item, 'hud_');

  // clock (top-right)
  const t = race.phase === 'racing' || race.phase === 'done' ? (k.finished ? k.finishTime : race.time) : 0;
  text(d, assets, smkTime(t), W - pad, pad, 46 * u, 1);

  // lap (bottom-left) + coins
  const lapShown = Math.min(race.cfg.laps, Math.max(1, k.maxLapStarted));
  const ly = H - pad - 64 * u;
  let lx = pad;
  if (assets.draw(d, 'hud_lap', 'Lap', lx + 70 * u, ly + 4 * u, 140 * u, { anchorY: 0 })) lx += 146 * u;
  else { text(d, assets, 'LAP', lx, ly, 52 * u); lx += riveTextWidth('LAP', 52 * u) + 12 * u; }
  text(d, assets, `${lapShown}/${race.cfg.laps}`, lx, ly, 56 * u);
  if (race.cfg.mode !== 'timetrial') {
    const cy = ly - 62 * u;
    if (!assets.draw(d, 'hud_coin', 'Item_coin', pad + 26 * u, cy + 24 * u, 50 * u, { anchorY: 0.5 })) drawItemFallback(d, 'coin', pad + 26 * u, cy + 24 * u, 40 * u, time);
    text(d, assets, `x${k.coins}`, pad + 58 * u, cy + 2 * u, 44 * u);
  }

  // position badge (bottom-right)
  if (race.cfg.mode !== 'timetrial' && race.karts.length > 1 && (race.phase === 'racing' || race.phase === 'done')) {
    const place = Math.min(8, Math.max(1, k.place));
    const pk = key + k.id;
    const prev = lastPlace.get(pk);
    const pop = prev !== undefined && prev !== place;
    lastPlace.set(pk, place);
    const bw = 250 * u;
    if (!assets.draw(d, 'place' + key, 'Place_' + place, W - pad - bw / 2, H - pad, bw, { anchorY: 1, inputs: pop ? { pop: true } : undefined })) {
      text(d, assets, String(place), W - pad, H - pad - 120 * u, 110 * u, 1);
    }
  }

  // minimap (right side)
  if (!compact) drawMiniMap(d, assets, race, k, { x: W - pad - 230 * u, y: H * 0.5 - 200 * u, w: 230 * u, h: 230 * u }, time);

  // wrong way
  if (k.wrongWayTimer > 1 && !k.finished && Math.floor(time * 3) % 2 === 0) {
    text(d, assets, 'WRONG WAY!', W / 2, H * 0.36, 60 * u, 0.5);
  }
  // banners
  if (banner && time < banner.until) {
    const pulse = 1 + Math.sin(time * 9) * 0.04;
    text(d, assets, banner.text, W / 2, H * 0.24, 84 * u * pulse, 0.5);
  }
  if (k.shrinkTimer > 5.2) d.rect(0, 0, W, H, argb('#ffffff', Math.min(1, (k.shrinkTimer - 5.2) * 2)));
  d.restore();
}

/** MK-style minimap: translucent course outline with character portrait markers. */
function drawMiniMap(d: Draw, assets: RiveAssets, race: Race, me: Kart, box: Viewport, time: number) {
  const tr = race.track;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < tr.n; i++) {
    minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]);
    minY = Math.min(minY, tr.y[i]); maxY = Math.max(maxY, tr.y[i]);
  }
  const s = Math.min(box.w / (maxX - minX), box.h / (maxY - minY)) * 0.86;
  const ox = box.x + box.w / 2 - ((minX + maxX) / 2) * s, oy = box.y + box.h / 2 - ((minY + maxY) / 2) * s;
  const pts: number[] = [];
  for (let i = 0; i <= tr.n; i += 2) { const j = i % tr.n; pts.push(ox + tr.x[j] * s, oy + tr.y[j] * s); }
  d.polyline(pts, argb('#141a40', 0.55), tr.halfW * 2 * s + 7, true);
  d.polyline(pts, argb('#ffffff', 0.85), tr.halfW * 2 * s, true);
  // start line
  const a = tr.pointAt(0, -tr.halfW), b = tr.pointAt(0, tr.halfW);
  d.line(ox + a.x * s, oy + a.y * s, ox + b.x * s, oy + b.y * s, argb('#e02020'), 3);
  for (const e of race.items) d.circle(ox + e.x * s, oy + e.y * s, 3, argb(e.type === 'banana' ? '#ffd82a' : e.type === 'redShell' ? '#e02626' : '#22b040'), INK, 1);
  const ordered = [...race.karts].sort((p, q) => q.place - p.place);
  for (const k of ordered) {
    const x = ox + k.x * s, y = oy + k.y * s;
    const r = k === me ? 17 : 13;
    if (k === me) d.circle(x, y, r + 3 + Math.sin(time * 8), argb('#ffd23f'));
    if (!assets.draw(d, 'mm_' + k.char.id, 'Portrait_' + k.char.id, x, y, r * 2, { anchorY: 0.5 })) {
      d.circle(x, y, r * 0.8, argb(k.char.color), INK, 2);
    }
  }
}

/** referee (countdown lights / finish flag) sized for the 3D views */
export function drawReferee3D(d: Draw, assets: RiveAssets, race: Race, k: Kart, vp: Viewport, key: string) {
  let show = false, y = 0, flag = false, stage = 0;
  const size = vp.h * 0.42;
  if (race.phase === 'intro') {
    const t = race.phaseTime / 2.6;
    show = t > 0.45;
    y = -size * 1.2 + Math.min(1, (t - 0.45) / 0.4) * size * 1.25;
  } else if (race.phase === 'countdown') {
    show = true; y = size * 0.05; stage = race.lightStage;
  } else if (race.phase === 'racing' && race.phaseTime < 1.4) {
    show = true; stage = 3; y = size * 0.05 - (race.phaseTime / 1.4) * size * 1.4;
  }
  if (k.finished) {
    const t = (race.time - k.finishTime) / 1000;
    if (t < 3.2) { show = true; flag = true; y = Math.min(size * 0.05, -size * 1.2 + t * size * 3); }
  }
  if (!show) return;
  const x = vp.x + vp.w * 0.62;
  if (!assets.draw(d, 'ref3d' + key, 'Referee', x, vp.y + y, size * 0.73, { anchorY: 0, inputs: { stage, flag } })) {
    for (let i = 0; i < 3; i++) {
      const on = stage === 3 || (stage > i && i < 2);
      d.circle(x, vp.y + y + 40 + i * 40, 16, argb(stage === 3 ? '#30f850' : on ? '#f83030' : '#401010'));
    }
  }
}

/** intro course title */
export function drawCourseTitle(d: Draw, assets: RiveAssets, name: string, vp: Viewport, a: number) {
  if (a <= 0.01) return;
  const u = Math.min(vp.w / 1280, vp.h / 720);
  d.roundRect(vp.x + vp.w / 2 - 420 * u, vp.y + vp.h * 0.7 - 16 * u, 840 * u, 96 * u, 48 * u, argb('#141a40', 0.55 * a));
  text(d, assets, name.toUpperCase(), vp.x + vp.w / 2, vp.y + vp.h * 0.7, 62 * u, 0.5);
}
