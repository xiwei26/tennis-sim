/**
 * Room manager — handles room creation, joining, and broadcasting.
 */

const ROOM_CODE_LENGTH = 5;
const ROOM_TIMEOUT_MS = 120_000;
const CLEANUP_INTERVAL_MS = 30_000;

export class RoomManager {
  constructor({ startCleanup = true, emptyRoomDelayMs = 5000, closingRoomDelayMs = 5000 } = {}) {
    this.rooms = new Map();
    this.emptyRoomDelayMs = emptyRoomDelayMs;
    this.closingRoomDelayMs = closingRoomDelayMs;
    if (startCleanup) this._startCleanup();
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

    const room = { id, players: [], createdAt: Date.now(), game: null, startTimers: [], deleteTimer: null };
    this.rooms.set(id, room);
    console.log(`Room created: ${id}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  addPlayer(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room || room.closing || room.players.length >= 2) return null;
    if (room.players.some(p => p.ws === ws)) return null;
    if (room.deleteTimer) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = null;
    }
    const playerId = room.players.length === 0 ? 'player1' : 'player2';
    room.players.push({ id: playerId, ws });
    console.log(`Player ${playerId} joined room ${roomId}`);
    return playerId;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);

    // Stop the running match — no point simulating with a missing player.
    for (const timer of room.startTimers || []) clearTimeout(timer);
    room.startTimers = [];
    if (room.game) {
      room.game.stop();
      room.game = null;
    }

    if (room.players.length > 0) {
      // A player left mid-match: tell whoever is left, then close the room.
      if (room.closing) return;
      room.closing = true;
      this.broadcast(roomId, { type: 'opponent_left', seconds: 5 });
      room.deleteTimer = setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (!r) return;
        for (const p of r.players) {
          if (p.ws.readyState === 1) p.ws.close();
        }
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} closed (opponent left)`);
      }, this.closingRoomDelayMs);
    } else {
      // Empty room — clean up shortly.
      room.deleteTimer = setTimeout(() => {
        const r = this.rooms.get(roomId);
        if (!r || r.players.length > 0) return;
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} destroyed (empty)`);
      }, this.emptyRoomDelayMs);
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
