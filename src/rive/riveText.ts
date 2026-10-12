import type { Draw } from './draw';
import type { RiveAssets } from './assets';

/**
 * Text rendered with the Rive vector HUD font: one artboard per glyph ("Glyph_A", "Glyph_7", ...),
 * laid out using the advance widths in /assets/glyphs.json.
 */
const NAMED: Record<string, string> = { ':': 'colon', '"': 'quote', "'": 'apos', '/': 'slash', '.': 'dot', 'x': 'x', '×': 'x', '-': 'dash', '!': 'excl', '?': 'qmark' };
let widths: Record<string, number> = {};
const TRACK = -6; // tighter tracking (glyph widths include outline + bearings)
const SPACE = 18;

export async function loadGlyphs(): Promise<void> {
  try {
    const res = await fetch(new URL('assets/glyphs.json', document.baseURI).href);
    if (res.ok) widths = await res.json();
  } catch { /* fall back to pixel font */ }
}

function glyphName(ch: string): string | null {
  if (NAMED[ch]) return NAMED[ch];
  const u = ch.toUpperCase();
  if (/[A-Z0-9]/.test(u)) return u;
  return null;
}

function key(ch: string) { return ch === 'x' || ch === '×' ? 'x' : ch.toUpperCase(); }

export function riveTextWidth(str: string, height: number): number {
  const s = height / 64;
  let w = 0;
  for (const ch of str) w += ch === ' ' ? SPACE : (widths[key(ch)] ?? 48) + TRACK;
  return Math.max(0, w - TRACK) * s;
}

/**
 * Draws `str` with its top-left at (x, y) (align 0 left, 0.5 center, 1 right) at the given cap height in px.
 * Returns false when the glyph artboards are unavailable (caller can fall back).
 */
export function riveText(d: Draw, assets: RiveAssets, str: string, x: number, y: number, height: number, align = 0): boolean {
  if (!assets.has('Glyph_A') || !Object.keys(widths).length) return false;
  const s = height / 64;
  let cx = x - riveTextWidth(str, height) * align;
  for (const ch of str) {
    if (ch === ' ') { cx += SPACE * s; continue; }
    const name = glyphName(ch);
    const w = (widths[key(ch)] ?? 48) * s;
    if (name) assets.draw(d, 'glyph_' + name, 'Glyph_' + name, cx + w / 2, y, w, { anchorY: 0 });
    cx += w + TRACK * s;
  }
  return true;
}
