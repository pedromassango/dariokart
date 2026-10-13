// MK8-style speed effects in AnimaScript: streaks rushing past the edges of the screen while you are
// fast, thicker and warmer under a boost (mushroom, dash panel, mini-turbo), plus an edge glow.
// Driven by the `SpeedFx` view model: speed 0..1 (of top speed), boost 0..1, drift -1..1.

import { Layout, Context } from "rive/host";
import { Renderer } from "rive/renderer";
import { PropertyNumber } from "rive/data";
import { Color } from "rive/color";
import { Paint, Gradient, GradientStop } from "rive/paint";
import { Path, FillRule } from "rive/path";
import { Vector } from "rive/vector";

const STREAKS: i32 = 46;

export class SpeedFx extends Layout {
    context: Context? = null;
    speedProp: PropertyNumber? = null;
    boostProp: PropertyNumber? = null;
    driftProp: PropertyNumber? = null;
    width: f64 = 0;
    height: f64 = 0;
    time: f64 = 0;
    seed: u32 = 1234567;
    // per streak: angle, phase, speed factor, length factor, width factor
    angle: Float64Array = new Float64Array(STREAKS);
    phase: Float64Array = new Float64Array(STREAKS);
    rate: Float64Array = new Float64Array(STREAKS);
    len: Float64Array = new Float64Array(STREAKS);
    wid: Float64Array = new Float64Array(STREAKS);
    // one path + paint per streak: the renderer reads paths when it flushes, so they cannot be reused
    paths: Array<Path> = [];
    paints: Array<Paint> = [];
    glowPath: Path = new Path();
    glowPaint: Paint = new Paint();
    glow: Gradient? = null;
    level: f64 = 0;
    boostLevel: f64 = 0;

    rand(): f64 {
        this.seed = this.seed * 1664525 + 1013904223;
        return <f64>(this.seed >>> 8) / 16777216.0;
    }

    /// The host may bind the view model after `init`, so look the properties up until they exist.
    bind(): void {
        if (this.speedProp != null) return;
        let context = this.context;
        if (context == null) return;
        let vm = context.viewModel();
        if (vm != null) {
            this.speedProp = vm.getNumber("speed");
            this.boostProp = vm.getNumber("boost");
            this.driftProp = vm.getNumber("drift");
        }
    }

    override init(context: Context): bool {
        this.context = context;
        this.bind();
        for (let i = 0; i < STREAKS; i++) {
            this.angle[i] = this.rand() * Math.PI * 2;
            this.phase[i] = this.rand();
            this.rate[i] = 0.6 + this.rand() * 0.9;
            this.len[i] = 0.5 + this.rand() * 0.8;
            this.wid[i] = 0.5 + this.rand();
            // nonZero: streaks wind either way depending on their direction
            let path = new Path();
            path.fillRule = FillRule.nonZero;
            this.paths.push(path);
            // no feather: the canvas2d backend the game's vector layer uses does not support it
            this.paints.push(new Paint());
        }
        return true;
    }

    override resize(width: f64, height: f64, scale: f64): void {
        this.width = width;
        this.height = height;
    }

    override advance(seconds: f64): bool {
        this.bind();
        let speed: f64 = 0;
        let boost: f64 = 0;
        let sp = this.speedProp;
        if (sp != null) speed = sp.value;
        let bp = this.boostProp;
        if (bp != null) boost = bp.value;
        // ease the effect in and out so it never pops
        let target = Math.max(0, (speed - 0.8) / 0.2) * 0.35 + boost;
        this.level += (Math.min(1.4, target) - this.level) * Math.min(1, seconds * 6);
        this.boostLevel += (boost - this.boostLevel) * Math.min(1, seconds * 5);
        this.time += seconds;
        for (let i = 0; i < STREAKS; i++) {
            this.phase[i] += seconds * this.rate[i] * (1.4 + this.level * 2.2);
            if (this.phase[i] > 1) {
                this.phase[i] -= 1;
                this.angle[i] = this.rand() * Math.PI * 2;
                this.len[i] = 0.5 + this.rand() * 0.8;
            }
        }
        return true;
    }

    override draw(renderer: Renderer): void {
        let w = this.width, h = this.height;
        if (w <= 0 || h <= 0 || this.level < 0.02) return;
        let drift: f64 = 0;
        let dp = this.driftProp;
        if (dp != null) drift = dp.value;
        // vanishing point slightly above centre, nudged against the drift
        let cx = w * (0.5 - drift * 0.06), cy = h * 0.44;
        let R = Math.sqrt(w * w + h * h) * 0.5;
        let lv = Math.min(1.0, this.level);
        let warm = this.boostLevel;

        // edge glow while boosting
        if (warm > 0.03) {
            let a = <i32>(warm * 120);
            let old = this.glow;
            let grad = Gradient.radial(Vector.xy(<f32>cx, <f32>cy), <f32>(R * 1.05), [
                GradientStop(0.55, Color.rgba(255, 140, 40, 0)),
                GradientStop(1.0, Color.rgba(255, 170, 60, a)),
            ]);
            this.glowPaint.gradient = grad;
            this.glow = grad;
            if (old != null) old.release();
            this.glowPath.reset();
            this.glowPath.moveTo(Vector.xy(0, 0));
            this.glowPath.lineTo(Vector.xy(<f32>w, 0));
            this.glowPath.lineTo(Vector.xy(<f32>w, <f32>h));
            this.glowPath.lineTo(Vector.xy(0, <f32>h));
            this.glowPath.close();
            renderer.drawPath(this.glowPath, this.glowPaint);
        }

        // streaks: thin wedges flying outward, only in the outer ring of the screen
        let r = <i32>(255);
        let g = <i32>(255 - warm * 70);
        let b = <i32>(255 - warm * 170);
        let count = <i32>(STREAKS * Math.min(1.0, 0.35 + lv * 0.65));
        for (let i = 0; i < count; i++) {
            let p = this.phase[i];
            let ang = this.angle[i];
            let dx = Math.cos(ang), dy = Math.sin(ang);
            // positions on an ellipse fitted to the viewport: k = 1 touches the screen edge
            let k0 = 0.5 + p * 0.62;
            let k1 = k0 + (0.1 + 0.18 * lv) * this.len[i];
            let ex = w * 0.5, ey = h * 0.5;
            let half = (1.0 + 2.2 * lv + warm * 1.8) * this.wid[i];
            let alpha = <i32>(Math.sin(p * Math.PI) * (80 + 110 * lv));
            if (alpha <= 2) continue;
            let paint = this.paints[i];
            let path = this.paths[i];
            paint.color = Color.rgba(r, g, b, alpha);
            let nx = -dy * half, ny = dx * half;
            // a convex tapered streak: thin tail, widest just before the pointed head
            let ax = cx + dx * ex * k0, ay = cy + dy * ey * k0;
            let mx = cx + dx * ex * k1, my = cy + dy * ey * k1;
            let tl = half * 0.25;
            path.reset();
            path.fillRule = FillRule.nonZero;
            path.moveTo(Vector.xy(<f32>(ax - dy * tl), <f32>(ay + dx * tl)));
            path.lineTo(Vector.xy(<f32>(mx + nx), <f32>(my + ny)));
            path.lineTo(Vector.xy(<f32>(mx + dx * half * 6), <f32>(my + dy * half * 6)));
            path.lineTo(Vector.xy(<f32>(mx - nx), <f32>(my - ny)));
            path.lineTo(Vector.xy(<f32>(ax + dy * tl), <f32>(ay - dx * tl)));
            path.close();
            renderer.drawPath(path, paint);
        }
    }
}
