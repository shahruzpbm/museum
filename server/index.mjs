/**
 * Multiplayer relay server — Node.js + Socket.IO.
 * Rooms are keyed by museum ID. Run alongside Vite:
 *   node server/index.mjs
 * Clients connect automatically to /socket.io (Vite proxies in dev).
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
  // tiny health endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: io?.engine?.clientsCount ?? 0 }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Museum multiplayer relay. Connect via Socket.IO.');
});

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 5000,
  pingTimeout: 8000,
});

/** room id -> Map<socketId, {name, state}> */
const rooms = new Map();

function publicPlayers(room) {
  const map = rooms.get(room);
  if (!map) return [];
  return [...map.entries()].map(([id, v]) => ({
    id,
    name: v.name,
    x: v.state?.x ?? 0,
    y: v.state?.y ?? 0,
    z: v.state?.z ?? 0,
    rotY: v.state?.rotY ?? 0,
    anim: v.state?.anim ?? 'idle',
    name2: v.name,
  }));
}

io.on('connection', (socket) => {
  let joinedRoom = null;

  socket.on('join', ({ room, name } = {}) => {
    const roomId = String(room || 'for-you');
    joinedRoom = roomId;
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    rooms.get(roomId).set(socket.id, { name: name || 'Гость', state: null });

    // send the current roster to the newcomer
    socket.emit('players', publicPlayers(roomId).filter((p) => p.id !== socket.id));
    // announce to others
    socket.to(roomId).emit('player-joined', {
      id: socket.id,
      name: name || 'Гость',
      x: 0,
      y: 0,
      z: 16,
      rotY: Math.PI,
      anim: 'idle',
    });
  });

  socket.on('state', (state) => {
    if (!joinedRoom) return;
    const map = rooms.get(joinedRoom);
    if (!map) return;
    const entry = map.get(socket.id);
    if (entry) entry.state = state;
    socket.to(joinedRoom).emit('state', { id: socket.id, ...state });
  });

  socket.on('chat', ({ text } = {}) => {
    if (!joinedRoom || !text) return;
    const map = rooms.get(joinedRoom);
    const name = map?.get(socket.id)?.name || 'Гость';
    socket.to(joinedRoom).emit('chat', { id: socket.id, name, text: String(text).slice(0, 240) });
  });

  socket.on('disconnect', () => {
    if (!joinedRoom) return;
    const map = rooms.get(joinedRoom);
    if (map) {
      map.delete(socket.id);
      if (map.size === 0) rooms.delete(joinedRoom);
    }
    socket.to(joinedRoom).emit('player-left', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[museum-server] multiplayer relay listening on :${PORT}`);
});
