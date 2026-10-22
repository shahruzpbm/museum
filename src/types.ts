/** Shared types for the 3D museum. */

export interface MuseumInfo {
  id: string;
  name: string;
  subtitle: string;
  theme: string;
  welcomeTitle: string;
  welcomeText: string;
  greeting: string;
  finalTitle: string;
  finalMessage: string;
  confetti: boolean;
  accentColor: string;
}

export interface RoomInfo {
  title: string;
  subtitle: string;
  floor: number;
  type: string;
}

export interface ExhibitCfg {
  id: string;
  room: string;
  title: string;
  description: string;
  src: string;
  year?: string;
  /** Optional explicit placement: [x, y, z, rotY] */
  position?: [number, number, number, number];
}

export interface VideoCfg {
  id: string;
  room: string;
  title: string;
  description: string;
  src: string;
  fallback: 'aurora' | 'waves' | 'bars' | 'slideshow';
}

export interface EmoteCfg {
  id: string;
  icon: string;
  label: string;
}

export interface GuestNote {
  author: string;
  text: string;
}

export interface TimelineEntry {
  year: string;
  title: string;
  text: string;
}

export interface LetterEntry {
  title: string;
  text: string;
}

export interface SculptureCfg {
  id: string;
  title: string;
  description: string;
  shape: 'torusKnot' | 'icosahedron' | 'torus' | 'knot';
  color: string;
}

export interface MuseumConfig {
  museum: MuseumInfo;
  settings: {
    player: { walkSpeed: number; runSpeed: number; radius: number; eyeHeight: number };
    camera: { distance: number; minDistance: number; maxDistance: number; fov: number; sensitivity: number };
    audio: { musicVolume: number; stepsVolume: number };
    quality: { shadows: boolean; pixelRatio: number; lazyDistance: number };
    multiplayer: { enabled: boolean; room: string; tickRate: number };
  };
  rooms: Record<string, RoomInfo>;
  emotes: EmoteCfg[];
  guestbook: GuestNote[];
  timeline: TimelineEntry[];
  letters: LetterEntry[];
  music: { trackTitle: string; trackSubtitle: string; trackUrl: string; ambient: boolean };
  videos: VideoCfg[];
  exhibits: ExhibitCfg[];
  sculptures: SculptureCfg[];
}

export type PlayerAnim =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'dance'
  | 'wave'
  | 'hearts'
  | 'clap'
  | 'spin'
  | 'kiss'
  | 'joy'
  | 'think';

export interface NetState {
  x: number;
  y: number;
  z: number;
  rotY: number;
  anim: PlayerAnim;
  name: string;
}

export interface Interactable {
  id: string;
  kind: 'exhibit' | 'video' | 'bench' | 'elevator' | 'vinyl' | 'guestbook' | 'final' | 'letter';
  position: { x: number; y: number; z: number };
  radius: number;
  label: string;
  data?: any;
  /** Called on interact key. */
  onInteract?: () => void;
}
