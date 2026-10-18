import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAPTURE_POINTS, RIVER_HALF_WIDTH, SIEGE_BLOCKOUT, isAllowed, riverCenterlineDistance } from "@janissary/shared";
import { distanceToRoads } from "../src/game/world/biomes";
import {
  SCATTER_DAYLIGHT_TINTS,
  TIER_DENSITY,
  planScatter,
  prepareScatterGeometry,
  type ScatterPlacement,
} from "../src/game/world/scatter";

function offStatics(placement: ScatterPlacement, margin: number): boolean {
  for (const box of SIEGE_BLOCKOUT) {
    if (Math.abs(placement.x - box.x) < box.width / 2 + margin && Math.abs(placement.z - box.z) < box.depth / 2 + margin) return false;
  }
  return true;
}

describe("world scatter (Phase 8e-5 Task 3)", () => {
  it("is deterministic — the whole plan regenerates identically", () => {
    expect(planScatter()).toEqual(planScatter());
  });

  it("places every layer in meaningful numbers", () => {
    const plan = planScatter();
    expect(plan.grass.length).toBeGreaterThan(400);
    expect(plan.bushes.length).toBeGreaterThan(60);
    expect(plan.rocks.length).toBeGreaterThan(40);
    expect(plan.trees.length).toBeGreaterThan(20);
    expect(plan.willows.length).toBeGreaterThan(8);
    expect(plan.reeds.length).toBeGreaterThan(10);
    expect(plan.rubble.length).toBeGreaterThan(10);
  });

  it("keeps obstacle-sized layers inside the shared prop rule and off roads", () => {
    const plan = planScatter();
    for (const layer of [plan.bushes, plan.trees, plan.willows]) {
      for (const placement of layer) {
        expect(isAllowed(placement.x, placement.z, 0.5)).toBe(true);
        expect(distanceToRoads(placement.x, placement.z)).toBeGreaterThan(3);
        expect(offStatics(placement, 0.3)).toBe(true);
      }
    }
    // Rocks split: field boulders follow the full shared prop rule; the
    // hill-base ring population follows its own profile (the 45 m capture
    // prop clearance would reject the entire ring — see planRocks).
    for (const rock of plan.rocks) {
      if (rock.ring === true) {
        expect(riverCenterlineDistance(rock.x, rock.z)).toBeGreaterThan(RIVER_HALF_WIDTH);
        expect(distanceToRoads(rock.x, rock.z)).toBeGreaterThan(3);
        expect(offStatics(rock, 0.8)).toBe(true);
        for (const point of CAPTURE_POINTS) {
          expect(Math.hypot(rock.x - point.x, rock.z - point.z)).toBeGreaterThan(point.radius);
        }
      } else {
        expect(isAllowed(rock.x, rock.z, 0.5)).toBe(true);
        expect(distanceToRoads(rock.x, rock.z)).toBeGreaterThan(3);
        expect(offStatics(rock, 0.3)).toBe(true);
      }
    }
    // The ring population must actually exist — "rocks on hills" is the point.
    expect(plan.rocks.some((rock) => rock.ring === true)).toBe(true);
  });

  it("keeps grass on dry open ground — never in the river, lane, or roads", () => {
    const plan = planScatter();
    for (const tuft of plan.grass) {
      expect(riverCenterlineDistance(tuft.x, tuft.z)).toBeGreaterThan(RIVER_HALF_WIDTH);
      expect(Math.abs(tuft.z)).toBeGreaterThanOrEqual(16);
      expect(tuft.z).toBeLessThan(205);
      expect(distanceToRoads(tuft.x, tuft.z)).toBeGreaterThan(1);
      expect(offStatics(tuft, 0.2)).toBe(true);
    }
  });

  it("plants every reed at the waterline and nowhere else", () => {
    const plan = planScatter();
    for (const reed of plan.reeds) {
      const water = riverCenterlineDistance(reed.x, reed.z);
      expect(water).toBeGreaterThan(RIVER_HALF_WIDTH - 6);
      expect(water).toBeLessThan(RIVER_HALF_WIDTH + 7);
    }
  });

  it("scatters wall rubble only as small debris along the wall faces", () => {
    const plan = planScatter();
    for (const bit of plan.rubble) {
      expect(Math.abs(bit.z)).toBeGreaterThan(2);
      expect(Math.abs(bit.z)).toBeLessThan(6.5);
      expect(Math.abs(bit.x)).toBeGreaterThan(9); // gate approach stays clear
      expect(Math.abs(bit.x)).toBeLessThan(78);
      expect(bit.scale).toBeLessThanOrEqual(0.8);
      expect(distanceToRoads(bit.x, bit.z)).toBeGreaterThan(2);
    }
  });

  it("scales by tier as a stable prefix — and grass drops out on low", () => {
    for (const densities of Object.values(TIER_DENSITY)) {
      expect(densities.low).toBeLessThanOrEqual(densities.medium);
      expect(densities.medium).toBeLessThanOrEqual(densities.high);
    }
    expect(TIER_DENSITY.grass.low).toBe(0);
    expect(TIER_DENSITY.grass.high).toBe(1);
  });

  it("keeps bright-day foliage tints out of the HDR clipping range", () => {
    const tints = [
      ...SCATTER_DAYLIGHT_TINTS.treeVariants,
      ...Object.values(SCATTER_DAYLIGHT_TINTS.layers),
    ];
    for (const tint of tints) {
      expect(Math.max(...tint)).toBeLessThanOrEqual(1);
      expect(Math.min(...tint)).toBeGreaterThan(0);
    }
    const fieldOak = SCATTER_DAYLIGHT_TINTS.treeVariants[1];
    expect(fieldOak[1]).toBeGreaterThan(fieldOak[0]);
    expect(fieldOak[1]).toBeGreaterThan(fieldOak[2]);
  });

  it("fits each scatter consumer without mutating the cached source geometry", () => {
    const source = new THREE.BoxGeometry(4, 2, 2);
    const fieldRock = prepareScatterGeometry(source, 1.25);
    const wallRubble = prepareScatterGeometry(source, 0.85);
    const sourceSize = new THREE.Vector3();
    const fieldSize = new THREE.Vector3();
    const rubbleSize = new THREE.Vector3();
    source.computeBoundingBox();
    fieldRock.computeBoundingBox();
    wallRubble.computeBoundingBox();
    source.boundingBox?.getSize(sourceSize);
    fieldRock.boundingBox?.getSize(fieldSize);
    wallRubble.boundingBox?.getSize(rubbleSize);

    expect(sourceSize.x).toBeCloseTo(4);
    expect(fieldSize.x).toBeCloseTo(1.25);
    expect(rubbleSize.x).toBeCloseTo(0.85);
    expect(fieldRock).not.toBe(source);
    expect(wallRubble).not.toBe(source);

    source.dispose();
    fieldRock.dispose();
    wallRubble.dispose();
  });
});
