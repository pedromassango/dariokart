// The asset contract the game code depends on (artboard names, sizes, inputs).
export const CHAR_IDS = ['dario', 'luigio', 'pearl', 'yoshio', 'bowzer', 'donkeyjr', 'toadie', 'koopo'];
export const ITEM_IDS = ['mushroom', 'banana', 'greenShell', 'redShell', 'star', 'lightning', 'coin', 'feather'];

export const CONTRACT = {
  Logo: { width: 640, height: 240, inputs: {} },
  Referee: {
    width: 220, height: 300, inputs: { stage: 'number', flag: 'bool' },
    scenarios: [{ stage: 0 }, { stage: 1 }, { stage: 2 }, { stage: 3 }, { flag: true }, { flag: false, stage: 0 }],
  },
  ItemBox: { width: 64, height: 64, inputs: {} },
  Trophy: { width: 128, height: 160, inputs: { rank: 'number' }, scenarios: [{ rank: 1 }, { rank: 2 }, { rank: 3 }, { rank: 1 }] },
};
for (const id of CHAR_IDS) {
  CONTRACT['Portrait_' + id] = { width: 128, height: 128, inputs: { selected: 'bool' }, scenarios: [{ selected: false }, { selected: true }, { selected: false }] };
  CONTRACT['Kart_' + id] = {
    width: 96, height: 96, inputs: { steer: 'number', boost: 'bool', view: 'number' },
    scenarios: [{ steer: 0 }, { steer: -1, boost: true, view: 1 }, { steer: 1, view: 2 }, { view: 3 }, { steer: 0.5, boost: false, view: 4 }, { view: 0 }],
  };
}
for (const id of ITEM_IDS) CONTRACT['Item_' + id] = { width: 64, height: 64, inputs: {} };

// Track props (bottom-centre anchored; ItemPanel fills its artboard)
Object.assign(CONTRACT, {
  ItemPanel: { width: 64, height: 64, inputs: {} },
  Pipe: { width: 64, height: 96, inputs: {} },
  Thwomp: { width: 64, height: 72, inputs: { slam: 'bool' }, scenarios: [{ slam: false }, { slam: true }, { slam: false }] },
  Tree: { width: 64, height: 96, inputs: {} },
  Bush: { width: 64, height: 40, inputs: {} },
  Palm: { width: 64, height: 112, inputs: {} },
  DeadTree: { width: 64, height: 96, inputs: {} },
  Mole: { width: 48, height: 48, inputs: {} },
});

// HUD (MK8 style)
export const GLYPH_ARTBOARDS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => 'Glyph_' + c)
  .concat(['colon', 'quote', 'apos', 'slash', 'dot', 'x', 'dash', 'excl', 'qmark'].map((n) => 'Glyph_' + n));
for (const g of GLYPH_ARTBOARDS) CONTRACT[g] = { height: 64, inputs: {} };
for (let n = 1; n <= 8; n++) CONTRACT['Place_' + n] = { width: 160, height: 110, inputs: { pop: 'trigger' }, scenarios: [{}, { pop: true }, {}, { pop: true }] };
Object.assign(CONTRACT, {
  ItemSlot: { width: 120, height: 120, inputs: {} },
  Banner: { width: 1024, height: 160, inputs: {} },
  Lap: { width: 140, height: 60, inputs: {} },
});

// 3D-world live textures
CONTRACT.TurnSign = { width: 256, height: 160, inputs: { dir: 'number' }, scenarios: [{ dir: 1 }, { dir: -1 }, { dir: 1 }] };
CONTRACT.Crowd = { width: 512, height: 128, inputs: {} };
Object.assign(CONTRACT, {
  Cloud: { width: 256, height: 128, inputs: {} },
  AdBoard_1: { width: 320, height: 120, inputs: {} }, AdBoard_2: { width: 320, height: 120, inputs: {} },
  AdBoard_3: { width: 320, height: 120, inputs: {} }, AdBoard_4: { width: 320, height: 120, inputs: {} },
  Flag: { width: 64, height: 160, inputs: {} },
  Lamp: { width: 64, height: 200, inputs: {} },
  Cactus: { width: 64, height: 112, inputs: {} },
  Boo: { width: 96, height: 96, inputs: {} },
  Piranha: { width: 64, height: 128, inputs: {} },
  Penguin: { width: 64, height: 80, inputs: {} },
  IceBlock: { width: 96, height: 96, inputs: {} },
});
for (const id of CHAR_IDS) CONTRACT['Face_' + id] = { width: 256, height: 256, inputs: { mood: 'number' }, scenarios: [{ mood: 0 }, { mood: 1 }, { mood: 2 }, { mood: 3 }, { mood: 0 }] };
