import type { Draw } from '../rive/draw';
import { argb } from '../rive/draw';
import type { RiveAssets } from '../rive/assets';
import { riveText, riveTextWidth } from '../rive/riveText';
import { audio } from '../audio/audio';

/**
 * A tiny immediate-mode UI toolkit drawn entirely with Rive (paths + the Rive glyph font + artboards).
 * Screens call ui.button / ui.card / ... every frame; input (keyboard, mouse, touch, gamepad) is
 * resolved against the previous frame's widget rectangles.
 */
interface Item {
  key: string;
  x: number; y: number; w: number; h: number;
  focusable: boolean;
  onActivate?: () => void;
  onAdjust?: (dir: number) => void;
}

type Ev = { t: 'key'; code: string } | { t: 'move'; x: number; y: number } | { t: 'down'; x: number; y: number } | { t: 'wheel'; dy: number };

export const COL = {
  ink: argb('#141a40'),
  white: argb('#ffffff'),
  panel: argb('#ffffff', 0.93),
  panel2: argb('#dfe8ff', 0.93),
  blueA: argb('#4f8dff'), blueB: argb('#1f4fd0'), blueShadow: argb('#12307c'),
  redA: argb('#ff5a4a'), redB: argb('#d81e1e'), redShadow: argb('#7a1010'),
  goldA: argb('#ffe066'), goldB: argb('#ffae00'), goldShadow: argb('#b06a00'),
  dim: argb('#06102a', 0.62),
  text2: argb('#3a4a8a'),
};

export class RUI {
  d!: Draw;
  assets!: RiveAssets;
  w = 1; h = 1; t = 0; u = 1;
  private items: Item[] = [];
  private prev: Item[] = [];
  private events: Ev[] = [];
  focusKey: string | null = null;
  private hoverKey: string | null = null;
  private mouse = { x: -1, y: -1 };
  /** called on Escape / Backspace / gamepad B */
  onBack: (() => void) | null = null;
  enabled = true;
  private padPrev: boolean[] = [];
  private padRepeat = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT' && !['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape', 'Backspace', 'Tab', 'NumpadEnter'].includes(e.code)) {
        if (e.code !== 'Backspace' || (e.target as HTMLElement)?.tagName !== 'INPUT') e.preventDefault();
        this.events.push({ t: 'key', code: e.code });
      }
    });
    canvas.addEventListener('pointermove', (e) => { if (this.enabled) this.events.push({ t: 'move', x: e.offsetX, y: e.offsetY }); });
    canvas.addEventListener('pointerdown', (e) => { if (this.enabled) this.events.push({ t: 'down', x: e.offsetX, y: e.offsetY }); });
  }

  /** start a frame */
  begin(d: Draw, assets: RiveAssets, w: number, h: number, t: number) {
    this.d = d; this.assets = assets; this.w = w; this.h = h; this.t = t;
    this.u = Math.min(w / 1280, h / 760);
    this.pollGamepad();
    this.prev = this.items;
    this.items = [];
    this.handleEvents();
  }

  /** end a frame: keep focus valid */
  end() {
    const foc = this.items.filter((i) => i.focusable);
    if (foc.length && (!this.focusKey || !foc.some((i) => i.key === this.focusKey))) this.focusKey = foc[0].key;
  }

  reset() { this.focusKey = null; this.items = []; this.prev = []; this.events = []; }
  focus(key: string) { this.focusKey = key; }

  private handleEvents() {
    const evs = this.events.splice(0);
    for (const e of evs) {
      if (e.t === 'move') {
        this.mouse = { x: e.x, y: e.y };
        const hit = this.hit(e.x, e.y);
        if (hit && hit.focusable && hit.key !== this.focusKey) { this.focusKey = hit.key; }
        this.hoverKey = hit?.key ?? null;
      } else if (e.t === 'down') {
        const hit = this.hit(e.x, e.y);
        if (hit) {
          this.focusKey = hit.focusable ? hit.key : this.focusKey;
          if (hit.onActivate) { audio.playSfx('menuSelect'); hit.onActivate(); }
          else if (hit.onAdjust) { hit.onAdjust(e.x < hit.x + hit.w / 2 ? -1 : 1); }
        }
      } else if (e.t === 'key') {
        const cur = this.prev.find((i) => i.key === this.focusKey);
        switch (e.code) {
          case 'ArrowUp': this.nav(0, -1); break;
          case 'ArrowDown': case 'Tab': this.nav(0, 1); break;
          case 'ArrowLeft': if (cur?.onAdjust) cur.onAdjust(-1); else this.nav(-1, 0); break;
          case 'ArrowRight': if (cur?.onAdjust) cur.onAdjust(1); else this.nav(1, 0); break;
          case 'Enter': case 'NumpadEnter': case 'Space':
            if (cur?.onActivate) { audio.playSfx('menuSelect'); cur.onActivate(); }
            break;
          case 'Escape': case 'Backspace':
            if (this.onBack) { audio.playSfx('menuBack'); this.onBack(); }
            break;
        }
      }
    }
  }

  private hit(x: number, y: number): Item | null {
    for (let i = this.prev.length - 1; i >= 0; i--) {
      const it = this.prev[i];
      if (x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h && (it.onActivate || it.onAdjust)) return it;
    }
    return null;
  }

  /** spatial navigation: pick the nearest focusable widget in the pressed direction */
  private nav(dx: number, dy: number) {
    const foc = this.prev.filter((i) => i.focusable);
    if (!foc.length) return;
    const cur = foc.find((i) => i.key === this.focusKey);
    if (!cur) { this.focusKey = foc[0].key; return; }
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    let best: Item | null = null, bestScore = Infinity;
    for (const it of foc) {
      if (it === cur) continue;
      const ix = it.x + it.w / 2, iy = it.y + it.h / 2;
      const ddx = ix - cx, ddy = iy - cy;
      const along = ddx * dx + ddy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ddx * dy) + Math.abs(ddy * dx);
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (!best) {
      // wrap around in list order for vertical lists
      const idx = foc.indexOf(cur);
      if (dy !== 0) best = foc[(idx + (dy > 0 ? 1 : -1) + foc.length) % foc.length];
    }
    if (best) { this.focusKey = best.key; audio.playSfx('menuMove'); }
  }

  private pollGamepad() {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((g): g is Gamepad => !!g);
    if (!pad) return;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const now = [b(0), b(1), b(12) || (pad.axes[1] ?? 0) < -0.6, b(13) || (pad.axes[1] ?? 0) > 0.6, b(14) || (pad.axes[0] ?? 0) < -0.6, b(15) || (pad.axes[0] ?? 0) > 0.6];
    const codes = ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    this.padRepeat -= 1;
    now.forEach((v, i) => {
      if (v && (!this.padPrev[i] || (i >= 2 && this.padRepeat <= 0))) { this.events.push({ t: 'key', code: codes[i] }); if (i >= 2) this.padRepeat = 12; }
    });
    this.padPrev = now;
  }

  // ------------------------------------------------------------------ drawing helpers
  text(s: string, x: number, y: number, h: number, align = 0) {
    if (!riveText(this.d, this.assets, s, x, y, h, align)) this.d.text(s, x, y, Math.max(1, h / 8), COL.white, { align, outline: COL.ink });
  }
  textW(s: string, h: number) { return riveTextWidth(s, h); }

  /** small dark label text (Rive paths, pixel font) for secondary info */
  label(s: string, x: number, y: number, h: number, align = 0, color = COL.text2) {
    this.d.text(s.toUpperCase(), x, y, Math.max(1, h / 7), color, { align });
  }

  panel(x: number, y: number, w: number, h: number) {
    const d = this.d, r = Math.min(28 * this.u, h / 2);
    d.roundRect(x + 4 * this.u, y + 10 * this.u, w, h, r, argb('#000000', 0.25));
    d.roundRect(x, y, w, h, r, COL.panel);
    d.roundRect(x + 4, y + 4, w - 8, h * 0.45, r * 0.8, argb('#ffffff', 0.5));
  }

  backdrop() {
    this.d.gradientRect(0, 0, this.w, this.h, [[0, argb('#0b1f5a', 0.55)], [1, argb('#06102a', 0.78)]]);
  }

  // ------------------------------------------------------------------ widgets
  register(it: Item) { this.items.push(it); }
  isFocused(key: string) { return this.focusKey === key; }

  button(key: string, label: string, x: number, y: number, w: number, h: number, onClick: () => void, opts: { primary?: boolean; disabled?: boolean; small?: boolean } = {}) {
    const f = this.isFocused(key) && !opts.disabled;
    this.register({ key, x, y, w, h, focusable: !opts.disabled, onActivate: opts.disabled ? undefined : onClick });
    const d = this.d, r = h / 2;
    const lift = f ? -3 * this.u : 0;
    const [a, b, sh] = f ? [COL.redA, COL.redB, COL.redShadow] : opts.primary ? [COL.goldA, COL.goldB, COL.goldShadow] : [COL.blueA, COL.blueB, COL.blueShadow];
    const sc = f ? 1.04 : 1;
    const bw = w * sc, bh = h * sc, bx = x - (bw - w) / 2, by = y - (bh - h) / 2 + lift;
    d.roundRect(bx, by + 6 * this.u, bw, bh, r, argb('#000000', opts.disabled ? 0.1 : 0.28));
    d.roundRect(bx, by + 4 * this.u, bw, bh, r, sh);
    d.roundRect(bx, by, bw, bh, r, b, COL.white, 3 * this.u);
    d.roundRect(bx + 4 * this.u, by + 3 * this.u, bw - 8 * this.u, bh * 0.48, r * 0.8, a);
    if (opts.disabled) d.roundRect(bx, by, bw, bh, r, argb('#808090', 0.55));
    const th = Math.min(h * 0.5, 34 * this.u);
    this.text(label, x + w / 2, by + (bh - th) / 2 - th * 0.05, th, 0.5);
  }

  /** a selectable card that paints its own content (portraits, course maps, ...) */
  card(key: string, x: number, y: number, w: number, h: number, selected: boolean, paint: (x: number, y: number, w: number, h: number, focused: boolean) => void, onClick: () => void, onFocus?: () => void) {
    const f = this.isFocused(key);
    if (f && onFocus) onFocus();
    this.register({ key, x, y, w, h, focusable: true, onActivate: onClick });
    const d = this.d, r = 18 * this.u;
    const lift = f ? -4 * this.u : 0;
    d.roundRect(x, y + 6 * this.u, w, h, r, argb('#000000', 0.25));
    const fill = selected ? COL.goldB : argb('#ffffff', 0.92);
    d.roundRect(x, y + lift, w, h, r, fill, f ? COL.redB : selected ? COL.white : argb('#9ab4f0'), f ? 5 * this.u : 3 * this.u);
    paint(x + 8 * this.u, y + lift + 8 * this.u, w - 16 * this.u, h - 16 * this.u, f);
  }

  /** a row of exclusive options */
  seg<T>(key: string, x: number, y: number, h: number, options: T[], current: T, labelOf: (v: T) => string, set: (v: T) => void, itemW?: number): number {
    let cx = x;
    for (const o of options) {
      const lab = labelOf(o);
      const w = itemW ?? Math.max(h * 1.6, this.textW(lab, h * 0.5) + h * 0.9);
      const k = key + ':' + lab;
      const f = this.isFocused(k);
      this.register({ key: k, x: cx, y, w, h, focusable: true, onActivate: () => { audio.playSfx('menuMove'); set(o); } });
      const on = o === current;
      const [a, b] = f ? [COL.redA, COL.redB] : on ? [COL.goldA, COL.goldB] : [COL.blueA, COL.blueB];
      this.d.roundRect(cx, y + 4 * this.u, w, h, h / 2, on ? COL.goldShadow : COL.blueShadow);
      this.d.roundRect(cx, y, w, h, h / 2, b, COL.white, 2.5 * this.u);
      this.d.roundRect(cx + 3 * this.u, y + 3 * this.u, w - 6 * this.u, h * 0.45, h / 2, a);
      this.text(lab, cx + w / 2, y + h * 0.24, h * 0.5, 0.5);
      cx += w + 10 * this.u;
    }
    return cx - x;
  }

  slider(key: string, x: number, y: number, w: number, h: number, value: number, set: (v: number) => void) {
    const f = this.isFocused(key);
    this.register({ key, x, y, w, h, focusable: true, onAdjust: (dir) => set(Math.max(0, Math.min(1, Math.round((value + dir * 0.05) * 20) / 20))) });
    // click-to-set
    const d = this.d;
    d.roundRect(x, y + h * 0.35, w, h * 0.3, h * 0.15, argb('#9ab4f0'));
    d.roundRect(x, y + h * 0.35, w * value, h * 0.3, h * 0.15, COL.goldB);
    d.circle(x + w * value, y + h / 2, h * 0.42, f ? COL.redB : COL.blueB, COL.white, 3 * this.u);
  }
}
