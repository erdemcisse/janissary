import {
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  GROUND_ACCELERATION,
  GROUND_CENTER_Y,
  GRAVITY,
  InputButton,
  JUMP_IMPULSE,
  MAX_SPEED,
  MAX_STEP_UP,
  CAVALRY_ACCELERATION,
  CAVALRY_BRAKE_ACCELERATION,
  CAVALRY_JUMP_IMPULSE,
  CAVALRY_MAX_SPEED,
  CAVALRY_TURN_RATE_RADIANS,
  WORLD_HALF_EXTENT,
} from "./constants";
import { clamp, moveToward } from "./math";
import { isBridgeRailing, isWallBoxSolid, type StaticBox } from "./map";
import { heightAt } from "./terrain";

const CAPSULE_HALF_HEIGHT = CAPSULE_HEIGHT / 2;

export interface MovementState {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  yaw: number;
  pitch: number;
  /** Persisted by both prediction and authority; collision updates it. */
  grounded: boolean;
  /** Rising-edge latch: holding jump across a landing does not auto-hop. */
  jumpHeld: boolean;
}

export interface MovementInput {
  buttons: number;
  yaw: number;
  pitch: number;
}

interface VerticalMovement {
  readonly y: number;
  readonly velocityY: number;
  readonly grounded: boolean;
  readonly jumpHeld: boolean;
}

/**
 * How far below the capsule a ground snap may pull it down (Phase 8e-11):
 * walking downhill keeps the capsule glued to the falling terrain instead of
 * a one-tick ballistic micro-hop per step. Well under MAX_STEP_UP (2.5), so
 * stepping off a box tier still reads as a real drop, and above the largest
 * per-tick terrain fall at top mounted speed (0.78 m/tick × ~0.83 max
 * gradient ≈ 0.65 m), so the snap never lets go mid-slope.
 */
export const TERRAIN_GROUND_SNAP_METERS = 1;

function simulateVerticalMovement(
  state: Readonly<MovementState>,
  buttons: number,
  dt: number,
  jumpImpulse: number,
  floorCenterY: number,
): VerticalMovement {
  const jumpHeld = (buttons & InputButton.Jump) !== 0;
  const jumpPressed = jumpHeld && !state.jumpHeld;
  let grounded = state.grounded;
  let velocityY = grounded ? 0 : state.velocityY + GRAVITY * dt;

  if (grounded && jumpPressed) {
    // Half-step gravity keeps the discrete 20 Hz apex aligned with the tuned
    // physical jump height instead of overshooting it by roughly v * dt / 2.
    velocityY = jumpImpulse + GRAVITY * dt * 0.5;
    grounded = false;
  }

  let y = state.y + velocityY * dt;
  if (y <= floorCenterY) {
    y = floorCenterY;
    velocityY = 0;
    grounded = true;
  } else if (state.grounded && velocityY <= 0 && y - floorCenterY <= TERRAIN_GROUND_SNAP_METERS) {
    // Grounded and the floor fell away by less than the snap: stay glued
    // (downhill walking). The collision sweep re-raises the capsule onto any
    // box support afterwards, so this never pulls a player off a terrace.
    y = floorCenterY;
    velocityY = 0;
    grounded = true;
  }
  return { y, velocityY, grounded, jumpHeld };
}

export function simulateMovement(
  state: Readonly<MovementState>,
  input: Readonly<MovementInput>,
  dtSeconds: number,
  speedMultiplier = 1,
): MovementState {
  const dt = clamp(dtSeconds, 0, 0.1);
  const effectiveSpeed = MAX_SPEED * clamp(speedMultiplier, 0.25, 2);
  let forward = 0;
  let strafe = 0;
  if ((input.buttons & InputButton.Forward) !== 0) forward += 1;
  if ((input.buttons & InputButton.Backward) !== 0) forward -= 1;
  if ((input.buttons & InputButton.Right) !== 0) strafe += 1;
  if ((input.buttons & InputButton.Left) !== 0) strafe -= 1;

  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) {
    forward /= magnitude;
    strafe /= magnitude;
  }

  const sinYaw = Math.sin(input.yaw);
  const cosYaw = Math.cos(input.yaw);
  const targetVelocityX = (strafe * cosYaw - forward * sinYaw) * effectiveSpeed;
  const targetVelocityZ = (-strafe * sinYaw - forward * cosYaw) * effectiveSpeed;
  const maximumVelocityChange = GROUND_ACCELERATION * dt;
  const velocityX = moveToward(state.velocityX, targetVelocityX, maximumVelocityChange);
  const velocityZ = moveToward(state.velocityZ, targetVelocityZ, maximumVelocityChange);

  // Horizontal advance comes first so the vertical clamp can sample the
  // terrain floor at the position the capsule actually arrives at (8e-11).
  let x = clamp(state.x + velocityX * dt, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
  let z = clamp(state.z + velocityZ * dt, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
  if (Math.abs(x) === WORLD_HALF_EXTENT) x = Math.sign(x) * WORLD_HALF_EXTENT;
  if (Math.abs(z) === WORLD_HALF_EXTENT) z = Math.sign(z) * WORLD_HALF_EXTENT;
  const vertical = simulateVerticalMovement(state, input.buttons, dt, JUMP_IMPULSE, heightAt(x, z) + GROUND_CENTER_Y);

  return {
    x,
    y: vertical.y,
    z,
    velocityX,
    velocityY: vertical.velocityY,
    velocityZ,
    yaw: input.yaw,
    pitch: clamp(input.pitch, -Math.PI * 0.49, Math.PI * 0.49),
    grounded: vertical.grounded,
    jumpHeld: vertical.jumpHeld,
  };
}

export function simulateCavalryMovement(
  state: Readonly<MovementState>,
  input: Readonly<MovementInput>,
  dtSeconds: number,
  speedMultiplier = 1,
): MovementState {
  const dt = clamp(dtSeconds, 0, 0.1);
  const effectiveSpeed = CAVALRY_MAX_SPEED * clamp(speedMultiplier, 0.25, 2);
  let forward = 0;
  let strafe = 0;
  if ((input.buttons & InputButton.Forward) !== 0) forward += 1;
  if ((input.buttons & InputButton.Backward) !== 0) forward -= 1;
  if ((input.buttons & InputButton.Right) !== 0) strafe += 1;
  if ((input.buttons & InputButton.Left) !== 0) strafe -= 1;
  const speed = Math.hypot(state.velocityX, state.velocityZ);
  const turnRate = CAVALRY_TURN_RATE_RADIANS * (1 - Math.min(0.55, speed / CAVALRY_MAX_SPEED * 0.55));
  const deltaYaw = Math.atan2(Math.sin(input.yaw - state.yaw), Math.cos(input.yaw - state.yaw));
  const yaw = state.yaw + clamp(deltaYaw, -turnRate * dt, turnRate * dt);
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const targetVelocityX = (strafe * cosYaw - forward * sinYaw) * effectiveSpeed;
  const targetVelocityZ = (-strafe * sinYaw - forward * cosYaw) * effectiveSpeed;
  const acceleration = forward === 0 && strafe === 0 ? CAVALRY_BRAKE_ACCELERATION : CAVALRY_ACCELERATION;
  const velocityX = moveToward(state.velocityX, targetVelocityX, acceleration * dt);
  const velocityZ = moveToward(state.velocityZ, targetVelocityZ, acceleration * dt);
  const x = clamp(state.x + velocityX * dt, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
  const z = clamp(state.z + velocityZ * dt, -WORLD_HALF_EXTENT, WORLD_HALF_EXTENT);
  const vertical = simulateVerticalMovement(state, input.buttons, dt, CAVALRY_JUMP_IMPULSE, heightAt(x, z) + GROUND_CENTER_Y);
  return {
    x,
    y: vertical.y,
    z,
    velocityX, velocityY: vertical.velocityY, velocityZ, yaw,
    pitch: clamp(input.pitch, -Math.PI * 0.49, Math.PI * 0.49),
    grounded: vertical.grounded,
    jumpHeld: vertical.jumpHeld,
  };
}

// ---------------------------------------------------------------------------
// Directional slope resistance (Phase 8e-8, ADR 0037 Task 2; terrain term
// added in Phase 8e-11, ADR 0040).
//
// Two probes, one curve shape, multiplied:
// - BOX probe (8e-8): the support-floor rise ahead, sampled from the same box
//   list the collision sweep uses — terraces, hill-fort tiers, stairs,
//   earthworks. Reference tan is the step-up limit (a full MAX_STEP_UP rise
//   over the probe is the steepest walkable box).
// - TERRAIN probe (8e-11): the continuous heightfield rise ahead along the
//   same intent, with its own reference tan — terrain gradients are ~0.2 at
//   most, so the box reference (1.667) would make hills feel free; 0.35 makes
//   a steep bank cost real speed while open-field slopes stay nearly free.
//
// Both are directional and stateless (no history), so ridge-line crossings
// cannot accumulate or oscillate.
// ---------------------------------------------------------------------------

/** How far ahead of the capsule the support floor is sampled. */
export const SLOPE_PROBE_METERS = 1.5;
/** The rise considered "steepest walkable": a full MAX_STEP_UP over the probe. */
export const SLOPE_REFERENCE_TAN = MAX_STEP_UP / SLOPE_PROBE_METERS;
/** Uphill resistance at the reference slope: speed drops to 1 - this (0.6x). */
export const SLOPE_MAX_RESISTANCE = 0.4;
/** Downhill boost cap (+15% of flat speed). */
export const SLOPE_DOWNHILL_MAX_BOOST = 0.15;
/** Terrain probe distance (same reach as the box probe). */
export const TERRAIN_SLOPE_PROBE_METERS = 1.5;
/**
 * Terrain gradient considered "steepest open ground": ~0.56 is the measured
 * map maximum (a prop-feather bank, 8e-17 retune), so 0.35 makes typical
 * field slopes (~0.1) nearly free and the steepest banks cost the 0.6x floor.
 */
export const TERRAIN_SLOPE_REFERENCE_TAN = 0.35;

const EMPTY_BOXES: readonly StaticBox[] = [];

/**
 * The rest-height floor (capsule-center space, same as the sweep's `floor`)
 * a capsule would stand on at (x, z), from the same box list the collision
 * sweep resolves against. Boxes taller than the caller's step-up above the
 * given feet are walls, not floors, and are skipped — identical to the
 * sweep's support rule.
 */
export function supportFloorAt(
  x: number,
  z: number,
  feetY: number,
  boxes: readonly StaticBox[],
  wallStates?: Uint8Array,
  extraBoxes: readonly StaticBox[] = EMPTY_BOXES,
  extraCount = extraBoxes.length,
  maximumStepUp = MAX_STEP_UP,
): number {
  let floor = GROUND_CENTER_Y;
  const baseCount = boxes.length;
  for (let index = 0; index < baseCount + extraCount; index += 1) {
    const box = index < baseCount ? boxes[index] : extraBoxes[index - baseCount];
    if (box === undefined) continue;
    if (!isWallBoxSolid(box, wallStates)) continue;
    const top = box.y + box.height / 2;
    if (isBridgeRailing(box) || top > feetY + maximumStepUp) continue;
    if (Math.abs(x - box.x) > box.width / 2 + CAPSULE_RADIUS) continue;
    if (Math.abs(z - box.z) > box.depth / 2 + CAPSULE_RADIUS) continue;
    floor = Math.max(floor, top + CAPSULE_HALF_HEIGHT);
  }
  return floor;
}

/**
 * Directional slope-resistance factor for the current input intent
 * (buttons + yaw, the same decomposition simulateMovement uses for its
 * target velocity). Returns 1 on flat ground, < 1 uphill, > 1 downhill.
 *
 * Curve (ADR 0037): with `uphillTan` the signed support-floor rise per metre
 * along the intent (negative when descending),
 *   - uphill:   factor = 1 - 0.4 · min(1, uphillTan / refTan)²  → 0.6 floor
 *   - contour:  factor = 1 exactly (probe reads no rise)
 *   - downhill: factor = 1 + min(0.15, 0.15 · |uphillTan| / refTan)
 *
 * The single along-intent probe fuses the alignment product: walking at an
 * angle to the gradient reads rise · cos(angle), which is exactly
 * f(alignment · magnitude) for a linear-in-alignment curve.
 */
export function slopeSpeedFactorAt(
  x: number,
  z: number,
  feetY: number,
  buttons: number,
  yaw: number,
  boxes: readonly StaticBox[],
  wallStates?: Uint8Array,
  extraBoxes: readonly StaticBox[] = EMPTY_BOXES,
  extraCount = extraBoxes.length,
  maximumStepUp = MAX_STEP_UP,
): number {
  let forward = 0;
  let strafe = 0;
  if ((buttons & InputButton.Forward) !== 0) forward += 1;
  if ((buttons & InputButton.Backward) !== 0) forward -= 1;
  if ((buttons & InputButton.Right) !== 0) strafe += 1;
  if ((buttons & InputButton.Left) !== 0) strafe -= 1;
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude < 1e-6) return 1; // idle: no intent, no resistance
  const f = forward / magnitude;
  const s = strafe / magnitude;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const intentX = s * cosYaw - f * sinYaw;
  const intentZ = -s * sinYaw - f * cosYaw;
  const floorHere = supportFloorAt(x, z, feetY, boxes, wallStates, extraBoxes, extraCount, maximumStepUp);
  const floorAhead = supportFloorAt(
    x + intentX * SLOPE_PROBE_METERS,
    z + intentZ * SLOPE_PROBE_METERS,
    feetY,
    boxes,
    wallStates,
    extraBoxes,
    extraCount,
    maximumStepUp,
  );
  const uphillTan = (floorAhead - floorHere) / SLOPE_PROBE_METERS;
  const boxFactor = uphillTan <= 0
    ? 1 + Math.min(SLOPE_DOWNHILL_MAX_BOOST, SLOPE_DOWNHILL_MAX_BOOST * Math.min(1, -uphillTan / SLOPE_REFERENCE_TAN))
    : 1 - SLOPE_MAX_RESISTANCE * Math.min(1, uphillTan / SLOPE_REFERENCE_TAN) ** 2;
  const terrainTan = (heightAt(x + intentX * TERRAIN_SLOPE_PROBE_METERS, z + intentZ * TERRAIN_SLOPE_PROBE_METERS) - heightAt(x, z)) / TERRAIN_SLOPE_PROBE_METERS;
  const terrainFactor = terrainTan <= 0
    ? 1 + Math.min(SLOPE_DOWNHILL_MAX_BOOST, SLOPE_DOWNHILL_MAX_BOOST * Math.min(1, -terrainTan / TERRAIN_SLOPE_REFERENCE_TAN))
    : 1 - SLOPE_MAX_RESISTANCE * Math.min(1, terrainTan / TERRAIN_SLOPE_REFERENCE_TAN) ** 2;
  return boxFactor * terrainFactor;
}
