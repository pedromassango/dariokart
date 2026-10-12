import type { CharacterDef } from './characters';
import type { Surface } from './track';

export type ItemType = 'mushroom' | 'banana' | 'greenShell' | 'redShell' | 'star' | 'lightning' | 'feather' | 'coin';
export const ITEM_TYPES: ItemType[] = ['mushroom', 'banana', 'greenShell', 'redShell', 'star', 'lightning', 'feather', 'coin'];

export type Control = 'local' | 'bot' | 'remote';

export interface KartInput {
  steer: number; // -1..1
  accel: boolean;
  brake: boolean;
  hop: boolean; // held
  item: boolean; // pressed this frame
  back: boolean; // throw backwards modifier (down held)
}

export const emptyInput = (): KartInput => ({ steer: 0, accel: false, brake: false, hop: false, item: false, back: false });

export class Kart {
  id: string;
  name: string;
  char: CharacterDef;
  control: Control;
  /** which local player (0/1) controls this kart (split screen), -1 otherwise */
  localIndex = -1;

  x = 0; y = 0; z = 0; vz = 0;
  heading = 0;
  vx = 0; vy = 0;
  /** forward speed (signed) */
  speed = 0;
  steerVis = 0; // smoothed steer for visuals
  spinAngle = 0; // visual spin (hit)

  drift = 0; // -1 left, 1 right, 0 none
  driftCharge = 0;
  hopping = false;
  boostTimer = 0;
  boostPower = 1;
  starTimer = 0;
  shrinkTimer = 0;
  spinTimer = 0;
  squishTimer = 0;
  fallTimer = 0;
  invulnTimer = 0;
  featherJump = false;
  bumpCooldown = 0;

  coins = 0;
  item: ItemType | null = null;
  rouletteTimer = 0;
  pendingItem: ItemType | null = null;

  // progress
  idx = 0;
  /** unwrapped sample index (monotonic over laps) */
  uidx = 0;
  raceDist = 0;
  lap = 0; // completed laps
  maxLapStarted = 1;
  lapStartTime = 0;
  lapTimes: number[] = [];
  finished = false;
  finishTime = 0;
  place = 1;
  wrongWayTimer = 0;
  lastSafeIdx = 0;
  surface: Surface = 'road';
  onDash = false;

  input: KartInput = emptyInput();
  prevHop = false;

  // bot brain state
  ai: { laneOffset: number; laneTimer: number; itemDelay: number; mistakeTimer: number; stuckTimer: number; reverseTimer: number } = {
    laneOffset: 0, laneTimer: 0, itemDelay: 0, mistakeTimer: 0, stuckTimer: 0, reverseTimer: 0,
  };

  // network interpolation buffer for remote karts
  netBuf: { t: number; x: number; y: number; z: number; h: number; s: number; st: number; sp: number }[] = [];

  constructor(id: string, name: string, char: CharacterDef, control: Control) {
    this.id = id;
    this.name = name;
    this.char = char;
    this.control = control;
  }

  get stunned() {
    return this.spinTimer > 0 || this.squishTimer > 0 || this.fallTimer > 0;
  }
  get invincible() {
    return this.starTimer > 0;
  }
  get scale() {
    return this.shrinkTimer > 0 ? 0.55 : 1;
  }
  get radius() {
    return 6 * this.scale;
  }
  get dirX() { return Math.cos(this.heading); }
  get dirY() { return Math.sin(this.heading); }
}
