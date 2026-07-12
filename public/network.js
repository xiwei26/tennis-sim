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
      let settled = false;
      this.ws = new WebSocket(serverUrl);
      this.ws.onopen = () => { settled = true; console.log('Connected'); resolve(); };
      this.ws.onerror = (err) => { if (!settled) { settled = true; reject(err); } };
      this.ws.onclose = () => {
        console.log('Disconnected');
        this._stopInputLoop();
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before connecting'));
        }
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

  leaveRoom() {
    this.send({ type: 'leave_room' });
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
    this._stopInputLoop();
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
      opponent_left: 'opponentLeft',
    };
    const cb = this._callbacks[map[msg.type]];
    if (cb) cb(msg);
  }
}
