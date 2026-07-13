/**
 * WebSocket network client for communicating with the game server.
 */

class NetworkClient {
  constructor() {
    this.ws = null;
    this._callbacks = {};
    this._inputInterval = null;
    this._joinWaiter = null;
  }

  connect(serverUrl, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket;
      try {
        socket = new WebSocket(serverUrl);
        this.ws = socket;
      } catch (error) {
        settled = true;
        reject(error);
        return;
      }
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Connection timed out'));
      }, timeoutMs);
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.log('Connected');
        resolve();
      };
      socket.onerror = (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      };
      socket.onclose = () => {
        console.log('Disconnected');
        this.stopInputLoop();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error('WebSocket closed before connecting'));
        }
        this._rejectJoin(new Error('WebSocket closed before joining room'));
        if (this._callbacks.disconnect) this._callbacks.disconnect();
      };
      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        this._handleMessage(msg);
      };
    });
  }

  joinRoom(roomId, timeoutMs = 10000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket is not connected'));
    }
    if (this._joinWaiter) {
      return Promise.reject(new Error('A room join is already pending'));
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this._joinWaiter) return;
        this._joinWaiter = null;
        if (this.ws) this.ws.close();
        reject(new Error('Timed out joining room'));
      }, timeoutMs);
      this._joinWaiter = { resolve, reject, timeout };
      this.send({ type: 'join_room', roomId });
    });
  }

  leaveRoom() {
    this.send({ type: 'leave_room' });
  }

  sendInput(keys) {
    this.send({ type: 'input', keys });
  }

  sendPlayerAction(action, data = {}) {
    this.send({ type: 'player_action', action, ...data });
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
    this.stopInputLoop();
    this._rejectJoin(new Error('Connection closed'));
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  startInputLoop(getKeysFn) {
    this.stopInputLoop();
    this._inputInterval = setInterval(() => {
      this.sendInput(getKeysFn());
    }, 1000 / 30);
  }

  stopInputLoop() {
    if (this._inputInterval) {
      clearInterval(this._inputInterval);
      this._inputInterval = null;
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'room_joined') this._resolveJoin(msg);
    if (msg.type === 'error') this._rejectJoin(new Error(msg.message || 'Unable to join room'));
    const map = {
      room_joined: 'roomJoined', game_start: 'gameStart', countdown: 'countdown',
      game_begin: 'gameBegin', state: 'state', point: 'point',
      match_over: 'matchOver', error: 'error', serve_ready: 'serveReady',
      opponent_left: 'opponentLeft', player_action: 'playerAction',
    };
    const cb = this._callbacks[map[msg.type]];
    if (cb) cb(msg);
  }

  _resolveJoin(message) {
    if (!this._joinWaiter) return;
    const waiter = this._joinWaiter;
    this._joinWaiter = null;
    clearTimeout(waiter.timeout);
    waiter.resolve(message);
  }

  _rejectJoin(error) {
    if (!this._joinWaiter) return;
    const waiter = this._joinWaiter;
    this._joinWaiter = null;
    clearTimeout(waiter.timeout);
    waiter.reject(error);
  }
}
