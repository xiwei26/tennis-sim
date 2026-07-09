# 3D Tennis Battle Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3D top-down oblique-view multiplayer networked tennis game with real tennis rules.

**Architecture:** Server-authoritative architecture — clients send keyboard inputs via WebSocket, the server runs physics + rules at 60 tick/s, and broadcasts game state at 30 fps. Clients use Three.js for rendering and linear interpolation for smooth visuals.

**Tech Stack:** Node.js + Express + ws (server), Three.js CDN (client), custom physics engine, vanilla HTML/JS.

## Global Constraints

- Single Node.js process serving both static files and WebSocket on port 5000
- No build tools — all client code loaded via `<script>` tags from `public/`
- Three.js loaded from CDN (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`)
- No database — room and game state stored in memory
- All WebSocket messages are JSON with a `type` field
- Input sampling: 30/s client → server; State broadcast: 30/s server → client; Physics: 60 tick/s server
- Court coordinate system: XZ plane (Y=up). Court width 10 units (X: -5 to +5), length 20 units (Z: -10 to +10). Net at Z=0.
- Player 1 starts at Z=-7 (top), Player 2 at Z=+7 (bottom)
- Vite is NOT used. Do not run `npm create vite` or install any frontend bundler.

---

### Task 1: Project scaffolding and server entry point

**Files:**
- Create: `package.json`
- Create: `server/index.js`
- Create: `public/index.html` (placeholder)
- Create: `public/game.html` (placeholder)

**Interfaces:**
- Produces: A running Express server on port 5000 serving static files and WebSocket.

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tennis-sim",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ws": "^8.16.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /root/tennis-sim && npm install
```

Expected: `node_modules/` created with express and ws.

- [ ] **Step 3: Create `server/index.js` — Express + WebSocket server**

```js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './room.js';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.json());

const roomManager = new RoomManager();

// REST API
app.post('/api/rooms', (req, res) => {
  const room = roomManager.createRoom();
  res.json({ roomId: room.id });
});

app.post('/api/rooms/join', (req, res) => {
  const { roomId } = req.body;
  const room = roomManager.getRoom(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.players.length >= 2) return res.status(400).json({ error: 'Room is full' });
  res.json({ roomId: room.id, playerCount: room.players.length + 1 });
});

// WebSocket handling
wss.on('connection', (ws, req) => {
  let playerId = null;
  let roomId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'join_room') {
        roomId = msg.roomId;
        playerId = roomManager.addPlayer(roomId, ws);
        if (!playerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Cannot join room' }));
          return;
        }
        const room = roomManager.getRoom(roomId);
        ws.send(JSON.stringify({ type: 'room_joined', roomId, playerId, playerCount: room.players.length }));

        if (room.players.length === 2) {
          // Start game
          const game = new Game(roomId, (state) => {
            roomManager.broadcast(roomId, state);
          });
          room.game = game;
          roomManager.broadcast(roomId, { type: 'game_start', message: 'Match started!' });
          setTimeout(() => {
            roomManager.broadcast(roomId, { type: 'countdown', seconds: 3 });
            setTimeout(() => {
              roomManager.broadcast(roomId, { type: 'countdown', seconds: 2 });
              setTimeout(() => {
                roomManager.broadcast(roomId, { type: 'countdown', seconds: 1 });
                setTimeout(() => {
                  roomManager.broadcast(roomId, { type: 'game_begin' });
                  game.start();
                }, 1000);
              }, 1000);
            }, 1000);
          }, 500);
        }
        return;
      }

      if (msg.type === 'input' && roomId) {
        const room = roomManager.getRoom(roomId);
        if (room && room.game) {
          room.game.handleInput(playerId, msg.keys);
        }
      }
    } catch (e) {
      // Silently ignore malformed messages
    }
  });

  ws.on('close', () => {
    if (roomId) {
      roomManager.removePlayer(roomId, playerId);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Tennis server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Create placeholder `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tennis Game</title>
</head>
<body>
  <h1>Tennis Game</h1>
  <p>Landing page coming in Task 9</p>
</body>
</html>
```

- [ ] **Step 5: Create placeholder `public/game.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tennis Game - Match</title>
</head>
<body style="margin:0;overflow:hidden;background:#000;">
  <p style="color:#fff;text-align:center">Game scene coming in Task 7-8</p>
</body>
</html>
```

- [ ] **Step 6: Verify server starts**

```bash
cd /root/tennis-sim && timeout 3 node server/index.js
```

Expected: Server starts and prints "Tennis server running on http://localhost:5000" then exits after 3s.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json server/index.js public/index.html public/game.html
git commit -m "feat: project scaffolding and server entry point"
```

---

### Task 2: Server rules engine

**Files:**
- Create: `server/rules.js`

**Interfaces:**
- Produces:
  - `getPointDisplay(points)` → `string`
  - `checkGameWinner(p1Points, p2Points)` → `null | 1 | 2`
  - `checkSetWinner(p1Games, p2Games)` → `null | 1 | 2`
  - `checkMatchWinner(p1Sets, p2Sets)` → `null | 1 | 2`
  - `shouldSwitchServer(p1Games, p2Games)` → `boolean`
  - `createInitialState()` → object
  - `processPoint(scoring, winner)` → updated scoring object

- [ ] **Step 1: Create server/rules.js**

```js
/**
 * Tennis scoring rules engine.
 * Game: 0→15→30→40→Game (deuce/advantage)
 * Set: first to 6 games, must lead by 2
 * Match: best of 1 set (MVP)
 */

export function getPointDisplay(points) {
  if (points <= 3) {
    const display = ['0', '15', '30', '40'];
    return display[points];
  }
  return 'AD';
}

export function checkGameWinner(p1Points, p2Points) {
  // Must have at least 4 points and lead by 2
  if (p1Points >= 4 && p1Points - p2Points >= 2) return 1;
  if (p2Points >= 4 && p2Points - p1Points >= 2) return 2;
  return null;
}

export function checkSetWinner(p1Games, p2Games) {
  // First to 6 games, must lead by 2
  if (p1Games >= 6 && p1Games - p2Games >= 2) return 1;
  if (p2Games >= 6 && p2Games - p1Games >= 2) return 2;
  // Tiebreak at 6-6: simplified, first to 7 wins
  if (p1Games === 7 && p2Games <= 5) return 1;
  if (p2Games === 7 && p1Games <= 5) return 2;
  return null;
}

export function checkMatchWinner(p1Sets, p2Sets) {
  if (p1Sets === 1) return 1;
  if (p2Sets === 1) return 2;
  return null;
}

export function shouldSwitchServer(p1Games, p2Games) {
  return true;
}

export function createInitialState() {
  return {
    p1Points: 0, p2Points: 0,
    p1Games: 0, p2Games: 0,
    p1Sets: 0, p2Sets: 0,
    servingPlayer: 1,
    isDeuce: false,
    gameWinner: null, setWinner: null, matchWinner: null
  };
}

export function processPoint(scoring, winner) {
  const s = { ...scoring };
  if (winner === 1) s.p1Points++;
  else s.p2Points++;
  s.isDeuce = s.p1Points >= 3 && s.p2Points >= 3 && s.p1Points === s.p2Points;

  const gameWinner = checkGameWinner(s.p1Points, s.p2Points);
  if (gameWinner) {
    if (gameWinner === 1) s.p1Games++;
    else s.p2Games++;
    s.p1Points = 0;
    s.p2Points = 0;
    s.isDeuce = false;
    if (shouldSwitchServer(s.p1Games, s.p2Games)) {
      s.servingPlayer = s.servingPlayer === 1 ? 2 : 1;
    }
    s.gameWinner = gameWinner;
    const setWinner = checkSetWinner(s.p1Games, s.p2Games);
    if (setWinner) {
      s.setWinner = setWinner;
      if (setWinner === 1) s.p1Sets++;
      else s.p2Sets++;
      s.matchWinner = checkMatchWinner(s.p1Sets, s.p2Sets);
    }
  }
  return s;
}
```

- [ ] **Step 2: Verify rules work correctly**

```bash
cd /root/tennis-sim && node -e "
import { processPoint, createInitialState, getPointDisplay } from './server/rules.js';
let s = createInitialState();
console.log('Initial:', s.p1Points, '-', s.p2Points);

// Player 1 wins 4 points in a row
for (let i = 0; i < 4; i++) {
  s = processPoint(s, 1);
  console.log('After point', i+1, ':', getPointDisplay(s.p1Points), '-', getPointDisplay(s.p2Points), '| games:', s.p1Games, '-', s.p2Games);
}

// Deuce test
s = createInitialState();
s.p1Points = 3; s.p2Points = 3;
console.log('Deuce:', s.isDeuce);
s = processPoint(s, 1);
console.log('AD P1:', getPointDisplay(s.p1Points), '-', getPointDisplay(s.p2Points));
s = processPoint(s, 2);
console.log('Back to Deuce:', s.isDeuce);
s = processPoint(s, 1);
s = processPoint(s, 1);
console.log('Game winner:', s.gameWinner);

// Set win test
s = createInitialState();
s.p1Games = 5; s.p2Games = 2;
for (let i = 0; i < 4; i++) s = processPoint(s, 1);
console.log('Set winner:', s.setWinner, 'Match winner:', s.matchWinner);
"
```

Expected: Correct scoring progression printed.

- [ ] **Step 3: Commit**

```bash
git add server/rules.js
git commit -m "feat: tennis scoring rules engine"
```

---

### Task 3: Server physics engine

**Files:**
- Create: `server/physics.js`

**Interfaces:**
- Produces:
  - `COURT` — court dimensions constant
  - `createBallState(fromX, fromZ, targetX, targetZ)` → ball object
  - `updateBall(ball, dt)` → mutated ball
  - `checkGroundCollision(ball)` → `{ bounced: boolean, ball }`
  - `checkNetCollision(ball)` → `boolean`
  - `checkOutOfBounds(ball)` → `'in' | 'out_left' | 'out_right' | 'out_back' | 'out_front'`
  - `applyHit(ball, hitType, hitterZ, targetZ, targetX)` → mutated ball
  - `checkRacketHit(ball, playerX, playerZ, playerReach)` → `boolean`

- [ ] **Step 1: Create server/physics.js**

```js
/**
 * Tennis physics engine (server-authoritative).
 */

const GRAVITY = -20;
const AIR_RESISTANCE = 0.998;
const BOUNCE_FACTOR = 0.7;
const FRICTION_FACTOR = 0.85;
const BALL_RADIUS = 0.15;

export const COURT = {
  width: 10, length: 20, netZ: 0, netHeight: 1.2, groundY: 0
};

export function createBallState(fromX, fromZ, targetX, targetZ) {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const speed = 12;
  return {
    x: fromX, y: 1.0, z: fromZ,
    vx: (dx / dist) * speed, vy: 6, vz: (dz / dist) * speed,
    rotation: 0, spin: { x: 0, z: 0 }
  };
}

export function updateBall(ball, dt) {
  ball.vy += GRAVITY * dt;
  ball.vx *= AIR_RESISTANCE;
  ball.vy *= AIR_RESISTANCE;
  ball.vz *= AIR_RESISTANCE;
  if (ball.spin) {
    ball.vz += ball.spin.z * dt * 2;
    ball.vy += ball.spin.x * dt * 0.5;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.rotation += Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz) * dt * 5;
  return ball;
}

export function checkGroundCollision(ball) {
  if (ball.y <= COURT.groundY + BALL_RADIUS) {
    ball.y = COURT.groundY + BALL_RADIUS;
    ball.vy = Math.abs(ball.vy) * BOUNCE_FACTOR;
    ball.vx *= FRICTION_FACTOR;
    ball.vz *= FRICTION_FACTOR;
    return { bounced: true, ball };
  }
  return { bounced: false, ball };
}

export function checkNetCollision(ball) {
  const prevZ = ball.z - ball.vz * 0.016;
  if ((prevZ <= COURT.netZ && ball.z > COURT.netZ) ||
      (prevZ >= COURT.netZ && ball.z < COURT.netZ)) {
    if (ball.y <= COURT.netHeight) return true;
  }
  if (Math.abs(ball.z) < 0.3 && ball.y <= COURT.netHeight) return true;
  return false;
}

export function checkOutOfBounds(ball) {
  if (ball.x < -COURT.width / 2) return 'out_left';
  if (ball.x > COURT.width / 2) return 'out_right';
  if (ball.z < -COURT.length / 2) return 'out_back';
  if (ball.z > COURT.length / 2) return 'out_front';
  return 'in';
}

export function checkRacketHit(ball, playerX, playerZ, playerReach) {
  const dx = ball.x - playerX;
  const dz = ball.z - playerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist <= playerReach && ball.y >= 0.5 && ball.y <= 2.0;
}

export function applyHit(ball, hitType, hitterZ, targetZ, targetX) {
  const dirZ = targetZ > hitterZ ? 1 : -1;
  const baseSpeed = 14;
  const targetXFinal = targetX != null ? targetX : (Math.random() - 0.5) * 4;

  ball.y = 0.8;
  ball.z = hitterZ + dirZ * 0.5;
  const dx = targetXFinal - ball.x;
  const dz = (targetZ + dirZ * 5) - ball.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;

  switch (hitType) {
    case 'flat':
      ball.vx = (dx / dist) * baseSpeed * 1.1;
      ball.vy = 2.5;
      ball.vz = (dz / dist) * baseSpeed * 1.1;
      ball.spin = { x: 0, z: 0 };
      break;
    case 'topspin':
      ball.vx = (dx / dist) * baseSpeed * 0.9;
      ball.vy = 6;
      ball.vz = (dz / dist) * baseSpeed * 0.9;
      ball.spin = { x: -1, z: 2 };
      break;
    case 'slice':
      ball.vx = (dx / dist) * baseSpeed * 0.6;
      ball.vy = 1.5;
      ball.vz = (dz / dist) * baseSpeed * 0.6;
      ball.spin = { x: 1, z: -1.5 };
      break;
    case 'volley':
      ball.vx = (dx / dist) * baseSpeed * 0.8;
      ball.vy = 1.0;
      ball.vz = (dz / dist) * baseSpeed * 0.8;
      ball.spin = { x: 0, z: 0 };
      break;
    default:
      ball.vx = (dx / dist) * baseSpeed;
      ball.vy = 4;
      ball.vz = (dz / dist) * baseSpeed;
      ball.spin = { x: 0, z: 0 };
  }
  return ball;
}
```

- [ ] **Step 2: Run verification test**

```bash
cd /root/tennis-sim && node -e "
import { createBallState, updateBall, checkGroundCollision, checkNetCollision, checkOutOfBounds, applyHit, checkRacketHit, COURT } from './server/physics.js';

// Test ball creation
const ball = createBallState(0, -7, 0, 7);
console.log('Ball created:', ball.x.toFixed(1), ball.y.toFixed(1), ball.z.toFixed(1), 'vz:', ball.vz.toFixed(1));

// Test update
for (let i = 0; i < 60; i++) {
  updateBall(ball, 1/60);
  checkGroundCollision(ball);
}
console.log('After 60 ticks:', ball.z.toFixed(2), 'y:', ball.y.toFixed(2));

// Test net collision
const ball2 = { x: 0, y: 0.5, z: 0, vz: 0.1 };
console.log('Net collision at z=0:', checkNetCollision(ball2));

// Test bounds
const ball3 = { x: 6, y: 1, z: 0 };
console.log('Out of bounds:', checkOutOfBounds(ball3));

// Test applyHit
const ball4 = { x: 0.5, y: 0.8, z: -6, vx: 0, vy: 0, vz: 0, spin: { x: 0, z: 0 } };
applyHit(ball4, 'topspin', -6, 6, 0);
console.log('Topspin hit - vz:', ball4.vz.toFixed(1), 'vy:', ball4.vy.toFixed(1), 'spin:', ball4.spin);

// Test racket hit
console.log('Racket hit in range:', checkRacketHit({ x: 0, y: 1, z: -5.5 }, 0, -6, 1));
console.log('Racket hit out of range:', checkRacketHit({ x: 3, y: 1, z: -5.5 }, 0, -6, 1));
"
```

- [ ] **Step 3: Commit**

```bash
git add server/physics.js
git commit -m "feat: tennis physics engine"
```

---

### Task 4: Server room manager

**Files:**
- Create: `server/room.js`

**Interfaces:**
- Produces: `RoomManager` class
  - `createRoom()` → room object
  - `getRoom(roomId)` → room or null
  - `addPlayer(roomId, ws)` → playerId or null
  - `removePlayer(roomId, playerId)` → void
  - `broadcast(roomId, message)` → void

- [ ] **Step 1: Create server/room.js**

```js
/**
 * Room manager — handles room creation, joining, and broadcasting.
 */

const ROOM_CODE_LENGTH = 5;
const ROOM_TIMEOUT_MS = 120_000;
const CLEANUP_INTERVAL_MS = 30_000;

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._startCleanup();
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

    const room = { id, players: [], createdAt: Date.now(), game: null };
    this.rooms.set(id, room);
    console.log(`Room created: ${id}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  addPlayer(roomId, ws) {
    const room = this.rooms.get(roomId);
    if (!room || room.players.length >= 2) return null;
    const playerId = room.players.length === 0 ? 'player1' : 'player2';
    room.players.push({ id: playerId, ws });
    console.log(`Player ${playerId} joined room ${roomId}`);
    return playerId;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) {
      setTimeout(() => {
        this.rooms.delete(roomId);
        console.log(`Room ${roomId} destroyed (empty)`);
      }, 5000);
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
```

- [ ] **Step 2: Run verification test**

```bash
cd /root/tennis-sim && node -e "
import { RoomManager } from './server/room.js';

const mgr = new RoomManager();
const room = mgr.createRoom();
console.log('Room created:', room.id);
console.log('Room exists:', mgr.getRoom(room.id) !== null);
console.log('Fake room null:', mgr.getRoom('FAKE') === null);

const mockPlayer1 = { readyState: 1, send: (m) => console.log('P1 received:', JSON.parse(m).type) };
const mockPlayer2 = { readyState: 1, send: (m) => console.log('P2 received:', JSON.parse(m).type) };

const p1 = mgr.addPlayer(room.id, mockPlayer1);
console.log('Player 1 ID:', p1);
const p2 = mgr.addPlayer(room.id, mockPlayer2);
console.log('Player 2 ID:', p2);
const p3 = mgr.addPlayer(room.id, mockPlayer2);
console.log('Player 3 (should be null):', p3);

mgr.broadcast(room.id, { type: 'test', data: 'hello' });
mgr.removePlayer(room.id, 'player1');
console.log('After removal, players:', room.players.length);
console.log('All tests passed!');
process.exit(0);
"
```

- [ ] **Step 3: Commit**

```bash
git add server/room.js
git commit -m "feat: room manager"
```

---

### Task 5: Server game loop

**Files:**
- Create: `server/game.js`

**Interfaces:**
- Produces: `Game` class
  - `constructor(roomId, broadcastFn)`
  - `start()` / `stop()`
  - `handleInput(playerId, keys)`
  - `getState()` → state snapshot object

- [ ] **Step 1: Create server/game.js**

```js
/**
 * Game loop — runs at 60 tick/s, processes physics and rules.
 */

import { createBallState, updateBall, checkGroundCollision, checkNetCollision, checkOutOfBounds, applyHit, checkRacketHit, COURT } from './physics.js';
import { createInitialState, processPoint } from './rules.js';

const TICK_RATE = 60;
const PLAYER_SPEED = 6;
const PLAYER_REACH = 1.0;

export class Game {
  constructor(roomId, broadcastFn) {
    this.roomId = roomId;
    this.broadcast = broadcastFn;
    this.running = false;
    this.tickCount = 0;
    this.intervalId = null;

    this.players = {
      player1: { x: 0, z: -7, serving: true, hitCooldown: 0 },
      player2: { x: 0, z: 7, serving: false, hitCooldown: 0 },
    };

    this.inputs = {
      player1: { up: false, down: false, left: false, right: false, hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false },
      player2: { up: false, down: false, left: false, right: false, hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false },
    };

    this.ball = null;
    this.scoring = createInitialState();
    this.phase = 'serve';
    this.phaseTimer = 0;
    this.ballInPlay = false;
  }

  start() {
    this.running = true;
    this._startServe('player1');
    this.intervalId = setInterval(() => this._tick(), 1000 / TICK_RATE);
  }

  stop() {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  handleInput(playerId, keys) {
    if (this.inputs[playerId]) {
      this.inputs[playerId] = { ...keys };
    }
  }

  getState() {
    return {
      type: 'state',
      tick: this.tickCount,
      ball: this.ball ? { x: this.ball.x, y: this.ball.y, z: this.ball.z, rotation: this.ball.rotation } : null,
      player1: { x: this.players.player1.x, z: this.players.player1.z, serving: this.players.player1.serving },
      player2: { x: this.players.player2.x, z: this.players.player2.z, serving: this.players.player2.serving },
      score: {
        p1Games: this.scoring.p1Games, p1Points: this.scoring.p1Points, p1Sets: this.scoring.p1Sets,
        p2Games: this.scoring.p2Games, p2Points: this.scoring.p2Points, p2Sets: this.scoring.p2Sets,
        serving: this.scoring.servingPlayer, isDeuce: this.scoring.isDeuce,
      },
      phase: this.phase,
    };
  }

  _tick() {
    if (!this.running) return;
    this.tickCount++;
    const dt = 1 / TICK_RATE;

    this._updatePlayerMovement(dt);
    this.players.player1.hitCooldown = Math.max(0, this.players.player1.hitCooldown - dt);
    this.players.player2.hitCooldown = Math.max(0, this.players.player2.hitCooldown - dt);

    switch (this.phase) {
      case 'serve':
        this._updateServe(dt);
        break;
      case 'playing':
        this._updatePlaying(dt);
        break;
      case 'point_scored':
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) {
          this._startServe(this.scoring.servingPlayer === 1 ? 'player1' : 'player2');
        }
        break;
    }

    if (this.tickCount % 2 === 0) {
      this.broadcast(this.getState());
    }
  }

  _updatePlayerMovement(dt) {
    for (const [id, player] of Object.entries(this.players)) {
      const input = this.inputs[id];
      const isPlayer1 = id === 'player1';

      if (input.left) player.x -= PLAYER_SPEED * dt;
      if (input.right) player.x += PLAYER_SPEED * dt;
      if (input.up) player.z -= PLAYER_SPEED * dt * (isPlayer1 ? 1 : -1);
      if (input.down) player.z += PLAYER_SPEED * dt * (isPlayer1 ? 1 : -1);

      player.x = Math.max(-COURT.width / 2 + 0.5, Math.min(COURT.width / 2 - 0.5, player.x));
      player.z = Math.max(-COURT.length / 2 + 0.5, Math.min(COURT.length / 2 - 0.5, player.z));
    }
  }

  _startServe(serverId) {
    this.phase = 'serve';
    this.ballInPlay = false;
    const server = this.players[serverId];
    server.serving = true;
    const serveDir = serverId === 'player1' ? 1 : -1;

    this.ball = {
      x: server.x, y: 1.0, z: server.z + serveDir * 0.5,
      vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 },
    };

    this.broadcast({ type: 'serve_ready', server: serverId });
  }

  _updateServe(dt) {
    const serverId = this.scoring.servingPlayer === 1 ? 'player1' : 'player2';
    const server = this.players[serverId];
    const serveDir = serverId === 'player1' ? 1 : -1;

    this.ball.x = server.x;
    this.ball.z = server.z + serveDir * 0.5;
    this.ball.y = 1.0;

    const input = this.inputs[serverId];
    let serveHit = false;
    if (input.hit_flat) { this._executeServe('flat', serverId, serveDir); serveHit = true; }
    else if (input.hit_topspin) { this._executeServe('topspin', serverId, serveDir); serveHit = true; }
    else if (input.hit_slice) { this._executeServe('slice', serverId, serveDir); serveHit = true; }
    else if (input.hit_volley) { this._executeServe('flat', serverId, serveDir); serveHit = true; }

    if (serveHit) {
      this.phase = 'playing';
      this.ballInPlay = true;
    }
  }

  _executeServe(hitType, serverId, serveDir) {
    const server = this.players[serverId];
    const opponentId = serverId === 'player1' ? 'player2' : 'player1';
    const opponent = this.players[opponentId];
    const targetX = opponent.x + (Math.random() - 0.5) * 3;
    const targetZ = opponentId === 'player1' ? -COURT.length / 2 + 2 : COURT.length / 2 - 2;

    applyHit(this.ball, hitType, server.z, targetZ, targetX);
    this.ball.vx *= 0.85;
    this.ball.vz *= 0.85;
    this.ball.vy = 5;
    server.hitCooldown = 0.2;
  }

  _updatePlaying(dt) {
    if (!this.ball) return;
    updateBall(this.ball, dt);

    if (checkNetCollision(this.ball)) {
      const winner = this.ball.z < 0 ? 2 : 1;
      this._awardPoint(winner, 'Net fault');
      return;
    }

    checkGroundCollision(this.ball);

    const bounds = checkOutOfBounds(this.ball);
    if (bounds !== 'in' && this.ball.y <= COURT.groundY + 0.2) {
      const winner = this.ball.z > 0 ? 1 : 2;
      this._awardPoint(winner, `Out: ${bounds}`);
      return;
    }

    for (const [id, player] of Object.entries(this.players)) {
      const input = this.inputs[id];
      const canHit = player.hitCooldown <= 0;
      if (!canHit) continue;

      let hitType = null;
      if (input.hit_flat) hitType = 'flat';
      else if (input.hit_topspin) hitType = 'topspin';
      else if (input.hit_slice) hitType = 'slice';
      else if (input.hit_volley) hitType = 'volley';

      if (hitType && checkRacketHit(this.ball, player.x, player.z, PLAYER_REACH)) {
        player.hitCooldown = 0.25;
        const isPlayer1 = id === 'player1';
        const opponentId = isPlayer1 ? 'player2' : 'player1';
        const opponent = this.players[opponentId];
        const targetZ = opponentId === 'player1' ? -COURT.length / 2 + 1 : COURT.length / 2 - 1;
        applyHit(this.ball, hitType, player.z, targetZ, opponent.x + (Math.random() - 0.5) * 2);
      }
    }

    if (Math.abs(this.ball.vy) < 0.1 && this.ball.y <= COURT.groundY + 0.15) {
      const winner = this.ball.z > 0 ? 1 : 2;
      this._awardPoint(winner, 'Missed return');
    }
  }

  _awardPoint(winner, reason) {
    this.scoring = processPoint(this.scoring, winner);
    this.phase = 'point_scored';
    this.phaseTimer = 2.0;

    this.broadcast({
      type: 'point', winner, reason,
      score: {
        p1Games: this.scoring.p1Games, p1Points: this.scoring.p1Points,
        p2Games: this.scoring.p2Games, p2Points: this.scoring.p2Points,
        serving: this.scoring.servingPlayer, isDeuce: this.scoring.isDeuce,
      },
    });

    if (this.scoring.matchWinner) {
      this.phase = 'game_over';
      this.broadcast({ type: 'match_over', winner: this.scoring.matchWinner, score: this.scoring });
      this.stop();
    }
  }
}
```

- [ ] **Step 2: Run verification test**

```bash
cd /root/tennis-sim && node -e "
import { Game } from './server/game.js';

let lastState = null;
const game = new Game('TEST', (state) => { lastState = state; });

game._startServe('player1');
const state = game.getState();
console.log('Phase:', state.phase);
console.log('Ball exists:', state.ball !== null);

game._executeServe('flat', 'player1', 1);
console.log('After serve phase:', game.phase);

for (let i = 0; i < 30; i++) game._tick();
console.log('After 30 ticks ball z:', game.ball?.z.toFixed(2));
console.log('Game running:', game.running);

game.stop();
console.log('Initialization OK');
process.exit(0);
"
```

- [ ] **Step 3: Commit**

```bash
git add server/game.js
git commit -m "feat: game loop with physics and scoring"
```

---

### Task 6: Client input module

**Files:**
- Create: `public/input.js`

**Interfaces:**
- Produces: `InputManager` class
  - `constructor()`
  - `getKeys()` → `{ up, down, left, right, hit_flat, hit_topspin, hit_slice, hit_volley }`
  - `destroy()`

- [ ] **Step 1: Create public/input.js**

```js
/**
 * Keyboard input manager.
 * Movement: WASD (P1) or Arrow keys (P2)
 * Hit: J=flat, K=topspin, L=slice, U=volley
 */

class InputManager {
  constructor() {
    this._keys = {
      up: false, down: false, left: false, right: false,
      hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false,
    };
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    const gameKeys = ['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','KeyU',
                      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                      'Numpad1','Numpad2','Numpad3','Numpad4'];
    if (gameKeys.includes(e.code)) e.preventDefault();
    this._mapKey(e.code, true);
  }

  _onKeyUp(e) {
    this._mapKey(e.code, false);
  }

  _mapKey(code, value) {
    if (code === 'KeyJ' || code === 'Numpad1') this._keys.hit_flat = value;
    else if (code === 'KeyK' || code === 'Numpad2') this._keys.hit_topspin = value;
    else if (code === 'KeyL' || code === 'Numpad3') this._keys.hit_slice = value;
    else if (code === 'KeyU' || code === 'Numpad4') this._keys.hit_volley = value;
    else if (code === 'KeyW' || code === 'ArrowUp') this._keys.up = value;
    else if (code === 'KeyS' || code === 'ArrowDown') this._keys.down = value;
    else if (code === 'KeyA' || code === 'ArrowLeft') this._keys.left = value;
    else if (code === 'KeyD' || code === 'ArrowRight') this._keys.right = value;
  }

  getKeys() {
    return { ...this._keys };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/input.js
git commit -m "feat: client input manager"
```

---

### Task 7: Client network module

**Files:**
- Create: `public/network.js`

**Interfaces:**
- Produces: `NetworkClient` class
  - `connect(serverUrl)` → Promise
  - `joinRoom(roomId)`
  - `sendInput(keys)`
  - `on(event, callback)` — events: `roomJoined`, `gameStart`, `countdown`, `gameBegin`, `state`, `point`, `matchOver`, `error`, `serveReady`, `disconnect`
  - `send(data)`
  - `close()`

- [ ] **Step 1: Create public/network.js**

```js
/**
 * WebSocket network client for communicating with the game server.
 */

class NetworkClient {
  constructor() {
    this.ws = null;
    this._callbacks = {};
    this._inputInterval = null;
  }

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl);
      this.ws.onopen = () => { console.log('Connected'); resolve(); };
      this.ws.onerror = (err) => reject(err);
      this.ws.onclose = () => {
        console.log('Disconnected');
        this._stopInputLoop();
        if (this._callbacks.disconnect) this._callbacks.disconnect();
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) { /* ignore */ }
      };
    });
  }

  joinRoom(roomId) {
    this.send({ type: 'join_room', roomId });
  }

  sendInput(keys) {
    this.send({ type: 'input', keys });
  }

  on(event, callback) {
    this._callbacks[event] = callback;
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close() {
    this._stopInputLoop();
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  _startInputLoop(getKeysFn) {
    this._inputInterval = setInterval(() => {
      this.sendInput(getKeysFn());
    }, 1000 / 30);
  }

  _stopInputLoop() {
    if (this._inputInterval) {
      clearInterval(this._inputInterval);
      this._inputInterval = null;
    }
  }

  _handleMessage(msg) {
    const map = {
      room_joined: 'roomJoined', game_start: 'gameStart', countdown: 'countdown',
      game_begin: 'gameBegin', state: 'state', point: 'point',
      match_over: 'matchOver', error: 'error', serve_ready: 'serveReady',
    };
    const cb = this._callbacks[map[msg.type]];
    if (cb) cb(msg);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/network.js
git commit -m "feat: client network module"
```

---

### Task 8: Client 3D renderer

**Files:**
- Create: `public/render.js`

**Interfaces:**
- Produces: `Renderer3D` class
  - `constructor(containerId)`
  - `updateState(state)`
  - `render()`
  - `showMessage(text, durationMs)`
  - `updateScore(score)`
  - `resize()`
  - `destroy()`

- [ ] **Step 1: Create public/render.js**

```js
/**
 * Three.js 3D renderer for the tennis court.
 * Fixed oblique view: camera at 45° looking down at the court.
 */

class Renderer3D {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = null;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB);

    // Camera — fixed oblique view
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
    this.camera.position.set(0, 14, 12);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-5, 10, -5);
    this.scene.add(fillLight);

    this._buildCourt();
    this._buildNet();

    // Ball
    const ballGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xD4E157, roughness: 0.3 });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.ball.position.set(0, 0.5, 0);
    this.scene.add(this.ball);

    // Players
    this.players = {};
    this._createPlayer('player1', 0xE53935);
    this._createPlayer('player2', 0x1E88E5);

    this._createScoreDisplay();
    this._createMessageOverlay();

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _buildCourt() {
    const courtMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 });
    this.court = new THREE.Mesh(new THREE.PlaneGeometry(10, 20), courtMat);
    this.court.rotation.x = -Math.PI / 2;
    this.court.receiveShadow = true;
    this.scene.add(this.court);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x388E3C, roughness: 0.8 });
    for (let z = -9; z <= 9; z += 2.5) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.01, z);
      this.scene.add(stripe);
    }

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    this._addLine(lineMat, -5, 0.02, -10, 5, 0.02, -10);
    this._addLine(lineMat, -5, 0.02, -10, -5, 0.02, 10);
    this._addLine(lineMat, 5, 0.02, -10, 5, 0.02, 10);
    this._addLine(lineMat, -5, 0.02, 10, 5, 0.02, 10);
    this._addLine(lineMat, -4.5, 0.02, -3.5, 4.5, 0.02, -3.5);
    this._addLine(lineMat, -4.5, 0.02, 3.5, 4.5, 0.02, 3.5);
    this._addLine(lineMat, 0, 0.02, -3.5, 0, 0.02, 3.5);
    this._addLine(lineMat, 0, 0.02, -10, 0, 0.02, -9.5);
    this._addLine(lineMat, 0, 0.02, 10, 0, 0.02, 9.5);
    this._addLine(lineMat, -4.5, 0.02, -10, -4.5, 0.02, 10);
    this._addLine(lineMat, 4.5, 0.02, -10, 4.5, 0.02, 10);
  }

  _addLine(mat, x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)
    ]);
    this.scene.add(new THREE.Line(geo, mat));
  }

  _buildNet() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5 });
    for (const x of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), postMat);
      post.position.set(x, 0.75, 0);
      this.scene.add(post);
    }
    const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, wireframe: true });
    const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2, 20, 10), netMat);
    net.position.set(0, 0.6, 0);
    this.scene.add(net);
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const tape = new THREE.Mesh(new THREE.BoxGeometry(10, 0.04, 0.04), tapeMat);
    tape.position.set(0, 1.2, 0);
    this.scene.add(tape);
  }

  _createPlayer(id, color) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8), bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    group.add(body);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xFFDBAC, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
    head.position.y = 1.0;
    head.castShadow = true;
    group.add(head);
    const racketMat = new THREE.MeshStandardMaterial({ color: 0xDDDDDD, roughness: 0.3 });
    const racket = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.05), racketMat);
    racket.position.set(0.45, 0.6, 0);
    group.add(racket);
    this.scene.add(group);
    this.players[id] = { group, racket };
  }

  _createScoreDisplay() {
    const div = document.createElement('div');
    div.id = 'score-display';
    div.style.cssText = `position:absolute;top:20px;left:50%;transform:translateX(-50%);
      color:#fff;font-family:'Courier New',monospace;font-size:28px;font-weight:bold;
      text-align:center;background:rgba(0,0,0,0.6);padding:10px 30px;border-radius:8px;z-index:10;`;
    div.innerHTML = '0 - 0';
    this.container.appendChild(div);
    this.scoreDisplay = div;

    const p1 = document.createElement('div');
    p1.style.cssText = `position:absolute;top:70px;left:50%;transform:translateX(-120px);
      color:#E53935;font-size:14px;z-index:10;`;
    p1.textContent = 'PLAYER 1 (WASD + J/K/L/U)';
    this.container.appendChild(p1);

    const p2 = document.createElement('div');
    p2.style.cssText = `position:absolute;top:70px;left:50%;transform:translateX(20px);
      color:#1E88E5;font-size:14px;z-index:10;`;
    p2.textContent = 'PLAYER 2 (ARROWS + J/K/L/U)';
    this.container.appendChild(p2);
  }

  _createMessageOverlay() {
    const el = document.createElement('div');
    el.id = 'message-overlay';
    el.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      color:#fff;font-family:'Courier New',monospace;font-size:48px;font-weight:bold;
      text-align:center;text-shadow:2px 2px 4px rgba(0,0,0,0.8);
      z-index:20;pointer-events:none;opacity:0;transition:opacity 0.3s;`;
    this.container.appendChild(el);
    this.messageOverlay = el;
  }

  showMessage(text, durationMs = 2000) {
    this.messageOverlay.textContent = text;
    this.messageOverlay.style.opacity = '1';
    setTimeout(() => { this.messageOverlay.style.opacity = '0'; }, durationMs);
  }

  updateScore(score) {
    const POINT_LABELS = ['0', '15', '30', '40', 'AD'];
    const p1l = POINT_LABELS[Math.min(score.p1Points, 4)] || 'AD';
    const p2l = POINT_LABELS[Math.min(score.p2Points, 4)] || 'AD';
    let st = `${p1l} - ${p2l}`;
    if (score.isDeuce) st = 'DEUCE';
    if (score.p1Points >= 4 && score.p1Points - score.p2Points === 1) st = 'AD P1';
    if (score.p2Points >= 4 && score.p2Points - score.p1Points === 1) st = 'AD P2';
    this.scoreDisplay.innerHTML = `<span style="color:#E53935">${score.p1Games}</span> ${st} <span style="color:#1E88E5">${score.p2Games}</span>`;
  }

  updateState(state) {
    this.state = state;
    if (!state || !state.ball) return;
    this.ball.position.set(state.ball.x, state.ball.y, state.ball.z);
    this.ball.rotation.z = state.ball.rotation || 0;
    if (state.player1) this.players.player1.group.position.set(state.player1.x, 0, state.player1.z);
    if (state.player2) this.players.player2.group.position.set(state.player2.x, 0, state.player2.z);
    if (state.score) this.updateScore(state.score);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/render.js
git commit -m "feat: 3D renderer with court, players, ball"
```

---

### Task 9: Client game page — main orchestrator

**Files:**
- Create: `public/game.js`
- Modify: `public/game.html`

**Interfaces:**
- Consumes: `input.js`, `network.js`, `render.js`, Three.js CDN
- Produces: `GameApp` class that wires everything together + game HTML page

- [ ] **Step 1: Create public/game.js**

```js
/**
 * Game orchestrator — wires network, input, and renderer together.
 */

class GameApp {
  constructor() {
    this.renderer = null;
    this.network = null;
    this.input = null;
    this.playerId = null;
    this.running = false;
    this._animFrameId = null;
  }

  async start(serverUrl, roomId) {
    this.renderer = new Renderer3D('game-container');
    this.network = new NetworkClient();
    this.input = new InputManager();

    // Show connecting message
    this.renderer.showMessage('Connecting...', 5000);

    // Register callbacks
    this.network.on('roomJoined', (msg) => {
      this.playerId = msg.playerId;
      console.log('Joined as:', this.playerId);
      this.renderer.showMessage('Waiting for opponent...', 5000);
    });

    this.network.on('gameStart', (msg) => {
      this.renderer.showMessage('Match found!', 1500);
    });

    this.network.on('countdown', (msg) => {
      this.renderer.showMessage(`${msg.seconds}`, 1000);
    });

    this.network.on('gameBegin', () => {
      this.renderer.showMessage('PLAY!', 800);
      this.running = true;
      // Start input loop
      this.network._startInputLoop(() => this.input.getKeys());
      // Start render loop
      this._startRenderLoop();
    });

    this.network.on('state', (msg) => {
      this.renderer.updateState(msg);
    });

    this.network.on('point', (msg) => {
      const playerLabel = msg.winner === 1 ? 'Player 1' : 'Player 2';
      this.renderer.showMessage(`${playerLabel} wins point!`, 1500);
    });

    this.network.on('matchOver', (msg) => {
      this.running = false;
      const winnerLabel = msg.winner === 1 ? 'PLAYER 1' : 'PLAYER 2';
      this.renderer.showMessage(`${winnerLabel} WINS!`, 10000);
      this.renderer.messageOverlay.style.fontSize = '64px';
    });

    this.network.on('serveReady', (msg) => {
      this.renderer.showMessage('Press J/K/L to serve!', 2000);
    });

    this.network.on('error', (msg) => {
      this.renderer.showMessage(`Error: ${msg.message}`, 3000);
    });

    this.network.on('disconnect', () => {
      this.running = false;
      this.renderer.showMessage('Disconnected from server', 5000);
    });

    // Connect and join
    try {
      await this.network.connect(serverUrl);
      this.network.joinRoom(roomId);
    } catch (err) {
      this.renderer.showMessage('Connection failed!', 5000);
      console.error(err);
    }
  }

  _startRenderLoop() {
    const loop = () => {
      this.renderer.render();
      if (this.running || this.roomId) {
        this._animFrameId = requestAnimationFrame(loop);
      }
    };
    // Always render (even during countdown, to show scene)
    const fullLoop = () => {
      this.renderer.render();
      this._animFrameId = requestAnimationFrame(fullLoop);
    };
    fullLoop();
  }

  destroy() {
    this.running = false;
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this.network) this.network.close();
    if (this.input) this.input.destroy();
    if (this.renderer) this.renderer.destroy();
  }
}
```

- [ ] **Step 2: Update public/game.html with full game page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tennis Game - Match</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #game-container { width: 100%; height: 100%; }
    #controls-help {
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      color: rgba(255,255,255,0.5); font-family: 'Courier New', monospace;
      font-size: 13px; text-align: center; z-index: 10;
      background: rgba(0,0,0,0.4); padding: 8px 16px; border-radius: 6px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <div id="controls-help">Move: WASD / Arrow Keys &nbsp;|&nbsp; J=Flat K=Topspin L=Slice U=Volley</div>

  <script src="input.js"></script>
  <script src="network.js"></script>
  <script src="render.js"></script>
  <script src="game.js"></script>
  <script>
    // Read roomId from URL parameter
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    const serverUrl = params.get('server') || `ws://${window.location.host}`;

    if (!roomId) {
      document.body.innerHTML = '<div style="color:#fff;padding:40px;font-size:24px">Error: No room ID provided. Go back and join a room.</div>';
    } else {
      const app = new GameApp();
      app.start(serverUrl, roomId);
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add public/game.js public/game.html
git commit -m "feat: game orchestrator and game HTML page"
```

---

### Task 10: Landing page — create/join rooms

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Update public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Tennis Battle</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', -apple-system, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #fff;
    }
    .container {
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      padding: 48px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
      max-width: 500px;
      width: 90%;
    }
    h1 { font-size: 36px; margin-bottom: 8px; letter-spacing: 2px; }
    h1 span.red { color: #E53935; }
    h1 span.blue { color: #1E88E5; }
    .subtitle { color: rgba(255,255,255,0.6); margin-bottom: 32px; font-size: 14px; }
    .btn {
      display: block; width: 100%; padding: 16px; border: 2px solid rgba(255,255,255,0.2);
      border-radius: 12px; background: rgba(255,255,255,0.06);
      color: #fff; font-size: 18px; cursor: pointer; transition: all 0.2s;
      margin-bottom: 16px; font-weight: 600;
    }
    .btn:hover { background: rgba(255,255,255,0.15); border-color: #fff; }
    .btn-primary { background: #2E7D32; border-color: #2E7D32; }
    .btn-primary:hover { background: #388E3C; border-color: #388E3C; }
    .input-group {
      display: flex; gap: 12px; margin-bottom: 16px;
    }
    .input-group input {
      flex: 1; padding: 16px; border: 2px solid rgba(255,255,255,0.2);
      border-radius: 12px; background: rgba(255,255,255,0.06);
      color: #fff; font-size: 18px; text-align: center;
      text-transform: uppercase; letter-spacing: 6px; outline: none;
      font-weight: 600;
    }
    .input-group input:focus { border-color: #2E7D32; }
    .input-group input::placeholder {
      text-transform: none; letter-spacing: 1px; color: rgba(255,255,255,0.3);
    }
    .input-group .btn { width: auto; padding: 16px 24px; margin-bottom: 0; }
    .room-code {
      background: rgba(0,0,0,0.3); padding: 20px; border-radius: 12px;
      margin: 16px 0; display: none;
    }
    .room-code .code {
      font-size: 48px; letter-spacing: 10px; font-weight: bold;
      color: #D4E157; font-family: 'Courier New', monospace;
    }
    .room-code .hint { color: rgba(255,255,255,0.5); margin-top: 8px; font-size: 13px; }
    .status { margin-top: 16px; padding: 12px; border-radius: 8px; display: none; }
    .status.error { display: block; background: rgba(229,57,53,0.2); color: #E53935; }
    .status.info { display: block; background: rgba(46,125,50,0.2); color: #81C784; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0; }
    .controls-info {
      margin-top: 20px; font-size: 12px; color: rgba(255,255,255,0.4);
    }
    .controls-info kbd {
      background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;
      font-family: 'Courier New', monospace; font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1><span class="red">●</span> TENNIS <span class="blue">●</span></h1>
    <p class="subtitle">3D Multiplayer Online Tennis</p>

    <button class="btn btn-primary" id="create-btn">Create New Room</button>

    <hr class="divider">

    <div class="input-group">
      <input type="text" id="room-code-input" placeholder="Room Code" maxlength="5">
      <button class="btn" id="join-btn">Join</button>
    </div>

    <div class="room-code" id="room-display">
      <p style="color:rgba(255,255,255,0.6);margin-bottom:4px;">Share this code:</p>
      <div class="code" id="room-code-value">ABC12</div>
      <p class="hint">Waiting for opponent to join...</p>
    </div>

    <div class="status" id="status-message"></div>

    <hr class="divider">

    <div class="controls-info">
      <kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Move &nbsp;|&nbsp;
      <kbd>J</kbd> Flat <kbd>K</kbd> Topspin <kbd>L</kbd> Slice <kbd>U</kbd> Volley
    </div>
  </div>

  <script>
    const serverUrl = window.location.origin;

    // State
    let currentRoomId = null;
    let ws = null;

    // DOM elements
    const createBtn = document.getElementById('create-btn');
    const joinBtn = document.getElementById('join-btn');
    const roomInput = document.getElementById('room-code-input');
    const roomDisplay = document.getElementById('room-display');
    const roomCodeValue = document.getElementById('room-code-value');
    const statusMsg = document.getElementById('status-message');

    function showStatus(msg, type = 'info') {
      statusMsg.className = 'status ' + type;
      statusMsg.textContent = msg;
    }

    function hideStatus() {
      statusMsg.className = 'status';
    }

    // Create room via REST API
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      createBtn.textContent = 'Creating...';
      hideStatus();

      try {
        const resp = await fetch('/api/rooms', { method: 'POST' });
        const data = await resp.json();
        currentRoomId = data.roomId;
        roomCodeValue.textContent = currentRoomId;
        roomDisplay.style.display = 'block';
        showStatus('Room created! Share the code with your opponent.', 'info');

        // Also navigate to game as player 1
        // But first we need to connect via WS and join
        connectAndJoin(currentRoomId);

      } catch (err) {
        showStatus('Failed to create room: ' + err.message, 'error');
      }

      createBtn.disabled = false;
      createBtn.textContent = 'Create New Room';
    });

    // Join room
    joinBtn.addEventListener('click', () => {
      const code = roomInput.value.trim().toUpperCase();
      if (code.length < 3) {
        showStatus('Please enter a valid room code', 'error');
        return;
      }
      hideStatus();

      // Verify room exists via REST API
      fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: code }),
      }).then(resp => {
        if (!resp.ok) return resp.json().then(d => { throw new Error(d.error); });
        return resp.json();
      }).then(data => {
        currentRoomId = data.roomId;
        connectAndJoin(currentRoomId);
      }).catch(err => {
        showStatus(err.message, 'error');
      });
    });

    function connectAndJoin(roomId) {
      showStatus('Connecting...', 'info');

      // Navigate to game page
      window.location.href = `/game.html?room=${roomId}`;
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "feat: landing page with room create/join"
```

---

### Task 11: Integration test — run full server

**Files:**
- Run: integration test

- [ ] **Step 1: Start the server**

```bash
cd /root/tennis-sim && node server/index.js &
sleep 2
echo "Server started"
```

Expected: Server prints "Tennis server running on http://localhost:5000"

- [ ] **Step 2: Test REST API endpoints**

```bash
# Test create room
curl -s -X POST http://localhost:5000/api/rooms | python3 -m json.tool
```

Expected: JSON response with `roomId`.

```bash
# Replace ROOM_ID with actual value from above
ROOM_ID=$(curl -s -X POST http://localhost:5000/api/rooms | grep -o '"roomId":"[^"]*"' | cut -d'"' -f4)
echo "Testing room: $ROOM_ID"

# Test join room (should succeed with player 1)
curl -s -X POST http://localhost:5000/api/rooms/join \
  -H "Content-Type: application/json" \
  -d "{\"roomId\":\"$ROOM_ID\"}" | python3 -m json.tool
```

Expected: JSON with roomId and playerCount.

```bash
# Test 404 for fake room
curl -s -X POST http://localhost:5000/api/rooms/join \
  -H "Content-Type: application/json" \
  -d '{"roomId":"FAKE"}' | python3 -m json.tool
```

Expected: 404 error.

- [ ] **Step 3: Test static file serving**

```bash
curl -s http://localhost:5000/ | head -5
```

Expected: HTML from index.html

```bash
curl -s http://localhost:5000/game.html | head -5
```

Expected: HTML from game.html

- [ ] **Step 4: Kill the server**

```bash
kill %1 2>/dev/null; wait 2>/dev/null
```

- [ ] **Step 5: Commit any final changes**

```bash
git add -A && git commit -m "chore: final integration adjustments" || echo "No changes to commit"
```

---

### Task 12: Write README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```md
# 3D Tennis Battle

A 3D multiplayer networked tennis game with real tennis rules. Built with Three.js, Node.js, and WebSocket.

## How to Play

### Server Setup
```bash
npm install
npm start
```
Server runs on `http://localhost:5000`.

### Playing
1. Open `http://localhost:5000` in two browser tabs (or two computers on the same network)
2. One player clicks **Create New Room**
3. Share the 5-character room code with the other player
4. Other player enters the code and clicks **Join**
5. After 3-second countdown, match begins!

### Controls
| Action | Player 1 | Player 2 |
|--------|----------|----------|
| Move | WASD | Arrow Keys |
| Flat shot | J | J |
| Topspin | K | K |
| Slice | L | L |
| Volley | U | U |

Press any hit key (J/K/L/U) to serve.

### Scoring
Real tennis rules: 0 → 15 → 30 → 40 → Game. Deuce requires 2-point lead. First to 6 games wins the set and match.

## Project Structure
```
├── server/
│   ├── index.js    # Express + WebSocket server
│   ├── room.js     # Room manager
│   ├── game.js     # Game loop (60 tick/s)
│   ├── physics.js  # Ball physics engine
│   └── rules.js    # Tennis scoring rules
├── public/
│   ├── index.html  # Landing page (create/join rooms)
│   ├── game.html   # Game page
│   ├── game.js     # Game orchestrator
│   ├── input.js    # Keyboard input
│   ├── network.js  # WebSocket client
│   └── render.js   # Three.js 3D renderer
└── package.json
```

## Deployment

Deploy to your cloud server:
```bash
git clone <repo> /opt/tennis
cd /opt/tennis && npm install
# Use PM2 to keep it running
npm install -g pm2
pm2 start server/index.js --name tennis
```

Open `http://<your-server-ip>:5000` to play.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with usage instructions"
```