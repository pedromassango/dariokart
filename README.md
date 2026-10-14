# Dariokart

A Super Mario Kart–inspired kart racer for the web, **rendered entirely with Rive**. Race online or against bots on easy, medium or hard.

<p align="center">
  <img src="docs/media/dariokart-demo.gif" alt="Dariokart action reel: a mushroom boost through the pack, red and green shells launching rivals into the air, star power and lightning, all rendered in Rive" width="720">
</p>

<p align="center">🎬 <a href="docs/media/dariokart-demo.mp4"><b>Watch the full demo with sound</b></a></p>

| | | |
|---|---|---|
| ![Mushroom boost through the pack on Dario Circuit](docs/media/shot-race.jpg) | ![Star power sends rivals flying](docs/media/shot-star.jpg) | ![Course select, drawn with Rive](docs/media/shot-select.jpg) |
| ![Choco Isle](docs/media/shot-choco.jpg) | ![Frost Lake](docs/media/shot-ice.jpg) | ![Finishing on Prism Road](docs/media/shot-prism.jpg) |

## Features

- **3D world in Rive Scripting.** A Luau script and a WGSL shader render the world with shadows, HDR, bloom and physically based lighting.
- **AnimaScript speed lines and boost glow.**
- **All UI in Rive:** menus, HUD and characters.
- **8 SNES-style courses, 8 drivers, and the classic items.**
- **Modes:** Grand Prix, VS Race, Time Trial, 2P split screen, and online for up to 8 players through Firebase.

## Run it

```bash
npm install
npm run dev    # http://localhost:5173
npm test
npm run build
```

Requires Node 20+. Everything except online play works offline. The Rive Scripting projects are covered in [rive/README.md](rive/README.md).

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Accelerate / brake | ↑ ↓ or W S | A / X |
| Steer | ← → or A D | Stick |
| Hop / drift | Space | RB |
| Use item | E | B |
| Pause | Esc | |

On touch devices, on-screen controls appear during races.

## Online play

1. Create a Firebase project with **Realtime Database** and **Anonymous auth**.
2. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values.
3. Deploy the rules: `npx firebase-tools deploy --only database`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Pedro Massango.

Dariokart is a non-commercial fan tribute, not affiliated with Nintendo. All of its art, music and sound effects are original.
