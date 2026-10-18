import { describe, expect, it } from "vitest";
import { TERRAIN_PROP_WORLD_MARGIN, WORLD_HALF_EXTENT } from "../src/constants";
import {
  BYZANTINE_SPAWN,
  CAPTURE_POINTS,
  DOCK_PIERS,
  INNER_CITY_BOUNDS,
  OTTOMAN_SPAWN,
  RIVER_BRIDGES,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  TERRAIN_ARTILLERY_STRIP_BOUNDS,
  TERRAIN_WALL_LANE_BOUNDS,
} from "../src/map";
import { MIRRORED_WORLD_FACTS } from "../src/terrain-props";

describe("zero-import terrain world mirrors", () => {
  it("deep-equals every canonical map fact in one readable diff", () => {
    const position = ({ x, z }: { readonly x: number; readonly z: number }): { x: number; z: number } => ({ x, z });
    const deck = ({ x, z, width, depth }: { readonly x: number; readonly z: number; readonly width: number; readonly depth: number }): { x: number; z: number; width: number; depth: number } => ({ x, z, width, depth });

    expect(MIRRORED_WORLD_FACTS).toEqual({
      capturePointCount: CAPTURE_POINTS.length,
      capturePoints: CAPTURE_POINTS.map(position),
      spawns: [OTTOMAN_SPAWN, BYZANTINE_SPAWN].map(position),
      riverSegments: RIVER_SEGMENTS,
      riverHalfWidth: RIVER_HALF_WIDTH,
      riverHeadwater: RIVER_HEADWATER,
      decks: [...RIVER_BRIDGES, ...DOCK_PIERS].map(deck),
      cityBounds: INNER_CITY_BOUNDS,
      artilleryStrip: TERRAIN_ARTILLERY_STRIP_BOUNDS,
      wallLane: TERRAIN_WALL_LANE_BOUNDS,
      worldLimit: WORLD_HALF_EXTENT - TERRAIN_PROP_WORLD_MARGIN,
    });
  });
});
