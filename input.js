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