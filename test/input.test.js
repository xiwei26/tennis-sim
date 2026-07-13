import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const inputFiles = ['public/input.js'];

function createInputManager(path) {
  const handlers = {};
  let clock = 0;
  const context = vm.createContext({
    window: {
      addEventListener(type, handler) { handlers[type] = handler; },
      removeEventListener() {},
    },
    performance: { now: () => clock },
    Date,
  });
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  vm.runInContext(`${source}\nglobalThis.TestInputManager = InputManager;`, context);
    return {
      input: new context.TestInputManager(),
      keyDown(code) { handlers.keydown({ code, repeat: false, preventDefault() {} }); },
      keyUp(code) { handlers.keyup({ code, preventDefault() {} }); },
      blur() { handlers.blur(); },
      setClock(value) { clock = value; },
    };
  }

for (const file of inputFiles) {
  test(`${file} gives player 1 only the WASD movement profile`, () => {
    const controls = createInputManager(file);
    controls.input.setPlayerId('player1');

    controls.keyDown('ArrowUp');
    assert.equal(controls.input.getKeys().up, false);

    controls.keyDown('KeyW');
    assert.equal(controls.input.getKeys().up, true);
    controls.keyUp('KeyW');
    assert.equal(controls.input.getKeys().up, false);
  });

  test(`${file} gives player 2 only the arrow-key movement profile`, () => {
    const controls = createInputManager(file);
    controls.input.setPlayerId('player2');

    controls.keyDown('KeyW');
    assert.equal(controls.input.getKeys().up, false);

    controls.keyDown('ArrowUp');
    assert.equal(controls.input.getKeys().up, true);
    controls.keyUp('ArrowUp');
    assert.equal(controls.input.getKeys().up, false);
  });

  test(`${file} keeps shot controls available to both players`, () => {
    const controls = createInputManager(file);
    controls.input.setPlayerId('player2');
    controls.keyDown('KeyJ');
    controls.setClock(500);
    controls.keyUp('KeyJ');

    const keys = controls.input.getKeys();
    assert.equal(keys.hit_flat, true);
    assert.equal(keys.power, 0.5);
  });

  test(`${file} emits one visual swing event when a shot key is released`, () => {
    const controls = createInputManager(file);
    controls.input.setPlayerId('player1');
    controls.keyDown('KeyK');
    controls.setClock(600);
    controls.keyUp('KeyK');

    const hit = controls.input.consumeHitAnimation();
    assert.equal(hit.type, 'topspin');
    assert.equal(hit.power, 0.6);
    assert.equal(controls.input.consumeHitAnimation(), null);
  });

  test(`${file} clears movement and charge state on window blur`, () => {
    const controls = createInputManager(file);
    controls.input.setPlayerId('player1');
    controls.keyDown('KeyW');
    controls.keyDown('KeyJ');

    controls.blur();

    const keys = controls.input.getKeys();
    assert.equal(keys.up, false);
    assert.equal(controls.input.getChargeState().charging, false);
  });
}
