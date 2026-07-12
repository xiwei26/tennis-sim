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

test('server awards stopped balls to the opponent of the last hitter', () => {
  const points = [];
  const game = new Game('TEST', (msg) => { if (msg.type === 'point') points.push(msg); });
  game.running = true;
  game.phase = 'playing';
  game.lastHitter = 'player1';
  game.ball = { x: 0, y: 0.15, z: -0.1, vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 } };

  game._updatePlaying(1 / 60);

  assert.equal(points[0].winner, 2);
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
