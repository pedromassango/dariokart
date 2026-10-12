// Hand-drawn rear-view drivers for Kart view 0 (straight from behind) and view 1
// (rear three-quarter, turn=1: head turned a little to the right so only an ear
// and a cheek/snout edge peek out on the right). No face features at all.
import { shape, node, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, blob } from './common.mjs';

const SKIN = '#ffc896';
const g = (y1, y2, c, t = 0.22) => linear(0, y1, 0, y2, [[0, lighten(c, t)], [1, darken(c, t)]]);
const rg = (cx, cy, r, c) => radial(cx, cy, r, [[0, lighten(c, 0.25)], [1, darken(c, 0.18)]]);

function shoulders(cx, ty, w, h, color) {
  return blob({}, svg(`M${cx - w} ${ty + h} C${cx - w} ${ty + h * 0.25} ${cx - w * 0.55} ${ty} ${cx} ${ty} C${cx + w * 0.55} ${ty} ${cx + w} ${ty + h * 0.25} ${cx + w} ${ty + h} Z`), g(ty, ty + h, color), 2.5);
}
function elbows(cx, ty, w, color) {
  return blob({}, [ellipse(cx - w - 1, ty + 14, 5, 6.5), ellipse(cx + w + 1, ty + 14, 5, 6.5)], g(ty + 8, ty + 20, color), 2.5);
}
function ears(cx, cy, R, color, turn, inner) {
  const kids = [];
  if (!turn) kids.push(blob({}, ellipse(cx - R * 0.98, cy + 3, 3.6, 5.6), color, 2));
  kids.push(blob({}, ellipse(cx + R * (turn ? 0.9 : 0.98), cy + 3, turn ? 3 : 3.6, 5.6), color, 2));
  if (inner) kids.push(shape({}, [turn ? null : ellipse(cx - R * 0.98, cy + 3, 1.8, 3), ellipse(cx + R * (turn ? 0.9 : 0.98), cy + 3, 1.6, 3)].filter(Boolean), inner));
  return kids;
}
// small sliver of the face side peeking out on the right in view 1 (drawn before the head)
function peek(cx, cy, R, color, turn, dy = 6, w = 6, h = 7) {
  return turn ? [blob({}, ellipse(cx + R * 0.92, cy + dy, w, h), color, 2)] : [];
}

const REAR = {
  dario: (cx, cy, R, turn, colors = { cap: '#e52521', shirt: '#e52521', overalls: '#2a4bd7' }) => {
    const ty = cy + R * 0.85, w = R * 1.08, h = R * 1.05;
    const capB = cy + R * 0.05;
    const dx = turn ? -R * 0.18 : 0;
    return [
      elbows(cx, ty, w, colors.shirt),
      shoulders(cx, ty, w, h, colors.shirt),
      // overall straps crossing in an X, buttons at the bib edge
      shape({}, [svg(`M${cx - w * 0.55} ${ty + 2} L${cx + w * 0.35} ${ty + h}`), svg(`M${cx + w * 0.55} ${ty + 2} L${cx - w * 0.35} ${ty + h}`)], null, [{ color: OUT, width: 7, cap: 'round' }, { color: colors.overalls, width: 4, cap: 'round' }]),
      blob({}, rect(cx - w * 0.75, ty + h - 4, w * 1.5, 6, 2), colors.overalls, 2),
      // neck
      blob({}, rect(cx - 5, ty - 6, 10, 8, 3), darken(SKIN, 0.08), 2),
      ...peek(cx, cy, R, SKIN, turn),
      ...ears(cx, cy, R, SKIN, turn),
      // hair mass covering the back of the head (wavy tufts at the nape)
      blob({}, svg(`M${cx - R} ${cy - 2} C${cx - R} ${cy + R * 0.7} ${cx - R * 0.6} ${cy + R * 0.95} ${cx - R * 0.35} ${cy + R * 0.85} C${cx - R * 0.2} ${cy + R * 1.02} ${cx + R * 0.1} ${cy + R * 1.02} ${cx + R * 0.25} ${cy + R * 0.88} C${cx + R * 0.5} ${cy + R * 1.0} ${cx + R} ${cy + R * 0.7} ${cx + R} ${cy - 2} Z`), rg(cx - 6, cy, R * 1.4, '#5a2e12'), 2.5),
      shape({}, [svg(`M${cx - R * 0.5 + dx} ${cy + 4} C${cx - R * 0.45 + dx} ${cy + 9} ${cx - R * 0.3 + dx} ${cy + 13} ${cx - R * 0.35 + dx} ${cy + 15}`), svg(`M${cx + R * 0.3 + dx} ${cy + 4} C${cx + R * 0.35 + dx} ${cy + 9} ${cx + R * 0.5 + dx} ${cy + 12} ${cx + R * 0.45 + dx} ${cy + 15}`)], null, { color: '#3a1a08', width: 1.6, cap: 'round' }),
      // cap dome from behind
      blob({}, svg(`M${cx - R * 1.06} ${capB} C${cx - R * 1.1} ${cy - R * 1.25} ${cx + R * 1.1} ${cy - R * 1.25} ${cx + R * 1.06} ${capB} C${cx + R * 0.5} ${capB + 3} ${cx - R * 0.5} ${capB + 3} ${cx - R * 1.06} ${capB} Z`), g(cy - R * 1.2, capB, colors.cap), 2.5),
      // back opening + adjuster strap
      blob({}, svg(`M${cx - 6 + dx} ${capB + 2} C${cx - 6 + dx} ${capB - 8} ${cx + 6 + dx} ${capB - 8} ${cx + 6 + dx} ${capB + 2} Z`), '#5a2e12', 2),
      blob({}, rect(cx - 8 + dx, capB - 4, 16, 3.5, 1.5), darken(colors.cap, 0.25), 1.5),
      blob({}, rect(cx - 2 + dx, capB - 4.5, 4, 4.5, 1), '#e8e4f0', 1.2),
      // seams + shine
      shape({}, [svg(`M${cx + dx} ${cy - R * 0.82} L${cx + dx} ${capB - 8}`)], null, { color: darken(colors.cap, 0.3), width: 1.4 }),
      shape({}, [ellipse(cx - R * 0.45, cy - R * 0.7, R * 0.28, R * 0.13)], alpha('#ffffff', 0.45)),
    ];
  },
  luigio: (cx, cy, R, turn) => REAR.dario(cx, cy - 1, R * 0.96, turn, { cap: '#2fae3c', shirt: '#2fae3c', overalls: '#1d2f8a' }),
  pearl: (cx, cy, R, turn) => {
    const ty = cy + R * 0.85, w = R * 1.05, h = R * 1.05;
    const dx = turn ? -R * 0.15 : 0;
    return [
      blob({}, [ellipse(cx - w * 0.95, ty + 8, 7, 6), ellipse(cx + w * 0.95, ty + 8, 7, 6)], g(ty, ty + 14, '#ff9fd2'), 2.5),
      shoulders(cx, ty, w, h, '#ff7fc4'),
      ...peek(cx, cy, R, '#ffd9b8', turn, 4),
      // long hair over the back of the head and shoulders
      blob({}, svg(`M${cx - R * 1.02} ${cy - 2} C${cx - R * 1.1} ${cy - R * 1.1} ${cx + R * 1.1} ${cy - R * 1.1} ${cx + R * 1.02} ${cy - 2} C${cx + R * 1.15} ${cy + R} ${cx + R * 1.0} ${cy + R * 1.6} ${cx + R * 0.7} ${cy + R * 1.9} C${cx + R * 0.3} ${cy + R * 2.0} ${cx - R * 0.3} ${cy + R * 2.0} ${cx - R * 0.7} ${cy + R * 1.9} C${cx - R * 1.0} ${cy + R * 1.6} ${cx - R * 1.15} ${cy + R} ${cx - R * 1.02} ${cy - 2} Z`), linear(0, cy - R, 0, cy + R * 2, [[0, '#fff09a'], [0.5, '#ffd84a'], [1, '#d9a820']]), 2.5),
      shape({}, [-0.5, -0.15, 0.2, 0.55].map((f) => svg(`M${cx + f * R + dx} ${cy - R * 0.6} C${cx + f * R * 1.2 + dx} ${cy + R * 0.4} ${cx + f * R * 0.9 + dx} ${cy + R * 1.2} ${cx + f * R * 1.1 + dx} ${cy + R * 1.8}`)), null, { color: '#c9971a', width: 1.4, cap: 'round' }),
      shape({}, [ellipse(cx - R * 0.45, cy - R * 0.55, R * 0.3, R * 0.14)], alpha('#ffffff', 0.5)),
      // crown from behind
      blob({}, poly([[cx - 9, cy - R * 0.92], [cx - 10, cy - R * 0.92 - 10], [cx - 5, cy - R * 0.92 - 5], [cx, cy - R * 0.92 - 12], [cx + 5, cy - R * 0.92 - 5], [cx + 10, cy - R * 0.92 - 10], [cx + 9, cy - R * 0.92]], true, 1), linear(0, cy - R - 12, 0, cy - R, [[0, '#fff09a'], [1, '#e8a800']]), 2),
    ];
  },
  yoshio: (cx, cy, R, turn) => {
    const ty = cy + R * 0.8, w = R * 1.0, h = R * 1.1;
    const dx = turn ? -R * 0.2 : 0;
    return [
      elbows(cx, ty, w, '#6bd13a'),
      shoulders(cx, ty, w, h, '#6bd13a'),
      // red saddle shell on the back
      blob({}, ellipse(cx + dx, ty + h * 0.75, w * 0.8, h * 0.45), g(ty + h * 0.3, ty + h * 1.2, '#e52521'), 2.5),
      blob({}, svg(`M${cx - w * 0.82 + dx} ${ty + h * 0.82} C${cx - w * 0.5 + dx} ${ty + h * 1.05} ${cx + w * 0.5 + dx} ${ty + h * 1.05} ${cx + w * 0.82 + dx} ${ty + h * 0.82}`), null, [{ color: OUT, width: 5 }, { color: '#ffffff', width: 2.5 }]),
      ...peek(cx, cy, R, '#6bd13a', turn, 6, 9, 8),
      // eye bumps peeking over the top of the head
      blob({}, [ellipse(cx - R * 0.42 + dx, cy - R * 0.85, R * 0.32, R * 0.4), ellipse(cx + R * 0.42 + dx, cy - R * 0.85, R * 0.32, R * 0.4)], rg(cx, cy - R, R, '#6bd13a'), 2.5),
      blob({}, ellipse(cx, cy, R * 0.98, R * 0.95), rg(cx - 6, cy - 6, R * 1.6, '#6bd13a'), 2.5),
      // spikes running down the back of the head and neck
      blob({}, [0, 1, 2, 3].map((i) => {
        const y = cy - R * 0.55 + i * R * 0.42;
        return poly([[cx - 4 + dx, y + 4], [cx + 4 + dx, y + 4], [cx + dx, y - 4]], true, 1);
      }), '#e52521', 1.8),
      shape({}, [ellipse(cx - R * 0.45, cy - R * 0.45, R * 0.25, R * 0.12)], alpha('#ffffff', 0.4)),
    ];
  },
  bowzer: (cx, cy, R, turn) => {
    const ty = cy + R * 0.8, w = R * 1.25, h = R * 1.15;
    const dx = turn ? -R * 0.2 : 0;
    return [
      elbows(cx, ty, w * 0.9, '#f2b33d'),
      shoulders(cx, ty, w * 0.9, h, '#f2b33d'),
      // big spiky shell covering the back
      blob({}, svg(`M${cx - w * 1.05} ${ty + h + 2} C${cx - w * 1.1} ${ty - 2} ${cx - w * 0.4} ${ty - 6} ${cx} ${ty - 6} C${cx + w * 0.4} ${ty - 6} ${cx + w * 1.1} ${ty - 2} ${cx + w * 1.05} ${ty + h + 2} Z`), g(ty - 6, ty + h, '#2fae3c'), 2.5),
      shape({}, [poly([[cx - 8 + dx, ty + 2], [cx + 8 + dx, ty + 2], [cx + 11 + dx, ty + 12], [cx + dx, ty + 18], [cx - 11 + dx, ty + 12]], true, 1)], null, ol(1.6, '#167a24')),
      blob({}, [[-0.6, 0.45], [0, 0.3], [0.6, 0.45], [-0.3, 0.85], [0.3, 0.85]].map(([fx, fy]) => poly([[cx + fx * w - 3.5 + dx, ty + fy * h + 3], [cx + fx * w + 3.5 + dx, ty + fy * h + 3], [cx + fx * w + dx, ty + fy * h - 6]], true, 0.8)), '#fff4d6', 1.8),
      blob({}, svg(`M${cx - w * 1.02} ${ty + h - 3} C${cx - w * 0.5} ${ty + h + 3} ${cx + w * 0.5} ${ty + h + 3} ${cx + w * 1.02} ${ty + h - 3} L${cx + w * 1.05} ${ty + h + 2} L${cx - w * 1.05} ${ty + h + 2} Z`), '#ffffff', 2),
      ...peek(cx, cy, R, '#ffe7a0', turn, 8, 8, 8),
      // horns
      blob({}, [svg(`M${cx - R * 0.75} ${cy - R * 0.45} C${cx - R * 1.35} ${cy - R * 0.7} ${cx - R * 1.35} ${cy - R * 1.2} ${cx - R * 1.05} ${cy - R * 1.3} C${cx - R * 0.95} ${cy - R * 1.05} ${cx - R * 0.7} ${cy - R * 0.9} ${cx - R * 0.5} ${cy - R * 0.8} Z`),
        svg(`M${cx + R * 0.75} ${cy - R * 0.45} C${cx + R * 1.35} ${cy - R * 0.7} ${cx + R * 1.35} ${cy - R * 1.2} ${cx + R * 1.05} ${cy - R * 1.3} C${cx + R * 0.95} ${cy - R * 1.05} ${cx + R * 0.7} ${cy - R * 0.9} ${cx + R * 0.5} ${cy - R * 0.8} Z`)], g(cy - R * 1.3, cy - R * 0.4, '#fff4d6', 0.1), 2),
      blob({}, ellipse(cx, cy, R * 1.05, R * 0.98), rg(cx - 6, cy - 6, R * 1.6, '#f2b33d'), 2.5),
      // red hair crest
      blob({}, poly([[cx - R * 0.75, cy - R * 0.2], [cx - R * 0.95, cy - R * 0.85], [cx - R * 0.45, cy - R * 0.65], [cx - R * 0.35, cy - R * 1.25], [cx, cy - R * 0.75], [cx + R * 0.35, cy - R * 1.25], [cx + R * 0.45, cy - R * 0.65], [cx + R * 0.95, cy - R * 0.85], [cx + R * 0.75, cy - R * 0.2], [cx + R * 0.4, cy + R * 0.25], [cx, cy + R * 0.05], [cx - R * 0.4, cy + R * 0.25]], true, 1.5), g(cy - R * 1.25, cy + R * 0.25, '#ff5a2a'), 2.2),
    ];
  },
  donkeyjr: (cx, cy, R, turn) => {
    const ty = cy + R * 0.85, w = R * 1.1, h = R * 1.05;
    const dx = turn ? -R * 0.2 : 0;
    return [
      elbows(cx, ty, w, '#8b5a2b'),
      shoulders(cx, ty, w, h, '#8b5a2b'),
      blob({}, svg(`M${cx - w * 0.62} ${ty + h} L${cx - w * 0.62} ${ty + 4} C${cx - w * 0.3} ${ty + 9} ${cx + w * 0.3} ${ty + 9} ${cx + w * 0.62} ${ty + 4} L${cx + w * 0.62} ${ty + h} Z`), g(ty, ty + h, '#ffffff', 0.05), 2),
      ...peek(cx, cy, R, '#e8b080', turn, 9, 7, 7),
      ...ears(cx, cy - 2, R * 1.04, '#8b5a2b', turn, '#e8b080'),
      blob({}, ellipse(cx, cy, R, R * 0.98), rg(cx - 6, cy - 6, R * 1.6, '#8b5a2b'), 2.5),
      shape({}, [svg(`M${cx - R * 0.4 + dx} ${cy - 2} C${cx - R * 0.3 + dx} ${cy + 4} ${cx - R * 0.45 + dx} ${cy + 9} ${cx - R * 0.35 + dx} ${cy + 13}`), svg(`M${cx + R * 0.3 + dx} ${cy} C${cx + R * 0.4 + dx} ${cy + 6} ${cx + R * 0.3 + dx} ${cy + 10} ${cx + R * 0.4 + dx} ${cy + 14}`)], null, { color: '#5a3414', width: 1.5, cap: 'round' }),
      blob({}, svg(`M${cx - 4 + dx} ${cy - R * 0.85} C${cx - 6 + dx} ${cy - R * 1.35} ${cx + dx} ${cy - R * 1.3} ${cx + 1 + dx} ${cy - R * 1.05} C${cx + 3 + dx} ${cy - R * 1.5} ${cx + 9 + dx} ${cy - R * 1.3} ${cx + 5 + dx} ${cy - R * 0.85} Z`), '#7a4a20', 2),
      shape({}, [ellipse(cx - R * 0.45, cy - R * 0.5, R * 0.25, R * 0.12)], alpha('#ffffff', 0.3)),
    ];
  },
  toadie: (cx, cy, R, turn) => {
    const ty = cy + R * 0.75, w = R * 0.95, h = R * 1.15;
    const dx = turn ? -R * 0.25 : 0;
    return [
      elbows(cx, ty, w, '#2a6fe0'),
      shoulders(cx, ty, w, h, '#2a6fe0'),
      blob({}, rect(cx - 5, ty - 2, 10, 6, 3), '#ffffff', 1.5),
      blob({}, ellipse(cx, cy + R * 0.25, R * 0.75, R * 0.6), rg(cx - 4, cy, R, '#ffe0bd'), 2.5),
      // big mushroom cap from behind
      blob({}, svg(`M${cx - R * 1.6} ${cy + R * 0.1} C${cx - R * 1.75} ${cy - R * 1.65} ${cx + R * 1.75} ${cy - R * 1.65} ${cx + R * 1.6} ${cy + R * 0.1} C${cx + R * 0.9} ${cy + R * 0.45} ${cx - R * 0.9} ${cy + R * 0.45} ${cx - R * 1.6} ${cy + R * 0.1} Z`), radial(cx - R * 0.5, cy - R, R * 2.4, [[0, '#ffffff'], [1, '#d8d0e0']]), 2.5),
      shape({}, [ellipse(cx + dx, cy - R * 0.6, R * 0.5, R * 0.42), ellipse(cx - R * 1.05 + dx, cy - R * 0.25, R * 0.3, R * 0.32), ellipse(cx + R * 1.05 + dx, cy - R * 0.25, R * 0.3, R * 0.32)], '#e52521', ol(2)),
      shape({}, [ellipse(cx - R * 0.7, cy - R * 0.95, R * 0.3, R * 0.12)], alpha('#ffffff', 0.8)),
    ];
  },
  koopo: (cx, cy, R, turn) => {
    const ty = cy + R * 0.95, w = R * 1.05, h = R * 1.0;
    const dx = turn ? -R * 0.2 : 0;
    return [
      elbows(cx, ty, w * 0.9, '#ffd23f'),
      shoulders(cx, ty, w * 0.9, h, '#ffd23f'),
      ...peek(cx, cy, R, '#ffd23f', turn, 8, 8, 8),
      blob({}, ellipse(cx, cy - 2, R * 0.9, R * 1.12), rg(cx - 6, cy - 8, R * 1.6, '#ffd23f'), 2.5),
      // shell on the back
      blob({}, svg(`M${cx - w * 1.05} ${ty + h + 2} C${cx - w * 1.1} ${ty} ${cx - w * 0.4} ${ty - 6} ${cx} ${ty - 6} C${cx + w * 0.4} ${ty - 6} ${cx + w * 1.1} ${ty} ${cx + w * 1.05} ${ty + h + 2} Z`), g(ty - 6, ty + h, '#2fae3c'), 2.5),
      shape({}, [poly([[cx - 6 + dx, ty + 1], [cx + 6 + dx, ty + 1], [cx + 9 + dx, ty + 9], [cx + dx, ty + 14], [cx - 9 + dx, ty + 9]], true, 1)], lighten('#2fae3c', 0.25), ol(1.6, '#167a24')),
      shape({}, [svg(`M${cx - 9 + dx} ${ty + 9} L${cx - w * 0.9} ${ty + 6} M${cx + 9 + dx} ${ty + 9} L${cx + w * 0.9} ${ty + 6} M${cx + dx} ${ty + 14} L${cx + dx} ${ty + h}`)], null, ol(1.6, '#167a24')),
      blob({}, svg(`M${cx - w * 1.02} ${ty + h - 3} C${cx - w * 0.5} ${ty + h + 3} ${cx + w * 0.5} ${ty + h + 3} ${cx + w * 1.02} ${ty + h - 3} L${cx + w * 1.05} ${ty + h + 2} L${cx - w * 1.05} ${ty + h + 2} Z`), '#ffffff', 2),
      shape({}, [ellipse(cx - R * 0.4, cy - R * 0.6, R * 0.25, R * 0.14)], alpha('#ffffff', 0.45)),
    ];
  },
};

/** Rear-view driver nodes. turn=0 straight from behind, 1 = rear three-quarter. */
export function rearDriver(id, cx, cy, R, turn = 0) {
  return REAR[id](cx, cy, R, turn);
}
