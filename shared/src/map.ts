import { Team, WALL_SEGMENT_COUNT, WallState, WATER_SHORE_Z, WATER_WADE_DEPTH, WORLD_HALF_EXTENT } from "./constants";
import { TERRAIN_PROPS } from "./terrain-props";

export interface StaticBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly material: "stone" | "earth" | "wood";
}

/** Bridge rails are low enough to be physically walkable by the generic
 * MAX_STEP_UP rule, but they are barriers, not walkable ledges. */
export function isBridgeRailing(box: StaticBox): boolean {
  return box.id.includes("-railing-");
}

export interface SpawnZone {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export interface CapturePointDefinition {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface WallSegmentDefinition {
  readonly id: number;
  readonly box: StaticBox;
  readonly rubble: StaticBox;
}

export interface ArtilleryEmplacement {
  readonly id: number;
  readonly team: Team;
  readonly kind: "bombard" | "wall-gun";
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly yawArc: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}

export interface Waypoint {
  readonly x: number;
  readonly z: number;
  readonly team: Team;
}

export const OTTOMAN_SPAWN: SpawnZone = { x: 0, z: 92, yaw: Math.PI };
export const BYZANTINE_SPAWN: SpawnZone = { x: 0, z: -92, yaw: 0 };
export const CAPTURE_POINT = { x: 0, z: 0, radius: 8 };
export interface GalleyDock {
  readonly id: number;
  readonly team: Team;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

export const HARBOR_POINT_INDEX = 2;

/** Canonical clearances mirrored by the zero-import terrain prop generator. */
export const TERRAIN_ARTILLERY_STRIP_BOUNDS = { minZ: 30, maxZ: 120 } as const;
export const TERRAIN_WALL_LANE_BOUNDS = { halfX: 90, halfZ: 15 } as const;
export const INNER_CITY_BOUNDS = { halfX: 19, minZ: -86, maxZ: -50 } as const;

export const CAPTURE_POINTS: readonly CapturePointDefinition[] = [
  { id: "GATE", x: 0, z: 0, radius: 8 },
  { id: "BREACH_FIELD", x: 0, z: -32, radius: 9 },
  { id: "HARBOR_ROAD", x: 74, z: 42, radius: 9 },
  { id: "INNER_CITY", x: 0, z: -66, radius: 8 },
  { id: "HILL_FORT_NW", x: -470, z: -150, radius: 8 },
  { id: "HILL_FORT_NE", x: 470, z: -130, radius: 8 },
  { id: "HILL_FORT_S", x: -430, z: 150, radius: 8 },
];

export const WATER_ZONE = {
  shoreZ: WATER_SHORE_Z,
  wadeStartZ: WATER_SHORE_Z - WATER_WADE_DEPTH,
  minX: -WORLD_HALF_EXTENT,
  maxX: WORLD_HALF_EXTENT,
  maxZ: WORLD_HALF_EXTENT,
};

// ---------------------------------------------------------------------------
// River (Phase 8c-4b): a navigable channel from the Golden Horn (the sea band
// at z >= WATER_SHORE_Z) into the west interior, terminating in a headwater
// lake. Infantry cross at fords (wade, no drowning) or on bridge decks
// (walkable colliders); galleys navigate the channel itself. The channel is a
// polyline with a fixed half-width plus a circular headwater.
// ---------------------------------------------------------------------------

export interface RiverSegment {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
}

export const RIVER_HALF_WIDTH = 15;

export const RIVER_SEGMENTS: readonly RiverSegment[] = [
  { x1: -330, z1: 230, x2: -335, z2: 150 },
  { x1: -335, z1: 150, x2: -310, z2: 30 },
  { x1: -310, z1: 30, x2: -330, z2: -60 },
  { x1: -330, z1: -60, x2: -330, z2: -150 },
  { x1: -330, z1: -150, x2: -320, z2: -220 },
];

export const RIVER_HEADWATER = { x: -325, z: -230, radius: 30 };

/** Shallow ford sections: wade across, no drowning damage. */
export const RIVER_FORDS: readonly { x: number; z: number; radius: number }[] = [
  { x: -327, z: 110, radius: 16 },
  { x: -330, z: -95, radius: 16 },
];

/** Walkable bridge decks spanning the channel (WALL_SEGMENTS box convention). */
export const RIVER_BRIDGES: readonly StaticBox[] = [
  { id: "river-bridge-south", x: -327, z: 170, y: 0.6, width: 36, height: 1.2, depth: 8, material: "wood" },
  { id: "river-bridge-road", x: -319, z: 10, y: 0.6, width: 36, height: 1.2, depth: 8, material: "wood" },
  { id: "river-bridge-north", x: -330, z: -130, y: 0.6, width: 36, height: 1.2, depth: 8, material: "wood" },
];

/** Solid waist-high railings matching the visual bridge dressing. The old
 * decks were colliders but the ropes/posts were not, leaving a player able to
 * walk through the side and fall into the river. Ends stay open for access. */
export const RIVER_BRIDGE_RAILINGS: readonly StaticBox[] = RIVER_BRIDGES.flatMap((bridge) => [
  { id: `${bridge.id}-railing-north`, x: bridge.x, z: bridge.z - bridge.depth / 2 + 0.15, y: bridge.y + bridge.height / 2 + 0.5, width: bridge.width - 4, height: 1, depth: 0.3, material: "wood" as const },
  { id: `${bridge.id}-railing-south`, x: bridge.x, z: bridge.z + bridge.depth / 2 - 0.15, y: bridge.y + bridge.height / 2 + 0.5, width: bridge.width - 4, height: 1, depth: 0.3, material: "wood" as const },
]);

/**
 * Walkable piers from the dry shore out to each galley mooring (Phase 8c-4b).
 * The 8c-3 dock dressing was visual-only, so the only way to reach a docked
 * galley was swimming through the drowning zone; these boxes give boarding a
 * dry path and are exempt from drowning (onDeck).
 */
export const DOCK_PIERS: readonly StaticBox[] = [
  { id: "dock-pier-0", x: -284, z: 236, y: 0.6, width: 6, height: 1.2, depth: 16, material: "wood" },
  { id: "dock-pier-1", x: -252, z: 237, y: 0.6, width: 6, height: 1.2, depth: 20, material: "wood" },
  { id: "dock-pier-2", x: 284, z: 236, y: 0.6, width: 6, height: 1.2, depth: 16, material: "wood" },
  { id: "dock-pier-3", x: 252, z: 237, y: 0.6, width: 6, height: 1.2, depth: 20, material: "wood" },
];

/** Distance from a point to the river centerline (ignores the headwater). */
export function riverCenterlineDistance(x: number, z: number): number {
  let nearest = Infinity;
  for (const segment of RIVER_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dz = segment.z2 - segment.z1;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - segment.x1) * dx + (z - segment.z1) * dz) / (lengthSquared || 1)));
    const cx = segment.x1 + dx * t;
    const cz = segment.z1 + dz * t;
    nearest = Math.min(nearest, Math.hypot(x - cx, z - cz));
  }
  return nearest;
}

/** True inside the river channel (including the headwater lake). */
export function inRiver(x: number, z: number): boolean {
  if (riverCenterlineDistance(x, z) <= RIVER_HALF_WIDTH) return true;
  return Math.hypot(x - RIVER_HEADWATER.x, z - RIVER_HEADWATER.z) <= RIVER_HEADWATER.radius;
}

/** True inside a shallow ford section of the river. */
export function inRiverFord(x: number, z: number): boolean {
  if (!inRiver(x, z)) return false;
  for (const ford of RIVER_FORDS) {
    if (Math.hypot(x - ford.x, z - ford.z) <= ford.radius) return true;
  }
  return false;
}

/** True inside any bridge deck or dock pier footprint (feet stay dry). */
export function onDeck(x: number, z: number, radius = 0): boolean {
  for (const deck of RIVER_BRIDGES) {
    if (Math.abs(x - deck.x) <= deck.width / 2 + radius && Math.abs(z - deck.z) <= deck.depth / 2 + radius) return true;
  }
  for (const pier of DOCK_PIERS) {
    if (Math.abs(x - pier.x) <= pier.width / 2 + radius && Math.abs(z - pier.z) <= pier.depth / 2 + radius) return true;
  }
  return false;
}

/** Shallow water: the coastal wade band or a river ford (slow, no drowning). */
export function inShallowWater(x: number, z: number): boolean {
  if (z > WATER_SHORE_Z - WATER_WADE_DEPTH && z <= WATER_SHORE_Z) return true;
  return inRiverFord(x, z);
}

/** Deep water: past the shore, or in the river away from fords. */
export function inDeepWater(x: number, z: number): boolean {
  if (z > WATER_SHORE_Z) return true;
  return inRiver(x, z) && !inRiverFord(x, z);
}

export const GALLEY_DOCKS: readonly GalleyDock[] = [
  { id: 0, team: Team.Ottoman, x: -284, z: 242, yaw: 0 },
  { id: 1, team: Team.Ottoman, x: -252, z: 246, yaw: 0.12 },
  { id: 2, team: Team.Byzantine, x: 284, z: 242, yaw: Math.PI },
  { id: 3, team: Team.Byzantine, x: 252, z: 246, yaw: Math.PI - 0.12 },
];

export const WALL_SEGMENTS: readonly WallSegmentDefinition[] = Array.from({ length: WALL_SEGMENT_COUNT }, (_, id) => {
  const x = -66 + id * 12;
  return {
    id,
    box: { id: `wall-segment-${id}`, x, y: 4, z: 0, width: 11.5, height: 8, depth: 3, material: "stone" },
    rubble: { id: `rubble-segment-${id}`, x, y: 0.65, z: -0.5, width: 11.5, height: 1.3, depth: 7, material: "stone" },
  };
});

export const ARTILLERY_EMPLACEMENTS: readonly ArtilleryEmplacement[] = [
  // Phase 8e-4b (ADR 0032 residual): the guns sat at yaw 0, so their muzzle
  // vector (-sin yaw, -cos yaw) pointed -Z — into Byzantine territory — while
  // the Ottoman attack comes from +Z. yaw = Math.PI faces each gun across the
  // wall line at the attacker approach, matching the server's muzzle velocity
  // (world.ts updateArtillery) and the client's rendered rotation.
  { id: 0, team: Team.Byzantine, kind: "wall-gun", x: -38, z: -7, yaw: Math.PI, yawArc: 1.15, minPitch: -0.1, maxPitch: 0.88 },
  { id: 1, team: Team.Byzantine, kind: "wall-gun", x: 0, z: -7, yaw: Math.PI, yawArc: 1.25, minPitch: -0.1, maxPitch: 0.88 },
  { id: 2, team: Team.Byzantine, kind: "wall-gun", x: 38, z: -7, yaw: Math.PI, yawArc: 1.15, minPitch: -0.1, maxPitch: 0.88 },
];

/** Generated siege props with a small, deterministic gameplay footprint. */
export const SIEGE_LADDERS: readonly { id: string; x: number; z: number; yaw: number; radius: number; crossingDepth: number }[] = [
  { id: "west-siege-ladder", x: -54, z: 2.8, yaw: Math.PI + 0.08, radius: 5.2, crossingDepth: 4.8 },
];

/** Mantlets are low, solid cover; the model and this box share the same anchor. */
export const SIEGE_MANTLETS: readonly { id: string; x: number; z: number; yaw: number; width: number; height: number; depth: number }[] = [
  { id: "west-siege-mantlet", x: -42, z: 28, yaw: 0.18, width: 4.4, height: 2.2, depth: 1.4 },
];

// Ottoman siege-cannon spawn/respawn points (siege-loop phase): the cannons
// start here and are pushed toward the wall at z = 0. Replaces the four fixed
// bombard emplacements removed above.
export const CANNON_STAGING: readonly { x: number; z: number; yaw: number }[] = [
  { x: -24, z: 84, yaw: Math.PI },
  { x: -8, z: 84, yaw: Math.PI },
  { x: 8, z: 84, yaw: Math.PI },
  { x: 24, z: 84, yaw: Math.PI },
];

export const BOT_WAYPOINTS: readonly Waypoint[] = [
  // Keep patrol anchors off the curtain itself. The old central z=0 anchor
  // made every defender route to one wall face during a calm walk test.
  { x: 0, z: 72, team: Team.Ottoman }, { x: -28, z: 28, team: Team.Ottoman }, { x: 24, z: 30, team: Team.Ottoman }, { x: 74, z: 42, team: Team.Ottoman },
  { x: 0, z: -72, team: Team.Byzantine }, { x: 28, z: -28, team: Team.Byzantine }, { x: -24, z: -30, team: Team.Byzantine }, { x: 74, z: 42, team: Team.Byzantine },
  { x: -284, z: 232, team: Team.Ottoman }, { x: 284, z: 232, team: Team.Byzantine },
  // Phase 8c-4 objectives: both teams contest every capture point.
  { x: 0, z: -66, team: Team.Ottoman }, { x: -470, z: -150, team: Team.Ottoman }, { x: 470, z: -130, team: Team.Ottoman }, { x: -430, z: 150, team: Team.Ottoman },
  { x: 0, z: -66, team: Team.Byzantine }, { x: -470, z: -150, team: Team.Byzantine }, { x: 470, z: -130, team: Team.Byzantine }, { x: -430, z: 150, team: Team.Byzantine },
];

export function wallStateFromPacked(packed: number, segmentId: number): WallState {
  return ((packed >>> (segmentId * 2)) & 0x3) as WallState;
}

export function isWallBoxSolid(box: StaticBox, wallStates: Uint8Array | undefined): boolean {
  if (box.id.startsWith("wall-segment-")) {
    const segmentId = Number.parseInt(box.id.slice("wall-segment-".length), 10);
    return wallStates?.[segmentId] !== WallState.Breached;
  }
  if (box.id.startsWith("rubble-segment-")) {
    const segmentId = Number.parseInt(box.id.slice("rubble-segment-".length), 10);
    return wallStates?.[segmentId] === WallState.Breached;
  }
  return true;
}

const stairBoxes = (prefix: string, startX: number, direction: number): StaticBox[] => Array.from(
  { length: 7 },
  (_, index) => ({
    id: `${prefix}-${index}`,
    x: startX + direction * index * 2.1,
    y: (index + 1) * 0.45 / 2,
    z: 0,
    width: 2.4,
    height: (index + 1) * 0.45,
    depth: 8,
    material: "stone" as const,
  }),
);

// Inner-city CQB district behind the main gate (Phase 8c-4). Reuses the
// wall-box collider convention (no new collider shape): solid 4 m boxes
// (above MAX_STEP_UP, so they block) forming three ~8 m streets, a gate gap
// in the south wall (x ∈ [-6,6] at z = -52) and cross-street gaps (z ∈
// [-71,-65]) in the two interior dividers. The INNER_CITY capture point sits
// at the central intersection (0, -66).
const cityWall = (id: string, x: number, z: number, width: number, depth: number): StaticBox => ({
  id,
  x,
  y: 4 / 2,
  z,
  width,
  height: 4,
  depth,
  material: "stone" as const,
});

const CITY_WALLS: readonly StaticBox[] = [
  cityWall("city-wall-west", -17, -68, 4, 32),
  cityWall("city-wall-east", 17, -68, 4, 32),
  cityWall("city-wall-north", 0, -84, 38, 4),
  cityWall("city-wall-south-west", -12, -52, 12, 4),
  cityWall("city-wall-south-east", 12, -52, 12, 4),
  cityWall("city-wall-west-divider-north", -5.5, -77.5, 3, 13),
  cityWall("city-wall-west-divider-south", -5.5, -58.5, 3, 13),
  cityWall("city-wall-east-divider-north", 5.5, -77.5, 3, 13),
  cityWall("city-wall-east-divider-south", 5.5, -58.5, 3, 13),
];

export const SIEGE_BLOCKOUT: readonly StaticBox[] = [
  ...WALL_SEGMENTS.map((segment) => segment.box),
  ...WALL_SEGMENTS.map((segment) => segment.rubble),
  ...CITY_WALLS,
  ...TERRAIN_PROPS.map((prop) => prop.collider),
  ...RIVER_BRIDGES,
  ...RIVER_BRIDGE_RAILINGS,
  ...DOCK_PIERS,
  ...SIEGE_MANTLETS.map((mantlet) => ({
    id: mantlet.id,
    x: mantlet.x,
    y: mantlet.height / 2,
    z: mantlet.z,
    width: mantlet.width,
    height: mantlet.height,
    depth: mantlet.depth,
    material: "wood" as const,
  })),
  { id: "defender-platform", x: 0, y: 1, z: -24, width: 54, height: 2, depth: 20, material: "earth" },
  { id: "attacker-cover-a", x: -26, y: 1.5, z: 31, width: 8, height: 3, depth: 4, material: "wood" },
  { id: "attacker-cover-b", x: 25, y: 1.5, z: 44, width: 7, height: 3, depth: 5, material: "wood" },
  { id: "defender-cover-a", x: -25, y: 1.5, z: -42, width: 8, height: 3, depth: 4, material: "wood" },
  { id: "defender-cover-b", x: 25, y: 1.5, z: -50, width: 7, height: 3, depth: 5, material: "wood" },
  ...stairBoxes("west-stair", -57, 1),
  ...stairBoxes("east-stair", 57, -1),
];
