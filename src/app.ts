/**
 * App — orchestrates renderer, world, player, UI, network, audio, effects.
 * Implements the UIBridge used by the UI layer.
 */
import * as THREE from 'three';
import type { MuseumConfig, Interactable, ExhibitCfg, PlayerAnim, NetState } from './types';
import { CollisionWorld } from './collisions';
import { MuseumWorld } from './museum';
import { Avatar } from './avatar';
import { Player, type CameraMode } from './player';
import { RemotePlayers } from './remote';
import { Network } from './network';
import { AudioEngine } from './audio';
import { Effects } from './effects';
import { UI, type UIBridge } from './ui';
import { ROOM_RECTS, roomAt, BUILDING } from './geometry';
import { fallbackArt, skyTexture } from './textures';

export class App implements UIBridge {
  cfg: MuseumConfig;
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  coll = new CollisionWorld();
  world!: MuseumWorld;
  player!: Player;
  remotes!: RemotePlayers;
  net = new Network();
  audio = new AudioEngine();
  effects!: Effects;
  ui!: UI;

  playerName = 'Гость';
  cameraMode: CameraMode = 'third';
  minimapFloor = 0;
  joystick = { x: 0, y: 0, active: false };
  lookDelta = { x: 0, y: 0 };
  sensitivity = 1;

  private viewing = false;
  private viewingIt: Interactable | null = null;
  private viewingCamPos = new THREE.Vector3();
  private viewingCamLook = new THREE.Vector3();
  private savedCamMode: CameraMode = 'third';
  private confettiDone = false;
  private lastRoom = '';
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private videoSoundOn = false;
  private started = false;

  constructor(cfg: MuseumConfig) {
    this.cfg = cfg;
    this.sensitivity = cfg.settings.camera.sensitivity;
  }

  // ------------------------------------------------------------------
  //  init
  // ------------------------------------------------------------------

  async init(canvas: HTMLCanvasElement) {
    // renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.cfg.settings.quality.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.cfg.settings.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    // camera
    this.camera = new THREE.PerspectiveCamera(this.cfg.settings.camera.fov, window.innerWidth / window.innerHeight, 0.1, 320);
    this.camera.position.set(0, 5, 22);

    // sky background
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x2a2740, 90, 220);

    // world
    this.world = new MuseumWorld(this.scene, this.cfg, this.coll);
    this.effects = new Effects(this.scene);

    // player + avatar
    const avatar = new Avatar({ color: 0x6c7ee1, name: this.playerName, isLocal: true });
    this.scene.add(avatar.group);
    this.player = new Player(avatar, this.coll, this.cfg);
    this.player.pos.set(0, 0, 19);
    this.player.yaw = Math.PI;
    this.player.cameraYaw = Math.PI;
    this.player.onStep = () => this.audio.step(this.player.run);
    this.player.onFloorChange = (f) => {
      this.minimapFloor = f;
      this.ui.setFloorIndicator(f);
    };

    // remotes
    this.remotes = new RemotePlayers(this.scene);

    // ui
    (window as any).__ROOM_RECTS__ = ROOM_RECTS;
    this.ui = new UI(this);
    this.ui.setLoading(0.65);

    this.bindInput();
    this.bindNetwork();

    // greeting with URL name
    const params = new URLSearchParams(location.search);
    const urlName = params.get('name');
    if (urlName) {
      this.playerName = urlName.slice(0, 18);
      this.player.avatar.setName(this.playerName);
    }

    this.ui.setLoading(1);
    this.ui.setFloorIndicator(0);
    this.ui.drawMinimap();

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    // start loop
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());

    // auto-hide start screen on desktop after continue; keep for mobile
    this.started = true;
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ------------------------------------------------------------------
  //  input
  // ------------------------------------------------------------------

  private bindInput() {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.player.handleKey(e.code, true);
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.toggleSit();
      if (e.code === 'KeyC') this.switchCamera();
      if (e.code === 'Digit1') this.elevatorGo(0);
      if (e.code === 'Digit2') this.elevatorGo(1);
      if (e.code === 'Enter') {
        e.preventDefault();
        this.ui.closeModals();
        const chatModal = document.getElementById('modal-chat')!;
        chatModal.classList.add('show');
        (document.getElementById('chat-input') as HTMLInputElement).focus();
      }
      if (e.code === 'Escape') {
        if (this.viewing) this.closeViewing();
        this.ui.closeModals();
      }
    });
    window.addEventListener('keyup', (e) => this.player.handleKey(e.code, false));

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // handled by UI gestures
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerType === 'touch') return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.lookDelta.x += dx * 2.2;
      this.lookDelta.y += dy * 1.7;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') this.dragging = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 0.35 : -0.35);
      },
      { passive: false }
    );

    // click on canvas = interact (desktop tap also closes viewing)
    canvas.addEventListener('click', (e) => {
      if (e.pointerType === 'touch') return;
      if (this.viewing) {
        this.closeViewing();
        return;
      }
      // try raycast to an exhibit first
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.world.frames.map((f) => f.group), true);
      if (hits.length) {
        const group = hits[0].object.parent;
        const frame = this.world.frames.find((f) => f.group === group || f.group === hits[0].object);
        if (frame?.exhibit) {
          const it = this.world.interactables.find((i) => i.id === frame.exhibit!.id);
          if (it) {
            this.openViewing(it);
            return;
          }
        }
      }
      this.interact();
    });
  }

  // ------------------------------------------------------------------
  //  network
  // ------------------------------------------------------------------

  private bindNetwork() {
    const m = this.cfg.settings.multiplayer;
    if (!m.enabled) return;
    this.net.events = {
      onJoin: (players) => {
        players.forEach((p) => this.remotes.add(p.id, p));
        this.refreshCount();
        this.ui.toast(players.length ? `Здесь уже ${players.length} гостей` : 'Вы одни в музее');
      },
      onPlayerJoin: (p) => {
        this.remotes.add(p.id, p);
        this.refreshCount();
        this.ui.addChatLine('', `${p.name || 'Гость'} зашёл(ла) в музей`, true);
      },
      onPlayerLeave: (id) => {
        this.remotes.remove(id);
        this.refreshCount();
      },
      onState: (id, state) => {
        this.remotes.setState(id, state);
      },
      onChat: (id, name, text) => {
        this.remotes.chat(id, text);
        this.ui.addChatLine(name, text);
      },
      onStatus: (status) => {
        if (status === 'online') this.ui.toast('Мультиплеер подключён 🌐');
        if (status === 'offline') this.ui.toast('Одиночный режим (сервер не найден)');
      },
    };
    this.net.connect(m.room, this.playerName, m.tickRate);
  }

  private refreshCount() {
    this.ui.setHereCount(this.remotes.count);
  }

  // ------------------------------------------------------------------
  //  interactions
  // ------------------------------------------------------------------

  getNearby(): Interactable | null {
    return this.world.nearestInteractable(this.player.pos, 3.4);
  }

  interact() {
    const it = this.getNearby();
    if (!it) return;
    switch (it.kind) {
      case 'exhibit':
      case 'letter':
      case 'final':
        if (it.kind === 'final') this.triggerConfetti();
        this.openViewing(it);
        break;
      case 'video':
        this.toggleVideoSound();
        break;
      case 'vinyl':
        this.audio.setMusic(!this.audio.musicOn);
        this.ui.toast(this.audio.musicOn ? '🎵 Музыка играет' : '⏸ Музыка выключена');
        break;
      case 'guestbook':
        this.ui.closeModals();
        document.getElementById('modal-chat')!.classList.add('show');
        (document.getElementById('chat-input') as HTMLInputElement).value = 'Запись в гостевую книгу: ';
        (document.getElementById('chat-input') as HTMLInputElement).focus();
        break;
      case 'elevator':
        this.ui.showElevatorUI(true);
        break;
      case 'bench':
        this.toggleSit();
        break;
      default:
        this.openViewing(it);
    }
  }

  toggleSit() {
    if (this.player.sitting) {
      this.player.stand();
      this.ui.toast('Вы встали');
      return;
    }
    const it = this.getNearby();
    if (it && (it.kind === 'bench' || it.kind === 'vinyl')) {
      this.player.sit(it);
      this.ui.toast('Вы сели. F — встать');
    }
  }

  openViewing(it: Interactable | null) {
    if (!it) return;
    this.viewing = true;
    this.viewingIt = it;
    this.savedCamMode = this.player.mode;
    this.player.mode = 'third';

    // camera viewpoint: from the player's side of the exhibit, close up
    const p = this.player.pos;
    const dir = new THREE.Vector3(p.x - it.position.x, 0, p.z - it.position.z);
    if (dir.lengthSq() < 0.05) dir.set(0, 0, 1);
    dir.normalize();
    this.viewingCamPos.set(
      it.position.x + dir.x * 2.15,
      it.position.y + 0.12,
      it.position.z + dir.z * 2.15
    );
    this.viewingCamLook.set(it.position.x, it.position.y, it.position.z);

    let exhibit: ExhibitCfg | null = this.world.exhibitOf(it);
    if (!exhibit && it.data && it.data.title) {
      exhibit = {
        id: it.id,
        room: it.data.room ?? 'history',
        title: it.data.title,
        description: it.data.description ?? '',
        src: it.data.src ?? '',
        year: it.data.year,
      };
    }
    if (!exhibit && it.kind === 'final') {
      exhibit = {
        id: 'final',
        room: 'final',
        title: this.cfg.museum.finalTitle,
        description: this.cfg.museum.finalMessage,
        src: '',
      };
    }

    // fallback canvas art as data URL
    let fallback: string | undefined;
    if (exhibit) {
      const tex = fallbackArt(exhibit.id, exhibit.title);
      const img = tex.image as HTMLCanvasElement;
      try {
        fallback = img.toDataURL('image/jpeg', 0.85);
      } catch {
        fallback = undefined;
      }
    }
    this.ui.showViewing(exhibit, fallback);
  }

  closeViewing() {
    this.viewing = false;
    this.viewingIt = null;
    this.player.mode = this.savedCamMode;
    this.ui.hideViewing();
  }

  viewingOpen(): boolean {
    return this.viewing;
  }

  toggleVideoSound() {
    this.videoSoundOn = !this.videoSoundOn;
    for (const v of this.world.videoElements) {
      v.muted = !this.videoSoundOn;
      if (this.videoSoundOn) v.play().catch(() => {});
    }
    if (this.world.videoElements.length === 0) {
      // procedural video — toggle music instead
      this.audio.setMusic(this.videoSoundOn);
    }
    this.ui.showVideoSoundBtn(this.videoSoundOn);
    this.ui.toast(this.videoSoundOn ? '🔊 Звук видео включён' : '🔇 Звук видео выключен');
    if (this.videoSoundOn) {
      // lower ambient music while video sound is on
      this.audio.setMusic(false);
    }
  }

  triggerConfetti() {
    if (!this.cfg.museum.confetti) return;
    this.effects.burst(this.world.confettiAnchor.clone(), 140);
    this.audio.click(880);
    this.ui.toast('🎉 Конфетти!');
  }

  elevatorGo(floor: number) {
    this.world.setElevatorFloor(floor);
    this.ui.showElevatorUI(true);
    this.ui.toast(floor === 1 ? '⬆ Этаж 2' : '⬇ Этаж 1');
  }

  // ------------------------------------------------------------------
  //  camera / mode
  // ------------------------------------------------------------------

  switchCamera(): CameraMode {
    this.cameraMode = this.player.cycleCamera();
    return this.cameraMode;
  }

  zoom(delta: number) {
    const c = this.cfg.settings.camera;
    this.player.camDistance = Math.max(c.minDistance, Math.min(c.maxDistance, this.player.camDistance + delta));
  }

  // ------------------------------------------------------------------
  //  UIBridge impl
  // ------------------------------------------------------------------

  setPlayerName(name: string) {
    this.playerName = name;
    this.player.avatar.setName(name);
  }

  getLink(): string {
    const url = new URL(location.href);
    url.searchParams.set('name', this.playerName);
    return url.toString();
  }

  getRoomTitle(): string {
    return this.lastRoom;
  }

  getFloor(): number {
    return this.player.floor;
  }

  getPlayerMapPos(): { x: number; z: number } {
    return { x: this.player.pos.x, z: this.player.pos.z };
  }

  teleportTo(x: number, z: number) {
    // keep current floor unless the target clearly is the other floor's room
    this.player.teleport(x, z, this.minimapFloor);
  }

  sendChat(text: string) {
    this.ui.addChatLine(this.playerName, text);
    this.player.avatar.showBubble(text);
    if (this.net.connected) this.net.sendChat(text);
  }

  addChatLine(who: string, text: string, sys?: boolean): void {
    this.ui.addChatLine(who, text, sys);
  }

  playEmote(id: PlayerAnim) {
    this.player.setEmote(id);
    this.audio.click(520 + Math.random() * 180);
    if (id === 'hearts' || id === 'kiss') this.player.avatar.triggerHearts();
  }

  setMuted(m: boolean) {
    this.audio.setMuted(m);
  }

  setMusic(on: boolean) {
    this.audio.setMusic(on);
  }

  setSteps(on: boolean) {
    this.audio.setSteps(on);
  }

  setShadows(on: boolean) {
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = mesh.material as THREE.Material;
        mat.needsUpdate = true;
      }
    });
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    this.cfg.settings.camera.sensitivity = v;
    this.player.cfg.settings.camera.sensitivity = v;
  }

  requestFullscreen(): void {
    this.audio.start();
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    // lock landscape on mobile where supported
    const orientation = (screen as any).orientation;
    if (orientation?.lock) {
      orientation.lock('landscape').catch(() => {});
    }
    // hide start screen from UI if not done
    this.ui.hideStartScreen();
  }

  setMinimapFloor(f: number): void {
    this.minimapFloor = f;
  }

  // ------------------------------------------------------------------
  //  main loop
  // ------------------------------------------------------------------

  private tick() {
    const dt = Math.min(0.05, this.clock.getDelta());

    // player
    this.player.lookDelta.x = this.lookDelta.x;
    this.player.lookDelta.y = this.lookDelta.y;
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    this.player.update(dt);
    this.player.avatar.update(dt);

    // remotes
    this.remotes.update(dt);

    // world + effects
    this.world.update(dt, this.player.pos);
    this.effects.update(dt);

    // camera
    if (this.viewing) {
      this.camera.position.lerp(this.viewingCamPos, Math.min(1, dt * 3.2));
      const look = new THREE.Vector3();
      this.camera.getWorldDirection(look);
      const target = this.viewingCamLook;
      const currentLook = this.camera.position.clone().add(look.multiplyScalar(3));
      currentLook.lerp(target, Math.min(1, dt * 4));
      this.camera.lookAt(currentLook);
    } else {
      this.camera.position.copy(this.player.camPos);
      this.camera.lookAt(this.player.camLook);
    }

    // network broadcast
    const state: NetState = {
      x: this.player.pos.x,
      y: this.player.pos.y,
      z: this.player.pos.z,
      rotY: this.player.yaw,
      anim: this.player.anim,
      name: this.playerName,
    };
    this.net.sendState(state);

    // UI updates
    this.updateUiState();

    this.renderer.render(this.scene, this.camera);
  }

  private uiTimer = 0;

  private updateUiState() {
    this.uiTimer += 1;
    // room title
    const floor = this.player.floor;
    const roomId = roomAt(this.player.pos.x, this.player.pos.z, floor) ?? 'atrium';
    const info = this.cfg.rooms[roomId];
    if (info && roomId !== this.lastRoom) {
      this.lastRoom = roomId;
      this.ui.setRoomTitle(info.title);
      // confetti on entering the final hall
      if (roomId === 'final' && !this.confettiDone) {
        this.confettiDone = true;
        this.triggerConfetti();
      }
      // draw minimap on room change
      this.ui.drawMinimap();
    }

    // elevator UI
    const nearElevator = this.player.isNearElevator();
    this.ui.showElevatorUI(nearElevator);

    // interaction prompt
    const nearby = this.getNearby();
    if (this.viewing) {
      this.ui.setPrompt(`<span class="key">Esc</span> закрыть · <span class="key">E</span> назад в музей`);
    } else if (nearby) {
      const key = nearby.kind === 'bench' ? 'F' : 'E';
      const tap = document.body.classList.contains('mobile') ? 'тап' : `клавиша <span class="key">${key}</span>`;
      this.ui.setPrompt(`<b>${escapeHtml(nearby.label)}</b> · ${tap}`);
    } else {
      this.ui.setPrompt(null);
    }

    // periodic minimap refresh (~2 Hz)
    if (this.uiTimer % 30 === 0) {
      this.ui.drawMinimap();
      this.refreshCount();
    }

    void BUILDING;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
