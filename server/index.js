import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './room.js';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

const roomManager = new RoomManager();

// REST API
app.post('/api/rooms', (req, res) => {
  const room = roomManager.createRoom();
  res.json({ roomId: room.id });
});

app.post('/api/rooms/join', (req, res) => {
  const { roomId } = req.body;
  const room = roomManager.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.closing) return res.status(400).json({ error: 'Room is closing' });
  if (room.players.length >= 2) return res.status(400).json({ error: 'Room is full' });
  res.json({ roomId: room.id, playerCount: room.players.length + 1 });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  let playerId = null;
  let roomId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'join_room') {
        roomId = msg.roomId;
        playerId = roomManager.addPlayer(roomId, ws);
        if (!playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Cannot join room' }));
          return;
        }
        const room = roomManager.getRoom(roomId);
        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId, playerCount: room.players.length }));

        if (room.players.length === 2) {
          // Start game
          const game = new Game(roomId, (state) => {
            roomManager.broadcast(roomId, state);
          });
          room.game = game;
          room.startTimers = [];
          const schedule = (fn, delay) => {
            const timer = setTimeout(() => {
              room.startTimers = room.startTimers.filter(t => t !== timer);
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
        return;
      }

      if (msg.type === 'input' && roomId) {
        const room = roomManager.getRoom(roomId);
        if (room && room.game) {
          room.game.handleInput(playerId, msg.keys);
        }
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

      if (msg.type === 'leave_room' && roomId) {
        roomManager.removePlayer(roomId, playerId);
        roomId = null; // prevent the close handler from removing again
      }
    } catch (e) {
      // Silently ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (roomId) {
      roomManager.removePlayer(roomId, playerId);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Tennis server running on http://localhost:${PORT}`);
});
