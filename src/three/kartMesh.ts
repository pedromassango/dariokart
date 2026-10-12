import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { CharacterDef } from '../game/characters';
import { tex } from './textures';

/**
 * Procedural 3D kart + driver, Mario Kart 8 "toy" style.
 * Local space: +x forward, +y up, +z right. 1 unit = 1 game world unit.
 */
export interface KartRig {
  root: THREE.Group; // positioned/rotated by the game
  body: THREE.Group; // bounces / rolls
  frontPivots: THREE.Object3D[]; // steer
  wheels: THREE.Object3D[]; // spin
  driver: THREE.Group;
  head: THREE.Group;
  flames: THREE.Mesh[];
  paint: THREE.MeshStandardMaterial[]; // tinted for the star effect
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; ei?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.55}|${opts.metal ?? 0}|${opts.emissive ?? ''}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0 });
    if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
    mats.set(key, m);
  }
  return m;
}

const geo = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  hemi: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 12),
  torus: new THREE.TorusGeometry(1, 0.16, 10, 28),
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 14),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}

function rbox(w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** capsule limb between two points */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b);
  const o = new THREE.Mesh(geo.capsule, m);
  // capsule geometry: radius 1, length 1 → 3 units tall along y
  o.scale.set(r, len / 3 + 0.01, r);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  o.castShadow = true;
  return o;
}

export function buildKart(c: CharacterDef): KartRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paintMat = new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.32, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: c.trim, roughness: 0.45, metalness: 0.1 });
  const dark = mat('#26262e', { rough: 0.7 });
  const chrome = mat('#d8dce4', { rough: 0.18, metal: 0.95 });
  const rubber = mat('#1b1b1f', { rough: 0.9 });
  const white = mat('#f6f6f6', { rough: 0.5 });

  // --- chassis
  body.add(rbox(9.6, 2.0, 6.2, 0.8, paintMat, 0, 2.2, 0));
  body.add(rbox(3.4, 1.4, 5.0, 0.6, paintMat, 5.4, 1.9, 0));
  body.add(rbox(1.2, 1.0, 7.2, 0.45, chrome, 7.0, 1.6, 0)); // front bumper
  for (const s of [-1, 1]) body.add(rbox(6.4, 1.4, 1.2, 0.5, trimMat, -0.4, 2.0, s * 3.5)); // side pods
  body.add(rbox(3.0, 2.6, 4.6, 0.6, paintMat, -4.6, 3.0, 0)); // engine cover
  body.add(rbox(1.0, 1.6, 3.4, 0.3, chrome, -6.0, 2.8, 0)); // engine grille
  // rear wing
  for (const s of [-1, 1]) body.add(rbox(0.6, 2.6, 0.5, 0.2, dark, -5.8, 4.6, s * 2.4));
  body.add(rbox(2.2, 0.5, 7.0, 0.25, trimMat, -6.0, 6.0, 0));
  // tail lights
  for (const s of [-1, 1]) body.add(mesh(geo.sphere, mat('#ff3030', { emissive: '#ff2020', ei: 0.8 }), -6.15, 2.6, s * 2.6, 0.35, 0.35, 0.35));
  for (const s of [-1, 1]) {
    const ex = mesh(geo.cyl, chrome, -6.3, 3.4, s * 1.4, 0.45, 2.4, 0.45);
    ex.rotation.z = Math.PI / 2 + 0.25;
    body.add(ex);
  }
  // number plate with emblem
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: tex.emblem(c.letter, c.color), roughness: 0.4 }));
  plate.position.set(7.1, 2.65, 0);
  plate.rotation.y = Math.PI / 2;
  plate.rotation.x = 0;
  body.add(plate);
  // seat
  body.add(rbox(2.0, 3.6, 4.4, 0.7, trimMat, -2.9, 4.0, 0));
  // steering wheel
  const sw = mesh(geo.torus, dark, 1.6, 5.1, 0, 1.15);
  sw.rotation.y = Math.PI / 2; sw.rotation.x = 0; sw.rotation.z = 0.5;
  body.add(sw);
  const col = mesh(geo.cyl, dark, 2.4, 4.2, 0, 0.25, 2.2, 0.25);
  col.rotation.z = 0.9;
  body.add(col);

  // --- wheels
  const frontPivots: THREE.Object3D[] = [];
  const wheels: THREE.Object3D[] = [];
  const wheel = (x: number, z: number, r: number, w: number, front: boolean) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, r * 0.34, 14, 28), rubber);
    tire.scale.set(1, 1, w / (r * 0.68));
    tire.castShadow = true;
    const side = mesh(geo.cyl, rubber, 0, 0, 0, r * 0.72, w * 0.9, r * 0.72);
    side.rotation.x = Math.PI / 2;
    spin.add(side);
    const rim = mesh(geo.cyl, chrome, 0, 0, Math.sign(z) * 0.05, r * 0.55, w * 1.02, r * 0.55);
    rim.rotation.x = Math.PI / 2;
    const hub = mesh(geo.cyl, paintMat, 0, 0, Math.sign(z) * 0.1, r * 0.25, w * 1.04, r * 0.25);
    hub.rotation.x = Math.PI / 2;
    // tread blocks so spinning reads
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tb = mesh(geo.cyl, dark, Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93, 0, 0.13, w * 0.75, 0.13);
      tb.rotation.x = Math.PI / 2;
      spin.add(tb);
    }
    spin.add(tire, rim, hub);
    pivot.add(spin);
    body.add(pivot);
    wheels.push(spin);
    if (front) frontPivots.push(pivot);
  };
  wheel(4.0, -3.9, 1.6, 1.5, true);
  wheel(4.0, 3.9, 1.6, 1.5, true);
  wheel(-3.7, -4.1, 2.0, 1.9, false);
  wheel(-3.7, 4.1, 2.0, 1.9, false);

  // --- boost flames
  const flames: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb030', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(geo.cone, flameMat);
    f.position.set(-8.0, 3.8, s * 1.4);
    f.rotation.z = Math.PI / 2 + 0.25;
    f.scale.set(0.6, 2.4, 0.6);
    f.visible = false;
    body.add(f);
    flames.push(f);
  }

  // --- driver
  const driver = new THREE.Group();
  driver.position.set(-1.6, 3.4, 0);
  body.add(driver);
  const skin = mat(c.skin, { rough: 0.6 });
  const shirt = mat(c.id === 'bowzer' || c.id === 'koopo' || c.id === 'yoshio' ? c.skin : c.color, { rough: 0.6 });
  const overalls = mat(c.id === 'pearl' ? '#ff8ccc' : c.trim, { rough: 0.6 });
  driver.add(mesh(geo.sphere, overalls, 0, 1.9, 0, 1.9, 2.0, 1.9)); // torso
  driver.add(mesh(geo.sphere, shirt, 0.1, 3.1, 0, 1.6, 1.0, 1.7)); // chest
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Vector3(0.2, 3.1, s * 1.7);
    const hand = new THREE.Vector3(3.1, 2.0, s * 1.05);
    driver.add(limb(shoulder, hand, 0.55, shirt));
    driver.add(mesh(geo.sphere, c.id === 'bowzer' || c.id === 'donkeyjr' ? skin : white, hand.x, hand.y, hand.z, 0.62));
  }
  if (c.id === 'bowzer' || c.id === 'koopo') {
    // shell on the back
    const shellCol = c.id === 'bowzer' ? '#2a8a30' : '#2fae3c';
    const shell = mesh(geo.hemi, mat(shellCol, { rough: 0.4 }), -1.5, 2.4, 0, 2.6, 2.2, 2.4);
    shell.rotation.z = Math.PI / 2;
    driver.add(shell);
    const rim = mesh(geo.torus, white, -1.4, 2.4, 0, 2.5, 2.5, 2.5);
    rim.rotation.y = Math.PI / 2;
    driver.add(rim);
    if (c.id === 'bowzer') {
      for (const [y, z] of [[3.4, 0], [1.8, 1.2], [1.8, -1.2], [3.0, 1.4], [3.0, -1.4]]) {
        const sp = mesh(geo.cone, white, -3.8, y, z, 0.5, 1.1, 0.5);
        sp.rotation.z = Math.PI / 2;
        driver.add(sp);
      }
    }
  }

  // --- head
  const head = new THREE.Group();
  head.position.set(0.4, 5.6, 0);
  driver.add(head);
  buildHead(head, c, skin);

  // shadow receive/cast for all
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; } });
  return { root, body, frontPivots, wheels, driver, head, flames, paint: [paintMat, trimMat] };
}

function buildHead(head: THREE.Group, c: CharacterDef, skin: THREE.Material) {
  const white = mat('#ffffff', { rough: 0.3 });
  const pupil = mat('#1a2a6a', { rough: 0.2 });
  const iris = mat('#2f7fe0', { rough: 0.2 });
  const big = c.id === 'bowzer' || c.id === 'donkeyjr';
  const R = big ? 2.4 : 2.1;
  const eyes = (x: number, y: number, spread: number, size: number) => {
    // MK-style big glossy eyes that sit proud of the face
    x += size * 0.25; size *= 1.25;
    for (const s of [-1, 1]) {
      head.add(mesh(geo.sphere, white, x, y, s * spread, size * 0.42, size, size * 0.6));
      head.add(mesh(geo.sphere, iris, x + size * 0.3, y - size * 0.08, s * spread, size * 0.18, size * 0.62, size * 0.42));
      head.add(mesh(geo.sphere, pupil, x + size * 0.4, y - size * 0.08, s * spread, size * 0.1, size * 0.4, size * 0.26));
      head.add(mesh(geo.sphere, white, x + size * 0.46, y + size * 0.22, s * spread - size * 0.1, size * 0.05, size * 0.14, size * 0.1)); // highlight
    }
  };
  switch (c.id) {
    case 'dario':
    case 'luigio': {
      const tall = c.id === 'luigio' ? 1.12 : 1;
      head.add(mesh(geo.sphere, skin, 0, 0, 0, R, R * tall, R));
      head.add(mesh(geo.sphere, mat('#ffb894', { rough: 0.5 }), R * 0.98, -0.25, 0, 0.75)); // nose
      eyes(R * 0.8, 0.3, 0.6, 0.66);
      const stache = mat('#2c1608', { rough: 0.8 });
      for (const s of [-1, 1]) {
        const m = mesh(geo.sphere, stache, R * 0.86, -0.85, s * 0.6, 0.45, 0.4, 0.85);
        m.rotation.x = s * 0.35;
        head.add(m);
      }
      for (const s of [-1, 1]) head.add(mesh(geo.sphere, skin, -0.1, 0, s * R, 0.45, 0.6, 0.3)); // ears
      head.add(mesh(geo.sphere, mat('#4a2810', { rough: 0.9 }), -0.9, -0.7, 0, R * 0.7, R * 0.55, R * 0.85)); // hair back
      const hat = mat(c.hat, { rough: 0.45 });
      head.add(mesh(geo.hemi, hat, -0.1, 0.75 * tall, 0, R * 1.08, R * 0.9, R * 1.08));
      const brim = mesh(geo.cyl, hat, R * 0.85, 0.95 * tall, 0, 1.5, 0.22, 1.9);
      brim.scale.set(1.5, 0.22, 1.9);
      head.add(brim);
      const em = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshStandardMaterial({ map: tex.emblem(c.letter, c.hat), roughness: 0.4 }));
      // sit on the cap's front surface (~35° up); head matrices are identity here, so lookAt is head-local
      const capR = R * 1.08, a = 0.6;
      em.position.set(-0.1 + Math.cos(a) * capR * 1.01, 0.75 * tall + Math.sin(a) * capR * 0.9 * 1.01, 0);
      em.lookAt(em.position.clone().add(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)));
      head.add(em);
      break;
    }
    case 'pearl': {
      head.add(mesh(geo.sphere, mat('#ffd040', { rough: 0.35 }), -0.5, 0.1, 0, R * 1.12, R * 1.15, R * 1.12)); // hair
      head.add(mesh(geo.sphere, mat('#ffd040', { rough: 0.35 }), -1.6, -1.6, 0, 1.6, 2.4, 1.9)); // ponytail
      head.add(mesh(geo.sphere, skin, 0.35, -0.1, 0, R * 0.95));
      eyes(R * 0.85, 0.35, 0.6, 0.75);
      head.add(mesh(geo.sphere, mat('#ff6a8a'), R * 1.12, -0.85, 0, 0.18, 0.18, 0.45)); // lips
      const gold = mat('#ffd23f', { rough: 0.2, metal: 0.8 });
      head.add(mesh(geo.cyl, gold, 0, 2.3, 0, 0.9, 0.7, 0.9));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        head.add(mesh(geo.cone, gold, Math.cos(a) * 0.75, 2.95, Math.sin(a) * 0.75, 0.22, 0.6, 0.22));
      }
      head.add(mesh(geo.sphere, mat('#40a0ff', { rough: 0.1, metal: 0.3 }), 0.9, 2.3, 0, 0.22));
      break;
    }
    case 'toadie': {
      head.add(mesh(geo.sphere, skin, 0.2, -0.5, 0, R * 0.95));
      eyes(R * 0.75, -0.2, 0.55, 0.75);
      head.add(mesh(geo.sphere, mat('#7a2020'), R * 0.95, -1.3, 0, 0.2, 0.25, 0.45)); // mouth
      const cap = mat('#ffffff', { rough: 0.4 });
      head.add(mesh(geo.sphere, cap, -0.2, 1.4, 0, 3.4, 2.4, 3.4));
      const spot = mat('#e02424', { rough: 0.4 });
      for (const [th, ph, s] of [[0, 0.5, 1.0], [Math.PI, 0.6, 1.0], [Math.PI / 2, 0.5, 0.9], [-Math.PI / 2, 0.5, 0.9], [0, 1.3, 0.8]] as [number, number, number][]) {
        const x = Math.cos(th) * Math.cos(ph) * 3.35 - 0.2, z = Math.sin(th) * Math.cos(ph) * 3.35, y = 1.4 + Math.sin(ph) * 2.35;
        const sp = mesh(geo.sphere, spot, x, y, z, s * 0.9, s * 0.5, s * 0.9);
        sp.lookAt(new THREE.Vector3(x * 2, y * 2 - 1.4, z * 2));
        sp.scale.set(s * 0.95, s * 0.95, 0.3);
        head.add(sp);
      }
      break;
    }
    case 'yoshio': {
      const g = mat(c.skin, { rough: 0.45 });
      head.add(mesh(geo.sphere, g, -0.2, 0.3, 0, R * 1.05, R * 1.1, R));
      head.add(mesh(geo.sphere, g, R * 0.95, -0.35, 0, 1.9, 1.5, 1.7)); // snout
      for (const s of [-1, 1]) head.add(mesh(geo.sphere, mat('#1a3a10'), R * 1.85, 0.15, s * 0.45, 0.18, 0.25, 0.18)); // nostrils
      head.add(mesh(geo.sphere, white, R * 0.55, -0.95, 0, 1.4, 0.8, 1.4)); // cheeks
      eyes(0.6, 2.0, 0.75, 1.0);
      for (let i = 0; i < 3; i++) head.add(mesh(geo.cone, mat('#e83020'), -1.6 - i * 0.6, 1.9 - i * 0.9, 0, 0.35, 0.8, 0.35));
      break;
    }
    case 'bowzer': {
      head.add(mesh(geo.sphere, skin, 0, 0, 0, R, R * 0.95, R));
      head.add(mesh(geo.sphere, mat('#f6e0a0'), R * 0.8, -0.8, 0, 1.6, 1.0, 1.8)); // jaw
      for (const s of [-1, 1]) head.add(mesh(geo.cone, white, R * 1.2, -0.65, s * 0.7, 0.15, 0.4, 0.15)); // fangs
      eyes(R * 0.72, 0.6, 0.75, 0.75);
      const brow = mat('#d03010');
      for (const s of [-1, 1]) { const b = mesh(geo.sphere, brow, R * 0.82, 1.25, s * 0.75, 0.35, 0.22, 0.6); b.rotation.x = s * -0.4; head.add(b); }
      for (let i = 0; i < 5; i++) head.add(mesh(geo.cone, mat('#e8501a'), -0.6 - i * 0.2, 2.1 + Math.sin(i) * 0.3, (i - 2) * 0.55, 0.45, 1.6, 0.45));
      for (const s of [-1, 1]) { const h = mesh(geo.cone, white, 0, 2.0, s * 1.8, 0.45, 1.6, 0.45); h.rotation.x = s * 0.6; head.add(h); }
      break;
    }
    case 'donkeyjr': {
      head.add(mesh(geo.sphere, mat('#7a4a22', { rough: 0.8 }), 0, 0, 0, R, R, R));
      head.add(mesh(geo.sphere, skin, R * 0.72, -0.45, 0, 1.4, 1.2, 1.6)); // muzzle
      head.add(mesh(geo.sphere, skin, R * 0.55, 0.55, 0, 0.9, 0.8, 1.5)); // face
      eyes(R * 0.85, 0.55, 0.55, 0.65);
      for (const s of [-1, 1]) head.add(mesh(geo.sphere, skin, -0.2, 0.2, s * R * 1.02, 0.4, 0.8, 0.55)); // ears
      head.add(mesh(geo.cone, mat('#7a4a22', { rough: 0.8 }), 0.3, 2.3, 0, 0.5, 0.9, 0.5)); // tuft
      break;
    }
    case 'koopo': {
      head.add(mesh(geo.sphere, skin, 0, 0.3, 0, R, R * 1.15, R));
      head.add(mesh(geo.sphere, skin, R * 0.85, -0.4, 0, 1.3, 1.0, 1.3)); // beak
      eyes(R * 0.7, 1.0, 0.6, 0.85);
      break;
    }
  }
}

/** Builds simple 3D item meshes (banana, shells). */
export function buildItemMesh(type: 'banana' | 'greenShell' | 'redShell'): THREE.Object3D {
  const g = new THREE.Group();
  if (type === 'banana') {
    const m = mat('#ffd82a', { rough: 0.4 });
    const peel = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.75, 10, 18, Math.PI * 0.9), m);
    peel.rotation.z = Math.PI * 1.05;
    peel.position.y = 2.6;
    g.add(peel);
    g.add(mesh(geo.cyl, mat('#5a3a12'), 2.0, 3.0, 0, 0.25, 0.8, 0.25));
  } else {
    const col = type === 'greenShell' ? '#22b040' : '#e02626';
    g.add(mesh(geo.hemi, mat(col, { rough: 0.25, metal: 0.1 }), 0, 0.9, 0, 2.2, 2.0, 2.2));
    g.add(mesh(geo.cyl, mat('#ffffff', { rough: 0.4 }), 0, 0.7, 0, 2.3, 0.6, 2.3));
    g.add(mesh(geo.cyl, mat('#f0d090', { rough: 0.6 }), 0, 0.3, 0, 2.0, 0.4, 2.0));
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}

export { mat as sharedMat };
