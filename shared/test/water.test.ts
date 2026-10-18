import { describe, expect, it } from "vitest";
import { WATER_SHORE_Z, WATER_WADE_DEPTH, WATER_WADE_SPEED_MULTIPLIER } from "../src/constants";
import {
  DOCK_PIERS,
  GALLEY_DOCKS,
  RIVER_BRIDGES,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  inDeepWater,
  inRiver,
  inRiverFord,
  inShallowWater,
  onDeck,
  riverCenterlineDistance,
} from "../src/map";
import { isAllowed, TERRAIN_PROPS } from "../src/terrain-props";

describe("river geometry (Phase 8c-4b)", () => {
  it("runs from the sea into the interior and ends in a headwater lake", () => {
    // The first segment starts at the sea shore.
    expect(RIVER_SEGMENTS[0]?.z1).toBe(WATER_SHORE_Z);
    // Every segment vertex is far from the core gate/breach/inner-city cluster.
    for (const segment of RIVER_SEGMENTS) {
      expect(Math.abs(segment.x1)).toBeGreaterThan(90);
      expect(Math.abs(segment.x2)).toBeGreaterThan(90);
      expect(segment.x1).toBeLessThan(-100);
      expect(segment.x2).toBeLessThan(-100);
    }
    expect(RIVER_SEGMENTS.length).toBeGreaterThanOrEqual(4);
    // Headwater lake near the north end of the channel.
    expect(RIVER_HEADWATER.radius).toBeGreaterThanOrEqual(25);
    expect(inRiver(RIVER_HEADWATER.x, RIVER_HEADWATER.z)).toBe(true);
  });

  it("classifies channel, ford, and sea water consistently", () => {
    // Deep channel mid-river (not at a ford).
    expect(inRiver(-327, 80)).toBe(true);
    expect(inDeepWater(-327, 80)).toBe(true);
    expect(inShallowWater(-327, 80)).toBe(false);
    // Ford crossings are shallow (wade, no drowning).
    for (const ford of RIVER_FORDS) {
      expect(inRiver(ford.x, ford.z)).toBe(true);
      expect(inRiverFord(ford.x, ford.z)).toBe(true);
      expect(inDeepWater(ford.x, ford.z)).toBe(false);
      expect(inShallowWater(ford.x, ford.z)).toBe(true);
    }
    // The coastal wade band keeps its old behavior.
    expect(inShallowWater(0, WATER_SHORE_Z - 2)).toBe(true);
    expect(inDeepWater(0, WATER_SHORE_Z + 4)).toBe(true);
    // Dry interior land is not water.
    expect(inRiver(0, 0)).toBe(false);
    expect(inDeepWater(0, 0)).toBe(false);
  });

  it("places fords on the channel and bridges spanning it", () => {
    for (const ford of RIVER_FORDS) {
      expect(riverCenterlineDistance(ford.x, ford.z)).toBeLessThanOrEqual(RIVER_HALF_WIDTH);
    }
    for (const bridge of RIVER_BRIDGES) {
      // The deck spans the full channel width at its crossing z.
      const zAtBridge = bridge.z;
      expect(riverCenterlineDistance(bridge.x, zAtBridge)).toBeLessThanOrEqual(RIVER_HALF_WIDTH);
      expect(bridge.width).toBeGreaterThanOrEqual(RIVER_HALF_WIDTH * 2 + 2);
      expect(onDeck(bridge.x, bridge.z)).toBe(true);
    }
    expect(RIVER_BRIDGES.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every galley dock a walkable pier from the dry shore", () => {
    expect(DOCK_PIERS.length).toBe(GALLEY_DOCKS.length);
    for (let index = 0; index < GALLEY_DOCKS.length; index += 1) {
      const dock = GALLEY_DOCKS[index];
      const pier = DOCK_PIERS[index];
      if (dock === undefined || pier === undefined) continue;
      // The pier covers the dock's mooring position and reaches dry shore.
      expect(onDeck(dock.x, dock.z)).toBe(true);
      expect(pier.z - pier.depth / 2).toBeLessThanOrEqual(WATER_SHORE_Z - 1);
    }
  });

  it("keeps terrain props out of the river channel and off the decks", () => {
    for (const prop of TERRAIN_PROPS) {
      const { x, z } = prop.collider;
      expect(inRiver(x, z)).toBe(false);
      expect(onDeck(x, z)).toBe(false);
    }
    // The shared clearance also rejects placements inside the channel.
    expect(isAllowed(-327, 80, 0)).toBe(false);
    expect(isAllowed(RIVER_HEADWATER.x, RIVER_HEADWATER.z, 0)).toBe(false);
    expect(isAllowed(-319, 10, 0)).toBe(false);
    expect(isAllowed(-284, 236, 0)).toBe(false);
  });

  it("keeps fords wade-friendly with the existing shallow-water mechanics", () => {
    expect(WATER_WADE_DEPTH).toBeGreaterThan(0);
    // Traversal should feel slowed, not immobilized: the old 0.35 multiplier
    // made a ford and an escape from open water frustratingly sticky.
    expect(WATER_WADE_SPEED_MULTIPLIER).toBeGreaterThanOrEqual(0.55);
    expect(WATER_WADE_SPEED_MULTIPLIER).toBeLessThan(1);
    for (const ford of RIVER_FORDS) {
      expect(inShallowWater(ford.x - (RIVER_HALF_WIDTH + 1), ford.z)).toBe(false);
    }
  });
});
