/**
 * Collision world: axis-aligned boxes for walls/columns/furniture,
 * ramps for the grand staircase, dynamic platform for the elevator.
 * Player is a vertical capsule approximated as a circle in XZ.
 */
import { BUILDING, STAIRS, ELEVATOR, isInAtriumHole, isInElevatorHole } from './geometry';

export interface AABB {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  /** If set, the box only blocks when player is near this vertical band. */
  floor?: number | null;
}

export interface Ramp {
  x1: number;
  x2: number;
  z1: number;
  z2: number;
  y1: number;
  y2: number;
  axis: 'z';
}

export class CollisionWorld {
  boxes: AABB[] = [];
  ramps: Ramp[] = [];
  elevatorY = 0;

  addBox(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, floor: number | null = null) {
    this.boxes.push({
      x1: Math.min(x1, x2),
      y1: Math.min(y1, y2),
      z1: Math.min(z1, z2),
      x2: Math.max(x1, x2),
      y2: Math.max(y1, y2),
      z2: Math.max(z1, z2),
      floor,
    });
  }

  /** Box helper centered on x,z with size sx,sz and height h. */
  addBlock(cx: number, cy: number, cz: number, sx: number, h: number, sz: number, floor: number | null = null) {
    this.addBox(cx - sx / 2, cy, cz - sz / 2, cx + sx / 2, cy + h, cz + sz / 2, floor);
  }

  buildStairs() {
    const s = STAIRS;
    this.ramps.push({ x1: s.x1, x2: s.x2, z1: s.ramp1.z1, z2: s.ramp1.z2, y1: s.ramp1.y1, y2: s.ramp1.y2, axis: 'z' });
    this.ramps.push({ x1: s.x1, x2: s.x2, z1: s.ramp2.z1, z2: s.ramp2.z2, y1: s.ramp2.y1, y2: s.ramp2.y2, axis: 'z' });
    // landing acts as a flat ramp
    this.ramps.push({ x1: s.x1, x2: s.x2, z1: s.landing.z1, z2: s.landing.z2, y1: s.landing.y, y2: s.landing.y, axis: 'z' });
    // side railings on the staircase
    this.addBox(s.x1 - 0.2, 0, s.ramp1.z1, s.x1, 3.2, s.ramp2.z2);
    this.addBox(s.x2, 0, s.ramp1.z1, s.x2 + 0.2, 3.2, s.ramp2.z2);
  }

  /** Height of walkable surface under (x,z) given current player Y. */
  groundHeight(x: number, z: number, curY: number): number {
    // elevator cabin
    const half = ELEVATOR.size / 2;
    if (Math.abs(x - ELEVATOR.cx) <= half && Math.abs(z - ELEVATOR.cz) <= half) {
      const ey = this.elevatorY;
      // only snap when player is close to the cabin vertically
      if (Math.abs(curY - ey) < 2.2 || curY < 0.4 || Math.abs(curY - ey) < 4) return ey;
    }

    // stairs
    const s = STAIRS;
    if (x >= s.x1 && x <= s.x2) {
      for (const r of this.ramps) {
        if (z >= r.z1 && z <= r.z2 && x >= r.x1 && x <= r.x2) {
          const t = (z - r.z1) / Math.max(0.001, r.z2 - r.z1);
          return r.y1 + (r.y2 - r.y1) * t;
        }
      }
    }

    // inside building?
    const inside =
      x > BUILDING.minX + 0.4 && x < BUILDING.maxX - 0.4 && z > BUILDING.minZ + 0.4 && z < BUILDING.maxZ - 0.4;
    if (!inside) return 0;

    if (isInAtriumHole(x, z)) {
      // open shaft down to floor 1 (staircase handled above)
      return 0;
    }
    if (isInElevatorHole(x, z)) {
      return 0;
    }
    // pick the floor closest below the player
    return curY > BUILDING.floorH * 0.55 ? BUILDING.floorH : 0;
  }

  /** Slide-circle vs AABB resolution in XZ for one axis at a time. */
  resolveAxis(pos: { x: number; y: number; z: number }, radius: number, axis: 'x' | 'z', delta: number): number {
    if (delta === 0) return 0;
    const playerFloor = pos.y > BUILDING.floorH * 0.55 ? 1 : 0;
    if (axis === 'x') pos.x += delta;
    else pos.z += delta;

    for (const b of this.boxes) {
      // vertical relevance: box must intersect player's vertical span
      const pY1 = pos.y + 0.15;
      const pY2 = pos.y + 1.75;
      if (b.y2 < pY1 || b.y1 > pY2) continue;
      if (b.floor !== null && b.floor !== undefined && b.floor !== playerFloor) continue;

      // closest point on box to circle center
      const cx = Math.max(b.x1, Math.min(pos.x, b.x2));
      const cz = Math.max(b.z1, Math.min(pos.z, b.z2));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = radius - d;
        if (d2 === 0) {
          // center inside box: push back along movement axis
          if (axis === 'x') pos.x -= delta > 0 ? push : -push;
          else pos.z -= delta > 0 ? push : -push;
        } else {
          const nx = dx / d;
          const nz = dz / d;
          pos.x += nx * push;
          pos.z += nz * push;
        }
      }
    }
    return delta;
  }

  /** Full movement with sliding: try X then Z. */
  move(pos: { x: number; y: number; z: number }, radius: number, dx: number, dz: number) {
    this.resolveAxis(pos, radius, 'x', dx);
    this.resolveAxis(pos, radius, 'z', dz);
    // keep inside building outer bounds (soft)
    const m = BUILDING.minX + radius + 0.25;
    const M = BUILDING.maxX - radius - 0.25;
    const m2 = BUILDING.minZ + radius + 0.25;
    const M2 = BUILDING.maxZ - radius - 0.25;
    if (pos.x < m) pos.x = m;
    if (pos.x > M) pos.x = M;
    if (pos.z < m2) pos.z = m2;
    if (pos.z > M2) pos.z = M2;
  }

  /** Test a camera segment against boxes (for third-person camera pull-in). */
  segmentBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const z = az + (bz - az) * t;
      for (const b of this.boxes) {
        if (x > b.x1 - 0.2 && x < b.x2 + 0.2 && y > b.y1 - 0.1 && y < b.y2 + 0.1 && z > b.z1 - 0.2 && z < b.z2 + 0.2) {
          return true;
        }
      }
    }
    return false;
  }
}
