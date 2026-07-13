import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from '../server/game.js';
import { processPoint } from '../server/rules.js';

function neutralInput(overrides = {}) {
  return {
    up: false, down: false, left: false, right: false,
    hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false,
    power: 0,
    ...overrides,
  };
}

test('server applies each websocket input only to its assigned player', () => {
  const game = new Game('TEST', () => {});
  game.handleInput('player1', neutralInput({ right: true }));
  game.handleInput('player2', neutralInput());

  game._updatePlayerMovement(0.5);

  assert.equal(game.players.player1.x, 3);
  assert.equal(game.players.player2.x, 0);
});

test('server keeps both players on their own side of the net', () => {
  const game = new Game('TEST', () => {});
  game.phase = 'playing';
  game.players.player1.z = -0.6;
  game.players.player2.z = 0.6;
  // With the fixed camera, moving toward the net is "down" for player1
  // (near side, z<0) and "up" for player2 (far side, z>0).
  game.handleInput('player1', neutralInput({ down: true }));
  game.handleInput('player2', neutralInput({ up: true }));

  game._updatePlayerMovement(1);

  assert.equal(game.players.player1.z, -0.5);
  assert.equal(game.players.player2.z, 0.5);
});

test('server clears the previous serving flag when serve changes', () => {
  const game = new Game('TEST', () => {});

  game._startServe('player2');

  assert.equal(game.players.player1.serving, false);
  assert.equal(game.players.player2.serving, true);
});

test('server awards out balls to the opponent of the last hitter', () => {
  const points = [];
  const game = new Game('TEST', (msg) => { if (msg.type === 'point') points.push(msg); });
  game.running = true;
  game.phase = 'playing';
  game.lastHitter = 'player1';
  game.ball = { x: 0, y: 0.15, z: 11, vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 } };

  game._updatePlaying(1 / 60);

  assert.equal(points[0].winner, 2);
});

test('server awards a second bounce to the last hitter after an in-bounds first bounce', () => {
  const points = [];
  const game = new Game('TEST', (msg) => { if (msg.type === 'point') points.push(msg); });
  game.running = true;
  game.phase = 'playing';
  game.lastHitter = 'player1';
  game.ball = { x: 0, y: 0.15, z: 9.88, vx: 0, vy: -1, vz: 4, rotation: 0, spin: { x: 0, z: 0 } };

  game._updatePlaying(1 / 60);

  assert.equal(game.bouncesSinceHit, 1);
  assert.equal(points.length, 0);

  for (let tick = 0; tick < 30 && points.length === 0; tick++) {
    game._updatePlaying(1 / 60);
  }

  assert.ok(game.ball.z > 10, `expected the second bounce beyond the baseline, got z=${game.ball.z}`);
  assert.equal(points[0].winner, 1);
  assert.equal(points[0].reason, 'Second bounce');
});

test('server awards a net fault to the opponent of the last hitter', () => {
  const points = [];
  const game = new Game('TEST', (msg) => { if (msg.type === 'point') points.push(msg); });
  game.running = true;
  game.phase = 'playing';
  game.lastHitter = 'player1';
  game.ball = { x: 0, y: 0.8, z: -0.05, vx: 0, vy: 0, vz: 6, rotation: 0, spin: { x: 0, z: 0 } };

  game._updatePlaying(1 / 60);

  assert.equal(points[0].winner, 2);
  assert.equal(points[0].reason, 'Net fault');
});

test("server awards balls landing on the hitter's own side to the opponent", () => {
  const points = [];
  const game = new Game('TEST', (msg) => { if (msg.type === 'point') points.push(msg); });
  game.running = true;
  game.phase = 'playing';
  game.lastHitter = 'player1';
  game.ball = { x: 0, y: 0.15, z: -1, vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 } };

  game._updatePlaying(1 / 60);

  assert.equal(points[0].winner, 2);
  assert.equal(points[0].reason, 'Wrong court');
});

test('simplified tiebreak ends the set at 7-6', () => {
  const scoring = {
    p1Points: 3, p2Points: 0,
    p1Games: 6, p2Games: 6,
    p1Sets: 0, p2Sets: 0,
    servingPlayer: 1,
    isDeuce: false,
    gameWinner: null, setWinner: null, matchWinner: null,
  };

  const next = processPoint(scoring, 1);

  assert.equal(next.p1Games, 7);
  assert.equal(next.p2Games, 6);
  assert.equal(next.setWinner, 1);
  assert.equal(next.matchWinner, 1);
});

function readyRallyHit(game, playerId, { playerX = 0, ballX = 0, input = {} } = {}) {
  const player = game.players[playerId];
  player.x = playerX;
  player.z = playerId === 'player1' ? -8 : 8;
  player.hitCooldown = 0;
  game.running = true;
  game.phase = 'playing';
  game.ball = {
    x: ballX, y: 1.0, z: player.z + (playerId === 'player1' ? 0.2 : -0.2),
    vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 },
  };
  game.handleInput(playerId, neutralInput({ hit_flat: true, power: 1, ...input }));
}

test('rally hit aims left when the hitter is holding left', () => {
  const game = new Game('TEST', () => {});
  readyRallyHit(game, 'player1', { playerX: 0, ballX: 0, input: { left: true } });

  game._updatePlaying(1 / 60);

  assert.ok(game.ball.vx < 0, `expected leftward vx, got ${game.ball.vx}`);
});

test('rally hit aims right when the hitter is holding right', () => {
  const game = new Game('TEST', () => {});
  readyRallyHit(game, 'player1', { playerX: 0, ballX: 0, input: { right: true } });

  game._updatePlaying(1 / 60);

  assert.ok(game.ball.vx > 0, `expected rightward vx, got ${game.ball.vx}`);
});

test('rally hit uses player-to-ball offset when no lateral move is held', () => {
  const game = new Game('TEST', () => {});
  // Player stands left of the ball → aim left (negative x)
  readyRallyHit(game, 'player1', { playerX: -0.6, ballX: 0, input: {} });

  game._updatePlaying(1 / 60);

  assert.ok(game.ball.vx < 0, `expected leftward aim from left-side contact, got ${game.ball.vx}`);
});
