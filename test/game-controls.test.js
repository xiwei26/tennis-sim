import assert from 'node:assert/strict';
import test from 'node:test';
import { Game } from '../server/game.js';

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
  game.handleInput('player1', neutralInput({ down: true }));
  game.handleInput('player2', neutralInput({ down: true }));

  game._updatePlayerMovement(1);

  assert.equal(game.players.player1.z, -0.5);
  assert.equal(game.players.player2.z, 0.5);
});
