import { describe, expect, it } from "vitest";
import { GROUND_CENTER_Y, type MovementState } from "@janissary/shared";
import { applyPredictionCollision } from "../src/net/predictionCollision";

function fallingState(): MovementState {
  return {
    x: 1,
    y: GROUND_CENTER_Y,
    z: 2,
    velocityX: 0,
    velocityY: -3,
    velocityZ: 0,
    yaw: 0,
    pitch: 0,
    grounded: false,
    jumpHeld: false,
  };
}

describe("client collision application", () => {
  it("cancels downward velocity when a step-up raises Y before grounded settles", () => {
    const next = fallingState();
    const predictedY = next.y;
    applyPredictionCollision(next, { x: 1, y: predictedY + 0.45, z: 2, grounded: false }, predictedY);
    expect(next.y).toBeCloseTo(predictedY + 0.45, 6);
    expect(next.velocityY).toBe(0);
  });

  it("copies the sweep position and grounded classification verbatim", () => {
    const next = fallingState();
    const result = applyPredictionCollision(next, { x: 4.5, y: 3.25, z: -7, grounded: true }, next.y);
    expect(result).toBe(next);
    expect(next.x).toBe(4.5);
    expect(next.y).toBe(3.25);
    expect(next.z).toBe(-7);
    expect(next.grounded).toBe(true);
  });

  it("retains downward velocity on a grounded sweep so server parity is preserved", () => {
    const next = fallingState();
    next.velocityY = -3;
    applyPredictionCollision(next, { x: 1, y: 0.2, z: 2, grounded: true }, 3);
    expect(next.velocityY).toBe(0);
  });

  it("keeps fall velocity while airborne without a step-up", () => {
    const next = fallingState();
    applyPredictionCollision(next, { x: 1, y: 0.05, z: 2, grounded: false }, 0.05);
    expect(next.velocityY).toBe(-3);
  });

  it("zeroes velocity just past the 1 mm step-up threshold and retains it exactly at it", () => {
    const next = fallingState();
    applyPredictionCollision(next, { x: 1, y: 0.05 + 0.001 + 1e-9, z: 2, grounded: false }, 0.05);
    expect(next.velocityY).toBe(0);
    const nextAtBoundary = fallingState();
    applyPredictionCollision(nextAtBoundary, { x: 1, y: 0.05 + 0.001, z: 2, grounded: false }, 0.05);
    expect(nextAtBoundary.velocityY).toBe(-3);
    const nextBelow = fallingState();
    applyPredictionCollision(nextBelow, { x: 1, y: 0.05 + 0.0009, z: 2, grounded: false }, 0.05);
    expect(nextBelow.velocityY).toBe(-3);
  });
});
