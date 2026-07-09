/**
 * Room manager — handles room creation, joining, and broadcasting.
 */

const ROOM_CODE_LENGTH = 5;
const ROOM_TIMEOUT_MS = 120_000;
const CLEANUP_INTERVAL_MS = 30_000;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._startCleanup();
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  createRoom() {
    let id;
    do {
      id = this._generateCode();
    } while (this.rooms.has(id));

    const room = { id, players: [], createdAt: Date.now(), game: null };
    this.rooms.set(id, room);
    console.log(`Room created: ${id}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  addPlayer(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length >= 2) return null;
    const playerId = room.players.length === 0 ? 'player1' : 'player2';
    room.players.push({ id: playerId, ws });
    console.log(`Player ${playerId} joined room ${roomId}`);
    return playerId;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) {
      setTimeout(() => {
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} destroyed (empty)`);
      }, 5000);
    }
  }

  broadcast(roomId, message) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const player of room.players) {
      if (player.ws.readyState === 1) {
        player.ws.send(data);
      }
    }
  }

  _startCleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [id, room] of this.rooms) {
        if (room.players.length === 0 && now - room.createdAt > ROOM_TIMEOUT_MS) {
          this.rooms.delete(id);
          console.log(`Room ${id} cleaned up (timeout)`);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }
}