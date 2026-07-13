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

    // Serve baseline: players stand just behind their baseline (|z| = length/2).
    // COURT.length = 20, so the baseline is at z = ±10; stand a touch inside it.
    this.players = {
      player1: { x: 0, z: -COURT.length / 2, serving: true, hitCooldown: 0 },
      player2: { x: 0, z: COURT.length / 2, serving: false, hitCooldown: 0 },
    };

    this.inputs = {
      player1: { up: false, down: false, left: false, right: false, hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false, power: 0 },
      player2: { up: false, down: false, left: false, right: false, hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false, power: 0 },
    };


    this.ball = null;
    this.lastHitter = null;
    this.bouncesSinceHit = 0;
    this.scoring = createInitialState();
    this.phase = 'serve';
    this.phaseTimer = 0;
    this.ballInPlay = false;
  }

  start() {
    if (this.running) return;
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
      // Fixed camera: "up" always moves toward the far end of the court
      // (decreasing z) and "down" toward the near end, for both players.
      if (input.up) player.z -= PLAYER_SPEED * dt;
      if (input.down) player.z += PLAYER_SPEED * dt;

      // During serve phase, the serving player is locked to the baseline
      // and can only move laterally (left/right).
      const serverId = this.scoring.servingPlayer === 1 ? 'player1' : 'player2';
      const isServer = id === serverId && this.phase === 'serve';

      player.x = Math.max(-COURT.width / 2 + 0.5, Math.min(COURT.width / 2 - 0.5, player.x));
      if (isServer) {
        // Serve position: fixed on the baseline, lateral movement only.
        player.z = isPlayer1 ? -COURT.length / 2 : COURT.length / 2;
      } else {
        const backBoundary = COURT.length / 2 - 0.5;
        const netBoundary = 0.5;
        player.z = isPlayer1
          ? Math.max(-backBoundary, Math.min(-netBoundary, player.z))
          : Math.max(netBoundary, Math.min(backBoundary, player.z));
      }
    }
  }

  _startServe(serverId) {
    this.phase = 'serve';
    this.ballInPlay = false;
    this.lastHitter = null;
    this.bouncesSinceHit = 0;
    for (const player of Object.values(this.players)) player.serving = false;
    const server = this.players[serverId];
    server.serving = true;
    const serveDir = serverId === 'player1' ? 1 : -1;

    this.ball = {
      x: server.x, y: 1.0, z: server.z + serveDir * 0.25,
      vx: 0, vy: 0, vz: 0, rotation: 0, spin: { x: 0, z: 0 },
    };

    this.broadcast({ type: 'serve_ready', server: serverId });
  }

  _updateServe(dt) {
    const serverId = this.scoring.servingPlayer === 1 ? 'player1' : 'player2';
    const server = this.players[serverId];
    const serveDir = serverId === 'player1' ? 1 : -1;

    this.ball.x = server.x;
    this.ball.z = server.z + serveDir * 0.25;
    this.ball.y = 1.0;

    const input = this.inputs[serverId];
    const power = typeof input.power === 'number' ? input.power : 1;
    let serveHit = false;
    if (input.hit_flat) { this._executeServe('flat', serverId, serveDir, power); serveHit = true; }
    else if (input.hit_topspin) { this._executeServe('topspin', serverId, serveDir, power); serveHit = true; }
    else if (input.hit_slice) { this._executeServe('slice', serverId, serveDir, power); serveHit = true; }
    else if (input.hit_volley) { this._executeServe('flat', serverId, serveDir, power); serveHit = true; }

    if (serveHit) {
      this.phase = 'playing';
      this.ballInPlay = true;
    }
  }

  /**
   * Resolve landing X from current facing intent:
   * 1) left/right movement at contact, else
   * 2) player position relative to the ball (contact side).
   */
  _resolveTargetX(playerId, baseX = 0) {
    const input = this.inputs[playerId] || {};
    const player = this.players[playerId];
    let targetX = baseX;

    if (input.left) {
      targetX -= 2;
    } else if (input.right) {
      targetX += 2;
    } else if (this.ball) {
      const rel = player.x - this.ball.x;
      targetX += Math.max(-2, Math.min(2, rel * 3));
    }

    return Math.max(-COURT.width / 2 + 0.5, Math.min(COURT.width / 2 - 0.5, targetX));
  }

  _executeServe(hitType, serverId, serveDir, power = 1) {
    const server = this.players[serverId];
    const opponentId = serverId === 'player1' ? 'player2' : 'player1';
    const opponent = this.players[opponentId];
    const input = this.inputs[serverId];

    // LATERAL AIMING: move direction, else contact side relative to ball
    const targetX = this._resolveTargetX(serverId, opponent.x);

    // DEPTH AIMING: use up/down to influence targetZ within service box
    // Base target is the middle of the opponent's service box
    let targetZ = opponentId === 'player1' ? -COURT.length / 4 : COURT.length / 4;
    if (serverId === 'player1') {
      // P1: down moves toward net -> shallower (smaller positive), up -> deeper (larger positive)
      if (input.down) targetZ -= 2;
      else if (input.up) targetZ += 2;
    } else {
      // P2: up moves toward net -> shallower (closer to 0), down -> deeper (more negative)
      if (input.up) targetZ += 2;   // -5 -> -3 (shallower)
      else if (input.down) targetZ -= 2; // -5 -> -7 (deeper)
    }

    applyHit(this.ball, hitType, server.z, targetZ, targetX, power);
    this.lastHitter = serverId;
    this.bouncesSinceHit = 0;
    // Serves are hit from high up with a downward drive.
    // From baseline (z = ±10) to the net (z = 0) the ball travels ~10 units.
    // At forward speeds of ~13-16 the travel time is ~0.6-0.8 s.
    // We need vy >= netHeight at the net, so y = 1.0 + vy*t - 10*t² > 1.2.
    // With t~0.65 that means vy > ~6.6 minimum.
    // Soft serve arcs up (vy ~7) to land deep; fast serve is flatter (vy ~9).
    // Higher power = higher forward speed, so we actually want a slightly lower
    // launch angle — but enough lift to still clear the net.
    // vy ranges from ~8.5 (soft) down to ~7 (fast), but forward vz scales up.
    const p = Math.max(0, Math.min(1, power));
    this.ball.vy = 7.5 + 1.0 * (1 - p);   // 8.5 (soft) .. 7.5 (fast)
    server.hitCooldown = 0.2;
  }


  _updatePlaying(dt) {
    if (!this.ball) return;
    updateBall(this.ball, dt);

    if (checkNetCollision(this.ball)) {
      const winner = this.lastHitter === 'player1' ? 2 : this.lastHitter === 'player2' ? 1 : (this.ball.z > 0 ? 1 : 2);
      this._awardPoint(winner, 'Net fault');
      return;
    }

    const groundCollision = checkGroundCollision(this.ball);
    if (groundCollision.bounced) {
      this.bouncesSinceHit++;

      if (this.bouncesSinceHit === 1) {
        const bounds = checkOutOfBounds(this.ball);
        const landedOnOpponentSide = this.lastHitter === 'player1'
          ? this.ball.z > COURT.netZ
          : this.lastHitter === 'player2'
            ? this.ball.z < COURT.netZ
            : true;

        if (bounds !== 'in' || !landedOnOpponentSide) {
          const winner = this.lastHitter === 'player1' ? 2 : this.lastHitter === 'player2' ? 1 : (this.ball.z > 0 ? 1 : 2);
          const reason = bounds !== 'in' ? `Out: ${bounds}` : 'Wrong court';
          this._awardPoint(winner, reason);
          return;
        }
      } else {
        const winner = this.lastHitter === 'player1' ? 1 : this.lastHitter === 'player2' ? 2 : (this.ball.z > 0 ? 1 : 2);
        this._awardPoint(winner, 'Second bounce');
        return;
      }
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
        const power = typeof input.power === 'number' ? input.power : 1;
        const isPlayer1 = id === 'player1';
        const opponentId = isPlayer1 ? 'player2' : 'player1';
        const targetZ = opponentId === 'player1' ? -COURT.length / 2 + 1 : COURT.length / 2 - 1;
        // Aim X from move direction at contact, else player-vs-ball contact side.
        const targetX = this._resolveTargetX(id, 0);
        applyHit(this.ball, hitType, player.z, targetZ, targetX, power);
        this.lastHitter = id;
        this.bouncesSinceHit = 0;
      }

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
