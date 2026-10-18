import { describe, expect, it } from "vitest";
import { FIXED_DT_SECONDS, GROUND_CENTER_Y, InputButton, MAX_SPEED, MAX_STEP_UP } from "../src/constants";
import { type StaticBox } from "../src/map";
import { SLOPE_DOWNHILL_MAX_BOOST, SLOPE_MAX_RESISTANCE, SLOPE_PROBE_METERS, SLOPE_REFERENCE_TAN, TERRAIN_SLOPE_PROBE_METERS, TERRAIN_SLOPE_REFERENCE_TAN, simulateMovement, slopeSpeedFactorAt, supportFloorAt, type MovementState } from "../src/movement";
import { sweepCapsuleAgainstBoxes } from "../src/collision";
import { heightAt, terrainGradientAt } from "../src/terrain";

/**
 * Directional slope resistance (Phase 8e-8, ADR 0037 Task 2).
 *
 * The world's "slopes" are box terraces; a slope is the support-floor rise
 * sampled ahead along the velocity intent. The curve: uphill factor
 * 1 - 0.4·min(1, rise/ref)², contour exactly 1, downhill 1 + ≤0.15.
 *
 * Bounds from the phase: uphill at the steepest walkable slope ≥ 0.6× flat;
 * contouring ≥ 0.9× flat; downhill ≤ +15%.
 *
 * Convention note: forward at yaw 0 is -Z (movement's (-sin yaw, -cos yaw));
 * all fixtures place tiers along -Z and drive plain Forward so the intent
 * math is the same one simulateMovement uses.
 */

/** A single walkable tier: an earth box with its top at `top` above flat. */
function tier(id: string, x: number, z: number, top: number, width = 6, depth = 6): StaticBox {
  return { id, x, z, y: top / 2, width, height: top, depth, material: "earth" };
}

/** Tier with footprint z ∈ [zMin, zMax] (margin included): the player at 0
 * stays off it while the 1.5 m ahead-probe (forward at yaw 0) lands on it. */
function tierAhead(top: number, zMin = -8.5, zMax = -0.9): StaticBox {
  const z = (zMin + zMax) / 2;
  return tier("t", 0, z, top, 6, zMax - zMin);
}

const FLAT: readonly StaticBox[] = [];

function walkState(overrides: Partial<MovementState> = {}): MovementState {
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

describe("supportFloorAt", () => {
  it("returns the flat floor off any box", () => {
    expect(supportFloorAt(0, 0, 0, FLAT)).toBe(GROUND_CENTER_Y);
  });

  it("returns the rest height of a walkable box top", () => {
    const boxes = [tier("t", 0, 0, 2.0)];
    expect(supportFloorAt(0, 0, 0, boxes)).toBeCloseTo(2.0 + 0.9, 6);
  });

  it("ignores boxes beyond the step-up limit (walls are not floors)", () => {
    const boxes = [tier("wall", 0, 0, 5.0)];
    expect(supportFloorAt(0, 0, 0, boxes)).toBe(GROUND_CENTER_Y);
    // Standing on a 2.4 m tier, a second tier 2.4 m higher is still walkable.
    const stepped = [tier("first", 0, 0, 2.4), tier("second", 0, 0, 4.8, 2, 2)];
    expect(supportFloorAt(0, 0, 2.4, stepped)).toBeCloseTo(4.8 + 0.9, 6);
  });

  it("honors the footprint margin (capsule radius)", () => {
    const boxes = [tier("t", 0, 0, 2.0, 4, 4)];
    expect(supportFloorAt(2.2, 0, 0, boxes)).toBeCloseTo(2.0 + 0.9, 6);
    expect(supportFloorAt(3.0, 0, 0, boxes)).toBe(GROUND_CENTER_Y);
  });
});

describe("slopeSpeedFactorAt — the curve", () => {
  it("is exactly 1 on flat ground in any direction", () => {
    for (const yaw of [0, Math.PI / 4, Math.PI]) {
      expect(slopeSpeedFactorAt(0, 0, 0, InputButton.Forward, yaw, FLAT)).toBe(1);
    }
  });

  it("is 1 when idle (no intent)", () => {
    const boxes = [tierAhead(2.5)];
    expect(slopeSpeedFactorAt(0, 0, 0, 0, 0, boxes)).toBe(1);
  });

  it("straight uphill at the steepest walkable slope is exactly 0.6×", () => {
    // A full MAX_STEP_UP rise over the probe span: the reference slope. The
    // floor model can never exceed the reference (higher tiers are walls),
    // so this is the curve's floor.
    const factor = slopeSpeedFactorAt(0, 0, 0, InputButton.Forward, 0, [tierAhead(MAX_STEP_UP)]);
    expect(factor).toBeCloseTo(1 - SLOPE_MAX_RESISTANCE, 6);
    expect(factor).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });

  it("is quadratic in slope magnitude: half the rise costs a quarter of the resistance", () => {
    const at = (rise: number): number => slopeSpeedFactorAt(0, 0, 0, InputButton.Forward, 0, [tierAhead(rise)]);
    const half = at(MAX_STEP_UP / 2);
    expect(half).toBeGreaterThan(at(MAX_STEP_UP));
    expect(half).toBeCloseTo(1 - SLOPE_MAX_RESISTANCE * 0.25, 6); // quadratic ramp
    // Gentle hills are nearly free: a 0.45 m stair step reads ~0.99.
    const stair = at(0.45);
    expect(stair).toBeGreaterThan(0.97);
    expect(stair).toBeLessThan(1);
  });

  it("is directional: the same position, different intents, different factors", () => {
    const boxes = [tierAhead(2.5)];
    const uphill = slopeSpeedFactorAt(0, 0, 0, InputButton.Forward, 0, boxes);
    const away = slopeSpeedFactorAt(0, 0, 0, InputButton.Backward, 0, boxes);
    const strafe = slopeSpeedFactorAt(0, 0, 0, InputButton.Right, 0, boxes);
    expect(uphill).toBeLessThan(1);
    expect(away).toBe(1); // probing away reads flat
    expect(strafe).toBe(1); // contouring reads flat
    expect(SLOPE_REFERENCE_TAN).toBeCloseTo(MAX_STEP_UP / SLOPE_PROBE_METERS, 6);
  });

  it("contouring along a tier top costs nothing (factor exactly 1)", () => {
    // Player on the tier, walking along it: both probes stay on the tier.
    const boxes = [tier("t", 0, 0, 2.4, 6, 6)];
    const factor = slopeSpeedFactorAt(0, 0, 2.4, InputButton.Forward, 0, boxes);
    expect(factor).toBe(1);
  });

  it("downhill is capped at +15% and ramps with the drop", () => {
    // Player ON a tier, walking off its near edge (+Z): the ahead-probe reads
    // the drop. Tier z ∈ [-8.0, -0.4]; player at z = -1 on it.
    const boxes = [tier("t", 0, -4.2, 2.5, 6, 7.6)];
    const full = slopeSpeedFactorAt(0, -1, 2.5, InputButton.Backward, 0, boxes);
    expect(full).toBeCloseTo(1 + SLOPE_DOWNHILL_MAX_BOOST, 6);
    // A shallower tier reads a smaller, still positive boost.
    const gentleBoxes = [tier("t", 0, -4.2, 1.25, 6, 7.6)];
    const gentle = slopeSpeedFactorAt(0, -1, 1.25, InputButton.Backward, 0, gentleBoxes);
    expect(gentle).toBeGreaterThan(1);
    expect(gentle).toBeLessThan(1 + SLOPE_DOWNHILL_MAX_BOOST);
  });
});

/**
 * The exact composition both the server (world.ts movement integration) and
 * the client prediction (#simulatePredictedMovement) run: slope factor from
 * the shared probe, then simulateMovement with the combined multiplier, then
 * the shared collision sweep, then the sweep-result application (the
 * client's applyPredictionCollision; the server does the same inline).
 * The client routes prediction, reconcile replay, and render preview through
 * one simulator, so this composition is the parity contract — identical on
 * both sides by construction.
 */
function stepComposed(state: MovementState, input: { buttons: number; yaw: number }, boxes: readonly StaticBox[]): MovementState {
  const slopeFactor = slopeSpeedFactorAt(state.x, state.z, state.y - GROUND_CENTER_Y, input.buttons, input.yaw, boxes);
  const next = simulateMovement(state, { buttons: input.buttons, yaw: input.yaw, pitch: 0 }, FIXED_DT_SECONDS, slopeFactor);
  const predictedY = next.y;
  const collision = sweepCapsuleAgainstBoxes(
    { x: state.x, y: state.y, z: state.z, grounded: true },
    next,
    boxes,
  );
  next.x = collision.x;
  next.y = collision.y;
  next.z = collision.z;
  next.grounded = collision.grounded;
  if (collision.grounded || collision.y > predictedY + 0.001) next.velocityY = 0;
  return next;
}

describe("slope resistance in the composed movement pipeline (parity shape)", () => {
  /**
   * The exact composition both the server (world.ts movement integration) and
   * the client prediction (#simulatePredictedMovement) run: slope factor from
   * the shared probe, then simulateMovement with the combined multiplier, then
   * the shared collision sweep, then the sweep-result application (the
   * client's applyPredictionCollision; the server does the same inline).
   * The client routes prediction, reconcile replay, and render preview through
   * one simulator, so this composition is the parity contract — identical on
   * both sides by construction.
   */
  function step(state: MovementState, input: { buttons: number; yaw: number }, boxes: readonly StaticBox[]): MovementState {
    const slopeFactor = slopeSpeedFactorAt(state.x, state.z, state.y - GROUND_CENTER_Y, input.buttons, input.yaw, boxes);
    const next = simulateMovement(state, { buttons: input.buttons, yaw: input.yaw, pitch: 0 }, FIXED_DT_SECONDS, slopeFactor);
    const predictedY = next.y;
    const collision = sweepCapsuleAgainstBoxes(
      { x: state.x, y: state.y, z: state.z, grounded: true },
      next,
      boxes,
    );
    next.x = collision.x;
    next.y = collision.y;
    next.z = collision.z;
    next.grounded = collision.grounded;
    if (collision.grounded || collision.y > predictedY + 0.001) next.velocityY = 0;
    return next;
  }

  it("climbs a tier measurably slower than flat walking, and actually climbs it", () => {
    // Forward at yaw 0 walks -Z; the tier sits 4.6..9.4 m down that path.
    const boxes = [tier("t", 0, -7, 2.4, 4, 4)]; // tier z ∈ [-9.4, -4.6]
    const input = { buttons: InputButton.Forward, yaw: 0 };
    let flat = walkState({ x: 0, z: 0, velocityX: 0, velocityZ: -MAX_SPEED });
    let climber = walkState({ x: 0, z: 0, velocityX: 0, velocityZ: -MAX_SPEED });
    let flatDistance = 0;
    let climbDistance = 0;
    let climbed = false;
    for (let tick = 0; tick < 25; tick += 1) {
      const flatBefore = { x: flat.x, z: flat.z };
      flat = step(flat, input, FLAT);
      flatDistance += Math.hypot(flat.x - flatBefore.x, flat.z - flatBefore.z);
      const climbBefore = { x: climber.x, z: climber.z };
      const beforeY = climber.y;
      climber = step(climber, input, boxes);
      climbDistance += Math.hypot(climber.x - climbBefore.x, climber.z - climbBefore.z);
      if (climber.y > beforeY + 0.05) climbed = true;
    }
    expect(climbed).toBe(true); // the tier was actually stepped up
    expect(climber.y).toBeGreaterThan(GROUND_CENTER_Y + 1);
    expect(climbDistance).toBeLessThan(flatDistance);
    // The resistance bites only while the 1.5 m probe crosses the edge, so
    // the overall ratio stays far above the 0.6 curve floor.
    expect(climbDistance / flatDistance).toBeGreaterThan(0.8);
  });

  it("is deterministic: two identical runs end byte-identical (parity base)", () => {
    const boxes = [tier("t", 0, -7, 2.4, 4, 4)];
    const run = (): { x: number; y: number; z: number } => {
      let state = walkState({ x: 0, z: 0, velocityX: 0, velocityZ: -MAX_SPEED });
      const input = { buttons: InputButton.Forward, yaw: 0 };
      for (let tick = 0; tick < 25; tick += 1) state = step(state, input, boxes);
      return { x: state.x, y: state.y, z: state.z };
    };
    const first = run();
    const second = run();
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// Terrain term (Phase 8e-11, ADR 0040): the same curve shape fed by the
// continuous heightfield gradient at TERRAIN_SLOPE_REFERENCE_TAN = 0.35,
// multiplied with the box term. The fixture point is a strong open-field
// gradient line (mask = 1 along ±24 m): (-632, -480), |grad| ≈ 0.160.
// ---------------------------------------------------------------------------

const GRADIENT_SPOT = { x: -632, z: -480, gx: -0.14953383855759883, gz: -0.05628770655085935 };

function yawToward(dx: number, dz: number): number {
  // forward = (-sin yaw, -cos yaw)
  return Math.atan2(-dx, -dz);
}

/** The terrain term alone, recomputed from first principles. */
function expectedTerrainFactor(intentX: number, intentZ: number): number {
  const rise = heightAt(GRADIENT_SPOT.x + intentX * TERRAIN_SLOPE_PROBE_METERS, GRADIENT_SPOT.z + intentZ * TERRAIN_SLOPE_PROBE_METERS)
    - heightAt(GRADIENT_SPOT.x, GRADIENT_SPOT.z);
  const tan = rise / TERRAIN_SLOPE_PROBE_METERS;
  if (tan <= 0) {
    return 1 + Math.min(SLOPE_DOWNHILL_MAX_BOOST, SLOPE_DOWNHILL_MAX_BOOST * Math.min(1, -tan / TERRAIN_SLOPE_REFERENCE_TAN));
  }
  return 1 - SLOPE_MAX_RESISTANCE * Math.min(1, tan / TERRAIN_SLOPE_REFERENCE_TAN) ** 2;
}

describe("slopeSpeedFactorAt — terrain term", () => {
  it("tracks the continuous gradient: uphill costs, downhill boosts, contour is free", () => {
    const magnitude = Math.hypot(GRADIENT_SPOT.gx, GRADIENT_SPOT.gz);
    const uphillX = GRADIENT_SPOT.gx / magnitude;
    const uphillZ = GRADIENT_SPOT.gz / magnitude;
    const uphill = slopeSpeedFactorAt(GRADIENT_SPOT.x, GRADIENT_SPOT.z, 0, InputButton.Forward, yawToward(uphillX, uphillZ), FLAT);
    expect(uphill).toBeLessThan(1);
    expect(uphill).toBeCloseTo(expectedTerrainFactor(uphillX, uphillZ), 9);
    const downhill = slopeSpeedFactorAt(GRADIENT_SPOT.x, GRADIENT_SPOT.z, 0, InputButton.Forward, yawToward(-uphillX, -uphillZ), FLAT);
    expect(downhill).toBeGreaterThan(1);
    expect(downhill).toBeCloseTo(expectedTerrainFactor(-uphillX, -uphillZ), 9);
    // Contour: perpendicular intent reads a near-zero chord — almost free.
    const contour = slopeSpeedFactorAt(GRADIENT_SPOT.x, GRADIENT_SPOT.z, 0, InputButton.Forward, yawToward(-uphillZ, uphillX), FLAT);
    expect(contour).toBeGreaterThan(0.98);
    expect(contour).toBeLessThan(1.02);
  });

  it("is exactly 1 on the masked flats even though boxes say nothing", () => {
    // Inside the keep-flat corridor the terrain term must contribute exactly
    // nothing (both probes read 0), so the 8e-8 flat-ground contract holds.
    for (const yaw of [0, Math.PI / 3, Math.PI * 0.7]) {
      expect(slopeSpeedFactorAt(0, 40, 0, InputButton.Forward, yaw, FLAT)).toBe(1);
    }
  });

  it("multiplies with the box term when a terrace sits on a hillside", () => {
    const magnitude = Math.hypot(GRADIENT_SPOT.gx, GRADIENT_SPOT.gz);
    const uphillX = GRADIENT_SPOT.gx / magnitude;
    const uphillZ = GRADIENT_SPOT.gz / magnitude;
    // A 2.5 m terrace 5 m along the uphill intent: the spot itself stays
    // outside its footprint margin while the 1.5 m ahead-probe lands on it.
    const boxX = GRADIENT_SPOT.x + uphillX * 5;
    const boxZ = GRADIENT_SPOT.z + uphillZ * 5;
    const boxes = [tier("t", boxX, boxZ, 2.5, 6, 6)];
    const combined = slopeSpeedFactorAt(GRADIENT_SPOT.x, GRADIENT_SPOT.z, 0, InputButton.Forward, yawToward(uphillX, uphillZ), boxes);
    const terrainOnly = expectedTerrainFactor(uphillX, uphillZ);
    expect(combined).toBeCloseTo((1 - SLOPE_MAX_RESISTANCE) * terrainOnly, 6);
  });

  it("walks uphill on terrain measurably slower than the flat control, byte-identical on replay", () => {
    const run = (): { x: number; y: number; z: number; distance: number } => {
      const yaw = yawToward(-0.935891, -0.352289); // the open-field hill line at (-632, -480)
      let state = walkState({ x: -632, z: -480, y: heightAt(-632, -480) + GROUND_CENTER_Y });
      let distance = 0;
      for (let tick = 0; tick < 60; tick += 1) {
        const before = { x: state.x, z: state.z };
        state = stepComposed(state, { buttons: InputButton.Forward, yaw }, FLAT);
        distance += Math.hypot(state.x - before.x, state.z - before.z);
      }
      return { x: state.x, y: state.y, z: state.z, distance };
    };
    const climbed = run();
    const replay = run();
    expect(replay).toEqual(climbed); // determinism base on terrain
    expect(climbed.y).toBeGreaterThan(heightAt(-632, -480) + GROUND_CENTER_Y + 1); // actually climbed
    // Flat control at the same speed covers more ground in the same ticks.
    let flat = walkState({ x: 0, z: 40 });
    let flatDistance = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      const before = { x: flat.x, z: flat.z };
      flat = stepComposed(flat, { buttons: InputButton.Forward, yaw: 0 }, FLAT);
      flatDistance += Math.hypot(flat.x - before.x, flat.z - before.z);
    }
    expect(climbed.distance).toBeLessThan(flatDistance);
    // The quadratic curve (ADR 0037) predicts factor = 1 − 0.4·min(1, tan/0.35)²
    // along the intent. The 8e-19 octave retune steepened this probe spot
    // (tan ≈ 0.19, was ~0.1 at 8e-17), so derive the expectation from the
    // terrain's ACTUAL gradient instead of a stale "few percent" guess —
    // the assertions stay: real uphill cost, and cost matching the curve,
    // never a cliff.
    const probeGradient = { x: 0, z: 0 };
    terrainGradientAt(-632, -480, probeGradient);
    const walkTan = Math.hypot(probeGradient.x, probeGradient.z);
    const predicted = 1 - 0.4 * Math.min(1, walkTan / 0.35) ** 2;
    expect(walkTan).toBeGreaterThan(0.08); // the probe really is a slope
    expect(walkTan).toBeLessThan(0.35); // and not a cliff
    expect(climbed.distance / flatDistance).toBeGreaterThan(predicted - 0.04);
  });
});
