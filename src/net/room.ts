import {
  ref, set, update, get, push, remove, onValue, onChildAdded, onChildChanged, onDisconnect,
  serverTimestamp, runTransaction, off, type Database, type DatabaseReference, type Unsubscribe,
} from 'firebase/database';
import { connect } from './firebase';
import type { Difficulty } from '../game/race';
import type { CharacterId } from '../game/characters';
import type { NetOut } from '../game/race';
import type { NetHooks, RemoteState, PlayerSetup } from '../game/session';
import { CHARACTERS } from '../game/characters';

export const MAX_PLAYERS = 8;

export interface RoomPlayer { name: string; char: CharacterId; ready: boolean; joined: number }
export interface RoomSettings { track: string; difficulty: Difficulty; laps: number; bots: boolean; items: boolean }
export interface GridEntry { id: string; name: string; char: CharacterId; bot: boolean }
export interface RoomRace { seed: number; startAt: number; grid: GridEntry[]; n: number }
export interface RoomData {
  host: string;
  status: 'lobby' | 'racing';
  settings: RoomSettings;
  players?: Record<string, RoomPlayer>;
  race?: RoomRace;
  createdAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/** A multiplayer room backed by the Firebase Realtime Database. */
export class Room {
  readonly code: string;
  readonly uid: string;
  private db: Database;
  private roomRef: DatabaseReference;
  data: RoomData | null = null;
  private unsubs: Unsubscribe[] = [];
  private listeners = new Set<(d: RoomData | null) => void>();
  private offset = 0;
  // race channels
  private remoteStates: Record<string, RemoteState>[] = [];
  private events: NetOut[] = [];
  private raceUnsubs: Unsubscribe[] = [];
  private raceN = -1;

  private constructor(db: Database, uid: string, code: string) {
    this.db = db; this.uid = uid; this.code = code;
    this.roomRef = ref(db, `rooms/${code}`);
  }

  static async create(name: string, char: CharacterId, settings: RoomSettings): Promise<Room> {
    const { db, uid } = await connect();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = makeCode();
      const r = ref(db, `rooms/${code}`);
      const res = await runTransaction(r, (cur) => {
        if (cur) return; // taken (abort)
        return { host: uid, status: 'lobby', settings, createdAt: Date.now(), players: { [uid]: { name, char, ready: true, joined: Date.now() } } };
      });
      if (res.committed) {
        const room = new Room(db, uid, code);
        await room.attach();
        return room;
      }
    }
    throw new Error('Could not allocate a room code, try again.');
  }

  static async join(code: string, name: string, char: CharacterId): Promise<Room> {
    const { db, uid } = await connect();
    code = code.trim().toUpperCase();
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) throw new Error(`Room ${code} not found.`);
    const data = snap.val() as RoomData;
    const players = data.players ?? {};
    if (!players[uid]) {
      if (data.status !== 'lobby') throw new Error('That race already started. Wait for it to finish.');
      if (Object.keys(players).length >= MAX_PLAYERS) throw new Error('Room is full (8 racers).');
      // avoid duplicate characters
      const taken = new Set(Object.values(players).map((p) => p.char));
      if (taken.has(char)) char = CHARACTERS.find((c) => !taken.has(c.id))?.id ?? char;
    }
    await set(ref(db, `rooms/${code}/players/${uid}`), { name, char, ready: false, joined: Date.now() });
    const room = new Room(db, uid, code);
    await room.attach();
    return room;
  }

  private async attach() {
    const first = await get(this.roomRef);
    this.data = first.exists() ? (first.val() as RoomData) : null;
    onDisconnect(ref(this.db, `rooms/${this.code}/players/${this.uid}`)).remove();
    onDisconnect(ref(this.db, `rooms/${this.code}/states/${this.uid}`)).remove();
    this.unsubs.push(onValue(ref(this.db, '.info/serverTimeOffset'), (s) => { this.offset = (s.val() as number) || 0; }));
    this.unsubs.push(onValue(this.roomRef, (s) => {
      this.data = s.exists() ? (s.val() as RoomData) : null;
      this.maybeMigrateHost();
      for (const l of this.listeners) l(this.data);
    }));
  }

  onChange(fn: (d: RoomData | null) => void): () => void {
    this.listeners.add(fn);
    fn(this.data);
    return () => this.listeners.delete(fn);
  }

  get isHost() { return this.data?.host === this.uid; }
  get players(): [string, RoomPlayer][] {
    return Object.entries(this.data?.players ?? {}).sort((a, b) => a[1].joined - b[1].joined);
  }
  serverNow() { return Date.now() + this.offset; }

  private maybeMigrateHost() {
    const d = this.data;
    if (!d) return;
    const players = d.players ?? {};
    if (players[d.host]) return;
    const first = this.players[0];
    if (first && first[0] === this.uid) {
      runTransaction(ref(this.db, `rooms/${this.code}/host`), (cur) => (cur && players[cur] ? cur : this.uid));
      if (d.status === 'racing') update(this.roomRef, { status: 'lobby' });
    }
  }

  async setMe(p: Partial<RoomPlayer>) {
    await update(ref(this.db, `rooms/${this.code}/players/${this.uid}`), p);
  }
  async setSettings(s: Partial<RoomSettings>) {
    if (!this.isHost) return;
    await update(ref(this.db, `rooms/${this.code}/settings`), s);
  }

  /** Host: build the grid and start the race a few seconds in the future. */
  async startRace(): Promise<void> {
    if (!this.isHost || !this.data) return;
    const d = this.data;
    const humans = this.players.map(([id, p]) => ({ id, name: p.name, char: p.char, bot: false }));
    const grid: GridEntry[] = [...humans];
    if (d.settings.bots) {
      const used = new Set(grid.map((g) => g.char));
      for (const c of CHARACTERS) {
        if (grid.length >= MAX_PLAYERS) break;
        if (used.has(c.id)) continue;
        grid.push({ id: 'bot_' + c.id, name: c.name, char: c.id, bot: true });
      }
    }
    // humans at the back of the grid like SMK? put bots in front for drama, shuffle humans
    const ordered = [...grid.filter((g) => g.bot), ...shuffle(grid.filter((g) => !g.bot))];
    const race: RoomRace = { seed: Math.floor(Math.random() * 1e9), startAt: this.serverNow() + 3500, grid: ordered, n: (d.race?.n ?? 0) + 1 };
    await remove(ref(this.db, `rooms/${this.code}/events`));
    await remove(ref(this.db, `rooms/${this.code}/states`));
    await update(this.roomRef, { race, status: 'racing' });
  }

  async endRace() {
    if (this.isHost) await update(this.roomRef, { status: 'lobby' });
  }

  /** Player setup for a race session from the room's race data. */
  playerSetups(): PlayerSetup[] {
    const race = this.data!.race!;
    return race.grid.map((g) => ({
      id: g.id, name: g.name, char: g.char,
      control: g.id === this.uid ? 'local' : g.bot ? (this.isHost ? 'bot' : 'remote') : 'remote',
      localIndex: g.id === this.uid ? 0 : -1,
    }));
  }

  /** Network hooks consumed by RaceSession. */
  hooks(): NetHooks {
    this.stopRaceChannels();
    this.remoteStates = [];
    this.events = [];
    const race = this.data!.race!;
    this.raceN = race.n;
    const statesRef = ref(this.db, `rooms/${this.code}/states`);
    const onState = (s: { key: string | null; val: () => unknown }) => {
      if (s.key === this.uid) return;
      this.remoteStates.push(s.val() as Record<string, RemoteState>);
    };
    this.raceUnsubs.push(onChildAdded(statesRef, onState));
    this.raceUnsubs.push(onChildChanged(statesRef, onState));
    const evRef = ref(this.db, `rooms/${this.code}/events`);
    this.raceUnsubs.push(onChildAdded(evRef, (s) => {
      const v = s.val() as { from: string; ev: NetOut; n: number };
      if (!v || v.from === this.uid || v.n !== this.raceN) return;
      this.events.push(v.ev);
    }));
    const myState = ref(this.db, `rooms/${this.code}/states/${this.uid}`);
    return {
      isHost: this.isHost,
      localPeerId: this.uid.slice(0, 6),
      startAt: race.startAt,
      serverTimeOffset: () => this.offset,
      sendStates: (states) => { set(myState, states).catch(() => {}); },
      sendEvents: (evs) => { for (const ev of evs) push(evRef, { from: this.uid, ev: JSON.parse(JSON.stringify(ev)), n: this.raceN }).catch(() => {}); },
      takeRemoteStates: () => this.remoteStates.splice(0),
      takeEvents: () => this.events.splice(0),
    };
  }

  stopRaceChannels() {
    for (const u of this.raceUnsubs) u();
    this.raceUnsubs = [];
  }

  async leave() {
    this.stopRaceChannels();
    for (const u of this.unsubs) u();
    this.unsubs = [];
    off(this.roomRef);
    try {
      await remove(ref(this.db, `rooms/${this.code}/players/${this.uid}`));
      await remove(ref(this.db, `rooms/${this.code}/states/${this.uid}`));
      // last one out deletes the room
      const snap = await get(ref(this.db, `rooms/${this.code}/players`));
      if (!snap.exists()) await remove(this.roomRef);
    } catch { /* ignore */ }
    this.listeners.clear();
  }
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export { serverTimestamp };
