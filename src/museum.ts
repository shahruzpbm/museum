/**
 * MuseumWorld — builds the whole two-storey museum:
 * floors, walls, atrium, grand staircase, glass elevator,
 * rooms, furniture, exhibit frames, video screens, lights.
 * Content comes from museum.config.json, geometry from geometry.ts.
 */
import * as THREE from 'three';
import {
  BUILDING,
  STAIRS,
  ELEVATOR,
  ROOM_RECTS,
  generateSlots,
  roomRect,
  type Slot,
} from './geometry';
import type { Interactable, MuseumConfig, ExhibitCfg } from './types';
import {
  floorTexture,
  ceilingTexture,
  wallTexture,
  glowTexture,
  fallbackArt,
  plaqueTexture,
  textPanelTexture,
  yearBadgeTexture,
  skylineTexture,
  noteTexture,
  woodTexture,
  ProceduralVideoTexture,
} from './textures';
import type { CollisionWorld } from './collisions';

const F = BUILDING.floorH;

interface ExhibitFrame {
  group: THREE.Group;
  slot: Slot;
  exhibit: ExhibitCfg | null;
  photoMat: THREE.MeshBasicMaterial;
  loaded: boolean;
  dist: number;
}

export class MuseumWorld {
  scene: THREE.Scene;
  cfg: MuseumConfig;
  coll: CollisionWorld;
  interactables: Interactable[] = [];
  frames: ExhibitFrame[] = [];
  proceduralVideos: ProceduralVideoTexture[] = [];
  videoElements: HTMLVideoElement[] = [];
  elevatorGroup!: THREE.Group;
  elevatorTargetY = 0;
  elevatorDoorOpen = 0;
  warmLights: THREE.SpotLight[] = [];
  trackLights: THREE.Object3D[] = [];
  vinylDisc?: THREE.Mesh;
  confettiAnchor = new THREE.Vector3(0, F + 1, 18);
  shimmerList: { mesh: THREE.Mesh; base: number }[] = [];

  // shared materials
  matWall!: THREE.MeshStandardMaterial;
  matWallDark!: THREE.MeshStandardMaterial;
  matFloor!: THREE.MeshStandardMaterial;
  matCeiling!: THREE.MeshStandardMaterial;
  matFrame!: THREE.MeshStandardMaterial;
  matMat!: THREE.MeshStandardMaterial;
  matBlack!: THREE.MeshStandardMaterial;
  matGlass!: THREE.MeshPhysicalMaterial;
  matWood!: THREE.MeshStandardMaterial;
  matMetal!: THREE.MeshStandardMaterial;
  matGlow!: THREE.MeshBasicMaterial;
  matEmissive!: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, cfg: MuseumConfig, coll: CollisionWorld) {
    this.scene = scene;
    this.cfg = cfg;
    this.coll = coll;
    this.initMaterials();
    this.build();
  }

  private initMaterials() {
    this.matWall = new THREE.MeshStandardMaterial({ map: wallTexture('#f2f0ec'), roughness: 0.92, metalness: 0.02 });
    this.matWallDark = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.85 });
    this.matFloor = new THREE.MeshStandardMaterial({
      map: floorTexture(),
      roughness: 0.28,
      metalness: 0.22,
      envMapIntensity: 0.7,
    });
    this.matCeiling = new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 0.95, metalness: 0.05 });
    this.matFrame = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.5, metalness: 0.35 });
    this.matMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ef, roughness: 0.85 });
    this.matBlack = new THREE.MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.7, metalness: 0.15 });
    this.matGlass = new THREE.MeshPhysicalMaterial({
      color: 0xcfe6f2,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.82,
      thickness: 0.4,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    });
    this.matWood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0.05 });
    this.matMetal = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.35, metalness: 0.8 });
    this.matGlow = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.matEmissive = new THREE.MeshBasicMaterial({ color: 0xffe6c4 });
  }

  // ------------------------------------------------------------------
  //  geometry helpers
  // ------------------------------------------------------------------

  private box(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    mat: THREE.Material,
    collide = true,
    floor: number | null = null,
    parent?: THREE.Object3D
  ): THREE.Mesh {
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const d = Math.abs(z2 - z1);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent ?? this.scene).add(mesh);
    if (collide) this.coll.addBox(x1, y1, z1, x2, y2, z2, floor);
    return mesh;
  }

  private wall(
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    y0: number,
    y1: number,
    opts: { doors?: { at: number; w: number }[]; glass?: boolean; mat?: THREE.Material; collide?: boolean } = {}
  ) {
    const t = BUILDING.wallT / 2;
    const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const mat = opts.mat ?? this.matWall;
    const collide = opts.collide ?? true;
    const doors = opts.doors ?? [];
    if (doors.length === 0) {
      if (horizontal) this.box(x1, y0, z1 - t, x2, y1, z2 + t, mat, collide);
      else this.box(x1 - t, y0, z1, x2 + t, y1, z2, mat, collide);
      return;
    }
    // split wall around door gaps
    const segs: [number, number][] = [];
    if (horizontal) {
      const xs = [Math.min(x1, x2), ...doors.map((d) => d.at - d.w / 2), ...doors.map((d) => d.at + d.w / 2), Math.max(x1, x2)].sort((a, b) => a - b);
      for (let i = 0; i < xs.length - 1; i += 2) {
        const a = xs[i];
        const b = xs[i + 1];
        if (b - a > 0.15) segs.push([a, b]);
      }
      for (const [a, b] of segs) this.box(a, y0, z1 - t, b, y1, z2 + t, mat, collide);
      // lintels above doors
      for (const d of doors) {
        this.box(d.at - d.w / 2, y1 - 1.1, z1 - t, d.at + d.w / 2, y1, z2 + t, mat, false);
      }
    } else {
      const zs = [Math.min(z1, z2), ...doors.map((d) => d.at - d.w / 2), ...doors.map((d) => d.at + d.w / 2), Math.max(z1, z2)].sort((a, b) => a - b);
      for (let i = 0; i < zs.length - 1; i += 2) {
        const a = zs[i];
        const b = zs[i + 1];
        if (b - a > 0.15) segs.push([a, b]);
      }
      for (const [a, b] of segs) this.box(x1 - t, y0, a, x2 + t, y1, b, mat, collide);
      for (const d of doors) {
        this.box(x1 - t, y1 - 1.1, d.at - d.w / 2, x2 + t, y1, d.at + d.w / 2, mat, false);
      }
    }
    void horizontal;
  }

  // ------------------------------------------------------------------
  //  build everything
  // ------------------------------------------------------------------

  private build() {
    this.buildShell();
    this.buildFloor2Slabs();
    this.buildInteriorWalls();
    this.buildStaircase();
    this.buildElevator();
    this.buildCeilingAndTracks();
    this.buildFurniture();
    this.buildExhibits();
    this.buildVideos();
    this.buildTextPanels();
    this.buildSculptures();
    this.buildSpecials();
    this.buildLights();
  }

  // ---------- shell: floors, exterior, atrium ----------

  private buildShell() {
    const { minX, maxX, minZ, maxZ } = BUILDING;

    // ground plane outside (plaza)
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 180),
      new THREE.MeshStandardMaterial({ color: 0x8f9aa6, roughness: 0.9 })
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = -0.02;
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // floor 1 — polished slab (with hole only for elevator shaft)
    const floor1 = new THREE.Group();
    const slabT = 0.25;
    // whole slab minus elevator hole: build 4 pieces around it
    const ex = ELEVATOR.cx;
    const ez = ELEVATOR.cz;
    const eh = ELEVATOR.size / 2 + 0.15;
    const pieces: [number, number, number, number][] = [
      [minX, minZ, maxX, ez - eh],
      [minX, ez + eh, maxX, maxZ],
      [minX, ez - eh, ex - eh, ez + eh],
      [ex + eh, ez - eh, maxX, ez + eh],
    ];
    for (const [x1, z1, x2, z2] of pieces) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, slabT, z2 - z1), this.matFloor);
      m.position.set((x1 + x2) / 2, -slabT / 2, (z1 + z2) / 2);
      m.receiveShadow = true;
      floor1.add(m);
    }
    this.scene.add(floor1);

    // exterior walls — full height (2 floors)
    const H = F * 2 + 0.6;
    // north
    this.wall(minX, minZ, maxX, minZ, 0, H, {});
    // west — solid, with a big lounge window strip (z -22..-10)
    this.wall(minX, minZ, minX, -22, 0, H, {});
    this.wall(minX, -10, minX, maxZ, 0, H, {});
    this.box(minX - 0.18, 0, -22, minX + 0.18, 1.05, -10, this.matWall, true);
    this.box(minX - 0.18, 4.6, -22, minX + 0.18, H, -10, this.matWall, true);
    const westWin = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.55), this.matGlass);
    westWin.position.set(minX + 0.16, 2.82, -16);
    westWin.rotation.y = Math.PI / 2;
    this.scene.add(westWin);
    this.coll.addBox(minX - 0.1, 0, -22, minX + 0.1, 4.6, -10);

    // east — solid, open glass on the terrace (floor 2, z 8..24)
    this.wall(maxX, minZ, maxX, 8, 0, H, {});
    this.wall(maxX, 8, maxX, maxZ, 0, F, {});
    const eastGlass = new THREE.Mesh(new THREE.PlaneGeometry(16, F - 1.2), this.matGlass);
    eastGlass.position.set(maxX - 0.12, F + (F - 1.2) / 2 + 0.6, 16);
    eastGlass.rotation.y = -Math.PI / 2;
    this.scene.add(eastGlass);
    this.coll.addBox(maxX - 0.1, F, 8, maxX + 0.1, F * 2, maxZ);
    // terrace safety railing inside the glass
    this.addRailing(maxX - 1.4, 8.4, maxX - 1.4, 23.6, F, 1.05);

    // south — entrance door at x=0, big history-hall window (x -34..-14)
    this.wall(minX, maxZ, -34, maxZ, 0, H, {});
    this.box(-34 - 0.18, 0, maxZ - 0.18, -14 + 0.18, 1.05, maxZ + 0.18, this.matWall, true);
    this.box(-34 - 0.18, 4.6, maxZ - 0.18, -14 + 0.18, H, maxZ + 0.18, this.matWall, true);
    const southWin = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.55), this.matGlass);
    southWin.position.set(-24, 2.82, maxZ - 0.16);
    southWin.rotation.y = Math.PI;
    this.scene.add(southWin);
    this.coll.addBox(-34, 0, maxZ - 0.1, -14, 4.6, maxZ + 0.1);
    this.wall(-14, maxZ, maxX, maxZ, 0, H, { doors: [{ at: 0, w: 5 }] });

    // entrance glass doors (south)
    this.box(-2.6, 0, maxZ - 0.25, -2.5, 3.2, maxZ + 0.25, this.matGlass, true);
    this.box(2.5, 0, maxZ - 0.25, 2.6, 3.2, maxZ + 0.25, this.matGlass, true);
    const doorL = this.box(-2.5, 0, maxZ - 0.08, -0.1, 3.2, maxZ + 0.08, this.matGlass, true);
    const doorR = this.box(0.1, 0, maxZ - 0.08, 2.5, 3.2, maxZ + 0.08, this.matGlass, true);
    doorL.name = 'doorL';
    doorR.name = 'doorR';

    // atrium railings on floor 2
    const a = BUILDING.atriumMin;
    const b = BUILDING.atriumMax;
    // north edge
    this.addRailing(a, a - 0.02, b, a - 0.02, F, 1.1);
    // west + east edges
    this.addRailing(a - 0.02, a, a - 0.02, b, F, 1.1);
    this.addRailing(b + 0.02, a, b + 0.02, b, F, 1.1);
    // south edge with gap for the staircase
    this.addRailing(a, b + 0.02, STAIRS.x1, b + 0.02, F, 1.1);
    this.addRailing(STAIRS.x2, b + 0.02, b, b + 0.02, F, 1.1);

    // decorative columns in atrium (floor 1)
    for (const [cx, cz] of [
      [-9.6, -9.6],
      [9.6, -9.6],
      [-9.6, 9.6],
    ]) {
      this.box(cx - 0.45, 0, cz - 0.45, cx + 0.45, F, cz + 0.45, this.matWall, true, 0);
    }
  }

  private addRailing(x1: number, z1: number, x2: number, z2: number, y0: number, h: number) {
    const horizontal = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    const len = horizontal ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 0.12), this.matGlass);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? len : 0.08, 0.08, horizontal ? 0.08 : len), this.matMetal);
    if (horizontal) {
      glass.position.set((x1 + x2) / 2, y0 + h / 2 - 0.03, (z1 + z2) / 2);
      rail.position.set((x1 + x2) / 2, y0 + h - 0.04, (z1 + z2) / 2);
    } else {
      glass.rotation.y = Math.PI / 2;
      glass.position.set((x1 + x2) / 2, y0 + h / 2 - 0.03, (z1 + z2) / 2);
      rail.position.set((x1 + x2) / 2, y0 + h - 0.04, (z1 + z2) / 2);
    }
    glass.castShadow = false;
    this.scene.add(glass, rail);
    // collision — one thin box
    this.coll.addBox(
      horizontal ? Math.min(x1, x2) : x1 - 0.09,
      y0,
      horizontal ? z1 - 0.09 : Math.min(z1, z2),
      horizontal ? Math.max(x1, x2) : x2 + 0.09,
      y0 + h,
      horizontal ? z2 + 0.09 : Math.max(z1, z2)
    );
  }

  private buildFloor2Slabs() {
    const { minX, maxX, minZ, maxZ } = BUILDING;
    const a = BUILDING.atriumMin;
    const b = BUILDING.atriumMax;
    const t = 0.28;
    const y1 = F - t / 2;
    const pieces: [number, number, number, number][] = [
      // west of atrium
      [minX, minZ, a, maxZ],
      // north of atrium
      [a, minZ, b, a],
      // south of atrium (staircase enters through here — leave a gap above stairs)
      [a, b, b, maxZ],
      // east of atrium, split around elevator hole
      [b, minZ, ELEVATOR.cx - ELEVATOR.size / 2 - 0.2, maxZ],
      [ELEVATOR.cx + ELEVATOR.size / 2 + 0.2, minZ, maxX, maxZ],
      [b, minZ, ELEVATOR.cx + ELEVATOR.size / 2 + 0.2, ELEVATOR.cz - ELEVATOR.size / 2 - 0.2],
      [b, ELEVATOR.cz + ELEVATOR.size / 2 + 0.2, ELEVATOR.cx + ELEVATOR.size / 2 + 0.2, maxZ],
    ];
    for (const [x1, z1, x2, z2] of pieces) {
      if (x2 - x1 < 0.05 || z2 - z1 < 0.05) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, t, z2 - z1), this.matFloor);
      m.position.set((x1 + x2) / 2, y1, (z1 + z2) / 2);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // dark ceiling panels just below the floor-2 slab (ceiling of floor 1)
    const darkPieces: [number, number, number, number][] = [
      [minX, minZ, a, maxZ],
      [a, minZ, b, a],
      [a, b, b, maxZ],
      [b, minZ, maxX, maxZ],
    ];
    for (const [x1, z1, x2, z2] of darkPieces) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.1, z2 - z1), this.matCeiling);
      m.position.set((x1 + x2) / 2, F - 0.32, (z1 + z2) / 2);
      this.scene.add(m);
    }
  }

  // ---------- interior walls ----------

  private buildInteriorWalls() {
    // ================= FLOOR 1 =================
    // history | lounge/sculpture/atrium/lobby  (x = -12)
    this.wall(-12, -24, -12, -8, 0, F, { doors: [{ at: -16, w: 3 }] });
    this.wall(-12, -8, -12, 24, 0, F, { doors: [{ at: 0, w: 3.2 }, { at: 16, w: 3.2 }] });
    // sculpture/atrium/lobby | video/guestbook (x = 12)
    this.wall(12, -24, 12, 24, 0, F, { doors: [{ at: -16, w: 3 }, { at: -6, w: 2.6 }, { at: 0, w: 3.2 }, { at: 16, w: 3.2 }] });
    // history | timeline/lounge (z = -8, x -36..-12)
    this.wall(-36, -8, -12, -8, 0, F, { doors: [{ at: -30, w: 3.2 }] });
    // timeline | lounge (x = -24)
    this.wall(-24, -24, -24, -8, 0, F, { doors: [{ at: -16, w: 3.2 }] });
    // sculpture | atrium (z = -8, x -12..12) — doorway near west side
    this.wall(-12, -8, 12, -8, 0, F, { doors: [{ at: -10, w: 2.8 }] });
    // video | black/guestbook (z = -4, x 12..36)
    this.wall(12, -4, 36, -4, 0, F, { doors: [{ at: 20, w: 3 }, { at: 30, w: 3 }] });
    // guestbook | black (x = 24)
    this.wall(24, -4, 24, 24, 0, F, { doors: [{ at: 10, w: 3.2 }] });
    // lobby | atrium (z = 8) — wide arch
    this.wall(-12, 8, -6, 8, 0, F, {});
    this.wall(6, 8, 12, 8, 0, F, {});
    this.wall(-6, 8, 6, 8, F - 1.2, F, {});

    // ================= FLOOR 2 =================
    // music | letters/mezz (x = -12)
    this.wall(-12, -24, -12, -8, F, F * 2, { doors: [{ at: -16, w: 3 }] });
    this.wall(-12, -8, -12, 24, F, F * 2, { doors: [{ at: 0, w: 3.2 }, { at: 16, w: 3.2 }] });
    // letters/mezz/final | immersive/cinema/terrace (x = 12)
    this.wall(12, -24, 12, 24, F, F * 2, { doors: [{ at: -16, w: 3 }, { at: 0, w: 3.2 }, { at: 16, w: 3.2 }] });
    // letters | mezzanine (z = -12)
    this.wall(-12, -12, 12, -12, F, F * 2, { doors: [{ at: 0, w: 3.2 }] });
    // final | mezzanine (z = 12)
    this.wall(-12, 12, 12, 12, F, F * 2, { doors: [{ at: 0, w: 3.2 }] });
    // music | travels (z = -8)
    this.wall(-36, -8, -12, -8, F, F * 2, { doors: [{ at: -30, w: 3.2 }] });
    // immersive | cinema (z = -8)
    this.wall(12, -8, 36, -8, F, F * 2, { doors: [{ at: 30, w: 3.2 }] });
    // cinema | terrace (z = 8) — wide glass wall with door
    this.wall(12, 8, 36, 8, F, F * 2, { doors: [{ at: 30, w: 3.2 }], mat: this.matWall, collide: true });
    const glassPanel = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.4), this.matGlass);
    glassPanel.position.set(21, F + 2.4, 8);
    this.scene.add(glassPanel);
  }

  // ---------- staircase ----------

  private buildStaircase() {
    const s = STAIRS;
    this.coll.buildStairs();
    const stepCount = s.stepCount;
    const totalZ = s.ramp2.z2 - s.ramp1.z1;
    const stepDepth = totalZ / stepCount;
    const stepW = s.x2 - s.x1;

    // stepped visual meshes following the two flights + landing
    for (let i = 0; i < stepCount; i++) {
      const z = s.ramp1.z1 + i * stepDepth;
      const h = this.stairHeightAt(z + stepDepth * 0.5);
      const hNext = this.stairHeightAt(z + stepDepth);
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.16, stepDepth + 0.02), this.matFloor);
      step.position.set(0, h + 0.02, z + stepDepth / 2);
      step.receiveShadow = true;
      step.castShadow = true;
      this.scene.add(step);
      // riser
      if (hNext - h > 0.02) {
        const riser = new THREE.Mesh(new THREE.BoxGeometry(stepW, hNext - h, 0.1), this.matWall);
        riser.position.set(0, (h + hNext) / 2 + 0.02, z + stepDepth);
        this.scene.add(riser);
      }
    }

    // side stringers
    const stringerLen = Math.hypot(totalZ, F);
    const angle = Math.atan2(F, totalZ);
    for (const sx of [s.x1 + 0.12, s.x2 - 0.12]) {
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, stringerLen), this.matWallDark);
      str.position.set(sx, F / 2 - 0.15, (s.ramp1.z1 + s.ramp2.z2) / 2);
      str.rotation.x = angle;
      this.scene.add(str);
    }

    // handrails
    for (const sx of [s.x1 + 0.25, s.x2 - 0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, stringerLen), this.matMetal);
      rail.position.set(sx, F / 2 + 1.15, (s.ramp1.z1 + s.ramp2.z2) / 2);
      rail.rotation.x = angle;
      this.scene.add(rail);
    }

    // soft glow strip under the staircase (atrium centerpiece)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(11, 15), this.matGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.06, 0.2);
    this.scene.add(glow);
    this.shimmerList.push({ mesh: glow, base: 0.12 });
  }

  private stairHeightAt(z: number): number {
    const s = STAIRS;
    if (z <= s.ramp1.z1) return 0;
    if (z >= s.ramp2.z2) return F;
    if (z <= s.ramp1.z2) {
      return s.ramp1.y1 + ((z - s.ramp1.z1) / (s.ramp1.z2 - s.ramp1.z1)) * (s.ramp1.y2 - s.ramp1.y1);
    }
    if (z <= s.landing.z2) return s.landing.y;
    return s.landing.y + ((z - s.ramp2.z1) / (s.ramp2.z2 - s.ramp2.z1)) * (s.ramp2.y2 - s.ramp2.y1);
  }

  // ---------- elevator ----------

  private buildElevator() {
    const g = new THREE.Group();
    const { cx, cz, size } = ELEVATOR;
    const h = size / 2;

    // shaft glass walls (two-sided)
    const shaft = new THREE.Group();
    for (const [dx, dz, rot] of [
      [cx - h - 0.12, cz, Math.PI / 2],
      [cx + h + 0.12, cz, Math.PI / 2],
      [cx, cz - h - 0.12, 0],
      [cx, cz + h + 0.12, 0],
    ] as [number, number, number][]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(size + 0.2, F * 2), this.matGlass);
      panel.position.set(dx, F, dz);
      panel.rotation.y = rot;
      shaft.add(panel);
    }
    // corner posts
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, F * 2, 0.12), this.matMetal);
      post.position.set(cx + sx * (h + 0.12), F, cz + sz * (h + 0.12));
      shaft.add(post);
    }
    this.scene.add(shaft);

    // cabin
    const platform = new THREE.Mesh(new THREE.BoxGeometry(size, 0.14, size), this.matMetal);
    platform.position.set(cx, 0.07, cz);
    g.add(platform);
    for (const [dx, dz, rot] of [
      [cx - h, cz, Math.PI / 2],
      [cx + h, cz, Math.PI / 2],
      [cx, cz - h, 0],
    ] as [number, number, number][]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(size, 2.4), this.matGlass);
      panel.position.set(dx, 1.3, dz);
      panel.rotation.y = rot;
      g.add(panel);
    }
    // cabin ceiling + warm light
    const cabCeil = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, size), this.matBlack);
    cabCeil.position.set(cx, 2.55, cz);
    g.add(cabCeil);
    const cabLight = new THREE.PointLight(0xffe2c0, 6, 8, 2);
    cabLight.position.set(cx, 2.3, cz);
    g.add(cabLight);

    this.elevatorGroup = g;
    this.scene.add(g);

    // shaft collision walls on floor 2 only (open on the +z entrance side)
    const sw = 0.14;
    const fy = F;
    const fh = F;
    this.coll.addBox(cx - h - 0.12 - sw, fy, cz - h - 0.12, cx - h - 0.12 + sw, fy + fh, cz + h + 0.12, 1);
    this.coll.addBox(cx + h + 0.12 - sw, fy, cz - h - 0.12, cx + h + 0.12 + sw, fy + fh, cz + h + 0.12, 1);
    this.coll.addBox(cx - h - 0.12, fy, cz - h - 0.12 - sw, cx + h + 0.12, fy + fh, cz - h - 0.12 + sw, 1);
    // south side with a 1.6 m opening in the middle
    this.coll.addBox(cx - h - 0.12, fy, cz + h + 0.12 - sw, cx - 0.8, fy + fh, cz + h + 0.12 + sw, 1);
    this.coll.addBox(cx + 0.8, fy, cz + h + 0.12 - sw, cx + h + 0.12, fy + fh, cz + h + 0.12 + sw, 1);

    this.interactables.push({
      id: 'elevator',
      kind: 'elevator',
      position: { x: cx, y: 0, z: cz },
      radius: 3.4,
      label: 'Лифт · нажмите кнопку этажа',
    });
  }

  // ---------- ceiling & track lights ----------

  private buildCeilingAndTracks() {
    const { minX, maxX, minZ, maxZ } = BUILDING;
    // top ceiling
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.3, maxZ - minZ), this.matCeiling);
    ceil.position.set(0, F * 2 + 0.35, 0);
    this.scene.add(ceil);

    // track light strips (emissive) — two floors
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x2c2c31 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe7c2 });
    for (const fy of [F - 0.35, F * 2 - 0.35]) {
      for (let x = minX + 6; x <= maxX - 6; x += 8) {
        const track = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, maxZ - minZ - 12), trackMat);
        track.position.set(x, fy, 0);
        this.scene.add(track);
        for (let z = minZ + 7; z <= maxZ - 7; z += 6.2) {
          const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.16, 8), bulbMat);
          bulb.position.set(x, fy - 0.12, z);
          this.scene.add(bulb);
        }
      }
    }
  }

  // ---------- furniture ----------

  private buildFurniture() {
    this.buildReception();
    this.buildBenches();
    this.buildLounge();
    this.buildBlackHall();
    this.buildCinemaSeats();
    this.buildVinyl();
    this.buildGuestbook();
    this.buildTimeline();
    this.buildProjections();
    this.buildTerrace();
  }

  private bench(x: number, z: number, rotY: number, seats = 3) {
    const g = new THREE.Group();
    const w = seats * 0.62 + 0.24;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.55), this.matWood);
    top.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, 0.08), this.matWood);
    back.position.set(0, 0.72, -0.26);
    g.add(top, back);
    for (const sx of [-w / 2 + 0.18, w / 2 - 0.18]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.5), this.matMetal);
      leg.position.set(sx, 0.23, 0);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(g);
    // collision
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const hw = w / 2;
    const hd = 0.32;
    const ex = Math.abs(hw * c) + Math.abs(hd * s);
    const ez = Math.abs(hw * s) + Math.abs(hd * c);
    this.coll.addBox(x - ex, 0, z - ez, x + ex, 0.95, z + ez, null);
    this.interactables.push({
      id: `bench-${x.toFixed(1)}-${z.toFixed(1)}`,
      kind: 'bench',
      position: { x, y: 0.46, z },
      radius: 1.7,
      label: 'Скамейка · сесть (F)',
      data: { rotY },
    });
    return g;
  }

  private buildReception() {
    // lobby reception desk — placed near the welcome wall, off the main path
    const desk = this.box(-7.6, 0, 20.6, -1.2, 1.15, 21.6, this.matBlack, true, 0);
    desk.castShadow = true;
    this.box(-7.7, 1.15, 20.5, -1.1, 1.22, 21.7, this.matWood, true, 0);
    // welcome wall panel
    const welcome = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 2.6),
      new THREE.MeshBasicMaterial({
        map: textPanelTexture(this.cfg.museum.welcomeTitle, this.cfg.museum.welcomeText, this.cfg.museum.accentColor),
      })
    );
    welcome.position.set(0, 3.1, 23.7);
    welcome.rotation.y = Math.PI;
    this.scene.add(welcome);

    // welcome carpet
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d2a44, roughness: 0.92 })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, 18);
    carpet.receiveShadow = true;
    this.scene.add(carpet);
  }

  private buildBenches() {
    // video hall — 3 rows facing the screen (screen on east wall of video room)
    this.bench(18.5, -12, -Math.PI / 2, 4);
    this.bench(21.5, -12, -Math.PI / 2, 4);
    this.bench(18.5, -16.5, -Math.PI / 2, 4);
    this.bench(21.5, -16.5, -Math.PI / 2, 4);
    // history hall
    this.bench(-24, 8, Math.PI, 3);
    this.bench(-24, -2, Math.PI, 3);
    // sculpture room
    this.bench(0, -18, Math.PI, 3);
    // cinema stepped benches
    for (let row = 0; row < 4; row++) {
      const y = row * 0.42;
      const z = -2 + row * 1.7;
      const g = new THREE.Group();
      const w = 12;
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.7), this.matWood);
      top.position.set(22, y + 0.5, z);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.1), this.matWood);
      back.position.set(22, y + 0.82, z - 0.32);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, y + 0.5, 0.7), this.matWallDark);
      base.position.set(22, (y + 0.5) / 2, z);
      g.add(top, back, base);
      this.scene.add(g);
      this.coll.addBox(16, 0, z - 0.45, 28, y + 1.0, z + 0.45, 1);
    }
    this.interactables.push({
      id: 'cinema-bench',
      kind: 'bench',
      position: { x: 22, y: F + 0.5, z: 1 },
      radius: 3.5,
      label: 'Скамья кинотеатра · сесть (F)',
      data: { rotY: -Math.PI / 2 },
    });
    // terrace benches facing the panorama
    this.bench(32, 12, -Math.PI / 2, 3);
    this.bench(32, 20, -Math.PI / 2, 3);
    // mezzanine bench overlooking atrium
    this.bench(0, -9.8, 0, 3);
  }

  private buildLounge() {
    // sofas (light) with black legs
    const sofa = (x: number, z: number, rotY: number) => {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 1.0), this.matMat);
      seat.position.y = 0.36;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.22), this.matMat);
      back.position.set(0, 0.82, -0.42);
      const cush1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 0.9), this.matWood);
      cush1.position.set(-0.55, 0.62, 0.03);
      const cush2 = cush1.clone();
      cush2.position.x = 0.55;
      g.add(seat, back, cush1, cush2);
      for (const sx of [-1.05, 1.05]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.9), this.matMetal);
        leg.position.set(sx, 0.1, 0);
        g.add(leg);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.scene.add(g);
      const c = Math.cos(rotY);
      const s = Math.sin(rotY);
      const ex = Math.abs(1.3 * c) + Math.abs(0.6 * s);
      const ez = Math.abs(1.3 * s) + Math.abs(0.6 * c);
      this.coll.addBox(x - ex, 0, z - ez, x + ex, 1.0, z + ez, 0);
      this.interactables.push({
        id: `sofa-${x}-${z}`,
        kind: 'bench',
        position: { x, y: 0.5, z },
        radius: 2.0,
        label: 'Диван · сесть (F)',
        data: { rotY },
      });
    };
    sofa(-20, -12, Math.PI / 2);
    sofa(-20, -18, Math.PI / 2);
    sofa(-31, -12, -Math.PI / 2);
    sofa(-31, -18, -Math.PI / 2);
    // coffee tables
    for (const [x, z] of [
      [-20, -15],
      [-31, -15],
    ]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.42, 20), this.matWood);
      t.position.set(x, 0.21, z);
      t.castShadow = true;
      this.scene.add(t);
      this.coll.addBlock(x, 0, z, 1.0, 0.5, 1.0, 0);
    }
    // counter
    this.box(-24.6, 0, -23.4, -18.6, 1.1, -22.2, this.matBlack, true, 0);
    this.box(-24.7, 1.1, -23.5, -18.5, 1.18, -22.1, this.matWood, false);
  }

  private buildBlackHall() {
    // black partitions on white podiums, 2 photos on each partition
    const spots: [number, number, number][] = [
      [28.5, 2, 0],
      [33, 8, Math.PI / 2],
      [28.5, 14, 0],
      [33, 19, Math.PI / 2],
    ];
    for (const [x, z, rotY] of spots) {
      const g = new THREE.Group();
      const podium = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.36, 1.1), this.matMat);
      podium.position.y = 0.18;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.5, 0.16), this.matBlack);
      panel.position.y = 1.62;
      g.add(podium, panel);
      // two spot-ish glow discs above
      for (const sx of [-0.8, 0.8]) {
        const spot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 0.1, 10), this.matEmissive);
        spot.position.set(sx, 3.1, 0);
        g.add(spot);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.matGlow);
        glow.position.set(sx, 1.7, 0.11);
        g.add(glow);
      }
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.scene.add(g);
      this.coll.addBlock(x, 0, z, 3.2, 2.9, 1.1, 0);
      this.interactables.push({
        id: `partition-${x}-${z}`,
        kind: 'exhibit',
        position: { x, y: 1.7, z },
        radius: 3.2,
        label: 'Чёрный зал · осмотр (E)',
      });
    }
  }

  private buildCinemaSeats() {
    // step riser blocks already handled in benches; add side walls glow
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(13, 6), this.matGlow);
    glow.position.set(22, F + 2.6, -7.6);
    glow.rotation.y = 0;
    this.scene.add(glow);
  }

  private buildVinyl() {
    const g = new THREE.Group();
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.0), this.matWood);
    table.position.y = 0.38;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.85), this.matBlack);
    plinth.position.y = 0.82;
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.02, 36),
      new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.35, metalness: 0.5 })
    );
    disc.position.y = 0.9;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.022, 24),
      new THREE.MeshStandardMaterial({ color: 0xc2426c, roughness: 0.6 })
    );
    label.position.y = 0.911;
    const tonearm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.5), this.matMetal);
    tonearm.position.set(0.38, 0.96, -0.05);
    tonearm.rotation.y = -0.55;
    g.add(table, plinth, disc, label, tonearm);
    g.position.set(-30, 0, -12);
    this.scene.add(g);
    this.vinylDisc = disc;
    this.coll.addBlock(-30, 0, -12, 1.7, 1.05, 1.1, 1);
    this.interactables.push({
      id: 'vinyl',
      kind: 'vinyl',
      position: { x: -30, y: 0.9, z: -12 },
      radius: 2.0,
      label: 'Проигрыватель · включить музыку (E)',
    });

    // speakers
    for (const [x, z] of [
      [-33.5, -12],
      [-26.5, -12],
    ]) {
      this.box(x - 0.3, 0, z - 0.3, x + 0.3, 1.4, z + 0.3, this.matBlack, true, 1);
    }
  }

  private buildGuestbook() {
    // wall of notes + writing desk
    const notes = this.cfg.guestbook;
    for (let i = 0; i < 14; i++) {
      const n = notes[i % notes.length];
      const tex = noteTexture(n.author + ' ' + (i + 1), n.text);
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.58), new THREE.MeshBasicMaterial({ map: tex }));
      note.position.set(12.5 + (i % 5) * 1.05, 1.7 + Math.floor(i / 5) * 0.85, 12.6);
      note.rotation.y = Math.PI / 2;
      note.rotation.z = (Math.random() - 0.5) * 0.12;
      this.scene.add(note);
    }
    // desk
    this.box(15.4, 0, 10.2, 18.6, 0.78, 11.2, this.matWood, true, 0);
    this.box(15.6, 0.78, 10.35, 18.4, 0.84, 11.05, this.matMat, false);
    this.interactables.push({
      id: 'guestbook',
      kind: 'guestbook',
      position: { x: 17, y: 0.8, z: 10.7 },
      radius: 2.2,
      label: 'Гостевая книга · написать (E)',
    });
  }

  private buildTimeline() {
    // corridor of the past: year badges + text on the west wall
    const entries = this.cfg.timeline;
    entries.forEach((e, i) => {
      const z = -22 + i * 3.2;
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 1.05),
        new THREE.MeshBasicMaterial({ map: yearBadgeTexture(e.year, this.cfg.museum.accentColor) })
      );
      badge.position.set(-35.55, 2.5, z);
      badge.rotation.y = Math.PI / 2;
      this.scene.add(badge);

      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 1.45),
        new THREE.MeshBasicMaterial({ map: textPanelTexture(e.title, e.text, this.cfg.museum.accentColor) })
      );
      panel.position.set(-35.5, 1.15, z + 1.55);
      panel.rotation.y = Math.PI / 2;
      this.scene.add(panel);

      // glow
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), this.matGlow);
      glow.position.set(-35.3, 2.1, z + 0.7);
      glow.rotation.y = Math.PI / 2;
      this.scene.add(glow);
    });
    // timeline line on the floor
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 15),
      new THREE.MeshBasicMaterial({ color: 0xff6fa5 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(-33.9, 0.02, -15.5);
    this.scene.add(line);
  }

  private buildProjections() {
    // immersive room — 4 projection planes with animated slideshow
    const room = roomRect('immersive')!;
    const size = 7.2;
    const walls: [number, number, number, number][] = [
      [room.x1 + 0.3, room.z1 + size / 2 + 2, Math.PI / 2, 0],
      [room.x2 - 0.3, room.z1 + size / 2 + 2, -Math.PI / 2, 0],
      [(room.x1 + room.x2) / 2, room.z1 + 0.3, 0, 0],
      [(room.x1 + room.x2) / 2, room.z2 - 0.3, Math.PI, 0],
    ];
    for (const [x, z, rotY] of walls) {
      const pv = new ProceduralVideoTexture('slideshow');
      this.proceduralVideos.push(pv);
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size, 4.2),
        new THREE.MeshBasicMaterial({ map: pv.texture })
      );
      plane.position.set(x, F + 2.35, z);
      plane.rotation.y = rotY;
      this.scene.add(plane);
    }
    // dark walls for immersion
    for (const [x1, z1, x2, z2] of [
      [room.x1 + 0.31, room.z1 + 0.31, room.x2 - 0.31, room.z1 + 0.4],
      [room.x1 + 0.31, room.z2 - 0.4, room.x2 - 0.31, room.z2 - 0.31],
    ] as [number, number, number, number][]) {
      void x1;
      void z1;
      void x2;
      void z2;
    }
  }

  private buildTerrace() {
    // planter boxes and city overlook furniture
    for (const [x, z] of [
      [15, 11],
      [15, 21],
      [25, 11],
      [25, 21],
    ]) {
      this.box(x - 0.9, F, z - 0.9, x + 0.9, F + 0.6, z + 0.9, this.matWallDark, true, 1);
      const plant = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x3f7a4e, roughness: 0.9 })
      );
      plant.position.set(x, F + 1.3, z);
      this.scene.add(plant);
    }
    // skyline cylinder outside the east wall
    const sky = new THREE.Mesh(
      new THREE.CylinderGeometry(64, 64, 34, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: skylineTexture(), side: THREE.BackSide, fog: false })
    );
    sky.position.set(0, 12, 0);
    this.scene.add(sky);
  }

  // ---------- exhibits ----------

  private buildExhibits() {
    // group exhibits by room
    const byRoom = new Map<string, ExhibitCfg[]>();
    for (const e of this.cfg.exhibits) {
      const list = byRoom.get(e.room) ?? [];
      list.push(e);
      byRoom.set(e.room, list);
    }

    for (const rect of ROOM_RECTS) {
      const slots = generateSlots(rect.id);
      const list = byRoom.get(rect.id) ?? [];
      const n = list.length;
      const S = slots.length;
      if (S === 0) continue;

      // even distribution of the configured exhibits across the slots
      const slotToExhibit = new Map<number, ExhibitCfg>();
      if (n > 0) {
        const used = new Set<number>();
        for (let k = 0; k < n; k++) {
          let idx = Math.floor(((k + 0.5) * S) / n);
          while (used.has(idx) && idx < S - 1) idx++;
          while (used.has(idx) && idx > 0) idx--;
          used.add(idx);
          slotToExhibit.set(idx, list[k]);
        }
      }

      // build a frame for every slot (spec: leftover frames stay hidden)
      for (let i = 0; i < S; i++) {
        const frame = this.createFrame(slots[i], slotToExhibit.get(i) ?? null, rect.id);
        this.frames.push(frame);
      }
    }

    // explicitly placed exhibits (position override)
    for (const e of this.cfg.exhibits) {
      if (!e.position) continue;
      const [x, y, z, rotY] = e.position;
      const frame = this.createFrame({ x, y, z, rotY, wall: 'S' }, e, e.room);
      this.frames.push(frame);
    }
  }

  private createFrame(slot: Slot, exhibit: ExhibitCfg | null, roomId: string): ExhibitFrame {
    const g = new THREE.Group();
    const isLetter = roomId === 'letters';

    if (!exhibit) {
      // hidden placeholder frame
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 0.07), this.matFrame);
      g.add(f);
      g.visible = false;
      g.position.set(slot.x, slot.y, slot.z);
      g.rotation.y = slot.rotY;
      this.scene.add(g);
      return { group: g, slot, exhibit: null, photoMat: new THREE.MeshBasicMaterial(), loaded: true, dist: 0 };
    }

    // black thin frame + white passe-partout + photo
    const outer = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.55, 0.07), this.matFrame);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.33, 0.02), this.matMat);
    mat.position.z = 0.045;
    const photoW = 1.55;
    const photoH = 1.08;
    const photoMat = new THREE.MeshBasicMaterial({
      map: fallbackArt(exhibit.id, exhibit.title),
      toneMapped: false,
    });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(photoW, photoH), photoMat);
    photo.position.z = 0.062;

    const height = isLetter ? 1.35 : 1.45;
    outer.scale.setScalar(height / 1.45);
    mat.scale.setScalar(height / 1.45);
    photo.scale.setScalar(height / 1.45);

    // plaque under the picture
    const plaque = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.345),
      new THREE.MeshBasicMaterial({ map: plaqueTexture(exhibit.title, exhibit.description.slice(0, 64)) })
    );
    plaque.position.set(0, -1.12, 0.045);

    // warm light pool (halo around the frame)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), this.matGlow.clone());
    glow.position.set(0, 0.35, -0.02);

    g.add(outer, mat, photo, plaque, glow);
    g.position.set(slot.x, slot.y, slot.z);
    g.rotation.y = slot.rotY;
    this.scene.add(g);

    this.interactables.push({
      id: exhibit.id,
      kind: 'exhibit',
      position: { x: slot.x, y: slot.y, z: slot.z },
      radius: 2.6,
      label: exhibit.title,
      data: exhibit,
    });

    return { group: g, slot, exhibit, photoMat, loaded: false, dist: 0 };
  }

  /** Lazy-load the full texture when the player is near. */
  private updateLazyTextures(px: number, pz: number) {
    const lazyDist = this.cfg.settings.quality.lazyDistance;
    for (const f of this.frames) {
      if (!f.exhibit || f.loaded) continue;
      const dx = px - f.slot.x;
      const dz = pz - f.slot.z;
      f.dist = Math.hypot(dx, dz);
      if (f.dist < lazyDist && f.exhibit.src) {
        f.loaded = true;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          f.photoMat.map = tex;
          f.photoMat.needsUpdate = true;
        };
        img.onerror = () => {
          /* keep fallback art */
        };
        img.src = f.exhibit.src;
      }
    }
  }

  // ---------- video screens ----------

  private buildVideos() {
    for (const v of this.cfg.videos) {
      const rect = roomRect(v.room);
      if (!rect) continue;
      // screen on the east wall of video rooms
      const x = v.room === 'video' ? 35.4 : 35.4;
      const z = v.room === 'video' ? -14 : 0;
      const y = v.room === 'video' ? 3.1 : F + 3.1;
      const rotY = -Math.PI / 2;
      const w = v.room === 'video' ? 4.0 * 1.35 : 8.0;
      const h = v.room === 'video' ? 2.25 * 1.35 : 4.5;

      // black frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, h + 0.35, 0.12), this.matFrame);
      frame.position.set(x, y, z);
      frame.rotation.y = rotY;
      this.scene.add(frame);

      let screenMat: THREE.MeshBasicMaterial;
      if (v.src) {
        const video = document.createElement('video');
        video.src = v.src;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.play().catch(() => {});
        this.videoElements.push(video);
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      } else {
        const pv = new ProceduralVideoTexture(v.fallback || 'aurora');
        this.proceduralVideos.push(pv);
        screenMat = new THREE.MeshBasicMaterial({ map: pv.texture, toneMapped: false });
      }
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
      screen.position.set(x - 0.08, y, z);
      screen.rotation.y = rotY;
      this.scene.add(screen);

      // ambient glow behind the screen
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.6), this.matGlow.clone());
      glow.position.set(x - 0.12, y, z);
      glow.rotation.y = rotY;
      this.scene.add(glow);

      this.interactables.push({
        id: v.id,
        kind: 'video',
        position: { x: x - 1.2, y, z },
        radius: 5.2,
        label: `${v.title} · звук (E)`,
        data: v,
      });

      // screen glow light
      const light = new THREE.PointLight(0x88b8ff, 4, 16, 2);
      light.position.set(x - 2.4, y, z);
      this.scene.add(light);
    }
  }

  // ---------- text panels (letters, final) ----------

  private buildTextPanels() {
    // letters room — three long letters on the walls
    const room = roomRect('letters');
    if (room) {
      this.cfg.letters.forEach((letter, i) => {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(5.2, 3.2),
          new THREE.MeshBasicMaterial({ map: textPanelTexture(letter.title, letter.text, this.cfg.museum.accentColor) })
        );
        panel.position.set(room.x1 + 3.6 + i * 6.2, F + 2.5, room.z1 + 0.45);
        this.scene.add(panel);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), this.matGlow);
        glow.position.set(room.x1 + 3.6 + i * 6.2, F + 2.5, room.z1 + 0.38);
        this.scene.add(glow);
        this.interactables.push({
          id: `letter-${i}`,
          kind: 'letter',
          position: { x: room.x1 + 3.6 + i * 6.2, y: F + 2.2, z: room.z1 + 1.4 },
          radius: 2.8,
          label: letter.title,
          data: letter,
        });
      });
    }

    // final room — the message (players enter from the north, so face -z)
    const fr = roomRect('final');
    if (fr) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(8.4, 4.6),
        new THREE.MeshBasicMaterial({
          map: textPanelTexture(this.cfg.museum.finalTitle, this.cfg.museum.finalMessage, this.cfg.museum.accentColor),
        })
      );
      panel.position.set(0, F + 2.8, fr.z1 + 0.5);
      panel.rotation.y = Math.PI;
      this.scene.add(panel);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), this.matGlow);
      glow.position.set(0, F + 2.8, fr.z1 + 0.42);
      glow.rotation.y = Math.PI;
      this.scene.add(glow);
      this.interactables.push({
        id: 'final-message',
        kind: 'final',
        position: { x: 0, y: F + 1, z: fr.z1 + 1.6 },
        radius: 4.5,
        label: this.cfg.museum.finalTitle,
      });
      this.confettiAnchor.set(0, F + 2.2, (fr.z1 + fr.z2) / 2);
    }
  }

  // ---------- sculptures ----------

  private buildSculptures() {
    const room = roomRect('sculpture');
    if (!room) return;
    const positions: [number, number][] = [
      [-6, -20],
      [-6, -12],
      [6, -20],
      [6, -12],
    ];
    this.cfg.sculptures.slice(0, 4).forEach((s, i) => {
      const [x, z] = positions[i];
      // pedestal
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.95, 1.25), this.matMat);
      ped.position.set(x, 0.475, z);
      ped.castShadow = true;
      ped.receiveShadow = true;
      this.scene.add(ped);
      this.coll.addBlock(x, 0, z, 1.3, 1.0, 1.3, 0);

      // sculpture
      let geom: THREE.BufferGeometry;
      switch (s.shape) {
        case 'torusKnot':
          geom = new THREE.TorusKnotGeometry(0.34, 0.11, 100, 16);
          break;
        case 'icosahedron':
          geom = new THREE.IcosahedronGeometry(0.42, 1);
          break;
        case 'torus':
          geom = new THREE.TorusGeometry(0.38, 0.12, 18, 42);
          break;
        default:
          geom = new THREE.TorusKnotGeometry(0.32, 0.1, 120, 12, 2, 3);
      }
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.32, metalness: 0.62 })
      );
      mesh.position.set(x, 1.62, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.shimmerList.push({ mesh, base: 0 });

      // glass case
      const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.5, 1.15), this.matGlass);
      caseMesh.position.set(x, 1.72, z);
      this.scene.add(caseMesh);

      // label
      const plaque = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.34),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(s.title, s.description.slice(0, 60)) })
      );
      plaque.position.set(x, 0.72, z + 0.72);
      plaque.rotation.x = -0.35;
      this.scene.add(plaque);

      this.interactables.push({
        id: s.id,
        kind: 'exhibit',
        position: { x, y: 1.5, z },
        radius: 2.6,
        label: s.title,
        data: {
          id: s.id,
          title: s.title,
          description: s.description,
          src: '',
          room: 'sculpture',
          year: 'скульптура',
        },
      });
    });
  }

  // ---------- specials: music sign, room name plaques ----------

  private buildSpecials() {
    // music room title plate
    const room = roomRect('music');
    if (room) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(4.2, 1.5),
        new THREE.MeshBasicMaterial({
          map: textPanelTexture(this.cfg.music.trackTitle, this.cfg.music.trackSubtitle, '#c2426c'),
        })
      );
      plate.position.set(room.x1 + 4.5, F + 3.2, room.z1 + 0.5);
      this.scene.add(plate);
    }
  }

  // ---------- lights ----------

  private buildLights() {
    // hemisphere + ambient base
    const hemi = new THREE.HemisphereLight(0xf2ead9, 0x33323a, 1.15);
    hemi.position.set(0, 20, 0);
    this.scene.add(hemi);
    const amb = new THREE.AmbientLight(0xbfb8ad, 0.62);
    this.scene.add(amb);

    // warm spot lights pool — 8 real spotlights reassigned to nearest frames
    for (let i = 0; i < 8; i++) {
      const spot = new THREE.SpotLight(0xffd9a8, 0, 18, 0.62, 0.55, 1.2);
      spot.position.set(0, 5, 0);
      spot.target.position.set(0, 2, 0);
      this.scene.add(spot, spot.target);
      this.warmLights.push(spot);
    }
    // main sun for soft shadows
    const sun = new THREE.DirectionalLight(0xfff2df, 1.35);
    sun.position.set(30, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 130;
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.bias = -0.0007;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  /** Reassign warm spotlights to the closest visible frames. */
  private updateLights(px: number, py: number, pz: number) {
    const candidates = this.frames
      .filter((f) => f.exhibit && f.group.visible)
      .map((f) => {
        const p = f.group.position;
        const d = (p.x - px) ** 2 + (p.y - py) ** 2 + (p.z - pz) ** 2;
        return { f, d };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, this.warmLights.length);

    this.warmLights.forEach((spot, i) => {
      const c = candidates[i];
      if (!c) {
        spot.intensity = 0;
        return;
      }
      const p = c.f.group.position;
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(c.f.group.quaternion);
      spot.position.set(p.x + n.x * 1.4, p.y + 1.75, p.z + n.z * 1.4);
      spot.target.position.set(p.x, p.y, p.z);
      const near = Math.max(0, 1 - c.d / 2200);
      spot.intensity = 26 * near + 6;
    });
  }

  // ------------------------------------------------------------------
  //  per-frame update
  // ------------------------------------------------------------------

  update(dt: number, playerPos: THREE.Vector3) {
    // procedural video textures
    for (const pv of this.proceduralVideos) pv.update(dt);

    // lazy textures
    this.updateLazyTextures(playerPos.x, playerPos.z);

    // spinning vinyl
    if (this.vinylDisc) this.vinylDisc.rotation.y += dt * 1.2;

    // shimmer sculptures gently
    for (const s of this.shimmerList) {
      if (s.base === 0 && s.mesh.geometry instanceof THREE.TorusKnotGeometry) {
        s.mesh.rotation.y += dt * 0.25;
      } else if (s.mesh.geometry instanceof THREE.IcosahedronGeometry) {
        s.mesh.rotation.y += dt * 0.2;
        s.mesh.rotation.x += dt * 0.12;
      } else if (s.mesh.geometry instanceof THREE.TorusGeometry) {
        s.mesh.rotation.x += dt * 0.18;
      }
    }

    // elevator motion
    const dy = this.elevatorTargetY - this.coll.elevatorY;
    if (Math.abs(dy) > 0.015) {
      const step = Math.sign(dy) * Math.min(Math.abs(dy), ELEVATOR.speed * dt);
      this.coll.elevatorY += step;
      this.elevatorGroup.position.y = this.coll.elevatorY;
    }

    this.updateLights(playerPos.x, playerPos.y, playerPos.z);
  }

  setElevatorFloor(floor: number) {
    this.elevatorTargetY = floor === 1 ? ELEVATOR.y1 : ELEVATOR.y0;
  }

  /** Find interactable nearest to a position within its radius. */
  nearestInteractable(pos: THREE.Vector3, maxDist = 3.2): Interactable | null {
    let best: Interactable | null = null;
    let bestD = maxDist;
    for (const it of this.interactables) {
      const d = Math.hypot(it.position.x - pos.x, it.position.y - pos.y, it.position.z - pos.z);
      const r = Math.min(it.radius, maxDist + 1.2);
      if (d < r && d < bestD + 0.6) {
        best = it;
        bestD = d;
      }
    }
    return best;
  }

  /** Get the exhibit associated with an interactable, if any. */
  exhibitOf(it: Interactable): ExhibitCfg | null {
    if (it.kind === 'exhibit' && it.data) return it.data as ExhibitCfg;
    return null;
  }
}
