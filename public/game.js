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
    this._renderLoopStarted = false;
  }

  async start(serverUrl, roomId) {
    this.renderer = new Renderer3D('game-container');
    this.network = new NetworkClient();
    this.input = new InputManager();
    // Keep the court and character warm-up animations visible while a player
    // is waiting in a room; network input still starts only at game begin.
    this._startRenderLoop();

    // Show connecting message
    this.renderer.showMessage('Connecting...', 5000);

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
      this.renderer.showMessage('Waiting for opponent...', 5000);
    });

    this.network.on('gameStart', (msg) => {
      this.renderer.showMessage('Match found!', 1500);
    });

    this.network.on('countdown', (msg) => {
      this.renderer.showMessage(`${msg.seconds}`, 1000);
    });

    this.network.on('gameBegin', () => {
      if (this.running) return;
      this.renderer.showMessage('PLAY!', 800);
      this.running = true;
      // Start input loop
      this.network._startInputLoop(() => this.input.getKeys());
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
      // If we're already handling an opponent-left countdown, don't overwrite it.
      if (this._closing) return;
      this.running = false;
      this.renderer.showMessage('Disconnected from server', 5000);
    });

    this.network.on('opponentLeft', (msg) => {
      this.running = false;
      this._startRoomCloseCountdown(msg && msg.seconds ? msg.seconds : 5);
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
        setTimeout(tick, 1000);
      } else {
        this._returnToLobby();
      }
    };
    setTimeout(tick, 1000);
  }

  /**
   * Leave the room voluntarily (from the leave button).
   */
  leave() {
    if (this._closing) return;
    if (this.network) this.network.leaveRoom();
    this._returnToLobby();
  }

  _returnToLobby() {
    this._closing = true;
    this.destroy();
    window.location.href = 'index.html';
  }

  _startRenderLoop() {
    if (this._renderLoopStarted) return;
    this._renderLoopStarted = true;
    const fullLoop = () => {
      if (this.renderer.updateAnimations) this.renderer.updateAnimations();
      if (this.input && this.playerId && this.renderer.setPlayerMoving) {
        this.renderer.setPlayerMoving(this.playerId, this.input.isMoving());
        const hit = this.input.consumeHitAnimation();
        if (hit) {
          this.renderer.playHit(this.playerId, hit.type);
          this.network.sendPlayerAction('hit', { hitType: hit.type });
        }
      }
      // Reflect the local player's charge state on the charge bar.
      if (this.input && this.renderer.updateChargeBar) {
        this.renderer.updateChargeBar(this.input.getChargeState());
      }
      this.renderer.render();
      this._animFrameId = requestAnimationFrame(fullLoop);
    };
    fullLoop();
  }


  destroy() {
    this.running = false;
    this._renderLoopStarted = false;
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this.network) this.network.close();
    if (this.input) this.input.destroy();
    if (this.renderer) this.renderer.destroy();
  }
}
