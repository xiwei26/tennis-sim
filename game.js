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
    const fullLoop = () => {
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
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this.network) this.network.close();
    if (this.input) this.input.destroy();
    if (this.renderer) this.renderer.destroy();
  }
}