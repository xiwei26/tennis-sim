/**
 * Room manager: handles room creation, joining, broadcasting, and cleanup.
 */

import { randomInt } from 'node:crypto';

const ROOM_CODE_LENGTH = 8;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEFAULT_EMPTY_ROOM_TIMEOUT_MS = 120_000;
const DEFAULT_WAITING_ROOM_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 30_000;
const DEFAULT_MAX_ROOMS = 1000;

export class RoomManager {
  constructor({
    startCleanup = true,
    emptyRoomDelayMs = 5000,
    closingRoomDelayMs = 5000,
    finishedRoomDelayMs = 15_000,
    emptyRoomTimeoutMs = DEFAULT_EMPTY_ROOM_TIMEOUT_MS,
    waitingRoomTimeoutMs = DEFAULT_WAITING_ROOM_TIMEOUT_MS,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
    maxRooms = DEFAULT_MAX_ROOMS,
  } = {}) {
    this.rooms = new Map();
    this.emptyRoomDelayMs = emptyRoomDelayMs;
    this.closingRoomDelayMs = closingRoomDelayMs;
    this.finishedRoomDelayMs = finishedRoomDelayMs;
    this.emptyRoomTimeoutMs = emptyRoomTimeoutMs;
    this.waitingRoomTimeoutMs = waitingRoomTimeoutMs;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.maxRooms = maxRooms;
    this.cleanupTimer = null;
    if (startCleanup) this._startCleanup();
  }

  _generateCode() {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
    }
    return code;
  }

  createRoom() {
    if (this.rooms.size >= this.maxRooms) this._cleanupExpiredRooms(Date.now());
    if (this.rooms.size >= this.maxRooms) return null;

    let id;
    do {
      id = this._generateCode();
    } while (this.rooms.has(id));

    const room = {
      id,
      players: [],
      createdAt: Date.now(),
      game: null,
      startTimers: [],
      deleteTimer: null,
      closing: false,
      finished: false,
      waitingSince: null,
    };
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

    // A transport may own at most one player slot across all rooms.
    for (const candidate of this.rooms.values()) {
      if (candidate.players.some(player => player.ws === ws)) return null;
    }

    if (room.deleteTimer) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = null;
    }
    const playerId = room.players.length === 0 ? 'player1' : 'player2';
    room.players.push({ id: playerId, ws });
    room.waitingSince = room.players.length === 1 ? Date.now() : null;
    console.log(`Player ${playerId} joined room ${roomId}`);
    return playerId;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const playerIndex = room.players.findIndex(player => player.id === playerId);
    if (playerIndex === -1) return false;

    room.players.splice(playerIndex, 1);
    room.waitingSince = null;
    this._stopGame(room);

    if (room.players.length === 0) {
      this._scheduleClose(room, this.emptyRoomDelayMs, 'destroyed (empty)');
      return true;
    }

    // A finished room already has a deletion timer and needs no second notice.
    if (room.closing) return true;

    room.closing = true;
    this.broadcast(roomId, { type: 'opponent_left', seconds: 5 });
    this._scheduleClose(room, this.closingRoomDelayMs, 'closed (opponent left)');
    return true;
  }

  finishRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.finished) return false;

    room.finished = true;
    room.closing = true;
    this._stopGame(room);
    this._scheduleClose(room, this.finishedRoomDelayMs, 'closed (match finished)');
    return true;
  }

  closeRoom(roomId, { closeSockets = true } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    this._stopGame(room);
    if (room.deleteTimer) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = null;
    }
    this.rooms.delete(roomId);

    if (closeSockets) {
      for (const player of room.players) {
        if (player.ws.readyState === 0 || player.ws.readyState === 1) {
          player.ws.close(1000, 'Room closed');
        }
      }
    }
    return true;
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

  destroy({ closeSockets = true } = {}) {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const roomId of [...this.rooms.keys()]) {
      this.closeRoom(roomId, { closeSockets });
    }
  }

  _stopGame(room) {
    for (const timer of room.startTimers || []) clearTimeout(timer);
    room.startTimers = [];
    if (room.game) {
      room.game.stop();
      room.game = null;
    }
  }

  _scheduleClose(room, delayMs, reason) {
    if (room.deleteTimer) clearTimeout(room.deleteTimer);
    room.deleteTimer = setTimeout(() => {
      if (this.rooms.get(room.id) !== room) return;
      this.closeRoom(room.id);
      console.log(`Room ${room.id} ${reason}`);
    }, delayMs);
    room.deleteTimer.unref?.();
  }

  _startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpiredRooms(Date.now());
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  _cleanupExpiredRooms(now) {
    for (const [id, room] of this.rooms) {
      const emptyExpired = room.players.length === 0
        && now - room.createdAt >= this.emptyRoomTimeoutMs;
      const waitingExpired = room.players.length === 1
        && !room.closing
        && room.waitingSince !== null
        && now - room.waitingSince >= this.waitingRoomTimeoutMs;

      if (!emptyExpired && !waitingExpired) continue;
      if (waitingExpired) {
        this.broadcast(id, { type: 'error', message: 'Room expired while waiting for opponent' });
      }
      this.closeRoom(id);
      console.log(`Room ${id} cleaned up (${waitingExpired ? 'waiting timeout' : 'timeout'})`);
    }
  }
}
