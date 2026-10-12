import type { KartInput } from './kart';

interface Binding { left: string[]; right: string[]; accel: string[]; brake: string[]; hop: string[]; item: string[] }

const SOLO: Binding = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  accel: ['ArrowUp', 'KeyW', 'KeyX'],
  brake: ['ArrowDown', 'KeyS', 'KeyZ'],
  hop: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyC'],
  item: ['KeyE', 'ControlLeft', 'ControlRight', 'KeyV', 'Enter'],
};
const SPLIT: Binding[] = [
  { left: ['KeyA'], right: ['KeyD'], accel: ['KeyW'], brake: ['KeyS'], hop: ['KeyF', 'ShiftLeft'], item: ['KeyG', 'KeyQ'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], accel: ['ArrowUp'], brake: ['ArrowDown'], hop: ['Period', 'ShiftRight', 'KeyL'], item: ['Slash', 'Enter', 'KeyK'] },
];

/** Virtual touch state written by the on-screen controls. */
export const touch = { left: false, right: false, accel: false, brake: false, hop: false, item: false, steer: 0 };

class Input {
  private keys = new Set<string>();
  private prevItem = [false, false];
  private onPause: (() => void) | null = null;
  split = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) this.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setPauseHandler(fn: (() => void) | null) { this.onPause = fn; }

  private any(codes: string[]) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Read input for local player `p` (0 or 1). */
  read(p: number): KartInput {
    const b = this.split ? SPLIT[p] : SOLO;
    let steer = 0, accel = false, brake = false, hop = false, item = false;
    if (this.any(b.left)) steer -= 1;
    if (this.any(b.right)) steer += 1;
    accel = this.any(b.accel);
    brake = this.any(b.brake);
    hop = this.any(b.hop);
    item = this.any(b.item);

    // gamepad: P1 uses first pad (or pad p in split)
    const pads = navigator.getGamepads?.() ?? [];
    const connected = Array.from(pads).filter((g): g is Gamepad => !!g);
    const pad = this.split ? connected[p] : connected[0];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.2) steer = Math.max(-1, Math.min(1, ax * 1.2));
      if (pad.buttons[14]?.pressed) steer = -1;
      if (pad.buttons[15]?.pressed) steer = 1;
      accel ||= !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed);
      brake ||= !!pad.buttons[2]?.pressed;
      hop ||= !!(pad.buttons[5]?.pressed || pad.buttons[6]?.pressed);
      item ||= !!(pad.buttons[1]?.pressed || pad.buttons[4]?.pressed || pad.buttons[3]?.pressed);
    }
    if (p === 0) {
      if (touch.steer !== 0) steer = touch.steer;
      else { if (touch.left) steer = -1; if (touch.right) steer = 1; }
      accel ||= touch.accel; brake ||= touch.brake; hop ||= touch.hop; item ||= touch.item;
    }
    const pressed = item && !this.prevItem[p];
    this.prevItem[p] = item;
    const back = brake || this.any(this.split ? [] : ['ArrowDown', 'KeyS']);
    return { steer, accel, brake: brake && !accel, hop, item: pressed, back };
  }

  anyPressed(): boolean {
    return this.keys.size > 0;
  }
}

export const input = new Input();
