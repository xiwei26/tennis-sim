/**
 * Tennis physics engine (server-authoritative).
 */

const GRAVITY = -20;
const AIR_RESISTANCE = 0.998;
const BOUNCE_FACTOR = 0.7;
const FRICTION_FACTOR = 0.85;
const BALL_RADIUS = 0.15;

export const COURT = {
  width: 10, length: 20, netZ: 0, netHeight: 1.2, groundY: 0
};

export function createBallState(fromX, fromZ, targetX, targetZ) {
  const dx = targetX - fromX;
  const dz = targetZ - fromZ;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const speed = 12;
  return {
    x: fromX, y: 1.0, z: fromZ,
    vx: (dx / dist) * speed, vy: 6, vz: (dz / dist) * speed,
    rotation: 0, spin: { x: 0, z: 0 }
  };
}

export function updateBall(ball, dt) {
  ball.vy += GRAVITY * dt;
  ball.vx *= AIR_RESISTANCE;
  ball.vy *= AIR_RESISTANCE;
  ball.vz *= AIR_RESISTANCE;
  if (ball.spin) {
    ball.vz += ball.spin.z * dt * 2;
    ball.vy += ball.spin.x * dt * 0.5;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  ball.rotation += Math.sqrt(ball.vx * ball.vx + ball.vz * ball.vz) * dt * 5;
  return ball;
}

export function checkGroundCollision(ball) {
  if (ball.y <= COURT.groundY + BALL_RADIUS) {
    ball.y = COURT.groundY + BALL_RADIUS;
    ball.vy = Math.abs(ball.vy) * BOUNCE_FACTOR;
    ball.vx *= FRICTION_FACTOR;
    ball.vz *= FRICTION_FACTOR;
    return { bounced: true, ball };
  }
  return { bounced: false, ball };
}

export function checkNetCollision(ball) {
  const prevZ = ball.z - ball.vz * 0.016;
  if ((prevZ <= COURT.netZ && ball.z > COURT.netZ) ||
      (prevZ >= COURT.netZ && ball.z < COURT.netZ)) {
    if (ball.y <= COURT.netHeight) return true;
  }
  if (Math.abs(ball.z) < 0.3 && ball.y <= COURT.netHeight) return true;
  return false;
}

export function checkOutOfBounds(ball) {
  if (ball.x < -COURT.width / 2) return 'out_left';
  if (ball.x > COURT.width / 2) return 'out_right';
  if (ball.z < -COURT.length / 2) return 'out_back';
  if (ball.z > COURT.length / 2) return 'out_front';
  return 'in';
}

export function checkRacketHit(ball, playerX, playerZ, playerReach) {
  const dx = ball.x - playerX;
  const dz = ball.z - playerZ;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return dist <= playerReach && ball.y >= 0.5 && ball.y <= 2.0;
}

/**
 * Apply a stroke to the ball.
 *
 * @param {number} power  Charge power in [0..1]. 0 = a soft tap that still just
 *                        clears the net, 1 = a full-power drive. The horizontal
 *                        speed and the launch arc both scale with power so that
 *                        weak shots don't sail long and strong shots stay in.
 */
export function applyHit(ball, hitType, hitterZ, targetZ, targetX, power = 1) {
  const p = Math.max(0, Math.min(1, power));
  const dirZ = targetZ > hitterZ ? 1 : -1;
  // Forward (toward the net, along Z) speed ramps with power. A minimum of ~12
  // is needed so the ball actually reaches the far court before gravity pulls
  // it down; power then adds pace on top.
  const forward = 13 + 3 * p;               // 13 (tap) .. 16 (full power)
  const lateral = 4 + 4 * p;                // sideways aiming component

  const targetXFinal = targetX != null ? targetX : (Math.random() - 0.5) * 4;

  ball.y = 0.8;
  ball.z = hitterZ + dirZ * 0.5;
  const dx = targetXFinal - ball.x;
  const dz = (targetZ + dirZ * 5) - ball.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;

  // Vertical launch. Even the weakest shot clears the ~1.2m net (needs vy >= ~9
  // at these forward speeds); harder shots are a touch flatter and land deeper.
  const baseLift = 8.0 + 1.0 * p;           // 8.0 (tap) .. 9.0 (full power)


  // Split the aim direction: dz drives the (dominant) forward axis, dx the lateral.
  const vzUnit = (dz / dist);
  const vxUnit = (dx / dist);

  switch (hitType) {
    case 'flat':
      ball.vx = vxUnit * lateral;
      ball.vy = baseLift;
      ball.vz = vzUnit * forward;
      ball.spin = { x: 0, z: 0 };
      break;
    case 'topspin':
      ball.vx = vxUnit * lateral;
      ball.vy = baseLift + 1.0;             // extra loop, dips back in
      ball.vz = vzUnit * forward * 0.95;
      ball.spin = { x: -1, z: 2 };
      break;
    case 'slice':
      ball.vx = vxUnit * lateral;
      ball.vy = baseLift + 0.5;   // slice floats; needs loft to clear the net
      ball.vz = vzUnit * forward * 0.9;
      ball.spin = { x: 1, z: -1.5 };
      break;
    case 'volley':
      ball.vx = vxUnit * lateral;
      ball.vy = baseLift;
      ball.vz = vzUnit * forward * 0.95;
      ball.spin = { x: 0, z: 0 };
      break;

    default:
      ball.vx = vxUnit * lateral;
      ball.vy = baseLift;
      ball.vz = vzUnit * forward;
      ball.spin = { x: 0, z: 0 };
  }
  return ball;
}



