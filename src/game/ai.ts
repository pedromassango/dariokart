import type { Race } from './race';
import type { Kart, KartInput } from './kart';
import { clamp, wrapAngle } from './util';

interface Skill {
  /** fraction of max speed bots aim for on straights */
  pace: number;
  /** steering precision 0..1 */
  precision: number;
  /** how well they follow the racing line 0..1 */
  line: number;
  /** probability per second of making a small mistake */
  mistakes: number;
  /** rubber band strength */
  rubber: number;
  /** item usage smartness 0..1 */
  itemIQ: number;
  drifts: boolean;
}

const SKILL: Record<string, Skill> = {
  easy: { pace: 0.8, precision: 0.55, line: 0.2, mistakes: 0.25, rubber: 0.05, itemIQ: 0.15, drifts: false },
  medium: { pace: 0.92, precision: 0.8, line: 0.6, mistakes: 0.08, rubber: 0.08, itemIQ: 0.55, drifts: false },
  hard: { pace: 1.0, precision: 0.97, line: 1.0, mistakes: 0.01, rubber: 0.14, itemIQ: 0.95, drifts: true },
};

const out: KartInput = { steer: 0, accel: false, brake: false, hop: false, item: false, back: false };

export function botInput(race: Race, k: Kart, dt: number): KartInput {
  const tr = race.track;
  // a finished human kart is auto-driven at medium skill
  const sk = k.control === 'bot' ? SKILL[race.cfg.difficulty] : SKILL.medium;
  const ai = k.ai;
  const n = tr.n;

  // lane choice changes every few seconds (personality)
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTimer = 2 + Math.random() * 4;
    ai.laneOffset = (Math.random() * 2 - 1) * (1 - sk.line) * 0.55;
  }

  // look ahead depending on speed
  const ahead = Math.round(3 + Math.max(0, k.speed) / 20);
  const ti = (k.idx + ahead) % n;
  let lat = (tr.racingLine[ti] * sk.line + ai.laneOffset) * tr.halfW;

  // avoid hazards & karts directly ahead
  for (const e of race.items) {
    if (e.owner === k.id && e.type !== 'banana') continue;
    const dx = e.x - k.x, dy = e.y - k.y;
    const fwd = dx * Math.cos(k.heading) + dy * Math.sin(k.heading);
    if (fwd > 0 && fwd < 60) {
      const side = -dx * Math.sin(k.heading) + dy * Math.cos(k.heading);
      if (Math.abs(side) < 12) lat += (side > 0 ? -1 : 1) * 16 * sk.precision;
    }
  }
  for (const o of tr.obstacles) {
    const dx = o.x - k.x, dy = o.y - k.y;
    const fwd = dx * Math.cos(k.heading) + dy * Math.sin(k.heading);
    if (fwd > 0 && fwd < 70) {
      const side = -dx * Math.sin(k.heading) + dy * Math.cos(k.heading);
      if (Math.abs(side) < 16) lat += (side > 0 ? -1 : 1) * 22;
    }
  }
  lat = clamp(lat, -tr.halfW * 0.8, tr.halfW * 0.8);
  let tp = tr.pointAt(ti, lat);
  // never aim across the void/grass: shorten the lookahead until the chord stays on the road
  for (let a = ahead; a > 2; a--) {
    const cand = tr.pointAt((k.idx + a) % n, lat * (a / ahead));
    let ok = true;
    for (const f of [0.33, 0.66]) {
      const mx = k.x + (cand.x - k.x) * f, my = k.y + (cand.y - k.y) * f;
      const mi = tr.nearestLocal(mx, my, (k.idx + Math.round(a * f)) % n, 8);
      const ml = (mx - tr.x[mi]) * tr.nx[mi] + (my - tr.y[mi]) * tr.ny[mi];
      if (Math.abs(ml) > tr.halfW * 0.85) { ok = false; break; }
    }
    tp = cand;
    if (ok) break;
  }
  const want = Math.atan2(tp.y - k.y, tp.x - k.x);
  let err = wrapAngle(want - k.heading);

  // mistakes: brief wobble
  if (ai.mistakeTimer > 0) {
    ai.mistakeTimer -= dt;
    err += Math.sin(ai.mistakeTimer * 9) * 0.5;
  } else if (Math.random() < sk.mistakes * dt) {
    ai.mistakeTimer = 0.6 + Math.random() * 0.6;
  }

  out.steer = clamp(err * (1.6 + sk.precision * 1.8), -1, 1);

  // edge safety: on tracks you can fall off, pull back toward the middle when drifting wide
  const fallTrack = tr.def.theme.edge === 'fall';
  const curLat = (k.x - tr.x[k.idx]) * tr.nx[k.idx] + (k.y - tr.y[k.idx]) * tr.ny[k.idx];
  const edgeRatio = Math.abs(curLat) / tr.halfW;
  if (fallTrack && edgeRatio > 0.6) {
    // heading component toward the edge
    const outward = Math.sign(curLat) * (Math.cos(k.heading) * tr.nx[k.idx] + Math.sin(k.heading) * tr.ny[k.idx]);
    if (outward > -0.1) out.steer = clamp(out.steer - Math.sign(curLat) * (edgeRatio - 0.5) * 3 * sk.precision, -1, 1);
  }
  out.back = false;
  out.item = false;

  // speed management: pace + corner hint + rubber band vs best human
  const maxS = race.maxSpeedFor(k);
  const hint = Math.min(tr.speedHint[(k.idx + 4) % n], tr.speedHint[(k.idx + 9) % n]);
  let target = maxS * sk.pace * ((fallTrack ? 0.62 : 0.82) + (fallTrack ? 0.38 : 0.18) * hint ** (sk.precision > 0.9 ? 0.6 : 1));
  const leader = race.karts.filter((o) => o.control !== 'bot').sort((a, b) => b.raceDist - a.raceDist)[0];
  if (leader && k.control === 'bot') {
    const gap = (leader.raceDist - k.raceDist) * 8; // world units
    // behind → speed up, way ahead → ease off
    const band = clamp(gap / 400, -1, 1.5) * sk.rubber;
    target *= 1 + band;
  }
  // physical corner limit: v = turnRate / curvature, with room to brake before the corner
  const turnRate = (2.0 + 0.17 * k.char.handling) * 0.88;
  const margin = fallTrack ? 0.95 : 1.25;
  let vAllowed = Infinity;
  for (let a = 1; a <= 22; a++) {
    const i0 = (k.idx + a) % n, i1 = (k.idx + a + 3) % n;
    const ang = Math.abs(wrapAngle(Math.atan2(tr.ty[i1], tr.tx[i1]) - Math.atan2(tr.ty[i0], tr.tx[i0])));
    const kappa = ang / 24;
    if (kappa < 1e-4) continue;
    const vc = (turnRate / kappa) * margin;
    vAllowed = Math.min(vAllowed, Math.sqrt(vc * vc + 2 * 160 * a * 8));
  }
  target = Math.min(target, vAllowed * (k.drift !== 0 ? 1.1 : 1));
  out.accel = k.speed < target;
  out.brake = (k.speed > target * 1.08 && fallTrack) || (k.speed > target * 1.25 && Math.abs(err) > 0.5);

  // drifting through corners (hard bots): tap hop on corner entry, keep it held through the hop
  // so the drift engages on landing, and hold the drift until the corner opens up
  const curveAhead = Math.min(tr.speedHint[(k.idx + 4) % n], tr.speedHint[(k.idx + 8) % n]);
  const curveNow = tr.speedHint[(k.idx + 2) % n];
  const edgeRisk = fallTrack; // no power-slides over voids/water/lava
  if (k.drift !== 0) {
    // a drift always turns into the corner: let go before it carries the kart off the road
    // (cutting across the inside) or once the kart already points past its line
    const towardEdge = Math.sign(curLat) === k.drift ? edgeRatio > 0.55 : edgeRatio > 0.8;
    const overTurning = Math.sign(err) !== k.drift && Math.abs(err) > 0.22;
    // otherwise release once the mini-turbo is charged and the corner is opening
    out.hop = !towardEdge && !overTurning && (curveNow < 0.86 || (k.driftCharge < 1.05 && curveNow < 0.95));
  } else if (sk.drifts && curveAhead < 0.82 && k.speed > maxS * 0.55 && Math.abs(out.steer) > 0.25 && !edgeRisk) {
    out.hop = k.hopping || !k.prevHop;
  } else out.hop = false;

  // stuck / wrong way recovery
  if (Math.abs(k.speed) < 8 && race.phase === 'racing' && !k.stunned) ai.stuckTimer += dt;
  else ai.stuckTimer = Math.max(0, ai.stuckTimer - dt);
  if (ai.stuckTimer > 1.2) { ai.reverseTimer = 0.8; ai.stuckTimer = 0; }
  if (ai.reverseTimer > 0) {
    ai.reverseTimer -= dt;
    out.accel = false; out.brake = true; out.steer = -out.steer;
  }

  // items
  if (k.item && race.cfg.items) {
    ai.itemDelay -= dt;
    if (ai.itemDelay <= 0) out.item = decideItem(race, k, sk, out);
  }
  return { ...out };
}

function decideItem(race: Race, k: Kart, sk: Skill, inp: KartInput): boolean {
  const smart = Math.random() < sk.itemIQ;
  if (!smart) {
    // dumb bots just use it eventually
    k.ai.itemDelay = 1.5 + Math.random() * 2;
    return Math.random() < 0.6;
  }
  const others = race.karts.filter((o) => o !== k);
  const fwdX = Math.cos(k.heading), fwdY = Math.sin(k.heading);
  const near = (pred: (fwd: number, side: number, d: number) => boolean) =>
    others.some((o) => {
      const dx = o.x - k.x, dy = o.y - k.y;
      const fwd = dx * fwdX + dy * fwdY;
      const side = -dx * fwdY + dy * fwdX;
      return pred(fwd, side, Math.hypot(dx, dy));
    });
  switch (k.item) {
    case 'mushroom':
      return race.track.speedHint[(k.idx + 8) % race.track.n] > 0.9 || k.surface === 'offroad';
    case 'banana':
      if (near((f, s) => f < 0 && f > -50 && Math.abs(s) < 15)) return true;
      k.ai.itemDelay = 0.4; return false;
    case 'greenShell':
      if (near((f, s) => f > 10 && f < 120 && Math.abs(s) < 8)) return true;
      if (near((f, s) => f < -10 && f > -60 && Math.abs(s) < 8)) { inp.back = true; return true; }
      k.ai.itemDelay = 0.3; return false;
    case 'redShell':
      return k.place > 1 || near((f, s) => f < -10 && f > -60 && Math.abs(s) < 8) ? ((inp.back = k.place === 1), true) : false;
    case 'star':
      return true;
    case 'lightning':
      return k.place > 2;
    case 'feather':
      return race.track.speedHint[(k.idx + 5) % race.track.n] > 0.95;
    case 'coin':
      return true;
    default:
      return true;
  }
}
