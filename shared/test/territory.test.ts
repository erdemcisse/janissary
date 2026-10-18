import { describe, expect, it } from "vitest";
import { Team, WORLD_HALF_EXTENT } from "../src/constants";
import { CAPTURE_POINTS } from "../src/map";
import {
  ZONE_GRID_CELLS,
  ZONE_GRID_CELL_SIZE,
  nearestCapturePointIndex,
  teamPointCounts,
  zoneCellForPosition,
  zoneOwnerForPosition,
} from "../src/territory";

describe("territory zone ownership (Phase 8c-4)", () => {
  it("partitions the world into an 18x18 grid of 100 m cells", () => {
    expect(ZONE_GRID_CELLS).toBe(18);
    expect(ZONE_GRID_CELL_SIZE).toBe(100);
    expect(ZONE_GRID_CELL_SIZE * ZONE_GRID_CELLS).toBe(WORLD_HALF_EXTENT * 2);
    expect(zoneCellForPosition(0, 0)).toEqual({ cellX: 9, cellZ: 9 });
    expect(zoneCellForPosition(899, 899)).toEqual({ cellX: 17, cellZ: 17 });
    expect(zoneCellForPosition(-900, -900)).toEqual({ cellX: 0, cellZ: 0 });
    expect(zoneCellForPosition(10_000, -10_000)).toEqual({ cellX: 17, cellZ: 0 });
  });

  it("assigns every position to a capture point by nearest distance", () => {
    for (let index = 0; index < CAPTURE_POINTS.length; index += 1) {
      const point = CAPTURE_POINTS[index];
      if (point === undefined) continue;
      expect(nearestCapturePointIndex(point.x, point.z)).toBe(index);
    }
    // The midpoint between the gate (0,0) and the breach field (0,-32) is
    // nearer to the breach field.
    expect(nearestCapturePointIndex(0, -20)).toBe(1);
    // Deep in the northwest quadrant the hill fort NW (index 4) wins.
    expect(nearestCapturePointIndex(-450, -150)).toBe(4);
  });

  it("maps zone ownership straight from the replicated owner list", () => {
    const owners = Array.from({ length: CAPTURE_POINTS.length }, () => Team.None) as Team[];
    owners[0] = Team.Ottoman;
    owners[4] = Team.Byzantine;
    expect(zoneOwnerForPosition(0, 0, owners)).toBe(Team.Ottoman);
    expect(zoneOwnerForPosition(-470, -150, owners)).toBe(Team.Byzantine);
    expect(zoneOwnerForPosition(-430, -140, owners)).toBe(Team.Byzantine);
    // Near the gate but east of the harbor: harbor (index 2) is neutral.
    expect(zoneOwnerForPosition(74, 42, owners)).toBe(Team.None);
  });

  it("derives the map-control counts from capture point owners", () => {
    const owners = [Team.Ottoman, Team.Ottoman, Team.None, Team.Byzantine, Team.Byzantine, Team.Ottoman, Team.None] as Team[];
    expect(teamPointCounts(owners)).toEqual({ ottoman: 3, byzantine: 2, neutral: 2 });
  });
});
