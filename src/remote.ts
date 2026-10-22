/**
 * RemotePlayers — other visitors: interpolated avatars, name tags, chat bubbles.
 */
import * as THREE from 'three';
import { Avatar } from './avatar';
import type { NetState, PlayerAnim } from './types';

interface RemoteEntry {
  avatar: Avatar;
  targetPos: THREE.Vector3;
  targetRotY: number;
  anim: PlayerAnim;
  name: string;
  animUntil: number;
}

const NAME_COLORS = [0x6c7ee1, 0xe1766c, 0x6cc9a0, 0xc96cd1, 0xd1a86c, 0x6cb6d1, 0xd16c9c];

export class RemotePlayers {
  group = new THREE.Group();
  private entries = new Map<string, RemoteEntry>();
  private colorIdx = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get count() {
    return this.entries.size + 1; // + local
  }

  add(id: string, state: NetState) {
    if (this.entries.has(id)) return;
    const avatar = new Avatar({
      color: NAME_COLORS[this.colorIdx++ % NAME_COLORS.length],
      name: state.name || 'Гость',
    });
    avatar.group.position.set(state.x, state.y, state.z);
    avatar.group.rotation.y = state.rotY;
    this.group.add(avatar.group);
    this.entries.set(id, {
      avatar,
      targetPos: new THREE.Vector3(state.x, state.y, state.z),
      targetRotY: state.rotY,
      anim: state.anim || 'idle',
      name: state.name || 'Гость',
      animUntil: 0,
    });
  }

  remove(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    this.group.remove(e.avatar.group);
    e.avatar.dispose();
    this.entries.delete(id);
  }

  setState(id: string, state: NetState) {
    let e = this.entries.get(id);
    if (!e) {
      this.add(id, state);
      e = this.entries.get(id)!;
    }
    e.targetPos.set(state.x, state.y, state.z);
    e.targetRotY = state.rotY;
    if (state.name && state.name !== e.name) {
      e.name = state.name;
      e.avatar.setName(state.name);
    }
    if (state.anim && state.anim !== e.anim) {
      e.anim = state.anim;
      e.avatar.playAnim(state.anim);
    }
  }

  chat(id: string, text: string) {
    const e = this.entries.get(id);
    if (e) e.avatar.showBubble(text);
  }

  update(dt: number) {
    for (const e of this.entries.values()) {
      // smooth interpolation toward the last networked state
      const k = Math.min(1, dt * 9);
      e.avatar.group.position.lerp(e.targetPos, k);
      let d = e.targetRotY - e.avatar.group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.avatar.group.rotation.y += d * Math.min(1, dt * 8);
      e.avatar.update(dt);
    }
  }

  clear() {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }
}
