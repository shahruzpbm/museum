/**
 * Player: movement (WASD + mobile joystick), capsule collisions,
 * staircase ramps, elevator, sitting, and the camera rig
 * (third person / first person / top view).
 */
import * as THREE from 'three';
import type { CollisionWorld } from './collisions';
import type { Avatar } from './avatar';
import type { Interactable, MuseumConfig, PlayerAnim } from './types';
import { ELEVATOR, BUILDING } from './geometry';

export type CameraMode = 'third' | 'first' | 'top';

export class Player {
  pos = new THREE.Vector3(0, 0, 16);
  vel = new THREE.Vector3();
  yaw = Math.PI; // facing -z (into the museum)
  cameraYaw = Math.PI;
  cameraPitch = 0.22;
  camDistance = 4.6;
  mode: CameraMode = 'third';
  sitting = false;
  sittingOn: Interactable | null = null;
  run = false;
  anim: PlayerAnim = 'idle';
  avatar: Avatar;
  coll: CollisionWorld;
  cfg: MuseumConfig;

  // input
  keys = new Set<string>();
  joystick = { x: 0, y: 0, active: false };
  lookDelta = { x: 0, y: 0 };
  wantInteract = false;
  wantSit = false;

  // camera state
  camPos = new THREE.Vector3(0, 5, 22);
  camLook = new THREE.Vector3(0, 1.6, 12);
  private camTmp = new THREE.Vector3();
  private lookTmp = new THREE.Vector3();

  // step audio callback
  onStep?: () => void;
  onFloorChange?: (floor: number) => void;

  private stepTimer = 0;
  private currentFloor = 0;

  constructor(avatar: Avatar, coll: CollisionWorld, cfg: MuseumConfig) {
    this.avatar = avatar;
    this.coll = coll;
    this.cfg = cfg;
    this.camDistance = cfg.settings.camera.distance;
  }

  get floor(): number {
    return this.currentFloor;
  }

  handleKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  update(dt: number) {
    const p = this.cfg.settings.player;

    // ----- input direction -----
    let ix = 0;
    let iz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    if (this.joystick.active) {
      ix += this.joystick.x;
      iz += this.joystick.y;
    }
    this.run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    const moving = (ix !== 0 || iz !== 0) && !this.sitting;

    // camera rotation from look deltas
    this.cameraYaw -= this.lookDelta.x * 0.0042 * this.cfg.settings.camera.sensitivity;
    this.cameraPitch += this.lookDelta.y * 0.0034 * this.cfg.settings.camera.sensitivity;
    this.cameraPitch = Math.max(-0.9, Math.min(1.15, this.cameraPitch));
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;

    // ----- movement -----
    const speed = this.run ? p.runSpeed : p.walkSpeed;
    if (moving) {
      const len = Math.hypot(ix, iz) || 1;
      ix /= len;
      iz /= len;
      // move relative to camera yaw (forward = (sin(yaw), cos(yaw)))
      const sin = Math.sin(this.cameraYaw);
      const cos = Math.cos(this.cameraYaw);
      const wx = ix * cos - iz * sin;
      const wz = -ix * sin - iz * cos;
      this.vel.x = wx * speed;
      this.vel.z = wz * speed;
      // face movement direction
      const targetYaw = Math.atan2(wx, wz);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 11);
    } else {
      this.vel.x *= Math.pow(0.0008, dt);
      this.vel.z *= Math.pow(0.0008, dt);
    }

    if (!this.sitting) {
      this.coll.move(this.pos, p.radius, this.vel.x * dt, this.vel.z * dt);
    }

    // ----- vertical: follow ground / elevator -----
    const ground = this.coll.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    const snap = Math.min(1, dt * 10);
    this.pos.y += (ground - this.pos.y) * snap;

    // floor detection
    const newFloor = this.pos.y > BUILDING.floorH * 0.55 ? 1 : 0;
    if (newFloor !== this.currentFloor) {
      this.currentFloor = newFloor;
      this.onFloorChange?.(newFloor);
    }

    // ----- animation state -----
    if (this.sitting) this.anim = 'sit';
    else if (moving) this.anim = this.run ? 'run' : 'walk';
    else if (this.anim !== 'idle' && !this.isEmote(this.anim)) this.anim = 'idle';

    // footsteps
    if (moving && !this.sitting) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.run ? 0.31 : 0.47;
        this.onStep?.();
      }
    }

    // ----- avatar transform -----
    this.avatar.group.position.copy(this.pos);
    this.avatar.group.rotation.y = this.yaw;
    this.avatar.speed = moving ? speed : 0;
    if (this.avatar.anim !== this.anim) this.avatar.playAnim(this.anim);
    else this.avatar.anim = this.anim;

    // ----- camera -----
    this.updateCamera(dt);
  }

  private isEmote(a: PlayerAnim) {
    return ['dance', 'wave', 'hearts', 'clap', 'spin', 'kiss', 'joy', 'think'].includes(a);
  }

  setEmote(anim: PlayerAnim) {
    this.anim = anim;
    this.avatar.playAnim(anim);
    // return to idle after a while
    window.setTimeout(() => {
      if (this.anim === anim && !this.sitting) this.anim = 'idle';
    }, anim === 'dance' ? 4200 : 2600);
  }

  sit(interactable: Interactable | null) {
    if (!interactable) return;
    this.sitting = true;
    this.sittingOn = interactable;
    this.pos.set(interactable.position.x, interactable.position.y - 0.05, interactable.position.z);
    this.yaw = interactable.data?.rotY ?? this.yaw;
    this.anim = 'sit';
    this.avatar.playAnim('sit');
  }

  stand() {
    if (!this.sitting) return;
    const it = this.sittingOn;
    this.sitting = false;
    this.sittingOn = null;
    this.anim = 'idle';
    if (it) {
      // step away from the bench a bit
      this.pos.x += Math.sin(this.yaw) * 1.1;
      this.pos.z += Math.cos(this.yaw) * 1.1;
      this.pos.y = this.coll.groundHeight(this.pos.x, this.pos.z, this.pos.y);
    }
    this.avatar.playAnim('idle');
  }

  teleport(x: number, z: number, floor: number) {
    this.pos.set(x, floor === 1 ? BUILDING.floorH : 0, z);
    this.pos.y = this.coll.groundHeight(x, z, this.pos.y);
  }

  private updateCamera(dt: number) {
    const eye = this.cfg.settings.player.eyeHeight;
    const head = this.camTmp.set(this.pos.x, this.pos.y + eye, this.pos.z);

    if (this.mode === 'first') {
      this.camPos.lerp(head, Math.min(1, dt * 14));
      const dir = this.lookTmp.set(
        Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch),
        -Math.sin(this.cameraPitch),
        Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)
      );
      this.camLook.lerp(head.clone().add(dir.multiplyScalar(4)), Math.min(1, dt * 14));
    } else if (this.mode === 'top') {
      const floorY = this.pos.y;
      const target = this.camTmp.set(this.pos.x + 0.01, floorY + 26, this.pos.z + 13);
      this.camPos.lerp(target, Math.min(1, dt * 2.4));
      this.camLook.lerp(this.lookTmp.set(this.pos.x, floorY, this.pos.z), Math.min(1, dt * 3));
    } else {
      // third person orbit
      const dist = this.camDistance;
      const cx = this.pos.x - Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
      const cz = this.pos.z - Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch) * dist;
      const cy = this.pos.y + eye * 0.86 + Math.sin(this.cameraPitch) * dist;
      const desired = this.camTmp.set(cx, Math.max(cy, this.pos.y + 0.45), cz);
      // pull camera in if blocked by a wall
      if (this.coll.segmentBlocked(head.x, head.y, head.z, desired.x, desired.y, desired.z)) {
        desired.lerp(head, 0.55);
      }
      this.camPos.lerp(desired, Math.min(1, dt * 7.5));
      this.camLook.lerp(this.lookTmp.set(this.pos.x, this.pos.y + eye * 0.95, this.pos.z), Math.min(1, dt * 9));
    }
  }

  cycleCamera() {
    this.mode = this.mode === 'third' ? 'first' : this.mode === 'first' ? 'top' : 'third';
    return this.mode;
  }

  /** Nearest bench/exhibit while sitting — used to auto-look at artwork. */
  lookTarget(): THREE.Vector3 | null {
    return null;
  }

  isNearElevator(): boolean {
    return Math.hypot(this.pos.x - ELEVATOR.cx, this.pos.z - ELEVATOR.cz) < 3.6;
  }
}
