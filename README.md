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
| Action | Keys |
|--------|------|
| Move | WASD / Arrow Keys |
| Flat shot | J |
| Topspin | K |
| Slice | L |
| Volley | U |

**Press-and-hold to charge:** Hold a hit key (J/K/L/U) to build up power, then
release to swing. The longer you hold (up to ~1s for a full charge), the harder
and faster the shot. A quick tap still clears the net. A charge bar at the bottom
of the screen shows your current power.

To serve, hold and release a hit key from behind your baseline.


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
npm install -g pm2
pm2 start server/index.js --name tennis
```

Open `http://<your-server-ip>:5000` to play.