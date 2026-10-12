// Debug UI: buttons for every SFX and music track plus mixer / engine controls.

import { audio, MUSIC_NAMES, SFX_NAMES } from './audio';

export function mountAudioDemo(el: HTMLElement): () => void {
  const root = document.createElement('div');
  root.style.cssText =
    'font:13px/1.4 system-ui,sans-serif;color:#eee;background:#1b1d2a;padding:12px;border-radius:8px;max-width:760px';
  const btnCss =
    'margin:2px;padding:4px 8px;border:1px solid #556;border-radius:4px;background:#2c3050;color:#fff;cursor:pointer';

  const section = (title: string) => {
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'margin:10px 0 4px;font-weight:600;color:#ffd84a';
    root.appendChild(h);
    const box = document.createElement('div');
    root.appendChild(box);
    return box;
  };
  const button = (box: HTMLElement, label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = btnCss;
    b.addEventListener('click', () => {
      void audio.unlock().then(fn);
    });
    box.appendChild(b);
    return b;
  };
  const slider = (box: HTMLElement, label: string, min: number, max: number, step: number, val: number, fn: (v: number) => void) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:2px 12px 2px 0';
    wrap.append(label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(val);
    input.addEventListener('input', () => fn(parseFloat(input.value)));
    wrap.appendChild(input);
    box.appendChild(wrap);
    return input;
  };
  const checkbox = (box: HTMLElement, label: string, val: boolean, fn: (v: boolean) => void) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:12px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = val;
    input.addEventListener('change', () => fn(input.checked));
    wrap.append(input, label);
    box.appendChild(wrap);
    return input;
  };

  const sfxBox = section('Sound effects');
  for (const name of SFX_NAMES) button(sfxBox, name, () => audio.playSfx(name));

  const musicBox = section('Music');
  for (const name of MUSIC_NAMES) button(musicBox, name, () => audio.playMusic(name));
  button(musicBox, 'stop', () => audio.stopMusic(0.8));
  const tempoBox = document.createElement('div');
  musicBox.appendChild(tempoBox);
  slider(tempoBox, 'tempo', 0.8, 1.4, 0.05, 1, (v) => audio.setMusicTempo(v));
  button(tempoBox, 'final lap x1.15', () => {
    audio.playSfx('finalLap');
    audio.setMusicTempo(1.15);
  });

  const mixBox = section('Mixer');
  const vols = audio.getVolumes();
  slider(mixBox, 'master', 0, 1, 0.01, vols.master, (v) => audio.setMasterVolume(v));
  slider(mixBox, 'music', 0, 1, 0.01, vols.music, (v) => audio.setMusicVolume(v));
  slider(mixBox, 'sfx', 0, 1, 0.01, vols.sfx, (v) => audio.setSfxVolume(v));
  checkbox(mixBox, 'muted', audio.isMuted(), (v) => audio.setMuted(v));

  const engBox = section('Engine');
  const state = { running: false, speed01: 0, onRoad: true, drifting: false, boosting: false };
  const push = () => audio.setEngine({ ...state });
  checkbox(engBox, 'running', false, (v) => {
    state.running = v;
    void audio.unlock().then(push);
  });
  checkbox(engBox, 'on road', true, (v) => { state.onRoad = v; push(); });
  checkbox(engBox, 'drifting', false, (v) => { state.drifting = v; push(); });
  checkbox(engBox, 'boosting', false, (v) => { state.boosting = v; push(); });
  slider(engBox, 'speed', 0, 1, 0.01, 0, (v) => { state.speed01 = v; push(); });

  el.appendChild(root);
  return () => {
    audio.setEngine({ ...state, running: false });
    root.remove();
  };
}
