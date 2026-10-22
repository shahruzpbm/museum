/**
 * UI layer — HUD, minimap, modals (share/QR, chat, emotes, settings),
 * start screen, mobile joystick, viewing overlay, toasts, elevator panel.
 * Talks to the app through a small bridge interface (no circular imports).
 */
import QRCode from 'qrcode';
import type { EmoteCfg, MuseumConfig, ExhibitCfg, PlayerAnim, Interactable } from './types';
import type { CameraMode } from './player';

export interface UIBridge {
  cfg: MuseumConfig;
  playerName: string;
  setPlayerName(name: string): void;
  getLink(): string;
  getRoomTitle(): string;
  getFloor(): number;
  getPlayerMapPos(): { x: number; z: number };
  teleportTo(x: number, z: number): void;
  switchCamera(): CameraMode;
  sendChat(text: string): void;
  addChatLine(who: string, text: string, sys?: boolean): void;
  playEmote(id: PlayerAnim): void;
  setMuted(m: boolean): void;
  setMusic(on: boolean): void;
  setSteps(on: boolean): void;
  setShadows(on: boolean): void;
  setSensitivity(v: number): void;
  interact(): void;
  openViewing(it: Interactable | null): void;
  closeViewing(): void;
  viewingOpen(): boolean;
  getNearby(): Interactable | null;
  elevatorGo(floor: number): void;
  toggleVideoSound(): void;
  cameraMode: CameraMode;
  minimapFloor: number;
  setMinimapFloor(f: number): void;
  joystick: { x: number; y: number; active: boolean };
  lookDelta: { x: number; y: number };
  zoom(delta: number): void;
  requestFullscreen(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

export class UI {
  app: UIBridge;
  minimapCanvas: HTMLCanvasElement;
  minimapCtx: CanvasRenderingContext2D;
  promptEl: HTMLElement;
  toastTimer = 0;

  constructor(app: UIBridge) {
    this.app = app;
    this.minimapCanvas = $<HTMLCanvasElement>('minimap');
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.promptEl = $('prompt');
    this.bindHud();
    this.bindModals();
    this.bindStart();
    this.bindJoystick();
    this.bindViewing();
    this.buildEmoteGrid(app.cfg.emotes);
    this.updateShareLink();
    this.updateTitle();
  }

  // ------------------------------------------------------------------
  //  HUD
  // ------------------------------------------------------------------

  private updateTitle() {
    $('museum-title').textContent = this.app.cfg.museum.name;
    $('museum-sub').textContent = this.app.cfg.museum.subtitle;
    $('start-title').textContent = this.app.cfg.museum.welcomeTitle;
    $('start-tagline').textContent = this.app.cfg.museum.welcomeText;
    document.title = this.app.cfg.museum.name;
  }

  private bindHud() {
    $('btn-camera').addEventListener('click', () => {
      const mode = this.app.switchCamera();
      this.toast(
        mode === 'third' ? 'Вид от третьего лица' : mode === 'first' ? 'Вид от первого лица' : 'Вид сверху'
      );
    });
    $('btn-emotes').addEventListener('click', () => this.openModal('modal-emotes'));
    $('btn-chat').addEventListener('click', () => this.openModal('modal-chat'));
    $('btn-share').addEventListener('click', () => {
      this.updateShareLink();
      this.openModal('modal-share');
    });
    $('btn-sound').addEventListener('click', () => {
      const btn = $('btn-sound');
      const muted = btn.classList.toggle('muted');
      btn.textContent = muted ? '🔇' : '🔊';
      this.app.setMuted(muted);
    });
    $('btn-settings').addEventListener('click', () => this.openModal('modal-settings'));

    // minimap tabs
    document.querySelectorAll<HTMLDivElement>('.map-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.map-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.app.setMinimapFloor(Number(tab.dataset.floor));
        this.drawMinimap();
      });
    });

    // minimap click → teleport
    this.minimapCanvas.addEventListener('pointerdown', (e) => {
      const rect = this.minimapCanvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 344;
      const my = ((e.clientY - rect.top) / rect.height) * 232;
      const { x, z } = this.minimapToWorld(mx, my);
      this.app.teleportTo(x, z);
      this.toast('Телепортация ✨');
    });

    // elevator buttons
    document.querySelectorAll<HTMLButtonElement>('.floor-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.app.elevatorGo(Number(btn.dataset.floor));
      });
    });

    $('video-sound-btn').addEventListener('click', () => this.app.toggleVideoSound());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.app.viewingOpen()) this.app.closeViewing();
        this.closeModals();
      }
    });
  }

  // ------------------------------------------------------------------
  //  Modals
  // ------------------------------------------------------------------

  private openModal(id: string) {
    this.closeModals();
    $(id).classList.add('show');
  }

  closeModals() {
    document.querySelectorAll('.modal.show').forEach((m) => m.classList.remove('show'));
  }

  private bindModals() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModals());
    });
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('pointerdown', (e) => {
        if (e.target === modal) this.closeModals();
      });
    });

    // share
    $('btn-copy-link').addEventListener('click', async () => {
      const link = this.app.getLink();
      try {
        await navigator.clipboard.writeText(link);
        this.toast('Ссылка скопирована 💗');
      } catch {
        const input = $<HTMLInputElement>('share-link');
        input.select();
        document.execCommand('copy');
        this.toast('Ссылка скопирована');
      }
    });
    $('btn-native-share').addEventListener('click', async () => {
      const link = this.app.getLink();
      if (navigator.share) {
        try {
          await navigator.share({ title: this.app.cfg.museum.name, text: 'Прогуляйся по музею', url: link });
        } catch {
          /* cancelled */
        }
      } else {
        try {
          await navigator.clipboard.writeText(link);
          this.toast('Ссылка скопирована');
        } catch {
          this.toast('Скопируйте ссылку вручную');
        }
      }
    });

    // chat
    $<HTMLFormElement>('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $<HTMLInputElement>('chat-input');
      const text = input.value.trim();
      if (!text) return;
      this.app.sendChat(text);
      input.value = '';
    });

    // settings
    const nameInput = $<HTMLInputElement>('setting-name');
    nameInput.value = this.app.playerName;
    nameInput.addEventListener('change', () => {
      this.app.setPlayerName(nameInput.value.trim() || 'Гость');
    });
    $<HTMLInputElement>('setting-sens').addEventListener('input', (e) => {
      this.app.setSensitivity(Number((e.target as HTMLInputElement).value));
    });
    $<HTMLInputElement>('setting-shadows').addEventListener('change', (e) => {
      this.app.setShadows((e.target as HTMLInputElement).checked);
    });
    $<HTMLInputElement>('setting-music').addEventListener('change', (e) => {
      this.app.setMusic((e.target as HTMLInputElement).checked);
    });
    $<HTMLInputElement>('setting-steps').addEventListener('change', (e) => {
      this.app.setSteps((e.target as HTMLInputElement).checked);
    });
  }

  buildEmoteGrid(emotes: EmoteCfg[]) {
    const grid = $('emote-grid');
    grid.innerHTML = '';
    for (const e of emotes) {
      const btn = document.createElement('button');
      btn.className = 'emote-btn';
      btn.innerHTML = `<span>${e.icon}</span><small>${e.label}</small>`;
      btn.addEventListener('click', () => {
        this.app.playEmote(e.id as PlayerAnim);
        this.closeModals();
        this.toast(`${e.icon} ${e.label}`);
      });
      grid.appendChild(btn);
    }
  }

  // ------------------------------------------------------------------
  //  Share + QR (standard + pink heart)
  // ------------------------------------------------------------------

  updateShareLink() {
    const link = this.app.getLink();
    $<HTMLInputElement>('share-link').value = link;
    // standard QR
    QRCode.toDataURL(link, {
      width: 296,
      margin: 1,
      color: { dark: '#141419', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => ($<HTMLImageElement>('qr-standard').src = url))
      .catch(() => {});
    // pink heart-styled QR
    this.makeHeartQR(link).then((url) => {
      if (url) $<HTMLImageElement>('qr-heart').src = url;
    });
  }

  /** QR rendered with pink heart-shaped dots, clipped into a heart silhouette. */
  private async makeHeartQR(text: string): Promise<string | null> {
    try {
      const qr: any = await (QRCode as any).create(text, { errorCorrectionLevel: 'M' });
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = 8;
      const quiet = 4;
      const dim = (size + quiet * 2) * scale;
      const canvas = document.createElement('canvas');
      canvas.width = dim;
      canvas.height = dim;
      const g = canvas.getContext('2d')!;

      // heart-shaped white background mask
      const heartPath = (cx: number, cy: number, s: number) => {
        g.beginPath();
        const x = cx;
        const y = cy - s * 0.12;
        g.moveTo(x, y + s * 0.95);
        g.bezierCurveTo(x - s * 1.55, y - s * 0.05, x - s * 0.62, y - s * 1.18, x, y - s * 0.32);
        g.bezierCurveTo(x + s * 0.62, y - s * 1.18, x + s * 1.55, y - s * 0.05, x, y + s * 0.95);
        g.closePath();
      };

      // white full background so the QR stays scannable
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, dim, dim);

      // pink gradient
      const grad = g.createLinearGradient(0, 0, dim, dim);
      grad.addColorStop(0, '#ff5f9e');
      grad.addColorStop(0.5, '#ff8fb8');
      grad.addColorStop(1, '#e8437f');

      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (!data[row * size + col]) continue;
          const cx = (col + quiet + 0.5) * scale;
          const cy = (row + quiet + 0.5) * scale;
          g.fillStyle = grad;
          // finder patterns stay square-ish for scannability
          const inFinder =
            (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);
          if (inFinder) {
            g.fillRect((col + quiet) * scale + 0.5, (row + quiet) * scale + 0.5, scale - 1, scale - 1);
          } else {
            // tiny heart dot
            heartPath(cx, cy, scale * 0.42);
            g.fill();
          }
        }
      }

      // decorative pink heart outline
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(255,95,158,0.85)';
      heartPath(dim / 2, dim / 2, dim / 2 - 6);
      g.stroke();

      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  //  Start screen
  // ------------------------------------------------------------------

  private bindStart() {
    const start = $('start');
    const nameInput = $<HTMLInputElement>('start-name');
    const params = new URLSearchParams(location.search);
    const urlName = params.get('name') || params.get('Name');
    if (urlName) nameInput.value = urlName;
    else nameInput.value = this.app.playerName;

    $('btn-continue').addEventListener('click', async () => {
      const name = nameInput.value.trim() || 'Гость';
      this.app.setPlayerName(name);
      this.app.requestFullscreen();
      start.classList.add('hidden');
      window.setTimeout(() => (start.style.display = 'none'), 700);
    });

    // loading bar animation (progress set by app)
    this.setLoading(0.2);
  }

  setLoading(p: number) {
    $('loading-fill').style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  }

  hideStartScreen() {
    const start = $('start');
    start.classList.add('hidden');
    window.setTimeout(() => (start.style.display = 'none'), 700);
  }

  // ------------------------------------------------------------------
  //  Joystick + look
  // ------------------------------------------------------------------

  private bindJoystick() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('mobile');

    const zone = $('joystick-zone');
    const base = $('joystick-base');
    const stick = $('joystick-stick');
    let originX = 0;
    let originY = 0;
    let touchId: number | null = null;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchId = t.identifier;
      originX = t.clientX;
      originY = t.clientY;
      base.style.display = 'block';
      base.style.left = `${originX - 58}px`;
      base.style.top = `${originY - 58}px`;
      this.app.joystick.active = true;
    });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchId) continue;
        const dx = t.clientX - originX;
        const dy = t.clientY - originY;
        const max = 48;
        const len = Math.hypot(dx, dy) || 1;
        const cl = Math.min(1, len / max);
        const nx = (dx / len) * cl;
        const ny = (dy / len) * cl;
        stick.style.left = `${32 + nx * 40}px`;
        stick.style.top = `${32 + ny * 40}px`;
        this.app.joystick.x = nx;
        this.app.joystick.y = ny;
      }
    });

    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== touchId) continue;
        touchId = null;
        base.style.display = 'none';
        stick.style.left = '32px';
        stick.style.top = '32px';
        this.app.joystick.active = false;
        this.app.joystick.x = 0;
        this.app.joystick.y = 0;
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);

    // right-side look: swipe on the canvas
    const canvas = document.getElementById('scene')!;
    let lookId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let downTime = 0;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastX = t.clientX;
      lastY = t.clientY;
      downTime = performance.now();
      downX = t.clientX;
      downY = t.clientY;
    });
    canvas.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== lookId) continue;
          const dx = t.clientX - lastX;
          const dy = t.clientY - lastY;
          this.app.lookDelta.x += dx * 2.1;
          this.app.lookDelta.y += dy * 1.6;
          lastX = t.clientX;
          lastY = t.clientY;
        }
      },
      { passive: true }
    );
    canvas.addEventListener('touchend', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== lookId) continue;
        lookId = null;
        // tap (short, small movement) → interact / close viewing
        const dt = performance.now() - downTime;
        const moved = Math.hypot(t.clientX - downX, t.clientY - downY);
        if (dt < 260 && moved < 14) {
          if (this.app.viewingOpen()) this.app.closeViewing();
          else this.app.interact();
        }
      }
    });
  }

  // ------------------------------------------------------------------
  //  Viewing overlay
  // ------------------------------------------------------------------

  private bindViewing() {
    $('viewing-close').addEventListener('click', () => this.app.closeViewing());
    $('viewing').addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).id === 'viewing') this.app.closeViewing();
    });
  }

  showViewing(exhibit: ExhibitCfg | null, fallbackDataUrl?: string) {
    const img = $<HTMLImageElement>('viewing-img');
    const title = $('viewing-title');
    const desc = $('viewing-desc');
    const meta = $('viewing-meta');
    if (exhibit) {
      title.textContent = exhibit.title;
      desc.textContent = exhibit.description;
      meta.textContent = `${exhibit.year ?? ''} · ${this.app.cfg.rooms[exhibit.room]?.title ?? exhibit.room}`.toUpperCase();
      img.style.display = 'block';
      img.onerror = () => {
        if (fallbackDataUrl) img.src = fallbackDataUrl;
      };
      img.src = exhibit.src || fallbackDataUrl || '';
      if (!exhibit.src && fallbackDataUrl) img.src = fallbackDataUrl;
    }
    $('viewing').classList.add('show');
  }

  hideViewing() {
    $('viewing').classList.remove('show');
  }

  // ------------------------------------------------------------------
  //  Prompt / toast / chat / elevator / stats
  // ------------------------------------------------------------------

  setPrompt(text: string | null) {
    if (!text) {
      this.promptEl.classList.remove('show');
      return;
    }
    this.promptEl.innerHTML = text;
    this.promptEl.classList.add('show');
  }

  toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2400);
  }

  addChatLine(who: string, text: string, sys = false) {
    const box = $('chat-messages');
    const line = document.createElement('div');
    line.className = 'chat-line' + (sys ? ' sys' : '');
    line.innerHTML = sys ? `${escapeHtml(text)}` : `<span class="who">${escapeHtml(who)}:</span>${escapeHtml(text)}`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  setHereCount(n: number) {
    $('here-count').textContent = `${n} here`;
  }

  setRoomTitle(title: string) {
    $('room-chip').textContent = title;
  }

  setFloorIndicator(floor: number) {
    $('floor-indicator').textContent = `Вы на этаже ${floor + 1}`;
    document.querySelectorAll<HTMLDivElement>('.map-tab').forEach((tab) => {
      tab.classList.toggle('active', Number(tab.dataset.floor) === this.app.minimapFloor);
    });
    document.querySelectorAll<HTMLButtonElement>('.floor-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.floor) === floor);
    });
    this.drawMinimap();
  }

  showElevatorUI(show: boolean) {
    $('elevator-ui').classList.toggle('show', show);
  }

  showVideoSoundBtn(show: boolean) {
    $('video-sound-btn').classList.toggle('show', show);
  }

  // ------------------------------------------------------------------
  //  Minimap
  // ------------------------------------------------------------------

  private worldToMinimap(x: number, z: number): { mx: number; my: number } {
    const pad = 14;
    const w = 344 - pad * 2;
    const h = 232 - pad * 2;
    // building spans x -36..36, z -24..24
    const mx = pad + ((x + 36) / 72) * w;
    const my = pad + ((z + 24) / 48) * h;
    return { mx, my };
  }

  private minimapToWorld(mx: number, my: number): { x: number; z: number } {
    const pad = 14;
    const w = 344 - pad * 2;
    const h = 232 - pad * 2;
    const x = ((mx - pad) / w) * 72 - 36;
    const z = ((my - pad) / h) * 48 - 24;
    return { x, z };
  }

  drawMinimap() {
    const g = this.minimapCtx;
    const floor = this.app.minimapFloor;
    g.clearRect(0, 0, 344, 232);
    // background
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, 344, 232);

    // rooms
    for (const r of (window as any).__ROOM_RECTS__ ?? []) {
      if (r.floor !== floor) continue;
      const a = this.worldToMinimap(r.x1, r.z1);
      const b = this.worldToMinimap(r.x2, r.z2);
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.strokeStyle = 'rgba(255,255,255,0.32)';
      g.lineWidth = 1.2;
      g.beginPath();
      const rw = b.mx - a.mx;
      const rh = b.my - a.my;
      if (typeof (g as any).roundRect === 'function') {
        (g as any).roundRect(a.mx, a.my, rw, rh, 3);
      } else {
        g.rect(a.mx, a.my, rw, rh);
      }
      g.fill();
      g.stroke();
      // room label
      const info = this.app.cfg.rooms[r.id];
      if (info) {
        g.fillStyle = 'rgba(255,255,255,0.72)';
        g.font = '7px Georgia';
        g.textAlign = 'center';
        g.fillText(info.title.slice(0, 16), (a.mx + b.mx) / 2, (a.my + b.my) / 2 + 2);
      }
    }

    // atrium hole
    if (floor === 1) {
      const a = this.worldToMinimap(-8, -8);
      const b = this.worldToMinimap(8, 8);
      g.fillStyle = 'rgba(10,10,16,0.65)';
      g.fillRect(a.mx, a.my, b.mx - a.mx, b.my - a.my);
      g.strokeStyle = 'rgba(255,111,165,0.5)';
      g.strokeRect(a.mx, a.my, b.mx - a.mx, b.my - a.my);
    }

    // stairs marker
    const s1 = this.worldToMinimap(-6, -8);
    const s2 = this.worldToMinimap(6, 8.4);
    g.fillStyle = 'rgba(255,214,165,0.28)';
    g.fillRect(s1.mx, s1.my, s2.mx - s1.mx, s2.my - s1.my);

    // player
    const p = this.app.getPlayerMapPos();
    const pm = this.worldToMinimap(p.x, p.z);
    g.fillStyle = '#ff6fa5';
    g.beginPath();
    g.arc(pm.mx, pm.my, 5.5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.8;
    g.stroke();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
