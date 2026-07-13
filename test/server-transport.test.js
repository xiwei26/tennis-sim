import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import WebSocket from 'ws';
import { RoomManager } from '../server/room.js';
import { createTennisServer } from '../server/index.js';

async function startServer(options = {}) {
  const roomManager = options.roomManager || new RoomManager({ startCleanup: false });
  const runtime = createTennisServer({ heartbeatIntervalMs: 0, ...options, roomManager });
  await new Promise((resolve, reject) => {
    runtime.server.once('error', reject);
    runtime.server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = runtime.server.address();
  return {
    ...runtime,
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
  };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function nextClose(ws, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket close')), timeoutMs);
    ws.once('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function sendUnmaskedFrame(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timed out waiting for invalid-frame connection to close'));
    }, 1000);
    let upgraded = false;
    let handshake = '';

    socket.once('error', (error) => {
      if (!upgraded || error.code !== 'ECONNRESET') reject(error);
    });
    socket.on('data', (data) => {
      if (upgraded) return;
      handshake += data.toString();
      if (!handshake.includes('101 Switching Protocols')) return;
      upgraded = true;
      // Client-to-server frames must be masked. This deliberately is not.
      socket.write(Buffer.from([0x81, 0x01, 0x78]));
    });
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.write([
      'GET / HTTP/1.1',
      'Host: 127.0.0.1',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n'));
  });
}

async function join(ws, roomId) {
  const response = nextMessage(ws);
  ws.send(JSON.stringify({ type: 'join_room', roomId }));
  return response;
}

test('a rejected third connection cannot close an active room', async () => {
  const runtime = await startServer();
  const clients = [];
  try {
    const room = runtime.roomManager.createRoom();
    clients.push(await connect(runtime.wsUrl));
    clients.push(await connect(runtime.wsUrl));
    clients.push(await connect(runtime.wsUrl));

    assert.equal((await join(clients[0], room.id)).type, 'room_joined');
    assert.equal((await join(clients[1], room.id)).type, 'room_joined');
    assert.deepEqual(await join(clients[2], room.id), { type: 'error', message: 'Cannot join room' });

    clients[2].close();
    await nextClose(clients[2]);

    assert.equal(runtime.roomManager.getRoom(room.id), room);
    assert.equal(room.players.length, 2);
    assert.equal(room.closing, false);
  } finally {
    for (const ws of clients) ws.terminate();
    await runtime.close();
  }
});

test('a joined connection cannot switch rooms', async () => {
  const runtime = await startServer();
  let client;
  try {
    const firstRoom = runtime.roomManager.createRoom();
    const secondRoom = runtime.roomManager.createRoom();
    client = await connect(runtime.wsUrl);

    assert.equal((await join(client, firstRoom.id)).playerId, 'player1');
    assert.deepEqual(await join(client, secondRoom.id), {
      type: 'error',
      message: 'Connection has already joined a room',
    });
    assert.equal(firstRoom.players.length, 1);
    assert.equal(secondRoom.players.length, 0);
  } finally {
    client?.terminate();
    await runtime.close();
  }
});

test('oversized WebSocket messages close only the offending connection', async () => {
  const runtime = await startServer({ maxPayload: 128 });
  let client;
  try {
    client = await connect(runtime.wsUrl);
    const closed = nextClose(client);
    client.send(Buffer.alloc(129));
    assert.equal(await closed, 1009);

    const response = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    assert.equal(response.status, 200);
  } finally {
    client?.terminate();
    await runtime.close();
  }
});

test('invalid unmasked frames do not crash the server', async () => {
  const runtime = await startServer();
  try {
    const { port } = runtime.server.address();
    await sendUnmaskedFrame(port);

    const response = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    assert.equal(response.status, 200);
  } finally {
    await runtime.close();
  }
});

test('heartbeat terminates connections marked as unresponsive', async () => {
  const runtime = await startServer({ heartbeatIntervalMs: 10 });
  let client;
  try {
    const serverConnection = new Promise(resolve => runtime.wss.once('connection', resolve));
    client = await connect(runtime.wsUrl);
    const serverSocket = await serverConnection;
    const closed = nextClose(client);
    serverSocket.isAlive = false;

    assert.equal(await closed, 1006);
  } finally {
    client?.terminate();
    await runtime.close();
  }
});

test('WebSocket message rate limits close abusive connections', async () => {
  const runtime = await startServer({ messageRateLimit: { max: 2, windowMs: 60_000 } });
  let client;
  try {
    client = await connect(runtime.wsUrl);
    const errorMessage = nextMessage(client);
    const closed = nextClose(client);
    client.send(JSON.stringify({ type: 'unknown' }));
    client.send(JSON.stringify({ type: 'unknown' }));
    client.send(JSON.stringify({ type: 'unknown' }));

    assert.deepEqual(await errorMessage, { type: 'error', message: 'Message rate limit exceeded' });
    assert.equal(await closed, 1008);
  } finally {
    client?.terminate();
    await runtime.close();
  }
});

test('WebSocket connection limits are shared by client IP and release on close', async () => {
  const runtime = await startServer({ maxConnectionsPerIp: 2 });
  const clients = [];
  try {
    clients.push(await connect(runtime.wsUrl));
    clients.push(await connect(runtime.wsUrl));

    const rejected = new WebSocket(runtime.wsUrl);
    clients.push(rejected);
    const errorMessage = nextMessage(rejected);
    const closed = nextClose(rejected);
    await new Promise((resolve, reject) => {
      rejected.once('open', resolve);
      rejected.once('error', reject);
    });

    assert.deepEqual(await errorMessage, { type: 'error', message: 'Too many connections from this IP' });
    assert.equal(await closed, 1008);

    const firstClosed = nextClose(clients[0]);
    clients[0].close();
    await firstClosed;
    await new Promise(resolve => setTimeout(resolve, 10));

    const replacement = await connect(runtime.wsUrl);
    clients.push(replacement);
    assert.equal(replacement.readyState, WebSocket.OPEN);
  } finally {
    for (const ws of clients) ws.terminate();
    await runtime.close();
  }
});

test('WebSocket message limits aggregate traffic across connections from one IP', async () => {
  const runtime = await startServer({
    messageRateLimit: { max: 100, windowMs: 60_000 },
    ipMessageRateLimit: { max: 3, windowMs: 60_000 },
  });
  const clients = [];
  try {
    clients.push(await connect(runtime.wsUrl));
    clients.push(await connect(runtime.wsUrl));

    assert.equal((await join(clients[0], 'MISSING1')).message, 'Cannot join room');
    assert.equal((await join(clients[0], 'MISSING2')).message, 'Cannot join room');
    assert.equal((await join(clients[1], 'MISSING3')).message, 'Cannot join room');

    const errorMessage = nextMessage(clients[1]);
    const closed = nextClose(clients[1]);
    clients[1].send(JSON.stringify({ type: 'join_room', roomId: 'MISSING4' }));

    assert.deepEqual(await errorMessage, { type: 'error', message: 'IP message rate limit exceeded' });
    assert.equal(await closed, 1008);
    assert.equal(clients[0].readyState, WebSocket.OPEN);
  } finally {
    for (const ws of clients) ws.terminate();
    await runtime.close();
  }
});

test('room creation endpoint rate limits repeated requests', async () => {
  const runtime = await startServer({ roomCreateRateLimit: { max: 2, windowMs: 60_000 } });
  try {
    const first = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    const second = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    const third = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
  } finally {
    await runtime.close();
  }
});

test('room creation rate-limit buckets are pruned after their window expires', async () => {
  const runtime = await startServer({ roomCreateRateLimit: { max: 1, windowMs: 20 } });
  try {
    const first = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.equal(runtime.rateLimiters.roomCreate.size, 1);

    await waitFor(() => runtime.rateLimiters.roomCreate.size === 0);

    const second = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    assert.equal(second.status, 200);
  } finally {
    await runtime.close();
  }
});

test('room creation endpoint returns 503 at the room capacity limit', async () => {
  const roomManager = new RoomManager({ startCleanup: false, maxRooms: 1 });
  const runtime = await startServer({ roomManager });
  try {
    const first = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });
    const second = await fetch(`${runtime.httpUrl}/api/rooms`, { method: 'POST' });

    assert.equal(first.status, 200);
    assert.equal(second.status, 503);
    assert.deepEqual(await second.json(), { error: 'Room capacity reached' });
  } finally {
    await runtime.close();
  }
});
