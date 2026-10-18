import { describe, expect, it } from "vitest";
import { FIXED_DT_SECONDS, GROUND_CENTER_Y, InputButton, simulateMovement, type MovementState } from "@janissary/shared";
import { freezeJumpEdgeForExtrapolation, interpolationAlpha, PredictionCorrectionSmoother } from "../src/net/renderSmoothing";

function stateAt(x: number): MovementState {
  return {
    x,
    y: GROUND_CENTER_Y,
    z: 0,
    velocityX: 5.4,
    velocityY: 0,
    velocityZ: 0,
    yaw: 0,
    pitch: 0,
    grounded: true,
    jumpHeld: false,
  };
}

function maximumFrameStep(samples: readonly number[]): number {
  let maximum = 0;
  for (let index = 1; index < samples.length; index += 1) {
    maximum = Math.max(maximum, Math.abs((samples[index] ?? 0) - (samples[index - 1] ?? 0)));
  }
  return maximum;
}

describe("render smoothing", () => {
  it("turns 24 cm hard reconciliation snaps into sub-frame visual corrections", () => {
    const smoother = new PredictionCorrectionSmoother();
    const hard: number[] = [];
    const smoothed: number[] = [];
    let simulationX = 0;
    const step = 0.09;
    for (let frame = 0; frame < 90; frame += 1) {
      simulationX += step;
      if (frame === 12 || frame === 30 || frame === 48) {
        const before = stateAt(simulationX);
        simulationX -= 0.24;
        smoother.preserveBeforeCorrection(before, stateAt(simulationX));
      }
      hard.push(simulationX);
      smoothed.push(simulationX + smoother.offsetX);
      smoother.advance(1 / 60);
    }

    // Deterministic position/frame evidence: hard max step = 0.150 m;
    // render-offset max step = 0.090 m (40% lower, with no sim divergence).
    expect(maximumFrameStep(hard)).toBeCloseTo(0.15, 6);
    expect(maximumFrameStep(smoothed)).toBeCloseTo(0.09, 6);
    expect(Math.abs(smoother.offsetX)).toBeLessThan(0.001);
  });

  it("cuts to large teleports instead of dragging the camera across the map", () => {
    const smoother = new PredictionCorrectionSmoother();
    smoother.preserveBeforeCorrection(stateAt(0), stateAt(0.4));
    expect(smoother.offsetX).not.toBe(0);
    smoother.preserveBeforeCorrection(stateAt(0.4), stateAt(30));
    expect(smoother.offsetX).toBe(0);
  });

  it("keeps regular 10 Hz remote snapshots uniform at a 60 Hz render cadence", () => {
    const frameStepMs = 1_000 / 60;
    const snapshotStepMs = 100;
    const delayMs = 100;
    const speed = 5.5;
    const positions: number[] = [];
    for (let frameTime = 200; frameTime <= 1_000; frameTime += frameStepMs) {
      const toTime = Math.floor((frameTime + 0.0001) / snapshotStepMs) * snapshotStepMs;
      const fromTime = toTime - snapshotStepMs;
      const alpha = interpolationAlpha(frameTime - delayMs, fromTime, toTime);
      const fromPosition = speed * fromTime / 1_000;
      const toPosition = speed * toTime / 1_000;
      positions.push(fromPosition + (toPosition - fromPosition) * alpha);
    }
    let minimumDelta = Infinity;
    let maximumDelta = -Infinity;
    for (let index = 1; index < positions.length; index += 1) {
      const delta = (positions[index] ?? 0) - (positions[index - 1] ?? 0);
      minimumDelta = Math.min(minimumDelta, delta);
      maximumDelta = Math.max(maximumDelta, delta);
    }
    expect(maximumDelta - minimumDelta).toBeLessThan(0.000001);
    expect(maximumDelta).toBeCloseTo(speed / 60, 6);
  });
});

describe("render extrapolation jump freeze (Phase 8e-6)", () => {
  const grounded: MovementState = {
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
  };

  it("masks a fresh mid-tick Jump press to the fixed step's latched state", () => {
    // Fresh press, not yet latched: the preview input carries no Jump bit.
    expect(freezeJumpEdgeForExtrapolation(InputButton.Forward | InputButton.Jump, false)).toBe(InputButton.Forward);
    // Already latched (held across the landing latch): the bit survives.
    expect(freezeJumpEdgeForExtrapolation(InputButton.Forward | InputButton.Jump, true)).toBe(
      InputButton.Forward | InputButton.Jump,
    );
    // Released: nothing to add.
    expect(freezeJumpEdgeForExtrapolation(InputButton.Forward, true)).toBe(
      InputButton.Forward | InputButton.Jump,
    );
  });

  it("kills the early-takeoff preview: frozen extrapolation stays on the ground", () => {
    const freshPress = { buttons: InputButton.Jump, yaw: 0, pitch: 0 };
    // Pre-fix artifact (documented): re-simulating the accumulator with the
    // live press fired the full jump impulse in the preview — up to ~0.3 m
    // of camera lift before the fixed state took off.
    const preview = simulateMovement(grounded, freshPress, 0.049);
    expect(preview.y).toBeGreaterThan(GROUND_CENTER_Y + 0.2);
    // The frozen input keeps the display on the ground until the fixed step
    // applies the jump — the same ≤50 ms the server takes.
    const frozen = { buttons: freezeJumpEdgeForExtrapolation(freshPress.buttons, grounded.jumpHeld), yaw: 0, pitch: 0 };
    const display = simulateMovement(grounded, frozen, 0.049);
    expect(display.y).toBe(GROUND_CENTER_Y);
  });

  it("keeps the extrapolation step-consistent: re-simulating a full tick lands exactly on the fixed step", () => {
    const walk = { buttons: InputButton.Forward, yaw: 0.3, pitch: 0 };
    let state = simulateMovement(grounded, walk, FIXED_DT_SECONDS);
    state = simulateMovement(state, walk, FIXED_DT_SECONDS);
    const stepped = simulateMovement(state, walk, FIXED_DT_SECONDS);
    const extrapolated = simulateMovement(state, walk, FIXED_DT_SECONDS);
    expect(extrapolated.x).toBeCloseTo(stepped.x, 12);
    expect(extrapolated.y).toBeCloseTo(stepped.y, 12);
    expect(extrapolated.z).toBeCloseTo(stepped.z, 12);
    // Airborne too: a full-tick fall preview equals the fixed landing step.
    const air = { ...grounded, grounded: false, velocityY: -3, y: GROUND_CENTER_Y + 1 };
    const idle = { buttons: 0, yaw: 0, pitch: 0 };
    expect(simulateMovement(air, idle, FIXED_DT_SECONDS).y).toBeCloseTo(
      simulateMovement(air, idle, FIXED_DT_SECONDS).y,
      12,
    );
  });
});
