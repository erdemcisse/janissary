import { describe, expect, it } from "vitest";
import { CameraFeel } from "../src/game/cameraFeel";

/**
 * Regression cover for the low-frame-rate camera explosion found in playtest
 * (Phase 8c-5 build, reported as "I shot the gun and everything bugged, camera
 * started spinning up and down").
 *
 * The camera springs were integrated with semi-implicit Euler using the raw
 * frame delta. That scheme multiplies velocity by (1 - damping*dt) each step,
 * so it diverges once dt > 2/damping — 24.7 ms for the recoil spring (~41 fps)
 * and 21 ms for the kill dip (~47 fps). The playtest machine was running at
 * 25 fps with a p95 frame time of 47 ms, well past both thresholds, so a
 * single shot produced exponentially growing sign-flipping offsets.
 *
 * These tests fire at frame rates from comfortable to terrible and assert the
 * offsets stay bounded and settle. They fail loudly against the old
 * integrator at 40 fps and below.
 */

/** Largest plausible camera offset: recoil peaks near 0.019 rad by design. */
const SANE_OFFSET_RAD = 0.1;

/** `apply()` adds offsets onto rotation, so a zeroed target reads them back. */
function sampleOffset(feel: CameraFeel): number {
  const target = { rotation: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } };
  feel.apply(target);
  return Math.max(Math.abs(target.rotation.x), Math.abs(target.rotation.y), Math.abs(target.rotation.z));
}

function runAtFrameRate(fps: number, seconds: number): { peak: number; final: number } {
  const feel = new CameraFeel();
  const dt = 1 / fps;
  const steps = Math.ceil(seconds * fps);
  let peak = 0;
  feel.onFire();
  for (let index = 0; index < steps; index += 1) {
    feel.update(dt);
    peak = Math.max(peak, sampleOffset(feel));
  }
  return { peak, final: sampleOffset(feel) };
}

describe("CameraFeel spring stability", () => {
  it.each([144, 120, 90, 60, 45, 40, 30, 25, 15, 10])("stays bounded and settles at %i fps", (fps) => {
    const { peak, final } = runAtFrameRate(fps, 2);
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(SANE_OFFSET_RAD);
    // Two seconds is many multiples of the ~120 ms recoil envelope.
    expect(final).toBeLessThan(1e-4);
  });

  it("produces a comparable recoil peak regardless of frame rate", () => {
    // Sub-stepping makes the envelope frame-rate independent, so a 25 fps
    // client should feel the same kick as a 144 fps one rather than a
    // wildly different (or divergent) one.
    const fast = runAtFrameRate(144, 2).peak;
    const slow = runAtFrameRate(25, 2).peak;
    expect(slow).toBeGreaterThan(fast * 0.5);
    expect(slow).toBeLessThan(fast * 2);
  });

  it("stays bounded under rapid repeated fire at a bad frame rate", () => {
    const feel = new CameraFeel();
    let peak = 0;
    for (let index = 0; index < 120; index += 1) {
      feel.onFire();
      feel.update(1 / 25);
      peak = Math.max(peak, sampleOffset(feel));
    }
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(SANE_OFFSET_RAD);
  });

  it("survives a long frame hitch without exploding", () => {
    const feel = new CameraFeel();
    feel.onFire();
    feel.update(0.1); // the dt clamp ceiling — a serious stall
    const offset = sampleOffset(feel);
    expect(Number.isFinite(offset)).toBe(true);
    expect(offset).toBeLessThan(SANE_OFFSET_RAD);
  });
});

describe("CameraFeel.onBreach (siege loop §2.6)", () => {
  function breachPeak(distanceMeters: number): number {
    const feel = new CameraFeel();
    feel.onBreach(distanceMeters);
    let peak = 0;
    for (let index = 0; index < 30; index += 1) {
      feel.update(1 / 60);
      peak = Math.max(peak, sampleOffset(feel));
    }
    return peak;
  }

  it("shakes at full strength inside 15 m and not at all past 40 m", () => {
    expect(breachPeak(10)).toBeGreaterThan(0.002);
    expect(breachPeak(50)).toBe(0);
  });

  it("fades monotonically with distance", () => {
    const near = breachPeak(5);
    const mid = breachPeak(25);
    const far = breachPeak(35);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});
