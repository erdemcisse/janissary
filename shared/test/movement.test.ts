import { describe, expect, it } from "vitest";
import { sweepCapsuleAgainstBoxes } from "../src/collision";
import {
  CAVALRY_JUMP_HEIGHT,
  CAVALRY_MAX_SPEED,
  CAVALRY_MAX_STEP_UP,
  FIXED_DT_SECONDS,
  GROUND_CENTER_Y,
  InputButton,
  JUMP_HEIGHT,
  MAX_SPEED,
  MAX_STEP_UP,
} from "../src/constants";
import { SIEGE_BLOCKOUT, type StaticBox } from "../src/map";
import { heightAt } from "../src/terrain";
import {
  simulateCavalryMovement,
  simulateMovement,
  type MovementInput,
  type MovementState,
} from "../src/movement";
import { TERRAIN_PROPS } from "../src/terrain-props";

const IDLE_INPUT: MovementInput = { buttons: 0, yaw: 0, pitch: 0 };

function movementState(overrides: Partial<MovementState> = {}): MovementState {
  return {
    x: 0,
    y: GROUND_CENTER_Y,
    z: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    yaw: 0,
    pitch: 0,
    grounded: true,
    jumpHeld: false,
    ...overrides,
  };
}

function collideMovement(
  previous: Readonly<MovementState>,
  simulated: Readonly<MovementState>,
  boxes: readonly StaticBox[],
  maximumStepUp: number,
): MovementState {
  const collision = sweepCapsuleAgainstBoxes(
    previous,
    simulated,
    boxes,
    undefined,
    false,
    [],
    0,
    maximumStepUp,
  );
  return {
    ...simulated,
    x: collision.x,
    y: collision.y,
    z: collision.z,
    velocityY: collision.grounded ? 0 : simulated.velocityY,
    grounded: collision.grounded,
  };
}

function jumpApex(cavalry: boolean): number {
  const simulate = cavalry ? simulateCavalryMovement : simulateMovement;
  let state = movementState();
  let maximumY = state.y;
  for (let tick = 0; tick < 80; tick += 1) {
    state = simulate(state, {
      buttons: tick === 0 ? InputButton.Jump : 0,
      yaw: 0,
      pitch: 0,
    }, FIXED_DT_SECONDS);
    maximumY = Math.max(maximumY, state.y);
  }
  return maximumY - GROUND_CENTER_Y;
}

describe("grounded jump movement", () => {
  it("fires once on the jump-button rising edge instead of auto-hopping while held", () => {
    let state = movementState();
    let takeoffs = 0;
    for (let tick = 0; tick < 100; tick += 1) {
      const wasGrounded = state.grounded;
      state = simulateMovement(state, { ...IDLE_INPUT, buttons: InputButton.Jump }, FIXED_DT_SECONDS);
      if (wasGrounded && !state.grounded) takeoffs += 1;
    }
    expect(takeoffs).toBe(1);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(GROUND_CENTER_Y);

    state = simulateMovement(state, IDLE_INPUT, FIXED_DT_SECONDS);
    expect(state.jumpHeld).toBe(false);
    state = simulateMovement(state, { ...IDLE_INPUT, buttons: InputButton.Jump }, FIXED_DT_SECONDS);
    expect(state.grounded).toBe(false);
    expect(state.velocityY).toBeGreaterThan(0);
  });

  it("uses the tuned infantry apex and a deliberately smaller cavalry hop", () => {
    const infantryApex = jumpApex(false);
    const cavalryApex = jumpApex(true);
    expect(infantryApex).toBeGreaterThan(JUMP_HEIGHT - 0.2);
    expect(infantryApex).toBeLessThanOrEqual(JUMP_HEIGHT + 0.05);
    expect(cavalryApex).toBeGreaterThan(CAVALRY_JUMP_HEIGHT - 0.15);
    expect(cavalryApex).toBeLessThanOrEqual(CAVALRY_JUMP_HEIGHT + 0.05);
    expect(cavalryApex).toBeLessThan(infantryApex);
  });

  it("never gains horizontal speed from repeated infantry or cavalry jumps", () => {
    let infantry = movementState();
    let cavalry = movementState();
    for (let tick = 0; tick < 240; tick += 1) {
      const jumping = tick % 20 === 0 ? InputButton.Jump : 0;
      const input = { buttons: InputButton.Forward | jumping, yaw: 0, pitch: 0 };
      infantry = simulateMovement(infantry, input, FIXED_DT_SECONDS);
      cavalry = simulateCavalryMovement(cavalry, input, FIXED_DT_SECONDS);
      expect(Math.hypot(infantry.velocityX, infantry.velocityZ)).toBeLessThanOrEqual(MAX_SPEED + 0.000001);
      expect(Math.hypot(cavalry.velocityX, cavalry.velocityZ)).toBeLessThanOrEqual(CAVALRY_MAX_SPEED + 0.000001);
    }
  });

  it("cannot use the infantry jump to pass a wall above the step and jump apex", () => {
    const wall: StaticBox = {
      id: "jump-exploit-wall",
      x: 0,
      y: 2,
      z: -2,
      width: 8,
      height: 4,
      depth: 1,
      material: "stone",
    };
    let state = movementState();
    let minimumZ = state.z;
    for (let tick = 0; tick < 80; tick += 1) {
      const buttons = InputButton.Forward | (tick === 0 ? InputButton.Jump : 0);
      const simulated = simulateMovement(state, { buttons, yaw: 0, pitch: 0 }, FIXED_DT_SECONDS);
      state = collideMovement(state, simulated, [wall], MAX_STEP_UP);
      minimumZ = Math.min(minimumZ, state.z);
    }
    expect(minimumZ).toBeGreaterThanOrEqual(-1.11);
  });
});

describe("cavalry vertical movement", () => {
  it("applies gravity instead of pinning an airborne mount to ground height", () => {
    const state = movementState({ y: 8, grounded: false });
    const next = simulateCavalryMovement(state, IDLE_INPUT, FIXED_DT_SECONDS);
    expect(next.y).toBeLessThan(state.y);
    expect(next.y).toBeGreaterThan(GROUND_CENTER_Y);
    expect(next.velocityY).toBeLessThan(0);
    expect(next.grounded).toBe(false);
  });

  it("routes a mount through collision step-up to a hill-fort capture height", () => {
    const baseProp = TERRAIN_PROPS.find((prop) => prop.id === "terrain-stack--470--150-0");
    expect(baseProp).toBeDefined();
    if (baseProp === undefined) return;
    const base = baseProp.collider;
    let state = movementState({ x: base.x, z: base.z + base.depth / 2 + 1 });
    let maximumY = state.y;
    for (let tick = 0; tick < 160 && state.z > base.z; tick += 1) {
      const simulated = simulateCavalryMovement(
        state,
        { buttons: InputButton.Forward, yaw: 0, pitch: 0 },
        FIXED_DT_SECONDS,
      );
      state = collideMovement(state, simulated, SIEGE_BLOCKOUT, CAVALRY_MAX_STEP_UP);
      maximumY = Math.max(maximumY, state.y);
    }
    expect(state.z).toBeLessThanOrEqual(base.z);
    expect(maximumY).toBeGreaterThan(6);
    expect(state.grounded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Terrain heightfield (Phase 8e-11, ADR 0040): the vertical clamp samples
// heightAt at the arrived position; the ground snap keeps downhill walking
// glued. All fixtures run in the open field (mask = 1), far from flat zones.
// ---------------------------------------------------------------------------

/** Open-field slope: mask = 1 along the whole line, ~4 m rise over 24 m. */
const HILL_LINE = { x: -632, z: -480, uphillX: -0.935891, uphillZ: -0.352289 };
/** Open-field hilltop (mask = 1), ~16.2 m above datum. */
const HILLTOP = { x: 710, z: -745 };

function yawToward(dx: number, dz: number): number {
  // forward = (-sin yaw, -cos yaw)
  return Math.atan2(-dx, -dz);
}

function hillState(x: number, z: number, overrides: Partial<MovementState> = {}): MovementState {
  return movementState({ x, z, y: heightAt(x, z) + GROUND_CENTER_Y, ...overrides });
}

describe("terrain ground contact", () => {
  it("tracks the heightfield exactly while walking uphill", () => {
    const yaw = yawToward(HILL_LINE.uphillX, HILL_LINE.uphillZ);
    let state = hillState(HILL_LINE.x, HILL_LINE.z);
    const startY = state.y;
    for (let tick = 0; tick < 80; tick += 1) {
      state = simulateMovement(state, { buttons: InputButton.Forward, yaw, pitch: 0 }, FIXED_DT_SECONDS);
      expect(state.y).toBe(heightAt(state.x, state.z) + GROUND_CENTER_Y);
      expect(state.grounded).toBe(true);
    }
    expect(state.y).toBeGreaterThan(startY + 1); // actually climbed
  });

  it("snaps downhill: grounded every tick, no ballistic micro-hops", () => {
    const yaw = yawToward(-HILL_LINE.uphillX, -HILL_LINE.uphillZ);
    // Start a little way up the slope so the whole walk descends.
    const startX = HILL_LINE.x + HILL_LINE.uphillX * 20;
    const startZ = HILL_LINE.z + HILL_LINE.uphillZ * 20;
    let state = hillState(startX, startZ);
    const startY = state.y;
    for (let tick = 0; tick < 80; tick += 1) {
      state = simulateMovement(state, { buttons: InputButton.Forward, yaw, pitch: 0 }, FIXED_DT_SECONDS);
      expect(state.y).toBe(heightAt(state.x, state.z) + GROUND_CENTER_Y);
      expect(state.grounded).toBe(true);
      expect(state.velocityY).toBe(0);
    }
    expect(state.y).toBeLessThan(startY - 1); // actually descended
  });

  it("never lets go of the ground on the steepest bank at full speed", () => {
    // Walk a spiral across the open field; grounded must hold on every tick
    // (the snap covers the worst per-tick fall: 6 m/s × ~0.56 max gradient
    // × 0.05 s tick ≈ 0.17 m « TERRAIN_GROUND_SNAP_METERS).
    let state = hillState(HILL_LINE.x, HILL_LINE.z);
    for (let tick = 0; tick < 400; tick += 1) {
      const yaw = (tick / 400) * Math.PI * 4;
      state = simulateMovement(state, { buttons: InputButton.Forward, yaw, pitch: 0 }, FIXED_DT_SECONDS);
      expect(state.grounded).toBe(true);
      expect(state.y).toBe(heightAt(state.x, state.z) + GROUND_CENTER_Y);
    }
  });

  it("measures the jump apex above the LOCAL terrain floor on a hilltop", () => {
    const floor = heightAt(HILLTOP.x, HILLTOP.z) + GROUND_CENTER_Y;
    let state = hillState(HILLTOP.x, HILLTOP.z);
    expect(state.y).toBeGreaterThan(GROUND_CENTER_Y + 5); // really on a hill
    let maximumY = state.y;
    for (let tick = 0; tick < 80; tick += 1) {
      state = simulateMovement(state, { buttons: tick === 0 ? InputButton.Jump : 0, yaw: 0, pitch: 0 }, FIXED_DT_SECONDS);
      maximumY = Math.max(maximumY, state.y);
    }
    expect(maximumY - floor).toBeGreaterThan(JUMP_HEIGHT - 0.2);
    expect(maximumY - floor).toBeLessThanOrEqual(JUMP_HEIGHT + 0.05);
    expect(state.y).toBe(heightAt(state.x, state.z) + GROUND_CENTER_Y);
    expect(state.grounded).toBe(true);
  });

  it("keeps server/client divergence within the quantization noise floor", () => {
    // The two sides run identical code; the only input difference is the
    // 5 cm position quantization of replicated state. Replay the same inputs
    // from a quantized and an unquantized start across slopes: divergence
    // must stay within centimeters (no cliffs, no chaotic feedback).
    const yaw = yawToward(HILL_LINE.uphillX, HILL_LINE.uphillZ);
    const quantized = Math.round(HILL_LINE.x / 0.05) * 0.05;
    let a = hillState(HILL_LINE.x, HILL_LINE.z);
    let b = hillState(quantized, HILL_LINE.z);
    let maxDivergence = 0;
    for (let tick = 0; tick < 200; tick += 1) {
      const input = { buttons: InputButton.Forward, yaw: yaw + Math.sin(tick * 0.05) * 0.4, pitch: 0 };
      a = simulateMovement(a, input, FIXED_DT_SECONDS);
      b = simulateMovement(b, input, FIXED_DT_SECONDS);
      maxDivergence = Math.max(maxDivergence, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
    expect(maxDivergence).toBeLessThan(0.05);
  });
});
