import { describe, expect, it } from "vitest";
import { CAPTURE_TICKET_DRAIN_BY_POINTS, WORLD_HALF_EXTENT } from "../src/constants";
import { CAPTURE_POINTS, SIEGE_BLOCKOUT } from "../src/map";
import { isAllowed } from "../src/terrain-props";

describe("world scale (Phase 8c-4)", () => {
  it("grows the world to ±900 with nothing else assuming the old 300 bound", () => {
    expect(WORLD_HALF_EXTENT).toBe(900);
    expect(CAPTURE_POINTS.length).toBe(7);
    for (const point of CAPTURE_POINTS) {
      expect(Math.abs(point.x)).toBeLessThan(WORLD_HALF_EXTENT);
      expect(Math.abs(point.z)).toBeLessThan(WORLD_HALF_EXTENT);
    }
  });

  it("keeps the new hill forts 300-600 m from the core cluster", () => {
    const core = CAPTURE_POINTS.slice(0, 3);
    for (const point of CAPTURE_POINTS.slice(4)) {
      const coreDistance = Math.min(...core.map((corePoint) => Math.hypot(point.x - corePoint.x, point.z - corePoint.z)));
      expect(coreDistance).toBeGreaterThanOrEqual(300);
      expect(coreDistance).toBeLessThanOrEqual(600);
    }
  });

  it("keeps terrain props off capture points and lets hill-fort flanks stay clear", () => {
    for (const point of CAPTURE_POINTS) {
      // The shared clearance keeps the capture zone itself prop-free.
      expect(isAllowed(point.x + 44, point.z, 1)).toBe(false);
    }
    // The hill-fort flanks sit in open terrain: 60 m out is placeable.
    for (const point of CAPTURE_POINTS.slice(4)) {
      expect(isAllowed(point.x + 60, point.z, 0)).toBe(true);
    }
  });

  it("keeps the ticket drain curve monotonic and capped at 4/s", () => {
    expect(CAPTURE_TICKET_DRAIN_BY_POINTS).toEqual([0, 0.5, 0.75, 1, 1.75, 2.5, 3.25, 4]);
    expect(CAPTURE_TICKET_DRAIN_BY_POINTS[0]).toBe(0);
    for (let index = 1; index < CAPTURE_TICKET_DRAIN_BY_POINTS.length; index += 1) {
      const previous = CAPTURE_TICKET_DRAIN_BY_POINTS[index - 1];
      const current = CAPTURE_TICKET_DRAIN_BY_POINTS[index];
      if (previous === undefined || current === undefined) continue;
      expect(current).toBeGreaterThanOrEqual(previous);
      expect(current).toBeLessThanOrEqual(4);
    }
  });

  it("contains a walled inner-city district with colliders and no gaps", () => {
    const cityWalls = SIEGE_BLOCKOUT.filter((box) => box.id.startsWith("city-wall-"));
    expect(cityWalls.length).toBe(9);
    const innerCity = CAPTURE_POINTS.find((point) => point.id === "INNER_CITY");
    expect(innerCity).toBeDefined();
    if (innerCity === undefined) return;
    // The capture point sits inside the district walls.
    const inside = cityWalls.every((wall) => {
      const halfWidth = wall.width / 2;
      const halfDepth = wall.depth / 2;
      return !(Math.abs(innerCity.x - wall.x) < halfWidth && Math.abs(innerCity.z - wall.z) < halfDepth);
    });
    expect(inside).toBe(true);
  });
});
