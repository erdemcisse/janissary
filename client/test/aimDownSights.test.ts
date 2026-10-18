import { describe, expect, it } from "vitest";
import { ADS_BLEND_RATE, adsFovDegrees, adsSensitivityScale, stepAdsWeight } from "../src/game/aimDownSights";

/**
 * Phase 8e-7 ADS presentation math: the blend stepper (frame-rate independent
 * per the 8c-5b audit pattern), the FOV zoom, and the tangent-ratio
 * sensitivity rescale that keeps tracking 1:1 at screen center.
 */
describe("stepAdsWeight", () => {
  it("converges to 1 and snaps exactly", () => {
    let weight = 0;
    for (let index = 0; index < 60; index += 1) weight = stepAdsWeight(weight, 1, 1 / 60);
    expect(weight).toBe(1);
  });

  it("reaches ~95% in 120 ms (the phase's smooth-lerp budget)", () => {
    let weight = 0;
    for (let index = 0; index < 12; index += 1) weight = stepAdsWeight(weight, 1, 0.01);
    expect(weight).toBeGreaterThan(0.94);
    expect(weight).toBeLessThan(1);
  });

  it("blends back out to exactly 0", () => {
    let weight = 1;
    for (let index = 0; index < 60; index += 1) weight = stepAdsWeight(weight, 0, 1 / 60);
    expect(weight).toBe(0);
  });

  it("is frame-rate independent: same wall time, same weight, any dt slicing", () => {
    // 0.2 s of blend-in at 120 fps vs 30 fps vs a ragged sequence.
    let fast = 0;
    for (let index = 0; index < 24; index += 1) fast = stepAdsWeight(fast, 1, 1 / 120);
    let slow = 0;
    for (let index = 0; index < 6; index += 1) slow = stepAdsWeight(slow, 1, 1 / 30);
    let ragged = 0;
    for (const dt of [0.05, 0.01, 0.09, 0.03, 0.02]) ragged = stepAdsWeight(ragged, 1, dt);
    expect(slow).toBeCloseTo(fast, 3);
    expect(ragged).toBeCloseTo(fast, 3);
  });

  it("clamps a frame hitch so a stall cannot overshoot", () => {
    const weight = stepAdsWeight(0, 1, 5); // 5 s stall arrives as one frame
    expect(weight).toBeLessThanOrEqual(1 - Math.exp(-ADS_BLEND_RATE * 0.1) + 1e-9);
    expect(Number.isFinite(weight)).toBe(true);
  });
});

describe("adsFovDegrees", () => {
  it("is the base FOV at weight 0 and base×ratio at weight 1", () => {
    expect(adsFovDegrees(72, 0.72, 0)).toBe(72);
    expect(adsFovDegrees(72, 0.72, 1)).toBeCloseTo(51.84, 5);
    expect(adsFovDegrees(110, 0.72, 1)).toBeCloseTo(79.2, 5);
  });

  it("interpolates linearly across the blend", () => {
    expect(adsFovDegrees(72, 0.72, 0.5)).toBeCloseTo(72 * (1 + (0.72 - 1) * 0.5), 10);
  });

  it("clamps an out-of-range weight", () => {
    expect(adsFovDegrees(72, 0.72, 4)).toBeCloseTo(51.84, 5);
  });
});

describe("adsSensitivityScale", () => {
  it("is 1 when not aiming", () => {
    expect(adsSensitivityScale(72, 0.72, 0)).toBeCloseTo(1, 10);
  });

  it("is the tangent ratio of effective to base half-FOV at full aim", () => {
    const baseHalf = (72 * Math.PI) / 360;
    const effHalf = (72 * 0.72 * Math.PI) / 360;
    expect(adsSensitivityScale(72, 0.72, 1)).toBeCloseTo(Math.tan(effHalf) / Math.tan(baseHalf), 10);
    // And it is meaningfully below the naive linear ratio — the reason the
    // tan ratio exists (0.664 vs 0.72 at the default FOV).
    expect(adsSensitivityScale(72, 0.72, 1)).toBeLessThan(0.72);
  });

  it("never exceeds 1 and clamps extreme ratios", () => {
    expect(adsSensitivityScale(72, 1, 1)).toBeLessThanOrEqual(1);
    expect(adsSensitivityScale(110, 0.001, 1)).toBe(0.2);
  });
});
