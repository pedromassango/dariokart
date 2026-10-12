import { Kart, type ItemType, type KartInput, emptyInput } from './kart';
import { Track, type SurfaceInfo, type Placed } from './track';
import type { TrackDef } from './tracks';
import { clamp, approach, wrapAngle, mulberry32 } from './util';
import { botInput } from './ai';
import type { SfxName } from '../audio/audio';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type RaceMode = 'gp' | 'race' | 'timetrial' | 'online' | 'versus';

export const DIFFICULTY: Record<Difficulty, { label: string; cc: string; maxSpeed: number }> = {
  easy: { label: 'Easy', cc: '50cc', maxSpeed: 120 },
  medium: { label: 'Medium', cc: '100cc', maxSpeed: 140 },
  hard: { label: 'Hard', cc: '150cc', maxSpeed: 160 },
};

export interface RaceConfig {
  track: TrackDef;
  laps: number;
  difficulty: Difficulty;
  mode: RaceMode;
  items: boolean;
  seed: number;
}

export interface ItemEntity {
  id: string;
  type: 'banana' | 'greenShell' | 'redShell';
  x: number; y: number; z: number;
  vx: number; vy: number;
  owner: string;
  target: string | null;
  life: number;
  bounces: number;
  idx: number;
  ownerGrace: number;
  /** true if this entity is simulated by a remote peer's spawn (we still move it, but never resolve hits on remote karts) */
  remote: boolean;
}

export type RaceEvent =
  | { type: 'sfx'; name: SfxName; kart?: Kart; x?: number; y?: number }
  | { type: 'lap'; kart: Kart; lap: number }
  | { type: 'finish'; kart: Kart }
  | { type: 'itemGet'; kart: Kart; item: ItemType };

/** messages a networked race needs to broadcast */
export type NetOut =
  | { k: 'spawn'; e: Omit<ItemEntity, 'remote'> }
  | { k: 'remove'; id: string }
  | { k: 'lightning'; owner: string };

export type Phase = 'intro' | 'countdown' | 'racing' | 'done';

const GRAVITY = 420;
const INTRO_TIME = 2.6;

export class Race {
  readonly cfg: RaceConfig;
  readonly track: Track;
  readonly karts: Kart[] = [];
  readonly items: ItemEntity[] = [];
  readonly boxTimers: number[];
  readonly coinTimers: number[];
  readonly events: RaceEvent[] = [];
  readonly netOut: NetOut[] = [];
  phase: Phase = 'intro';
  phaseTime = 0;
  /** race clock (ms) since GO */
  time = 0;
  /** countdown stage 0..3 for the referee (3 = green) */
  lightStage = 0;
  private rnd: () => number;
  private itemCounter = 0;
  private qi: SurfaceInfo = { surface: 'road', index: 0, lateral: 0, nx: 0, ny: 0 };
  /** for online races: true when this client simulates bots */
  simulateBots = true;
  /** set when race done (all humans finished) */
  doneTime = 0;
  firstHumanFinishAt = -1;
  /** for online: id prefix used for spawned items */
  localPeerId = 'local';

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
    this.track = new Track(cfg.track);
    this.boxTimers = this.track.itemBoxes.map(() => 0);
    this.coinTimers = this.track.coins.map(() => 0);
    this.rnd = mulberry32(cfg.seed);
  }

  addKart(k: Kart, slot: number) {
    const g = this.track.gridSlot(slot);
    k.x = g.x; k.y = g.y; k.heading = g.heading;
    k.idx = g.index;
    k.lastSafeIdx = g.index;
    k.uidx = g.index - this.track.n;
    k.raceDist = k.uidx;
    k.lap = 0;
    k.maxLapStarted = 1;
    this.karts.push(k);
  }

  get humans() {
    return this.karts.filter((k) => k.control !== 'bot');
  }

  emit(e: RaceEvent) {
    this.events.push(e);
  }
  sfx(name: SfxName, kart?: Kart) {
    this.events.push({ type: 'sfx', name, kart });
  }

  maxSpeedFor(k: Kart): number {
    const base = DIFFICULTY[this.cfg.difficulty].maxSpeed;
    let m = base * (0.95 + 0.025 * k.char.topSpeed);
    m *= 1 + Math.min(10, k.coins) * 0.008;
    if (k.shrinkTimer > 0) m *= 0.68;
    if (k.starTimer > 0) m *= 1.18;
    if (k.boostTimer > 0) m *= 1.32 * k.boostPower;
    return m;
  }

  update(dt: number, inputs: Map<string, KartInput>) {
    dt = Math.min(dt, 1 / 20);
    this.phaseTime += dt;
    if (this.phase === 'intro') {
      if (this.phaseTime >= INTRO_TIME) { this.phase = 'countdown'; this.phaseTime = 0; }
    } else if (this.phase === 'countdown') {
      const st = Math.min(3, Math.floor(this.phaseTime) + 1);
      if (st !== this.lightStage) {
        this.lightStage = st;
        this.sfx(st === 3 ? 'countdownGo' : 'countdownBeep');
      }
      // rocket start window
      for (const k of this.karts) {
        const inp = this.inputFor(k, inputs, dt);
        if (k.control === 'remote') continue;
        // SMK rocket start: press the gas right as the last light turns; flooring it too early stalls it
        if (inp.accel && this.phaseTime < 1.3) k.boostTimer = -2;
        else if (inp.accel && this.phaseTime > 1.6 && k.boostTimer === 0) k.boostTimer = -1;
      }
      if (this.phaseTime >= 2.0 + 0.0 && this.lightStage === 3) {
        // green light (3rd stage triggers at t=2s) → GO
        this.phase = 'racing';
        this.phaseTime = 0;
        this.time = 0;
        for (const k of this.karts) {
          k.lapStartTime = 0;
          if (k.boostTimer === -1) { k.boostTimer = 0.9; k.boostPower = 1; this.sfx('boost', k); }
          else k.boostTimer = 0;
        }
      }
      return;
    } else if (this.phase === 'racing' || this.phase === 'done') {
      this.time += dt * 1000;
    }
    if (this.phase === 'intro') return;

    for (const k of this.karts) {
      if (k.control === 'remote') continue;
      const inp = this.inputFor(k, inputs, dt);
      this.stepKart(k, inp, dt);
    }
    this.collideKarts();
    this.updateItems(dt);
    this.updatePickups(dt);
    this.updatePlaces();
    this.checkDone(dt);
  }

  private inputFor(k: Kart, inputs: Map<string, KartInput>, dt: number): KartInput {
    if (k.control === 'bot' || k.finished) {
      if (k.control === 'bot' && !this.simulateBots) return emptyInput();
      return botInput(this, k, dt);
    }
    return inputs.get(k.id) ?? emptyInput();
  }

  // ------------------------------------------------------------------ physics
  private stepKart(k: Kart, inp: KartInput, dt: number) {
    k.input = inp;
    const tr = this.track;
    const timers = ['boostTimer', 'starTimer', 'shrinkTimer', 'invulnTimer', 'bumpCooldown'] as const;
    for (const t of timers) if (k[t] > 0) k[t] = Math.max(0, k[t] - dt);
    if (k.rouletteTimer > 0) {
      k.rouletteTimer -= dt;
      if (k.rouletteTimer <= 0) {
        k.rouletteTimer = 0;
        k.item = k.pendingItem;
        k.pendingItem = null;
        if (k.item) this.emit({ type: 'itemGet', kart: k, item: k.item });
        this.sfx('itemGet', k);
        k.ai.itemDelay = 0.5 + this.rnd() * 2.5;
      }
    }

    // --- falling / rescue
    if (k.fallTimer > 0) {
      k.fallTimer -= dt;
      const t = 2.6 - k.fallTimer;
      if (t < 0.9) {
        k.z -= 70 * dt;
        k.x += k.vx * dt * 0.4; k.y += k.vy * dt * 0.4;
      } else if (t < 1.3) {
        // teleport to safe spot carried by referee
        const p = tr.pointAt(k.lastSafeIdx, 0);
        k.x = p.x; k.y = p.y; k.z = 45;
        k.heading = Math.atan2(tr.ty[k.lastSafeIdx], tr.tx[k.lastSafeIdx]);
        k.vx = k.vy = 0; k.speed = 0;
        k.idx = k.lastSafeIdx;
      } else {
        k.z = Math.max(0, 45 * (k.fallTimer / 1.3));
      }
      if (k.fallTimer <= 0) { k.fallTimer = 0; k.z = 0; k.invulnTimer = 1.2; }
      this.updateProgress(k, dt);
      return;
    }

    const stunned = k.spinTimer > 0 || k.squishTimer > 0;
    if (k.spinTimer > 0) {
      k.spinTimer -= dt;
      k.spinAngle += dt * 14;
      if (k.spinTimer <= 0) { k.spinTimer = 0; k.spinAngle = 0; }
    }
    if (k.squishTimer > 0) k.squishTimer = Math.max(0, k.squishTimer - dt);

    const ch = k.char;
    const maxS = this.maxSpeedFor(k);
    const surf = tr.query(k.x, k.y, this.qi);
    k.surface = surf.surface;
    const offroad = surf.surface === 'offroad' && k.starTimer <= 0 && k.boostTimer <= 0 && k.z <= 0.5;
    const max = offroad ? maxS * tr.def.theme.offroadSlow : maxS;
    const accelRate = this.maxSpeedFor(k) * 0.5 * (0.75 + 0.12 * ch.accel);

    // forward/lateral decomposition
    const cx = Math.cos(k.heading), cy = Math.sin(k.heading);
    let f = k.vx * cx + k.vy * cy;
    let l = -k.vx * cy + k.vy * cx;
    const grounded = k.z <= 0;

    if (stunned) {
      f = approach(f, 0, 160 * dt);
      l *= Math.exp(-6 * dt);
      k.drift = 0;
    } else {
      if (k.boostTimer > 0) {
        f = approach(f, max, accelRate * 4 * dt);
      } else if (inp.accel && !inp.brake) {
        if (f < max) f += accelRate * dt * (1 - 0.55 * Math.max(0, f) / max);
        else f = approach(f, max, 90 * dt);
      } else if (inp.brake) {
        f = f > 0 ? approach(f, 0, 220 * dt) : approach(f, -max * 0.35, 70 * dt);
      } else {
        f = approach(f, 0, 45 * dt);
      }
      if (f > max) f = approach(f, max, (offroad ? 220 : 60) * dt);

      // hop & drift
      const hopPressed = inp.hop && !k.prevHop;
      if (hopPressed && grounded && f > 30) {
        k.vz = 58; k.z = 0.01; k.hopping = true;
        this.sfx('hop', k);
      }
      if (k.hopping && k.z <= 0 && grounded) {
        k.hopping = false;
        if (inp.hop && Math.abs(inp.steer) > 0.3 && f > 45) {
          k.drift = Math.sign(inp.steer);
          k.driftCharge = 0;
          this.sfx('driftStart', k);
        }
      }
      if (k.drift !== 0) {
        if (!inp.hop || f < 35 || offroad) {
          if (k.driftCharge > 1.0 && f >= 35) {
            k.boostTimer = Math.max(k.boostTimer, 0.55); k.boostPower = 0.92;
            this.sfx('miniTurbo', k);
          }
          k.drift = 0;
        } else {
          k.driftCharge += dt * (Math.sign(inp.steer) === k.drift ? 1.35 : 0.6);
        }
      }

      // steering
      const sf = Math.min(1, Math.abs(f) / 35) * Math.sign(f || 1);
      const turnRate = (2.0 + 0.17 * ch.handling) * (1 - 0.12 * Math.max(0, f) / maxS);
      let turn: number;
      if (k.drift !== 0) {
        turn = turnRate * (0.62 * k.drift + 0.5 * inp.steer);
        l = approach(l, -k.drift * f * 0.22, 220 * dt);
        l *= Math.exp(-1.2 * dt);
      } else {
        turn = turnRate * inp.steer * (k.z > 0 ? 0.6 : 1);
        l *= Math.exp(-(offroad ? 7 : 9) * dt);
      }
      k.heading = wrapAngle(k.heading + turn * sf * dt);
    }
    k.prevHop = inp.hop;
    k.steerVis = approach(k.steerVis, stunned ? 0 : inp.steer + k.drift * 0.6, dt * 6);

    // vertical
    if (k.z > 0 || k.vz > 0) {
      k.vz -= GRAVITY * dt;
      k.z += k.vz * dt;
      if (k.z <= 0) {
        k.z = 0; k.vz = 0;
        if (k.featherJump) { k.featherJump = false; }
      }
    }

    // recompose velocity in new heading frame
    const nx = Math.cos(k.heading), ny = Math.sin(k.heading);
    k.vx = nx * f - ny * l;
    k.vy = ny * f + nx * l;
    k.speed = f;
    k.x += k.vx * dt;
    k.y += k.vy * dt;

    // dash panels
    k.onDash = false;
    for (const d of tr.dashPanels) {
      if (k.z <= 1 && Math.hypot(k.x - d.x, k.y - d.y) < 12) {
        if (k.boostTimer < 0.6) this.sfx('boost', k);
        k.boostTimer = Math.max(k.boostTimer, 0.9); k.boostPower = 1.05;
        k.onDash = true;
      }
    }
    // obstacles
    for (const o of tr.obstacles) {
      const dx = k.x - o.x, dy = k.y - o.y;
      const d = Math.hypot(dx, dy);
      const minD = o.r + k.radius;
      if (d < minD && k.z < 14) {
        const ux = dx / (d || 1), uy = dy / (d || 1);
        k.x = o.x + ux * minD; k.y = o.y + uy * minD;
        const vn = k.vx * ux + k.vy * uy;
        if (vn < 0) { k.vx -= 1.6 * vn * ux; k.vy -= 1.6 * vn * uy; }
        k.vx *= 0.6; k.vy *= 0.6;
        if (k.bumpCooldown <= 0) { this.sfx('bump', k); k.bumpCooldown = 0.3; }
      }
    }

    // boundaries
    const s2 = tr.query(k.x, k.y, this.qi);
    k.surface = s2.surface;
    if (s2.surface === 'wall') {
      const limit = tr.halfW + tr.def.theme.curbWidth + tr.def.theme.offroadWidth;
      const excess = Math.abs(s2.lateral) - limit;
      const sgn = Math.sign(s2.lateral);
      k.x -= s2.nx * sgn * (excess + 0.5);
      k.y -= s2.ny * sgn * (excess + 0.5);
      const vn = (k.vx * s2.nx + k.vy * s2.ny) * sgn;
      if (vn > 0) {
        k.vx -= 1.5 * vn * s2.nx * sgn;
        k.vy -= 1.5 * vn * s2.ny * sgn;
        k.vx *= 0.75; k.vy *= 0.75;
        if (vn > 25 && k.bumpCooldown <= 0) { this.sfx('bump', k); k.bumpCooldown = 0.3; }
      }
    } else if (s2.surface === 'fall' && k.z <= 0 && k.invulnTimer <= 0) {
      k.fallTimer = 2.6;
      k.drift = 0;
      k.spinTimer = 0;
      this.loseCoins(k, 2);
      this.sfx('fall', k);
    } else if (s2.surface === 'road' || s2.surface === 'curb') {
      k.lastSafeIdx = s2.index;
    }

    this.updateProgress(k, dt);
    this.useItemIfPressed(k, inp);
  }

  private updateProgress(k: Kart, dt: number) {
    const tr = this.track;
    const n = tr.n;
    const prevIdx = k.idx;
    k.idx = tr.nearestLocal(k.x, k.y, k.idx);
    let delta = k.idx - prevIdx;
    if (delta < -n / 2) delta += n;
    if (delta > n / 2) delta -= n;
    k.uidx += delta;
    const frac = tr.fractional(k.x, k.y, k.idx) - k.idx;
    k.raceDist = k.uidx + frac;
    if (k.finished) return;

    // wrong way
    const dot = Math.cos(k.heading) * tr.tx[k.idx] + Math.sin(k.heading) * tr.ty[k.idx];
    if (dot < -0.3 && k.speed > 15 && this.phase === 'racing') k.wrongWayTimer += dt;
    else k.wrongWayTimer = Math.max(0, k.wrongWayTimer - dt * 3);

    const lapNow = Math.floor(k.raceDist / n) + 1; // lap number being driven
    if (lapNow > k.maxLapStarted && this.phase === 'racing') {
      k.maxLapStarted = lapNow;
      k.lap = lapNow - 1;
      k.lapTimes.push(this.time - k.lapStartTime);
      k.lapStartTime = this.time;
      if (k.lap >= this.cfg.laps) {
        k.finished = true;
        k.finishTime = this.time;
        k.drift = 0;
        this.emit({ type: 'finish', kart: k });
        if (k.control !== 'bot' && this.firstHumanFinishAt < 0) this.firstHumanFinishAt = this.time;
      } else {
        this.emit({ type: 'lap', kart: k, lap: lapNow });
      }
    }
  }

  private loseCoins(k: Kart, n: number) {
    k.coins = Math.max(0, k.coins - n);
  }

  // ------------------------------------------------------------------ hits
  /** Apply a hit to a kart this client owns. Returns true if applied. */
  hitKart(k: Kart, kind: 'spin' | 'squish' | 'tumble'): boolean {
    if (k.control === 'remote') return false;
    if (k.invincible || k.invulnTimer > 0 || k.fallTimer > 0) return false;
    if (kind === 'squish') {
      if (k.squishTimer > 0) return false;
      k.squishTimer = 1.4;
      this.sfx('spinOut', k);
    } else {
      if (k.spinTimer > 0) return false;
      k.spinTimer = kind === 'tumble' ? 1.6 : 1.15;
      this.sfx(kind === 'tumble' ? 'shellHit' : 'spinOut', k);
    }
    k.drift = 0;
    k.invulnTimer = 0;
    this.loseCoins(k, kind === 'tumble' ? 3 : 2);
    if (k.rouletteTimer > 0 && kind === 'tumble') { /* keep roulette */ }
    return true;
  }

  private collideKarts() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        if (a.fallTimer > 0 || b.fallTimer > 0) continue;
        if (Math.abs(a.z - b.z) > 8) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius;
        if (d >= minD || d === 0) continue;
        const ux = dx / d, uy = dy / d;
        // star / shrink interactions
        if (a.invincible !== b.invincible) {
          const victim = a.invincible ? b : a;
          this.hitKart(victim, 'tumble');
          continue;
        }
        if ((a.shrinkTimer > 0) !== (b.shrinkTimer > 0)) {
          const victim = a.shrinkTimer > 0 ? a : b;
          this.hitKart(victim, 'squish');
          continue;
        }
        const ma = 0.7 + 0.15 * a.char.weight, mb = 0.7 + 0.15 * b.char.weight;
        const overlap = minD - d;
        const aMovable = a.control !== 'remote', bMovable = b.control !== 'remote';
        const wa = aMovable ? (bMovable ? mb / (ma + mb) : 1) : 0;
        const wb = bMovable ? (aMovable ? ma / (ma + mb) : 1) : 0;
        a.x -= ux * overlap * wa; a.y -= uy * overlap * wa;
        b.x += ux * overlap * wb; b.y += uy * overlap * wb;
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const vn = rvx * ux + rvy * uy;
        if (vn < 0) {
          const jImp = (-(1 + 0.6) * vn) / (1 / ma + 1 / mb);
          if (aMovable) { a.vx -= (jImp / ma) * ux; a.vy -= (jImp / ma) * uy; }
          if (bMovable) { b.vx += (jImp / mb) * ux; b.vy += (jImp / mb) * uy; }
          if (-vn > 20) {
            const local = a.control === 'local' ? a : b.control === 'local' ? b : null;
            if (local && local.bumpCooldown <= 0) { this.sfx('bump', local); local.bumpCooldown = 0.25; }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ items
  rollItem(k: Kart): ItemType {
    const n = this.karts.length;
    const p = n <= 1 ? 0.5 : (k.place - 1) / (n - 1);
    const table: [ItemType, number][] =
      this.cfg.mode === 'timetrial' ? [['mushroom', 1]] :
      p < 0.2 ? [['banana', 34], ['greenShell', 28], ['coin', 22], ['redShell', 8], ['feather', 8]] :
      p < 0.6 ? [['banana', 14], ['greenShell', 18], ['redShell', 24], ['mushroom', 20], ['coin', 10], ['feather', 10], ['star', 4]] :
      [['mushroom', 24], ['redShell', 24], ['star', 20], ['lightning', p > 0.85 ? 14 : 4], ['feather', 8], ['greenShell', 8]];
    const total = table.reduce((s, [, w]) => s + w, 0);
    let r = this.rnd() * total;
    for (const [t, w] of table) { r -= w; if (r <= 0) return t; }
    return table[0][0];
  }

  private updatePickups(dt: number) {
    const tr = this.track;
    for (let i = 0; i < this.boxTimers.length; i++) if (this.boxTimers[i] > 0) this.boxTimers[i] -= dt;
    for (let i = 0; i < this.coinTimers.length; i++) if (this.coinTimers[i] > 0) this.coinTimers[i] -= dt;
    for (const k of this.karts) {
      if (k.fallTimer > 0) continue;
      if (this.cfg.items) {
        tr.itemBoxes.forEach((b, i) => {
          if (this.boxTimers[i] > 0) return;
          if (Math.hypot(k.x - b.x, k.y - b.y) < 9 && k.z < 16) {
            this.boxTimers[i] = 3;
            if (k.control === 'remote') return;
            this.sfx('itemBox', k);
            if (!k.item && k.rouletteTimer <= 0) {
              k.rouletteTimer = 1.25;
              k.pendingItem = this.rollItem(k);
            }
          }
        });
      }
      if (this.cfg.mode !== 'timetrial') {
        tr.coins.forEach((c, i) => {
          if (this.coinTimers[i] > 0) return;
          if (Math.hypot(k.x - c.x, k.y - c.y) < 7 && k.z < 12) {
            this.coinTimers[i] = 12;
            if (k.control === 'remote') return;
            k.coins = Math.min(99, k.coins + 1);
            this.sfx('coin', k);
          }
        });
      }
    }
  }

  private useItemIfPressed(k: Kart, inp: KartInput) {
    if (!inp.item || !k.item || k.stunned || this.phase !== 'racing') return;
    const it = k.item;
    k.item = null;
    const cx = Math.cos(k.heading), cy = Math.sin(k.heading);
    switch (it) {
      case 'mushroom':
        k.boostTimer = 1.3; k.boostPower = 1;
        this.sfx('boost', k);
        break;
      case 'star':
        k.starTimer = 7.5;
        this.sfx('boost', k);
        this.emit({ type: 'sfx', name: 'boost', kart: k });
        break;
      case 'coin':
        k.coins = Math.min(99, k.coins + 2);
        this.sfx('coin', k);
        break;
      case 'feather':
        k.vz = 175; k.z = 0.1; k.featherJump = true;
        this.sfx('feather', k);
        break;
      case 'lightning':
        this.castLightning(k.id);
        this.netOut.push({ k: 'lightning', owner: k.id });
        break;
      case 'banana': {
        // bananas drop behind the kart
        this.spawnItem(k, 'banana', k.x - cx * 12, k.y - cy * 12, 0, 0);
        this.sfx('bananaDrop', k);
        break;
      }
      case 'greenShell':
      case 'redShell': {
        const back = inp.back;
        const sp = 290;
        const dir = back ? -1 : 1;
        const e = this.spawnItem(k, it, k.x + cx * 11 * dir, k.y + cy * 11 * dir, cx * sp * dir + (back ? 0 : k.vx * 0.3), cy * sp * dir + (back ? 0 : k.vy * 0.3));
        if (it === 'redShell' && !back) e.target = this.kartAhead(k)?.id ?? null;
        this.sfx('shellFire', k);
        break;
      }
    }
  }

  castLightning(ownerId: string) {
    this.sfx('lightning');
    for (const o of this.karts) {
      if (o.id === ownerId || o.control === 'remote') continue;
      if (o.invincible) continue;
      o.shrinkTimer = 5.5;
      o.spinTimer = Math.max(o.spinTimer, 0.6);
      o.item = null; o.rouletteTimer = 0;
    }
  }

  kartAhead(k: Kart): Kart | null {
    let best: Kart | null = null;
    for (const o of this.karts) {
      if (o === k || o.finished) continue;
      if (o.raceDist > k.raceDist && (!best || o.raceDist < best.raceDist)) best = o;
    }
    return best;
  }

  private spawnItem(k: Kart, type: ItemEntity['type'], x: number, y: number, vx: number, vy: number): ItemEntity {
    const e: ItemEntity = {
      id: `${this.localPeerId}-${k.id}-${this.itemCounter++}`,
      type, x, y, z: 0, vx, vy, owner: k.id, target: null,
      life: type === 'banana' ? 60 : type === 'redShell' ? 10 : 9,
      bounces: 0, idx: k.idx, ownerGrace: 0.4, remote: false,
    };
    this.items.push(e);
    this.netOut.push({ k: 'spawn', e: { ...e } as Omit<ItemEntity, 'remote'> });
    return e;
  }

  /** Spawn an item announced by a remote peer. */
  addRemoteItem(e: Omit<ItemEntity, 'remote'>) {
    if (this.items.some((i) => i.id === e.id)) return;
    const own = this.karts.find((k) => k.id === e.owner);
    this.items.push({ ...e, remote: true, idx: own ? own.idx : this.track.query(e.x, e.y).index });
  }
  removeItem(id: string, broadcast: boolean) {
    const i = this.items.findIndex((e) => e.id === id);
    if (i >= 0) this.items.splice(i, 1);
    if (broadcast) this.netOut.push({ k: 'remove', id });
  }

  private updateItems(dt: number) {
    const tr = this.track;
    const dead = new Set<ItemEntity>();
    const kill = (e: ItemEntity, broadcast: boolean) => {
      dead.add(e);
      if (broadcast && !e.remote) this.netOut.push({ k: 'remove', id: e.id });
      else if (broadcast) this.netOut.push({ k: 'remove', id: e.id });
    };
    for (const e of this.items) {
      if (dead.has(e)) continue;
      e.life -= dt;
      e.ownerGrace -= dt;
      if (e.life <= 0) { dead.add(e); continue; }
      if (e.type === 'banana') {
        e.vx *= Math.exp(-4 * dt); e.vy *= Math.exp(-4 * dt);
      } else if (e.type === 'redShell' && e.target) {
        const t = this.karts.find((k) => k.id === e.target);
        e.idx = tr.nearestLocal(e.x, e.y, e.idx, 12);
        let goalX: number, goalY: number;
        if (t && Math.hypot(t.x - e.x, t.y - e.y) < 110) {
          goalX = t.x; goalY = t.y;
        } else {
          const p = tr.pointAt(e.idx + 5, 0);
          goalX = p.x; goalY = p.y;
        }
        const sp = Math.hypot(e.vx, e.vy) || 1;
        const want = Math.atan2(goalY - e.y, goalX - e.x);
        const cur = Math.atan2(e.vy, e.vx);
        const na = cur + clamp(wrapAngle(want - cur), -7 * dt, 7 * dt);
        const s = Math.min(320, sp + 60 * dt);
        e.vx = Math.cos(na) * s; e.vy = Math.sin(na) * s;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;

      // walls / void
      const q = tr.query(e.x, e.y, this.qi);
      if (e.type !== 'redShell' || !e.target) e.idx = q.index;
      if (q.surface === 'wall' || (q.surface === 'fall' && e.type !== 'banana')) {
        if (q.surface === 'fall' && e.type === 'redShell') { /* red shells hover over voids briefly */ }
        else {
          const sgn = Math.sign(q.lateral);
          const vn = (e.vx * q.nx + e.vy * q.ny) * sgn;
          if (vn > 0) { e.vx -= 2 * vn * q.nx * sgn; e.vy -= 2 * vn * q.ny * sgn; }
          e.x -= q.nx * sgn * 2; e.y -= q.ny * sgn * 2;
          e.bounces++;
          if (e.bounces > 5 || q.surface === 'fall') { dead.add(e); continue; }
        }
      }
      // obstacles
      let destroyed = false;
      for (const o of tr.obstacles) {
        if (Math.hypot(e.x - o.x, e.y - o.y) < o.r + 3) { destroyed = true; break; }
      }
      if (destroyed) { kill(e, !e.remote); continue; }

      // item vs item
      let hitOther = false;
      for (const o of this.items) {
        if (o === e || dead.has(o)) continue;
        if (e.type === 'banana' && o.type === 'banana') continue;
        if (e.remote && o.remote) continue; // the owners' clients resolve this
        if (Math.hypot(o.x - e.x, o.y - e.y) < 6) {
          kill(o, true); kill(e, true);
          hitOther = true;
          break;
        }
      }
      if (hitOther) { this.sfx('shellHit'); continue; }

      // item vs kart (only karts we own)
      for (const k of this.karts) {
        if (k.control === 'remote' || k.fallTimer > 0) continue;
        if (k.id === e.owner && e.ownerGrace > 0) continue;
        if (k.z > 10) continue;
        if (Math.hypot(k.x - e.x, k.y - e.y) < k.radius + 4) {
          const applied = this.hitKart(k, e.type === 'banana' ? 'spin' : 'tumble');
          if (applied && e.type === 'banana') this.sfx('bananaHit', k);
          kill(e, true);
          break;
        }
      }
    }
    if (dead.size) {
      for (let i = this.items.length - 1; i >= 0; i--) if (dead.has(this.items[i])) this.items.splice(i, 1);
    }
  }

  private updatePlaces() {
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDist - a.raceDist;
    });
    sorted.forEach((k, i) => (k.place = i + 1));
  }

  private checkDone(dt: number) {
    if (this.phase !== 'racing') return;
    if (!this.karts.some((k) => k.control !== 'bot')) return; // attract mode never ends
    const humans = this.karts.filter((k) => k.control === 'local' || k.control === 'remote');
    const allHumansDone = humans.length > 0 && humans.every((k) => k.finished);
    const localDone = this.karts.filter((k) => k.control === 'local').every((k) => k.finished);
    const timeout = this.cfg.mode === 'online' && this.firstHumanFinishAt >= 0 && this.time - this.firstHumanFinishAt > 30000 && localDone;
    if (allHumansDone || timeout || (this.cfg.mode !== 'online' && localDone)) {
      this.phase = 'done';
      this.phaseTime = 0;
      void dt;
    }
  }

  /** Estimated finishing order for karts still racing when the race ends (SMK assigns places). */
  finalStandings(): Kart[] {
    const est = (k: Kart) => {
      if (k.finished) return k.finishTime;
      const remaining = this.cfg.laps * this.track.n - k.raceDist;
      const avgSpeed = (this.maxSpeedFor(k) * 0.85) / 8; // samples / sec
      return this.time + (remaining / Math.max(1, avgSpeed)) * 1000 + 1;
    };
    return [...this.karts].sort((a, b) => est(a) - est(b));
  }

  boxVisible(i: number) { return this.boxTimers[i] <= 0; }
  coinVisible(i: number) { return this.coinTimers[i] <= 0; }
  allBoxes(): Placed[] { return this.track.itemBoxes; }
}
