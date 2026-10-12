# Contributing to Dariokart

Thanks for helping out! Issues and pull requests are welcome.

## Setup

```bash
npm install
npm run dev          # http://localhost:5173
```

## Before opening a PR

```bash
npm run typecheck    # TypeScript
npm run riv          # rebuild + validate the .riv asset pack (if you touched scripts/rivgen)
npm test             # headless races on every course at every difficulty
npm run build        # production bundle
```

CI runs the same checks.

## Where things live

| Area | Location |
|---|---|
| Simulation (physics, items, laps, AI) | `src/game/` (no DOM, so it runs headless in Node) |
| Rive 3D engine (world renderer) | `src/rive3d/` |
| Rive UI toolkit and menus | `src/ui/` |
| Rive runtime, HUD text, artboard instances | `src/rive/` |
| `.riv` generator (art is code) | `scripts/rivgen/`; preview every artboard at `/riv-preview.html` |
| Audio (procedural, no audio files) | `src/audio/` |
| Online multiplayer | `src/net/` |

## Guidelines

- Keep everything original. Don't add art, music, sounds, logos or names copied from commercial games. Characters and courses are parodies and tributes.
- `npm run riv` must stay green: every artboard is validated against the real Rive runtime.
- If you change driving or AI, run `npm test` and `npm run difficulty`, and mention any change in lap times or falls.
- Match the surrounding code style (TypeScript strict, small focused modules).
