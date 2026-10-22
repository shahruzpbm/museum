/**
 * Effects: confetti burst in the final hall, soft floating particles.
 */
import * as THREE from 'three';
import { particleTexture } from './textures';

interface Confetto {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  life: number;
}

export class Effects {
  scene: THREE.Scene;
  confetti: Confetto[] = [];
  private geo: THREE.PlaneGeometry;
  private materials: THREE.MeshBasicMaterial[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geo = new THREE.PlaneGeometry(0.14, 0.2);
    const colors = [0xff6fa5, 0xffd166, 0x9bf6ff, 0xb5e8a6, 0xff8fa3, 0xc8a2ff, 0xffffff];
    for (const c of colors) {
      this.materials.push(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true }));
    }
    void particleTexture;
  }

  burst(origin: THREE.Vector3, count = 120) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.materials[i % this.materials.length]);
      mesh.position.copy(origin);
      mesh.position.x += (Math.random() - 0.5) * 6;
      mesh.position.z += (Math.random() - 0.5) * 6;
      mesh.position.y += (Math.random() - 0.2) * 2.5;
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.scene.add(mesh);
      this.confetti.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.2 + Math.random() * 2.8, (Math.random() - 0.5) * 2.2),
        rot: new THREE.Vector3(Math.random() * 5 - 2.5, Math.random() * 5 - 2.5, Math.random() * 5 - 2.5),
        life: 5.5 + Math.random() * 3,
      });
    }
  }

  update(dt: number) {
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life -= dt;
      c.vel.y -= dt * 2.1;
      c.vel.x *= 0.985;
      c.vel.z *= 0.985;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.rot.x * dt;
      c.mesh.rotation.y += c.rot.y * dt;
      c.mesh.rotation.z += c.rot.z * dt;
      const mat = c.mesh.material as THREE.MeshBasicMaterial;
      if (c.life < 1) mat.opacity = Math.max(0, c.life);
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.confetti.splice(i, 1);
      }
    }
  }
}
