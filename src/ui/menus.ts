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
import { Room, MAX_PLAYERS, type RoomData } from '../net/room';
import { input, touch } from '../game/input';
import { drawItemFallback } from '../game/itemArt';

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

// ------------------------------------------------------------------ dom helpers
type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
function btn(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return h('button', { class: cls, onclick: () => { audio.playSfx('menuSelect'); onClick(); } }, label);
}

// ------------------------------------------------------------------ controller
type Back = (() => void) | null;

export class Menus {
  private app: App;
  private ui: HTMLElement;
  private backFn: Back = null;
  private room: Room | null = null;
  private roomUnsub: (() => void) | null = null;
  private gp: { cup: number; race: number; points: Record<string, number>; players: PlayerSetup[]; difficulty: Difficulty } | null = null;
  private lastSetup: SessionSetup | null = null;
  private inRace = false;

  constructor(app: App) {
    this.app = app;
    this.ui = document.getElementById('ui')!;
    window.addEventListener('keydown', (e) => this.onKey(e));
    input.setPauseHandler(() => this.togglePause());
    this.setupTouch();
  }

  // ---------------- navigation
  private screenCleanup: (() => void) | null = null;

  private show(el: HTMLElement, back: Back = null) {
    this.screenCleanup?.();
    this.screenCleanup = null;
    this.app.clearWidgets();
    this.ui.replaceChildren(el);
    this.backFn = back;
    const first = el.querySelector<HTMLElement>('button.primary, button, input');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent) {
    if (this.inRace && !this.app.session?.paused) return;
    const t = e.target as HTMLElement;
    if (t?.tagName === 'INPUT' && e.key !== 'Escape' && e.key !== 'Enter') return;
    const items = Array.from(this.ui.querySelectorAll<HTMLElement>('button:not([disabled]), input'));
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const move = (d: number) => {
      e.preventDefault();
      const next = items[(idx + d + items.length) % items.length] ?? items[0];
      next?.focus();
      audio.playSfx('menuMove');
    };
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': move(1); break;
      case 'ArrowUp': case 'ArrowLeft': move(-1); break;
      case 'Escape': case 'Backspace':
        if (t?.tagName === 'INPUT' && e.key === 'Backspace') return;
        if (this.backFn) { e.preventDefault(); audio.playSfx('menuBack'); this.backFn(); }
        break;
    }
  }

  // ---------------- widgets
  private portraitCanvas(id: CharacterId, selected: () => boolean, key: string): HTMLCanvasElement {
    const c = h('canvas', {});
    queueMicrotask(() => this.app.addWidget(c, (d, w, hh) => {
      if (!this.app.assets.draw(d, key, 'Portrait_' + id, w / 2, hh / 2, Math.min(w, hh), { anchorY: 0.5, inputs: { selected: selected() } })) {
        const ch = charById(id);
        d.roundRect(2, 2, w - 4, hh - 4, 8, argb(ch.color), argb('#ffffff'), 2);
        d.circle(w / 2, hh / 2, Math.min(w, hh) * 0.3, argb(ch.skin), argb('#140c18'), 2);
        d.text(ch.letter, w / 2, hh / 2 - 7, 2, argb('#140c18'), { align: 0.5 });
      }
    }));
    return c;
  }

  private kartCanvas(id: CharacterId, key: string): HTMLCanvasElement {
    const c = h('canvas', {});
    queueMicrotask(() => this.app.addWidget(c, (d, w, hh, t) => {
      if (!this.app.assets.draw(d, key, 'Kart_' + id, w / 2, hh / 2, Math.min(w, hh), { anchorY: 0.5, inputs: { steer: Math.sin(t * 1.5), boost: Math.sin(t) > 0.6 } })) {
        d.roundRect(w * 0.2, hh * 0.45, w * 0.6, hh * 0.3, 6, argb(charById(id).color));
      }
    }));
    return c;
  }

  private trackCanvas(def: TrackDef): HTMLCanvasElement {
    const c = h('canvas', {});
    const tr = thumbTrack(def);
    queueMicrotask(() => this.app.addWidget(c, (d, w, hh, t) => drawTrackThumb(d, tr, w, hh, t)));
    return c;
  }

  // ---------------- screens
  title() {
    this.leaveRoom();
    this.inRace = false;
    audio.playMusic('title');
    const logo = h('canvas', { class: 'title-logo' });
    let gone = false;
    const go = () => { if (gone) return; gone = true; audio.unlock(); audio.playSfx('menuSelect'); this.main(); };
    const el = h('div', { class: 'screen clear title', onclick: go },
      logo,
      h('div', { class: 'blink', style: 'font-size:3em;margin-top:auto;margin-bottom:12%' }, 'PRESS START'),
      h('div', { class: 'sub', style: 'position:absolute;bottom:3%' }, 'A SUPER KART TRIBUTE · RENDERED WITH RIVE'),
    );
    this.show(el);
    this.app.addWidget(logo, (d, w, hh, t) => {
      if (!this.app.assets.draw(d, 'logo', 'Logo', w / 2, hh / 2, w, { anchorY: 0.5 })) {
        d.text('DARIOKART', w / 2, hh / 2 - 20 + Math.sin(t * 3) * 4, Math.max(2, w / 80), argb('#e52521'), { align: 0.5, outline: argb('#ffd23f'), shadow: argb('#140c18') });
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', onKey);
    this.screenCleanup = () => window.removeEventListener('keydown', onKey);
  }

  main() {
    this.leaveRoom();
    this.gp = null;
    audio.playMusic('menu');
    const online = firebaseConfigured();
    const logo = h('canvas', { class: 'title-logo', style: 'width:min(70%, 560px)' });
    queueMicrotask(() => this.app.addWidget(logo, (d, w, hh) => { this.app.assets.draw(d, 'logo_m', 'Logo', w / 2, hh / 2, w, { anchorY: 0.5 }); }));
    this.show(h('div', { class: 'screen' },
      logo,
      h('div', { class: 'menu panel' },
        btn('GRAND PRIX', () => this.pickDifficulty('gp'), 'primary'),
        btn('VS RACE  (BOTS)', () => this.pickDifficulty('race')),
        btn('TIME TRIAL', () => this.pickCharacter('timetrial')),
        btn('2P SPLIT SCREEN', () => this.pickDifficulty('versus')),
        btn('ONLINE MULTIPLAYER' + (online ? '' : '  *'), () => this.online()),
        btn('OPTIONS', () => this.options()),
      ),
      !online && h('div', { class: 'note' }, '* ONLINE NEEDS FIREBASE KEYS (.env.local)'),
    ), () => this.title());
  }

  private pickDifficulty(mode: RaceMode) {
    const opts: Difficulty[] = ['easy', 'medium', 'hard'];
    const desc: Record<Difficulty, string> = {
      easy: 'RELAXED BOTS · 50CC',
      medium: 'COMPETITIVE BOTS · 100CC',
      hard: 'RUTHLESS BOTS · 150CC',
    };
    this.show(h('div', { class: 'screen' },
      h('h2', {}, mode === 'gp' ? 'GRAND PRIX' : mode === 'versus' ? '2P SPLIT SCREEN' : 'VS RACE'),
      h('div', { class: 'label' }, 'CHOOSE DIFFICULTY'),
      h('div', { class: 'menu panel' },
        ...opts.map((d) => h('div', { class: 'row', style: 'flex-direction:column;gap:.3em' },
          btn(`${DIFFICULTY[d].label.toUpperCase()}`, () => { profile.difficulty = d; saveProfile(); this.pickCharacter(mode); }, profile.difficulty === d ? 'primary' : ''),
          h('div', { class: 'sub', style: 'font-size:.8em' }, desc[d]),
        )),
      ),
    ), () => this.main());
  }

  private pickCharacter(mode: RaceMode, player = 1) {
    const two = mode === 'versus';
    let sel: CharacterId = player === 1 ? profile.char : profile.char2;
    const cards = new Map<CharacterId, HTMLElement>();
    const info = h('div', { class: 'panel', style: 'min-width:60%' });
    const renderInfo = () => {
      const c = charById(sel);
      const stat = (label: string, v: number) => [h('span', {}, label), h('div', { class: 'bar' }, h('i', { style: `width:${v * 20}%` }))];
      info.replaceChildren(h('div', { class: 'row', style: 'gap:1.2em' },
        h('div', { style: 'width:6em;height:6em' }, Object.assign(this.kartCanvas(c.id, 'kartsel'), { style: 'width:100%;height:100%' })),
        h('div', { class: 'stats' }, h('span', { style: 'grid-column:span 2;color:var(--gold)' }, c.name.toUpperCase()), ...stat('SPEED', c.topSpeed), ...stat('ACCEL', c.accel), ...stat('HANDLE', c.handling), ...stat('WEIGHT', c.weight)),
      ));
    };
    const choose = (id: CharacterId) => {
      if (two && player === 2 && id === profile.char) return;
      sel = id;
      for (const [cid, el] of cards) el.classList.toggle('sel', cid === sel);
      renderInfo();
    };
    const confirm = () => {
      if (player === 1) profile.char = sel; else profile.char2 = sel;
      saveProfile();
      if (two && player === 1) return this.pickCharacter(mode, 2);
      if (mode === 'gp') this.pickCup();
      else this.pickTrack(mode);
    };
    const grid = h('div', { class: 'chars' }, ...CHARACTERS.map((c) => {
      const taken = two && player === 2 && c.id === profile.char;
      const el = h('button', {
        class: 'char' + (c.id === sel ? ' sel' : '') + (taken ? ' taken' : ''),
        onclick: () => { if (sel === c.id) { audio.playSfx('menuSelect'); confirm(); } else { audio.playSfx('menuMove'); choose(c.id); } },
        onfocus: () => choose(c.id),
      }, this.portraitCanvas(c.id, () => sel === c.id, 'sel_' + c.id), c.name.toUpperCase(), taken ? h('span', { class: 'p1tag' }, '1P') : null);
      cards.set(c.id, el);
      return el;
    }));
    renderInfo();
    this.show(h('div', { class: 'screen' },
      h('h2', {}, two ? `PLAYER ${player} SELECT` : 'SELECT DRIVER'),
      grid, info,
      h('div', { class: 'row' }, btn('OK!', confirm, 'primary')),
    ), () => (two && player === 2 ? this.pickCharacter(mode, 1) : mode === 'timetrial' ? this.main() : this.pickDifficulty(mode)));
    // focus the selected card
    cards.get(sel)?.focus({ preventScroll: true });
  }

  private pickCup() {
    this.show(h('div', { class: 'screen' },
      h('h2', {}, 'CHOOSE A CUP'),
      h('div', { class: 'menu panel' }, ...CUPS.map((c, i) => h('div', { style: 'display:flex;flex-direction:column;gap:.3em' },
        btn(c.name.toUpperCase(), () => this.startGP(i), i === 0 ? 'primary' : ''),
        h('div', { class: 'sub', style: 'font-size:.75em' }, c.tracks.map((t) => trackById(t).name.toUpperCase()).join(' · ')),
      ))),
      h('div', { class: 'row' }, h('span', { class: 'label' }, 'LAPS'), this.seg([3, 5], profile.laps, (v) => { profile.laps = v; saveProfile(); })),
    ), () => this.pickCharacter('gp'));
  }

  private seg<T>(vals: T[], cur: T, set: (v: T) => void, label: (v: T) => string = String): HTMLElement {
    const wrap = h('div', { class: 'seg' });
    const render = (c: T) => wrap.replaceChildren(...vals.map((v) => h('button', { class: v === c ? 'on' : '', onclick: () => { audio.playSfx('menuMove'); set(v); render(v); } }, label(v))));
    render(cur);
    return wrap;
  }

  private pickTrack(mode: RaceMode) {
    let sel = 0;
    const cards: HTMLElement[] = [];
    const best = bestTimes();
    const go = () => this.startSingle(mode, TRACKS[sel]);
    const grid = h('div', { class: 'tracks' }, ...TRACKS.map((t, i) => {
      const el = h('button', {
        class: 'track' + (i === sel ? ' sel' : ''),
        onclick: () => { if (sel === i) { audio.playSfx('menuSelect'); go(); } else { sel = i; cards.forEach((c, j) => c.classList.toggle('sel', j === sel)); audio.playSfx('menuMove'); } },
        onfocus: () => { sel = i; cards.forEach((c, j) => c.classList.toggle('sel', j === sel)); },
      }, this.trackCanvas(t), t.name.toUpperCase(), mode === 'timetrial' && best[t.id] ? h('span', { style: 'font-size:.75em' }, 'BEST ' + formatTime(best[t.id])) : null);
      cards.push(el);
      return el;
    }));
    this.show(h('div', { class: 'screen' },
      h('h2', {}, 'SELECT COURSE'),
      grid,
      h('div', { class: 'row' },
        h('span', { class: 'label' }, 'LAPS'), this.seg([3, 5], profile.laps, (v) => { profile.laps = v; saveProfile(); }),
        mode !== 'timetrial' && h('span', { class: 'label' }, 'ITEMS'),
        mode !== 'timetrial' && this.seg([true, false], profile.items, (v) => { profile.items = v; saveProfile(); }, (v) => (v ? 'ON' : 'OFF')),
        mode === 'versus' && h('span', { class: 'label' }, 'BOTS'),
        mode === 'versus' && this.seg([true, false], profile.bots2p, (v) => { profile.bots2p = v; saveProfile(); }, (v) => (v ? 'ON' : 'OFF')),
      ),
      h('div', { class: 'row' }, btn('START!', go, 'primary')),
    ), () => this.pickCharacter(mode, mode === 'versus' ? 2 : 1));
    cards[0]?.focus({ preventScroll: true });
  }

  // ---------------- race setup
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
    const players = [...this.botPlayers([me.char], 7), me]; // SMK: player starts at the back
    this.gp = { cup, race: 0, points: Object.fromEntries(players.map((p) => [p.id, 0])), players, difficulty: profile.difficulty };
    this.gpNext();
  }

  private gpNext() {
    const gp = this.gp!;
    const track = trackById(CUPS[gp.cup].tracks[gp.race]);
    // grid order: reverse of current standings (leader starts in front)
    const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
    this.launch({ mode: 'gp', track, laps: profile.laps, difficulty: gp.difficulty, items: true, players: gp.race === 0 ? gp.players : order, seed: Math.floor(Math.random() * 1e9) });
  }

  private launch(setup: SessionSetup) {
    this.lastSetup = setup;
    const s = new RaceSession(setup);
    s.onFinish = (st) => this.results(setup, st);
    this.inRace = true;
    this.screenCleanup?.();
    this.screenCleanup = null;
    this.ui.replaceChildren();
    this.app.clearWidgets();
    this.backFn = null;
    this.app.startSession(s);
    this.showTouch(true);
  }

  // ---------------- pause
  private togglePause() {
    const s = this.app.session;
    if (!s || !this.inRace) return;
    if (s.setup.net) { this.confirmQuitOnline(); return; }
    s.paused = !s.paused;
    if (s.paused) {
      audio.playSfx('menuBack');
      this.show(h('div', { class: 'screen dim' },
        h('h2', {}, 'PAUSE'),
        h('div', { class: 'menu panel' },
          btn('CONTINUE', () => this.togglePause(), 'primary'),
          btn('RETRY', () => { this.app.endSession(); if (this.lastSetup) this.launch({ ...this.lastSetup, seed: Math.floor(Math.random() * 1e9) }); }),
          btn('QUIT', () => { this.app.endSession(); this.inRace = false; this.showTouch(false); this.main(); }),
        ),
        h('div', { class: 'keys panel' }, ...controlsHelp(s.setup.mode === 'versus')),
      ), () => this.togglePause());
    } else {
      this.ui.replaceChildren();
      this.app.clearWidgets();
      this.backFn = null;
    }
  }

  private confirmQuitOnline() {
    const s = this.app.session;
    if (!s) return;
    if (this.ui.querySelector('.quitbox')) { this.ui.replaceChildren(); this.app.clearWidgets(); this.backFn = null; return; }
    this.show(h('div', { class: 'screen clear quitbox' },
      h('div', { class: 'panel menu' },
        h('div', {}, 'LEAVE ONLINE RACE?'),
        btn('KEEP RACING', () => { this.ui.replaceChildren(); this.app.clearWidgets(); this.backFn = null; }, 'primary'),
        btn('LEAVE', () => { this.app.endSession(); this.inRace = false; this.showTouch(false); this.leaveRoom(); this.main(); }),
      ),
    ), () => { this.ui.replaceChildren(); this.backFn = null; });
  }

  // ---------------- results
  private results(setup: SessionSetup, st: Standing[]) {
    this.inRace = false;
    this.showTouch(false);
    const gp = this.gp;
    const mode = setup.mode;
    const pts = [9, 6, 3, 1];
    if (gp && mode === 'gp') st.forEach((s) => { gp.points[s.id] = (gp.points[s.id] ?? 0) + (pts[s.place - 1] ?? 0); });
    audio.playMusic('results');

    const mine = (s: Standing) => s.control === 'local';
    let newBest = false;
    if (mode === 'timetrial' && st[0]?.finished) newBest = saveBest(setup.track.id, st[0].time);

    const rows = st.map((s) => h('tr', { class: mine(s) ? 'me' : '' },
      h('td', { class: 'pos' }, ordinal(s.place).toUpperCase()),
      h('td', {}, this.portraitCanvas(s.char, () => s.place === 1, 'res_' + s.id)),
      h('td', {}, s.name.toUpperCase()),
      h('td', {}, s.finished ? formatTime(s.time) : '--'),
      gp && mode === 'gp' ? h('td', { style: 'color:var(--gold)' }, `+${pts[s.place - 1] ?? 0}`) : null,
    ));

    const actions: HTMLElement[] = [];
    if (mode === 'online') {
      actions.push(btn('BACK TO LOBBY', () => { this.app.endSession(); this.room?.endRace(); this.lobby(); }, 'primary'));
    } else if (gp && mode === 'gp') {
      const last = gp.race >= CUPS[gp.cup].tracks.length - 1;
      actions.push(btn(last ? 'AWARDS' : 'NEXT RACE', () => { this.app.endSession(); if (last) this.gpAwards(); else { gp.race++; this.gpStandings(); } }, 'primary'));
      actions.push(btn('QUIT', () => { this.app.endSession(); this.main(); }));
    } else {
      actions.push(btn('RETRY', () => { this.app.endSession(); this.launch({ ...setup, seed: Math.floor(Math.random() * 1e9) }); }, 'primary'));
      actions.push(btn('CHANGE COURSE', () => { this.app.endSession(); this.pickTrack(mode); }));
      actions.push(btn('MENU', () => { this.app.endSession(); this.main(); }));
    }
    this.show(h('div', { class: 'screen' },
      h('h2', {}, mode === 'timetrial' ? (newBest ? 'NEW RECORD!' : 'TIME TRIAL') : 'RESULTS'),
      h('div', { class: 'sub' }, setup.track.name.toUpperCase()),
      h('div', { class: 'panel scroll', style: 'width:90%' }, h('table', { class: 'results' }, ...rows)),
      h('div', { class: 'row' }, ...actions),
    ));
  }

  private gpStandings() {
    const gp = this.gp!;
    const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
    const next = trackById(CUPS[gp.cup].tracks[gp.race]);
    this.show(h('div', { class: 'screen' },
      h('h2', {}, CUPS[gp.cup].name.toUpperCase()),
      h('div', { class: 'sub' }, `DRIVER POINTS · NEXT: ${next.name.toUpperCase()}`),
      h('div', { class: 'panel scroll', style: 'width:90%' }, h('table', { class: 'results' }, ...order.map((p, i) => h('tr', { class: p.control === 'local' ? 'me' : '' },
        h('td', { class: 'pos' }, String(i + 1)), h('td', {}, this.portraitCanvas(p.char, () => false, 'gps_' + p.id)), h('td', {}, p.name.toUpperCase()), h('td', { style: 'color:var(--gold)' }, `${gp.points[p.id]} PTS`))))),
      h('div', { class: 'row' }, btn('RACE!', () => this.gpNext(), 'primary')),
    ));
  }

  private gpAwards() {
    const gp = this.gp!;
    const order = [...gp.players].sort((a, b) => gp.points[b.id] - gp.points[a.id]);
    const myRank = order.findIndex((p) => p.control === 'local') + 1;
    const trophy = h('canvas', { class: 'trophy' });
    audio.playMusic('results');
    audio.playSfx(myRank <= 3 ? 'finishWin' : 'finishLose');
    this.show(h('div', { class: 'screen' },
      h('h2', {}, myRank <= 3 ? 'CONGRATULATIONS!' : 'BETTER LUCK NEXT TIME'),
      h('div', { class: 'sub' }, `${CUPS[gp.cup].name.toUpperCase()} · ${DIFFICULTY[gp.difficulty].cc} · YOU FINISHED ${ordinal(myRank).toUpperCase()}`),
      myRank <= 3 ? trophy : null,
      h('div', { class: 'row' }, ...order.slice(0, 3).map((p, i) => h('div', { class: 'panel', style: 'display:flex;flex-direction:column;align-items:center;gap:.4em' },
        h('div', { style: 'width:4em;height:4em' }, Object.assign(this.portraitCanvas(p.char, () => true, 'pod_' + p.id), { style: 'width:100%;height:100%' })),
        `${ordinal(i + 1).toUpperCase()} ${p.name.toUpperCase()}`, h('span', { style: 'color:var(--gold)' }, `${gp.points[p.id]} PTS`)))),
      h('div', { class: 'row' }, btn('MENU', () => this.main(), 'primary')),
    ));
    if (myRank <= 3) this.app.addWidget(trophy, (d, w, hh, t) => {
      if (!this.app.assets.draw(d, 'trophy', 'Trophy', w / 2, hh / 2, w, { anchorY: 0.5, inputs: { rank: myRank } })) {
        drawItemFallback(d, 'star', w / 2, hh / 2, w * 0.6, t);
      }
    });
  }

  // ---------------- options
  options() {
    const vols = audio.getVolumes?.() ?? { master: 0.8, music: 0.7, sfx: 0.9 };
    const slider = (label: string, v: number, set: (x: number) => void) => h('label', { style: 'display:flex;flex-direction:column;gap:.5em;width:100%' }, label,
      h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v), oninput: (e: Event) => set(Number((e.target as HTMLInputElement).value)) }));
    const v = vols as unknown as Record<string, number>;
    this.show(h('div', { class: 'screen' },
      h('h2', {}, 'OPTIONS'),
      h('div', { class: 'panel menu' },
        h('label', { style: 'display:flex;flex-direction:column;gap:.5em' }, 'NAME',
          h('input', { type: 'text', maxLength: 10, value: profile.name, oninput: (e: Event) => { profile.name = (e.target as HTMLInputElement).value.toUpperCase().slice(0, 10) || 'PLAYER'; saveProfile(); } })),
        slider('MASTER VOLUME', v.master ?? 0.8, (x) => audio.setMasterVolume(x)),
        slider('MUSIC', v.music ?? 0.7, (x) => audio.setMusicVolume(x)),
        slider('SOUND FX', v.sfx ?? 0.9, (x) => audio.setSfxVolume(x)),
        btn(audio.isMuted() ? 'SOUND: OFF' : 'SOUND: ON', () => { audio.setMuted(!audio.isMuted()); this.options(); }),
      ),
      h('div', { class: 'panel keys' }, ...controlsHelp(false)),
      btn('BACK', () => this.main()),
    ), () => this.main());
  }

  // ---------------- online
  private online() {
    if (!firebaseConfigured()) {
      this.show(h('div', { class: 'screen' },
        h('h2', {}, 'ONLINE'),
        h('div', { class: 'panel note', style: 'text-align:left' },
          'ONLINE MULTIPLAYER USES FIREBASE REALTIME DATABASE.', h('br'), h('br'),
          '1. CREATE A FIREBASE PROJECT', h('br'),
          '2. ENABLE REALTIME DATABASE + ANONYMOUS AUTH', h('br'),
          '3. COPY .ENV.EXAMPLE TO .ENV.LOCAL AND FILL IN THE KEYS', h('br'),
          '4. DEPLOY DATABASE.RULES.JSON', h('br'), h('br'),
          'UNTIL THEN, ENJOY VS BOTS AND 2P SPLIT SCREEN!'),
        btn('BACK', () => this.main(), 'primary'),
      ), () => this.main());
      return;
    }
    const nameIn = h('input', { type: 'text', maxLength: 10, value: profile.name, placeholder: 'NAME' });
    const codeIn = h('input', { type: 'text', maxLength: 4, placeholder: 'CODE' });
    const err = h('div', { class: 'err' });
    let busy = false;
    const doIt = async (fn: () => Promise<Room>) => {
      if (busy) return;
      busy = true;
      err.textContent = 'CONNECTING…';
      profile.name = (nameIn.value || 'PLAYER').toUpperCase().slice(0, 10);
      saveProfile();
      try {
        this.room = await fn();
        this.lobby();
      } catch (e) {
        err.textContent = String((e as Error).message || e).toUpperCase();
      } finally { busy = false; }
    };
    this.show(h('div', { class: 'screen' },
      h('h2', {}, 'ONLINE MULTIPLAYER'),
      h('div', { class: 'panel menu' },
        h('div', { class: 'label' }, 'YOUR NAME'), nameIn,
        btn('CREATE ROOM', () => doIt(() => Room.create(profile.name, profile.char, { track: 'circuit', difficulty: profile.difficulty, laps: 3, bots: true, items: true })), 'primary'),
        h('div', { class: 'label', style: 'margin-top:.6em' }, 'OR JOIN WITH A CODE'), codeIn,
        btn('JOIN ROOM', () => doIt(() => Room.join(codeIn.value, profile.name, profile.char))),
        err,
      ),
    ), () => this.main());
  }

  private lobby() {
    const room = this.room;
    if (!room) return this.main();
    audio.playMusic('menu');
    this.inRace = false;
    this.roomUnsub?.();
    const root = h('div', { class: 'screen' });
    let lastSig = '';
    let seen = false;
    const render = (d: RoomData | null) => {
      if (!d) { if (seen) { this.toast('ROOM CLOSED'); this.leaveRoom(); this.main(); } return; }
      seen = true;
      if (d.status === 'racing' && d.race && !this.inRace && this.app.session === null && room.serverNow() < d.race.startAt + 1500) {
        this.startOnline();
        return;
      }
      if (this.inRace) return;
      const sig = JSON.stringify([d.players, d.settings, d.host, d.status]);
      if (sig === lastSig) return;
      lastSig = sig;
      const me = d.players?.[room.uid];
      const host = room.isHost;
      const players = room.players;
      const taken = new Set(players.filter(([id]) => id !== room.uid).map(([, p]) => p.char));
      const s = d.settings;
      const set = (patch: Partial<typeof s>) => room.setSettings(patch);
      this.app.clearWidgets();
      root.replaceChildren(
        h('h2', {}, 'ROOM'),
        h('div', { class: 'code' }, room.code),
        h('div', { class: 'sub' }, 'SHARE THIS CODE WITH FRIENDS'),
        h('div', { class: 'panel players' }, ...players.map(([id, p]) => h('div', { class: 'player' },
          this.portraitCanvas(p.char, () => id === room.uid, 'lob_' + id),
          h('span', {}, `${p.name}${id === d.host ? ' ★' : ''}${id === room.uid ? ' (YOU)' : ''}`),
          h('span', { class: 'tag' + (p.ready || id === d.host ? '' : ' wait') }, id === d.host ? 'HOST' : p.ready ? 'READY' : 'WAITING'),
        )), h('div', { class: 'sub', style: 'font-size:.8em' }, `${players.length}/${MAX_PLAYERS} RACERS${s.bots ? ' · BOTS FILL EMPTY SLOTS' : ''}`)),
        h('div', { class: 'label' }, 'YOUR DRIVER'),
        h('div', { class: 'row' }, ...CHARACTERS.map((c) => {
          const b = h('button', { class: 'char' + (me?.char === c.id ? ' sel' : '') + (taken.has(c.id) ? ' taken' : ''), style: 'width:3.6em;padding:.2em', disabled: taken.has(c.id),
            onclick: () => { audio.playSfx('menuMove'); profile.char = c.id; saveProfile(); room.setMe({ char: c.id }); } }, this.portraitCanvas(c.id, () => me?.char === c.id, 'lobc_' + c.id));
          return b;
        })),
        h('div', { class: 'panel', style: 'display:flex;flex-direction:column;gap:.6em;width:92%' },
          h('div', { class: 'row' }, h('span', { class: 'label' }, 'COURSE'), host
            ? this.seg(TRACKS.map((t) => t.id), s.track, (v) => set({ track: v }), (v) => trackById(v).name.split(' ')[0].toUpperCase())
            : h('span', {}, trackById(s.track).name.toUpperCase())),
          h('div', { class: 'row' }, h('span', { class: 'label' }, 'BOTS'), host
            ? this.seg<Difficulty>(['easy', 'medium', 'hard'], s.difficulty, (v) => set({ difficulty: v }), (v) => DIFFICULTY[v].label.toUpperCase())
            : h('span', {}, DIFFICULTY[s.difficulty].label.toUpperCase()),
            host ? this.seg([true, false], s.bots, (v) => set({ bots: v }), (v) => (v ? 'ON' : 'OFF')) : h('span', {}, s.bots ? 'ON' : 'OFF')),
          h('div', { class: 'row' }, h('span', { class: 'label' }, 'LAPS'), host ? this.seg([3, 5], s.laps, (v) => set({ laps: v })) : h('span', {}, String(s.laps)),
            h('span', { class: 'label' }, 'ITEMS'), host ? this.seg([true, false], s.items, (v) => set({ items: v }), (v) => (v ? 'ON' : 'OFF')) : h('span', {}, s.items ? 'ON' : 'OFF')),
        ),
        h('div', { class: 'row' },
          host
            ? btn('START RACE!', () => { room.startRace().catch((e) => this.toast(String(e.message || e))); }, 'primary')
            : btn(me?.ready ? 'NOT READY' : 'READY!', () => room.setMe({ ready: !me?.ready }), 'primary'),
          btn('LEAVE', () => { this.leaveRoom(); this.main(); }),
        ),
      );
    };
    this.show(root, () => { this.leaveRoom(); this.main(); });
    this.roomUnsub = room.onChange(render);
  }

  private startOnline() {
    const room = this.room!;
    const d = room.data!;
    const race = d.race!;
    const setup: SessionSetup = {
      mode: 'online', track: trackById(d.settings.track), laps: d.settings.laps, difficulty: d.settings.difficulty, items: d.settings.items,
      players: room.playerSetups(), seed: race.seed, net: room.hooks(),
    };
    this.lastSetup = setup;
    const s = new RaceSession(setup);
    s.onFinish = (st) => { room.stopRaceChannels(); this.results(setup, st); };
    this.inRace = true;
    this.screenCleanup?.();
    this.screenCleanup = null;
    this.ui.replaceChildren();
    this.app.clearWidgets();
    this.backFn = null;
    this.app.startSession(s);
    this.showTouch(true);
  }

  private leaveRoom() {
    this.roomUnsub?.();
    this.roomUnsub = null;
    if (this.room) { const r = this.room; this.room = null; r.leave(); }
  }

  private toast(msg: string) {
    const t = h('div', { class: 'toast' }, msg.toUpperCase());
    document.getElementById('stage')!.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------------- touch
  private setupTouch() {
    const el = document.getElementById('touch')!;
    el.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach((b) => {
      const k = b.dataset.k as keyof typeof touch;
      const on = (v: boolean) => (e: Event) => { e.preventDefault(); (touch as Record<string, unknown>)[k] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', on(true));
      b.addEventListener('pointerup', on(false));
      b.addEventListener('pointercancel', on(false));
      b.addEventListener('pointerleave', on(false));
    });
    document.getElementById('tpause')!.addEventListener('click', () => this.togglePause());
  }
  private showTouch(v: boolean) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    document.getElementById('touch')!.hidden = !(v && coarse);
  }
}

function controlsHelp(split: boolean): HTMLElement[] {
  const line = (k: string, v: string) => h('div', {}, h('b', {}, k), ' ', v);
  if (split) return [
    line('P1', 'W/S GAS/BRAKE · A/D STEER · F HOP · G ITEM'),
    line('P2', '↑/↓ GAS/BRAKE · ←/→ STEER · . HOP · / ITEM'),
    line('ESC', 'PAUSE'),
  ];
  return [
    line('↑ / W', 'ACCELERATE'),
    line('↓ / S', 'BRAKE · HOLD TO THROW ITEMS BACK'),
    line('← → / A D', 'STEER'),
    line('SPACE / SHIFT', 'HOP · HOLD + STEER TO DRIFT'),
    line('E / CTRL', 'USE ITEM'),
    line('ESC / P', 'PAUSE · GAMEPADS SUPPORTED'),
  ];
}

// ------------------------------------------------------------------ course thumbnails (top-down course map drawn with Rive paths)
const thumbTracks = new Map<string, Track>();
function thumbTrack(def: TrackDef): Track {
  let t = thumbTracks.get(def.id);
  if (!t) { t = new Track(def); thumbTracks.set(def.id, t); }
  return t;
}

function drawTrackThumb(d: Draw, tr: Track, w: number, hh: number, t: number) {
  const th = tr.def.theme;
  d.roundRect(0, 0, w, hh, Math.min(w, hh) * 0.08, argb(th.ground));
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < tr.n; i++) { minX = Math.min(minX, tr.x[i]); maxX = Math.max(maxX, tr.x[i]); minY = Math.min(minY, tr.y[i]); maxY = Math.max(maxY, tr.y[i]); }
  const s = Math.min((w * 0.84) / (maxX - minX), (hh * 0.84) / (maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * s, oy = hh / 2 - ((minY + maxY) / 2) * s;
  const pts: number[] = [];
  for (let i = 0; i <= tr.n; i += 2) { const j = i % tr.n; pts.push(ox + tr.x[j] * s, oy + tr.y[j] * s); }
  if (th.edge !== 'fall' || th.offroadWidth > 0) d.polyline(pts, argb(th.band), (tr.halfW + 30) * 2 * s, true);
  d.polyline(pts, argb(th.curbColors[1] ?? '#e02020'), tr.halfW * 2 * s + 4, true);
  const roadCol = tr.def.id === 'rainbow' ? RAINBOW_COLORS[Math.floor(t * 4) % RAINBOW_COLORS.length] : tr.def.id === 'circuit' ? '#4a4c55' : th.road;
  d.polyline(pts, argb(roadCol), tr.halfW * 2 * s, true);
  const a = tr.pointAt(0, -tr.halfW), b = tr.pointAt(0, tr.halfW);
  d.line(ox + a.x * s, oy + a.y * s, ox + b.x * s, oy + b.y * s, argb('#ffffff'), 3);
  const i = Math.floor((t * 50) % tr.n);
  d.circle(ox + tr.x[i] * s, oy + tr.y[i] * s, 4, argb('#ffd23f'), argb('#141a40'), 1.5);
}
