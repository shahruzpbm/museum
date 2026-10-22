/**
 * Entry point — loads museum.config.json and boots the app.
 */
import configJson from '../museum.config.json';
import type { MuseumConfig } from './types';
import { App } from './app';

const cfg = configJson as unknown as MuseumConfig;

async function boot() {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  if (!canvas) return;
  const app = new App(cfg);
  (window as any).__MUSEUM_APP__ = app;
  try {
    await app.init(canvas);
  } catch (err) {
    console.error('Museum boot failed', err);
    const start = document.getElementById('start');
    if (start) {
      const p = document.createElement('p');
      p.style.color = '#ff8fb8';
      p.textContent = 'Не удалось запустить 3D-сцену. Обновите страницу или попробуйте другой браузер.';
      start.appendChild(p);
    }
  }
}

boot();
