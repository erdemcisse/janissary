import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PlayerClass } from "@janissary/shared";
import { Viewmodel } from "../src/game/characters/viewmodel";

/**
 * Regression cover for the frame-rate audit (Phase 8c-5b).
 *
 * The viewmodel recoil/prod springs were integrated with semi-implicit
 * Euler using the raw frame delta (clamped at 0.1 s). That is stable at
 * 25 fps (the damping stability limit is 2/13 = 154 ms) but settles with a
 * frame-rate-dependent shape — a shot recoils visibly differently on a
 * 60 fps machine than on the 25 fps target. Same integrator family that
 * exploded in cameraFeel (it just never crossed the divergence threshold).
 *
 * These tests drive a real Viewmodel at frame rates from comfortable to
 * terrible and assert the recoil offset stays bounded, settles, and peaks
 * at roughly the same amplitude at 25 fps as at 144 fps. The raw-dt
 * integrator settled with a different shape at every frame rate; the
 * sub-stepped version is frame-rate independent.
 */

/** Largest plausible viewmodel offset: recoil translate is ~5 cm by design. */
const SANE_OFFSET_METERS = 0.3;
/** Rest pose of the root group (BASE_X/Y/Z in viewmodel.ts). */
const BASE_POSITION: Sample = { x: 0.3, y: -0.3, z: -0.52, rx: 0, ry: 0, rz: 0 };

interface Sample {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

function makeViewmodel(): { viewmodel: Viewmodel; root: THREE.Group } {
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 1000);
  const viewmodel = new Viewmodel(camera);
  viewmodel.setLoadout(PlayerClass.Janissary, false);
  // The viewmodel root is the camera's only child.
  const root = camera.children[0] as THREE.Group | undefined;
  if (root === undefined) throw new Error("viewmodel root not attached to camera");
  return { viewmodel, root };
}

/** Read the live root pose. */
function sample(root: THREE.Group): Sample {
  return { x: root.position.x, y: root.position.y, z: root.position.z, rx: root.rotation.x, ry: root.rotation.y, rz: root.rotation.z };
}

/**
 * Recoil deviation on the z translate + pitch axes only. The idle walk bob
 * legitimately moves x/y by ±2 mm once it ramps in, so a full-pose
 * deviation can never settle below ~2 mm — the recoil spring itself is
 * what must settle, and it lives in the z translate and pitch.
 */
function recoilDeviation(from: Sample, to: Sample): number {
  return Math.max(Math.abs(to.z - from.z), Math.abs(to.rx - from.rx));
}

function runAtFrameRate(fps: number, seconds: number): { peak: number; final: number } {
  const { viewmodel, root } = makeViewmodel();
  const baseline = sample(root);
  const dt = 1 / fps;
  const steps = Math.ceil(seconds * fps);
  let peak = 0;
  viewmodel.onFire();
  for (let index = 0; index < steps; index += 1) {
    viewmodel.update(dt, 0);
    peak = Math.max(peak, recoilDeviation(baseline, sample(root)));
  }
  return { peak, final: recoilDeviation(baseline, sample(root)) };
}

describe("viewmodel spring frame-rate independence", () => {
  it.each([144, 120, 60, 45, 30, 25, 15, 10])("stays bounded and settles at %i fps", (fps) => {
    const { peak, final } = runAtFrameRate(fps, 2);
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(SANE_OFFSET_METERS);
    // Two seconds is many multiples of the ~0.25 s recoil envelope.
    expect(final).toBeLessThan(1e-3);
  });

  it("produces a comparable recoil peak at 25 fps as at 144 fps", () => {
    const fast = runAtFrameRate(144, 2).peak;
    const slow = runAtFrameRate(25, 2).peak;
    // Sub-stepping makes the envelope frame-rate independent: a 25 fps
    // client feels the same kick as a 144 fps one.
    expect(slow).toBeGreaterThan(fast * 0.5);
    expect(slow).toBeLessThan(fast * 2);
  });

  it("stays bounded under rapid repeated fire at a bad frame rate", () => {
    const { viewmodel, root } = makeViewmodel();
    const baseline = sample(root);
    let peak = 0;
    for (let index = 0; index < 120; index += 1) {
      viewmodel.onFire();
      viewmodel.update(1 / 25, 0);
      peak = Math.max(peak, recoilDeviation(baseline, sample(root)));
    }
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeLessThan(SANE_OFFSET_METERS);
  });

  it("survives a long frame hitch without exploding", () => {
    const { viewmodel, root } = makeViewmodel();
    viewmodel.onFire();
    viewmodel.update(0.1, 0); // the dt clamp ceiling — a serious stall
    const offset = recoilDeviation(sample(root), BASE_POSITION);
    expect(Number.isFinite(offset)).toBe(true);
    expect(offset).toBeLessThan(SANE_OFFSET_METERS);
  });
});
