import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomManager } from '../server/room.js';

function socket() {
  return { readyState: 1, sent: [], closed: false, send(data) { this.sent.push(JSON.parse(data)); }, close() { this.closed = true; } };
}

test('room manager creates unique eight-character unambiguous codes', () => {
  const manager = new RoomManager({ startCleanup: false });
  const roomIds = Array.from({ length: 16 }, () => manager.createRoom().id);

  assert.equal(new Set(roomIds).size, roomIds.length);
  for (const roomId of roomIds) {
    assert.match(roomId, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  }
});

test('room manager rejects duplicate websocket joins', () => {
  const manager = new RoomManager({ startCleanup: false });
  const room = manager.createRoom();
  const ws = socket();

  assert.equal(manager.addPlayer(room.id, ws), 'player1');
  assert.equal(manager.addPlayer(room.id, ws), null);
  assert.equal(room.players.length, 1);
});

test('room manager rejects the same websocket joining another room', () => {
  const manager = new RoomManager({ startCleanup: false });
  const firstRoom = manager.createRoom();
  const secondRoom = manager.createRoom();
  const ws = socket();

  assert.equal(manager.addPlayer(firstRoom.id, ws), 'player1');
  assert.equal(manager.addPlayer(secondRoom.id, ws), null);
  assert.equal(firstRoom.players.length, 1);
  assert.equal(secondRoom.players.length, 0);
});

test('room manager rejects joins for closing rooms', () => {
  const manager = new RoomManager({ startCleanup: false });
  const room = manager.createRoom();
  room.closing = true;

  assert.equal(manager.addPlayer(room.id, socket()), null);
});

test('room manager enforces a hard room limit and recovers capacity', () => {
  const manager = new RoomManager({ startCleanup: false, maxRooms: 2 });
  const first = manager.createRoom();
  const second = manager.createRoom();

  assert.ok(first);
  assert.ok(second);
  assert.equal(manager.createRoom(), null);

  manager.closeRoom(first.id);
  assert.ok(manager.createRoom());
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

test('removing an unknown player has no room side effects', () => {
  const manager = new RoomManager({ startCleanup: false });
  const room = manager.createRoom();
  manager.addPlayer(room.id, socket());
  manager.addPlayer(room.id, socket());
  const game = { stopped: false, stop() { this.stopped = true; } };
  room.game = game;

  assert.equal(manager.removePlayer(room.id, null), false);
  assert.equal(manager.removePlayer(room.id, 'not-a-player'), false);
  assert.equal(room.players.length, 2);
  assert.equal(room.game, game);
  assert.equal(game.stopped, false);
  assert.equal(room.closing, false);
});

test('finished rooms stop their game and are reclaimed', async () => {
  const manager = new RoomManager({ startCleanup: false, finishedRoomDelayMs: 10 });
  const room = manager.createRoom();
  const first = socket();
  const second = socket();
  manager.addPlayer(room.id, first);
  manager.addPlayer(room.id, second);
  const game = { stopped: false, stop() { this.stopped = true; } };
  room.game = game;

  assert.equal(manager.finishRoom(room.id), true);
  assert.equal(game.stopped, true);
  assert.equal(room.game, null);
  assert.equal(room.closing, true);
  assert.equal(manager.addPlayer(room.id, socket()), null);

  await new Promise(resolve => setTimeout(resolve, 25));

  assert.equal(manager.getRoom(room.id), null);
  assert.equal(first.closed, true);
  assert.equal(second.closed, true);
});

test('a single-player waiting room expires even while its socket stays open', async () => {
  const manager = new RoomManager({
    cleanupIntervalMs: 5,
    waitingRoomTimeoutMs: 10,
  });
  const room = manager.createRoom();
  const ws = socket();
  manager.addPlayer(room.id, ws);

  try {
    await new Promise(resolve => setTimeout(resolve, 35));

    assert.equal(manager.getRoom(room.id), null);
    assert.equal(ws.closed, true);
    assert.deepEqual(ws.sent, [{ type: 'error', message: 'Room expired while waiting for opponent' }]);
  } finally {
    manager.destroy();
  }
});
