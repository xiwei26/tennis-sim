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
    this._closing = false;
    this._matchEnded = false;
    this._terminalError = false;
    this._destroyed = false;
    this._roomCloseTimer = null;
    this._animFrameId = null;
    this._renderLoopStarted = false;
  }

  async start(serverUrl, roomId) {
    try {
      this.renderer = new Renderer3D('game-container');
      this.network = new NetworkClient();
      this.input = new InputManager();
      // Keep the court and character warm-up animations visible while a player
      // is waiting in a room; network input still starts only at game begin.
      this._startRenderLoop();
    } catch (err) {
      this._showTerminalError('Unable to start the 3D game.', err);
      return;
    }

    // Show connecting message
    this.renderer.showMessage('Connecting...', 0);

    // Register callbacks
    this.network.on('roomJoined', (msg) => {
      this.playerId = msg.playerId;
      this.input.setPlayerId(msg.playerId);
      if (this.renderer.setLocalPlayer) this.renderer.setLocalPlayer(msg.playerId);
      const controlsHelp = document.getElementById('controls-help');
      if (controlsHelp) {
        const moveKeys = msg.playerId === 'player1' ? 'WASD' : 'Arrow Keys';
        const playerNumber = msg.playerId === 'player1' ? '1' : '2';
        controlsHelp.textContent = `You are Player ${playerNumber} | Move: ${moveKeys} | Hold J/K/L/U to charge, release to swing`;
      }
      console.log('Joined as:', this.playerId);
      this.renderer.showMessage('Waiting for opponent...', 0);
    });

    this.network.on('gameStart', (msg) => {
      this.renderer.showMessage('Match found!', 1500);
    });

    this.network.on('countdown', (msg) => {
      this.renderer.showMessage(`${msg.seconds}`, 1000);
    });

    this.network.on('gameBegin', () => {
      if (this.running) return;
      this.input.reset();
      this.renderer.showMessage('PLAY!', 800);
      this.running = true;
      // Start input loop
      this.network.startInputLoop(() => this.input.getKeys());
    });

    this.network.on('state', (msg) => {
      this.renderer.updateState(msg);
    });

    this.network.on('playerAction', (msg) => {
      if (msg.playerId !== this.playerId && msg.action === 'hit') {
        this.renderer.playHit(msg.playerId, msg.hitType);
      }
    });

    this.network.on('point', (msg) => {
      this.input.reset();
      if (msg.score) this.renderer.updateScore(msg.score);
      const playerLabel = msg.winner === 1 ? 'Player 1' : 'Player 2';
      this.renderer.showMessage(`${playerLabel} wins point!`, 1500);
    });

    this.network.on('matchOver', (msg) => {
      this._matchEnded = true;
      this._stopGameplay();
      if (msg.score) this.renderer.updateScore(msg.score);
      const winnerLabel = msg.winner === 1 ? 'PLAYER 1' : 'PLAYER 2';
      this.renderer.showMessage(`${winnerLabel} WINS!`, 0);
      this.renderer.messageOverlay.style.fontSize = '64px';
      this._stopRenderLoop(true);
    });

    this.network.on('serveReady', (msg) => {
      this.input.reset();
      this.renderer.showMessage('Press J/K/L/U to serve!', 2000);
    });

    this.network.on('error', (msg) => {
      this._showTerminalError(`Error: ${msg.message}`);
    });

    this.network.on('disconnect', () => {
      // A normal server-side room cleanup must not replace a terminal result.
      if (this._closing || this._matchEnded || this._terminalError) return;
      this._showTerminalError('Disconnected from server');
    });

    this.network.on('opponentLeft', (msg) => {
      this._stopGameplay();
      this._startRoomCloseCountdown(msg && msg.seconds ? msg.seconds : 5);
      this._stopRenderLoop(true);
    });

    // Connect and join
    try {
      await this.network.connect(serverUrl);
      if (this._destroyed || this._closing) return;
      await this.network.joinRoom(roomId);
    } catch (err) {
      if (this._destroyed || this._closing || this._terminalError) return;
      const detail = err && typeof err.message === 'string' ? `: ${err.message}` : '!';
      this._showTerminalError(`Connection failed${detail}`, err);
    }
  }

  _showTerminalError(message, error = null) {
    if (this._destroyed || this._matchEnded || this._terminalError) return;
    this._terminalError = true;
    this._stopGameplay();
    if (this.network) this.network.close();

    if (this.renderer) {
      this.renderer.showMessage(message, 0);
      this._stopRenderLoop(true);
    } else {
      const host = document.getElementById('game-container') || document.body;
      const fallback = document.createElement('div');
      fallback.setAttribute('role', 'alert');
      fallback.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;color:#fff;background:#020814;font:600 18px/1.5 sans-serif;text-align:center;';
      fallback.textContent = message;
      host.replaceChildren(fallback);
    }

    if (error) console.error(error);
  }

  /**
   * Opponent disconnected: show a notice and a countdown, then return to lobby.
   */
  _startRoomCloseCountdown(seconds) {
    if (this._closing) return;
    this._closing = true;
    let remaining = Math.max(1, Math.floor(seconds));
    const show = () => {
      this.renderer.showMessage(`\u5bf9\u65b9\u5df2\u9000\u51fa\uff0c\u623f\u95f4\u5c06\u5728 ${remaining} \u79d2\u540e\u5173\u95ed`, 1500);
    };
    show();
    const tick = () => {
      remaining -= 1;
      if (remaining > 0) {
        show();
        this._roomCloseTimer = setTimeout(tick, 1000);
      } else {
        this._roomCloseTimer = null;
        this._returnToLobby();
      }
    };
    this._roomCloseTimer = setTimeout(tick, 1000);
  }

  /**
   * Leave the room voluntarily (from the leave button).
   */
  leave() {
    if (this._destroyed) return;
    if (this.network) this.network.leaveRoom();
    this._returnToLobby();
  }

  _returnToLobby() {
    this._closing = true;
    if (this._roomCloseTimer !== null) {
      clearTimeout(this._roomCloseTimer);
      this._roomCloseTimer = null;
    }
    this.destroy();
    window.location.href = 'index.html';
  }

  _stopGameplay() {
    this.running = false;
    if (this.network) this.network.stopInputLoop();
    if (this.input && this.input.reset) this.input.reset();
    if (this.renderer && this.playerId && this.renderer.setPlayerMoving) {
      this.renderer.setPlayerMoving(this.playerId, false);
    }
    if (this.renderer && this.renderer.updateChargeBar) {
      this.renderer.updateChargeBar({ charging: false, power: 0, type: null });
    }
  }

  _startRenderLoop() {
    if (this._renderLoopStarted) return;
    this._renderLoopStarted = true;
    const fullLoop = () => {
      if (this.renderer.updateAnimations) this.renderer.updateAnimations();
      if (this.running && this.input && this.playerId) {
        const hit = this.input.consumeHitAnimation();
        if (hit) {
          this.renderer.playHit(this.playerId, hit.type);
          this.network.sendPlayerAction('hit', { hitType: hit.type });
        }
      } else if (this.input) {
        this.input.consumeHitAnimation();
      }
      // Reflect the local player's charge state on the charge bar.
      if (this.input && this.renderer.updateChargeBar) {
        const chargeState = this.running
          ? this.input.getChargeState()
          : { charging: false, power: 0, type: null };
        this.renderer.updateChargeBar(chargeState);
      }
      this.renderer.render();
      this._animFrameId = requestAnimationFrame(fullLoop);
    };
    fullLoop();
  }

  _stopRenderLoop(renderFinalFrame = false) {
    this._renderLoopStarted = false;
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (renderFinalFrame && this.renderer) this.renderer.render();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopGameplay();
    if (this._roomCloseTimer !== null) {
      clearTimeout(this._roomCloseTimer);
      this._roomCloseTimer = null;
    }
    this._stopRenderLoop();
    if (this.network) this.network.close();
    if (this.input) this.input.destroy();
    if (this.renderer) this.renderer.destroy();
  }
}
