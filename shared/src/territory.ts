import { Team, WORLD_HALF_EXTENT } from "./constants";
import { CAPTURE_POINTS } from "./map";

/**
 * Territory-control zone math (Phase 8c-4, design doc section 4): the map is
 * partitioned into a coarse grid of zones, each zone's owner = the current
 * owner of its nearest capture point (Voronoi-by-nearest-objective). This is
 * pure client-side math over data both sides already agree on (capture point
 * positions are static and owners are already replicated in every snapshot),
 * so no protocol change is needed for minimap coloring or the map-control
 * gauge. All functions are pure and deterministic — 8c-5 renders from these.
 */

/** Zone grid resolution: an 18×18 grid over the 1800×1800 world (100 m cells). */
export const ZONE_GRID_CELLS = 18;

export const ZONE_GRID_CELL_SIZE = (WORLD_HALF_EXTENT * 2) / ZONE_GRID_CELLS;

export interface ZoneCell {
  readonly cellX: number;
  readonly cellZ: number;
}

/** Grid cell containing a world position, clamped to the grid. */
export function zoneCellForPosition(x: number, z: number): ZoneCell {
  const half = WORLD_HALF_EXTENT;
  const cellX = Math.min(ZONE_GRID_CELLS - 1, Math.max(0, Math.floor((x + half) / ZONE_GRID_CELL_SIZE)));
  const cellZ = Math.min(ZONE_GRID_CELLS - 1, Math.max(0, Math.floor((z + half) / ZONE_GRID_CELL_SIZE)));
  return { cellX, cellZ };
}

/** Index into CAPTURE_POINTS of the point nearest to a world position. */
export function nearestCapturePointIndex(x: number, z: number): number {
  let best = 0;
  let bestDistanceSquared = Infinity;
  for (let index = 0; index < CAPTURE_POINTS.length; index += 1) {
    const point = CAPTURE_POINTS[index];
    if (point === undefined) continue;
    const dx = x - point.x;
    const dz = z - point.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < bestDistanceSquared) {
      best = index;
      bestDistanceSquared = distanceSquared;
    }
  }
  return best;
}

/**
 * Owner of the zone containing a world position: the current owner of the
 * nearest capture point, where `owners` maps CAPTURE_POINTS indices to teams
 * (exactly what snapshot meta already carries).
 */
export function zoneOwnerForPosition(x: number, z: number, owners: readonly Team[]): Team {
  return owners[nearestCapturePointIndex(x, z)] ?? Team.None;
}

/** Per-team capture point counts for the map-control gauge (0-1 proportions). */
export function teamPointCounts(owners: readonly Team[]): { ottoman: number; byzantine: number; neutral: number } {
  let ottoman = 0;
  let byzantine = 0;
  let neutral = 0;
  for (const owner of owners) {
    if (owner === Team.Ottoman) ottoman += 1;
    else if (owner === Team.Byzantine) byzantine += 1;
    else neutral += 1;
  }
  return { ottoman, byzantine, neutral };
}
