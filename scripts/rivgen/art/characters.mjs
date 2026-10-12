// Character art: portraits (front bust) and rear-view drivers for karts.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, mix, sineKeys, track, blob, shine, starPts } from './common.mjs';

export const KART_COLORS = {
  dario: '#e52521', luigio: '#2fae3c', pearl: '#ff7fc4', yoshio: '#6bd13a',
  bowzer: '#f7a400', donkeyjr: '#8b5a2b', toadie: '#2a6fe0', koopo: '#ffd23f',
};

const SKIN = '#ffc896';
const SKIN_D = '#e8a070';
const W = 3;

const vg = (y1, y2, c, t = 0.22) => linear(0, y1, 0, y2, [[0, lighten(c, t)], [1, darken(c, t * 0.9)]]);
const rg = (cx, cy, r, c) => radial(cx, cy, r, [[0, lighten(c, 0.25)], [1, darken(c, 0.12)]]);

// ---------------------------------------------------------------- parts
function eye(name, x, y, rx, ry, iris, { look = 0.6, lid = null, lash = false } = {}) {
  const kids = [
    blob({}, ellipse(x, y, rx, ry), '#ffffff', 2),
    shape({}, ellipse(x + look, y + ry * 0.12, rx * 0.62, ry * 0.7), iris ? linear(0, y - ry, 0, y + ry, [[0, lighten(iris, 0.2)], [1, darken(iris, 0.3)]]) : OUT),
    shape({}, ellipse(x + look, y + ry * 0.2, rx * 0.34, ry * 0.42), OUT),
    shine([ellipse(x + look - rx * 0.25, y - ry * 0.25, rx * 0.2, ry * 0.2)], 1),
  ];
  if (lid) kids.push(shape({}, svg(`M${x - rx - 0.5} ${y} C${x - rx} ${y - ry * 1.35} ${x + rx} ${y - ry * 1.35} ${x + rx + 0.5} ${y} C${x + rx * 0.5} ${y - ry * 0.55} ${x - rx * 0.5} ${y - ry * 0.55} ${x - rx - 0.5} ${y} Z`), lid, ol(1.5)));
  if (lash) kids.push(shape({}, svg(`M${x - rx} ${y - ry * 0.6} L${x - rx - 3} ${y - ry - 1} M${x - rx * 0.3} ${y - ry} L${x - rx * 0.5} ${y - ry - 4} M${x + rx * 0.4} ${y - ry} L${x + rx * 0.5} ${y - ry - 4}`), null, ol(1.8)));
  return pivot(x, y, { name }, kids);
}
function brow(x, y, w, ang, color = '#3a1f0f', t = 3) {
  return shape({ x, y, rotation: ang }, svg(`M${-w / 2} 1 Q0 ${-2.5} ${w / 2} 1`), null, { color, width: t, cap: 'round' });
}
function capEmblem(cx, cy, letter, color) {
  const L = {
    D: 'M-3 -4 L0 -4 C4 -4 4 4 0 4 L-3 4 Z',
    L: 'M-3 -4.5 L-0.5 -4.5 L-0.5 2 L3.5 2 L3.5 4.5 L-3 4.5 Z',
  }[letter];
  return node({ x: cx, y: cy }, [
    blob({}, ellipse(0, 0, 9, 8), '#ffffff', 2),
    shape({}, svg(L), letter === 'D' ? { type: 'solid', color } : color, letter === 'D' ? { color, width: 2.5 } : null),
  ]);
}

// Shoulders/bust (portrait coords). Body sits on y >= 92.
function shoulders(color, { w = 46, top = 94 } = {}) {
  return blob({}, svg(`M${64 - w} 132 C${64 - w} ${top + 10} ${64 - w * 0.6} ${top} 64 ${top} C${64 + w * 0.6} ${top} ${64 + w} ${top + 10} ${64 + w} 132 Z`), vg(top, 132, color), W);
}

// ---------------------------------------------------------------- portraits (front)
const PORTRAIT = {
  dario: () => [
    shoulders('#e52521'),
    // overalls bib + straps
    blob({}, svg('M44 132 L46 108 L82 108 L84 132 Z'), vg(104, 132, '#2a4bd7'), W),
    blob({}, svg('M42 98 L50 96 L52 110 L46 110 Z M86 98 L78 96 L76 110 L82 110 Z'), '#2a4bd7', 2),
    blob({}, [circle(49, 112, 3), circle(79, 112, 3)], '#ffd23f', 1.5),
    // hair behind
    blob({}, svg('M34 48 C30 64 34 80 40 84 L46 70 Z M94 48 C98 64 94 80 88 84 L82 70 Z'), '#5a2e12', W),
    // ears
    blob({}, [ellipse(37, 66, 6, 8), ellipse(91, 66, 6, 8)], SKIN, W),
    // face
    blob({}, ellipse(64, 66, 27, 27), rg(56, 56, 34, SKIN), W),
    shape({}, [ellipse(46, 74, 5, 3), ellipse(82, 74, 5, 3)], alpha('#ff7a7a', 0.35)),
    // cap
    blob({}, svg('M34 52 C32 30 46 18 64 18 C82 18 96 30 94 52 C80 46 48 46 34 52 Z'), vg(18, 52, '#e52521'), W),
    blob({}, svg('M30 54 C40 44 88 44 98 54 C98 58 92 60 88 58 C76 52 52 52 40 58 C36 60 30 58 30 54 Z'), '#b8140f', W),
    capEmblem(64, 34, 'D', '#e52521'),
    shine([ellipse(48, 28, 6, 3)], 0.5, { rotation: -25 }),
    eye('eyeL', 55, 62, 5, 7, '#2a6fe0'), eye('eyeR', 73, 62, 5, 7, '#2a6fe0'),
    brow(55, 52, 10, -8), brow(73, 52, 10, 8),
    // mouth + mustache + nose
    blob({}, svg('M56 86 C58 92 70 92 72 86 Z'), '#9e1a2a', 2),
    blob({}, svg('M40 82 C42 74 52 74 58 76 C62 72 66 72 70 76 C76 74 86 74 88 82 C82 86 76 82 72 84 C68 86 60 86 56 84 C52 82 46 86 40 82 Z'), '#3a1f0f', 2.5),
    blob({}, ellipse(64, 72, 9, 7.5), rg(61, 69, 10, SKIN), W),
    shine([ellipse(61, 69, 3, 2)], 0.7),
  ],
  luigio: () => [
    shoulders('#2fae3c', { w: 42 }),
    blob({}, svg('M46 132 L48 108 L80 108 L82 132 Z'), vg(104, 132, '#1d2f8a'), W),
    blob({}, svg('M44 99 L51 97 L53 110 L47 110 Z M84 99 L77 97 L75 110 L81 110 Z'), '#1d2f8a', 2),
    blob({}, [circle(51, 112, 3), circle(77, 112, 3)], '#ffd23f', 1.5),
    blob({}, svg('M38 46 C33 64 36 80 42 86 L48 70 Z M90 46 C95 64 92 80 86 86 L80 70 Z'), '#5a2e12', W),
    blob({}, [ellipse(39, 66, 5.5, 8), ellipse(89, 66, 5.5, 8)], SKIN, W),
    blob({}, ellipse(64, 66, 24, 30), rg(57, 56, 34, SKIN), W),
    shape({}, [ellipse(48, 76, 4.5, 3), ellipse(80, 76, 4.5, 3)], alpha('#ff7a7a', 0.35)),
    blob({}, svg('M37 48 C34 24 48 12 64 12 C80 12 94 24 91 48 C78 42 50 42 37 48 Z'), vg(12, 48, '#2fae3c'), W),
    blob({}, svg('M33 50 C42 40 86 40 95 50 C95 54 90 56 86 54 C76 48 52 48 42 54 C38 56 33 54 33 50 Z'), '#1c7a28', W),
    capEmblem(64, 29, 'L', '#2fae3c'),
    shine([ellipse(49, 24, 6, 3)], 0.5, { rotation: -25 }),
    eye('eyeL', 56, 60, 5, 7.5, '#2a6fe0'), eye('eyeR', 72, 60, 5, 7.5, '#2a6fe0'),
    brow(56, 49, 10, -4), brow(72, 49, 10, 4),
    blob({}, svg('M57 88 C59 93 69 93 71 88 Z'), '#9e1a2a', 2),
    blob({}, svg('M42 80 C40 86 48 86 52 80 C56 77 60 77 64 79 C68 77 72 77 76 80 C80 86 88 86 86 80 C80 82 74 74 64 76 C54 74 48 82 42 80 Z'), '#3a1f0f', 2.5),
    blob({}, ellipse(64, 72, 7.5, 8.5), rg(61, 69, 10, SKIN), W),
    shine([ellipse(61, 68, 2.5, 2)], 0.7),
  ],
  pearl: () => [
    // back hair
    blob({}, svg('M28 58 C24 30 42 16 64 16 C86 16 104 30 100 58 C104 84 102 104 96 116 L32 116 C26 104 24 84 28 58 Z'), vg(16, 116, '#ffd84a', 0.25), W),
    shoulders('#ff7fc4', { w: 44, top: 100 }),
    // puffy sleeves
    blob({}, [ellipse(26, 112, 14, 12), ellipse(102, 112, 14, 12)], vg(100, 124, '#ff9fd2'), W),
    blob({}, svg('M50 101 L64 116 L78 101 Z'), '#ffd0e8', 2),
    blob({}, circle(64, 112, 4.5), '#3fc8ff', 2),
    // neck
    blob({}, rect(57, 86, 14, 14, 4), SKIN, 2),
    // earrings
    blob({}, [circle(38, 82, 3.5), circle(90, 82, 3.5)], '#3fc8ff', 2),
    blob({}, ellipse(64, 64, 25, 27), rg(57, 56, 32, '#ffd9b8'), W),
    shape({}, [ellipse(48, 74, 5, 3), ellipse(80, 74, 5, 3)], alpha('#ff6fa0', 0.45)),
    // bangs
    blob({}, svg('M38 58 C34 36 48 28 64 28 C80 28 94 36 90 58 C86 48 80 42 74 40 C72 48 64 50 58 44 C54 50 44 52 38 58 Z'), vg(28, 58, '#ffd84a', 0.25), W),
    shine([ellipse(48, 38, 6, 2.5)], 0.6, { rotation: -30 }),
    // crown
    blob({}, poly([[46, 30], [44, 12], [52, 20], [58, 8], [64, 18], [70, 8], [76, 20], [84, 12], [82, 30]], true, 1.5), vg(8, 30, '#ffd23f'), W),
    blob({}, [circle(64, 23, 3)], '#ff3b6b', 1.5),
    blob({}, [circle(53, 25, 2), circle(75, 25, 2)], '#3fc8ff', 1.5),
    eye('eyeL', 55, 63, 5, 7, '#2a6fe0', { lash: true }), eye('eyeR', 73, 63, 5, 7, '#2a6fe0', { lash: true }),
    brow(55, 52, 8, -6, '#c9971a', 2), brow(73, 52, 8, 6, '#c9971a', 2),
    shape({}, svg('M63 70 C62 74 64 76 66 75'), null, ol(1.8, SKIN_D)),
    blob({}, svg('M57 81 C60 86 68 86 71 81 C68 82 60 82 57 81 Z'), '#ff4f8a', 2),
  ],
  yoshio: () => [
    // red saddle hint + body
    blob({}, svg('M14 132 C14 108 30 98 50 98 L50 132 Z'), vg(98, 132, '#e52521'), W),
    shoulders('#6bd13a', { w: 40, top: 98 }),
    blob({}, svg('M44 132 C44 114 52 104 64 104 C76 104 84 114 84 132 Z'), '#ffffff', 2.5),
    // spikes on back of head
    blob({}, [poly([[84, 30], [100, 32], [90, 42]], true, 2), poly([[92, 44], [106, 50], [94, 56]], true, 2), poly([[94, 60], [106, 68], [92, 70]], true, 2)], '#e52521', 2.5),
    // head
    blob({}, svg('M36 60 C34 38 46 26 64 26 C84 26 96 40 94 62 C92 80 82 92 64 92 C46 92 38 80 36 60 Z'), rg(56, 50, 44, '#6bd13a'), W),
    // white cheek/jaw
    blob({}, svg('M40 72 C46 90 82 90 88 72 C80 82 48 82 40 72 Z'), '#ffffff', 2.5),
    // big snout
    blob({}, ellipse(64, 66, 22, 15), rg(58, 60, 26, '#6bd13a'), W),
    blob({}, [ellipse(58, 64, 2.5, 3.5), ellipse(70, 64, 2.5, 3.5)], OUT, 0),
    shine([ellipse(56, 58, 7, 3)], 0.5, { rotation: -15 }),
    // mouth
    shape({}, svg('M44 78 C54 86 74 86 84 78'), null, ol(2.5)),
    // eyes on top (tall)
    eye('eyeL', 54, 38, 7.5, 11, null, { look: 1.5 }), eye('eyeR', 74, 38, 7.5, 11, null, { look: 1.5 }),
    shape({}, [ellipse(42, 76, 4, 2.5), ellipse(86, 76, 4, 2.5)], alpha('#ff7a7a', 0.4)),
  ],
  bowzer: () => [
    // green shell behind with spikes
    blob({}, svg('M6 132 C6 104 26 88 64 88 C102 88 122 104 122 132 Z'), vg(88, 132, '#2fae3c'), W),
    blob({}, [poly([[14, 104], [10, 88], [24, 98]], true, 1.5), poly([[114, 104], [118, 88], [104, 98]], true, 1.5)], '#fff4d6', 2),
    shoulders('#f2b33d', { w: 36, top: 100 }),
    blob({}, svg('M46 132 C46 116 54 108 64 108 C74 108 82 116 82 132 Z'), '#ffe7a0', 2.5),
    // spiked collar
    blob({}, rectC(64, 100, 52, 9, 4), '#2a2030', 2.5),
    blob({}, [poly([[44, 96], [46, 88], [50, 96]], true, 1), poly([[60, 96], [64, 87], [68, 96]], true, 1), poly([[78, 96], [82, 88], [84, 96]], true, 1)], '#e8e4f0', 1.5),
    // horns
    blob({}, [svg('M40 40 C30 34 28 22 34 14 C38 24 44 28 50 32 Z'), svg('M88 40 C98 34 100 22 94 14 C90 24 84 28 78 32 Z')], vg(14, 40, '#fff4d6'), W),
    // head
    blob({}, svg('M34 62 C30 40 44 26 64 26 C84 26 98 40 94 62 C92 82 80 94 64 94 C48 94 36 82 34 62 Z'), rg(56, 48, 46, '#f2b33d'), W),
    // muzzle
    blob({}, svg('M40 70 C40 58 52 56 64 58 C76 56 88 58 88 70 C88 84 76 90 64 90 C52 90 40 84 40 70 Z'), vg(56, 90, '#ffe7a0', 0.1), W),
    blob({}, [ellipse(57, 64, 2.5, 2), ellipse(71, 64, 2.5, 2)], OUT, 0),
    // mouth + fangs
    blob({}, svg('M48 76 C54 84 74 84 80 76 C72 79 56 79 48 76 Z'), '#7a1a2a', 2),
    blob({}, [poly([[52, 77], [55, 77], [53.5, 83]], true, 0.5), poly([[73, 77], [76, 77], [74.5, 83]], true, 0.5)], '#ffffff', 1.2),
    // hair
    blob({}, svg('M42 34 C40 20 50 14 54 20 C54 10 64 6 68 16 C70 8 82 10 80 22 C88 18 92 28 86 36 C78 30 50 30 42 34 Z'), vg(6, 36, '#ff5a2a'), W),
    eye('eyeL', 54, 48, 5.5, 6.5, '#e52521', { lid: '#f2b33d' }), eye('eyeR', 74, 48, 5.5, 6.5, '#e52521', { lid: '#f2b33d' }),
    shape({ x: 53, y: 40, rotation: 18 }, rectC(0, 0, 14, 4.5, 2), '#ff5a2a', ol(2)),
    shape({ x: 75, y: 40, rotation: -18 }, rectC(0, 0, 14, 4.5, 2), '#ff5a2a', ol(2)),
  ],
  donkeyjr: () => [
    shoulders('#8b5a2b', { w: 46 }),
    // tank top
    blob({}, svg('M42 132 L44 100 C50 106 78 106 84 100 L86 132 Z'), vg(100, 132, '#ffffff', 0.05), W),
    blob({}, svg('M60 103 L72 103 L72 114 C72 121 60 121 58 115 L62 113 C63 116 67 116 67 114 L67 107 L60 107 Z'), '#e52521', 1.5),
    // ears
    blob({}, [circle(34, 58, 9), circle(94, 58, 9)], '#8b5a2b', W),
    blob({}, [circle(34, 58, 5), circle(94, 58, 5)], '#e8b080', 0),
    // head fur
    blob({}, svg('M36 60 C34 36 46 24 64 24 C82 24 94 36 92 60 C92 82 80 96 64 96 C48 96 36 82 36 60 Z'), rg(56, 46, 48, '#8b5a2b'), W),
    // tuft
    blob({}, svg('M56 28 C54 16 62 12 64 20 C66 10 76 12 72 26 Z'), '#7a4a20', 2.5),
    // face mask (heart) + muzzle
    blob({}, svg('M64 46 C58 36 42 38 44 54 C45 62 52 66 64 64 C76 66 83 62 84 54 C86 38 70 36 64 46 Z'), '#e8b080', 2.5),
    blob({}, ellipse(64, 76, 19, 14), vg(62, 90, '#e8b080', 0.12), W),
    blob({}, [ellipse(59, 70, 2, 2.5), ellipse(69, 70, 2, 2.5)], OUT, 0),
    blob({}, svg('M52 79 C58 88 70 88 76 79 Z'), '#7a1a2a', 2),
    shape({}, svg('M54 80 L74 80 L72 83 L56 83 Z'), '#ffffff'),
    eye('eyeL', 56, 52, 4.5, 6, '#4a2a10'), eye('eyeR', 72, 52, 4.5, 6, '#4a2a10'),
    brow(56, 43, 9, -6, '#4a2a10', 2.5), brow(72, 43, 9, 6, '#4a2a10', 2.5),
  ],
  toadie: () => [
    shoulders('#ffffff', { w: 40, top: 100 }),
    blob({}, [svg('M24 132 C24 112 34 102 50 100 L54 132 Z'), svg('M104 132 C104 112 94 102 78 100 L74 132 Z')], vg(100, 132, '#2a6fe0'), W),
    shape({}, [svg('M50 101 L54 132'), svg('M78 101 L74 132')], null, ol(3, '#ffd23f')),
    // face
    blob({}, ellipse(64, 76, 23, 20), rg(58, 70, 28, '#ffe0bd'), W),
    shape({}, [ellipse(48, 84, 5, 3), ellipse(80, 84, 5, 3)], alpha('#ff7a7a', 0.45)),
    blob({}, svg('M56 86 C58 94 70 94 72 86 C66 88 62 88 56 86 Z'), '#9e1a2a', 2),
    // eyes (big black ovals)
    pivot(56, 74, { name: 'eyeL' }, [blob({}, ellipse(56, 74, 3.8, 7), OUT, 0), shine([ellipse(55, 70.5, 1.4, 2.2)], 1)]),
    pivot(72, 74, { name: 'eyeR' }, [blob({}, ellipse(72, 74, 3.8, 7), OUT, 0), shine([ellipse(71, 70.5, 1.4, 2.2)], 1)]),
    // mushroom cap
    blob({}, svg('M18 58 C14 34 36 14 64 14 C92 14 114 34 110 58 C106 66 92 64 64 64 C36 64 22 66 18 58 Z'), rg(56, 30, 60, '#ffffff'), W),
    shape({}, [ellipse(64, 30, 11, 10), ellipse(32, 46, 9, 9), ellipse(96, 46, 9, 9)], vg(20, 56, '#e52521'), ol(2.5)),
    shine([ellipse(44, 26, 7, 3)], 0.8, { rotation: -30 }),
  ],
  koopo: () => [
    // shell behind
    blob({}, svg('M10 132 C10 102 30 90 64 90 C98 90 118 102 118 132 Z'), vg(90, 132, '#2fae3c'), W),
    blob({}, svg('M10 132 C10 120 14 112 18 108 L110 108 C114 112 118 120 118 132'), null, W),
    blob({}, svg('M16 112 C30 100 98 100 112 112 L114 118 C98 108 30 108 14 118 Z'), '#ffffff', 2),
    shoulders('#ffd23f', { w: 32, top: 100 }),
    blob({}, svg('M48 132 C48 116 56 110 64 110 C72 110 80 116 80 132 Z'), '#fff4c0', 2.5),
    // head: tall with snout
    blob({}, svg('M42 64 C38 36 48 18 64 18 C80 18 92 36 88 62 C90 76 86 92 64 92 C46 92 40 80 42 64 Z'), rg(56, 42, 46, '#ffd23f'), W),
    blob({}, ellipse(64, 78, 18, 12), rg(60, 74, 20, '#ffd23f'), W),
    blob({}, [ellipse(60, 74, 1.8, 2.4), ellipse(68, 74, 1.8, 2.4)], OUT, 0),
    blob({}, svg('M53 81 C56 90 72 90 75 81 C68 84 60 84 53 81 Z'), '#9e1a2a', 2),
    shine([ellipse(52, 30, 5, 3)], 0.5, { rotation: -30 }),
    eye('eyeL', 56, 50, 6, 10, null, { look: 1 }), eye('eyeR', 72, 50, 6, 10, null, { look: 1 }),
    shape({}, [ellipse(46, 74, 4, 2.5), ellipse(82, 74, 4, 2.5)], alpha('#ff7a7a', 0.4)),
  ],
};

export function buildPortraits(file, ids) {
  for (const id of ids) {
    const kc = id === 'koopo' ? '#f0b020' : KART_COLORS[id];
    const ab = file.artboard('Portrait_' + id, 128, 128);
    const stripes = [];
    for (let i = -6; i < 10; i++) stripes.push(poly([[i * 18, 0], [i * 18 + 9, 0], [i * 18 + 9 + 128, 128], [i * 18 + 128, 128]]));
    const tileP = rect(4, 4, 120, 120, 18);
    ab.add(
      shape({ x: 2, y: 3 }, rect(4, 4, 120, 120, 18), alpha(OUT, 0.5)),
      shape({ name: 'tile' }, tileP, { type: 'solid', color: lighten(kc, 0.1), name: 'tileFill' }),
      node({ name: 'tileClip', clip: 'tile' }, [
        shape({}, rect(0, 0, 128, 128), radial(64, 52, 80, [[0, alpha(lighten(kc, 0.45), 1)], [0.6, alpha(kc, 1)], [1, alpha(darken(kc, 0.35), 1)]])),
        shape({ name: 'stripes' }, stripes, alpha('#ffffff', 0.12)),
        pivot(64, 128, { name: 'bust' }, PORTRAIT[id]()),
        // sparkle burst (happy)
        node({ name: 'sparkles', opacity: 0 }, [
          shape({ name: 'sp1', x: 18, y: 26 }, poly(starPts(0, 0, 7, 2.5, 4, -90, 0.5)), '#ffffff', ol(1.5)),
          shape({ name: 'sp2', x: 110, y: 22 }, poly(starPts(0, 0, 6, 2.2, 4, -90, 0.5)), '#ffffff', ol(1.5)),
          shape({ name: 'sp3', x: 108, y: 82 }, poly(starPts(0, 0, 5, 2, 4, -90, 0.5)), '#ffffff', ol(1.5)),
        ]),
      ]),
      shape({}, rect(7, 7, 114, 114, 15), null, { color: alpha('#ffffff', 0.45), width: 2 }),
      shape({}, tileP, null, ol(3.5)),
    );
    const D = 150; // idle length (2.5s)
    const blink = (n) => track(n, 'scaleY', [[0, 1, 'hold'], [D - 22, 1], [D - 18, 0.1], [D - 14, 1, 'hold'], [D, 1, 'hold']]);
    ab.animation('idle', { duration: D, loop: 'loop' }, [
      blink('eyeL'), blink('eyeR'),
      track('bust', 'scaleY', sineKeys(1, 0.012, D / 2, D, 0, 6)),
      track('bust', 'y', [[0, 128]], 'hold'),
      track('bust', 'rotation', [[0, 0]], 'hold'),
      track('sparkles', 'opacity', [[0, 0]], 'hold'),
      track('stripes', 'x', [[0, 0]], 'hold'),
    ]);
    const H = 36; // happy bounce (0.6s)
    ab.animation('happy', { duration: H, loop: 'loop' }, [
      track('eyeL', 'scaleY', [[0, 1]], 'hold'), track('eyeR', 'scaleY', [[0, 1]], 'hold'),
      track('bust', 'y', [[0, 128, 'easeOut'], [H / 2, 120, 'easeIn'], [H, 128]]),
      track('bust', 'scaleY', [[0, 0.94, 'easeOut'], [6, 1.04], [H / 2, 1.0, 'easeIn'], [H - 4, 1.0], [H, 0.94]]),
      track('bust', 'rotation', [[0, -3], [H / 2, 3], [H, -3]]),
      track('sparkles', 'opacity', [[0, 1]], 'hold'),
      track('stripes', 'x', [[0, 0, 'linear'], [H, 18]]),
      ...['sp1', 'sp2', 'sp3'].flatMap((s, i) => [
        track(s, 'scaleX', sineKeys(0.9, 0.4, H, H, i * 0.33, 3)),
        track(s, 'scaleY', sineKeys(0.9, 0.4, H, H, i * 0.33, 3)),
        track(s, 'rotation', [[0, 0, 'linear'], [H, 90]]),
      ]),
    ]);
    ab.stateMachine('Main', {
      inputs: { selected: { type: 'bool', value: false } },
      layers: [{
        name: 'main',
        states: { idle: { anim: 'idle' }, happy: { anim: 'happy' } },
        entry: 'idle',
        transitions: [
          { from: 'idle', to: 'happy', when: [['selected', true]], duration: 120 },
          { from: 'happy', to: 'idle', when: [['selected', false]], duration: 200 },
        ],
      }],
    });
  }
}

// ---------------------------------------------------------------- kart drivers (rear view)
// Kart coords (96x96). Head centre about (48, 30); shoulders around y 40..56.
function backShoulders(color, w = 18, top = 40) {
  return blob({}, svg(`M${48 - w} 62 C${48 - w} ${top + 6} ${48 - w * 0.6} ${top} 48 ${top} C${48 + w * 0.6} ${top} ${48 + w} ${top + 6} ${48 + w} 62 Z`), vg(top, 62, color), 2.5);
}
const DRIVER = {
  dario: () => [
    backShoulders('#e52521'),
    shape({}, [svg('M38 44 L44 62'), svg('M58 44 L52 62')], null, { color: '#2a4bd7', width: 4.5, cap: 'round' }),
    blob({}, [ellipse(35, 32, 3.5, 5), ellipse(61, 32, 3.5, 5)], SKIN, 2),
    blob({}, svg('M37 34 C37 42 59 42 59 34 C59 30 37 30 37 34 Z'), '#5a2e12', 2.5),
    blob({}, svg('M35 32 C33 18 40 12 48 12 C56 12 63 18 61 32 C56 35 40 35 35 32 Z'), vg(12, 34, '#e52521'), 2.5),
    shine([ellipse(42, 18, 4, 2)], 0.5, { rotation: -20 }),
  ],
  luigio: () => [
    backShoulders('#2fae3c', 16),
    shape({}, [svg('M39 44 L45 62'), svg('M57 44 L51 62')], null, { color: '#1d2f8a', width: 4.5, cap: 'round' }),
    blob({}, [ellipse(36, 30, 3.5, 5.5), ellipse(60, 30, 3.5, 5.5)], SKIN, 2),
    blob({}, svg('M38 32 C38 42 58 42 58 32 C58 28 38 28 38 32 Z'), '#5a2e12', 2.5),
    blob({}, svg('M36 30 C34 14 41 8 48 8 C55 8 62 14 60 30 C55 33 41 33 36 30 Z'), vg(8, 32, '#2fae3c'), 2.5),
    shine([ellipse(43, 14, 4, 2)], 0.5, { rotation: -20 }),
  ],
  pearl: () => [
    backShoulders('#ff7fc4', 18, 42),
    blob({}, [ellipse(30, 50, 7, 6), ellipse(66, 50, 7, 6)], '#ff9fd2', 2),
    blob({}, svg('M33 28 C31 14 40 10 48 10 C56 10 65 14 63 28 C66 40 64 52 58 56 L38 56 C32 52 30 40 33 28 Z'), vg(10, 56, '#ffd84a', 0.25), 2.5),
    shape({}, [svg('M42 22 C40 34 42 46 44 54'), svg('M54 22 C56 34 54 46 52 54')], null, ol(1.5, '#d9a820')),
    blob({}, poly([[38, 14], [37, 3], [42, 8], [48, 1], [54, 8], [59, 3], [58, 14]], true, 1), vg(1, 14, '#ffd23f'), 2),
    blob({}, circle(48, 10, 1.8), '#ff3b6b', 1),
  ],
  yoshio: () => [
    backShoulders('#6bd13a', 17),
    blob({}, rectC(48, 54, 26, 12, 5), vg(48, 60, '#e52521'), 2.5),
    blob({}, svg('M34 30 C32 16 40 10 48 10 C56 10 64 16 62 30 C62 40 56 46 48 46 C40 46 34 40 34 30 Z'), rg(44, 22, 26, '#6bd13a'), 2.5),
    // eyes peeking on top
    blob({}, [ellipse(42, 10, 5, 6), ellipse(54, 10, 5, 6)], '#6bd13a', 2.5),
    blob({}, [poly([[46, 18], [50, 18], [48, 12]], true, 1), poly([[45, 28], [51, 28], [48, 21]], true, 1), poly([[45, 38], [51, 38], [48, 31]], true, 1)], '#e52521', 1.8),
  ],
  bowzer: () => [
    backShoulders('#f2b33d', 22, 40),
    // big spiked shell = back
    blob({}, svg('M24 62 C22 46 32 36 48 36 C64 36 74 46 72 62 Z'), vg(36, 62, '#2fae3c'), 2.5),
    shape({}, [poly([[40, 44], [56, 44], [60, 54], [36, 54]], true, 2)], null, ol(1.5, '#167a24')),
    blob({}, [poly([[34, 48], [38, 38], [42, 48]], true, 1), poly([[54, 48], [58, 38], [62, 48]], true, 1), poly([[44, 58], [48, 47], [52, 58]], true, 1)], '#fff4d6', 1.8),
    blob({}, [svg('M34 22 C28 18 28 10 32 6 C34 12 38 14 40 18 Z'), svg('M62 22 C68 18 68 10 64 6 C62 12 58 14 56 18 Z')], '#fff4d6', 2),
    blob({}, svg('M34 28 C32 16 40 12 48 12 C56 12 64 16 62 28 C62 36 56 40 48 40 C40 40 34 36 34 28 Z'), rg(44, 20, 26, '#f2b33d'), 2.5),
    blob({}, svg('M38 22 C36 10 44 8 46 14 C48 6 56 8 54 14 C60 10 62 20 58 26 C52 20 44 20 38 22 Z'), '#ff5a2a', 2),
  ],
  donkeyjr: () => [
    backShoulders('#8b5a2b', 19),
    blob({}, svg('M38 62 L38 46 C44 49 52 49 58 46 L58 62 Z'), '#ffffff', 2),
    blob({}, [circle(33, 26, 5), circle(63, 26, 5)], '#8b5a2b', 2.5),
    blob({}, svg('M34 28 C32 16 40 10 48 10 C56 10 64 16 62 28 C62 38 56 44 48 44 C40 44 34 38 34 28 Z'), rg(44, 20, 26, '#8b5a2b'), 2.5),
    blob({}, svg('M44 12 C42 4 48 2 48 8 C50 2 56 4 52 12 Z'), '#7a4a20', 2),
    shape({}, [svg('M42 24 C44 28 46 30 44 34'), svg('M54 26 C52 30 52 32 54 36')], null, ol(1.5, '#6a3a14')),
  ],
  toadie: () => [
    backShoulders('#ffffff', 16, 42),
    blob({}, [svg('M30 62 C30 50 34 44 42 42 L44 62 Z'), svg('M66 62 C66 50 62 44 54 42 L52 62 Z')], '#2a6fe0', 2.5),
    blob({}, svg('M22 30 C20 16 32 6 48 6 C64 6 76 16 74 30 C72 36 64 36 48 36 C32 36 24 36 22 30 Z'), rg(44, 14, 34, '#ffffff'), 2.5),
    shape({}, [ellipse(48, 18, 7, 6), ellipse(30, 26, 5, 4.5), ellipse(66, 26, 5, 4.5)], '#e52521', ol(2)),
  ],
  koopo: () => [
    backShoulders('#ffd23f', 15, 42),
    blob({}, svg('M28 62 C26 48 34 40 48 40 C62 40 70 48 68 62 Z'), vg(40, 62, '#2fae3c'), 2.5),
    shape({}, [poly([[42, 46], [54, 46], [58, 55], [48, 60], [38, 55]], true, 1.5)], lighten('#2fae3c', 0.25), ol(1.5, '#167a24')),
    blob({}, svg('M27 60 C30 64 66 64 69 60 L68 64 C60 68 36 68 28 64 Z'), '#ffffff', 1.5),
    blob({}, svg('M37 30 C35 14 41 8 48 8 C55 8 61 14 59 30 C59 38 55 42 48 42 C41 42 37 38 37 30 Z'), rg(44, 18, 26, '#ffd23f'), 2.5),
  ],
};

export function driverRear(id) { return DRIVER[id](); }
