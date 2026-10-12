// Minimal binary .riv writer (Rive runtime format 7.x).
//
// Format notes (from rive-runtime src/file.cpp, runtime_header.hpp, importers):
//  * Header: "RIVE", varuint major, varuint minor, varuint fileId, then a
//    property ToC: varuint property keys terminated by 0, followed by 2-bit
//    field type ids packed 16 per little-endian uint32 (uint/bool/id=0,
//    string=1, double=2, color=3). The ToC only matters for keys an older
//    runtime does not know; we emit it for every key we use.
//  * Objects: varuint typeKey, then (varuint propertyKey, value)* and 0.
//  * Backboard first. Each Artboard opens an artboard scope; every Component
//    (and KeyFrameInterpolator) that follows claims the next slot in the
//    artboard's object list (artboard = 0). parentId / objectId /
//    interpolatorId are indices into that list.
//  * LinearAnimation -> KeyedObject -> KeyedProperty -> KeyFrame* (import stack).
//  * StateMachine -> inputs -> layers; each layer -> states (each followed by
//    its transitions, each transition followed by its conditions). State ids
//    in transitions are indices into the layer's state list.
//  * Draw order: the runtime draws drawables in *reverse* file order (first
//    drawable in the file is on top). The builder takes children in painter
//    order (back to front) and serializes them reversed.

const T = {
  Backboard: 23, Artboard: 1, Node: 2, Shape: 3, Ellipse: 4, StraightVertex: 5,
  CubicDetachedVertex: 6, Rectangle: 7, PointsPath: 16, RadialGradient: 17,
  SolidColor: 18, GradientStop: 19, Fill: 20, LinearGradient: 22, Stroke: 24,
  KeyedObject: 25, KeyedProperty: 26, CubicEaseInterpolator: 28,
  KeyFrameDouble: 30, LinearAnimation: 31, KeyFrameColor: 37,
  StateMachine: 53, StateMachineNumber: 56, StateMachineLayer: 57,
  StateMachineTrigger: 58, StateMachineBool: 59, AnimationState: 61,
  AnyState: 62, EntryState: 63, ExitState: 64, StateTransition: 65,
  TransitionTriggerCondition: 68, TransitionNumberCondition: 70,
  TransitionBoolCondition: 71, BlendAnimation1D: 75, BlendState1D: 76,
  ClippingShape: 42,
};

// propertyKey -> field type
const P = {
  name: [4, 'string'], parentId: [5, 'uint'], width: [7, 'double'], height: [8, 'double'],
  abOriginX: [11, 'double'], abOriginY: [12, 'double'],
  x: [13, 'double'], y: [14, 'double'], rotation: [15, 'double'], scaleX: [16, 'double'],
  scaleY: [17, 'double'], opacity: [18, 'double'], pWidth: [20, 'double'], pHeight: [21, 'double'],
  vx: [24, 'double'], vy: [25, 'double'], vRadius: [26, 'double'], cornerRadius: [31, 'double'],
  isClosed: [32, 'bool'], gStartY: [33, 'double'], gEndX: [34, 'double'], gEndY: [35, 'double'],
  colorValue: [37, 'color'], stopColor: [38, 'color'], stopPos: [39, 'double'],
  fillRule: [40, 'uint'], isVisible: [41, 'bool'], gStartX: [42, 'double'], gOpacity: [46, 'double'],
  thickness: [47, 'double'], cap: [48, 'uint'], join: [49, 'uint'], transformAffectsStroke: [50, 'bool'],
  objectId: [51, 'uint'], kpPropertyKey: [53, 'uint'], animName: [55, 'string'], fps: [56, 'uint'],
  duration: [57, 'uint'], speed: [58, 'double'], loopValue: [59, 'uint'],
  x1: [63, 'double'], y1: [64, 'double'], x2: [65, 'double'], y2: [66, 'double'],
  frame: [67, 'uint'], interpolationType: [68, 'uint'], interpolatorId: [69, 'uint'],
  kfDouble: [70, 'double'], inRotation: [84, 'double'], inDistance: [85, 'double'],
  outRotation: [86, 'double'], outDistance: [87, 'double'], kfColor: [88, 'color'],
  originX: [123, 'double'], originY: [124, 'double'], smName: [138, 'string'],
  numValue: [140, 'double'], boolValue: [141, 'bool'], animationId: [149, 'uint'],
  stateToId: [151, 'uint'], trFlags: [152, 'uint'], inputId: [155, 'uint'], opValue: [156, 'uint'],
  condValue: [157, 'double'], trDuration: [158, 'uint'], exitTime: [160, 'uint'],
  blendAnimationId: [165, 'uint'], blendValue: [166, 'double'], blendInputId: [167, 'uint'],
  clip: [196, 'bool'], sourceId: [92, 'uint'], clipFillRule: [93, 'uint'],
};

const FIELD_ID = { uint: 0, bool: 0, string: 1, double: 2, color: 3 };

// Animatable properties (name -> [propertyKey, kind]).
const ANIM_PROPS = {
  x: [13, 'double'], y: [14, 'double'], rotation: [15, 'double'], scaleX: [16, 'double'],
  scaleY: [17, 'double'], opacity: [18, 'double'], width: [20, 'double'], height: [21, 'double'],
  cornerRadius: [31, 'double'], color: [37, 'color'], thickness: [47, 'double'],
  vx: [24, 'double'], vy: [25, 'double'], stopColor: [38, 'color'], stopPos: [39, 'double'],
};

// ---------------------------------------------------------------- bytes
class ByteWriter {
  constructor() { this.buf = new Uint8Array(1 << 16); this.len = 0; }
  ensure(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2; while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap); nb.set(this.buf.subarray(0, this.len)); this.buf = nb;
  }
  byte(b) { this.ensure(1); this.buf[this.len++] = b & 0xff; }
  varuint(v) {
    v = Math.floor(v);
    if (v < 0) throw new Error('negative varuint ' + v);
    do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; this.byte(b); } while (v > 0);
  }
  u32(v) { this.ensure(4); new DataView(this.buf.buffer).setUint32(this.len, v >>> 0, true); this.len += 4; }
  f32(v) { this.ensure(4); new DataView(this.buf.buffer).setFloat32(this.len, v, true); this.len += 4; }
  str(s) { const b = new TextEncoder().encode(s); this.varuint(b.length); this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  bytes() { return this.buf.slice(0, this.len); }
}

// ---------------------------------------------------------------- colors
export function parseColor(c) {
  if (typeof c === 'number') return c >>> 0;
  if (c && typeof c === 'object') { const base = parseColor(c.c ?? c.color); return withAlpha(base, c.a ?? 1); }
  let s = String(c).trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  let r, g, b, a = 255;
  r = parseInt(s.slice(0, 2), 16); g = parseInt(s.slice(2, 4), 16); b = parseInt(s.slice(4, 6), 16);
  if (s.length === 8) a = parseInt(s.slice(6, 8), 16);
  return (((a << 24) >>> 0) + (r << 16) + (g << 8) + b) >>> 0;
}
export function withAlpha(argb, a) {
  argb = parseColor(argb);
  return ((((Math.round(a * 255) & 255) << 24) >>> 0) + (argb & 0xffffff)) >>> 0;
}
export function mix(c1, c2, t) {
  c1 = parseColor(c1); c2 = parseColor(c2);
  const ch = (c, s) => (c >>> s) & 255;
  const m = (s) => Math.round(ch(c1, s) + (ch(c2, s) - ch(c1, s)) * t);
  return (((m(24) << 24) >>> 0) + (m(16) << 16) + (m(8) << 8) + m(0)) >>> 0;
}

// ---------------------------------------------------------------- scene nodes
// Every scene element is a plain object { kind, props, children, ... }.
let autoId = 0;
export function node(props = {}, children = []) {
  return { kind: 'node', props, children: children.flat(Infinity).filter(Boolean) };
}
/** A group whose scale/rotation pivot is at (px,py) in parent space. */
export function pivot(px, py, props = {}, children = []) {
  return node({ ...props, x: px + (props.x || 0), y: py + (props.y || 0) },
    [node({ name: props.innerName, x: -px, y: -py }, children)]);
}
/** shape({x,y,rotation,scaleX,scaleY,opacity,name}, paths, fill, stroke)
 *  paths: array of path specs; fill: paint spec or array; stroke: {color,width,cap,join} or array */
export function shape(props, paths, fill, stroke) {
  const fills = fill == null ? [] : Array.isArray(fill) ? fill : [fill];
  const strokes = stroke == null ? [] : Array.isArray(stroke) ? stroke : [stroke];
  return { kind: 'shape', props, paths: [paths].flat(Infinity).filter(Boolean), fills, strokes };
}
// ---- path specs (coordinates in shape-local space)
export function rect(x, y, w, h, r = 0) { return { type: 'rect', x: x + w / 2, y: y + h / 2, w, h, r }; }
export function rectC(cx, cy, w, h, r = 0) { return { type: 'rect', x: cx, y: cy, w, h, r }; }
export function ellipse(cx, cy, rx, ry = rx) { return { type: 'ellipse', x: cx, y: cy, w: rx * 2, h: ry * 2 }; }
export function circle(cx, cy, r) { return ellipse(cx, cy, r, r); }
/** Polygon from [[x,y],...]; optional radius rounds corners. */
export function poly(points, closed = true, radius = 0) {
  return { type: 'points', closed, verts: points.map(([x, y, r]) => ({ x, y, r: r ?? radius })) };
}
/** SVG path data (absolute + relative M L H V C S Q T Z, and A). Returns array of point paths. */
export function svg(d, opts = {}) {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  let i = 0; const out = []; let cur = null; let cx = 0, cy = 0, sx = 0, sy = 0; let cmd = '';
  let lastCtrl = null, lastQ = null;
  const num = () => parseFloat(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const start = (x, y) => { cur = { type: 'points', closed: false, verts: [{ x, y }] }; out.push(cur); sx = x; sy = y; };
  const lineTo = (x, y) => { cur.verts.push({ x, y }); };
  const cubicTo = (x1, y1, x2, y2, x, y) => {
    const last = cur.verts[cur.verts.length - 1]; last.out = [x1, y1]; cur.verts.push({ x, y, in: [x2, y2] });
  };
  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    switch (C) {
      case 'M': { const x = num() + ox, y = num() + oy; start(x, y); cx = x; cy = y; cmd = rel ? 'l' : 'L'; lastCtrl = lastQ = null; break; }
      case 'L': { const x = num() + ox, y = num() + oy; lineTo(x, y); cx = x; cy = y; lastCtrl = lastQ = null; break; }
      case 'H': { const x = num() + ox; lineTo(x, cy); cx = x; lastCtrl = lastQ = null; break; }
      case 'V': { const y = num() + oy; lineTo(cx, y); cy = y; lastCtrl = lastQ = null; break; }
      case 'C': { const a = [num() + ox, num() + oy, num() + ox, num() + oy, num() + ox, num() + oy]; cubicTo(...a); lastCtrl = [a[2], a[3]]; cx = a[4]; cy = a[5]; lastQ = null; break; }
      case 'S': { const r1 = lastCtrl ? [2 * cx - lastCtrl[0], 2 * cy - lastCtrl[1]] : [cx, cy]; const a = [num() + ox, num() + oy, num() + ox, num() + oy]; cubicTo(r1[0], r1[1], ...a); lastCtrl = [a[0], a[1]]; cx = a[2]; cy = a[3]; lastQ = null; break; }
      case 'Q': case 'T': {
        let qx, qy;
        if (C === 'Q') { qx = num() + ox; qy = num() + oy; } else { qx = lastQ ? 2 * cx - lastQ[0] : cx; qy = lastQ ? 2 * cy - lastQ[1] : cy; }
        const x = num() + ox, y = num() + oy;
        cubicTo(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
        lastQ = [qx, qy]; lastCtrl = null; cx = x; cy = y; break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(); const x = num() + ox, y = num() + oy;
        for (const seg of arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y)) cubicTo(...seg);
        cx = x; cy = y; lastCtrl = lastQ = null; break;
      }
      case 'Z': {
        cur.closed = true; const f = cur.verts[0], l = cur.verts[cur.verts.length - 1];
        if (cur.verts.length > 1 && Math.abs(f.x - l.x) < 1e-3 && Math.abs(f.y - l.y) < 1e-3) { f.in = l.in; cur.verts.pop(); }
        cx = sx; cy = sy; lastCtrl = lastQ = null; break;
      }
      default: throw new Error('bad svg cmd ' + cmd);
    }
  }
  if (opts.closed) out.forEach((p) => (p.closed = true));
  return out;
}
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p; if (num < 0) num = 0;
  let co = Math.sqrt(num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)); if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)); const segs = []; const d = dt / n;
  const k = (4 / 3) * Math.tan(d / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const dr = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let j = 0; j < n; j++) {
    const a = t1 + j * d, b = a + d; const p0 = pt(a), p1 = pt(b), d0 = dr(a), d1 = dr(b);
    segs.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p1[0] - k * d1[0], p1[1] - k * d1[1], p1[0], p1[1]]);
  }
  return segs;
}

// ---- paint specs
export function solid(color, name) { return { type: 'solid', color, name }; }
export function linear(x1, y1, x2, y2, stops, name) { return { type: 'linear', x1, y1, x2, y2, stops, name }; }
export function radial(cx, cy, r, stops, name) { return { type: 'radial', x1: cx, y1: cy, x2: cx + r, y2: cy, stops, name }; }

// ---------------------------------------------------------------- file builder
class Obj {
  constructor(type, props = []) { this.type = type; this.props = props; this.index = -1; }
}

export class Artboard {
  constructor(file, name, width, height, opts = {}) {
    this.file = file; this.name = name; this.width = width; this.height = height; this.opts = opts;
    this.children = []; this.animations = []; this.stateMachines = [];
  }
  add(...items) { this.children.push(...items.flat(Infinity).filter(Boolean)); return this; }
  /** tracks: [{ target, prop, keys: [[frame, value, interp?]...], interp: 'ease'|'linear'|'hold'|[x1,y1,x2,y2] }] */
  animation(name, { fps = 60, duration = 60, loop = 'loop', speed = 1 } = {}, tracks = []) {
    this.animations.push({ name, fps, duration, loop, speed, tracks });
    return this;
  }
  stateMachine(name, spec) { this.stateMachines.push({ name, ...spec }); return this; }
}

export class RivFile {
  constructor() { this.artboards = []; }
  artboard(name, width, height, opts) { const a = new Artboard(this, name, width, height, opts); this.artboards.push(a); return a; }

  build() {
    const objs = [new Obj(T.Backboard)];
    for (const ab of this.artboards) objs.push(...this._artboardObjects(ab));
    return encode(objs);
  }

  _artboardObjects(ab) {
    const out = []; let slot = 0;
    const named = new Map(); // name -> {obj, kind, colorObj}
    const register = (name, entry) => {
      if (!name) return;
      if (named.has(name)) throw new Error(`Artboard ${ab.name}: duplicate name '${name}'`);
      named.set(name, entry);
    };
    const add = (o) => { o.index = slot++; out.push(o); return o; };

    const abObj = add(new Obj(T.Artboard, [['name', ab.name], ['width', ab.width], ['height', ab.height], ['clip', ab.opts.clip ?? true]]));

    const xform = (p) => {
      const r = [];
      if (p.name) r.push(['name', p.name]);
      if (p.x) r.push(['x', p.x]);
      if (p.y) r.push(['y', p.y]);
      if (p.rotation) r.push(['rotation', (p.rotation * Math.PI) / 180]);
      const s = p.scale;
      if (p.scaleX != null || s != null) r.push(['scaleX', p.scaleX ?? s]);
      if (p.scaleY != null || s != null) r.push(['scaleY', p.scaleY ?? s]);
      if (p.opacity != null && p.opacity !== 1) r.push(['opacity', p.opacity]);
      return r;
    };

    const emitPaint = (paint, parentIdx, isStroke) => {
      let spec = paint;
      if (typeof paint === 'string' || typeof paint === 'number') spec = isStroke ? { color: paint } : { type: 'solid', color: paint };
      const props = [['parentId', parentIdx]];
      if (spec.name) props.unshift(['name', spec.name]);
      let o;
      if (isStroke) {
        props.push(['thickness', spec.width ?? 3]);
        props.push(['cap', { butt: 0, round: 1, square: 2 }[spec.cap ?? 'round']]);
        props.push(['join', { miter: 0, round: 1, bevel: 2 }[spec.join ?? 'round']]);
        if (spec.scales === false) props.push(['transformAffectsStroke', false]);
        o = add(new Obj(T.Stroke, props));
        spec = spec.paint ?? { type: spec.type ?? 'solid', color: spec.color, stops: spec.stops, x1: spec.x1, y1: spec.y1, x2: spec.x2, y2: spec.y2 };
      } else {
        if (spec.evenOdd) props.push(['fillRule', 1]);
        o = add(new Obj(T.Fill, props));
        if (spec.paint) spec = spec.paint;
      }
      let colorObj = null;
      const t = spec.type ?? 'solid';
      if (t === 'solid') {
        colorObj = add(new Obj(T.SolidColor, [['parentId', o.index], ['colorValue', parseColor(spec.color)]]));
      } else {
        const g = add(new Obj(t === 'radial' ? T.RadialGradient : T.LinearGradient, [
          ['parentId', o.index], ['gStartX', spec.x1], ['gStartY', spec.y1], ['gEndX', spec.x2], ['gEndY', spec.y2]]));
        for (const [pos, col, sname] of spec.stops) {
          const so = add(new Obj(T.GradientStop, [['parentId', g.index], ['stopColor', parseColor(col)], ['stopPos', pos]]));
          register(sname, { obj: so });
        }
      }
      register(paint.name, { obj: o, colorObj });
    };

    const emitPath = (p, parentIdx) => {
      const base = [['parentId', parentIdx]];
      if (p.name) base.unshift(['name', p.name]);
      let o;
      if (p.type === 'rect' || p.type === 'ellipse') {
        const props = [...base, ['x', p.x], ['y', p.y], ['pWidth', p.w], ['pHeight', p.h]];
        if (p.type === 'rect' && p.r) props.push(['cornerRadius', p.r]);
        o = add(new Obj(p.type === 'rect' ? T.Rectangle : T.Ellipse, props));
      } else {
        o = add(new Obj(T.PointsPath, [...base, ['isClosed', !!p.closed]]));
        for (const v of p.verts) {
          const hasIn = v.in && (Math.abs(v.in[0] - v.x) > 1e-4 || Math.abs(v.in[1] - v.y) > 1e-4);
          const hasOut = v.out && (Math.abs(v.out[0] - v.x) > 1e-4 || Math.abs(v.out[1] - v.y) > 1e-4);
          if (!hasIn && !hasOut) {
            const props = [['parentId', o.index], ['vx', v.x], ['vy', v.y]];
            if (v.r) props.push(['vRadius', v.r]);
            add(new Obj(T.StraightVertex, props));
          } else {
            const props = [['parentId', o.index], ['vx', v.x], ['vy', v.y]];
            if (hasIn) props.push(['inRotation', Math.atan2(v.in[1] - v.y, v.in[0] - v.x)], ['inDistance', Math.hypot(v.in[0] - v.x, v.in[1] - v.y)]);
            if (hasOut) props.push(['outRotation', Math.atan2(v.out[1] - v.y, v.out[0] - v.x)], ['outDistance', Math.hypot(v.out[0] - v.x, v.out[1] - v.y)]);
            add(new Obj(T.CubicDetachedVertex, props));
          }
        }
      }
      register(p.name, { obj: o });
    };

    const emit = (el, parentIdx) => {
      if (el.kind === 'node') {
        const o = add(new Obj(T.Node, [...xform(el.props), ['parentId', parentIdx]]));
        register(el.props.name, { obj: o });
        if (el.props.clip) clips.push({ parent: o, source: el.props.clip, evenOdd: el.props.clipEvenOdd });
        for (let i = el.children.length - 1; i >= 0; i--) emit(el.children[i], o.index);
      } else if (el.kind === 'shape') {
        const o = add(new Obj(T.Shape, [...xform(el.props), ['parentId', parentIdx]]));
        register(el.props.name, { obj: o });
        for (const p of el.paths) emitPath(p, o.index);
        for (const f of el.fills) emitPaint(f, o.index, false);
        for (const s of el.strokes) emitPaint(s, o.index, true);
      } else throw new Error('unknown element ' + JSON.stringify(el).slice(0, 80));
    };
    const clips = [];
    for (let i = ab.children.length - 1; i >= 0; i--) emit(ab.children[i], abObj.index);
    // Clipping shapes: children of the clipped node, sourced from a named node/shape.
    for (const c of clips) {
      const src = named.get(c.source);
      if (!src) throw new Error(`Artboard ${ab.name}: unknown clip source ${c.source}`);
      add(new Obj(T.ClippingShape, [['parentId', c.parent.index], ['sourceId', src.obj.index], ['clipFillRule', c.evenOdd ? 1 : 0]]));
    }

    // Interpolators (claim artboard slots)
    const interps = new Map();
    const interpFor = (spec) => {
      const v = spec === 'ease' || spec === 'cubic' ? [0.42, 0, 0.58, 1]
        : spec === 'easeOut' ? [0, 0, 0.58, 1] : spec === 'easeIn' ? [0.42, 0, 1, 1] : spec;
      const k = v.join(',');
      if (!interps.has(k)) interps.set(k, { v, obj: null });
      return interps.get(k);
    };
    for (const a of ab.animations) for (const tr of a.tracks) for (const kf of tr.keys) {
      const ip = kf[2] ?? tr.interp ?? 'ease';
      if (ip !== 'linear' && ip !== 'hold') interpFor(ip);
    }
    for (const it of interps.values()) {
      it.obj = add(new Obj(T.CubicEaseInterpolator, [['x1', it.v[0]], ['y1', it.v[1]], ['x2', it.v[2]], ['y2', it.v[3]]]));
    }

    // Animations
    const animIndex = new Map();
    ab.animations.forEach((a, i) => animIndex.set(a.name, i));
    for (const a of ab.animations) {
      out.push(new Obj(T.LinearAnimation, [['animName', a.name], ['fps', a.fps], ['duration', a.duration],
        ['speed', a.speed], ['loopValue', { oneShot: 0, loop: 1, pingPong: 2 }[a.loop]]]));
      // group tracks by target object
      const byObj = new Map();
      for (const tr of a.tracks) {
        const ent = named.get(tr.target);
        if (!ent) throw new Error(`Artboard ${ab.name} anim ${a.name}: unknown target '${tr.target}'`);
        const ap = ANIM_PROPS[tr.prop];
        if (!ap) throw new Error('unknown anim prop ' + tr.prop);
        let target = ent.obj;
        if (tr.prop === 'color') {
          if (ent.colorObj) target = ent.colorObj; else if (target.type !== T.SolidColor) throw new Error(`target ${tr.target} has no solid color`);
        }
        if (!byObj.has(target)) byObj.set(target, []);
        byObj.get(target).push({ tr, ap });
      }
      for (const [target, list] of byObj) {
        out.push(new Obj(T.KeyedObject, [['objectId', target.index]]));
        for (const { tr, ap } of list) {
          out.push(new Obj(T.KeyedProperty, [['kpPropertyKey', ap[0]]]));
          const keys = [...tr.keys].sort((p, q) => p[0] - q[0]);
          for (const kf of keys) {
            const ip = kf[2] ?? tr.interp ?? 'ease';
            const props = [['frame', Math.round(kf[0])]];
            if (ip === 'hold') props.push(['interpolationType', 0]);
            else if (ip === 'linear') props.push(['interpolationType', 1]);
            else props.push(['interpolationType', 2], ['interpolatorId', interpFor(ip).obj.index]);
            let val = kf[1];
            if (tr.prop === 'rotation') val = (val * Math.PI) / 180;
            if (ap[1] === 'color') out.push(new Obj(T.KeyFrameColor, [...props, ['kfColor', parseColor(val)]]));
            else out.push(new Obj(T.KeyFrameDouble, [...props, ['kfDouble', val]]));
          }
        }
      }
    }

    // State machines
    for (const sm of ab.stateMachines) {
      out.push(new Obj(T.StateMachine, [['animName', sm.name]]));
      const inputs = Object.entries(sm.inputs ?? {}).map(([name, spec]) => {
        if (typeof spec === 'string') spec = { type: spec };
        return { name, ...spec };
      });
      const inputIdx = new Map(inputs.map((inp, i) => [inp.name, i]));
      for (const inp of inputs) {
        if (inp.type === 'number') out.push(new Obj(T.StateMachineNumber, [['smName', inp.name], ['numValue', inp.value ?? 0]]));
        else if (inp.type === 'bool') out.push(new Obj(T.StateMachineBool, [['smName', inp.name], ['boolValue', !!inp.value]]));
        else if (inp.type === 'trigger') out.push(new Obj(T.StateMachineTrigger, [['smName', inp.name]]));
        else throw new Error('bad input type ' + inp.type);
      }
      const getInput = (n) => { if (!inputIdx.has(n)) throw new Error(`SM ${ab.name}/${sm.name}: unknown input ${n}`); return inputIdx.get(n); };
      const getAnim = (n) => { if (!animIndex.has(n)) throw new Error(`SM ${ab.name}: unknown animation ${n}`); return animIndex.get(n); };
      const OPS = { '==': 0, '!=': 1, '<=': 2, '>=': 3, '<': 4, '>': 5 };

      for (const layer of sm.layers) {
        out.push(new Obj(T.StateMachineLayer, [['smName', layer.name ?? 'Layer']]));
        const stateNames = ['__entry', '__any', '__exit', ...Object.keys(layer.states)];
        const sIdx = (n) => { const i = stateNames.indexOf(n === 'exit' ? '__exit' : n); if (i < 0) throw new Error('unknown state ' + n); return i; };
        const transFrom = new Map(stateNames.map((n) => [n, []]));
        transFrom.get('__entry').push({ to: layer.entry ?? Object.keys(layer.states)[0] });
        for (const t of layer.any ?? []) transFrom.get('__any').push(t);
        for (const t of layer.transitions ?? []) {
          const froms = Array.isArray(t.from) ? t.from : [t.from];
          for (const f of froms) { if (!transFrom.has(f)) throw new Error('unknown from state ' + f); transFrom.get(f).push(t); }
        }
        const emitTransitions = (n) => {
          for (const t of transFrom.get(n)) {
            let flags = 0; const props = [['stateToId', sIdx(t.to)]];
            if (t.duration) props.push(['trDuration', t.duration]);
            if (t.exitTime != null) { flags |= 4; props.push(['exitTime', t.exitTime]); if (t.exitPct) flags |= 8; }
            if (flags) props.push(['trFlags', flags]);
            out.push(new Obj(T.StateTransition, props));
            for (const c of t.when ?? []) {
              const inp = inputs[getInput(c[0])];
              if (inp.type === 'trigger') out.push(new Obj(T.TransitionTriggerCondition, [['inputId', getInput(c[0])]]));
              else if (inp.type === 'bool') {
                let want = c.length === 2 ? c[1] : c[2]; let op = c.length === 3 && c[1] === '!=' ? !want : want;
                out.push(new Obj(T.TransitionBoolCondition, [['inputId', getInput(c[0])], ['opValue', op ? 0 : 1]]));
              } else {
                out.push(new Obj(T.TransitionNumberCondition, [['inputId', getInput(c[0])], ['opValue', OPS[c[1]]], ['condValue', c[2]]]));
              }
            }
          }
        };
        out.push(new Obj(T.EntryState)); emitTransitions('__entry');
        out.push(new Obj(T.AnyState)); emitTransitions('__any');
        out.push(new Obj(T.ExitState)); emitTransitions('__exit');
        for (const [n, st] of Object.entries(layer.states)) {
          if (st.blend1d) {
            out.push(new Obj(T.BlendState1D, [['blendInputId', getInput(st.blend1d)]]));
            emitTransitions(n);
            for (const [an, v] of st.anims) out.push(new Obj(T.BlendAnimation1D, [['blendAnimationId', getAnim(an)], ['blendValue', v]]));
          } else {
            out.push(new Obj(T.AnimationState, [['animationId', getAnim(st.anim)]]));
            emitTransitions(n);
          }
        }
      }
    }
    return out;
  }
}

function encode(objs) {
  const used = new Map();
  for (const o of objs) for (const [k] of o.props) { const p = P[k]; if (!p) throw new Error('unknown prop ' + k); used.set(p[0], p[1]); }
  const w = new ByteWriter();
  for (const ch of 'RIVE') w.byte(ch.charCodeAt(0));
  w.varuint(7); w.varuint(4); w.varuint(0);
  const keys = [...used.keys()].sort((a, b) => a - b);
  for (const k of keys) w.varuint(k);
  w.varuint(0);
  let cur = 0, bit = 0;
  for (let i = 0; i < keys.length; i++) {
    cur |= FIELD_ID[used.get(keys[i])] << bit; bit += 2;
    if (bit === 8) { w.u32(cur); cur = 0; bit = 0; }
  }
  if (bit !== 0) w.u32(cur);
  for (const o of objs) {
    w.varuint(o.type);
    for (const [k, v] of o.props) {
      if (v == null || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`bad value for ${k}: ${v}`);
      const [key, t] = P[k];
      w.varuint(key);
      switch (t) {
        case 'uint': w.varuint(v); break;
        case 'bool': w.byte(v ? 1 : 0); break;
        case 'double': w.f32(v); break;
        case 'string': w.str(v); break;
        case 'color': w.u32(v); break;
        default: throw new Error(t);
      }
    }
    w.varuint(0);
  }
  return w.bytes();
}

export { T as TypeKeys };
