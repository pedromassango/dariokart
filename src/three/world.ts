import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Race } from '../game/race';
import type { Kart } from '../game/kart';
import type { Track } from '../game/track';
import { wrapAngle, mulberry32 } from '../game/util';
import { hashStr } from '../game/track';
import { buildKart, buildItemMesh, sharedMat, type KartRig } from './kartMesh';
import { tex } from './textures';
import type { RiveTexture } from './riveTexture';

/** game (x, y, z-up) → three (x, y-up, z) */
const V = (x: number, y: number, h = 0) => new THREE.Vector3(x, h, y);

interface Look {
  sky: 'day' | 'sunset' | 'night' | 'space' | 'lava';
  fog: string; fogNear: number; fogFar: number;
  hemiSky: string; hemiGround: string; sun: number;
  road: () => THREE.Texture; roadColor: string; roadEmissive?: boolean;
  band: () => THREE.Texture; bandColor: string;
  ground: (() => THREE.Texture) | null; groundColor: string; groundY: number; groundEmissive?: boolean;
  lines: boolean;
  slab: boolean; // road is a raised slab over void/water/lava
  curbA: string; curbB: string;
  hills: string | null;
}

const LOOKS: Record<string, Look> = {
  circuit: { sky: 'day', fog: '#bfe3ff', fogNear: 500, fogFar: 2600, hemiSky: '#cfe8ff', hemiGround: '#4a7a3a', sun: 2.6, road: tex.asphalt, roadColor: '#ffffff', band: () => tex.grass('#5cbc44'), bandColor: '#ffffff', ground: () => tex.grass('#4aa83a'), groundColor: '#ffffff', groundY: -0.05, lines: true, slab: false, curbA: '#f4f4f4', curbB: '#e02424', hills: '#5aa848' },
  plains: { sky: 'day', fog: '#d4f0ff', fogNear: 500, fogFar: 2600, hemiSky: '#d8f0ff', hemiGround: '#5a8a3a', sun: 2.5, road: tex.dirt, roadColor: '#ffffff', band: () => tex.grass('#6ccc4c'), bandColor: '#ffffff', ground: () => tex.grass('#58b840'), groundColor: '#ffffff', groundY: -0.05, lines: false, slab: false, curbA: '#8a5a2a', curbB: '#b07838', hills: '#68b850' },
  ghost: { sky: 'night', fog: '#2a1a40', fogNear: 120, fogFar: 1100, hemiSky: '#8070c0', hemiGround: '#100818', sun: 0.9, road: tex.planks, roadColor: '#ffffff', band: tex.planks, bandColor: '#888888', ground: tex.stone, groundColor: '#2a2038', groundY: -60, lines: false, slab: true, curbA: '#4a3420', curbB: '#5a4028', hills: '#1a1028' },
  beach: { sky: 'day', fog: '#cdefff', fogNear: 600, fogFar: 3000, hemiSky: '#d0f0ff', hemiGround: '#d8c890', sun: 2.8, road: tex.sand, roadColor: '#ffffff', band: tex.sand, bandColor: '#b8e8e0', ground: tex.water, groundColor: '#ffffff', groundY: -1.2, lines: false, slab: false, curbA: '#fff4d0', curbB: '#e8cc88', hills: '#58a048' },
  castle: { sky: 'lava', fog: '#5a1a0a', fogNear: 200, fogFar: 1500, hemiSky: '#ff9060', hemiGround: '#401010', sun: 1.6, road: tex.bricks, roadColor: '#ffffff', band: tex.bricks, bandColor: '#999999', ground: tex.lava, groundColor: '#ffffff', groundY: -10, groundEmissive: true, lines: false, slab: true, curbA: '#b8b0c0', curbB: '#585060', hills: '#2a1414' },
  rainbow: { sky: 'space', fog: '#000010', fogNear: 900, fogFar: 4000, hemiSky: '#a0a0ff', hemiGround: '#200040', sun: 1.4, road: tex.rainbow, roadColor: '#ffffff', roadEmissive: true, band: tex.rainbow, bandColor: '#ffffff', ground: null, groundColor: '#000000', groundY: -200, lines: false, slab: true, curbA: '#ffffff', curbB: '#ffe040', hills: null },
};

export class ChaseCam {
  cam: THREE.PerspectiveCamera;
  heading = 0;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;
  fovBoost = 0;

  constructor() {
    this.cam = new THREE.PerspectiveCamera(68, 16 / 9, 0.5, 6000);
  }

  follow(k: Kart, dt: number, intro: number | null) {
    const target = k.heading + (k.drift !== 0 ? k.drift * 0.22 : 0);
    if (!this.init) { this.heading = target; this.init = true; }
    else this.heading = wrapAngle(this.heading + wrapAngle(target - this.heading) * Math.min(1, dt * 6));
    let h = this.heading, dist = 30, height = 11;
    if (intro !== null) {
      const e = 1 - Math.pow(1 - Math.min(1, intro), 3);
      h = this.heading + Math.PI * (1 - e) * 1.2;
      dist = 30 + 50 * (1 - e);
      height = 11 + 22 * (1 - e);
    }
    const kz = Math.max(-30, k.z);
    const want = V(k.x - Math.cos(h) * dist, k.y - Math.sin(h) * dist, kz * 0.6 + height);
    const look = V(k.x + Math.cos(h) * 12, k.y + Math.sin(h) * 12, kz * 0.6 + 4);
    if (k.fallTimer > 1.3) { want.copy(this.pos); }
    const a = intro !== null ? 1 : Math.min(1, dt * 10);
    if (this.pos.lengthSq() === 0) { this.pos.copy(want); this.look.copy(look); }
    this.pos.lerp(want, a);
    this.look.lerp(look, Math.min(1, dt * 14));
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    const fov = 68 + this.fovBoost * 10;
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 5); this.cam.updateProjectionMatrix(); }
  }
}

let envTex: THREE.Texture | null = null;

interface Spark { sprite: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; grow: number }

export class World3D {
  readonly scene = new THREE.Scene();
  readonly race: Race;
  private karts = new Map<string, KartRig>();
  private items = new Map<string, THREE.Object3D>();
  private boxes: THREE.Object3D[] = [];
  private coins: THREE.Object3D[] = [];
  private dashTex: THREE.Texture[] = [];
  private sun: THREE.DirectionalLight;
  private sparks: Spark[] = [];
  private sparkPool: THREE.Sprite[] = [];
  private glowTex = tex.glow();
  private lavaTex: THREE.Texture | null = null;
  private waterTex: THREE.Texture | null = null;
  private thwomps: THREE.Object3D[] = [];
  private look: Look;

  constructor(race: Race, riveTex: { itemBox: RiveTexture | null; banner: RiveTexture | null; thwomp: RiveTexture | null }) {
    this.race = race;
    const tr = race.track;
    const look = (this.look = LOOKS[tr.def.id] ?? LOOKS.circuit);
    const scene = this.scene;
    scene.fog = new THREE.Fog(look.fog, look.fogNear, look.fogFar);
    this.buildSky(look);

    // lights
    scene.add(new THREE.HemisphereLight(look.hemiSky, look.hemiGround, 1.1));
    const sun = new THREE.DirectionalLight('#fff4e0', look.sun);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    sun.shadow.bias = -0.0008;
    scene.add(sun, sun.target);
    this.sun = sun;

    this.buildGround(look, tr);
    this.buildTrack(look, tr);
    this.buildScenery(look, tr);
    this.buildPickups(tr, riveTex);
    this.buildStartGate(tr, riveTex.banner);
    for (const k of race.karts) {
      const rig = buildKart(k.char);
      this.karts.set(k.id, rig);
      scene.add(rig.root);
    }
    // spark sprites pool
    for (let i = 0; i < 260; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      scene.add(s);
      this.sparkPool.push(s);
    }
  }

  // ------------------------------------------------------------------ build
  private buildSky(look: Look) {
    if (look.sky === 'day' || look.sky === 'sunset') {
      const sky = new Sky();
      sky.scale.setScalar(5000);
      const u = sky.material.uniforms;
      u.turbidity.value = 2.2; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(140)));
      this.scene.add(sky);
      // puffy clouds
      const rnd = mulberry32(7);
      const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35, fog: false });
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 18; i++) {
        const a = rnd() * Math.PI * 2, r = 1700 + rnd() * 600, y = 260 + rnd() * 220;
        for (let j = 0; j < 5; j++) {
          const g = new THREE.SphereGeometry(40 + rnd() * 50, 10, 8);
          g.scale(1.6, 0.8, 1.2);
          g.translate(512 + Math.cos(a) * r + (j - 2) * 60, y + rnd() * 25, 512 + Math.sin(a) * r + rnd() * 40);
          parts.push(g);
        }
      }
      this.scene.add(new THREE.Mesh(mergeGeometries(parts), cloudMat));
    } else {
      const t = tex.stars();
      const col = look.sky === 'lava' ? '#ff7040' : look.sky === 'night' ? '#b8a0ff' : '#ffffff';
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(4500, 32, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, color: col }));
      sphere.position.set(512, 0, 512);
      this.scene.add(sphere);
      if (look.sky === 'lava') this.scene.background = new THREE.Color('#3a0c06');
      if (look.sky === 'night') {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4c8', fog: false }));
        moon.position.set(-1200, 900, -1600);
        this.scene.add(moon);
      }
      if (look.sky === 'space') {
        const planet = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 20), new THREE.MeshStandardMaterial({ color: '#b060ff', emissive: '#401060', fog: false }));
        planet.position.set(2400, 600, -1800);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(620, 40, 2, 80), new THREE.MeshBasicMaterial({ color: '#ffd060', fog: false }));
        ring.position.copy(planet.position); ring.rotation.x = 1.2;
        this.scene.add(planet, ring);
      }
    }
  }

  private buildGround(look: Look, tr: Track) {
    if (!look.ground) return;
    const t = look.ground().clone();
    t.needsUpdate = true;
    t.repeat.set(60, 60);
    const m = new THREE.MeshStandardMaterial({ map: t, color: look.groundColor, roughness: 0.95 });
    if (look.groundEmissive) { m.emissive = new THREE.Color('#ff4010'); m.emissiveMap = t; m.emissiveIntensity = 0.9; this.lavaTex = t; }
    if (tr.def.id === 'beach') { this.waterTex = t; m.roughness = 0.2; m.metalness = 0.1; m.transparent = true; m.opacity = 0.92; }
    const g = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(512, look.groundY, 512);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (tr.def.id === 'beach') {
      // sandy sea floor slightly visible + shallow lagoon under the shoulders
      const floor = new THREE.Mesh(g.clone(), new THREE.MeshStandardMaterial({ color: '#0a3a7a', roughness: 1 }));
      floor.position.set(512, -8, 512);
      this.scene.add(floor);
    }
  }

  /** ribbon between two lateral offsets along the centerline */
  private ribbon(tr: Track, l0: number, l1: number, y: number, vScale: number, uSpan: number): THREE.BufferGeometry {
    const n = tr.n;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let v = 0;
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      if (i > 0) {
        const p = (i - 1) % n;
        v += Math.hypot(tr.x[k] - tr.x[p], tr.y[k] - tr.y[p]) / vScale;
      }
      const ax = tr.x[k] + tr.nx[k] * l0, ay = tr.y[k] + tr.ny[k] * l0;
      const bx = tr.x[k] + tr.nx[k] * l1, by = tr.y[k] + tr.ny[k] * l1;
      pos.push(ax, y, ay, bx, y, by);
      uv.push(0, v, uSpan, v);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // ensure normals point up regardless of winding
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    return g;
  }

  /** vertical skirt along a lateral offset (walls, slab sides) */
  private skirt(tr: Track, lat: number, y0: number, y1: number, step = 1, vScale = 20): THREE.BufferGeometry {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let v = 0, c = 0;
    for (let i = 0; i <= tr.n; i += step) {
      const k = i % tr.n;
      if (i > 0) { const p = (i - step) % tr.n; v += Math.hypot(tr.x[k] - tr.x[p], tr.y[k] - tr.y[p]) / vScale; }
      const x = tr.x[k] + tr.nx[k] * lat, z = tr.y[k] + tr.ny[k] * lat;
      pos.push(x, y0, z, x, y1, z);
      uv.push(v, 0, v, 1);
      if (i + step <= tr.n) { const a = c * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      c++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private buildTrack(look: Look, tr: Track) {
    const th = tr.def.theme;
    const hw = tr.halfW, cw = th.curbWidth;
    const bandW = th.edge === 'fall' ? th.offroadWidth : 46;
    const scene = this.scene;
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => { const o = new THREE.Mesh(g, m); o.receiveShadow = shadow; scene.add(o); return o; };

    // shoulders / band
    if (bandW > 0) {
      const t = look.band().clone(); t.needsUpdate = true;
      const bm = new THREE.MeshStandardMaterial({ map: t, color: look.bandColor, roughness: 0.95 });
      if (tr.def.id === 'beach') { bm.color = new THREE.Color('#9ae0e0'); }
      add(this.ribbon(tr, -(hw + cw + bandW), -(hw + cw) + 0.5, 0.02, 40, bandW / 40), bm);
      add(this.ribbon(tr, hw + cw - 0.5, hw + cw + bandW, 0.02, 40, bandW / 40), bm);
    }
    // road
    const rt = look.road().clone(); rt.needsUpdate = true;
    const rm = new THREE.MeshStandardMaterial({ map: rt, color: look.roadColor, roughness: tr.def.id === 'rainbow' ? 0.3 : 0.85 });
    if (look.roadEmissive) { rm.emissive = new THREE.Color('#ffffff'); rm.emissiveMap = rt; rm.emissiveIntensity = 0.55; rm.transparent = true; rm.opacity = 0.92; }
    const across = tr.def.id === 'rainbow' ? 1 : (hw * 2) / 36;
    add(this.ribbon(tr, -hw, hw, 0.06, tr.def.id === 'rainbow' ? 60 : 36, across), rm);

    // curbs (raised stripes)
    const ct = tex.curb(look.curbA, look.curbB).clone(); ct.needsUpdate = true;
    const cm = new THREE.MeshStandardMaterial({ map: ct, roughness: 0.6 });
    add(this.ribbon(tr, -hw - cw, -hw, 0.22, 16, 1), cm);
    add(this.ribbon(tr, hw, hw + cw, 0.22, 16, 1), cm);

    // MK-style yellow edge lines + white dashes
    if (look.lines) {
      const yel = new THREE.MeshStandardMaterial({ color: '#ffcc1a', roughness: 0.6 });
      add(this.ribbon(tr, -hw + 1.5, -hw + 3.0, 0.1, 50, 1), yel);
      add(this.ribbon(tr, hw - 3.0, hw - 1.5, 0.1, 50, 1), yel);
      const dashParts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < tr.n; i += 6) {
        for (const lat of [-hw / 3, hw / 3]) {
          const j = (i + 3) % tr.n;
          const g = new THREE.BufferGeometry();
          const a = V(tr.x[i] + tr.nx[i] * (lat - 0.7), tr.y[i] + tr.ny[i] * (lat - 0.7), 0.1);
          const b = V(tr.x[i] + tr.nx[i] * (lat + 0.7), tr.y[i] + tr.ny[i] * (lat + 0.7), 0.1);
          const c = V(tr.x[j] + tr.nx[j] * (lat + 0.7), tr.y[j] + tr.ny[j] * (lat + 0.7), 0.1);
          const d = V(tr.x[j] + tr.nx[j] * (lat - 0.7), tr.y[j] + tr.ny[j] * (lat - 0.7), 0.1);
          g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap((p) => [p.x, p.y, p.z]), 3));
          g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(18).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
          dashParts.push(g);
        }
      }
      add(mergeGeometries(dashParts), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.6, side: THREE.DoubleSide }));
    }

    // slab sides (courses suspended over void / lava)
    if (look.slab) {
      const outer = hw + cw + (th.edge === 'fall' ? th.offroadWidth : 0);
      const sideMat = tr.def.id === 'rainbow'
        ? new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#a080ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ map: (tr.def.id === 'ghost' ? tex.planks() : tex.stone()), color: tr.def.id === 'ghost' ? '#8a7060' : '#9a909c', roughness: 0.9, side: THREE.DoubleSide });
      const depth = tr.def.id === 'castle' ? -12 : tr.def.id === 'ghost' ? -6 : -2.5;
      add(this.skirt(tr, -outer, depth, 0.22), sideMat);
      add(this.skirt(tr, outer, depth, 0.22), sideMat);
      if (tr.def.id === 'rainbow') {
        // glowing rails
        const rail = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        add(this.skirt(tr, -outer, 0.2, 1.4), rail, false);
        add(this.skirt(tr, outer, 0.2, 1.4), rail, false);
      }
      if (tr.def.id === 'ghost') {
        // wooden posts along the edge
        const parts: THREE.BufferGeometry[] = [];
        for (let i = 0; i < tr.n; i += 5) for (const s of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.7, 0.7, 7, 6);
          g.translate(tr.x[i] + tr.nx[i] * outer * s, 0.5, tr.y[i] + tr.ny[i] * outer * s);
          parts.push(g);
        }
        add(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 1 }));
      }
    }

    // barriers at the edge of walled courses
    if (th.edge === 'wall') {
      const lim = tr.halfW + th.curbWidth + th.offroadWidth;
      const wm = new THREE.MeshStandardMaterial({ map: tex.concrete(), roughness: 0.7 });
      (wm.map as THREE.Texture).repeat.set(1, 1);
      for (const s of [-1, 1]) {
        const g = this.skirt(tr, lim * s, 0, 3.2, 1, 10);
        // drop wall segments that intersect another part of the course
        const pos = g.getAttribute('position');
        const index = g.getIndex()!;
        const keep: number[] = [];
        for (let t = 0; t < index.count; t += 3) {
          const a = index.getX(t);
          const q = tr.query(pos.getX(a), pos.getZ(a));
          if (Math.abs(q.lateral) >= lim - 3) keep.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
        }
        g.setIndex(keep);
        const o = add(g, wm);
        o.castShadow = true;
        (o.material as THREE.Material).side = THREE.DoubleSide;
      }
    }

    // start line
    const st = new THREE.Mesh(new THREE.PlaneGeometry(10, hw * 2), new THREE.MeshStandardMaterial({ map: tex.checker(), roughness: 0.6 }));
    st.rotation.x = -Math.PI / 2;
    st.rotation.z = Math.atan2(tr.ty[0], tr.tx[0]) * -1;
    st.position.copy(V(tr.x[0], tr.y[0], 0.12));
    st.receiveShadow = true;
    scene.add(st);
    // grid markers
    const gm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
    for (let s = 0; s < 8; s++) {
      const g = tr.gridSlot(s);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 12), gm);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -g.heading;
      m.position.copy(V(g.x + Math.cos(g.heading) * 9, g.y + Math.sin(g.heading) * 9, 0.11));
      scene.add(m);
    }
    // dash panels
    for (const p of tr.dashPanels) {
      const t = tex.dash().clone(); t.needsUpdate = true; t.repeat.set(1, 2);
      this.dashTex.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 16), new THREE.MeshStandardMaterial({ map: t, emissive: '#ff8a00', emissiveMap: t, emissiveIntensity: 0.9 }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(p.dirY, p.dirX) - Math.PI / 2;
      m.position.copy(V(p.x, p.y, 0.14));
      scene.add(m);
    }
  }

  private buildScenery(look: Look, tr: Track) {
    const rnd = mulberry32(hashStr(tr.def.id + '3d'));
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = (m: THREE.Material, g: THREE.BufferGeometry) => { if (!byMat.has(m)) byMat.set(m, []); byMat.get(m)!.push(g); };
    const trunk = sharedMat('#7a4a22', { rough: 0.9 });
    const leaf = sharedMat('#2f9a3a', { rough: 0.8 });
    const leaf2 = sharedMat('#4cbc48', { rough: 0.8 });
    const darkWood = sharedMat('#2a1a2a', { rough: 1 });
    const rock = sharedMat('#3a2622', { rough: 1 });
    const palmLeaf = sharedMat('#2a9a3a', { rough: 0.8 });
    const ghostY = tr.def.id === 'ghost' ? -60 : 0;

    for (const d of tr.decos) {
      const s = d.scale * 1.6;
      const x = d.x, z = d.y;
      switch (d.kind) {
        case 'tree': {
          const t = new THREE.CylinderGeometry(1.2 * s, 1.6 * s, 10 * s, 7); t.translate(x, 5 * s, z); put(trunk, t);
          const c1 = new THREE.IcosahedronGeometry(7 * s, 1); c1.translate(x, 13 * s, z); put(leaf, c1);
          const c2 = new THREE.IcosahedronGeometry(5 * s, 1); c2.translate(x + 2 * s, 18 * s, z - 1 * s); put(leaf2, c2);
          break;
        }
        case 'bush': { const b = new THREE.IcosahedronGeometry(5 * s, 1); b.scale(1.4, 0.8, 1.2); b.translate(x, 2.5 * s, z); put(leaf2, b); break; }
        case 'post': { const p = new THREE.BoxGeometry(1.2, 7, 1.2); p.translate(x, 3.5, z); put(trunk, p); break; }
        case 'palm': {
          for (let i = 0; i < 6; i++) { const seg = new THREE.CylinderGeometry(1.0 * s, 1.2 * s, 4.2 * s, 7); seg.translate(x + i * i * 0.12 * s, 2.1 * s + i * 4 * s, z); put(trunk, seg); }
          const top = V(x + 3.6 * s, z, 24 * s);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            const lf = new THREE.ConeGeometry(2.2 * s, 14 * s, 4); lf.scale(1, 1, 0.25);
            lf.rotateZ(Math.PI / 2 + 0.5); lf.rotateY(a); lf.translate(top.x + Math.cos(a) * 6 * s, top.y - 2 * s, top.z - Math.sin(a) * 6 * s);
            put(palmLeaf, lf);
          }
          break;
        }
        case 'deadtree': {
          const h = 40 * s;
          const t = new THREE.CylinderGeometry(0.8 * s, 2.4 * s, h, 6); t.translate(x, ghostY + h / 2, z); put(darkWood, t);
          for (let i = 0; i < 4; i++) {
            const b = new THREE.CylinderGeometry(0.3 * s, 0.8 * s, 12 * s, 5);
            b.rotateZ((i % 2 ? 1 : -1) * 0.9); b.rotateY(i * 1.6);
            b.translate(x, ghostY + h * (0.65 + i * 0.08), z); put(darkWood, b);
          }
          break;
        }
        case 'lavarock': { const r = new THREE.DodecahedronGeometry(5 * s, 0); r.scale(1.3, 0.8, 1.1); r.translate(x, -9, z); put(rock, r); break; }
        case 'star': {
          const st = new THREE.OctahedronGeometry(1.2 * s, 0); st.translate(x, 70 + rnd() * 90, z); put(sharedMat('#fff080', { emissive: '#fff080', ei: 1.5 }), st);
          break;
        }
      }
    }
    for (const [m, gs] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), m);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // distant hills / mountains ring
    if (look.hills) {
      const parts: THREE.BufferGeometry[] = [];
      const cx = (tr.minX + tr.maxX) / 2, cz = (tr.minY + tr.maxY) / 2;
      const R = Math.max(tr.maxX - tr.minX, tr.maxY - tr.minY) * 0.5 + 500;
      const count = 26;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rnd() * 0.1;
        const r = R + rnd() * 400;
        const h = 120 + rnd() * 220;
        const g = tr.def.id === 'castle' ? new THREE.ConeGeometry(160 + rnd() * 120, h * 1.6, 6) : new THREE.SphereGeometry(220 + rnd() * 160, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        if (tr.def.id !== 'castle') g.scale(1.3, h / 260, 1);
        g.translate(cx + Math.cos(a) * r, tr.def.id === 'castle' ? h * 0.8 - 12 : look.groundY, cz + Math.sin(a) * r);
        parts.push(g);
      }
      const hm = new THREE.MeshStandardMaterial({ color: look.hills, roughness: 1, flatShading: tr.def.id === 'castle' || tr.def.id === 'ghost' });
      if (tr.def.id === 'castle') { hm.emissive = new THREE.Color('#401000'); }
      this.scene.add(new THREE.Mesh(mergeGeometries(parts), hm));
    }

    // obstacles: pipes / thwomps
    for (const o of tr.obstacles) {
      if (o.kind === 'pipe') {
        const g = new THREE.Group();
        const pm = new THREE.MeshStandardMaterial({ color: '#22b03a', roughness: 0.35, metalness: 0.1 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.95, o.r * 0.95, 14, 24), pm); body.position.y = 7;
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.2, o.r * 1.2, 4, 24), pm); rim.position.y = 15;
        const hole = new THREE.Mesh(new THREE.CircleGeometry(o.r * 0.95, 24), new THREE.MeshBasicMaterial({ color: '#06300c' })); hole.rotation.x = -Math.PI / 2; hole.position.y = 17.05;
        g.add(body, rim, hole);
        g.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        g.position.copy(V(o.x, o.y));
        this.scene.add(g);
      } else {
        const g = new THREE.Group();
        const box = new THREE.Mesh(new RoundedThwompGeo(o.r), new THREE.MeshStandardMaterial({ map: tex.stone(), color: '#a8a4b4', roughness: 0.8 }));
        box.position.y = 9;
        g.add(box);
        g.position.copy(V(o.x, o.y));
        g.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
        this.scene.add(g);
        this.thwomps.push(g);
      }
    }
  }

  private buildPickups(tr: Track, riveTex: { itemBox: RiveTexture | null; thwomp: RiveTexture | null }) {
    // item boxes: translucent rainbow cubes with an animated Rive "?" face texture
    const faceMap = riveTex.itemBox?.texture ?? null;
    const boxMat = new THREE.MeshStandardMaterial({ map: faceMap, emissive: '#ffffff', emissiveMap: faceMap, emissiveIntensity: 0.45, transparent: true, opacity: 0.88, roughness: 0.15, metalness: 0.1 });
    if (!faceMap) boxMat.color = new THREE.Color('#ffd040');
    const boxGeo = new THREE.BoxGeometry(7, 7, 7);
    for (const b of tr.itemBoxes) {
      const m = new THREE.Mesh(boxGeo, boxMat);
      m.position.copy(V(b.x, b.y, 5));
      m.castShadow = true;
      this.scene.add(m);
      this.boxes.push(m);
    }
    // thwomp faces from Rive
    if (riveTex.thwomp) {
      for (const t of this.thwomps) {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshStandardMaterial({ map: riveTex.thwomp.texture, transparent: true, roughness: 0.8 }));
        face.position.set(0, 9, 0);
        t.add(face);
        t.userData.face = face;
      }
    }
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffc81a', metalness: 0.85, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.6 });
    const coinGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.6, 24);
    coinGeo.rotateX(Math.PI / 2);
    for (const c of tr.coins) {
      const m = new THREE.Mesh(coinGeo, coinMat);
      m.position.copy(V(c.x, c.y, 3));
      m.castShadow = true;
      this.scene.add(m);
      this.coins.push(m);
    }
  }

  private buildStartGate(tr: Track, banner: RiveTexture | null) {
    const hw = tr.halfW + tr.def.theme.curbWidth + 4;
    const g = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: '#d8d8e0', roughness: 0.4, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 30, 12), pm);
      p.position.set(0, 15, s * hw);
      p.castShadow = true;
      g.add(p);
    }
    const bm = new THREE.MeshStandardMaterial({ map: banner?.texture ?? null, color: banner ? '#ffffff' : '#d02020', roughness: 0.6, side: THREE.DoubleSide });
    if (banner) { bm.emissive = new THREE.Color('#ffffff'); bm.emissiveMap = banner.texture; bm.emissiveIntensity = 0.25; }
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 10, hw * 2 + 4), [pm, pm, pm, pm, bm, bm]);
    b.position.set(0, 27, 0);
    b.castShadow = true;
    // make the banner faces (±x) show the texture
    const mats = [bm, bm, pm, pm, pm, pm];
    b.material = mats;
    g.add(b);
    g.position.copy(V(tr.x[0], tr.y[0]));
    g.rotation.y = -Math.atan2(tr.ty[0], tr.tx[0]);
    this.scene.add(g);
  }

  // ------------------------------------------------------------------ update
  update(dt: number, time: number, focus: Kart | null) {
    const race = this.race;
    // karts
    for (const k of race.karts) {
      const rig = this.karts.get(k.id);
      if (!rig) continue;
      rig.root.position.set(k.x, k.z, k.y);
      rig.root.rotation.y = -(k.heading + k.spinAngle + k.drift * 0.38);
      const s = k.scale;
      rig.root.scale.set(s, s * (k.squishTimer > 0 ? 0.3 : 1), s);
      const bounce = k.speed > 5 && k.z <= 0 ? Math.sin(time * 38 + k.x) * 0.12 : 0;
      rig.body.position.y = bounce;
      rig.body.rotation.x = -k.steerVis * 0.07; // lean into the turn
      rig.driver.rotation.x = -k.steerVis * 0.12;
      rig.head.rotation.y = -k.steerVis * 0.3;
      for (const p of rig.frontPivots) p.rotation.y = -k.steerVis * 0.45;
      for (const w of rig.wheels) w.rotation.z -= (k.speed * dt) / 1.8;
      const boost = k.boostTimer > 0 || k.starTimer > 0;
      for (const f of rig.flames) {
        f.visible = boost || k.driftCharge > 1.0 && k.drift !== 0;
        f.scale.set(0.7, 2.6 + Math.sin(time * 60) * 0.8, 0.7);
        (f.material as THREE.MeshBasicMaterial).color.set(boost ? '#ffa020' : '#40a0ff');
      }
      // star rainbow / invulnerability blink
      if (k.starTimer > 0) {
        const c = new THREE.Color().setHSL((time * 2) % 1, 1, 0.5);
        for (const m of rig.paint) { m.emissive = c; m.emissiveIntensity = 0.8; }
      } else for (const m of rig.paint) m.emissiveIntensity = 0;
    }
    // item entities
    const seen = new Set<string>();
    for (const e of race.items) {
      seen.add(e.id);
      let o = this.items.get(e.id);
      if (!o) { o = buildItemMesh(e.type); this.items.set(e.id, o); this.scene.add(o); }
      o.position.set(e.x, e.z, e.y);
      o.rotation.y = e.type === 'banana' ? 0.6 : time * 10;
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { this.scene.remove(o); this.items.delete(id); }
    // pickups
    this.boxes.forEach((b, i) => {
      b.visible = race.boxVisible(i);
      b.rotation.set(time * 0.9 + i, time * 1.3 + i, 0.4);
      b.position.y = 5 + Math.sin(time * 2.5 + i) * 0.8;
      const sc = race.boxTimers[i] > 2.6 ? 0.2 : 1;
      b.scale.setScalar(sc);
    });
    this.coins.forEach((c, i) => {
      c.visible = race.coinVisible(i);
      c.rotation.y = time * 3 + i;
    });
    for (const t of this.dashTex) t.offset.y = -(time * 1.5) % 1;
    if (this.lavaTex) { this.lavaTex.offset.x = time * 0.004; this.lavaTex.offset.y = time * 0.002; }
    if (this.waterTex) { this.waterTex.offset.x = time * 0.006; this.waterTex.offset.y = Math.sin(time * 0.4) * 0.01; }
    this.thwomps.forEach((t, i) => { t.position.y = Math.max(0, Math.sin(time * 1.3 + i * 2) * 10); });

    // sun/shadow follows the focused kart
    const f = focus ?? race.karts[0];
    if (f) {
      this.sun.position.set(f.x + 120, 220, f.y - 80);
      this.sun.target.position.set(f.x, 0, f.y);
    }
    this.updateSparks(dt);
  }

  private emitSpark(x: number, y: number, z: number, color: string, vx: number, vy: number, vz: number, life: number, size: number, grow = 0) {
    const s = this.sparkPool.pop();
    if (!s) return;
    s.visible = true;
    (s.material as THREE.SpriteMaterial).color.set(color);
    s.position.set(x, z, y);
    s.scale.setScalar(size);
    this.sparks.push({ sprite: s, vx, vy, vz, life, max: life, grow });
  }

  private updateSparks(dt: number) {
    const race = this.race;
    for (const k of race.karts) {
      const cx = Math.cos(k.heading), cy = Math.sin(k.heading);
      const rx = -cy, ry = cx;
      const bx = k.x - cx * 7 * k.scale, by = k.y - cy * 7 * k.scale;
      if (k.drift !== 0 && k.z <= 0 && Math.random() < dt * 50) {
        const col = k.driftCharge > 1.0 ? (Math.random() < 0.5 ? '#ff7a20' : '#ffd040') : k.driftCharge > 0.5 ? '#50b0ff' : '#ffffff';
        for (const s of [-1, 1]) this.emitSpark(bx + rx * 4 * s, by + ry * 4 * s, 0.8, col, -rx * k.drift * 25 + (Math.random() - 0.5) * 15, -ry * k.drift * 25 + (Math.random() - 0.5) * 15, 18 + Math.random() * 18, 0.35, 1.6);
      }
      if (k.surface === 'offroad' && Math.abs(k.speed) > 30 && k.z <= 0 && Math.random() < dt * 30) {
        this.emitSpark(bx, by, 1, '#c8a878', (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 12, 0.6, 3, 6);
      }
      if (k.boostTimer > 0 && Math.random() < dt * 40) this.emitSpark(bx, by, 3, '#ffa040', -cx * 30, -cy * 30, 6, 0.25, 2.2, 4);
      if (k.starTimer > 0 && Math.random() < dt * 40) this.emitSpark(k.x + (Math.random() - 0.5) * 10, k.y + (Math.random() - 0.5) * 10, 4 + Math.random() * 10, ['#ffff60', '#ffffff', '#60ffff'][Math.floor(Math.random() * 3)], 0, 0, 15, 0.4, 1.5);
      if (k.spinTimer > 0 && Math.random() < dt * 25) this.emitSpark(k.x, k.y, 8, '#ffffff', (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 30, 0.5, 1.8);
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { p.sprite.visible = false; this.sparkPool.push(p.sprite); this.sparks.splice(i, 1); continue; }
      p.vz -= 60 * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.z += p.vy * dt;
      p.sprite.position.y = Math.max(0.3, p.sprite.position.y + p.vz * dt);
      p.sprite.scale.multiplyScalar(1 + p.grow * dt * 0.3);
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, (p.life / p.max) * 1.6);
    }
  }

  /** image-based lighting so chrome/metal and glossy paint have something to reflect */
  setEnvironment(gl: THREE.WebGLRenderer) {
    if (!envTex) {
      const pm = new THREE.PMREMGenerator(gl);
      envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.scene.environment = envTex;
    this.scene.environmentIntensity = this.look.sky === 'day' ? 0.55 : 0.35;
  }

  /** hide karts squeezed between the camera and the followed kart (they would block the view) */
  prepareView(cam: THREE.Camera, focus: Kart | null) {
    const cx = cam.position.x, cz = cam.position.z;
    const fd = focus ? Math.hypot(focus.x - cx, focus.y - cz) : 0;
    for (const k of this.race.karts) {
      const rig = this.karts.get(k.id);
      if (!rig) continue;
      const blink = k.invulnTimer > 0 && Math.floor(performance.now() / 50) % 2 === 0;
      const dist = Math.hypot(k.x - cx, k.y - cz);
      rig.root.visible = !blink && (k === focus || !focus || dist > Math.min(fd * 0.75, 22));
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

/** rounded stone block for thwomps */
class RoundedThwompGeo extends THREE.BoxGeometry {
  constructor(r: number) {
    super(r * 2.2, 18, r * 2.2, 2, 2, 2);
  }
}
