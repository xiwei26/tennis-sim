import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function loadClass(path, className, globals = {}) {
  const context = vm.createContext({ ...globals });
  vm.runInContext(`${read(path)}\nglobalThis.__LoadedClass = ${className};`, context);
  return context.__LoadedClass;
}

function createElement(tagName) {
  return {
    tagName,
    style: {},
    childNodes: [],
    _text: '',
    set textContent(value) {
      this._text = String(value);
      this.childNodes = [];
    },
    get textContent() {
      return this.childNodes.length
        ? this.childNodes.map((child) => child.textContent).join('')
        : this._text;
    },
    set innerHTML(_) {
      throw new Error('innerHTML must not be used for scores');
    },
    replaceChildren(...children) {
      this._text = '';
      this.childNodes = children;
    },
  };
}

test('Renderer3D treats network score values as text and finite counts', () => {
  const document = {
    createElement,
    createTextNode: (textContent) => ({ textContent: String(textContent) }),
  };
  const Renderer3D = loadClass('public/render.js', 'Renderer3D', { document });
  const renderer = Object.create(Renderer3D.prototype);
  renderer.scoreDisplay = createElement('div');

  renderer.updateScore({
    p1Games: '<img src=x onerror=globalThis.pwned=true>',
    p2Games: 6,
    p1Points: 1,
    p2Points: 2,
  });

  assert.equal(renderer.scoreDisplay.textContent, '0 15 - 30 6');
  assert.equal(renderer.scoreDisplay.childNodes[0].tagName, 'span');
  assert.equal(renderer.scoreDisplay.childNodes[0].textContent, '0');
});

test('GameApp preserves terminal match and server-error messages after disconnect', async () => {
  class RendererStub {
    constructor() {
      this.scores = [];
      this.messages = [];
      this.messageOverlay = { style: {} };
    }
    showMessage(...args) { this.messages.push(args); }
    updateScore(score) { this.scores.push(score); }
    updateAnimations() {}
    updateChargeBar() {}
    setPlayerMoving() {}
    render() { this.renderCalls = (this.renderCalls || 0) + 1; }
    destroy() { this.destroyed = true; }
  }

  class NetworkStub {
    constructor() {
      this.callbacks = {};
      this.inputActive = false;
      this.stopCalls = 0;
      this.closeCalls = 0;
    }
    on(event, callback) { this.callbacks[event] = callback; }
    async connect() {}
    joinRoom() {}
    startInputLoop() { this.inputActive = true; }
    stopInputLoop() { this.inputActive = false; this.stopCalls += 1; }
    sendPlayerAction() {}
    close() { this.closeCalls += 1; }
  }

  class InputStub {
    constructor() { this.resetCalls = 0; }
    setPlayerId() {}
    reset() { this.resetCalls += 1; }
    consumeHitAnimation() { return null; }
    getChargeState() { return { charging: false, power: 0, type: null }; }
    destroy() {}
  }

  const cancelledFrames = [];
  const document = { getElementById: () => null };
  const GameApp = loadClass('public/game.js', 'GameApp', {
    Renderer3D: RendererStub,
    NetworkClient: NetworkStub,
    InputManager: InputStub,
    document,
    window: {},
    console,
    requestAnimationFrame: () => 42,
    cancelAnimationFrame: (frameId) => cancelledFrames.push(frameId),
    setTimeout,
  });
  const app = new GameApp();
  await app.start('ws://example.test', 'ROOM1');

  app.network.callbacks.gameBegin({});
  assert.equal(app.running, true);
  assert.equal(app.network.inputActive, true);
  assert.equal(app.input.resetCalls, 1);

  const pointScore = { p1Games: 5, p1Points: 0, p2Games: 4, p2Points: 0 };
  app.network.callbacks.point({ winner: 1, score: pointScore });
  assert.equal(app.renderer.scores.at(-1), pointScore);
  assert.equal(app.input.resetCalls, 2);

  const finalScore = { p1Games: 6, p1Points: 0, p2Games: 4, p2Points: 0 };
  app.network.callbacks.matchOver({ winner: 1, score: finalScore });

  assert.equal(app.running, false);
  assert.equal(app.network.inputActive, false);
  assert.equal(app.renderer.scores.at(-1), finalScore);
  assert.equal(app._renderLoopStarted, false);
  assert.equal(app._animFrameId, null);
  assert.deepEqual(cancelledFrames, [42]);
  assert.equal(app.renderer.renderCalls, 2);
  assert.deepEqual(app.renderer.messages.at(-1), ['PLAYER 1 WINS!', 0]);
  assert.equal(app.renderer.destroyed, undefined);

  const stopCallsAtMatchEnd = app.network.stopCalls;
  app.network.callbacks.disconnect();

  assert.equal(app.network.stopCalls, stopCallsAtMatchEnd);
  assert.deepEqual(app.renderer.messages.at(-1), ['PLAYER 1 WINS!', 0]);

  const errorApp = new GameApp();
  await errorApp.start('ws://example.test', 'ROOM2');
  errorApp.network.callbacks.gameBegin({});
  errorApp.network.callbacks.error({ message: 'Room expired while waiting for opponent' });

  assert.equal(errorApp.running, false);
  assert.equal(errorApp.network.inputActive, false);
  assert.equal(errorApp._terminalError, true);
  assert.equal(errorApp.network.closeCalls, 1);
  assert.equal(errorApp._renderLoopStarted, false);
  assert.deepEqual(errorApp.renderer.messages.at(-1), [
    'Error: Room expired while waiting for opponent',
    0,
  ]);

  const stopCallsAtError = errorApp.network.stopCalls;
  errorApp.network.callbacks.disconnect();

  assert.equal(errorApp.network.stopCalls, stopCallsAtError);
  assert.deepEqual(errorApp.renderer.messages.at(-1), [
    'Error: Room expired while waiting for opponent',
    0,
  ]);
});

test('Renderer3D keeps persistent messages visible and hides the ball until state arrives', () => {
  const scheduled = [];
  const Renderer3D = loadClass('public/render.js', 'Renderer3D', {
    clearTimeout() {},
    setTimeout(callback, delay) {
      scheduled.push({ callback, delay });
      return scheduled.length;
    },
    Number,
  });
  const renderer = Object.create(Renderer3D.prototype);
  renderer.messageOverlay = { textContent: '', style: { opacity: '0' } };
  renderer._messageTimer = null;
  renderer.ball = {
    visible: true,
    position: { set() {} },
    rotation: { z: 0 },
  };
  renderer._updatePlayerFromState = () => {};
  renderer.updateScore = () => {};

  renderer.showMessage('Waiting for opponent...', 0);
  assert.equal(renderer.messageOverlay.style.opacity, '1');
  assert.equal(renderer._messageTimer, null);
  assert.equal(scheduled.length, 0);

  renderer.updateState({ ball: null, player1: {}, player2: {}, score: {} });
  assert.equal(renderer.ball.visible, false);
  renderer.updateState({ ball: { x: 0, y: 1, z: 2, rotation: 0 } });
  assert.equal(renderer.ball.visible, true);
});

test('GameApp can leave immediately during the opponent-left countdown', () => {
  const clearedTimers = [];
  const window = { location: { href: 'game.html' } };
  const GameApp = loadClass('public/game.js', 'GameApp', {
    window,
    clearTimeout: (timerId) => clearedTimers.push(timerId),
    cancelAnimationFrame() {},
  });
  const app = new GameApp();
  let leaveCalls = 0;
  app.network = {
    leaveRoom() { leaveCalls += 1; },
    stopInputLoop() {},
    close() {},
  };
  app.input = { destroy() {} };
  app.renderer = { destroy() {} };
  app._closing = true;
  app._roomCloseTimer = 99;

  app.leave();

  assert.equal(leaveCalls, 1);
  assert.deepEqual(clearedTimers, [99]);
  assert.equal(app._destroyed, true);
  assert.equal(window.location.href, 'index.html');
});

test('NetworkClient input loop has an explicit idempotent stop lifecycle', () => {
  let nextTimer = 0;
  const cleared = [];
  const NetworkClient = loadClass('public/network.js', 'NetworkClient', {
    setInterval: () => ++nextTimer,
    clearInterval: (timer) => cleared.push(timer),
  });
  const network = new NetworkClient();

  network.startInputLoop(() => ({}));
  assert.equal(network._inputInterval, 1);
  network.startInputLoop(() => ({}));
  assert.deepEqual(cleared, [1]);
  assert.equal(network._inputInterval, 2);

  network.stopInputLoop();
  network.stopInputLoop();
  assert.deepEqual(cleared, [1, 2]);
  assert.equal(network._inputInterval, null);
});

test('NetworkClient does not swallow application callback exceptions', async () => {
  class WebSocketStub {
    static OPEN = 1;
    constructor() { this.readyState = WebSocketStub.OPEN; }
  }

  const NetworkClient = loadClass('public/network.js', 'NetworkClient', {
    WebSocket: WebSocketStub,
    console,
    setTimeout,
    clearTimeout,
  });
  const network = new NetworkClient();
  const connected = network.connect('ws://example.test');
  network.ws.onopen();
  await connected;
  network.on('state', () => { throw new Error('renderer exploded'); });

  assert.throws(
    () => network.ws.onmessage({ data: JSON.stringify({ type: 'state' }) }),
    /renderer exploded/,
  );
  assert.doesNotThrow(() => network.ws.onmessage({ data: '{bad json' }));
});

test('NetworkClient times out stalled connections and room joins', async () => {
  class WebSocketStub {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.sent = [];
      WebSocketStub.instances.push(this);
    }
    close() { this.closed = true; }
    send(data) { this.sent.push(data); }
  }
  WebSocketStub.instances = [];

  const NetworkClient = loadClass('public/network.js', 'NetworkClient', {
    WebSocket: WebSocketStub,
    console,
    setTimeout,
    clearTimeout,
  });

  const stalled = new NetworkClient();
  await assert.rejects(stalled.connect('ws://example.test', 5), /Connection timed out/);
  assert.equal(WebSocketStub.instances[0].closed, true);

  const connected = new NetworkClient();
  const connecting = connected.connect('ws://example.test', 50);
  connected.ws.readyState = WebSocketStub.OPEN;
  connected.ws.onopen();
  await connecting;
  await assert.rejects(connected.joinRoom('ROOM1234', 5), /Timed out joining room/);
  assert.equal(connected.ws.closed, true);
});

test('GameApp handles renderer startup failure without an unhandled rejection', async () => {
  const host = { replaceChildren(...children) { this.children = children; } };
  const document = {
    body: host,
    getElementById: () => host,
    createElement: () => ({ style: {}, setAttribute() {}, textContent: '' }),
  };
  class BrokenRenderer {
    constructor() { throw new Error('WebGL unavailable'); }
  }
  const errors = [];
  const GameApp = loadClass('public/game.js', 'GameApp', {
    Renderer3D: BrokenRenderer,
    document,
    console: { error: (error) => errors.push(error) },
  });

  const app = new GameApp();
  await app.start('ws://example.test', 'ROOM1234');

  assert.equal(app._terminalError, true);
  assert.equal(host.children[0].textContent, 'Unable to start the 3D game.');
  assert.match(errors[0].message, /WebGL unavailable/);
});

test('GameApp treats leaving during a pending connection as a normal cancellation', async () => {
  let rejectConnect;
  class RendererStub {
    constructor() { this.messageOverlay = { style: {} }; }
    showMessage() { if (this.destroyed) throw new Error('rendered after destroy'); }
    updateAnimations() {}
    updateChargeBar() {}
    render() {}
    destroy() { this.destroyed = true; }
  }
  class NetworkStub {
    constructor() { this.callbacks = {}; }
    on(event, callback) { this.callbacks[event] = callback; }
    connect() { return new Promise((resolve, reject) => { rejectConnect = reject; }); }
    joinRoom() { throw new Error('must not join after leaving'); }
    leaveRoom() {}
    stopInputLoop() {}
    close() { rejectConnect(new Error('Connection closed')); }
  }
  class InputStub {
    reset() {}
    consumeHitAnimation() { return null; }
    getChargeState() { return { charging: false, power: 0, type: null }; }
    destroy() {}
  }
  const window = { location: { href: 'game.html' } };
  const GameApp = loadClass('public/game.js', 'GameApp', {
    Renderer3D: RendererStub,
    NetworkClient: NetworkStub,
    InputManager: InputStub,
    document: { getElementById: () => null },
    window,
    console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
  });

  const app = new GameApp();
  const starting = app.start('ws://example.test', 'ROOM1234');
  app.leave();
  await starting;

  assert.equal(app._destroyed, true);
  assert.equal(window.location.href, 'index.html');
  assert.equal(app.renderer.destroyed, true);
});
