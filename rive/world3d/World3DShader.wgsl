// Dariokart 3D world shader (Rive Scripting, WGSL).
// World space: x/y on the ground plane, z up. The game (JS) builds the view-projection and sun
// shadow matrices and the meshes; this shader renders the frame in several passes:
//
//   1. shadow map: the sun's view of every caster, depth packed into an rgba8 texture
//   2. scene: HDR (half float) with physically based lighting: GGX speculars with Fresnel, sky
//      reflections, filtered sun shadows, hemispheric sky light, aerial perspective and fog
//   3. bloom: bright pass + two blurred downsamples
//   4. composite: exposure, bloom, ACES filmic tone mapping, vignette, grain, sRGB encode
//
// Vertex colour alpha carries a material id:
//   255 lit (rough)   250 emissive   248 glossy   249 eye (wet)   247 metal   239 leaf   238 bark   245 rainbow emissive (item boxes)
//   246 sparkle (instance tint, emissive)
//   240 instance body paint (clear coat)  241 instance hat  242 instance skin  243 instance trim
//   10 grass   20 asphalt   30 water   35 lava   40 sand / dirt   50 snow / ice

struct U {
  vp: mat4x4<f32>,
  cam: vec4<f32>,     // camera position, time
  fog: vec4<f32>,     // fog colour (sRGB), fog near
  p0: vec4<f32>,      // fog far, flipY, tan(fov/2), aspect
  fwd: vec4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  skyTop: vec4<f32>,  // sRGB, star amount
  skyHor: vec4<f32>,  // sRGB, cloud amount
  sun: vec4<f32>,     // direction towards the sun, sun disc amount
  misc: vec4<f32>,    // ambient, diffuse, night (0/1), unused
  light: mat4x4<f32>, // world -> sun shadow map clip
  sh: vec4<f32>,      // 1 / map size, world units per texel, shadow strength, v flip (1 or -1)
  post: vec4<f32>,    // exposure, bloom strength, vignette, grain
}

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;
@group(0) @binding(3) var shadowTex: texture_2d<f32>;
@group(0) @binding(4) var shadowSampler: sampler;
// post processing inputs live in their own group
@group(1) @binding(0) var srcTex: texture_2d<f32>;
@group(1) @binding(1) var linSampler: sampler;
@group(1) @binding(2) var bloomA: texture_2d<f32>;
@group(1) @binding(3) var bloomB: texture_2d<f32>;
@group(1) @binding(4) var bloomC: texture_2d<f32>;

const PI = 3.14159265;

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

fn toLight(w: vec3<f32>) -> vec4<f32> {
  return u.light * vec4<f32>(w, 1.0);
}

// ---------------------------------------------------------------- vertex transforms
// i0 = x, y, z, yaw   i1 = scale, squash, roll, flash   i2 = body rgb, pitch
// i3 = hat, skin, trim as packed 0xRRGGBB integers, unused
fn instWorld(p: vec3<f32>, i0: vec4<f32>, i1: vec4<f32>, i2: vec4<f32>) -> vec3<f32> {
  let cr = cos(i1.z);
  let sr = sin(i1.z);
  var lp = vec3<f32>(p.x, p.y * cr - p.z * sr, p.y * sr + p.z * cr);
  let cp = cos(i2.w);
  let sp = sin(i2.w);
  lp = vec3<f32>(lp.x * cp - lp.z * sp, lp.y, lp.x * sp + lp.z * cp);
  let cy = cos(i0.w);
  let sy = sin(i0.w);
  lp = vec3<f32>(lp.x * cy - lp.y * sy, lp.x * sy + lp.y * cy, lp.z * i1.y);
  return lp * i1.x + i0.xyz;
}

fn instNormal(n: vec3<f32>, i0: vec4<f32>, i1: vec4<f32>, i2: vec4<f32>) -> vec3<f32> {
  let cr = cos(i1.z);
  let sr = sin(i1.z);
  var ln = vec3<f32>(n.x, n.y * cr - n.z * sr, n.y * sr + n.z * cr);
  let cp = cos(i2.w);
  let sp = sin(i2.w);
  ln = vec3<f32>(ln.x * cp - ln.z * sp, ln.y, ln.x * sp + ln.z * cp);
  let cy = cos(i0.w);
  let sy = sin(i0.w);
  return vec3<f32>(ln.x * cy - ln.y * sy, ln.x * sy + ln.y * cy, ln.z);
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

@vertex
fn vs_inst(@location(0) p: vec3<f32>, @location(1) n: vec4<f32>, @location(2) col: vec4<f32>,
           @location(3) i0: vec4<f32>, @location(4) i1: vec4<f32>, @location(5) i2: vec4<f32>,
           @location(6) i3: vec4<f32>) -> VOut {
  var o: VOut;
  var w = instWorld(p, i0, i1, i2);
  // leaves sway in the wind, more towards the top of the plant
  if (abs(col.a * 255.0 - 239.0) < 0.5) {
    let ph = u.cam.w * 1.4 + i0.x * 0.05 + i0.y * 0.07;
    let k = clamp(p.z / 40.0, 0.0, 1.0) * i1.x;
    w = w + vec3<f32>(sin(ph + p.z * 0.2) * 0.5, cos(ph * 0.8 + p.x * 0.3) * 0.35, 0.0) * k;
  }
  o.pos = toClip(w);
  o.world = w;
  o.normal = instNormal(n.xyz, i0, i1, i2);
  o.color = col;
  o.tint = vec4<f32>(i2.xyz, i1.w);
  // extra.w = 1 marks models (karts, drivers, items)
  o.extra = vec4<f32>(i3.xyz, 1.0);
  return o;
}

// ---------------------------------------------------------------- noise
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

// gradient of a noise field (finite differences) used to perturb normals
fn noiseGrad(p: vec2<f32>, scale: f32) -> vec2<f32> {
  let e = 0.35;
  let c = noise2(p * scale);
  return vec2<f32>(noise2((p + vec2<f32>(e, 0.0)) * scale) - c, noise2((p + vec2<f32>(0.0, e)) * scale) - c) / e;
}

fn hsv(h: f32) -> vec3<f32> {
  let k = vec3<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0);
  let p = abs(fract(vec3<f32>(h, h, h) + k) * 6.0 - vec3<f32>(3.0, 3.0, 3.0));
  return clamp(p - vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));
}

fn unpackRgb(v: f32) -> vec3<f32> {
  let x = u32(max(v, 0.0) + 0.5);
  return vec3<f32>(f32((x >> 16u) & 255u), f32((x >> 8u) & 255u), f32(x & 255u)) / 255.0;
}

fn lin(c: vec3<f32>) -> vec3<f32> {
  return pow(max(c, vec3<f32>(0.0, 0.0, 0.0)), vec3<f32>(2.2, 2.2, 2.2));
}

// ---------------------------------------------------------------- sky and light
fn sunDir() -> vec3<f32> {
  return normalize(u.sun.xyz);
}

fn sunRadiance() -> vec3<f32> {
  if (u.misc.z > 0.5) {
    return vec3<f32>(0.42, 0.48, 0.75) * 1.6;
  }
  return vec3<f32>(1.0, 0.94, 0.84) * 3.4;
}

// linear HDR sky radiance in a direction
fn skyColor(dir: vec3<f32>) -> vec3<f32> {
  let e = clamp(dir.z, -0.25, 1.0);
  let top = lin(u.skyTop.rgb);
  let hor = lin(u.skyHor.rgb);
  let t = pow(clamp(e * 1.5, 0.0, 1.0), 0.6);
  var c = mix(hor, top, t);
  // below the horizon the sky fades to the haze colour
  if (e < 0.0) {
    c = mix(hor, lin(u.fog.rgb) * 0.8, clamp(-e * 4.0, 0.0, 1.0));
  }
  let sd = max(dot(dir, sunDir()), 0.0);
  // sun disc, Mie forward-scatter halo and a warm horizon glow towards the sun
  c = c + vec3<f32>(1.0, 0.92, 0.75) * (pow(sd, 900.0) * 60.0 + pow(sd, 60.0) * 0.9 + pow(sd, 6.0) * 0.18) * u.sun.w;
  c = c + vec3<f32>(1.0, 0.75, 0.45) * pow(sd, 3.0) * (1.0 - t) * 0.12 * u.sun.w;
  // clouds lit by the sun on a dome
  if (dir.z > 0.0 && u.skyHor.w > 0.0) {
    let uv = dir.xy / (dir.z + 0.12) * 1.6 + vec2<f32>(u.cam.w * 0.01, 0.0);
    let dens = smoothstep(0.5, 0.82, fbm(uv * 1.3));
    let cl = dens * u.skyHor.w * smoothstep(0.0, 0.18, dir.z);
    let shade = smoothstep(0.6, 1.0, fbm(uv * 1.3 + vec2<f32>(0.08, 0.05)));
    let lit = vec3<f32>(1.0, 0.98, 0.95) * (1.4 + pow(sd, 4.0) * 1.5) - vec3<f32>(0.35, 0.33, 0.3) * shade;
    c = mix(c, lit, cl * 0.92);
  }
  // stars (ghost / rainbow road)
  if (u.skyTop.w > 0.0 && dir.z > 0.02) {
    let g = floor(dir.xy / (dir.z + 0.3) * 160.0);
    let s = step(0.985, hash2(g)) * (0.5 + 0.5 * sin(u.cam.w * 3.0 + hash2(g + 7.0) * 40.0));
    c = c + vec3<f32>(s, s, s) * u.skyTop.w * 2.5;
  }
  return c;
}

// blurred sky for rough reflections / ambient light
fn skyAmbient(n: vec3<f32>) -> vec3<f32> {
  let top = lin(u.skyTop.rgb);
  let hor = lin(u.skyHor.rgb);
  let ground = lin(u.fog.rgb) * 0.35;
  let skyPart = mix(hor, top, clamp(n.z, 0.0, 1.0));
  return mix(ground, skyPart, smoothstep(-0.6, 0.4, n.z));
}

// ---------------------------------------------------------------- shadows
fn unpackDepth(c: vec4<f32>) -> f32 {
  return dot(c.rgb, vec3<f32>(1.0, 1.0 / 255.0, 1.0 / 65025.0));
}

fn packDepth(d: f32) -> vec4<f32> {
  var e = fract(vec3<f32>(1.0, 255.0, 65025.0) * clamp(d, 0.0, 0.99999));
  e = e - e.yzz * vec3<f32>(1.0 / 255.0, 1.0 / 255.0, 0.0);
  return vec4<f32>(e, 1.0);
}

// depth comparison of the four nearest shadow texels, blended bilinearly (smooth, not blocky, edges)
fn shadowBilinear(suv: vec2<f32>, sdepth: f32) -> f32 {
  let texel = u.sh.x;
  let tc = suv / texel - vec2<f32>(0.5, 0.5);
  let cell = floor(tc);
  let fw = tc - cell;
  let c0 = (cell + vec2<f32>(0.5, 0.5)) * texel;
  let ox = vec2<f32>(texel, 0.0);
  let oy = vec2<f32>(0.0, texel);
  let z00 = unpackDepth(textureSampleLevel(shadowTex, shadowSampler, c0, 0.0));
  let z10 = unpackDepth(textureSampleLevel(shadowTex, shadowSampler, c0 + ox, 0.0));
  let z01 = unpackDepth(textureSampleLevel(shadowTex, shadowSampler, c0 + oy, 0.0));
  let z11 = unpackDepth(textureSampleLevel(shadowTex, shadowSampler, c0 + ox + oy, 0.0));
  let lim = sdepth - 0.0006;
  let a00 = step(lim, z00);
  let a10 = step(lim, z10);
  let a01 = step(lim, z01);
  let a11 = step(lim, z11);
  return mix(mix(a00, a10, fw.x), mix(a01, a11, fw.x), fw.y);
}

// filtered sun visibility (1 = lit): bilinear PCF over a rotated Poisson disc
fn sunVisibility(world: vec3<f32>, n: vec3<f32>, seed: vec2<f32>) -> f32 {
  if (u.sh.z <= 0.0) {
    return 1.0;
  }
  // normal offset + a small push towards the sun against acne
  let lc = toLight(world + n * (u.sh.y * 1.6) + sunDir() * 0.15);
  let uv = vec2<f32>(lc.x * 0.5 + 0.5, 0.5 - lc.y * 0.5);
  if (uv.x <= 0.002 || uv.y <= 0.002 || uv.x >= 0.998 || uv.y >= 0.998 || lc.z >= 1.0) {
    return 1.0;
  }
  let d = lc.z;
  let a = hash2(seed) * 6.2831853;
  let cs = cos(a);
  let sn = sin(a);
  let r = u.sh.x * 1.6;
  var taps = array<vec2<f32>, 8>(
    vec2<f32>(-0.326, -0.406), vec2<f32>(-0.840, -0.074), vec2<f32>(-0.696, 0.457), vec2<f32>(-0.203, 0.621),
    vec2<f32>(0.962, -0.195), vec2<f32>(0.473, -0.480), vec2<f32>(0.519, 0.767), vec2<f32>(0.185, -0.893));
  var lit = 0.0;
  for (var k = 0; k < 8; k = k + 1) {
    let tp = taps[k];
    let o = vec2<f32>(tp.x * cs - tp.y * sn, tp.x * sn + tp.y * cs) * r;
    lit = lit + shadowBilinear(uv + o, d);
  }
  let v = lit / 8.0;
  // fade out towards the edge of the shadow map
  let edge = smoothstep(0.0, 0.08, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  return mix(1.0, mix(1.0, v, u.sh.z), edge);
}

// ---------------------------------------------------------------- shading
fn fresnel(f0: vec3<f32>, c: f32) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0, 1.0, 1.0) - f0) * pow(1.0 - c, 5.0);
}

fn ggx(nh: f32, rough: f32) -> f32 {
  let a = rough * rough;
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn smithVis(nv: f32, nl: f32, rough: f32) -> f32 {
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  return 0.25 / ((nv * (1.0 - k) + k) * (nl * (1.0 - k) + k));
}

// aerial perspective: distance haze tinted towards the sun
fn applyFog(c: vec3<f32>, world: vec3<f32>) -> vec3<f32> {
  let v = world - u.cam.xyz;
  let d = length(v);
  let t = clamp((d - u.fog.w) / max(1.0, u.p0.x - u.fog.w), 0.0, 1.0);
  let f = (1.0 - exp(-t * t * 2.6)) * 0.92;
  let sd = max(dot(v / max(d, 0.001), sunDir()), 0.0);
  let haze = lin(u.fog.rgb) * 0.9 + vec3<f32>(1.0, 0.85, 0.6) * pow(sd, 8.0) * 0.35 * u.sun.w;
  return mix(c, haze, clamp(f, 0.0, 1.0));
}

@fragment
fn fs_world(i: VOut) -> @location(0) vec4<f32> {
  let m = i32(i.color.a * 255.0 + 0.5);
  let wp = i.world.xy;
  let t = u.cam.w;
  let V = normalize(u.cam.xyz - i.world);
  var n = normalize(i.normal);
  if (dot(n, V) < 0.0) {
    n = -n;
  }
  var base = lin(i.color.rgb);
  var N = n;
  var rough = 0.6;
  var f0s = 0.04;
  var emissive = vec3<f32>(0.0, 0.0, 0.0);
  var coat = 0.0;
  let model = i.extra.w > 0.5;
  // detail fades with distance so far ground does not shimmer
  let dist = distance(i.world, u.cam.xyz);
  let detail = 1.0 - smoothstep(60.0, 380.0, dist);

  var metal = 0.0;
  if (m == 250) {
    emissive = base * 1.25;
    base = base * 0.2;
  } else if (m == 247) {
    // polished metal (coins, chrome): reflects the sky tinted by its colour
    metal = 1.0;
    rough = 0.22;
    // coins (warm gold) keep a faint glow so they read on night courses too
    emissive = base * select(0.04, 0.35, base.r > base.b * 3.0);
  } else if (m == 245) {
    let c = hsv(fract(t * 0.35 + (wp.x + wp.y) * 0.01 + i.world.z * 0.08)) * 0.75 + vec3<f32>(0.25, 0.25, 0.25);
    emissive = lin(c) * 1.6;
    base = vec3<f32>(0.05, 0.05, 0.05);
    rough = 0.15;
  } else if (m == 246) {
    emissive = lin(i.tint.rgb) * 3.0;
    base = vec3<f32>(0.0, 0.0, 0.0);
  } else if (m == 239) {
    // foliage: clumpy leaf normals, colour variation, per-plant hue
    let q = i.world.xy + vec2<f32>(i.world.z * 0.7, -i.world.z * 0.4);
    let g = noiseGrad(q, 0.9) * 0.9;
    N = normalize(n + vec3<f32>(g.x, g.y, (noise2(q * 1.3) - 0.5) * 0.8));
    base = base * i.tint.rgb * (0.7 + noise2(q * 0.7) * 0.45 + noise2(q * 3.1) * 0.15);
    rough = 0.75;
  } else if (m == 238) {
    // bark: vertical grooves
    let gz = noise2(vec2<f32>(atan2(i.normal.y, i.normal.x) * 6.0, i.world.z * 0.35));
    base = base * (0.7 + gz * 0.5);
    rough = 0.9;
  } else if (m == 248) {
    rough = 0.28;
    f0s = 0.05;
  } else if (m == 249) {
    rough = 0.06;
    f0s = 0.06;
  } else if (m == 240) {
    base = base * lin(i.tint.rgb);
    rough = 0.38;
    coat = 1.0;
  } else if (m == 241) {
    base = base * lin(unpackRgb(i.extra.x));
    rough = 0.55;
  } else if (m == 242) {
    base = base * lin(unpackRgb(i.extra.y));
    rough = 0.62;
  } else if (m == 243) {
    base = base * lin(unpackRgb(i.extra.z));
    rough = 0.35;
    coat = 0.6;
  } else if (m == 10) {
    // grass: mown stripes, clumps, blade-scale variation and bumpy normals
    let stripe = step(0.5, fract((wp.x + wp.y * 0.3) / 26.0)) * 0.1;
    let clump = fbm(wp * 0.07);
    let blades = noise2(wp * 3.1) * 0.5 + noise2(wp * 7.3) * 0.5;
    base = base * (0.72 + stripe + clump * 0.35 + (blades - 0.5) * 0.22 * detail);
    base = mix(base, base * vec3<f32>(1.15, 1.05, 0.7), smoothstep(0.55, 0.9, fbm(wp * 0.021)) * 0.5);
    let g = noiseGrad(wp, 1.9) * 0.35 * detail;
    N = normalize(n + vec3<f32>(g.x, g.y, 0.0));
    rough = 0.92;
  } else if (m == 20) {
    // asphalt: aggregate grain, tar patches and specks
    let grain = noise2(wp * 4.7) * 0.6 + noise2(wp * 11.0) * 0.4;
    let patches = smoothstep(0.55, 0.75, fbm(wp * 0.045));
    base = base * (0.82 + (grain - 0.5) * 0.28 * detail + fbm(wp * 0.11) * 0.2) * (1.0 - patches * 0.18);
    let specks = step(0.93, hash2(floor(wp * 6.0))) * 0.35 * detail;
    base = base + vec3<f32>(specks, specks, specks) * base;
    let g = noiseGrad(wp, 5.0) * 0.12 * detail;
    N = normalize(n + vec3<f32>(g.x, g.y, 0.0));
    rough = 0.62 - patches * 0.12;
  } else if (m == 30) {
    // water: two layers of moving ripples, mostly reflection
    let g1 = noiseGrad(wp + vec2<f32>(t * 3.0, t * 1.8), 0.09);
    let g2 = noiseGrad(wp - vec2<f32>(t * 2.2, -t * 2.6), 0.21);
    N = normalize(vec3<f32>(0.0, 0.0, 1.0) + vec3<f32>(g1.x + g2.x * 0.6, g1.y + g2.y * 0.6, 0.0) * 0.45);
    base = base * 0.35;
    rough = 0.06;
    f0s = 0.02;
  } else if (m == 35) {
    let f = fbm(wp * 0.05 + vec2<f32>(t * 0.15, t * 0.08));
    let crust = smoothstep(0.45, 0.62, fbm(wp * 0.11 - vec2<f32>(t * 0.05, 0.0)));
    let hot = mix(vec3<f32>(0.9, 0.08, 0.0), vec3<f32>(1.0, 0.7, 0.15), smoothstep(0.35, 0.8, f));
    emissive = lin(hot) * mix(4.5, 0.4, crust);
    base = vec3<f32>(0.03, 0.02, 0.02);
    rough = 0.8;
  } else if (m == 40) {
    let ripples = sin(dot(wp, vec2<f32>(0.35, 0.18)) + fbm(wp * 0.2) * 6.0) * 0.5 + 0.5;
    base = base * 0.78 * (0.86 + noise2(wp * 5.0) * 0.12 * detail + fbm(wp * 0.15) * 0.14 + ripples * 0.05);
    let g = noiseGrad(wp, 2.4) * 0.18 * detail;
    N = normalize(n + vec3<f32>(g.x, g.y, 0.0));
    rough = 0.95;
  } else if (m == 50) {
    // snow / ice: bright, glossy with frosty sparkles
    base = base * 0.66 * (0.92 + fbm(wp * 0.1) * 0.1);
    let g = noiseGrad(wp, 1.3) * 0.1 * detail;
    N = normalize(n + vec3<f32>(g.x, g.y, 0.0));
    rough = 0.22;
    f0s = 0.03;
    let sp = step(0.985, hash2(floor(wp * 9.0))) * detail;
    emissive = vec3<f32>(sp, sp, sp) * 0.6;
  }

  // flash (star power / respawn)
  base = mix(base, vec3<f32>(1.0, 1.0, 1.0), i.tint.a * 0.7);
  emissive = emissive + vec3<f32>(1.0, 0.95, 0.7) * i.tint.a * 0.8;

  let L = sunDir();
  let H = normalize(L + V);
  let nl = max(dot(N, L), 0.0);
  let nv = max(dot(N, V), 0.001);
  let nh = max(dot(N, H), 0.0);
  let vh = max(dot(V, H), 0.0);
  let vis = sunVisibility(i.world, n, i.pos.xy);
  let sunC = sunRadiance() * vis;

  let f0 = mix(vec3<f32>(f0s, f0s, f0s), base, metal);
  let F = fresnel(f0, vh);
  let spec = ggx(nh, rough) * smithVis(nv, nl, rough) * F;
  let diffuse = base * (1.0 - metal) * (vec3<f32>(1.0, 1.0, 1.0) - F);
  var c = (diffuse * 0.92 + spec) * sunC * nl;

  // sky light: hemispheric ambient with a little occlusion on downward-facing parts of models
  var ao = 1.0;
  if (model) {
    ao = clamp(0.62 + 0.38 * smoothstep(-0.7, 0.6, N.z), 0.0, 1.0);
  }
  let amb = skyAmbient(N) * (u.misc.x * 2.2 + 0.15);
  c = c + base * (1.0 - metal) * amb * ao;

  // environment reflection of the sky (rough surfaces see a blurred sky)
  let R = reflect(-V, N);
  let Fv = fresnel(f0, nv);
  let sharp = skyColor(R);
  let blurred = skyAmbient(R);
  let env = mix(sharp, blurred, clamp(rough * 1.4, 0.0, 1.0));
  c = c + env * Fv * (1.0 - rough * 0.85) * ao * select(0.6, 1.0, m == 30 || metal > 0.5) * (1.0 + metal * 1.5);

  // clear coat on kart paint: a second, sharp specular layer
  if (coat > 0.0) {
    let Fc = fresnel(vec3<f32>(0.04, 0.04, 0.04), vh).x;
    let cs = ggx(nh, 0.07) * smithVis(nv, nl, 0.07) * Fc;
    c = c * (1.0 - Fc * coat * 0.5) + vec3<f32>(cs, cs, cs) * sunC * nl * coat;
    c = c + env * fresnel(vec3<f32>(0.04, 0.04, 0.04), nv).x * coat * 0.6 * ao;
  }
  // models get a soft rim of sky light so they separate from the background
  if (model) {
    let rim = pow(1.0 - nv, 3.0);
    c = c + skyAmbient(vec3<f32>(0.0, 0.0, 1.0)) * rim * 0.12 * (0.5 + 0.5 * vis);
  }
  // leaves let sunlight through: they glow when the sun is behind them
  if (m == 239) {
    let back = pow(max(dot(-V, L), 0.0), 3.0);
    c = c + base * sunC * (0.15 + back * 0.6) * vec3<f32>(1.0, 1.1, 0.7);
  }
  c = c + emissive;
  c = applyFog(c, i.world);
  return vec4<f32>(c, 1.0);
}

// soft contact shadow under karts, boxes and thwomps (blended): the shadow map draws the real
// shadow, this only darkens the ground right under the object
@fragment
fn fs_shadow(i: VOut) -> @location(0) vec4<f32> {
  let uv = i.color.rg * 2.0 - vec2<f32>(1.0, 1.0);
  let a = (1.0 - smoothstep(0.2, 1.0, length(uv))) * 0.32;
  return vec4<f32>(0.0, 0.0, 0.0, a);
}

// ---------------------------------------------------------------- sky
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

// ---------------------------------------------------------------- Rive billboards (sprite atlas)
// Scenery sprites stand upright and turn to face the camera (like SMK's), signs / banner / crowd are
// fixed quads seen from the front only. Both are alpha tested so the depth buffer sorts them with
// everything else, and they receive (and cast) sun shadows.

struct SpriteOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) uv: vec2<f32>,
}

fn spriteWorld(p: vec3<f32>, off: vec2<f32>, n: vec4<f32>, side: vec3<f32>) -> vec3<f32> {
  var w = p;
  if (n.w > 0.25) {
    w = p + side * off.x + vec3<f32>(0.0, 0.0, off.y);
    if (n.w < 0.75) {
      w.z = w.z + sin(u.cam.w * 1.6 + n.z * 3.14159265) * 2.5;
    }
  }
  return w;
}

@vertex
fn vs_sprite(@location(0) p: vec3<f32>, @location(1) off: vec2<f32>, @location(2) uv: vec2<f32>,
             @location(3) n: vec4<f32>) -> SpriteOut {
  var o: SpriteOut;
  let side = normalize(vec3<f32>(u.right.x, u.right.y, 0.0));
  let w = spriteWorld(p, off, n, side);
  o.world = w;
  o.uv = uv;
  // fixed art quads are hidden from behind
  if (n.w <= 0.25 && dot(u.cam.xy - p.xy, n.xy) < 0.0) {
    o.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return o;
  }
  o.pos = toClip(w);
  return o;
}

@fragment
fn fs_sprite(i: SpriteOut) -> @location(0) vec4<f32> {
  let tx = textureSample(atlasTex, atlasSampler, i.uv);
  if (tx.a < 0.5) {
    discard;
  }
  let base = lin(tx.rgb);
  let vis = sunVisibility(i.world, vec3<f32>(0.0, 0.0, 1.0), i.pos.xy);
  // the artwork carries its own shading: light it as a mostly front-lit card
  let lightAmt = mix(0.55, 1.0, vis) * select(1.0, 0.55, u.misc.z > 0.5);
  var c = base * (sunRadiance() * 0.2 * lightAmt + skyAmbient(vec3<f32>(0.0, 0.0, 1.0)) * 0.55);
  c = applyFog(c, i.world);
  return vec4<f32>(c, 1.0);
}

// ---------------------------------------------------------------- shadow map pass
struct LightOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) depth: f32,
  @location(1) uv: vec2<f32>,
}

fn lightClip(w: vec3<f32>) -> vec4<f32> {
  var c = toLight(w);
  c.y = c.y * u.sh.w;
  return c;
}

@vertex
fn vs_static_light(@location(0) p: vec3<f32>, @location(1) n: vec4<f32>, @location(2) col: vec4<f32>) -> LightOut {
  var o: LightOut;
  o.pos = lightClip(p);
  o.depth = toLight(p).z;
  o.uv = vec2<f32>(0.0, 0.0);
  return o;
}

@vertex
fn vs_inst_light(@location(0) p: vec3<f32>, @location(1) n: vec4<f32>, @location(2) col: vec4<f32>,
                 @location(3) i0: vec4<f32>, @location(4) i1: vec4<f32>, @location(5) i2: vec4<f32>,
                 @location(6) i3: vec4<f32>) -> LightOut {
  var o: LightOut;
  let w = instWorld(p, i0, i1, i2);
  o.pos = lightClip(w);
  o.depth = toLight(w).z;
  o.uv = vec2<f32>(0.0, 0.0);
  return o;
}

@vertex
fn vs_sprite_light(@location(0) p: vec3<f32>, @location(1) off: vec2<f32>, @location(2) uv: vec2<f32>,
                   @location(3) n: vec4<f32>) -> LightOut {
  var o: LightOut;
  // upright sprites cast their shadow as a card turned side-on to the sun
  let side = normalize(vec3<f32>(-u.sun.y, u.sun.x, 0.0001));
  let w = spriteWorld(p, off, n, vec3<f32>(side.x, side.y, 0.0));
  o.pos = lightClip(w);
  o.depth = toLight(w).z;
  o.uv = uv;
  return o;
}

@fragment
fn fs_light(i: LightOut) -> @location(0) vec4<f32> {
  return packDepth(i.depth);
}

@fragment
fn fs_light_sprite(i: LightOut) -> @location(0) vec4<f32> {
  let tx = textureSample(atlasTex, atlasSampler, i.uv);
  if (tx.a < 0.5) {
    discard;
  }
  return packDepth(i.depth);
}

// ---------------------------------------------------------------- post processing
struct FullOut {
  @builtin(position) pos: vec4<f32>,
}

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> FullOut {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: FullOut;
  o.pos = vec4<f32>(pts[vi], 0.0, 1.0);
  return o;
}

// 13-tap downsample (Call of Duty: Advanced Warfare style) of srcTex around uv
fn down13(uv: vec2<f32>) -> vec3<f32> {
  let ts = 1.0 / vec2<f32>(textureDimensions(srcTex, 0));
  let a = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(-2.0, -2.0), 0.0).rgb;
  let b = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(0.0, -2.0), 0.0).rgb;
  let c = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(2.0, -2.0), 0.0).rgb;
  let d = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(-2.0, 0.0), 0.0).rgb;
  let e = textureSampleLevel(srcTex, linSampler, uv, 0.0).rgb;
  let f = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(2.0, 0.0), 0.0).rgb;
  let g = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(-2.0, 2.0), 0.0).rgb;
  let h = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(0.0, 2.0), 0.0).rgb;
  let k = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(2.0, 2.0), 0.0).rgb;
  let l = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(-1.0, -1.0), 0.0).rgb;
  let m = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(1.0, -1.0), 0.0).rgb;
  let n = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(-1.0, 1.0), 0.0).rgb;
  let o = textureSampleLevel(srcTex, linSampler, uv + ts * vec2<f32>(1.0, 1.0), 0.0).rgb;
  return e * 0.125 + (a + c + g + k) * 0.03125 + (b + d + f + h) * 0.0625 + (l + m + n + o) * 0.125;
}

@fragment
fn fs_bright(i: FullOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex, 0)) * 0.5;
  let c = down13(i.pos.xy / dims);
  // soft threshold: only the really bright parts (sun, glints, lava, emissives) bloom
  let br = max(c.r, max(c.g, c.b));
  let k = smoothstep(0.9, 2.2, br);
  return vec4<f32>(min(c * k, vec3<f32>(30.0, 30.0, 30.0)), 1.0);
}

@fragment
fn fs_down(i: FullOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex, 0)) * 0.5;
  return vec4<f32>(down13(i.pos.xy / dims), 1.0);
}

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));
}

@fragment
fn fs_composite(i: FullOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex, 0));
  let uv = i.pos.xy / dims;
  var c = textureSampleLevel(srcTex, linSampler, uv, 0.0).rgb;
  let b = textureSampleLevel(bloomA, linSampler, uv, 0.0).rgb * 0.5
        + textureSampleLevel(bloomB, linSampler, uv, 0.0).rgb * 0.3
        + textureSampleLevel(bloomC, linSampler, uv, 0.0).rgb * 0.35;
  c = c + b * u.post.y;
  c = c * u.post.x;
  // a touch of saturation before the filmic curve, like a graded game image
  let l = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  c = mix(vec3<f32>(l, l, l), c, 1.28);
  c = aces(c);
  // vignette
  let q = uv - vec2<f32>(0.5, 0.5);
  let vig = 1.0 - dot(q, q) * u.post.z;
  c = c * clamp(vig, 0.0, 1.0);
  // sRGB encode + fine grain (also dithers away banding)
  c = pow(c, vec3<f32>(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
  let gr = (hash2(i.pos.xy + vec2<f32>(fract(u.cam.w * 13.0) * 100.0, 0.0)) - 0.5) * u.post.w;
  c = c + vec3<f32>(gr, gr, gr);
  return vec4<f32>(c, 1.0);
}
