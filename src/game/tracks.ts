/**
 * Course definitions — layouts modelled on the SNES Super Mario Kart courses (as remade in MK8's
 * retro cups): long straights, tight hairpins, rectilinear castles, a lake loop, etc.
 * Everything here is data; geometry is built in track.ts and drawn by the Rive 3D renderer.
 */
export type EdgeKind = 'wall' | 'fall';
export type PropKind = 'tree' | 'bush' | 'palm' | 'deadtree' | 'cactus' | 'lamp' | 'flag' | 'boo' | 'penguin' | 'mole' | 'star' | 'lavarock';
export type RoadStyle = 'asphalt' | 'dirt' | 'planks' | 'sand' | 'bricks' | 'rainbow' | 'ice' | 'choco';
export type WallStyle = 'blocks' | 'castle' | 'fence' | 'rail' | 'none';
export type HillStyle = 'round' | 'mesa' | 'jagged' | 'snow' | 'island' | 'none';
export type ObstacleKind = 'pipe' | 'thwomp' | 'iceblock' | 'piranha';

export interface Theme {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  /** outer ground; for 'fall' courses this is the void / water / lava below */
  ground: string;
  groundSpeck: [string, string];
  groundAnim?: 'water' | 'lava';
  /** drivable shoulder next to the road */
  band: string;
  bandSpeck: [string, string];
  road: string;
  roadSpeck: [string, string];
  roadStyle: RoadStyle;
  /** solid edge line colour painted on the road (MK8 style), or null */
  edgeLine: string | null;
  centerDashes: boolean;
  curbColors: string[];
  curbWidth: number;
  edge: EdgeKind;
  offroadWidth: number;
  offroadSlow: number;
  /** tyre grip multiplier (ice < 1) */
  grip: number;
  walls: WallStyle;
  wallColors: string[];
  hills: HillStyle;
  hillColor: string;
  hillTop: string;
  props: PropKind[];
  grandstand: boolean;
  adBoards: boolean;
  turnSigns: boolean;
  startA: string;
  startB: string;
}

export interface TrackDef {
  id: string;
  name: string;
  cup: string;
  music: 'circuit' | 'plains' | 'ghost' | 'beach' | 'castle' | 'rainbow';
  halfWidth: number;
  points: [number, number][];
  itemRows: number[];
  dash?: [number, number][];
  obstacles?: [number, number, ObstacleKind][];
  /** slow mud puddles: [fraction, lateral -1..1, radius] */
  puddles?: [number, number, number][];
  /** decorative lake/patch polygons in world coords (drawn under everything) */
  lakes?: { color: string; points: [number, number][] }[];
  theme: Theme;
}

const base = {
  fogNear: 500, fogFar: 2200,
  edgeLine: null as string | null, centerDashes: false,
  curbWidth: 4, edge: 'wall' as EdgeKind, offroadWidth: 70, offroadSlow: 0.45, grip: 1,
  walls: 'none' as WallStyle, wallColors: ['#e02424', '#ffd21e', '#1e64e0', '#28b43c'],
  hills: 'round' as HillStyle, hillColor: '#5aa848', hillTop: '#5aa848',
  grandstand: false, adBoards: false, turnSigns: true,
  startA: '#f4f4f4', startB: '#1c1c1c',
};

export const TRACKS: TrackDef[] = [
  {
    id: 'circuit',
    name: 'Dario Circuit',
    cup: 'Shroom Cup',
    music: 'circuit',
    halfWidth: 46,
    points: [[150, 880], [150, 260], [240, 150], [840, 150], [905, 260], [880, 410], [760, 470], [460, 470], [385, 550], [430, 645], [790, 655], [900, 760], [850, 905], [300, 920]],
    itemRows: [0.2, 0.52, 0.8],
    obstacles: [[0.35, -0.55, 'pipe'], [0.39, 0.55, 'pipe'], [0.64, 0.5, 'pipe'], [0.68, -0.5, 'pipe']],
    theme: {
      ...base,
      skyTop: '#2f8ff0', skyHorizon: '#cfeaff', fog: '#d6ecff',
      ground: '#4fb43c', groundSpeck: ['#3f9e30', '#66c84e'],
      band: '#f0d070', bandSpeck: ['#d8b450', '#fff0a0'],
      road: '#55565e', roadSpeck: ['#45464e', '#6a6b73'], roadStyle: 'asphalt',
      edgeLine: '#f4f4f4', centerDashes: true,
      curbColors: ['#f4f4f4', '#1f6fe8'],
      walls: 'blocks', grandstand: true, adBoards: true,
      hills: 'mesa', hillColor: '#58a848', hillTop: '#78c860',
      props: ['tree', 'bush', 'lamp', 'flag'],
    },
  },
  {
    id: 'plains',
    name: 'Donut Meadows',
    cup: 'Shroom Cup',
    music: 'plains',
    halfWidth: 46,
    points: [[200, 820], [140, 520], [220, 260], [420, 150], [620, 220], [700, 380], [860, 330], [915, 560], [790, 790], [560, 885], [390, 770]],
    itemRows: [0.2, 0.5, 0.8],
    lakes: [{ color: '#2f86d8', points: [[330, 420], [420, 330], [560, 360], [600, 480], [520, 620], [380, 640], [300, 540]] }],
    theme: {
      ...base,
      skyTop: '#3a9cff', skyHorizon: '#d8f4ff', fog: '#dcf2ff',
      ground: '#5cc048', groundSpeck: ['#4aa83a', '#78d860'],
      band: '#76cc58', bandSpeck: ['#5cb440', '#96e070'],
      road: '#c8955a', roadSpeck: ['#a87840', '#e0b47c'], roadStyle: 'dirt',
      curbColors: ['#7a4a1c', '#a06830'], curbWidth: 3, offroadSlow: 0.5,
      walls: 'fence', wallColors: ['#a87040'],
      hills: 'round', hillColor: '#68b850', hillTop: '#88d068',
      props: ['tree', 'bush', 'mole', 'flag'],
    },
  },
  {
    id: 'ghost',
    name: 'Boo Hollow',
    cup: 'Shroom Cup',
    music: 'ghost',
    halfWidth: 40,
    points: [[150, 850], [150, 210], [400, 150], [450, 450], [700, 420], [720, 160], [905, 210], [880, 860], [500, 905]],
    itemRows: [0.15, 0.48, 0.78],
    theme: {
      ...base,
      skyTop: '#07041a', skyHorizon: '#4a2a72', fog: '#2a1846', fogNear: 160, fogFar: 1100,
      ground: '#0e0818', groundSpeck: ['#180f26', '#05030a'],
      band: '#0e0818', bandSpeck: ['#180f26', '#05030a'],
      road: '#9a7650', roadSpeck: ['#7a5a38', '#b89068'], roadStyle: 'planks',
      curbColors: ['#5a3e24', '#6a4a2c'], curbWidth: 3, edge: 'fall', offroadWidth: 0,
      walls: 'rail', wallColors: ['#6a4a2c'],
      hills: 'jagged', hillColor: '#2a1a40', hillTop: '#3a2858',
      props: ['deadtree', 'boo'], turnSigns: false,
    },
  },
  {
    id: 'castle',
    name: 'Bowzer Fortress',
    cup: 'Shroom Cup',
    music: 'castle',
    halfWidth: 42,
    points: [[180, 880], [180, 150], [500, 150], [500, 390], [330, 390], [330, 630], [700, 630], [700, 190], [880, 190], [880, 880]],
    itemRows: [0.12, 0.45, 0.75],
    dash: [[0.3, -0.3], [0.58, 0.3], [0.9, 0]],
    obstacles: [[0.52, -0.5, 'thwomp'], [0.55, 0.5, 'thwomp'], [0.83, 0, 'thwomp']],
    theme: {
      ...base,
      skyTop: '#2a0606', skyHorizon: '#ff6a20', fog: '#6a1a08', fogNear: 300, fogFar: 1500,
      ground: '#e03008', groundSpeck: ['#b01800', '#ff7a18'], groundAnim: 'lava',
      band: '#e03008', bandSpeck: ['#b01800', '#ff7a18'],
      road: '#8a8490', roadSpeck: ['#6a6470', '#a8a2ae'], roadStyle: 'bricks',
      curbColors: ['#b8b0c0', '#57505e'], edge: 'fall', offroadWidth: 0,
      walls: 'castle', wallColors: ['#6a6470', '#7a7480'],
      hills: 'jagged', hillColor: '#2a1210', hillTop: '#3a1a14',
      props: ['lavarock'],
    },
  },
  {
    id: 'choco',
    name: 'Choco Isle',
    cup: 'Star Cup',
    music: 'plains',
    halfWidth: 42,
    points: [[160, 880], [140, 560], [300, 460], [460, 560], [620, 460], [600, 260], [780, 160], [900, 320], [860, 620], [700, 760], [520, 700], [380, 880]],
    itemRows: [0.18, 0.5, 0.78],
    obstacles: [[0.3, 0.45, 'piranha'], [0.62, -0.45, 'piranha'], [0.88, 0.4, 'piranha']],
    puddles: [[0.12, 0.2, 16], [0.4, -0.3, 18], [0.55, 0.35, 15], [0.72, -0.2, 17]],
    theme: {
      ...base,
      skyTop: '#4aa2f0', skyHorizon: '#f6e6c8', fog: '#ecdcc0',
      ground: '#6a3e22', groundSpeck: ['#552e18', '#80502e'],
      band: '#7a4a2a', bandSpeck: ['#5a3420', '#94603a'],
      road: '#9a6038', roadSpeck: ['#7a4824', '#b47a4c'], roadStyle: 'choco',
      curbColors: ['#f0e0c0', '#c87838'], curbWidth: 3, offroadSlow: 0.5,
      walls: 'none',
      hills: 'mesa', hillColor: '#7a4a2a', hillTop: '#9a6640',
      props: ['bush', 'cactus'],
    },
  },
  {
    id: 'beach',
    name: 'Shell Beach',
    cup: 'Star Cup',
    music: 'beach',
    halfWidth: 46,
    points: [[200, 850], [120, 600], [250, 450], [150, 250], [350, 120], [600, 180], [560, 380], [800, 450], [905, 700], [700, 885], [450, 800]],
    itemRows: [0.22, 0.52, 0.85],
    dash: [[0.36, 0], [0.68, 0]],
    theme: {
      ...base,
      skyTop: '#2a94ff', skyHorizon: '#d4f4ff', fog: '#d8f2ff', fogFar: 2600,
      ground: '#1a6ad0', groundSpeck: ['#1458b8', '#3a8ae8'], groundAnim: 'water',
      band: '#5cd0e8', bandSpeck: ['#46bcd8', '#8ae6f4'],
      road: '#f0dca0', roadSpeck: ['#dcc480', '#fff0c4'], roadStyle: 'sand',
      curbColors: ['#fff8dc', '#e8d090'], curbWidth: 3, edge: 'fall', offroadWidth: 55, offroadSlow: 0.55,
      hills: 'island', hillColor: '#4aa040', hillTop: '#f0dca0',
      props: ['palm'],
    },
  },
  {
    id: 'ice',
    name: 'Frost Lake',
    cup: 'Star Cup',
    music: 'plains',
    halfWidth: 44,
    points: [[180, 860], [150, 450], [260, 200], [520, 140], [780, 200], [880, 420], [820, 650], [640, 620], [540, 780], [360, 900]],
    itemRows: [0.16, 0.5, 0.8],
    obstacles: [[0.28, -0.4, 'iceblock'], [0.31, 0.4, 'iceblock'], [0.58, 0, 'iceblock'], [0.74, -0.45, 'iceblock']],
    lakes: [{ color: '#7cc8f0', points: [[300, 400], [380, 280], [620, 270], [740, 380], [700, 520], [560, 580], [380, 560]] }],
    theme: {
      ...base,
      skyTop: '#5aa8f0', skyHorizon: '#eaf6ff', fog: '#eef6ff',
      ground: '#f2f8ff', groundSpeck: ['#dcecf8', '#ffffff'],
      band: '#e2f0fa', bandSpeck: ['#c8e0f2', '#ffffff'],
      road: '#a8d4ee', roadSpeck: ['#90c4e4', '#d4ecfa'], roadStyle: 'ice',
      curbColors: ['#ffffff', '#4aa0e0'], curbWidth: 3, offroadSlow: 0.55, grip: 0.42,
      walls: 'none',
      hills: 'snow', hillColor: '#8aa0c0', hillTop: '#ffffff',
      props: ['penguin', 'tree'],
    },
  },
  {
    id: 'rainbow',
    name: 'Prism Road',
    cup: 'Star Cup',
    music: 'rainbow',
    halfWidth: 42,
    points: [[160, 880], [140, 520], [300, 420], [160, 260], [300, 110], [560, 160], [480, 330], [700, 420], [880, 250], [905, 600], [700, 760], [820, 900], [480, 925]],
    itemRows: [0.15, 0.42, 0.7],
    dash: [[0.28, 0], [0.55, 0], [0.85, 0]],
    obstacles: [[0.47, -0.4, 'thwomp'], [0.77, 0.4, 'thwomp']],
    theme: {
      ...base,
      skyTop: '#000006', skyHorizon: '#1a0c48', fog: '#000010', fogNear: 900, fogFar: 3000,
      ground: '#000006', groundSpeck: ['#1a1a40', '#000006'],
      band: '#000006', bandSpeck: ['#1a1a40', '#000006'],
      road: '#ff3a7a', roadSpeck: ['#ffffff', '#ffffff'], roadStyle: 'rainbow',
      curbColors: ['#ffffff', '#ffe040'], curbWidth: 3, edge: 'fall', offroadWidth: 0,
      walls: 'rail', wallColors: ['#ffffff'],
      hills: 'none', hillColor: '#000000', hillTop: '#000000',
      props: ['star'], turnSigns: false,
    },
  },
];

export const CUPS = [
  { name: 'Shroom Cup', tracks: ['circuit', 'plains', 'ghost', 'castle'] },
  { name: 'Star Cup', tracks: ['choco', 'beach', 'ice', 'rainbow'] },
  { name: 'Special Cup', tracks: ['circuit', 'plains', 'ghost', 'castle', 'choco', 'beach', 'ice', 'rainbow'] },
];

export const RAINBOW_COLORS = ['#ff1040', '#ff7a00', '#ffd400', '#18c840', '#1070ff', '#8a2cff'];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
