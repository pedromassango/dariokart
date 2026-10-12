import type { Draw } from '../rive/draw';
import { argb } from '../rive/draw';

/** Simple vector fallbacks used when an artboard is missing from the .riv pack. size = width in px; (x, y) = center. */
export function drawItemFallback(d: Draw, kind: string, x: number, y: number, size: number, time: number) {
  const s = size / 2;
  const ol = argb('#140c18');
  const lw = Math.max(0.8, s * 0.12);
  switch (kind) {
    case 'box': {
      const hue = ['#ff5050', '#ffd040', '#50e070', '#50a0ff', '#c070ff'][Math.floor(time * 6) % 5];
      d.roundRect(x - s, y - s, s * 2, s * 2, s * 0.25, argb(hue, 0.75), ol, lw);
      d.text('?', x, y - s * 0.55, s * 0.16, argb('#ffffff'), { align: 0.5 });
      break;
    }
    case 'coin': {
      const sq = Math.abs(Math.cos(time * 4));
      d.ellipse(x, y, s * Math.max(0.15, sq), s, argb('#ffd030'), ol, lw);
      if (sq > 0.4) d.ellipse(x, y, s * 0.35 * sq, s * 0.6, argb('#ffb000'));
      break;
    }
    case 'banana':
      d.poly([x - s, y - s * 0.6, x - s * 0.3, y + s * 0.8, x + s * 0.8, y + s * 0.6, x + s * 0.9, y + s * 0.2, x, y + s * 0.2], argb('#ffe040'), ol, lw);
      d.rect(x - s * 1.1, y - s * 0.9, s * 0.35, s * 0.4, argb('#6a4a20'));
      break;
    case 'greenShell':
    case 'redShell': {
      const c = kind === 'greenShell' ? '#28b040' : '#e02828';
      d.ellipse(x, y + s * 0.35, s, s * 0.45, argb('#ffffff'), ol, lw);
      d.ellipse(x, y, s * 0.9, s * 0.75, argb(c), ol, lw);
      d.ellipse(x - s * 0.3, y - s * 0.25, s * 0.2, s * 0.15, argb('#ffffff', 0.7));
      break;
    }
    case 'mushroom':
      d.rect(x - s * 0.4, y, s * 0.8, s * 0.8, argb('#fff0d8'), ol, lw);
      d.ellipse(x, y, s, s * 0.75, argb('#e52521'), ol, lw);
      d.circle(x - s * 0.4, y - s * 0.2, s * 0.22, argb('#ffffff'));
      d.circle(x + s * 0.4, y - s * 0.2, s * 0.22, argb('#ffffff'));
      break;
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? s * 0.45 : s;
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      d.poly(pts, argb('#ffd820'), ol, lw);
      break;
    }
    case 'lightning':
      d.poly([x + s * 0.2, y - s, x - s * 0.6, y + s * 0.1, x - s * 0.05, y + s * 0.1, x - s * 0.3, y + s, x + s * 0.6, y - s * 0.2, x + s * 0.05, y - s * 0.2], argb('#ffe840'), ol, lw);
      break;
    case 'feather':
      d.ellipse(x, y, s * 0.4, s, argb('#ffffff'), ol, lw);
      d.line(x, y - s, x, y + s * 1.1, argb('#a0a0b0'), lw);
      break;
    case 'cloud':
      d.ellipse(x, y, s, s * 0.5, argb('#ffffff'), ol, lw);
      break;
  }
}

export const ITEM_ARTBOARD: Record<string, string> = {
  mushroom: 'Item_mushroom',
  banana: 'Item_banana',
  greenShell: 'Item_greenShell',
  redShell: 'Item_redShell',
  star: 'Item_star',
  lightning: 'Item_lightning',
  feather: 'Item_feather',
  coin: 'Item_coin',
};
