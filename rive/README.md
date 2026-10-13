# Rive Scripting sources

These are [Rive CLI](https://rive.app/docs/cli/overview) projects. Each one builds a `.riv` with scripts that the
game loads at runtime. The signed outputs are committed in `public/assets/`, so you only need the CLI to change them.

| Project | Output | Language | What it does |
|---|---|---|---|
| `world3d/` | `public/assets/world3d.riv` | Luau + WGSL | The 3D world. A layout script (`World3D.luau`) owns the GPU pipelines, depth buffer and buffers, and a WGSL shader (`World3DShader.wgsl`) does the lighting, fog, sky and clouds, procedural grass, asphalt, sand, water and lava, the rainbow item boxes and soft shadows. The game feeds it the course mesh, the per-frame camera and instances (kart chassis plus one smooth-shaded driver model per character), and a sprite atlas through the `World` view model. The atlas holds the game's Rive billboard artboards (trees, signs, the start banner, the crowd), which the game bakes with the Rive renderer, so they are drawn in the same depth-tested pass as everything else. It runs on `@rive-app/webgl2-advanced` through a deferred session. |
| `speedfx/` | `public/assets/speedfx.riv` | AnimaScript | MK8-style speed lines and boost glow, drawn with Rive paths over the race view. It is driven by the `SpeedFx` view model (`speed`, `boost`, `drift`) and runs on `@rive-app/canvas-advanced`. |

## Working on them

```bash
curl -fsSL https://releases.rive.app/cli/install.sh | bash   # installs `rive` in ~/.rive/bin
npm run rive:verify      # type-check Luau / AnimaScript, compile WGSL (offline, no account)
rive rive/world3d        # live preview window (runs unsigned scripts)
rive login               # once; needed for publishing
npm run rive:publish     # sign both projects and copy the .riv files into public/assets
```

Web runtimes only run Luau scripts and WGSL shaders that Rive has signed, so a changed project must be built with
`--publish` (or `npm run rive:publish`) before the game can use it. AnimaScript compiles to WebAssembly, which the
browser sandboxes, and needs no signature.

Why `world3d` is Luau and not AnimaScript: in Rive CLI 1.5.1, `--publish` does not sign WGSL shaders that live in an
AnimaScript (`scripting: wasm`) project, and the runtime refuses an unsigned shader. Signed shaders work in a Luau
project, so the GPU renderer is Luau. The AnimaScript effect needs no shader.

## Gotchas found along the way

- A script's GPU calls (`gpuCanvas`, render passes) need a render context. On the web, import the file through
  `rive.makeDeferredSession()` and call `renderer.attachSession(session)` on a non-offscreen WebGL2 renderer.
- Paths drawn from scripts default to the `clockwise` fill rule. A contour wound the other way draws nothing, so set
  `path.fillRule = FillRule.nonZero` for geometry whose winding varies.
- `Paint.feather` is a Rive Renderer feature, and the canvas2d runtime skips feathered paints.
- The renderer reads a `Path` when it flushes, so don't reuse one `Path` for several draws in the same frame.
- Scripted artboards need a state machine to advance in the CLI. The web host may also bind the view model after
  `init()`, so look view model properties up lazily.
- `@rive-app/canvas-advanced` commits a renderer's draws when the Rive animation frame that issued them ends. To read
  pixels back (the sprite atlas), draw inside `rive.requestAnimationFrame` and read after that frame.
