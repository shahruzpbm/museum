/**
 * Procedural canvas textures — used as lazy placeholders, fallbacks
 * and for decorative surfaces (floor, ceiling grid, skyline, plaques…).
 */
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Polished light floor with soft noise and subtle veins. */
export function floorTexture(): THREE.CanvasTexture {
  const key = 'floor';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(512, 512);
  const grad = g.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#e9e6e1');
  grad.addColorStop(0.5, '#ddd9d3');
  grad.addColorStop(1, '#eceae6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // faint marble veins
  g.strokeStyle = 'rgba(160,155,150,0.12)';
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    let x = Math.random() * 512;
    let y = Math.random() * 512;
    g.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (Math.random() - 0.5) * 120;
      y += (Math.random() - 0.5) * 120;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // grain
  const img = g.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c, [9, 6]);
  cache.set(key, t);
  return t;
}

/** Dark ceiling with a fine grid. */
export function ceilingTexture(): THREE.CanvasTexture {
  const key = 'ceiling';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#17171c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i * 256) / 4;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(256, p);
    g.stroke();
  }
  const t = finish(c, [24, 16]);
  cache.set(key, t);
  return t;
}

/** Light warm-white wall. */
export function wallTexture(tint = '#f2f0ec'): THREE.CanvasTexture {
  const key = 'wall' + tint;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  g.fillStyle = tint;
  g.fillRect(0, 0, 128, 128);
  const img = g.getImageData(0, 0, 128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 6;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c, [6, 2]);
  cache.set(key, t);
  return t;
}

/** Soft radial glow used for light pools under pictures. */
export function glowTexture(): THREE.CanvasTexture {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  const rad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  rad.addColorStop(0, 'rgba(255,232,196,0.85)');
  rad.addColorStop(0.45, 'rgba(255,220,180,0.28)');
  rad.addColorStop(1, 'rgba(255,210,170,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 256, 256);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Placeholder "artwork" — abstract generative painting. */
export function fallbackArt(seed: string, title?: string): THREE.CanvasTexture {
  const key = 'art' + seed;
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(640, 480);
  // deterministic pseudo-random from seed
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };

  const palettes = [
    ['#f7e8d8', '#e8b4a2', '#b96f74', '#5c3a45'],
    ['#e8eef2', '#9fc1cc', '#4d7a8c', '#243b4a'],
    ['#f4efe6', '#d9c49a', '#a67f5c', '#54432f'],
    ['#efe9f2', '#c3a3c9', '#7c5f86', '#3c2c46'],
    ['#eef2e8', '#aec9a2', '#6d8f6c', '#33452f'],
    ['#f6ece8', '#e0a98f', '#b26b4f', '#5a2f22'],
  ];
  const pal = palettes[Math.floor(rand() * palettes.length)];
  const grad = g.createLinearGradient(0, 0, 640, 480);
  grad.addColorStop(0, pal[0]);
  grad.addColorStop(1, pal[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 480);

  // abstract shapes
  for (let i = 0; i < 7; i++) {
    g.globalAlpha = 0.16 + rand() * 0.3;
    g.fillStyle = pal[2 + (i % 2)];
    const kind = Math.floor(rand() * 3);
    if (kind === 0) {
      g.beginPath();
      g.ellipse(rand() * 640, rand() * 480, 60 + rand() * 160, 50 + rand() * 130, rand() * 3, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 1) {
      g.fillRect(rand() * 560, rand() * 420, 60 + rand() * 180, 40 + rand() * 140);
    } else {
      g.beginPath();
      g.moveTo(rand() * 640, rand() * 480);
      g.lineTo(rand() * 640, rand() * 480);
      g.lineTo(rand() * 640, rand() * 480);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // soft light sweep
  const sweep = g.createLinearGradient(0, 0, 640, 480);
  sweep.addColorStop(0, 'rgba(255,255,255,0)');
  sweep.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  sweep.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sweep;
  g.fillRect(0, 0, 640, 480);

  // grain
  const img = g.getImageData(0, 0, 640, 480);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  if (title) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '600 22px Georgia, serif';
    g.textAlign = 'center';
    g.fillText(title, 320, 452);
  }

  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Museum label / plaque texture (title + 2 lines under a picture). */
export function plaqueTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 192);
  g.fillStyle = '#111114';
  g.fillRect(0, 0, 512, 192);
  g.fillStyle = '#f5f2ec';
  g.font = '600 34px Georgia, serif';
  g.textAlign = 'left';
  g.fillText(title.slice(0, 28), 36, 74);
  g.fillStyle = 'rgba(245,242,236,0.72)';
  g.font = '22px Helvetica, Arial, sans-serif';
  const words = subtitle.split(' ');
  let line = '';
  let y = 118;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 440) {
      g.fillText(line, 36, y);
      y += 30;
      line = w;
      if (y > 176) break;
    } else line = test;
  }
  if (y <= 176) g.fillText(line, 36, y);
  return finish(c);
}

/** Wall text panel (letters, final message, welcome). */
export function textPanelTexture(title: string, body: string, accent = '#ff6fa5'): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 640);
  g.fillStyle = '#141419';
  g.fillRect(0, 0, 1024, 640);
  // accent bar
  const grad = g.createLinearGradient(0, 0, 1024, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, 'rgba(255,111,165,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 8);

  g.fillStyle = '#f6f3ee';
  g.font = '600 52px Georgia, serif';
  g.fillText(title.slice(0, 40), 64, 110);

  g.fillStyle = 'rgba(246,243,238,0.85)';
  g.font = '28px Helvetica, Arial, sans-serif';
  const words = body.split(' ');
  let line = '';
  let y = 190;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 880) {
      g.fillText(line, 64, y);
      y += 44;
      line = w;
      if (y > 590) {
        line += '…';
        break;
      }
    } else line = test;
  }
  g.fillText(line, 64, y);
  return finish(c);
}

/** Timeline year badge. */
export function yearBadgeTexture(year: string, accent = '#ff6fa5'): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#101014';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(12, 12, 232, 232);
  g.fillStyle = accent;
  g.font = '600 34px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(year.slice(0, 12), 128, 136);
  return finish(c);
}

/** City skyline panorama for the terrace. */
export function skylineTexture(): THREE.CanvasTexture {
  const key = 'skyline';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(2048, 512);
  // evening sky gradient
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#1b2340');
  sky.addColorStop(0.42, '#53456e');
  sky.addColorStop(0.72, '#c9748a');
  sky.addColorStop(0.9, '#e8a06f');
  sky.addColorStop(1, '#3a2c40');
  g.fillStyle = sky;
  g.fillRect(0, 0, 2048, 512);

  // stars
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
    g.fillRect(Math.random() * 2048, Math.random() * 220, 2, 2);
  }
  // sun glow
  const sun = g.createRadialGradient(1400, 360, 10, 1400, 360, 320);
  sun.addColorStop(0, 'rgba(255,210,150,0.9)');
  sun.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = sun;
  g.fillRect(1000, 40, 900, 480);

  // buildings — several depth layers
  const layers = [
    { y: 470, hMax: 190, color: '#2b2440', alpha: 0.85 },
    { y: 500, hMax: 240, color: '#221c33', alpha: 0.95 },
    { y: 512, hMax: 300, color: '#171226', alpha: 1 },
  ];
  for (const layer of layers) {
    g.globalAlpha = layer.alpha;
    let x = -20;
    while (x < 2060) {
      const w = 30 + Math.random() * 90;
      const h = 40 + Math.random() * layer.hMax;
      g.fillStyle = layer.color;
      g.fillRect(x, layer.y - h, w, h + 40);
      // windows
      g.fillStyle = 'rgba(255,210,150,0.55)';
      for (let wy = layer.y - h + 8; wy < layer.y - 12; wy += 14) {
        for (let wx = x + 6; wx < x + w - 8; wx += 12) {
          if (Math.random() > 0.55) g.fillRect(wx, wy, 5, 7);
        }
      }
      x += w + 6 + Math.random() * 24;
    }
  }
  g.globalAlpha = 1;
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Gradient sky background (scene background). */
export function skyTexture(): THREE.CanvasTexture {
  const key = 'sky';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(64, 512);
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#252c48');
  sky.addColorStop(0.5, '#4c4470');
  sky.addColorStop(0.8, '#b3748c');
  sky.addColorStop(1, '#e0a17a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 64, 512);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Soft round particle (hearts, confetti base). */
export function particleTexture(heart = false): THREE.CanvasTexture {
  const key = heart ? 'pheart' : 'pdot';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(128, 128);
  if (heart) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    const x = 64;
    const y = 52;
    const s = 44;
    g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    g.fill();
  } else {
    const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, 128, 128);
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Animated procedural "video" texture fallbacks. */
export class ProceduralVideoTexture {
  texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private c: HTMLCanvasElement;
  private t = 0;
  private mode: string;

  constructor(mode: 'aurora' | 'waves' | 'bars' | 'slideshow' = 'aurora') {
    const [c, g] = canvas(640, 360);
    this.c = c;
    this.g = g;
    this.mode = mode;
    this.texture = finish(c);
  }

  update(dt: number) {
    this.t += dt;
    const g = this.g;
    const w = 640;
    const h = 360;
    const t = this.t;

    if (this.mode === 'aurora') {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${(t * 12) % 360}, 45%, 18%)`);
      grad.addColorStop(0.5, `hsl(${(t * 12 + 60) % 360}, 55%, 30%)`);
      grad.addColorStop(1, `hsl(${(t * 12 + 140) % 360}, 50%, 22%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) {
        g.globalAlpha = 0.16;
        g.fillStyle = `hsl(${(t * 20 + i * 55) % 360}, 70%, 60%)`;
        g.beginPath();
        const y = h * (0.2 + 0.13 * i) + Math.sin(t * 0.8 + i) * 30;
        g.ellipse(((t * 40 + i * 130) % (w + 200)) - 100, y, 190, 55, Math.sin(t * 0.3 + i), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    } else if (this.mode === 'waves') {
      g.fillStyle = '#0d1b2e';
      g.fillRect(0, 0, w, h);
      for (let row = 0; row < 12; row++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = 90 + row * 22 + Math.sin(x * 0.02 + t * 1.4 + row * 0.6) * (10 + row * 1.6);
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokeStyle = `hsla(${195 + row * 8}, 70%, ${40 + row * 3}%, 0.55)`;
        g.lineWidth = 3;
        g.stroke();
      }
    } else if (this.mode === 'bars') {
      g.fillStyle = '#101018';
      g.fillRect(0, 0, w, h);
      const n = 22;
      for (let i = 0; i < n; i++) {
        const bh = 30 + (Math.sin(t * 3 + i * 0.7) * 0.5 + 0.5) * 240;
        g.fillStyle = `hsl(${(i * 14 + t * 30) % 360}, 65%, 55%)`;
        g.fillRect(18 + i * 28, h - bh - 24, 18, bh);
      }
    } else {
      // slideshow
      const idx = Math.floor(t / 4) % 6;
      const hue = idx * 52;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue}, 40%, 25%)`);
      grad.addColorStop(1, `hsl(${hue + 40}, 50%, 45%)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.2)';
      const k = (t % 4) / 4;
      g.beginPath();
      g.ellipse(w * (0.2 + 0.6 * k), h * 0.5, 120, 90, t * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    this.texture.needsUpdate = true;
  }
}

/** Guestbook note card texture. */
export function noteTexture(author: string, text: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 192);
  const tints = ['#fff8e8', '#fdf0f4', '#eef6ff', '#f3f8ec', '#fdf3ec'];
  g.fillStyle = tints[(author.length + text.length) % tints.length];
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#2b2b30';
  g.font = 'italic 24px Georgia, serif';
  g.fillText(author, 18, 36);
  g.fillStyle = '#4a4a52';
  g.font = '18px Helvetica, Arial, sans-serif';
  const words = text.split(' ');
  let line = '';
  let y = 70;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 218) {
      g.fillText(line, 18, y);
      y += 26;
      line = w;
      if (y > 172) break;
    } else line = test;
  }
  if (y <= 172) g.fillText(line, 18, y);
  return finish(c);
}

/** Simple name label sprite texture for avatars. */
export function nameTexture(name: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = 'rgba(10,10,14,0.0)';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = 'rgba(12,12,18,0.72)';
  roundRect(g, 20, 28, 472, 72, 26);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '600 42px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(name.slice(0, 18), 256, 82);
  return finish(c);
}

/** Chat bubble texture for avatars. */
export function bubbleTexture(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(768, 256);
  g.fillStyle = 'rgba(255,255,255,0.0)';
  g.fillRect(0, 0, 768, 256);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(g, 24, 24, 720, 168, 28);
  g.fill();
  // tail
  g.beginPath();
  g.moveTo(350, 190);
  g.lineTo(390, 236);
  g.lineTo(430, 190);
  g.closePath();
  g.fill();
  g.fillStyle = '#1c1c22';
  g.font = '600 40px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  const words = text.split(' ');
  let line = '';
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > 640) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  const startY = 90 - (lines.length - 1) * 16;
  lines.slice(0, 3).forEach((l, i) => g.fillText(l, 384, startY + i * 44));
  return finish(c);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Wood texture for benches. */
export function woodTexture(): THREE.CanvasTexture {
  const key = 'wood';
  if (cache.has(key)) return cache.get(key)!;
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c9a06c';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(120,80,40,${0.08 + Math.random() * 0.18})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) {
      g.lineTo(x, y + Math.sin((x / 256) * Math.PI * 2 + i) * 4);
    }
    g.stroke();
  }
  const t = finish(c, [2, 2]);
  cache.set(key, t);
  return t;
}
