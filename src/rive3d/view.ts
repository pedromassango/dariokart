/**
 * Perspective camera + projection for the Rive 3D renderer.
 * World space: x/y on the ground plane (same as the simulation), z up.
 */
export const NEAR = 1.5;

export class Cam {
  x = 0; y = 0; z = 10;
  yaw = 0; // heading (radians, 0 = +x)
  pitch = 0.12; // looking down (radians)
  fov = 1.02; // vertical field of view (radians)
}

export class View {
  // viewport
  w = 1; h = 1; cx = 0; cy = 0; focal = 1;
  // camera
  px = 0; py = 0; pz = 0;
  // basis
  rx = 0; ry = 0; // right (z = 0)
  ux = 0; uy = 0; uz = 0; // up
  fx = 0; fy = 0; fz = 0; // forward
  // outputs of project()
  sx = 0; sy = 0; depth = 0; scale = 0;
  // camera-space outputs of toCam()
  ox = 0; oy = 0; oz = 0;

  setup(cam: Cam, w: number, h: number) {
    this.w = w; this.h = h; this.cx = w / 2; this.cy = h / 2;
    this.focal = (h / 2) / Math.tan(cam.fov / 2);
    this.px = cam.x; this.py = cam.y; this.pz = cam.z; this.pitch = cam.pitch;
    const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    this.fx = cyw * cp; this.fy = syw * cp; this.fz = -sp;
    this.rx = -syw; this.ry = cyw; // right vector (ground plane, y-down map convention)
    // up = forward × right … choose sign so up has positive z
    this.ux = cyw * sp; this.uy = syw * sp; this.uz = cp;
  }

  /** world → camera space (ox right, oy up, oz forward) */
  toCam(x: number, y: number, z: number) {
    const dx = x - this.px, dy = y - this.py, dz = z - this.pz;
    this.ox = dx * this.rx + dy * this.ry;
    this.oy = dx * this.ux + dy * this.uy + dz * this.uz;
    this.oz = dx * this.fx + dy * this.fy + dz * this.fz;
  }

  /** world → screen; false if behind the near plane */
  project(x: number, y: number, z: number): boolean {
    this.toCam(x, y, z);
    if (this.oz < NEAR) return false;
    const s = this.focal / this.oz;
    this.scale = s;
    this.depth = this.oz;
    this.sx = this.cx + this.ox * s;
    this.sy = this.cy - this.oy * s;
    return true;
  }

  pitch = 0;
  /** screen y of the horizon (ground at infinity): a far ground point sits tan(pitch) above the view centre */
  horizonY(): number {
    return this.cy - Math.tan(this.pitch) * this.focal;
  }
}

// ---------------------------------------------------------------- clipping
const ix = new Float32Array(64), iy = new Float32Array(64), iz = new Float32Array(64);
const tx = new Float32Array(64), ty = new Float32Array(64), tz = new Float32Array(64);
export const out2d = new Float32Array(128);

/**
 * Projects a world-space polygon (flat array x,y,z,...) into out2d, clipping against the near plane.
 * Returns the number of output vertices (0 if fully behind).
 */
export function projectPoly(v: View, pts: ArrayLike<number>, n: number): number {
  let anyFront = false;
  for (let i = 0; i < n; i++) {
    v.toCam(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    ix[i] = v.ox; iy[i] = v.oy; iz[i] = v.oz;
    if (v.oz >= NEAR) anyFront = true;
  }
  if (!anyFront) return 0;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ai = iz[i] >= NEAR, aj = iz[j] >= NEAR;
    if (ai) { tx[m] = ix[i]; ty[m] = iy[i]; tz[m] = iz[i]; m++; }
    if (ai !== aj) {
      const t = (NEAR - iz[i]) / (iz[j] - iz[i]);
      tx[m] = ix[i] + (ix[j] - ix[i]) * t; ty[m] = iy[i] + (iy[j] - iy[i]) * t; tz[m] = NEAR; m++;
    }
  }
  for (let i = 0; i < m; i++) {
    const s = v.focal / tz[i];
    out2d[i * 2] = v.cx + tx[i] * s;
    out2d[i * 2 + 1] = v.cy - ty[i] * s;
  }
  return m;
}
