/**
 * Triangle mesh writer for the GPU world (rive/world3d). 20 bytes per vertex: position f32x3,
 * normal snorm8x4, colour unorm8x4 whose alpha is a material id understood by World3DShader.wgsl.
 */

// material ids (see World3DShader.wgsl)
export const MAT = { lit: 255, glow: 250, gloss: 248, eye: 249, metal: 247, leaf: 239, bark: 238, rainbow: 245, sparkle: 246, body: 240, hat: 241, skin: 242, trim: 243, grass: 10, road: 20, water: 30, lava: 35, sand: 40, snow: 50 } as const;
export function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export class MeshWriter {
  private buf = new ArrayBuffer(1 << 20);
  private dv = new DataView(this.buf);
  count = 0;

  private ensure(bytes: number) {
    if (this.count * 20 + bytes <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.count * 20 + bytes));
    new Uint8Array(next).set(new Uint8Array(this.buf));
    this.buf = next;
    this.dv = new DataView(next);
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: [number, number, number], mat: number) {
    this.ensure(20);
    const o = this.count * 20;
    const dv = this.dv;
    dv.setFloat32(o, x, true); dv.setFloat32(o + 4, y, true); dv.setFloat32(o + 8, z, true);
    dv.setInt8(o + 12, Math.round(nx * 127)); dv.setInt8(o + 13, Math.round(ny * 127)); dv.setInt8(o + 14, Math.round(nz * 127)); dv.setInt8(o + 15, 0);
    dv.setUint8(o + 16, c[0]); dv.setUint8(o + 17, c[1]); dv.setUint8(o + 18, c[2]); dv.setUint8(o + 19, mat);
    this.count++;
  }

  /** convex polygon (flat x,y,z list) as a triangle fan with its Newell normal */
  poly(pts: ArrayLike<number>, color: string | [number, number, number], mat: number = MAT.lit) {
    const n = pts.length / 3;
    if (n < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = pts[i * 3], y1 = pts[i * 3 + 1], z1 = pts[i * 3 + 2];
      const x2 = pts[j * 3], y2 = pts[j * 3 + 1], z2 = pts[j * 3 + 2];
      nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const c = typeof color === 'string' ? rgb(color) : color;
    for (let i = 1; i < n - 1; i++) {
      for (const k of [0, i, i + 1]) this.vertex(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], nx, ny, nz, c, mat);
    }
  }

  /** ground-plane quad at height z (corners in order) */
  quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, z: number, color: string | [number, number, number], mat: number = MAT.lit) {
    this.poly([x0, y0, z, x1, y1, z, x2, y2, z, x3, y3, z], color, mat);
  }

  /** axis-aligned (in local model space) box: centre, half extents */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: string, mat: number = MAT.lit, top?: string) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    this.poly([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], top ?? color, mat);
    this.poly([x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0], color, mat);
    this.poly([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], color, mat);
    this.poly([x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], color, mat);
    this.poly([x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1], color, mat);
    this.poly([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], color, mat);
  }

  /** cylinder along an axis ('x' | 'y' | 'z') */
  cylinder(cx: number, cy: number, cz: number, r: number, half: number, axis: 'x' | 'y' | 'z', sides: number, color: string, mat: number = MAT.lit, cap?: string) {
    const ring = (s: number) => Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      return axis === 'z' ? [cx + u, cy + v, cz + s] : axis === 'y' ? [cx + u, cy + s, cz + v] : [cx + s, cy + u, cz + v];
    });
    const a = ring(-half), b = ring(half);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.poly([...a[i], ...a[j], ...b[j], ...b[i]], color, mat);
    }
    this.poly(b.flat(), cap ?? color, mat);
    this.poly(a.slice().reverse().flat(), cap ?? color, mat);
  }

  /** low-poly sphere (UV) */
  sphere(cx: number, cy: number, cz: number, r: number, color: string, mat: number = MAT.lit, rz = r, rings = 6, segs = 10) {
    for (let i = 0; i < rings; i++) {
      const t0 = (i / rings) * Math.PI - Math.PI / 2, t1 = ((i + 1) / rings) * Math.PI - Math.PI / 2;
      for (let j = 0; j < segs; j++) {
        const p0 = (j / segs) * Math.PI * 2, p1 = ((j + 1) / segs) * Math.PI * 2;
        const pt = (t: number, p: number) => [cx + Math.cos(t) * Math.cos(p) * r, cy + Math.cos(t) * Math.sin(p) * r, cz + Math.sin(t) * rz];
        const a = pt(t0, p0), b = pt(t0, p1), c = pt(t1, p1), d = pt(t1, p0);
        // smooth normals: use the radial direction per vertex
        const c3 = typeof color === 'string' ? rgb(color) : color;
        const emit = (q: number[]) => { const nx = q[0] - cx, ny = q[1] - cy, nz = (q[2] - cz) * (r / rz); const l = Math.hypot(nx, ny, nz) || 1; this.vertex(q[0], q[1], q[2], nx / l, ny / l, nz / l, c3, mat); };
        if (i > 0) { emit(a); emit(b); emit(c); }
        if (i < rings - 1) { emit(a); emit(c); emit(d); }
      }
    }
  }

  bytes(): Uint8Array { return new Uint8Array(this.buf, 0, this.count * 20); }
}

