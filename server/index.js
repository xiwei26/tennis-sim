import express from 'express';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './room.js';
import { Game } from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_MAX_PAYLOAD = 16 * 1024;
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_MESSAGE_RATE_LIMIT = { max: 120, windowMs: 1000 };
export const DEFAULT_IP_MESSAGE_RATE_LIMIT = { max: 480, windowMs: 1000 };
export const DEFAULT_ROOM_CREATE_RATE_LIMIT = { max: 10, windowMs: 60_000 };
export const DEFAULT_MAX_WS_CONNECTIONS_PER_IP = 8;

function createSharedRateTracker({ max, windowMs }) {
  const buckets = new Map();
  const effectiveWindowMs = Math.max(1, Number(windowMs) || 1);
  const effectiveMax = Math.max(0, Number(max) || 0);

  const prune = (now = Date.now()) => {
    for (const [key, bucket] of buckets) {
      if (now - bucket.startedAt >= effectiveWindowMs) buckets.delete(key);
    }
  };

  const cleanupTimer = setInterval(prune, effectiveWindowMs);
  cleanupTimer.unref?.();

  return {
    consume(key, now = Date.now()) {
      let bucket = buckets.get(key);

      if (!bucket || now - bucket.startedAt >= effectiveWindowMs) {
        bucket = { startedAt: now, count: 0 };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      return {
        allowed: bucket.count <= effectiveMax,
        retryAfterMs: Math.max(0, effectiveWindowMs - (now - bucket.startedAt)),
      };
    },
    prune,
    destroy() {
      clearInterval(cleanupTimer);
      buckets.clear();
    },
    get size() {
      return buckets.size;
    },
  };
}

function createHttpRateLimiter(tracker) {
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const result = tracker.consume(key);
    if (result.allowed) {
      next();
      return;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'Too many rooms created; try again later' });
  };
}

function getClientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function createMessageRateTracker({ max, windowMs }) {
  let startedAt = Date.now();
  let count = 0;

  return () => {
    const now = Date.now();
    if (now - startedAt >= windowMs) {
      startedAt = now;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

function sendJson(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

export function createTennisServer({
  roomManager = new RoomManager(),
  maxPayload = DEFAULT_MAX_PAYLOAD,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  messageRateLimit = DEFAULT_MESSAGE_RATE_LIMIT,
  ipMessageRateLimit = DEFAULT_IP_MESSAGE_RATE_LIMIT,
  roomCreateRateLimit = DEFAULT_ROOM_CREATE_RATE_LIMIT,
  maxConnectionsPerIp = DEFAULT_MAX_WS_CONNECTIONS_PER_IP,
} = {}) {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, maxPayload });
  const roomCreateRateTracker = createSharedRateTracker(roomCreateRateLimit);
  const ipMessageRateTracker = createSharedRateTracker(ipMessageRateLimit);
  const connectionsByIp = new Map();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json({ limit: maxPayload }));

  app.post('/api/rooms', createHttpRateLimiter(roomCreateRateTracker), (req, res) => {
    const room = roomManager.createRoom();
    if (!room) return res.status(503).json({ error: 'Room capacity reached' });
    res.json({ roomId: room.id });
  });

  app.post('/api/rooms/join', (req, res) => {
    const { roomId } = req.body || {};
    const room = roomManager.getRoom(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.closing) return res.status(400).json({ error: 'Room is closing' });
    if (room.players.length >= 2) return res.status(400).json({ error: 'Room is full' });
    return res.json({ roomId: room.id, playerCount: room.players.length + 1 });
  });

  function startGame(roomId, room) {
    const game = new Game(roomId, (state) => {
      roomManager.broadcast(roomId, state);
      if (state.type === 'match_over') roomManager.finishRoom(roomId);
    });
    room.game = game;
    room.startTimers = [];

    const schedule = (fn, delay) => {
      const timer = setTimeout(() => {
        room.startTimers = room.startTimers.filter(candidate => candidate !== timer);
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom || currentRoom.game !== game || currentRoom.closing || currentRoom.players.length !== 2) return;
        fn();
      }, delay);
      room.startTimers.push(timer);
    };

    roomManager.broadcast(roomId, { type: 'game_start', message: 'Match started!' });
    schedule(() => {
      roomManager.broadcast(roomId, { type: 'countdown', seconds: 3 });
      schedule(() => {
        roomManager.broadcast(roomId, { type: 'countdown', seconds: 2 });
        schedule(() => {
          roomManager.broadcast(roomId, { type: 'countdown', seconds: 1 });
          schedule(() => {
            roomManager.broadcast(roomId, { type: 'game_begin' });
            game.start();
          }, 1000);
        }, 1000);
      }, 1000);
    }, 500);
  }

  wss.on('connection', (ws, req) => {
    const clientKey = getClientKey(req);
    const activeConnections = connectionsByIp.get(clientKey) || 0;

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    if (activeConnections >= maxConnectionsPerIp) {
      ws.on('error', (error) => {
        console.warn(`Rejected WebSocket connection error: ${error.message}`);
      });
      sendJson(ws, { type: 'error', message: 'Too many connections from this IP' });
      ws.close(1008, 'Connection limit exceeded');
      return;
    }

    connectionsByIp.set(clientKey, activeConnections + 1);
    let playerId = null;
    let roomId = null;
    let rateLimited = false;
    let connectionReleased = false;
    const acceptMessage = createMessageRateTracker(messageRateLimit);

    const releaseConnection = () => {
      if (connectionReleased) return;
      connectionReleased = true;
      const remaining = (connectionsByIp.get(clientKey) || 1) - 1;
      if (remaining > 0) connectionsByIp.set(clientKey, remaining);
      else connectionsByIp.delete(clientKey);
    };

    const leaveCurrentRoom = () => {
      if (!roomId || !playerId) return;
      const joinedRoomId = roomId;
      const joinedPlayerId = playerId;
      roomId = null;
      playerId = null;
      roomManager.removePlayer(joinedRoomId, joinedPlayerId);
    };

    ws.on('message', (data) => {
      if (rateLimited) return;
      const connectionAccepted = acceptMessage();
      const ipAccepted = ipMessageRateTracker.consume(clientKey).allowed;
      if (!connectionAccepted || !ipAccepted) {
        rateLimited = true;
        const message = connectionAccepted
          ? 'IP message rate limit exceeded'
          : 'Message rate limit exceeded';
        sendJson(ws, { type: 'error', message });
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'join_room') {
          if (roomId || playerId) {
            sendJson(ws, { type: 'error', message: 'Connection has already joined a room' });
            return;
          }

          const requestedRoomId = typeof msg.roomId === 'string' ? msg.roomId : '';
          const assignedPlayerId = roomManager.addPlayer(requestedRoomId, ws);
          if (!assignedPlayerId) {
            sendJson(ws, { type: 'error', message: 'Cannot join room' });
            return;
          }

          // Commit connection ownership only after addPlayer succeeds.
          roomId = requestedRoomId;
          playerId = assignedPlayerId;
          const room = roomManager.getRoom(roomId);
          sendJson(ws, { type: 'room_joined', roomId, playerId, playerCount: room.players.length });

          if (room.players.length === 2 && !room.game) startGame(roomId, room);
          return;
        }

        if (msg.type === 'input' && roomId && playerId) {
          const room = roomManager.getRoom(roomId);
          if (room?.game) room.game.handleInput(playerId, msg.keys);
        }

        if (msg.type === 'player_action' && roomId && playerId) {
          const room = roomManager.getRoom(roomId);
          const hitTypes = new Set(['flat', 'topspin', 'slice', 'volley']);
          if (room && msg.action === 'hit' && hitTypes.has(msg.hitType)) {
            roomManager.broadcast(roomId, {
              type: 'player_action',
              playerId,
              action: 'hit',
              hitType: msg.hitType,
            });
          }
        }

        if (msg.type === 'leave_room') leaveCurrentRoom();
      } catch {
        // Ignore malformed JSON while retaining the transport-level rate limit.
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom();
      releaseConnection();
    });
    ws.on('error', (error) => {
      console.warn(`WebSocket connection error: ${error.message}`);
      leaveCurrentRoom();
      releaseConnection();
      if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
    });
  });

  wss.on('error', (error) => {
    console.error(`WebSocket server error: ${error.message}`);
  });

  const heartbeatTimer = heartbeatIntervalMs > 0
    ? setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, heartbeatIntervalMs)
    : null;
  heartbeatTimer?.unref?.();

  let closing = null;
  const close = () => {
    if (closing) return closing;
    closing = (async () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      roomCreateRateTracker.destroy();
      ipMessageRateTracker.destroy();
      roomManager.destroy({ closeSockets: false });
      for (const ws of wss.clients) ws.terminate();

      await new Promise(resolve => wss.close(() => resolve()));
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        });
      }
      connectionsByIp.clear();
    })();
    return closing;
  };

  return {
    app,
    server,
    wss,
    roomManager,
    rateLimiters: {
      roomCreate: roomCreateRateTracker,
      ipMessages: ipMessageRateTracker,
    },
    close,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const runtime = createTennisServer();
  const port = Number(process.env.PORT) || 5000;
  runtime.server.listen(port, () => {
    console.log(`Tennis server running on http://localhost:${port}`);
  });
}
