/**
 * Keyboard input manager.
 * Movement: WASD (P1) or Arrow keys (P2)
 * Hit: J=flat, K=topspin, L=slice, U=volley
 *
 * Charge mechanic: press-and-HOLD a hit key to build power, RELEASE to swing.
 * The longer the hold (up to MAX_CHARGE_MS), the more powerful the shot.
 * On release we emit a short "pulse" (hit_<type>=true + power 0..1) so the
 * 30 Hz input loop and 60 Hz server tick are guaranteed to see the swing.
 */

const MAX_CHARGE_MS = 1000;   // hold this long for a full-power shot
const MIN_POWER = 0.3;        // a quick tap still clears the net
const PULSE_MS = 140;         // how long the release pulse stays "true"

class InputManager {
  constructor() {
    // Movement is a live key state; hit swings are event-driven (charge/release).
    this._move = { up: false, down: false, left: false, right: false };
    this.playerId = null;

    this._hitTypeFor = {
      KeyJ: 'flat', Numpad1: 'flat',
      KeyK: 'topspin', Numpad2: 'topspin',
      KeyL: 'slice', Numpad3: 'slice',
      KeyU: 'volley', Numpad4: 'volley',
    };

    this._charging = null;    // { type, startTime } while a hit key is held
    this._pendingHit = null;  // { type, power, expires } after release
    this._pendingHitAnimation = null; // one-shot visual event consumed by GameApp

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._resetState = this._resetState.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._resetState);
  }

  _resetState() {
    this._move = { up: false, down: false, left: false, right: false };
    this._charging = null;
    this._pendingHit = null;
    this._pendingHitAnimation = null;
  }

  /** Select the movement key profile assigned by the server for this client. */
  setPlayerId(playerId) {
    this.playerId = playerId === 'player1' || playerId === 'player2' ? playerId : null;
    // Clear held movement when the profile changes so an earlier key cannot
    // remain latched onto the newly assigned player.
    this._resetState();
  }

  /** Clear any movement, charge, or pending swing across gameplay boundaries. */
  reset() {
    this._resetState();
  }

  _now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  _onKeyDown(e) {
    const gameKeys = ['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','KeyU',
                      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
                      'Numpad1','Numpad2','Numpad3','Numpad4'];
    if (gameKeys.includes(e.code)) e.preventDefault();
    if (e.repeat) return; // ignore auto-repeat while holding

    const hitType = this._hitTypeFor[e.code];
    if (hitType) {
      // Start charging only if nothing is already charging.
      if (!this._charging) this._charging = { type: hitType, startTime: this._now() };
      return;
    }
    this._mapMove(e.code, true);
  }

  _onKeyUp(e) {
    const hitType = this._hitTypeFor[e.code];
    if (hitType) {
      if (this._charging && this._charging.type === hitType) {
        const held = this._now() - this._charging.startTime;
        const power = Math.max(MIN_POWER, Math.min(1, held / MAX_CHARGE_MS));
        this._pendingHit = { type: hitType, power, expires: this._now() + PULSE_MS };
        this._pendingHitAnimation = { type: hitType, power };
        this._charging = null;
      }
      return;
    }
    this._mapMove(e.code, false);
  }

  _mapMove(code, value) {
    const bindings = this.playerId === 'player1'
      ? { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' }
      : this.playerId === 'player2'
        ? { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
        : {};
    const direction = bindings[code];
    if (direction) this._move[direction] = value;
  }

  getKeys() {
    const keys = {
      ...this._move,
      hit_flat: false, hit_topspin: false, hit_slice: false, hit_volley: false,
      power: 0,
    };

    if (this._pendingHit) {
      if (this._now() < this._pendingHit.expires) {
        keys['hit_' + this._pendingHit.type] = true;
        keys.power = this._pendingHit.power;
      } else {
        this._pendingHit = null;
      }
    }
    return keys;
  }

  /** Whether one of this player's movement keys is currently held. */
  isMoving() {
    return Object.values(this._move).some(Boolean);
  }

  /** Return the latest one-shot swing request exactly once. */
  consumeHitAnimation() {
    const hit = this._pendingHitAnimation;
    this._pendingHitAnimation = null;
    return hit;
  }

  /**
   * Live charge state for the UI charge bar.
   * @returns {{charging: boolean, power: number, type: string|null}}
   */
  getChargeState() {
    if (this._charging) {
      const held = this._now() - this._charging.startTime;
      return {
        charging: true,
        power: Math.max(MIN_POWER, Math.min(1, held / MAX_CHARGE_MS)),
        type: this._charging.type,
      };
    }
    return { charging: false, power: 0, type: null };
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._resetState);
  }
}
