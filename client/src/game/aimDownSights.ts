/**
 * Phase 8e-7 aim-down-sights presentation math — pure, unit-tested, no
 * three.js. The server-side half (aimed spread) lives in shared AIM_TUNING;
 * this module is the client half: the 0→1 aim blend that drives the FOV zoom,
 * the viewmodel centering, and the mouse-sensitivity rescale.
 *
 * Frame-rate independence follows the 8c-5b audit pattern: the blend is an
 * exponential approach (1 - exp(-rate*dt)), never a linear rate*dt step, so
 * the ~120 ms in/out time holds at any fps.
 */

/**
 * Aim blend approach rate (per second). 1-exp(-25*0.12) ≈ 0.95, so the blend
 * covers 95% of its travel in ~120 ms — the phase's "smooth lerp ~120 ms
 * in/out", reached exponentially instead of by linear t.
 */
export const ADS_BLEND_RATE = 25;

/**
 * Exponential approach of the aim blend toward its 0/1 target. Snaps to the
 * exact target within 0.1% so a fully shouldered or fully lowered weapon has
 * zero residual drift.
 */
export function stepAdsWeight(current: number, target: number, dtSeconds: number): number {
  const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
  const goal = target >= 0.5 ? 1 : 0;
  const next = current + (goal - current) * (1 - Math.exp(-ADS_BLEND_RATE * dt));
  return Math.abs(next - goal) < 0.001 ? goal : next;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Effective field of view (degrees) for a user-configured base FOV, the
 * weapon's AIM_TUNING fovRatio, and the current blend weight. A ratio, not an
 * absolute aimed FOV, because the base is a user setting (60-110°).
 */
export function adsFovDegrees(baseFovDegrees: number, fovRatio: number, weight: number): number {
  return baseFovDegrees * (1 + (fovRatio - 1) * clamp01(weight));
}

/**
 * Mouse-sensitivity multiplier so tracking stays 1:1 at screen center while
 * zoomed: the tangent ratio of the effective to the base half-FOV. (The naive
 * linear FOV ratio undershoots — at 72°→51.8° it gives 0.72 where the true
 * tracking ratio is ≈0.664.)
 */
export function adsSensitivityScale(baseFovDegrees: number, fovRatio: number, weight: number): number {
  const baseHalfRad = (baseFovDegrees * Math.PI) / 360;
  const effHalfRad = (adsFovDegrees(baseFovDegrees, fovRatio, weight) * Math.PI) / 360;
  const scale = Math.tan(effHalfRad) / Math.tan(baseHalfRad);
  return Math.max(0.2, Math.min(1, scale));
}
