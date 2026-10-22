/**
 * Multiplayer client — Socket.IO with graceful fallback to single-player.
 * The server (server/index.mjs) relays state & chat inside rooms.
 * If no server is running the museum works perfectly offline.
 */
import { io, type Socket } from 'socket.io-client';
import type { NetState, PlayerAnim } from './types';

export interface RemotePlayerData extends NetState {
  id: string;
  chat?: { text: string; time: number };
}

interface NetworkEvents {
  onJoin?: (players: RemotePlayerData[]) => void;
  onPlayerJoin?: (p: RemotePlayerData) => void;
  onPlayerLeave?: (id: string) => void;
  onState?: (id: string, state: NetState) => void;
  onChat?: (id: string, name: string, text: string) => void;
  onStatus?: (status: 'connecting' | 'online' | 'offline') => void;
}

export class Network {
  socket: Socket | null = null;
  connected = false;
  events: NetworkEvents = {};
  private tickRate = 12;
  private lastSend = 0;
  private lastState = '';

  connect(roomId: string, name: string, tickRate = 12) {
    this.tickRate = tickRate;
    this.events.onStatus?.('connecting');
    try {
      // same origin by default (vite proxies /socket.io → server)
      this.socket = io({
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 8,
        reconnectionDelay: 1200,
        timeout: 6000,
      });
    } catch {
      this.events.onStatus?.('offline');
      return;
    }

    const s = this.socket;
    s.on('connect', () => {
      this.connected = true;
      this.events.onStatus?.('online');
      s.emit('join', { room: roomId, name });
    });
    s.on('reconnect_failed', () => {
      if (!this.connected) this.events.onStatus?.('offline');
    });
    s.on('disconnect', () => {
      this.connected = false;
      this.events.onStatus?.('offline');
    });

    s.on('players', (players: RemotePlayerData[]) => {
      this.events.onJoin?.(players);
    });
    s.on('player-joined', (p: RemotePlayerData) => {
      this.events.onPlayerJoin?.(p);
    });
    s.on('player-left', (id: string) => {
      this.events.onPlayerLeave?.(id);
    });
    s.on('state', (payload: { id: string } & NetState) => {
      const { id, ...state } = payload;
      this.events.onState?.(id, state);
    });
    s.on('chat', (payload: { id: string; name: string; text: string }) => {
      this.events.onChat?.(payload.id, payload.name, payload.text);
    });
  }

  /** Send local state at tickRate Hz. */
  sendState(state: NetState) {
    if (!this.socket || !this.connected) return;
    const now = performance.now();
    if (now - this.lastSend < 1000 / this.tickRate) return;
    this.lastSend = now;
    const key = `${state.x.toFixed(2)}|${state.y.toFixed(2)}|${state.z.toFixed(2)}|${state.rotY.toFixed(2)}|${state.anim}`;
    if (key === this.lastState) return;
    this.lastState = key;
    this.socket.emit('state', state);
  }

  sendChat(text: string) {
    if (!this.socket || !this.connected) return;
    this.socket.emit('chat', { text });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }
}
