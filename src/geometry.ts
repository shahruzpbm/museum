/**
 * Building geometry tables — the physical museum.
 * Content (titles, photos, texts) lives in museum.config.json.
 * This file only defines rooms, walls, doors, stairs and slots.
 */

export const BUILDING = {
  minX: -36,
  maxX: 36,
  minZ: -24,
  maxZ: 24,
  floorH: 6,
  wallT: 0.35,
  atriumMin: -8,
  atriumMax: 8,
};

/** Grand staircase: two ramps + landing inside the atrium. */
export const STAIRS = {
  x1: -6,
  x2: 6,
  // lower flight: z from -8 (y=0) to 0.5 (y=3)
  ramp1: { z1: -8, z2: 0.5, y1: 0, y2: 3 },
  // landing
  landing: { z1: 0.5, z2: 2.2, y: 3 },
  // upper flight: z from 2.2 (y=3) to 8.4 (y=6)
  ramp2: { z1: 2.2, z2: 8.4, y1: 3, y2: 6 },
  stepCount: 26,
};

/** Glass elevator cabin (inside building, adjacent to atrium). */
export const ELEVATOR = {
  cx: 9.6,
  cz: 9.6,
  size: 2.4,
  y0: 0,
  y1: 6,
  speed: 1.6,
};

export interface RoomRect {
  id: string;
  floor: number;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export const ROOM_RECTS: RoomRect[] = [
  // ---------- floor 1 ----------
  { id: 'lobby', floor: 0, x1: -12, z1: 8, x2: 12, z2: 24 },
  { id: 'history', floor: 0, x1: -36, z1: -8, x2: -12, z2: 24 },
  { id: 'timeline', floor: 0, x1: -36, z1: -24, x2: -24, z2: -8 },
  { id: 'lounge', floor: 0, x1: -24, z1: -24, x2: -12, z2: -8 },
  { id: 'sculpture', floor: 0, x1: -12, z1: -24, x2: 12, z2: -8 },
  { id: 'atrium', floor: 0, x1: -12, z1: -8, x2: 12, z2: 8 },
  { id: 'video', floor: 0, x1: 12, z1: -24, x2: 36, z2: -4 },
  { id: 'black', floor: 0, x1: 24, z1: -4, x2: 36, z2: 24 },
  { id: 'guestbook', floor: 0, x1: 12, z1: -4, x2: 24, z2: 24 },
  // ---------- floor 2 ----------
  { id: 'music', floor: 1, x1: -36, z1: -24, x2: -12, z2: -8 },
  { id: 'travels', floor: 1, x1: -36, z1: -8, x2: -12, z2: 24 },
  { id: 'letters', floor: 1, x1: -12, z1: -24, x2: 12, z2: -12 },
  { id: 'mezzanine', floor: 1, x1: -12, z1: -12, x2: 12, z2: 12 },
  { id: 'final', floor: 1, x1: -12, z1: 12, x2: 12, z2: 24 },
  { id: 'immersive', floor: 1, x1: 12, z1: -24, x2: 36, z2: -8 },
  { id: 'cinema', floor: 1, x1: 12, z1: -8, x2: 36, z2: 8 },
  { id: 'terrace', floor: 1, x1: 12, z1: 8, x2: 36, z2: 24 },
];

export function roomAt(x: number, z: number, floor: number): string | null {
  for (const r of ROOM_RECTS) {
    if (r.floor !== floor) continue;
    if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) {
      // atrium hole on floor 2 belongs to mezzanine ring visually
      return r.id;
    }
  }
  return null;
}

export function roomRect(id: string): RoomRect | null {
  return ROOM_RECTS.find((r) => r.id === id) ?? null;
}

/** Distance from point to segment in XZ (for wall slot helpers). */
function distToSeg(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (len2 === 0) return Math.hypot(px - x1, pz - z1);
  let t = ((px - x1) * dx + (pz - z1) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

export interface Slot {
  x: number;
  y: number;
  z: number;
  rotY: number;
  wall: 'N' | 'S' | 'W' | 'E';
}

/** Door gap markers used to skip slots (x or z center of each door per room). */
const DOOR_SKIP: Record<string, { x?: number; z?: number }[]> = {
  lobby: [{ x: 0, z: 8 }, { x: -12, z: 16 }, { x: 12, z: 16 }],
  history: [{ x: -12, z: 0 }, { x: -12, z: 16 }, { x: -30, z: -8 }],
  timeline: [{ x: -30, z: -8 }, { x: -24, z: -16 }],
  lounge: [{ x: -24, z: -16 }, { x: -12, z: -16 }],
  sculpture: [{ x: -10, z: -8 }, { x: 12, z: -16 }],
  video: [{ x: 12, z: -16 }, { x: 12, z: -6 }, { x: 20, z: -4 }, { x: 30, z: -4 }],
  black: [{ x: 30, z: -4 }, { x: 24, z: 10 }],
  guestbook: [{ x: 24, z: 10 }, { x: 12, z: 0 }, { x: 20, z: -4 }],
  music: [{ x: -30, z: -8 }, { x: -12, z: -16 }],
  travels: [{ x: -30, z: -8 }, { x: -12, z: 0 }, { x: -12, z: 16 }],
  letters: [{ x: -12, z: -16 }, { x: 12, z: -16 }, { x: 0, z: -12 }],
  mezzanine: [{ x: -12, z: 0 }, { x: 12, z: 0 }, { x: 0, z: -12 }, { x: 0, z: 12 }],
  final: [{ x: 0, z: 12 }, { x: -12, z: 16 }, { x: 12, z: 16 }],
  immersive: [{ x: 12, z: -16 }, { x: 30, z: -8 }],
  cinema: [{ x: 30, z: -8 }, { x: 30, z: 8 }, { x: 12, z: 0 }],
  terrace: [{ x: 30, z: 8 }, { x: 12, z: 16 }],
};

/**
 * Generate wall slots (frames) for a room: along the 4 inner walls,
 * skipping door gaps. Slots face inward.
 */
export function generateSlots(roomId: string): Slot[] {
  const r = roomRect(roomId);
  if (!r) return [];
  const slots: Slot[] = [];
  const skip = DOOR_SKIP[roomId] ?? [];
  const spacing = 3.4;
  const margin = 2.6;
  const inset = 0.28;
  const y = 2.35;

  const push = (x: number, z: number, rotY: number, wall: Slot['wall']) => {
    for (const s of skip) {
      const sx = s.x ?? x;
      const sz = s.z ?? z;
      if (s.x !== undefined && s.z !== undefined) {
        if (Math.hypot(x - s.x, z - s.z) < 3.2) return;
      } else if (s.x !== undefined) {
        if (Math.abs(x - s.x) < 3.2 && Math.abs(z - s.z) < 3.2) return;
      } else if (s.z !== undefined) {
        if (Math.abs(z - s.z) < 3.2 && Math.abs(x - s.x) < 3.2) return;
      }
    }
    // avoid slots overlapping the staircase inside the atrium
    if (roomId === 'atrium' && z < 9 && z > -9 && x > -7 && x < 7) return;
    slots.push({ x, y, z, rotY, wall });
  };

  const width = r.x2 - r.x1;
  const depth = r.z2 - r.z1;

  // North wall (z1) — faces +z
  for (let x = r.x1 + margin; x <= r.x2 - margin + 0.01; x += spacing) {
    push(x, r.z1 + inset, 0, 'N');
  }
  // South wall (z2) — faces -z
  for (let x = r.x1 + margin; x <= r.x2 - margin + 0.01; x += spacing) {
    push(x, r.z2 - inset, Math.PI, 'S');
  }
  // West wall (x1) — faces +x
  for (let z = r.z1 + margin; z <= r.z2 - margin + 0.01; z += spacing) {
    push(r.x1 + inset, z, Math.PI / 2, 'W');
  }
  // East wall (x2) — faces -x
  for (let z = r.z1 + margin; z <= r.z2 - margin + 0.01; z += spacing) {
    push(r.x2 - inset, z, -Math.PI / 2, 'E');
  }

  // mezzanine ring: skip slots that fall inside the atrium hole
  if (roomId === 'mezzanine') {
    return slots.filter(
      (s) => !(s.x > -8.4 && s.x < 8.4 && s.z > -8.4 && s.z < 8.4)
    );
  }
  void width;
  void depth;
  return slots;
}

/** True if point is inside the floor-2 atrium hole (no floor there). */
export function isInAtriumHole(x: number, z: number): boolean {
  return x > BUILDING.atriumMin && x < BUILDING.atriumMax && z > BUILDING.atriumMin && z < BUILDING.atriumMax;
}

/** True if point is inside elevator shaft opening on floor 2. */
export function isInElevatorHole(x: number, z: number): boolean {
  const h = ELEVATOR.size / 2 + 0.25;
  return Math.abs(x - ELEVATOR.cx) < h && Math.abs(z - ELEVATOR.cz) < h;
}
