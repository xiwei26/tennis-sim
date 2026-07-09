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