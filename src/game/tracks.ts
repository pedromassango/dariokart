export type EdgeKind = 'wall' | 'fall';
export type BgStyle = 'circuit' | 'plains' | 'ghost' | 'beach' | 'castle' | 'space';
export type DecoKind = 'tree' | 'bush' | 'palm' | 'deadtree' | 'star' | 'lavarock' | 'post';
export type RoadStyle = 'asphalt' | 'dirt' | 'planks' | 'sand' | 'bricks' | 'rainbow';

/** SNES Super Mario Kart–style course look. All colors are flat SNES-ish palette entries. */
export interface Theme {
  skyTop: string;
  skyBottom: string;
  bg: BgStyle;
  bgFar: string;
  bgNear: string;
  bgAccent: string;
  /** outer ground (beyond the band). For 'fall' courses this is the void (water/lava/space). */
  ground: string;
  groundSpeck: [string, string];
  /** band right next to the road (dirt, sand, shallow water). Drivable but slow. */
  band: string;
  bandSpeck: [string, string];
  road: string;
  roadSpeck: [string, string];
  roadStyle: RoadStyle;
  /** white lane dashes like SMK Mario Circuit */
  lanes: boolean;
  /** multicolor dotted border tiles (SMK style) */
  curbColors: string[];
  curbWidth: number;
  /** thin dark line between road and curb */
  edgeLine: string;
  edge: EdgeKind;
  /** drivable off-road width beyond the curb (physics) */
  offroadWidth: number;
  offroadSlow: number;
  startA: string;
  startB: string;
  decor: DecoKind[];
  wallColor: string;
}

export interface TrackDef {
  id: string;
  name: string;
  cup: string;
  music: 'circuit' | 'plains' | 'ghost' | 'beach' | 'castle' | 'rainbow';
  halfWidth: number;
  points: [number, number][];
  /** fractions along the track where rows of "?" item panels are placed */
  itemRows: number[];
  /** dash (zipper) panels: [fraction, lateral -1..1] */
  dash?: [number, number][];
  /** pipes/thwomps on the road: [fraction, lateral -1..1] */
  obstacles?: [number, number][];
  theme: Theme;
}

const base = {
  curbWidth: 4,
  edgeLine: '#303038',
  edge: 'wall' as EdgeKind,
  offroadWidth: 70,
  offroadSlow: 0.45,
  startA: '#f8f8f8',
  startB: '#202020',
  lanes: false,
  wallColor: '#c8a050',
};

export const TRACKS: TrackDef[] = [
  {
    id: 'circuit',
    name: 'Dario Circuit',
    cup: 'Shroom Cup',
    music: 'circuit',
    halfWidth: 44,
    points: [[150, 880], [150, 260], [240, 150], [840, 150], [905, 260], [880, 410], [760, 470], [460, 470], [385, 550], [430, 645], [790, 655], [900, 760], [850, 905], [300, 920]],
    itemRows: [0.2, 0.52, 0.8],
    obstacles: [[0.35, -0.55], [0.39, 0.55], [0.64, 0.5], [0.68, -0.5]],
    theme: {
      ...base,
      skyTop: '#f8f0b0', skyBottom: '#b8e8f8', bg: 'circuit', bgFar: '#68c048', bgNear: '#188830', bgAccent: '#f8f8f8',
      ground: '#40b040', groundSpeck: ['#289828', '#58c858'],
      band: '#c8a068', bandSpeck: ['#a88048', '#e0c088'],
      road: '#84848c', roadSpeck: ['#6c6c74', '#9c9ca4'], roadStyle: 'asphalt', lanes: true,
      curbColors: ['#f8f8f8', '#e02020', '#f8f8f8', '#2050e0', '#f8f8f8', '#f8d020'],
      decor: ['tree', 'bush'], wallColor: '#e8c060',
    },
  },
  {
    id: 'plains',
    name: 'Donut Meadows',
    cup: 'Shroom Cup',
    music: 'plains',
    halfWidth: 44,
    points: [[200, 820], [140, 520], [220, 260], [420, 150], [620, 220], [700, 380], [860, 330], [915, 560], [790, 790], [560, 885], [390, 770]],
    itemRows: [0.2, 0.5, 0.8],
    theme: {
      ...base,
      skyTop: '#58a8f8', skyBottom: '#c8f0f8', bg: 'plains', bgFar: '#88c858', bgNear: '#309830', bgAccent: '#f8f8f8',
      ground: '#48b838', groundSpeck: ['#309828', '#68d050'],
      band: '#58c040', bandSpeck: ['#40a030', '#80d860'],
      road: '#c89858', roadSpeck: ['#a87838', '#e0b878'], roadStyle: 'dirt',
      curbColors: ['#784818', '#986028'], curbWidth: 3, edgeLine: '#684010', offroadSlow: 0.5,
      decor: ['tree', 'bush', 'post'], wallColor: '#a07040',
    },
  },
  {
    id: 'ghost',
    name: 'Boo Hollow',
    cup: 'Shroom Cup',
    music: 'ghost',
    halfWidth: 38,
    points: [[150, 850], [150, 210], [400, 150], [450, 450], [700, 420], [720, 160], [905, 210], [880, 860], [500, 905]],
    itemRows: [0.15, 0.48, 0.78],
    theme: {
      ...base,
      skyTop: '#000000', skyBottom: '#302058', bg: 'ghost', bgFar: '#382858', bgNear: '#100818', bgAccent: '#a088c8',
      ground: '#080410', groundSpeck: ['#140c20', '#000000'],
      band: '#080410', bandSpeck: ['#140c20', '#000000'],
      road: '#9c7c58', roadSpeck: ['#7c5c38', '#b89870'], roadStyle: 'planks',
      curbColors: ['#584030', '#685040'], curbWidth: 3, edgeLine: '#382818', edge: 'fall', offroadWidth: 0,
      decor: ['deadtree'], wallColor: '#5a3a20',
    },
  },
  {
    id: 'beach',
    name: 'Shell Beach',
    cup: 'Star Cup',
    music: 'beach',
    halfWidth: 44,
    points: [[200, 850], [120, 600], [250, 450], [150, 250], [350, 120], [600, 180], [560, 380], [800, 450], [905, 700], [700, 885], [450, 800]],
    itemRows: [0.22, 0.52, 0.85],
    dash: [[0.36, 0], [0.68, 0]],
    theme: {
      ...base,
      skyTop: '#3890f8', skyBottom: '#d0f0ff', bg: 'beach', bgFar: '#2878d8', bgNear: '#f0d890', bgAccent: '#f8f8f8',
      ground: '#2050c8', groundSpeck: ['#1840b0', '#3068e0'],
      band: '#58b8f0', bandSpeck: ['#48a0e0', '#88d8f8'],
      road: '#f0d898', roadSpeck: ['#d8b870', '#f8ecc0'], roadStyle: 'sand',
      curbColors: ['#f8f0d0', '#e8d090'], curbWidth: 3, edgeLine: '#c8a860', edge: 'fall', offroadWidth: 55, offroadSlow: 0.55,
      decor: ['palm'], wallColor: '#e0c070',
    },
  },
  {
    id: 'castle',
    name: 'Bowzer Fortress',
    cup: 'Star Cup',
    music: 'castle',
    halfWidth: 40,
    points: [[180, 880], [180, 150], [500, 150], [500, 390], [330, 390], [330, 630], [700, 630], [700, 190], [880, 190], [880, 880]],
    itemRows: [0.12, 0.45, 0.75],
    dash: [[0.3, -0.3], [0.58, 0.3], [0.9, 0]],
    obstacles: [[0.52, -0.5], [0.55, 0.5], [0.83, 0]],
    theme: {
      ...base,
      skyTop: '#f8a020', skyBottom: '#f83800', bg: 'castle', bgFar: '#200808', bgNear: '#585060', bgAccent: '#f8d040',
      ground: '#d81800', groundSpeck: ['#a80000', '#f85818'],
      band: '#d81800', bandSpeck: ['#a80000', '#f85818'],
      road: '#888090', roadSpeck: ['#686070', '#a8a0b0'], roadStyle: 'bricks',
      curbColors: ['#b8b0c0', '#585060'], curbWidth: 4, edgeLine: '#383040', edge: 'fall', offroadWidth: 0,
      decor: ['lavarock'], wallColor: '#585060',
    },
  },
  {
    id: 'rainbow',
    name: 'Prism Road',
    cup: 'Star Cup',
    music: 'rainbow',
    halfWidth: 40,
    points: [[160, 880], [140, 520], [300, 420], [160, 260], [300, 110], [560, 160], [480, 330], [700, 420], [880, 250], [905, 600], [700, 760], [820, 900], [480, 925]],
    itemRows: [0.15, 0.42, 0.7],
    dash: [[0.28, 0], [0.55, 0], [0.85, 0]],
    theme: {
      ...base,
      skyTop: '#000000', skyBottom: '#000018', bg: 'space', bgFar: '#201050', bgNear: '#100828', bgAccent: '#f8f8f8',
      ground: '#000000', groundSpeck: ['#202040', '#000000'],
      band: '#000000', bandSpeck: ['#202040', '#000000'],
      road: '#f84080', roadSpeck: ['#f8f8f8', '#f8f8f8'], roadStyle: 'rainbow',
      curbColors: ['#f8f8f8', '#f8e040'], curbWidth: 3, edgeLine: '#f8f8f8', edge: 'fall', offroadWidth: 0,
      decor: ['star'], wallColor: '#f8f8f8',
    },
  },
];

export const CUPS = [
  { name: 'Shroom Cup', tracks: ['circuit', 'plains', 'ghost'] },
  { name: 'Star Cup', tracks: ['beach', 'castle', 'rainbow'] },
  { name: 'Special Cup', tracks: ['circuit', 'plains', 'ghost', 'beach', 'castle', 'rainbow'] },
];

export const RAINBOW_COLORS = ['#f84060', '#f89030', '#f8e040', '#50e060', '#40a0f8', '#a060f8'];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
