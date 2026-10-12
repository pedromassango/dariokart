import type { App } from '../app';
import { RaceSession, type SessionSetup, type Standing, type PlayerSetup } from '../game/session';
import { CHARACTERS, charById, type CharacterId } from '../game/characters';
import { TRACKS, CUPS, trackById, RAINBOW_COLORS, type TrackDef } from '../game/tracks';
import { DIFFICULTY, type Difficulty, type RaceMode } from '../game/race';
import { Track } from '../game/track';
import { audio } from '../audio/audio';
import { argb, type Draw } from '../rive/draw';
import { formatTime, ordinal } from '../game/util';
import { firebaseConfigured } from '../net/firebase';
import { Room, MAX_PLAYERS } from '../net/room';
import { input, touch } from '../game/input';
import { RUI, COL } from './rui';

/*
 * All menus are drawn by Rive every frame (immediate-mode UI over the live attract race):
 * Rive paths for panels and buttons, the Rive glyph font for text, Rive artboards for the logo,
 * portraits, kart turntables and the trophy. Only typing (names / room codes) uses a native
 * text box (for mobile keyboards), placed over a Rive-drawn field.
 */

// ------------------------------------------------------------------ profile
interface Profile { name: string; char: CharacterId; char2: CharacterId; difficulty: Difficulty; laps: number; items: boolean; bots2p: boolean }
const PROFILE_KEY = 'dariokart.profile.v1';
function loadProfile(): Profile {
  const def: Profile = { name: 'PLAYER', char: 'dario', char2: 'luigio', difficulty: 'medium', laps: 3, items: true, bots2p: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') }; } catch { return def; }
}
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ } }
const profile = loadProfile();

const BEST_KEY = 'dariokart.best.v1';
function bestTimes(): Record<string, number> { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}'); } catch { return {}; } }
function saveBest(track: string, ms: number): boolean {
  const b = bestTimes();
  if (!b[track] || ms < b[track]) { b[track] = ms; try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch { /* ignore */ } return true; }
  return false;
}

const trackCache = new Map<string, Track>();
function trackGeom(def: TrackDef): Track {
  let t = trackCache.get(def.id);
  if (!t) { t = new Track(def); trackCache.set(def.id, t); }
  return t;
}

type Screen = () => void;

export class Menus {
  private app: App;
  private ui: RUI;
  private screen: Screen | null = null;
  private room: Room | null = null;
  private gp: { cup: number; race: number; points: Record<string, number>; players: PlayerSetup[]; difficulty: Difficulty } | null = null;
  private lastSetup: SessionSetup | null = null;
  private inRace = false;
  private pauseOpen = false;
  private toastMsg = ''; private toastUntil = 0;
  private inputs = new Map<string, HTMLInputElement>();
  private usedInputs = new Set<string>();
  private t = 0;
  private onlineErr = '';
  private busy = false;
  private resultsData: { setup: SessionSetup; st: Standing[]; newBest: boolean } | null = null;

  constructor(app: App) {
    this.app = app;
    this.ui = new RUI(app.canvas);
    input.setPauseHandler(() => this.togglePause());
    app.overlay = (d, w, h, t) => this.draw(d, w, h, t);
    this.setupTouch();
  }

  private go(s: Screen, back: (() => void) | null = null, focus?: string) {
    this.screen = s;
    this.ui.reset();
    this.ui.onBack = back;
    if (focus) this.ui.focus(focus);
  }

  // ------------------------------------------------------------------ frame
  private draw(d: Draw, w: number, h: number, t: number) {
    this.t = t;
    const showUI = !this.inRace || this.pauseOpen;
    this.ui.enabled = showUI;
    this.usedInputs.clear();
    if (showUI && this.screen) {
      this.ui.begin(d, this.app.assets, w, h, t);
      // input handled in begin() may switch screens (or start a race): draw whatever is current now
      const screen = this.screen;
      if (screen && (!this.inRace || this.pauseOpen)) screen();
      this.ui.end();
    }
    if (this.inRace && !this.pauseOpen) this.drawTouch(d, w, h);
    for (const [k, el] of this.inputs) if (!this.usedInputs.has(k)) { el.remove(); this.inputs.delete(k); }
    if (t < this.toastUntil && this.ui.d) {
      const u = this.ui.u || 1;
      const tw = this.ui.textW(this.toastMsg, 30 * u) + 60 * u;
      d.roundRect(w / 2 - tw / 2, h - 120 * u, tw, 56 * u, 28 * u, argb('#141a40', 0.85), COL.white, 3 * u);
      this.ui.text(this.toastMsg, w / 2, h - 107 * u, 30 * u, 0.5);
    }
  }

  // ------------------------------------------------------------------ art helpers
  private portrait(id: CharacterId, x: number, y: number, w: number, h: number, selected: boolean, key: string) {
    const s = Math.min(w, h);
    if (!this.app.assets.draw(this.ui.d, key, 'Portrait_' + id, x + w / 2, y + h / 2, s, { anchorY: 0.5, inputs: { selected } })) {
      this.ui.d.circle(x + w / 2, y + h / 2, s * 0.4, argb(charById(id).color));
    }
  }

  /** rotating kart sprite (Rive views 0..4 + mirror) */
  private kartTurntable(id: CharacterId, cx: number, cy: number, size: number) {
    const seq = [4, 3, 2, 1, 0, 1, 2, 3];
    const i = Math.floor(this.t * 1.6) % 8;
    this.app.assets.draw(this.ui.d, 'turn_' + id, 'Kart_' + id, cx, cy, size, { anchorY: 92 / 96, flipX: i > 4, inputs: { view: seq[i], steer: 0, boost: Math.sin(this.t * 2) > 0.7 } });
  }

  private courseMap(def: TrackDef, x: number, y: number, w: number, h: number) {
    const tr = trackGeom(def), th = def.theme, d = this.ui.d;
    d.roundRect(x, y, w, h, 12 * this.ui.u, argb(th.ground));
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < tr.n; i++) { minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]); minY = Math.min(minY, tr.y[i]); maxY = Math.max(maxY, tr.y[i]); }
    const s = Math.min((w * 0.82) / (maxX - minX), (h * 0.82) / (maxY - minY));
    const ox = x + w / 2 - ((minX + maxX) / 2) * s, oy = y + h / 2 - ((minY + maxY) / 2) * s;
    for (const l of def.lakes ?? []) d.poly(l.points.flatMap(([px, py]) => [ox + px * s, oy + py * s]), argb(l.color));
    const pts: number[] = [];
    for (let i = 0; i <= tr.n; i += 2) { const j = i % tr.n; pts.push(ox + tr.x[j] * s, oy + tr.y[j] * s); }
    if (th.offroadWidth > 0) d.polyline(pts, argb(th.band), (tr.halfW + 34) * 2 * s, true);
    d.polyline(pts, argb(th.curbColors[1] ?? '#e02020'), tr.halfW * 2 * s + 5, true);
    d.polyline(pts, argb(def.id === 'rainbow' ? RAINBOW_COLORS[Math.floor(this.t * 4) % 6] : th.road), tr.halfW * 2 * s, true);
    const k = Math.floor((this.t * 50) % tr.n);
    d.circle(ox + tr.x[k] * s, oy + tr.y[k] * s, 5, argb('#ffd23f'), COL.ink, 2);
  }

  /** a native text box positioned over a Rive-drawn field (needed for typing / mobile keyboards) */
  private textField(key: string, x: number, y: number, w: number, h: number, value: string, max: number, onChange: (v: string) => void) {
    const u = this.ui.u;
    this.ui.d.roundRect(x, y, w, h, h / 2, COL.white, this.ui.isFocused(key) ? COL.redB : argb('#9ab4f0'), 3 * u);
    this.usedInputs.add(key);
    let el = this.inputs.get(key);
    if (!el) {
      el = document.createElement('input');
      el.type = 'text';
      el.maxLength = max;
      el.value = value;
      el.autocomplete = 'off';
      el.spellcheck = false;
      el.className = 'rive-field';
      const node = el;
      node.addEventListener('input', () => { node.value = node.value.toUpperCase(); onChange(node.value); });
      node.addEventListener('focus', () => node.select()); // typing replaces the old value
      document.getElementById('stage')!.append(node);
      this.inputs.set(key, node);
    }
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', fontSize: Math.round(h * 0.45) + 'px' });
    const node = el;
    this.ui.register({ key, x, y, w, h, focusable: true, onActivate: () => node.focus() });
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (this.ui.isFocused(key) && document.activeElement !== node && !coarse) node.focus();
    if (!this.ui.isFocused(key) && document.activeElement === node) node.blur();
  }

  private header(title: string, sub?: string) {
    const u = this.ui.u, w = this.ui.w;
    this.ui.text(title, w / 2, 26 * u, 60 * u, 0.5);
    if (sub) this.ui.label(sub, w / 2, 98 * u, 17 * u, 0.5, COL.white);
  }

  private toast(msg: string) { this.toastMsg = msg.toUpperCase(); this.toastUntil = this.t + 2.6; }

  // ------------------------------------------------------------------ screens
  title() {
    this.leaveRoom();
    this.inRace = false;
    audio.playMusic('title');
    let gone = false;
    const go = () => { if (gone) return; gone = true; audio.unlock(); this.main(); };
    this.go(() => {
      const { u, w, h } = this.ui;
      const lw = Math.min(w * 0.72, 900 * u);
      this.app.assets.draw(this.ui.d, 'logo_t', 'Logo', w / 2, h * 0.08, lw, { anchorY: 0 });
      const pulse = 1 + Math.sin(this.t * 4) * 0.06;
      this.ui.text('PRESS START', w / 2, h * 0.68, 58 * u * pulse, 0.5);
      this.ui.label('A SUPER KART TRIBUTE · RENDERED ENTIRELY WITH RIVE', w / 2, h - 40 * u, 16 * u, 0.5, COL.white);
      this.ui.register({ key: 'start', x: 0, y: 0, w, h, focusable: true, onActivate: go });
    });
  }

  main() {
    this.leaveRoom();
    this.gp = null;
    this.inRace = false;
    audio.playMusic('menu');
    const online = firebaseConfigured();
    this.go(() => {
      const { u, w, h, d } = this.ui;
      this.ui.backdrop();
      const lw = Math.min(520 * u, w * 0.6);
      this.app.assets.draw(d, 'logo_m', 'Logo', w / 2, 10 * u, lw, { anchorY: 0 });
      const bw = 460 * u, bh = 60 * u, gap = 14 * u;
      const items: [string, () => void, boolean?][] = [
        ['GRAND PRIX', () => this.pickDifficulty('gp'), true],
        ['VS RACE', () => this.pickDifficulty('race')],
        ['TIME TRIAL', () => this.pickCharacter('timetrial')],
        ['2P SPLIT SCREEN', () => this.pickDifficulty('versus')],
        [online ? 'ONLINE MULTIPLAYER' : 'ONLINE - SETUP', () => this.online()],
        ['OPTIONS', () => this.options()],
      ];
      const top = Math.max(10 * u + lw * (240 / 640) + 24 * u, h / 2 - (items.length * (bh + gap)) / 2 + 50 * u);
      this.ui.panel(w / 2 - bw / 2 - 30 * u, top - 24 * u, bw + 60 * u, items.length * (bh + gap) + 34 * u);
      items.forEach(([label, fn, primary], i) => this.ui.button('m' + i, label, w / 2 - bw / 2, top + i * (bh + gap), bw, bh, fn, { primary }));
    }, () => this.title());
  }

  private pickDifficulty(mode: RaceMode) {
    const opts: Difficulty[] = ['easy', 'medium', 'hard'];
    const desc: Record<Difficulty, string> = { easy: 'RELAXED BOTS · 50CC', medium: 'COMPETITIVE BOTS · 100CC', hard: 'RUTHLESS BOTS · 150CC' };
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header(mode === 'gp' ? 'GRAND PRIX' : mode === 'versus' ? '2P SPLIT SCREEN' : 'VS RACE', 'CHOOSE DIFFICULTY');
      const bw = 420 * u, bh = 66 * u, top = h / 2 - 150 * u;
      this.ui.panel(w / 2 - bw / 2 - 40 * u, top - 30 * u, bw + 80 * u, 3 * 116 * u + 30 * u);
      opts.forEach((dd, i) => {
        this.ui.button('d_' + dd, DIFFICULTY[dd].label.toUpperCase(), w / 2 - bw / 2, top + i * 116 * u, bw, bh, () => { profile.difficulty = dd; saveProfile(); this.pickCharacter(mode); }, { primary: profile.difficulty === dd });
        this.ui.label(desc[dd], w / 2, top + i * 116 * u + bh + 14 * u, 15 * u, 0.5);
      });
    }, () => this.main(), 'd_' + profile.difficulty);
  }

  private pickCharacter(mode: RaceMode, player = 1) {
    const two = mode === 'versus';
    let sel: CharacterId = player === 1 ? profile.char : profile.char2;
    if (two && player === 2 && sel === profile.char) sel = CHARACTERS.find((c) => c.id !== profile.char)!.id;
    const confirm = () => {
      if (player === 1) profile.char = sel; else profile.char2 = sel;
      saveProfile();
      if (two && player === 1) return this.pickCharacter(mode, 2);
      if (mode === 'gp') this.pickCup(); else this.pickTrack(mode);
    };
    this.go(() => {
      const { u, w, h, d } = this.ui;
      this.ui.backdrop();
      this.header(two ? `PLAYER ${player} SELECT` : 'SELECT DRIVER');
      const infoW = 320 * u, gap = 14 * u;
      const cw = Math.min(150 * u, (w - infoW - 120 * u) / 4 - gap), ch = cw * 1.2;
      const total = 4 * cw + 3 * gap + 24 * u + infoW;
      const gx = w / 2 - total / 2, gy = 118 * u;
      CHARACTERS.forEach((c, i) => {
        const x = gx + (i % 4) * (cw + gap), y = gy + Math.floor(i / 4) * (ch + gap);
        const taken = two && player === 2 && c.id === profile.char;
        this.ui.card('c_' + c.id, x, y, cw, ch, sel === c.id, (px, py, pw, ph) => {
          this.portrait(c.id, px, py, pw, pw, sel === c.id, 'sel_' + c.id);
          this.ui.label(c.name, px + pw / 2, py + pw + 6 * u, 13 * u, 0.5, sel === c.id ? argb('#5a2a00') : COL.ink);
          if (taken) d.roundRect(px, py, pw, ph, 12 * u, argb('#000000', 0.5));
        }, () => { if (taken) return; if (sel === c.id) confirm(); else { sel = c.id; audio.playSfx('menuMove'); } }, () => { if (!taken) sel = c.id; });
      });
      // info panel: Rive kart turntable + stats
      const px = gx + 4 * (cw + gap) + 10 * u, ph = 2 * ch + gap;
      this.ui.panel(px, gy, infoW, ph);
      const c = charById(sel);
      this.ui.text(c.name.toUpperCase(), px + infoW / 2, gy + 14 * u, 30 * u, 0.5);
      this.kartTurntable(sel, px + infoW / 2, gy + 60 * u + 150 * u, 170 * u);
      const stats: [string, number][] = [['SPEED', c.topSpeed], ['ACCEL', c.accel], ['HANDLING', c.handling], ['WEIGHT', c.weight]];
      stats.forEach(([lab, v], i) => {
        const sy = gy + ph - 150 * u + i * 32 * u;
        this.ui.label(lab, px + 22 * u, sy, 13 * u, 0);
        d.roundRect(px + 130 * u, sy - 2 * u, 160 * u, 16 * u, 8 * u, argb('#c8d4f0'));
        d.roundRect(px + 130 * u, sy - 2 * u, 32 * u * v, 16 * u, 8 * u, argb(i % 2 ? '#3ad05a' : '#ffae00'));
      });
      this.ui.button('ok', 'OK!', w / 2 - 110 * u, Math.min(h - 84 * u, gy + ph + 26 * u), 220 * u, 62 * u, confirm, { primary: true });
    }, () => (two && player === 2 ? this.pickCharacter(mode, 1) : mode === 'timetrial' ? this.main() : this.pickDifficulty(mode)), 'c_' + sel);
  }

  private pickCup() {
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header('CHOOSE A CUP', `${DIFFICULTY[profile.difficulty].cc} · ${profile.laps} LAPS`);
      const bw = 480 * u, bh = 66 * u, top = h / 2 - 170 * u;
      this.ui.panel(w / 2 - bw / 2 - 40 * u, top - 30 * u, bw + 80 * u, 3 * 116 * u + 106 * u);
      CUPS.forEach((c, i) => {
        this.ui.button('cup' + i, c.name.toUpperCase(), w / 2 - bw / 2, top + i * 116 * u, bw, bh, () => this.startGP(i), { primary: i === 0 });
        this.ui.label(c.tracks.map((t) => trackById(t).name).join(' · '), w / 2, top + i * 116 * u + bh + 12 * u, 12 * u, 0.5);
      });
      const segW = 2 * 80 * u + 10 * u;
      this.ui.label('LAPS', w / 2 - segW / 2 - 70 * u, top + 3 * 116 * u + 18 * u, 16 * u, 0);
      this.ui.seg('laps', w / 2 - segW / 2, top + 3 * 116 * u, 50 * u, [3, 5], profile.laps, String, (v) => { profile.laps = v; saveProfile(); }, 80 * u);
    }, () => this.pickCharacter('gp'));
  }

  private pickTrack(mode: RaceMode) {
    let sel = Math.max(0, TRACKS.findIndex((t) => t.id === (this.lastSetup?.track.id ?? 'circuit')));
    const best = bestTimes();
    const go = () => this.startSingle(mode, TRACKS[sel]);
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header('SELECT COURSE');
      const cols = 4, gap = 16 * u;
      const cw = Math.min(250 * u, (w - 80 * u) / cols - gap), ch = cw * 0.82;
      const gx = w / 2 - (cols * cw + (cols - 1) * gap) / 2, gy = 112 * u;
      TRACKS.forEach((t, i) => {
        const x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (ch + gap);
        this.ui.card('t_' + t.id, x, y, cw, ch, sel === i, (px, py, pw, ph) => {
          this.courseMap(t, px, py, pw, ph - 30 * u);
          this.ui.label(t.name, px + pw / 2, py + ph - 22 * u, 13 * u, 0.5, sel === i ? argb('#5a2a00') : COL.ink);
          if (mode === 'timetrial' && best[t.id]) this.ui.label('BEST ' + formatTime(best[t.id]), px + pw / 2, py + 8 * u, 11 * u, 0.5, COL.white);
        }, () => { if (sel === i) go(); else { sel = i; audio.playSfx('menuMove'); } }, () => { sel = i; });
      });
      const ry = gy + 2 * (ch + gap) + 6 * u;
      let x = w / 2 - 420 * u;
      this.ui.label('LAPS', x, ry + 15 * u, 15 * u); x += 64 * u;
      x += this.ui.seg('laps', x, ry, 46 * u, [3, 5], profile.laps, String, (v) => { profile.laps = v; saveProfile(); }, 70 * u) + 26 * u;
      if (mode !== 'timetrial') {
        this.ui.label('ITEMS', x, ry + 15 * u, 15 * u); x += 84 * u;
        x += this.ui.seg('items', x, ry, 46 * u, [true, false], profile.items, (v) => (v ? 'ON' : 'OFF'), (v) => { profile.items = v; saveProfile(); }, 78 * u) + 26 * u;
      }
      if (mode === 'versus') {
        this.ui.label('BOTS', x, ry + 15 * u, 15 * u); x += 74 * u;
        this.ui.seg('bots', x, ry, 46 * u, [true, false], profile.bots2p, (v) => (v ? 'ON' : 'OFF'), (v) => { profile.bots2p = v; saveProfile(); }, 78 * u);
      }
      this.ui.button('go', 'START!', w / 2 - 130 * u, Math.min(h - 80 * u, ry + 68 * u), 260 * u, 62 * u, go, { primary: true });
    }, () => this.pickCharacter(mode, mode === 'versus' ? 2 : 1), 't_' + TRACKS[sel].id);
  }

  // ------------------------------------------------------------------ race setup
  private botPlayers(exclude: CharacterId[], count: number): PlayerSetup[] {
    return CHARACTERS.filter((c) => !exclude.includes(c.id)).slice(0, count).map((c) => ({ id: 'bot_' + c.id, name: c.name, char: c.id, control: 'bot' as const, localIndex: -1 }));
  }

  /** dev helper: jump straight into a race (used with ?quick=<track>&mode=race|versus|timetrial) */
  quickStart(mode: RaceMode, trackId: string) {
    this.startSingle(mode, trackById(trackId));
  }

  private startSingle(mode: RaceMode, track: TrackDef) {
    const me: PlayerSetup = { id: 'p1', name: profile.name || 'P1', char: profile.char, control: 'local', localIndex: 0 };
    let players: PlayerSetup[];
    if (mode === 'timetrial') players = [me];
    else if (mode === 'versus') {
      const p2: PlayerSetup = { id: 'p2', name: 'P2', char: profile.char2, control: 'local', localIndex: 1 };
      players = profile.bots2p ? [...this.botPlayers([me.char, p2.char], 6), me, p2] : [me, p2];
    } else players = [...this.botPlayers([me.char], 7), me];
    this.launch({
      mode, track, laps: profile.laps, difficulty: mode === 'timetrial' ? 'hard' : profile.difficulty,
      items: mode === 'timetrial' ? true : profile.items, players, seed: Math.floor(Math.random() * 1e9),
    });
  }

  private startGP(cup: number) {
    const me: PlayerSetup = { id: 'p1', name: profile.name || 'P1', char: profile.char, control: 'local', localIndex: 0 };
    const players = [...this.botPlayers([me.char], 7), me];
    this.gp = { cup, race: 0, points: Object.fromEntries(players.map((p) => [p.id, 0])), players, difficulty: profile.difficulty };
    this.gpNext();
  }

  private gpNext() {
    const gp = this.gp!;
    const track = trackById(CUPS[gp.cup].tracks[gp.race]);
    const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
    this.launch({ mode: 'gp', track, laps: profile.laps, difficulty: gp.difficulty, items: true, players: gp.race === 0 ? gp.players : order, seed: Math.floor(Math.random() * 1e9) });
  }

  private launch(setup: SessionSetup) {
    this.lastSetup = setup;
    const s = new RaceSession(setup);
    s.onFinish = (st) => this.results(setup, st);
    this.inRace = true;
    this.pauseOpen = false;
    this.screen = null;
    this.app.startSession(s);
  }

  // ------------------------------------------------------------------ pause
  private togglePause() {
    const s = this.app.session;
    if (!s || !this.inRace) return;
    if (this.pauseOpen) { this.pauseOpen = false; s.paused = false; this.screen = null; return; }
    this.pauseOpen = true;
    const online = !!s.setup.net;
    if (!online) s.paused = true;
    audio.playSfx('menuBack');
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.d.rect(0, 0, w, h, COL.dim);
      this.header(online ? 'LEAVE RACE?' : 'PAUSE');
      const bw = 400 * u, bh = 62 * u, top = h / 2 - 140 * u;
      const items: [string, () => void][] = online
        ? [['KEEP RACING', () => this.togglePause()], ['LEAVE', () => { this.app.endSession(); this.inRace = false; this.pauseOpen = false; this.leaveRoom(); this.main(); }]]
        : [['CONTINUE', () => this.togglePause()], ['RETRY', () => { this.app.endSession(); if (this.lastSetup) this.launch({ ...this.lastSetup, seed: Math.floor(Math.random() * 1e9) }); }], ['QUIT', () => { this.app.endSession(); this.inRace = false; this.pauseOpen = false; this.main(); }]];
      this.ui.panel(w / 2 - bw / 2 - 30 * u, top - 24 * u, bw + 60 * u, items.length * (bh + 14 * u) + 34 * u);
      items.forEach(([l, fn], i) => this.ui.button('p' + i, l, w / 2 - bw / 2, top + i * (bh + 14 * u), bw, bh, fn, { primary: i === 0 }));
      this.controlsHelp(w / 2, top + items.length * (bh + 14 * u) + 40 * u, s.setup.mode === 'versus');
    }, () => this.togglePause());
  }

  private controlsHelp(cx: number, y: number, split: boolean) {
    const u = this.ui.u;
    const lines = split
      ? ['P1: W/S GAS/BRAKE · A/D STEER · F HOP · G ITEM', 'P2: ARROWS · . HOP · / ITEM', 'ESC: PAUSE']
      : ['ARROWS / WASD: DRIVE', 'SPACE / SHIFT: HOP · HOLD + STEER TO DRIFT', 'E / CTRL: USE ITEM · HOLD DOWN TO THROW BACK', 'ESC / P: PAUSE · GAMEPADS SUPPORTED'];
    const pw = 660 * u;
    this.ui.panel(cx - pw / 2, y, pw, lines.length * 30 * u + 26 * u);
    lines.forEach((l, i) => this.ui.label(l, cx, y + 18 * u + i * 30 * u, 14 * u, 0.5, COL.ink));
  }

  // ------------------------------------------------------------------ results
  private results(setup: SessionSetup, st: Standing[]) {
    this.inRace = false;
    this.pauseOpen = false;
    const gp = this.gp;
    const pts = [9, 6, 3, 1];
    if (gp && setup.mode === 'gp') st.forEach((s) => { gp.points[s.id] = (gp.points[s.id] ?? 0) + (pts[s.place - 1] ?? 0); });
    audio.playMusic('results');
    let newBest = false;
    if (setup.mode === 'timetrial' && st[0]?.finished) newBest = saveBest(setup.track.id, st[0].time);
    this.resultsData = { setup, st, newBest };
    this.go(() => {
      const { u, w, h, d } = this.ui;
      const { setup: su, st: rows, newBest: nb } = this.resultsData!;
      const mode = su.mode;
      d.rect(0, 0, w, h, COL.dim);
      this.header(mode === 'timetrial' ? (nb ? 'NEW RECORD!' : 'TIME TRIAL') : 'RESULTS', su.track.name);
      const pw = Math.min(900 * u, w - 60 * u), rowH = Math.min(56 * u, (h - 320 * u) / rows.length);
      const px = w / 2 - pw / 2, py = 128 * u;
      this.ui.panel(px, py, pw, rows.length * rowH + 24 * u);
      rows.forEach((s, i) => {
        const y = py + 12 * u + i * rowH;
        if (s.control === 'local') d.roundRect(px + 10 * u, y, pw - 20 * u, rowH - 4 * u, 12 * u, argb('#ffd23f', 0.45));
        this.ui.text(ordinal(s.place).toUpperCase(), px + 26 * u, y + rowH * 0.15, rowH * 0.58, 0);
        this.portrait(s.char, px + 140 * u, y + 2 * u, rowH - 8 * u, rowH - 8 * u, s.place === 1, 'res_' + s.id);
        this.ui.label(s.name, px + 150 * u + rowH, y + rowH * 0.36, 17 * u, 0, COL.ink);
        this.ui.label(s.finished ? formatTime(s.time) : '--', px + pw * 0.62, y + rowH * 0.36, 17 * u, 0, COL.ink);
        if (gp && mode === 'gp') this.ui.label(`+${pts[s.place - 1] ?? 0} PTS`, px + pw - 36 * u, y + rowH * 0.36, 17 * u, 1, argb('#d07000'));
      });
      const by = Math.min(h - 84 * u, py + rows.length * rowH + 48 * u);
      const acts: [string, () => void][] = [];
      if (mode === 'online') acts.push(['BACK TO LOBBY', () => { this.app.endSession(); this.room?.endRace(); this.lobby(); }]);
      else if (gp && mode === 'gp') {
        const last = gp.race >= CUPS[gp.cup].tracks.length - 1;
        acts.push([last ? 'AWARDS' : 'NEXT RACE', () => { this.app.endSession(); if (last) this.gpAwards(); else { gp.race++; this.gpStandings(); } }]);
        acts.push(['QUIT', () => { this.app.endSession(); this.main(); }]);
      } else {
        acts.push(['RETRY', () => { this.app.endSession(); this.launch({ ...su, seed: Math.floor(Math.random() * 1e9) }); }]);
        acts.push(['CHANGE COURSE', () => { this.app.endSession(); this.pickTrack(mode); }]);
        acts.push(['MENU', () => { this.app.endSession(); this.main(); }]);
      }
      const bw = 300 * u, gap = 18 * u, total = acts.length * bw + (acts.length - 1) * gap;
      acts.forEach(([l, fn], i) => this.ui.button('r' + i, l, w / 2 - total / 2 + i * (bw + gap), by, bw, 62 * u, fn, { primary: i === 0 }));
    }, null);
  }

  private gpStandings() {
    const gp = this.gp!;
    this.go(() => {
      const { u, w, h, d } = this.ui;
      this.ui.backdrop();
      const next = trackById(CUPS[gp.cup].tracks[gp.race]);
      this.header(CUPS[gp.cup].name, 'NEXT: ' + next.name);
      const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
      const pw = Math.min(760 * u, w - 60 * u), rowH = Math.min(54 * u, (h - 320 * u) / order.length);
      const px = w / 2 - pw / 2, py = 128 * u;
      this.ui.panel(px, py, pw, order.length * rowH + 24 * u);
      order.forEach((p, i) => {
        const y = py + 12 * u + i * rowH;
        if (p.control === 'local') d.roundRect(px + 10 * u, y, pw - 20 * u, rowH - 4 * u, 12 * u, argb('#ffd23f', 0.45));
        this.ui.text(String(i + 1), px + 26 * u, y + rowH * 0.15, rowH * 0.58, 0);
        this.portrait(p.char, px + 90 * u, y + 2 * u, rowH - 8 * u, rowH - 8 * u, false, 'gps_' + p.id);
        this.ui.label(p.name, px + 100 * u + rowH, y + rowH * 0.36, 17 * u, 0, COL.ink);
        this.ui.label(`${gp.points[p.id]} PTS`, px + pw - 36 * u, y + rowH * 0.36, 17 * u, 1, argb('#d07000'));
      });
      this.ui.button('race', 'RACE!', w / 2 - 140 * u, Math.min(h - 84 * u, py + order.length * rowH + 48 * u), 280 * u, 62 * u, () => this.gpNext(), { primary: true });
    }, null);
  }

  private gpAwards() {
    const gp = this.gp!;
    const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
    const myRank = order.findIndex((p) => p.control === 'local') + 1;
    audio.playMusic('results');
    audio.playSfx(myRank <= 3 ? 'finishWin' : 'finishLose');
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header(myRank <= 3 ? 'CONGRATULATIONS!' : 'BETTER LUCK NEXT TIME', `${CUPS[gp.cup].name} · ${DIFFICULTY[gp.difficulty].cc} · YOU FINISHED ${ordinal(myRank)}`);
      if (myRank <= 3) this.app.assets.draw(this.ui.d, 'trophy', 'Trophy', w / 2, 130 * u, 190 * u, { anchorY: 0, inputs: { rank: myRank } });
      const pw = 220 * u;
      order.slice(0, 3).forEach((p, i) => {
        const x = w / 2 + (i - 1) * (pw + 30 * u) - pw / 2, y = h * 0.56;
        this.ui.panel(x, y, pw, 230 * u);
        this.portrait(p.char, x + 40 * u, y + 14 * u, pw - 80 * u, pw - 80 * u, true, 'pod_' + p.id);
        this.ui.text(ordinal(i + 1).toUpperCase(), x + pw / 2, y + pw - 64 * u, 30 * u, 0.5);
        this.ui.label(`${p.name} · ${gp.points[p.id]} PTS`, x + pw / 2, y + pw - 18 * u, 13 * u, 0.5, COL.ink);
      });
      this.ui.button('menu', 'MENU', w / 2 - 120 * u, h - 84 * u, 240 * u, 62 * u, () => this.main(), { primary: true });
    }, () => this.main());
  }

  // ------------------------------------------------------------------ options
  options() {
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header('OPTIONS');
      const pw = 620 * u, px = w / 2 - pw / 2, py = 128 * u;
      this.ui.panel(px, py, pw, 410 * u);
      const vols = audio.getVolumes?.() ?? { master: 0.8, music: 0.7, sfx: 0.9 };
      this.ui.label('NAME', px + 40 * u, py + 34 * u, 16 * u, 0);
      this.textField('name', px + 200 * u, py + 18 * u, pw - 240 * u, 50 * u, profile.name, 10, (v) => { profile.name = v.slice(0, 10) || 'PLAYER'; saveProfile(); });
      const sliders: [string, number, (v: number) => void][] = [
        ['MASTER', vols.master, (v) => audio.setMasterVolume(v)],
        ['MUSIC', vols.music, (v) => audio.setMusicVolume(v)],
        ['SOUND FX', vols.sfx, (v) => audio.setSfxVolume(v)],
      ];
      sliders.forEach(([lab, v, set], i) => {
        const y = py + 96 * u + i * 66 * u;
        this.ui.label(lab, px + 40 * u, y + 16 * u, 16 * u, 0);
        this.ui.slider('vol' + i, px + 200 * u, y, pw - 260 * u, 44 * u, v, set);
      });
      this.ui.button('mute', audio.isMuted() ? 'SOUND: OFF' : 'SOUND: ON', px + 40 * u, py + 310 * u, pw - 80 * u, 58 * u, () => audio.setMuted(!audio.isMuted()));
      this.ui.button('back', 'BACK', w / 2 - 120 * u, Math.min(h - 84 * u, py + 440 * u), 240 * u, 58 * u, () => this.main(), { primary: true });
    }, () => this.main());
  }

  // ------------------------------------------------------------------ online
  private online() {
    if (!firebaseConfigured()) {
      this.go(() => {
        const { u, w, h } = this.ui;
        this.ui.backdrop();
        this.header('ONLINE MULTIPLAYER');
        const pw = 760 * u, px = w / 2 - pw / 2, py = 138 * u;
        this.ui.panel(px, py, pw, 320 * u);
        ['ONLINE PLAY USES FIREBASE REALTIME DATABASE.', '1. CREATE A FIREBASE PROJECT', '2. ENABLE REALTIME DATABASE + ANONYMOUS AUTH', '3. COPY .ENV.EXAMPLE TO .ENV.LOCAL AND ADD YOUR KEYS', '4. DEPLOY DATABASE.RULES.JSON', 'MEANWHILE: VS BOTS AND 2P SPLIT SCREEN WORK OFFLINE!']
          .forEach((l, i) => this.ui.label(l, w / 2, py + 32 * u + i * 45 * u, 15 * u, 0.5, COL.ink));
        this.ui.button('back', 'BACK', w / 2 - 120 * u, Math.min(h - 84 * u, py + 356 * u), 240 * u, 58 * u, () => this.main(), { primary: true });
      }, () => this.main());
      return;
    }
    this.onlineErr = '';
    let code = '';
    const doIt = async (fn: () => Promise<Room>) => {
      if (this.busy) return;
      this.busy = true;
      this.onlineErr = 'CONNECTING…';
      try { this.room = await fn(); this.lobby(); }
      catch (e) { this.onlineErr = String((e as Error).message || e).toUpperCase(); }
      finally { this.busy = false; }
    };
    this.go(() => {
      const { u, w, h } = this.ui;
      this.ui.backdrop();
      this.header('ONLINE MULTIPLAYER');
      const pw = 620 * u, px = w / 2 - pw / 2, py = 128 * u;
      this.ui.panel(px, py, pw, 430 * u);
      this.ui.label('YOUR NAME', w / 2, py + 24 * u, 15 * u, 0.5);
      this.textField('oname', px + 60 * u, py + 48 * u, pw - 120 * u, 54 * u, profile.name, 10, (v) => { profile.name = v.slice(0, 10) || 'PLAYER'; saveProfile(); });
      this.ui.button('create', 'CREATE ROOM', px + 60 * u, py + 118 * u, pw - 120 * u, 60 * u, () => doIt(() => Room.create(profile.name, profile.char, { track: 'circuit', difficulty: profile.difficulty, laps: 3, bots: true, items: true })), { primary: true });
      this.ui.label('OR JOIN WITH A CODE', w / 2, py + 206 * u, 15 * u, 0.5);
      this.textField('code', px + 60 * u, py + 230 * u, pw - 120 * u, 54 * u, code, 4, (v) => { code = v; });
      this.ui.button('join', 'JOIN ROOM', px + 60 * u, py + 300 * u, pw - 120 * u, 60 * u, () => doIt(() => Room.join(code, profile.name, profile.char)));
      if (this.onlineErr) this.ui.label(this.onlineErr, w / 2, py + 386 * u, 14 * u, 0.5, argb('#d01010'));
      this.ui.button('back', 'BACK', w / 2 - 110 * u, Math.min(h - 80 * u, py + 458 * u), 220 * u, 54 * u, () => this.main());
    }, () => this.main());
  }

  private lobby() {
    const room = this.room;
    if (!room) return this.main();
    audio.playMusic('menu');
    this.inRace = false;
    let seen = false;
    this.go(() => {
      const { u, w, h, d } = this.ui;
      const data = room.data;
      if (!data) { if (seen) { this.toast('ROOM CLOSED'); this.leaveRoom(); this.main(); } return; }
      seen = true;
      // the host started the race → everyone jumps in together
      if (data.status === 'racing' && data.race && this.app.session === null && room.serverNow() < data.race.startAt + 1500) { this.startOnline(); return; }
      this.ui.backdrop();
      this.ui.text('ROOM ' + room.code, w / 2, 18 * u, 60 * u, 0.5);
      this.ui.label('SHARE THIS CODE WITH FRIENDS', w / 2, 88 * u, 15 * u, 0.5, COL.white);
      const me = data.players?.[room.uid];
      const host = room.isHost;
      const players = room.players;
      const taken = new Set(players.filter(([id]) => id !== room.uid).map(([, p]) => p.char));
      const s = data.settings;
      // players
      const lw = 400 * u, lx = 36 * u, ly = 124 * u, rowH = 50 * u;
      this.ui.panel(lx, ly, lw, players.length * rowH + 56 * u);
      players.forEach(([id, p], i) => {
        const y = ly + 14 * u + i * rowH;
        this.portrait(p.char, lx + 14 * u, y, rowH - 8 * u, rowH - 8 * u, id === room.uid, 'lob_' + id);
        this.ui.label(`${p.name}${id === room.uid ? ' (YOU)' : ''}`, lx + 26 * u + rowH, y + rowH * 0.3, 15 * u, 0, COL.ink);
        this.ui.label(id === data.host ? 'HOST' : p.ready ? 'READY' : 'WAITING', lx + lw - 18 * u, y + rowH * 0.3, 13 * u, 1, id === data.host || p.ready ? argb('#1a9a3a') : COL.text2);
      });
      this.ui.label(`${players.length}/${MAX_PLAYERS} RACERS${s.bots ? ' · BOTS FILL EMPTY SLOTS' : ''}`, lx + lw / 2, ly + players.length * rowH + 26 * u, 12 * u, 0.5);
      // driver picker + settings
      const rx = lx + lw + 26 * u, rw = w - rx - 36 * u;
      this.ui.panel(rx, ly, rw, 440 * u);
      this.ui.label('YOUR DRIVER', rx + 22 * u, ly + 18 * u, 14 * u, 0);
      const cw = Math.min(68 * u, (rw - 50 * u) / 8 - 8 * u);
      CHARACTERS.forEach((c, i) => {
        const x = rx + 22 * u + i * (cw + 8 * u), y = ly + 44 * u;
        this.ui.card('lc_' + c.id, x, y, cw, cw, me?.char === c.id, (px, py, pw) => {
          this.portrait(c.id, px, py, pw, pw, me?.char === c.id, 'lobc_' + c.id);
          if (taken.has(c.id)) d.roundRect(px, py, pw, pw, 8 * u, argb('#000000', 0.55));
        }, () => { if (taken.has(c.id)) return; profile.char = c.id; saveProfile(); room.setMe({ char: c.id }); });
      });
      const set = (patch: Partial<typeof s>) => room.setSettings(patch);
      let y = ly + 44 * u + cw + 26 * u;
      this.ui.label('COURSE', rx + 22 * u, y + 12 * u, 14 * u, 0);
      if (host) {
        const half = Math.ceil(TRACKS.length / 2);
        [TRACKS.slice(0, half), TRACKS.slice(half)].forEach((row, r) => this.ui.seg('lt' + r, rx + 120 * u, y + r * 50 * u, 40 * u, row.map((t) => t.id), s.track, (v) => trackById(v).name.split(' ')[0].toUpperCase(), (v) => set({ track: v })));
        y += 100 * u;
      } else { this.ui.label(trackById(s.track).name, rx + 120 * u, y + 12 * u, 15 * u, 0, COL.ink); y += 50 * u; }
      this.ui.label('BOTS', rx + 22 * u, y + 12 * u, 14 * u, 0);
      if (host) {
        const used = this.ui.seg('ld', rx + 120 * u, y, 40 * u, ['easy', 'medium', 'hard'] as Difficulty[], s.difficulty, (v) => DIFFICULTY[v].label.toUpperCase(), (v) => set({ difficulty: v }));
        this.ui.seg('lb', rx + 140 * u + used, y, 40 * u, [true, false], s.bots, (v) => (v ? 'ON' : 'OFF'), (v) => set({ bots: v }), 66 * u);
      } else this.ui.label(`${DIFFICULTY[s.difficulty].label} · ${s.bots ? 'ON' : 'OFF'}`, rx + 120 * u, y + 12 * u, 15 * u, 0, COL.ink);
      y += 54 * u;
      this.ui.label('LAPS', rx + 22 * u, y + 12 * u, 14 * u, 0);
      if (host) {
        this.ui.seg('ll', rx + 120 * u, y, 40 * u, [3, 5], s.laps, String, (v) => set({ laps: v }), 58 * u);
        this.ui.label('ITEMS', rx + 280 * u, y + 12 * u, 14 * u, 0);
        this.ui.seg('li', rx + 360 * u, y, 40 * u, [true, false], s.items, (v) => (v ? 'ON' : 'OFF'), (v) => set({ items: v }), 66 * u);
      } else this.ui.label(`${s.laps} LAPS · ITEMS ${s.items ? 'ON' : 'OFF'}`, rx + 120 * u, y + 12 * u, 15 * u, 0, COL.ink);
      const by = h - 90 * u;
      if (host) this.ui.button('start', 'START RACE!', w / 2 - 330 * u, by, 320 * u, 62 * u, () => { room.startRace().catch((e) => this.toast(String(e.message || e))); }, { primary: true });
      else this.ui.button('ready', me?.ready ? 'NOT READY' : 'READY!', w / 2 - 330 * u, by, 320 * u, 62 * u, () => room.setMe({ ready: !me?.ready }), { primary: true });
      this.ui.button('leave', 'LEAVE', w / 2 + 10 * u, by, 320 * u, 62 * u, () => { this.leaveRoom(); this.main(); });
    }, () => { this.leaveRoom(); this.main(); });
  }

  private startOnline() {
    const room = this.room!;
    const data = room.data!;
    const race = data.race!;
    const setup: SessionSetup = {
      mode: 'online', track: trackById(data.settings.track), laps: data.settings.laps, difficulty: data.settings.difficulty, items: data.settings.items,
      players: room.playerSetups(), seed: race.seed, net: room.hooks(),
    };
    this.lastSetup = setup;
    const s = new RaceSession(setup);
    s.onFinish = (st) => { room.stopRaceChannels(); this.results(setup, st); };
    this.inRace = true;
    this.pauseOpen = false;
    this.screen = null;
    this.app.startSession(s);
  }

  private leaveRoom() {
    if (this.room) { const r = this.room; this.room = null; r.leave(); }
  }

  // ------------------------------------------------------------------ touch controls (drawn with Rive)
  private touchRegions: { k: string; x: number; y: number; r: number }[] = [];
  private pointers = new Map<number, string>();

  private drawTouch(d: Draw, w: number, h: number) {
    if (!matchMedia('(pointer: coarse)').matches) { this.touchRegions = []; return; }
    const r = Math.min(w, h) * 0.085, pad = r * 0.4;
    this.touchRegions = [
      { k: 'left', x: pad + r, y: h - pad - r, r },
      { k: 'right', x: pad + r * 3.4, y: h - pad - r, r },
      { k: 'accel', x: w - pad - r, y: h - pad - r, r },
      { k: 'brake', x: w - pad - r * 3.4, y: h - pad - r * 0.7, r: r * 0.75 },
      { k: 'hop', x: w - pad - r, y: h - pad - r * 3.3, r: r * 0.75 },
      { k: 'item', x: w - pad - r * 3.2, y: h - pad - r * 2.9, r: r * 0.75 },
      { k: 'pause', x: w / 2, y: pad + r * 0.5, r: r * 0.45 },
    ];
    const labels: Record<string, string> = { left: '<', right: '>', accel: 'A', brake: 'B', hop: 'R', item: 'L', pause: 'II' };
    for (const t of this.touchRegions) {
      const on = t.k !== 'pause' && (touch as Record<string, unknown>)[t.k];
      d.circle(t.x, t.y, t.r, argb(on ? '#ffae00' : t.k === 'accel' ? '#1a9a3a' : '#1f4fd0', 0.55), COL.white, 3);
      if (this.ui.d) this.ui.text(labels[t.k], t.x, t.y - t.r * 0.35, t.r * 0.7, 0.5);
    }
  }

  private setupTouch() {
    const c = this.app.canvas;
    const find = (x: number, y: number) => this.touchRegions.find((t) => Math.hypot(t.x - x, t.y - y) < t.r * 1.15);
    const set = (k: string, v: boolean) => { if (k !== 'pause') (touch as Record<string, unknown>)[k] = v; };
    c.addEventListener('pointerdown', (e) => {
      if (!this.inRace || this.pauseOpen) return;
      const t = find(e.offsetX, e.offsetY);
      if (!t) return;
      e.preventDefault();
      if (t.k === 'pause') { this.togglePause(); return; }
      this.pointers.set(e.pointerId, t.k);
      set(t.k, true);
    });
    const up = (e: PointerEvent) => { const k = this.pointers.get(e.pointerId); if (k) { set(k, false); this.pointers.delete(e.pointerId); } };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointermove', (e) => {
      const k = this.pointers.get(e.pointerId);
      if (!k) return;
      const t = find(e.offsetX, e.offsetY);
      if (t && t.k !== k && (k === 'left' || k === 'right') && (t.k === 'left' || t.k === 'right')) { set(k, false); set(t.k, true); this.pointers.set(e.pointerId, t.k); }
    });
  }
}
