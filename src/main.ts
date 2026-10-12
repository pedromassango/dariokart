import './style.css';
import { App } from './app';
import { Menus } from './ui/menus';
import { audio } from './audio/audio';

async function boot() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const glCanvas = document.getElementById('game3d') as HTMLCanvasElement;
  const app = new App(canvas, glCanvas);
  await app.init();
  const menus = new Menus(app);
  // unlock audio on first gesture (browsers require it)
  const unlock = () => { audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  document.getElementById('boot')!.classList.add('gone');
  const q = new URLSearchParams(location.search);
  if (import.meta.env.DEV && q.get('quick')) menus.quickStart((q.get('mode') as never) || 'race', q.get('quick')!);
  else menus.title();
  if (import.meta.env.DEV) {
    // debugging hooks: advance the simulation deterministically from the console
    (window as unknown as Record<string, unknown>).dariokart = {
      app, menus, audio,
      adv: (sec: number) => { const s = app.session; if (!s) return 'no session'; for (let i = 0; i < sec * 60; i++) s.update(1 / 60); return `${s.race.phase} ${s.race.phaseTime.toFixed(2)}`; },
    };
  }
}

boot().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'FAILED TO START: ' + (e?.message ?? e);
});
