import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PlayerClass } from "@janissary/shared";
import { Viewmodel } from "../src/game/characters/viewmodel";

/**
 * Phase 8e-7 ADS viewmodel pose: the rig blends from the hip pose
 * (BASE_X/Y/Z) to the shouldered center pose (AIM_X/Y/Z) under the
 * externally-smoothed aim weight, and the blend is gated to ranged primaries
 * so a blade can never strike a broken aim pose.
 *
 * Bob note: with moveSpeed01 = 0 the idle walk bob still moves x/y by up to
 * ~2 mm once it ramps in — pose assertions use a 5 mm tolerance band, one
 * order below the 26+ cm ADS travel.
 */

const BASE = { x: 0.3, y: -0.3, z: -0.52 };
const AIM = { x: 0, y: -0.075, z: -0.4 };
const TOLERANCE = 0.005;

function makeViewmodel(slot = 2): { viewmodel: Viewmodel; root: THREE.Group } {
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 1000);
  const viewmodel = new Viewmodel(camera);
  viewmodel.setLoadout(PlayerClass.Janissary, false, slot);
  const root = camera.children[0] as THREE.Group | undefined;
  if (root === undefined) throw new Error("viewmodel root not attached to camera");
  return { viewmodel, root };
}

function settle(viewmodel: Viewmodel, frames = 120): void {
  for (let index = 0; index < frames; index += 1) viewmodel.update(1 / 60, 0);
}

describe("viewmodel ADS pose (Phase 8e-7)", () => {
  it("stays at the hip pose at weight 0", () => {
    const { viewmodel, root } = makeViewmodel();
    viewmodel.setAimWeight(0);
    settle(viewmodel);
    expect(root.position.x).toBeCloseTo(BASE.x, 2);
    expect(root.position.y).toBeCloseTo(BASE.y, 2);
    expect(root.position.z).toBeCloseTo(BASE.z, 3);
  });

  it("centers the rig on the sight line at weight 1", () => {
    const { viewmodel, root } = makeViewmodel();
    viewmodel.setAimWeight(1);
    settle(viewmodel);
    expect(Math.abs(root.position.x - AIM.x)).toBeLessThan(TOLERANCE);
    expect(Math.abs(root.position.y - AIM.y)).toBeLessThan(TOLERANCE);
    expect(Math.abs(root.position.z - AIM.z)).toBeLessThan(TOLERANCE);
  });

  it("blends halfway at weight 0.5", () => {
    const { viewmodel, root } = makeViewmodel();
    viewmodel.setAimWeight(0.5);
    settle(viewmodel);
    const midX = (BASE.x + AIM.x) / 2;
    const midY = (BASE.y + AIM.y) / 2;
    expect(Math.abs(root.position.x - midX)).toBeLessThan(TOLERANCE);
    expect(Math.abs(root.position.y - midY)).toBeLessThan(TOLERANCE);
  });

  it("ignores the aim weight with a blade equipped (slot 1 — no broken pose)", () => {
    const { viewmodel, root } = makeViewmodel(1);
    viewmodel.setAimWeight(1);
    settle(viewmodel);
    expect(root.position.x).toBeCloseTo(BASE.x, 2);
    expect(root.position.y).toBeCloseTo(BASE.y, 2);
    expect(root.position.z).toBeCloseTo(BASE.z, 3);
  });

  it("ignores the aim weight for a support primary (drum — inert firearm)", () => {
    const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 1000);
    const viewmodel = new Viewmodel(camera);
    viewmodel.setLoadout(PlayerClass.Mehter, false, 2);
    const root = camera.children[0] as THREE.Group | undefined;
    if (root === undefined) throw new Error("viewmodel root not attached to camera");
    viewmodel.setAimWeight(1);
    settle(viewmodel);
    expect(root.position.x).toBeCloseTo(BASE.x, 2);
    expect(root.position.y).toBeCloseTo(BASE.y, 2);
  });
});
