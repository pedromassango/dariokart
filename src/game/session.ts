import type { Draw } from '../rive/draw';
import { argb } from '../rive/draw';
import type { RiveAssets } from '../rive/assets';
import { Race, type Difficulty, type RaceMode, type NetOut } from './race';
import { Kart, type KartInput, type Control } from './kart';
import type { TrackDef } from './tracks';
import { charById, type CharacterId } from './characters';
import type { Viewport } from './projector';
import type { Banner } from './hud';
import { drawHud3D, drawReferee3D, drawCourseTitle } from './hud3d';
import { riveText, riveTextWidth } from '../rive/riveText';
import * as THREE from 'three';
import { World3D, ChaseCam } from '../three/world';
import { riveTextures } from '../three/riveTextures';
import { input } from './input';
import { audio, type MusicName } from '../audio/audio';

export interface PlayerSetup {
  id: string;
  name: string;
  char: CharacterId;
  control: Control;
  localIndex: number; // 0/1 for local players, -1 otherwise
}

export interface SessionSetup {
  mode: RaceMode;
  track: TrackDef;
  laps: number;
  difficulty: Difficulty;
  items: boolean;
  players: PlayerSetup[]; // grid order
  seed: number;
  /** online hooks */
  net?: NetHooks;
}

export interface RemoteState { t: number; x: number; y: number; z: number; h: number; s: number; st: number; sp: number; lap: number; rd: number; fin: number; ft: number; it: string; c: number; star: number; shr: number }

export interface NetHooks {
  isHost: boolean;
  localPeerId: string;
  /** called ~15Hz with states of karts this client simulates */
  sendStates(states: Record<string, RemoteState>): void;
  sendEvents(ev: NetOut[]): void;
  /** latest remote states, keyed by kart id */
  takeRemoteStates(): Record<string, RemoteState>[];
  takeEvents(): NetOut[];
  serverTimeOffset(): number;
  /** shared start time (server ms) when countdown begins */
  startAt: number;
}

export interface Standing { id: string; name: string; char: CharacterId; place: number; time: number; finished: boolean; control: Control }

export const LOGICAL_W = 512;
export const LOGICAL_H = 448;

export class RaceSession {
  readonly race: Race;
  readonly setup: SessionSetup;
  private cams: ChaseCam[] = [];
  private world: World3D | null = null;
  private locals: Kart[] = [];
  private banners: (Banner | null)[] = [null, null];
  private time = 0;
  private doneTimer = 0;
  private finished = false;
  private sendTimer = 0;
  private starMusic = false;
  private lastPlace = 0;
  paused = false;
  onFinish: ((s: Standing[]) => void) | null = null;
  private musicName: MusicName;
  private started: boolean;

  constructor(setup: SessionSetup) {
    this.setup = setup;
    this.race = new Race({ track: setup.track, laps: setup.laps, difficulty: setup.difficulty, mode: setup.mode, items: setup.items, seed: setup.seed });
    if (setup.net) {
      this.race.localPeerId = setup.net.localPeerId;
      this.race.simulateBots = setup.net.isHost;
    }
    setup.players.forEach((p, i) => {
      const k = new Kart(p.id, p.name, charById(p.char), p.control);
      k.localIndex = p.localIndex;
      this.race.addKart(k, i);
      if (p.control === 'local') this.locals[p.localIndex] = k;
    });
    this.locals = this.locals.filter(Boolean);
    for (let i = 0; i < Math.max(1, this.locals.length); i++) this.cams.push(new ChaseCam());
    input.split = this.locals.length > 1;
    this.musicName = setup.track.music as MusicName;
    this.started = !setup.net;
  }

  get isAttract() { return this.locals.length === 0; }

  startAudio() {
    if (this.isAttract) return;
    audio.setMusicTempo(1, true);
    audio.playMusic(this.musicName);
  }

  stopAudio() {
    audio.setEngine({ running: false, speed01: 0, onRoad: true, drifting: false, boosting: false });
  }

  update(dtRaw: number) {
    if (this.paused) { this.stopAudio(); return; }
    const dt = Math.min(dtRaw, 1 / 20);
    this.time += dt;
    const race = this.race;
    const net = this.setup.net;

    // online: hold in intro until shared start time
    if (net && !this.started) {
      const now = Date.now() + net.serverTimeOffset();
      if (now >= net.startAt) this.started = true;
      else { race.phase = 'intro'; race.phaseTime = 0; }
    }

    const inputs = new Map<string, KartInput>();
    for (const k of this.locals) inputs.set(k.id, input.read(k.localIndex));

    if (net) this.applyNet(net);
    if (this.started) race.update(dt, inputs);

    // cameras
    this.cams.forEach((c, i) => {
      const k = this.locals[i] ?? this.leader();
      c.fovBoost += ((k.boostTimer > 0 ? 1 : 0) - c.fovBoost) * Math.min(1, dt * 4);
      c.follow(k, dt, race.phase === 'intro' && !this.isAttract ? race.phaseTime / 2.4 : null);
    });
    this.world?.update(dt, this.time, this.locals[0] ?? this.leader());

    this.handleEvents();
    if (net) this.sendNet(net, dt);
    this.updateAudio();

    if (race.phase === 'done' && !this.finished) {
      this.doneTimer += dt;
      if (this.doneTimer > (this.isAttract ? 0 : 3.2)) {
        this.finished = true;
        this.stopAudio();
        this.onFinish?.(this.standings());
      }
    }
  }

  private leader(): Kart {
    return [...this.race.karts].sort((a, b) => a.place - b.place)[0];
  }

  standings(): Standing[] {
    return this.race.finalStandings().map((k, i) => ({
      id: k.id, name: k.name, char: k.char.id, place: i + 1, time: k.finished ? k.finishTime : 0, finished: k.finished, control: k.control,
    }));
  }

  private handleEvents() {
    const race = this.race;
    const evs = race.events.splice(0);
    const p1 = this.locals[0];
    for (const e of evs) {
      if (e.type === 'sfx') {
        if (this.isAttract) continue;
        if (!e.kart || e.kart.control === 'local') audio.playSfx(e.name);
        else if (p1) {
          const dx = e.kart.x - p1.x, dy = e.kart.y - p1.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 160) {
            const side = -dx * Math.sin(p1.heading) + dy * Math.cos(p1.heading);
            audio.playSfx(e.name, { volume: 0.6 * (1 - dist / 160), pan: Math.max(-1, Math.min(1, side / 80)) });
          }
        }
      } else if (e.type === 'lap' && e.kart.control === 'local') {
        const idx = this.locals.indexOf(e.kart);
        if (e.lap === race.cfg.laps) {
          audio.playSfx('finalLap');
          this.banners[idx] = { text: 'FINAL LAP!', until: this.time + 2.5, color: '#ffd040' };
          if (idx === 0) audio.setMusicTempo(1.15);
        } else {
          audio.playSfx('lapComplete');
          this.banners[idx] = { text: `LAP ${e.lap}`, until: this.time + 1.6, color: '#ffffff' };
        }
      } else if (e.type === 'finish' && e.kart.control === 'local') {
        const idx = this.locals.indexOf(e.kart);
        const good = e.kart.place <= 4 || race.cfg.mode === 'timetrial';
        audio.playSfx(good ? 'finishWin' : 'finishLose');
        this.banners[idx] = { text: race.cfg.mode === 'timetrial' ? 'GOAL!' : `${e.kart.place}${['ST', 'ND', 'RD'][e.kart.place - 1] ?? 'TH'} PLACE!`, until: this.time + 4, color: good ? '#ffd040' : '#a0c0ff' };
        if (this.locals.every((k) => k.finished)) { audio.setMusicTempo(1); audio.playMusic('results'); }
      } else if (e.type === 'itemGet') {
        /* roulette end sound already emitted */
      }
    }
    // roulette tick
    for (const k of this.locals) if (k.rouletteTimer > 0 && Math.floor(this.time * 18) !== Math.floor((this.time - 1 / 60) * 18)) audio.playSfx('itemRoulette', { volume: 0.5 });
    // wrong way sound
    for (const k of this.locals) if (k.wrongWayTimer > 1 && Math.floor(this.time * 2) !== Math.floor((this.time - 1 / 60) * 2)) audio.playSfx('wrongWay', { volume: 0.5 });
  }

  private updateAudio() {
    if (this.isAttract) return;
    const p1 = this.locals[0];
    if (!p1) return;
    const race = this.race;
    const running = race.phase !== 'intro' && !p1.finished && !this.paused;
    const max = race.maxSpeedFor(p1);
    audio.setEngine({
      running: running || race.phase === 'countdown',
      speed01: Math.max(0, Math.min(1, Math.abs(p1.speed) / max)),
      onRoad: p1.surface !== 'offroad',
      drifting: p1.drift !== 0,
      boosting: p1.boostTimer > 0,
    });
    const wantStar = p1.starTimer > 0;
    if (wantStar !== this.starMusic && !p1.finished) {
      this.starMusic = wantStar;
      audio.playMusic(wantStar ? 'star' : this.musicName);
    }
    if (p1.place !== this.lastPlace) this.lastPlace = p1.place;
  }

  // ------------------------------------------------------------ network
  private applyNet(net: NetHooks) {
    const race = this.race;
    for (const snap of net.takeRemoteStates()) {
      for (const id in snap) {
        const k = race.karts.find((x) => x.id === id);
        if (!k || k.control !== 'remote') continue;
        const s = snap[id];
        k.netBuf.push({ t: s.t, x: s.x, y: s.y, z: s.z, h: s.h, s: s.s, st: s.st, sp: s.sp });
        if (k.netBuf.length > 20) k.netBuf.shift();
        k.raceDist = s.rd; k.maxLapStarted = s.lap; k.coins = s.c;
        k.item = (s.it || null) as Kart['item'];
        k.starTimer = s.star; k.shrinkTimer = s.shr;
        if (s.fin && !k.finished) { k.finished = true; k.finishTime = s.ft; if (race.firstHumanFinishAt < 0) race.firstHumanFinishAt = race.time; }
      }
    }
    for (const ev of net.takeEvents()) {
      if (ev.k === 'spawn') race.addRemoteItem(ev.e);
      else if (ev.k === 'remove') race.removeItem(ev.id, false);
      else if (ev.k === 'lightning') race.castLightning(ev.owner);
    }
    // interpolate remote karts ~120ms in the past
    const now = Date.now() + net.serverTimeOffset() - 120;
    for (const k of race.karts) {
      if (k.control !== 'remote' || k.netBuf.length === 0) continue;
      const b = k.netBuf;
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= now && b[i + 1].t >= now) { a = b[i]; c = b[i + 1]; break; }
      const span = c.t - a.t;
      const t = span > 0 ? Math.max(0, Math.min(1.5, (now - a.t) / span)) : 1;
      const lerpA = (p: number, q: number) => { let d = q - p; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return p + d * t; };
      k.x = a.x + (c.x - a.x) * t; k.y = a.y + (c.y - a.y) * t; k.z = a.z + (c.z - a.z) * t;
      k.heading = lerpA(a.h, c.h);
      k.speed = c.s; k.steerVis = c.st; k.spinAngle = c.sp;
      k.vx = Math.cos(k.heading) * k.speed; k.vy = Math.sin(k.heading) * k.speed;
      k.idx = this.race.track.nearestLocal(k.x, k.y, k.idx, 40);
    }
  }

  private sendNet(net: NetHooks, dt: number) {
    this.sendTimer -= dt;
    if (this.race.netOut.length) net.sendEvents(this.race.netOut.splice(0));
    if (this.sendTimer > 0) return;
    this.sendTimer = 1 / 15;
    const t = Date.now() + net.serverTimeOffset();
    const states: Record<string, RemoteState> = {};
    for (const k of this.race.karts) {
      if (k.control === 'remote') continue;
      if (k.control === 'bot' && !net.isHost) continue;
      states[k.id] = {
        t, x: +k.x.toFixed(1), y: +k.y.toFixed(1), z: +k.z.toFixed(1), h: +k.heading.toFixed(3), s: +k.speed.toFixed(1),
        st: +k.steerVis.toFixed(2), sp: +k.spinAngle.toFixed(2), lap: k.maxLapStarted, rd: +k.raceDist.toFixed(2),
        fin: k.finished ? 1 : 0, ft: Math.round(k.finishTime), it: k.item ?? '', c: k.coins, star: +k.starTimer.toFixed(1), shr: +k.shrinkTimer.toFixed(1),
      };
    }
    net.sendStates(states);
  }

  // ------------------------------------------------------------ render
  private views(w: number, h: number): Viewport[] {
    if (this.locals.length > 1) return [{ x: 0, y: 0, w, h: h / 2 - 2 }, { x: 0, y: h / 2 + 2, w, h: h / 2 - 2 }];
    return [{ x: 0, y: 0, w, h }];
  }

  /** 3D pass (Three.js) — w/h in device pixels */
  render3D(gl: THREE.WebGLRenderer, w: number, h: number) {
    if (!this.world) {
      this.world = new World3D(this.race, riveTextures());
      this.world.update(0, this.time, this.locals[0] ?? this.leader()); // place karts immediately
    }
    const views = this.views(w, h);
    gl.setScissorTest(views.length > 1);
    views.forEach((vp, i) => {
      const cam = this.cams[i] ?? this.cams[0];
      cam.cam.aspect = vp.w / vp.h;
      cam.cam.updateProjectionMatrix();
      // WebGL viewport origin is bottom-left
      const y = h - vp.y - vp.h;
      gl.setViewport(vp.x, y, vp.w, vp.h);
      gl.setScissor(vp.x, y, vp.w, vp.h);
      this.world!.prepareView(cam.cam, this.locals[i] ?? this.leader());
      gl.render(this.world!.scene, cam.cam);
    });
    gl.setScissorTest(false);
  }

  /** Rive overlay pass (HUD, referee, titles) — w/h in CSS pixels */
  private assetsRef: RiveAssets | null = null;

  renderOverlay(d: Draw, assets: RiveAssets, w: number, h: number) {
    this.assetsRef = assets;
    if (this.isAttract) return;
    const race = this.race;
    const views = this.views(w, h);
    const split = views.length > 1;
    views.forEach((vp, i) => {
      const k = this.locals[i];
      this.drawNameTags(d, vp, this.cams[i] ?? this.cams[0]);
      drawReferee3D(d, assets, race, k, vp, 'r' + i);
      drawHud3D(d, assets, race, k, vp, this.time, this.banners[i], split, 'h' + i);
      if (race.phase === 'intro') {
        const t = race.phaseTime;
        drawCourseTitle(d, assets, race.track.def.name, vp, Math.min(1, t * 2) * Math.min(1, Math.max(0, (2.6 - t) * 2)));
      }
    });
    if (split) d.rect(0, h / 2 - 2, w, 4, argb('#000000'));
  }

  /** names above other human racers (online) */
  private drawNameTags(d: Draw, vp: Viewport, cam: ChaseCam) {
    const v = new THREE.Vector3();
    for (const k of this.race.karts) {
      if (k.control !== 'remote' || k.id.startsWith('bot_')) continue;
      v.set(k.x, k.z + 15, k.y).project(cam.cam);
      if (v.z > 1 || v.z < -1) continue;
      const x = vp.x + (v.x * 0.5 + 0.5) * vp.w, y = vp.y + (-v.y * 0.5 + 0.5) * vp.h;
      const dist = Math.hypot(k.x - cam.cam.position.x, k.y - cam.cam.position.z);
      if (dist > 400) continue;
      const label = k.name.slice(0, 10);
      const th = Math.max(16, Math.min(28, 4200 / Math.max(60, dist)));
      const w = riveTextWidth(label, th) + th;
      d.roundRect(x - w / 2, y - th * 1.5, w, th * 1.5, th * 0.75, argb('#141a40', 0.7), argb(k.char.color), 3);
      if (!riveText(d, this.assetsRef!, label, x, y - th * 1.32, th, 0.5)) d.text(label, x, y - th * 1.2, 2, argb('#ffffff'), { align: 0.5 });
    }
  }

  dispose() {
    this.world?.dispose();
    this.world = null;
  }
}
