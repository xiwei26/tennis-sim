export class Game {
  constructor(roomId, broadcastFn) {
    this.roomId = roomId;
    this.broadcast = broadcastFn;
  }
  start() {}
  stop() {}
  handleInput() {}
  getState() {
    return {};
  }
}