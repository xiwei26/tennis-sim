import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomManager } from '../server/room.js';

function socket() {
  return { readyState: 1, sent: [], closed: false, send(data) { this.sent.push(JSON.parse(data)); }, close() { this.closed = true; } };
}

test('room manager rejects duplicate websocket joins', () => {
  const manager = new RoomManager({ startCleanup: false });
  const room = manager.createRoom();
  const ws = socket();

  assert.equal(manager.addPlayer(room.id, ws), 'player1');
  assert.equal(manager.addPlayer(room.id, ws), null);
  assert.equal(room.players.length, 1);
});

test('room manager rejects joins for closing rooms', () => {
  const manager = new RoomManager({ startCleanup: false });
  const room = manager.createRoom();
  room.closing = true;

  assert.equal(manager.addPlayer(room.id, socket()), null);
});

test('room manager keeps a room if someone joins before empty-room deletion', async () => {
  const manager = new RoomManager({ startCleanup: false, emptyRoomDelayMs: 10 });
  const room = manager.createRoom();
  const first = socket();

  assert.equal(manager.addPlayer(room.id, first), 'player1');
  manager.removePlayer(room.id, 'player1');
  assert.equal(manager.addPlayer(room.id, socket()), 'player1');
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.equal(manager.getRoom(room.id) !== null, true);
});
