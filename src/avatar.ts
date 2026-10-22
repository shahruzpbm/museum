/**
 * Procedural cartoon avatar (Memoji-style) built from capsules & spheres.
 * Animations: idle, walk, run, sit, dance, wave, hearts, clap, spin, kiss, joy, think.
 * No external models needed — works offline.
 */
import * as THREE from 'three';
import { nameTexture, bubbleTexture, particleTexture } from './textures';
import type { PlayerAnim } from './types';

export interface AvatarOptions {
  color?: number;
  skin?: number;
  hair?: number;
  name?: string;
  isLocal?: boolean;
}

export class Avatar {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  anim: PlayerAnim = 'idle';
  animTime = 0;
  speed = 0;
  nameSprite?: THREE.Sprite;
  bubbleSprite?: THREE.Sprite;
  bubbleTime = 0;
  heartBurst: THREE.Sprite[] = [];
  heartTime = 0;
  private materials: THREE.Material[] = [];

  constructor(opts: AvatarOptions = {}) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const skin = new THREE.MeshStandardMaterial({ color: opts.skin ?? 0xf0c8a0, roughness: 0.75 });
    const cloth = new THREE.MeshStandardMaterial({ color: opts.color ?? 0x6c7ee1, roughness: 0.8 });
    const cloth2 = new THREE.MeshStandardMaterial({ color: (opts.color ?? 0x6c7ee1) * 0.75, roughness: 0.82 });
    const hairMat = new THREE.MeshStandardMaterial({ color: opts.hair ?? 0x2e2028, roughness: 0.62 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1c1c24, roughness: 0.35 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    this.materials.push(skin, cloth, cloth2, hairMat, eyeMat, whiteMat);

    // ----- torso -----
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.55, 6, 14), cloth);
    torso.position.y = 1.06;
    torso.castShadow = true;
    this.body.add(torso);

    // hips
    const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.18, 4, 10), cloth2);
    hips.position.y = 0.72;
    this.body.add(hips);

    // ----- head -----
    this.head = new THREE.Group();
    this.head.position.y = 1.78;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 22, 18), skin);
    skull.scale.set(1, 1.12, 0.98);
    skull.castShadow = true;
    this.head.add(skull);

    // hair cap
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.345, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    hair.position.y = 0.06;
    hair.scale.set(1.02, 1.12, 1.02);
    this.head.add(hair);
    // fringe
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), hairMat);
    fringe.position.set(0, 0.14, 0.18);
    fringe.scale.set(1.05, 0.55, 0.55);
    this.head.add(fringe);

    // eyes
    for (const sx of [-0.12, 0.12]) {
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 10), whiteMat);
      eyeWhite.position.set(sx, 0.03, 0.275);
      eyeWhite.scale.set(1, 1.25, 0.55);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
      pupil.position.set(sx, 0.028, 0.315);
      this.head.add(eyeWhite, pupil);
    }
    // brows
    for (const sx of [-0.12, 0.12]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.016, 0.02), hairMat);
      brow.position.set(sx, 0.115, 0.3);
      brow.rotation.z = sx > 0 ? -0.12 : 0.12;
      this.head.add(brow);
    }
    // nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), skin);
    nose.position.set(0, -0.035, 0.31);
    this.head.add(nose);
    // smile
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.014, 8, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb96b62, roughness: 0.6 }));
    smile.position.set(0, -0.105, 0.295);
    smile.rotation.x = Math.PI;
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    // ears
    for (const sx of [-0.3, 0.3]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skin);
      ear.position.set(sx, 0, 0);
      ear.scale.set(0.55, 1, 0.8);
      this.head.add(ear);
    }
    this.body.add(this.head);

    // ----- arms -----
    const makeArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(side * 0.42, 1.38, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 5, 10), cloth);
      upper.position.y = -0.22;
      upper.castShadow = true;
      const fore = new THREE.Group();
      fore.position.y = -0.44;
      const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 5, 10), skin);
      foreMesh.position.y = -0.19;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), skin);
      hand.position.y = -0.42;
      fore.add(foreMesh, hand);
      g.add(upper, fore);
      (g as any).fore = fore;
      return g;
    };
    this.leftArm = makeArm(-1);
    this.rightArm = makeArm(1);
    this.body.add(this.leftArm, this.rightArm);

    // ----- legs -----
    const makeLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(side * 0.17, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 5, 10), cloth2);
      thigh.position.y = -0.24;
      thigh.castShadow = true;
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 5, 10), cloth2);
      shin.position.y = -0.62;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.28), new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.5 }));
      shoe.position.set(0, -0.86, 0.05);
      shoe.castShadow = true;
      g.add(thigh, shin, shoe);
      return g;
    };
    this.leftLeg = makeLeg(-1);
    this.rightLeg = makeLeg(1);
    this.body.add(this.leftLeg, this.rightLeg);

    // ----- name label -----
    if (opts.name) {
      this.setName(opts.name);
    }
    void opts.isLocal;
  }

  setName(name: string) {
    if (this.nameSprite) {
      this.group.remove(this.nameSprite);
      (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: nameTexture(name), transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.7, 0.42, 1);
    sprite.position.y = 2.52;
    sprite.renderOrder = 5;
    this.nameSprite = sprite;
    this.group.add(sprite);
  }

  showBubble(text: string) {
    if (this.bubbleSprite) {
      this.group.remove(this.bubbleSprite);
      (this.bubbleSprite.material as THREE.SpriteMaterial).map?.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: bubbleTexture(text), transparent: true, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.84, 1);
    sprite.position.y = 3.15;
    sprite.renderOrder = 6;
    this.bubbleSprite = sprite;
    this.group.add(sprite);
    this.bubbleTime = 5;
  }

  triggerHearts() {
    this.heartTime = 1.6;
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.SpriteMaterial({
        map: particleTexture(true),
        color: 0xff6fa5,
        transparent: true,
        depthTest: true,
        opacity: 0.95,
      });
      const s = new THREE.Sprite(mat);
      s.scale.set(0.32, 0.32, 1);
      s.position.set((Math.random() - 0.5) * 0.7, 2.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
      (s as any).vx = (Math.random() - 0.5) * 0.45;
      (s as any).vy = 0.75 + Math.random() * 0.7;
      this.heartBurst.push(s);
      this.group.add(s);
    }
  }

  playAnim(anim: PlayerAnim) {
    this.anim = anim;
    this.animTime = 0;
    if (anim === 'hearts') this.triggerHearts();
    if (anim === 'kiss' || anim === 'joy') this.triggerHearts();
  }

  update(dt: number) {
    this.animTime += dt;
    const t = this.animTime;

    // bubble fade
    if (this.bubbleSprite) {
      this.bubbleTime -= dt;
      const m = this.bubbleSprite.material as THREE.SpriteMaterial;
      if (this.bubbleTime < 0.8) m.opacity = Math.max(0, this.bubbleTime / 0.8);
      if (this.bubbleTime <= 0) {
        this.group.remove(this.bubbleSprite);
        m.map?.dispose();
        this.bubbleSprite = undefined;
      }
    }

    // hearts physics
    if (this.heartBurst.length) {
      for (let i = this.heartBurst.length - 1; i >= 0; i--) {
        const s = this.heartBurst[i];
        s.position.x += (s as any).vx * dt;
        s.position.y += (s as any).vy * dt;
        (s as any).vy -= dt * 0.35;
        const m = s.material as THREE.SpriteMaterial;
        m.opacity = Math.min(1, Math.max(0, this.heartTime));
        if (this.heartTime <= 0) {
          this.group.remove(s);
          m.map?.dispose();
          this.heartBurst.splice(i, 1);
        }
      }
      if (this.heartTime > 0) this.heartTime -= dt * 0.55;
    }

    const a = this.anim;

    if (a === 'walk' || a === 'run') {
      const f = a === 'run' ? 11 : 7.2;
      const amp = a === 'run' ? 0.85 : 0.55;
      const s = Math.sin(t * f);
      this.leftLeg.rotation.x = s * amp;
      this.rightLeg.rotation.x = -s * amp;
      this.leftArm.rotation.x = -s * amp * 0.8;
      this.rightArm.rotation.x = s * amp * 0.8;
      this.body.position.y = Math.abs(Math.sin(t * f)) * 0.045;
      this.body.rotation.x = a === 'run' ? 0.1 : 0.03;
      this.head.rotation.x = -this.body.rotation.x * 0.7;
      this.head.rotation.y = Math.sin(t * f * 0.5) * 0.05;
    } else if (a === 'sit') {
      this.leftLeg.rotation.x = -1.35;
      this.rightLeg.rotation.x = -1.35;
      this.leftArm.rotation.x = -0.25;
      this.rightArm.rotation.x = -0.25;
      this.body.position.y = -0.18;
      this.body.rotation.x = 0.05;
    } else if (a === 'dance') {
      const s = Math.sin(t * 7);
      this.body.position.y = Math.abs(Math.sin(t * 7)) * 0.11;
      this.body.rotation.z = s * 0.12;
      this.body.rotation.y = Math.sin(t * 3.5) * 0.35;
      this.leftArm.rotation.z = 1.9 + s * 0.6;
      this.rightArm.rotation.z = -1.9 - s * 0.6;
      this.leftArm.rotation.x = Math.sin(t * 5) * 0.4;
      this.rightArm.rotation.x = -Math.sin(t * 5) * 0.4;
      this.leftLeg.rotation.x = Math.sin(t * 7) * 0.35;
      this.rightLeg.rotation.x = -Math.sin(t * 7) * 0.35;
      this.head.rotation.z = -s * 0.12;
    } else if (a === 'wave') {
      this.resetPose();
      this.rightArm.rotation.z = -2.35;
      this.rightArm.rotation.x = 0;
      const wave = Math.sin(t * 9) * 0.45;
      this.rightArm.rotation.z = -2.35 + wave * 0.4;
      (this.rightArm as any).fore.rotation.x = -0.4;
      (this.rightArm as any).fore.rotation.z = wave * 0.7;
      this.head.rotation.z = 0.12;
      this.head.rotation.y = 0.15;
    } else if (a === 'clap') {
      this.resetPose();
      const cl = Math.abs(Math.sin(t * 6));
      this.leftArm.rotation.z = 1.15 - cl * 0.25;
      this.rightArm.rotation.z = -1.15 + cl * 0.25;
      this.leftArm.rotation.x = -0.65;
      this.rightArm.rotation.x = -0.65;
      this.leftArm.rotation.y = -0.35 + cl * 0.25;
      this.rightArm.rotation.y = 0.35 - cl * 0.25;
    } else if (a === 'spin') {
      this.body.rotation.y += dt * 4.2;
      this.leftArm.rotation.z = 1.45;
      this.rightArm.rotation.z = -1.45;
      this.body.position.y = Math.abs(Math.sin(t * 4)) * 0.06;
    } else if (a === 'kiss') {
      this.resetPose();
      this.body.rotation.x = Math.sin(t * 2.4) * 0.12;
      this.head.rotation.x = Math.sin(t * 2.4) * 0.18;
      this.leftArm.rotation.x = -1.25;
      this.rightArm.rotation.x = -1.25;
      this.leftArm.rotation.z = 0.5;
      this.rightArm.rotation.z = -0.5;
    } else if (a === 'joy') {
      this.resetPose();
      this.body.position.y = Math.abs(Math.sin(t * 5)) * 0.1;
      this.body.rotation.x = -0.16 + Math.sin(t * 5) * 0.1;
      this.leftArm.rotation.z = 2.4;
      this.rightArm.rotation.z = -2.4;
      this.head.rotation.x = -0.22;
    } else if (a === 'think') {
      this.resetPose();
      this.rightArm.rotation.x = -1.85;
      this.rightArm.rotation.z = -0.75;
      (this.rightArm as any).fore.rotation.x = -1.15;
      this.head.rotation.x = 0.14;
      this.head.rotation.y = 0.22;
      this.body.rotation.y = 0.12;
    } else {
      // idle — gentle breathing
      const br = Math.sin(t * 1.9);
      this.body.position.y = br * 0.018;
      this.body.rotation.x = br * 0.012;
      this.leftArm.rotation.x = br * 0.05;
      this.rightArm.rotation.x = -br * 0.05;
      this.leftArm.rotation.z = 0.07 + br * 0.02;
      this.rightArm.rotation.z = -0.07 - br * 0.02;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.head.rotation.y = Math.sin(t * 0.7) * 0.16;
      this.head.rotation.x = Math.sin(t * 0.53) * 0.05;
    }

    // name sprite faces camera automatically (sprites always do)
  }

  private resetPose() {
    this.leftLeg.rotation.x = 0;
    this.rightLeg.rotation.x = 0;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    this.leftArm.rotation.set(0, 0, 0.07);
    this.rightArm.rotation.set(0, 0, -0.07);
    (this.leftArm as any).fore?.rotation.set(0, 0, 0);
    (this.rightArm as any).fore?.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.group.rotation.y = 0;
  }

  get position() {
    return this.group.position;
  }

  dispose() {
    this.materials.forEach((m) => m.dispose());
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}
