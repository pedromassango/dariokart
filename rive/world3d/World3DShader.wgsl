// Dariokart 3D world shader (Rive Scripting, WGSL).
// World space: x/y on the ground plane, z up. The game (JS) builds the view-projection matrix and the
// meshes; this shader does depth-tested, lit, fogged, procedurally textured rendering on the GPU.
//
// Vertex colour alpha carries a material id:
//   255 lit flat      250 unlit/glow      245 rainbow glow (item boxes)
//   240 instance body colour   241 instance hat colour   242 instance skin   243 instance trim
//   10 grass (MK8 mow stripes)    20 asphalt
//   30 water          35 lava              40 sand / dirt shoulder       50 snow / ice
//   60 checker (start line, uses the vertex colour + black)

struct U {
  vp: mat4x4<f32>,
  cam: vec4<f32>,     // camera position, time
  fog: vec4<f32>,     // fog colour, fog near
  p0: vec4<f32>,      // fog far, flipY, tan(fov/2), aspect
  fwd: vec4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  skyTop: vec4<f32>,  // rgb, star amount
  skyHor: vec4<f32>,  // rgb, cloud amount
  sun: vec4<f32>,     // direction towards the sun, sun disc amount
  misc: vec4<f32>,    // ambient, diffuse, unused, unused
}

@group(0) @binding(0) var<uniform> u: U;

struct VOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) tint: vec4<f32>,
  @location(4) extra: vec4<f32>,
}

fn toClip(w: vec3<f32>) -> vec4<f32> {
  var c = u.vp * vec4<f32>(w, 1.0);
  c.y = c.y * u.p0.y;
  return c;
}

@vertex
fn vs_static(@location(0) p: vec3<f32>, @location(1) n: vec4<f32>, @location(2) col: vec4<f32>) -> VOut {
  var o: VOut;
  o.pos = toClip(p);
  o.world = p;
  o.normal = n.xyz;
  o.color = col;
  o.tint = vec4<f32>(1.0, 1.0, 1.0, 0.0);
  o.extra = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  return o;
}

// i0 = x, y, z, yaw   i1 = scale, squash, roll, flash   i2 = body rgb, pitch
// i3 = hat, skin, trim as packed 0xRRGGBB integers, unused
@vertex
fn vs_inst(@location(0) p: vec3<f32>, @location(1) n: vec4<f32>, @location(2) col: vec4<f32>,
           @location(3) i0: vec4<f32>, @location(4) i1: vec4<f32>, @location(5) i2: vec4<f32>,
           @location(6) i3: vec4<f32>) -> VOut {
  var o: VOut;
  // roll around the local forward (x) axis, then yaw around z
  let cr = cos(i1.z);
  let sr = sin(i1.z);
  var lp = vec3<f32>(p.x, p.y * cr - p.z * sr, p.y * sr + p.z * cr);
  var ln = vec3<f32>(n.x, n.y * cr - n.z * sr, n.y * sr + n.z * cr);
  // pitch around the local y axis (nose up / down on jumps)
  let cp = cos(i2.w);
  let sp = sin(i2.w);
  lp = vec3<f32>(lp.x * cp - lp.z * sp, lp.y, lp.x * sp + lp.z * cp);
  ln = vec3<f32>(ln.x * cp - ln.z * sp, ln.y, ln.x * sp + ln.z * cp);
  let cy = cos(i0.w);
  let sy = sin(i0.w);
  lp = vec3<f32>(lp.x * cy - lp.y * sy, lp.x * sy + lp.y * cy, lp.z * i1.y);
  ln = vec3<f32>(ln.x * cy - ln.y * sy, ln.x * sy + ln.y * cy, ln.z);
  let w = lp * i1.x + i0.xyz;
  o.pos = toClip(w);
  o.world = w;
  o.normal = ln;
  o.color = col;
  o.tint = vec4<f32>(i2.xyz, i1.w);
  o.extra = i3;
  return o;
}

fn hash2(p: vec2<f32>) -> f32 {
  let q = fract(p * vec2<f32>(0.1031, 0.1030));
  let r = q + dot(q, q.yx + 33.33);
  return fract((r.x + r.y) * r.x);
}

fn noise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let s = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

fn fbm(p: vec2<f32>) -> f32 {
  return noise2(p) * 0.5 + noise2(p * 2.03) * 0.3 + noise2(p * 4.11) * 0.2;
}

fn hsv(h: f32) -> vec3<f32> {
  let k = vec3<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0);
  let p = abs(fract(vec3<f32>(h, h, h) + k) * 6.0 - vec3<f32>(3.0, 3.0, 3.0));
  return clamp(p - vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));
}

fn unpackRgb(v: f32) -> vec3<f32> {
  let u = u32(max(v, 0.0) + 0.5);
  return vec3<f32>(f32((u >> 16u) & 255u), f32((u >> 8u) & 255u), f32(u & 255u)) / 255.0;
}

fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let e = clamp(dir.z, -0.2, 1.0);
  let t = pow(clamp(e * 1.6, 0.0, 1.0), 0.7);
  var c = mix(u.skyHor.rgb, u.skyTop.rgb, t);
  // sun disc + glow
  let sd = max(dot(dir, normalize(u.sun.xyz)), 0.0);
  c = c + vec3<f32>(1.0, 0.92, 0.7) * (pow(sd, 400.0) * 1.2 + pow(sd, 12.0) * 0.18) * u.sun.w;
  // fluffy clouds on a dome
  if (dir.z > 0.0 && u.skyHor.w > 0.0) {
    let uv = dir.xy / (dir.z + 0.12) * 1.6 + vec2<f32>(u.cam.w * 0.01, 0.0);
    let cl = smoothstep(0.52, 0.78, fbm(uv * 1.3)) * u.skyHor.w * smoothstep(0.0, 0.18, dir.z);
    c = mix(c, vec3<f32>(1.0, 1.0, 1.0), cl * 0.9);
  }
  // stars (ghost / rainbow road)
  if (u.skyTop.w > 0.0 && dir.z > 0.02) {
    let g = floor(dir.xy / (dir.z + 0.3) * 160.0);
    let s = step(0.985, hash2(g)) * (0.5 + 0.5 * sin(u.cam.w * 3.0 + hash2(g + 7.0) * 40.0));
    c = c + vec3<f32>(s, s, s) * u.skyTop.w;
  }
  return c;
}

@fragment
fn fs_world(i: VOut) -> @location(0) vec4<f32> {
  let mat = i.color.a * 255.0;
  var base = i.color.rgb;
  let wp = i.world.xy;
  let t = u.cam.w;
  var lit = 1.0;
  var spec = 0.0;
  var nrm = normalize(i.normal);
  let toCam = normalize(u.cam.xyz - i.world);
  if (dot(nrm, toCam) < 0.0) {
    nrm = -nrm;
  }

  let m = i32(mat + 0.5);
  if (m == 255) {
    // lit flat
  } else if (m == 250) {
    lit = 0.0;
  } else if (m == 245) {
    lit = 0.0;
    base = hsv(fract(t * 0.35 + (wp.x + wp.y) * 0.01 + i.world.z * 0.08)) * 0.75 + vec3<f32>(0.25, 0.25, 0.25);
  } else if (m == 246) {
    lit = 0.0;
    base = i.tint.rgb * 1.15;
  } else if (m == 240) {
    base = base * i.tint.rgb;
    spec = 0.45;
  } else if (m == 241) {
    base = base * unpackRgb(i.extra.x);
    spec = 0.2;
  } else if (m == 242) {
    base = base * unpackRgb(i.extra.y);
  } else if (m == 243) {
    base = base * unpackRgb(i.extra.z);
  } else if (m == 10) {
    // grass: alternating mown stripes + clumps
    let stripe = step(0.5, fract(wp.x / 28.0)) * 0.07;
    let n = fbm(wp * 0.15) * 0.16 + noise2(wp * 1.7) * 0.06;
    base = base * (0.86 + stripe + n);
  } else if (m == 20) {
    let n = noise2(wp * 2.2) * 0.06 + fbm(wp * 0.08) * 0.08;
    base = base * (0.93 + n);
    spec = 0.08;
  } else if (m == 30) {
    let w1 = noise2(wp * 0.06 + vec2<f32>(t * 0.4, t * 0.25));
    let w2 = noise2(wp * 0.11 - vec2<f32>(t * 0.3, -t * 0.2));
    base = base * (0.85 + (w1 + w2) * 0.2);
    let glint = smoothstep(0.82, 0.95, w1 * w2 * 2.2);
    base = base + vec3<f32>(glint, glint, glint) * 0.5;
    spec = 0.6;
  } else if (m == 35) {
    lit = 0.0;
    let f = fbm(wp * 0.05 + vec2<f32>(t * 0.15, t * 0.08));
    base = mix(vec3<f32>(0.6, 0.06, 0.0), vec3<f32>(1.0, 0.62, 0.08), smoothstep(0.35, 0.8, f));
  } else if (m == 40) {
    let n = noise2(wp * 1.4) * 0.08 + fbm(wp * 0.2) * 0.12;
    base = base * (0.9 + n);
  } else if (m == 50) {
    let n = fbm(wp * 0.1) * 0.1;
    base = base * (0.94 + n);
    spec = 0.5;
  }

  // flash (star power / respawn)
  base = mix(base, vec3<f32>(1.0, 1.0, 1.0), i.tint.a * 0.7);

  var c = base;
  if (lit > 0.5) {
    let sunDir = normalize(u.sun.xyz);
    let diff = max(dot(nrm, sunDir), 0.0);
    let hemi = 0.5 + 0.5 * nrm.z;
    c = base * (u.misc.x + hemi * 0.12 + diff * u.misc.y);
    let h = normalize(sunDir + toCam);
    c = c + vec3<f32>(1.0, 1.0, 1.0) * pow(max(dot(nrm, h), 0.0), 40.0) * spec;
  }
  // distance fog towards the horizon colour
  let d = distance(i.world, u.cam.xyz);
  let f = clamp((d - u.fog.w) / (u.p0.x - u.fog.w), 0.0, 1.0);
  c = mix(c, u.fog.rgb, f * f * (3.0 - 2.0 * f));
  return vec4<f32>(c, 1.0);
}

// soft blob shadow: the shadow model stores its local uv (0..1) in the vertex colour's red/green
@fragment
fn fs_shadow(i: VOut) -> @location(0) vec4<f32> {
  let uv = i.color.rg * 2.0 - vec2<f32>(1.0, 1.0);
  let a = (1.0 - smoothstep(0.35, 1.0, length(uv))) * 0.42;
  return vec4<f32>(0.0, 0.0, 0.0, a);
}

struct SkyOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
}

@vertex
fn vs_sky(@builtin(vertex_index) vi: u32) -> SkyOut {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  let p = pts[vi];
  var o: SkyOut;
  o.pos = vec4<f32>(p, 0.0, 1.0);
  o.ndc = vec2<f32>(p.x, p.y * u.p0.y);
  return o;
}

@fragment
fn fs_sky(i: SkyOut) -> @location(0) vec4<f32> {
  let th = u.p0.z;
  let dir = normalize(u.fwd.xyz + u.right.xyz * (i.ndc.x * th * u.p0.w) + u.up.xyz * (i.ndc.y * th));
  return vec4<f32>(skyColor(dir), 1.0);
}
