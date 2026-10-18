import {
  BOT_WAYPOINTS,
  GALLEY_DOCKS,
  INNER_CITY_BOUNDS,
  SIEGE_BLOCKOUT,
  WALL_SEGMENTS,
  inDeepWater,
  isBridgeRailing,
  isWallBoxSolid,
  onDeck,
} from "./map";
import {
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  InputButton,
  MAX_STEP_UP,
  PlayerClass,
  PlayerFlag,
  Team,
  WallState,
} from "./constants";
import type { EntityState } from "./protocol";

export interface BotDecision {
  readonly buttons: number;
  readonly yaw: number;
  readonly pitch: number;
}

/**
 * Phase 8e-19 Task 1: dev playtest-control modes, driven by the admin panel's
 * /dev/bots endpoints. "battle" is the shipped default; "standing" parks bots
 * (no steering, no firing — a quiet battlefield for movement feel work);
 * "walking" patrols waypoints without combat (steady foot traffic for carry /
 * footstep / terrain passes). Module-level state so the server admin endpoint
 * controls every brain (and the load harness) at once.
 */
export type BotBehaviorMode = "battle" | "standing" | "walking";

let botBehaviorMode: BotBehaviorMode = "battle";
let botCombatFrozen = false;

export function setBotBehaviorMode(mode: BotBehaviorMode): void {
  botBehaviorMode = mode;
}
export function getBotBehaviorMode(): BotBehaviorMode {
  return botBehaviorMode;
}
/** Combat freeze: bots never fire (or melee) until unfrozen. */
export function setBotCombatFrozen(frozen: boolean): void {
  botCombatFrozen = frozen;
}
export function isBotCombatFrozen(): boolean {
  return botCombatFrozen;
}
/** Test-only: return both switches to the shipped defaults. */
export function resetBotControl(): void {
  botBehaviorMode = "battle";
  botCombatFrozen = false;
}

interface MutableBotDecision {
  buttons: number;
  yaw: number;
  pitch: number;
}

const BOT_WHISKER_LENGTH = 6;
const BOT_WHISKER_ANGLE = Math.PI / 6;
const BOT_WHISKER_COS = Math.cos(BOT_WHISKER_ANGLE);
const BOT_WHISKER_SIN = Math.sin(BOT_WHISKER_ANGLE);
const BOT_REACTION_COHORTS = 8;
const BOT_REACTION_STAGGER_MS = 50;
// Phase 8e-2 Task 3: per-bot fire rhythm so a crowd stops firing as one clap.
// A stable per-bot offset widens each bot's personal reaction window, and a
// short random hold-off delays only the FIRST shot after a target is
// acquired — volleys arrive as a rolling crackle. Aim, cadence math, and
// DPS over time are untouched; this is timing texture.
const BOT_REACTION_OFFSET_SPAN_MS = 160;
const BOT_FIRE_HOLDOFF_MIN_MS = 120;
const BOT_FIRE_HOLDOFF_SPAN_MS = 480;
const OUTER_WALL_APPROACH_Z = 5;
const OUTER_WALL_EXIT_Z = 6;
const INNER_CITY_FREE_HALF_X = INNER_CITY_BOUNDS.halfX - 4;
const INNER_CITY_FREE_MIN_Z = INNER_CITY_BOUNDS.minZ + 4;
const INNER_CITY_FREE_MAX_Z = INNER_CITY_BOUNDS.maxZ - 4;
// The outer corner link also clears defender-cover-b at (25,-50), whose
// expanded footprint reaches x=28.9. Keeping this explicit avoids a local
// minimum between the cover and the district's east wall.
const INNER_CITY_ROUTE_X = INNER_CITY_BOUNDS.halfX + 12;
const INNER_CITY_GATE_SOUTH_Z = INNER_CITY_BOUNDS.maxZ + 4;
const INNER_CITY_GATE_NORTH_Z = INNER_CITY_BOUNDS.maxZ - 8;
const FIRST_WALL = WALL_SEGMENTS[0];
const LAST_WALL = WALL_SEGMENTS[WALL_SEGMENTS.length - 1];
const OUTER_WALL_ROUTE_X = Math.max(
  Math.abs((FIRST_WALL?.box.x ?? -66) - (FIRST_WALL?.box.width ?? 11.5) / 2),
  Math.abs((LAST_WALL?.box.x ?? 66) + (LAST_WALL?.box.width ?? 11.5) / 2),
) + CAPSULE_RADIUS + 2;

const OTTOMAN_WAYPOINTS = BOT_WAYPOINTS.filter((waypoint) => waypoint.team === Team.Ottoman);
const BYZANTINE_WAYPOINTS = BOT_WAYPOINTS.filter((waypoint) => waypoint.team === Team.Byzantine);
const OTTOMAN_FALLBACK_WAYPOINT = { x: 0, z: 30 } as const;
const BYZANTINE_FALLBACK_WAYPOINT = { x: 0, z: -30 } as const;

// Wander targets scatter around the waypoint by this many metres on each axis.
const BOT_WAYPOINT_SCATTER_M = 16;
// Stable lane offsets keep a shared patrol anchor from becoming a single
// destination while preserving the same objective coverage.
const BOT_WAYPOINT_LANE_X_M = 2.5;
const BOT_WAYPOINT_LANE_Z_M = 1.5;
// Phase 8e-25 (reality pass): anti-stuck escape. The whisker slide follows
// blocking faces, but a concave wedge (e.g. the inner-city dividers) can pin
// a bot forever — it holds Forward into the same box pair and the 25-45 s
// waypoint re-roll may not change the bearing. The brain therefore checks
// real progress every BOT_STUCK_CHECK_MS; a wanderer that moved less than
// BOT_STUCK_MIN_PROGRESS_M while its target was far away is wedged and gets
// an immediate forced waypoint change, up to BOT_STUCK_MAX_ESCAPES in a row
// (a bot that is genuinely progressing resets the counter).
const BOT_STUCK_CHECK_MS = 1_500;
const BOT_STUCK_MIN_PROGRESS_M = 0.4;
const BOT_STUCK_MAX_ESCAPES = 3;
// Phase 8e-16 Task 3 (water hazards): how many times a wet scatter re-rolls
// before falling back to the waypoint itself, and the compass probe used when
// a bot is already standing in deep water with no dry target in sight.
const BOT_WATER_RESCATTER_ATTEMPTS = 3;
const BOT_WATER_PROBE_DISTANCE_M = 12;
const BOT_WATER_PROBE_DIRECTIONS = 8;
// Phase 8e-16 (sailor boarding): a shore sailor heading for its galley first
// walks to this z at the galley's x — the pier-root line. z 229 is inside the
// wade band (no drain) and on every pier's deck footprint (piers start at
// z 227–228), so the approach never enters deep water; once onDeck the bot
// heads straight down the pier to the ship.
const GALLEY_BOARD_APPROACH_Z = 229;

/**
 * Drowning water, using the exact predicate the server's drain applies
 * (world.ts applyWaterDrain): deep AND not standing on a pier/bridge deck.
 * The galley-dock waypoints sit ON pier decks — dry by this test even though
 * their z is past the shoreline.
 */
export function waterHazard(x: number, z: number): boolean {
  return inDeepWater(x, z) && !onDeck(x, z);
}

export interface SteerTarget {
  x: number;
  z: number;
}

/**
 * Phase 8e-16 Task 3: keep bots out of drowning water. The ±8 m waypoint
 * scatter around the galley-dock waypoints (x ±284, z 232) lands in the
 * Golden Horn ~40% of the time; a field bot that parked on a wet target just
 * stood there draining 3 hp/s until the kill feed logged another drowning —
 * then respawned and could pick the same waypoint again. The guard rewrites
 * only the steer target (fire/melee logic is untouched):
 *
 * - wet waypoint scatter → re-roll up to 3 times, then the bare waypoint
 *   (dock waypoints are pier decks — always dry), then hold position;
 * - wet chase target (enemy in the water) → hold at the waterline and keep
 *   shooting; the sea fight is not worth drowning for;
 * - a bot ALREADY wet with no dry target (pushed in, legacy scatter) →
 *   compass-probe 8 headings at 12 m for dry land and walk out.
 *
 * Allocation-free: the caller owns `out` (one scratch per brain).
 */
export function drySteerTarget(
  selfX: number,
  selfZ: number,
  targetX: number,
  targetZ: number,
  waypointX: number,
  waypointZ: number,
  chasing: boolean,
  random: () => number,
  out: SteerTarget,
): void {
  out.x = targetX;
  out.z = targetZ;
  if (waterHazard(out.x, out.z)) {
    if (chasing) {
      out.x = selfX;
      out.z = selfZ;
    } else {
      for (let attempt = 0; attempt < BOT_WATER_RESCATTER_ATTEMPTS && waterHazard(out.x, out.z); attempt += 1) {
        out.x = waypointX + (random() - 0.5) * BOT_WAYPOINT_SCATTER_M;
        out.z = waypointZ + (random() - 0.5) * BOT_WAYPOINT_SCATTER_M;
      }
      if (waterHazard(out.x, out.z)) {
        out.x = waypointX;
        out.z = waypointZ;
      }
      if (waterHazard(out.x, out.z)) {
        out.x = selfX;
        out.z = selfZ;
      }
    }
  }
  if (waterHazard(selfX, selfZ) && waterHazard(out.x, out.z)) {
    for (let direction = 0; direction < BOT_WATER_PROBE_DIRECTIONS; direction += 1) {
      const angle = (direction / BOT_WATER_PROBE_DIRECTIONS) * Math.PI * 2;
      const probeX = selfX + Math.sin(angle) * BOT_WATER_PROBE_DISTANCE_M;
      const probeZ = selfZ + Math.cos(angle) * BOT_WATER_PROBE_DISTANCE_M;
      if (!waterHazard(probeX, probeZ)) {
        out.x = probeX;
        out.z = probeZ;
        return;
      }
    }
  }
}

/**
 * Allocation-free local steering for filler bots. It deliberately uses the
 * authoritative static box list instead of a second navigation geometry:
 * coarse portal links handle the two concave wall systems, then three short
 * AABB whiskers provide local avoidance and face-tangent wall sliding.
 */
export class BotNavigator {
  readonly #turnBias: number;
  #routeTargetX = 0;
  #routeTargetZ = 0;
  #hitNormalX = 0;
  #hitNormalZ = 0;
  #outerRouteSide = 0;
  #outerPortalX = 0;

  constructor(stableIndex: number) {
    this.#turnBias = (stableIndex & 1) === 0 ? -1 : 1;
  }

  steer(
    x: number,
    y: number,
    z: number,
    targetX: number,
    targetZ: number,
    wallStates?: Uint8Array,
  ): number {
    this.#routeTargetX = targetX;
    this.#routeTargetZ = targetZ;
    this.#routeAroundOuterWall(x, z, targetX, targetZ, wallStates);
    if (this.#routeTargetX === targetX && this.#routeTargetZ === targetZ) {
      this.#routeAroundInnerCity(x, z, targetX, targetZ);
    }

    let directionX = this.#routeTargetX - x;
    let directionZ = this.#routeTargetZ - z;
    const distance = Math.hypot(directionX, directionZ);
    if (distance < 0.001) return 0;
    directionX /= distance;
    directionZ /= distance;

    const leftX = directionX * BOT_WHISKER_COS + directionZ * BOT_WHISKER_SIN;
    const leftZ = -directionX * BOT_WHISKER_SIN + directionZ * BOT_WHISKER_COS;
    const rightX = directionX * BOT_WHISKER_COS - directionZ * BOT_WHISKER_SIN;
    const rightZ = directionX * BOT_WHISKER_SIN + directionZ * BOT_WHISKER_COS;
    const centerClearance = this.#probe(x, y, z, directionX, directionZ, wallStates, true);
    const leftClearance = this.#probe(x, y, z, leftX, leftZ, wallStates, false);
    const rightClearance = this.#probe(x, y, z, rightX, rightZ, wallStates, false);

    let steerX = directionX;
    let steerZ = directionZ;
    if (centerClearance < BOT_WHISKER_LENGTH) {
      // Project the seek direction onto the blocking face. At a head-on hit
      // the projection is zero, so a stable per-bot bias chooses one tangent
      // instead of letting a crowd oscillate left/right every reaction.
      const intoFace = directionX * this.#hitNormalX + directionZ * this.#hitNormalZ;
      steerX = directionX - this.#hitNormalX * intoFace;
      steerZ = directionZ - this.#hitNormalZ * intoFace;
      const projectedLength = Math.hypot(steerX, steerZ);
      if (projectedLength > 0.05) {
        steerX /= projectedLength;
        steerZ /= projectedLength;
      } else {
        const preferLeft = leftClearance > rightClearance + 0.05
          || (Math.abs(leftClearance - rightClearance) <= 0.05 && this.#turnBias < 0);
        const tangentX = -this.#hitNormalZ;
        const tangentZ = this.#hitNormalX;
        const tangentSign = preferLeft
          ? (tangentX * leftX + tangentZ * leftZ >= 0 ? 1 : -1)
          : (tangentX * rightX + tangentZ * rightZ >= 0 ? 1 : -1);
        steerX = tangentX * tangentSign;
        steerZ = tangentZ * tangentSign;
      }

      const clearX = leftClearance > rightClearance ? leftX : rightX;
      const clearZ = leftClearance > rightClearance ? leftZ : rightZ;
      steerX = steerX * 0.8 + clearX * 0.2;
      steerZ = steerZ * 0.8 + clearZ * 0.2;
    } else if (Math.min(leftClearance, rightClearance) < 2.2) {
      // Anticipate a corner without abandoning the desired route.
      const clearX = leftClearance > rightClearance ? leftX : rightX;
      const clearZ = leftClearance > rightClearance ? leftZ : rightZ;
      steerX = directionX * 0.75 + clearX * 0.25;
      steerZ = directionZ * 0.75 + clearZ * 0.25;
    }
    return Math.atan2(-steerX, -steerZ);
  }

  #routeAroundOuterWall(
    x: number,
    z: number,
    targetX: number,
    targetZ: number,
    wallStates?: Uint8Array,
  ): void {
    let side = this.#outerRouteSide;
    if (side !== 0) {
      if (targetZ * side >= -OUTER_WALL_EXIT_Z) {
        this.#outerRouteSide = 0;
        side = 0;
      } else if (z * side <= -OUTER_WALL_EXIT_Z) {
        this.#outerRouteSide = 0;
        return;
      }
    }
    if (side === 0) {
      side = z >= 0 ? 1 : -1;
      if ((side > 0 && targetZ >= -OUTER_WALL_EXIT_Z) || (side < 0 && targetZ <= OUTER_WALL_EXIT_Z)) return;
      this.#outerRouteSide = side;
    }

    // Re-evaluate the twelve authoritative segment states on each reaction.
    // This lets an in-flight bot switch to a newly opened breach immediately,
    // and also restores the wall-end fallback after a round reset.
    let portalX = 0;
    let portalFound = false;
    let portalScore = Infinity;
    if (wallStates !== undefined) {
      for (let segmentIndex = 0; segmentIndex < WALL_SEGMENTS.length; segmentIndex += 1) {
        const segment = WALL_SEGMENTS[segmentIndex];
        if (segment === undefined) continue;
        if (wallStates[segment.id] !== WallState.Breached) continue;
        const score = Math.abs(x - segment.box.x) + Math.abs(targetX - segment.box.x) * 0.35;
        if (score < portalScore) {
          portalX = segment.box.x;
          portalScore = score;
          portalFound = true;
        }
      }
    }
    if (!portalFound) {
      const leftScore = Math.abs(x + OUTER_WALL_ROUTE_X) + Math.abs(targetX + OUTER_WALL_ROUTE_X) * 0.35;
      const rightScore = Math.abs(x - OUTER_WALL_ROUTE_X) + Math.abs(targetX - OUTER_WALL_ROUTE_X) * 0.35;
      portalX = leftScore < rightScore ? -OUTER_WALL_ROUTE_X : OUTER_WALL_ROUTE_X;
    }
    this.#outerPortalX = portalX;

    const approachZ = side * OUTER_WALL_APPROACH_Z;
    if (Math.abs(x - this.#outerPortalX) > 2 || z * side > OUTER_WALL_APPROACH_Z + 2) {
      this.#routeTargetX = this.#outerPortalX;
      this.#routeTargetZ = approachZ;
      return;
    }
    this.#routeTargetX = this.#outerPortalX;
    this.#routeTargetZ = -side * OUTER_WALL_EXIT_Z;
  }

  #routeAroundInnerCity(x: number, z: number, targetX: number, targetZ: number): void {
    const selfInside = Math.abs(x) < INNER_CITY_FREE_HALF_X
      && z > INNER_CITY_FREE_MIN_Z
      && z < INNER_CITY_FREE_MAX_Z;
    const targetInside = Math.abs(targetX) < INNER_CITY_FREE_HALF_X
      && targetZ > INNER_CITY_FREE_MIN_Z
      && targetZ < INNER_CITY_FREE_MAX_Z;
    if (selfInside === targetInside) return;

    if (targetInside) {
      if (Math.abs(x) <= 2 && z > INNER_CITY_GATE_NORTH_Z && z <= INNER_CITY_GATE_SOUTH_Z) {
        this.#routeTargetX = 0;
        this.#routeTargetZ = INNER_CITY_GATE_NORTH_Z;
      } else if (z < INNER_CITY_GATE_SOUTH_Z) {
        const side = x === 0 ? this.#turnBias : Math.sign(x);
        if (Math.abs(x) < INNER_CITY_ROUTE_X - 1) {
          this.#routeTargetX = side * INNER_CITY_ROUTE_X;
          this.#routeTargetZ = z;
        } else {
          this.#routeTargetX = side * INNER_CITY_ROUTE_X;
          this.#routeTargetZ = INNER_CITY_GATE_SOUTH_Z;
        }
      } else if (Math.abs(x) > 2) {
        this.#routeTargetX = 0;
        this.#routeTargetZ = INNER_CITY_GATE_SOUTH_Z;
      } else {
        this.#routeTargetX = 0;
        this.#routeTargetZ = INNER_CITY_GATE_NORTH_Z;
      }
      return;
    }

    // Leaving the district also uses its only opening; otherwise a chase
    // target outside the city makes a bot press into the nearest solid wall.
    if (z < INNER_CITY_GATE_NORTH_Z || Math.abs(x) > 2) {
      this.#routeTargetX = 0;
      this.#routeTargetZ = INNER_CITY_GATE_NORTH_Z;
    } else {
      this.#routeTargetX = 0;
      this.#routeTargetZ = INNER_CITY_GATE_SOUTH_Z;
    }
  }

  #probe(
    x: number,
    y: number,
    z: number,
    directionX: number,
    directionZ: number,
    wallStates: Uint8Array | undefined,
    retainNormal: boolean,
  ): number {
    let nearest = BOT_WHISKER_LENGTH;
    let nearestNormalX = 0;
    let nearestNormalZ = 0;
    const feet = y - CAPSULE_HEIGHT / 2;
    for (let boxIndex = 0; boxIndex < SIEGE_BLOCKOUT.length; boxIndex += 1) {
      const box = SIEGE_BLOCKOUT[boxIndex];
      if (box === undefined) continue;
      if (!isWallBoxSolid(box, wallStates)) continue;
      const top = box.y + box.height / 2;
      if (!isBridgeRailing(box) && top <= feet + MAX_STEP_UP + 0.001) continue;
      const halfWidth = box.width / 2 + CAPSULE_RADIUS;
      const halfDepth = box.depth / 2 + CAPSULE_RADIUS;
      if (Math.abs(box.x - x) > halfWidth + BOT_WHISKER_LENGTH
        || Math.abs(box.z - z) > halfDepth + BOT_WHISKER_LENGTH) continue;

      const minX = box.x - halfWidth;
      const maxX = box.x + halfWidth;
      const minZ = box.z - halfDepth;
      const maxZ = box.z + halfDepth;
      let start = 0;
      let end = BOT_WHISKER_LENGTH;
      let normalX = 0;
      let normalZ = 0;
      if (Math.abs(directionX) < 0.000001) {
        if (x < minX || x > maxX) continue;
      } else {
        const inverseX = 1 / directionX;
        const firstX = (minX - x) * inverseX;
        const secondX = (maxX - x) * inverseX;
        const enterX = Math.min(firstX, secondX);
        if (enterX > start) {
          start = enterX;
          normalX = directionX > 0 ? -1 : 1;
          normalZ = 0;
        }
        end = Math.min(end, Math.max(firstX, secondX));
      }
      if (Math.abs(directionZ) < 0.000001) {
        if (z < minZ || z > maxZ) continue;
      } else {
        const inverseZ = 1 / directionZ;
        const firstZ = (minZ - z) * inverseZ;
        const secondZ = (maxZ - z) * inverseZ;
        const enterZ = Math.min(firstZ, secondZ);
        if (enterZ > start) {
          start = enterZ;
          normalX = 0;
          normalZ = directionZ > 0 ? -1 : 1;
        }
        end = Math.min(end, Math.max(firstZ, secondZ));
      }
      if (start > end || end < 0 || start > BOT_WHISKER_LENGTH) continue;
      const distance = Math.max(0, start);
      if (distance >= nearest) continue;
      nearest = distance;
      nearestNormalX = normalX;
      nearestNormalZ = normalZ;
    }
    if (retainNormal) {
      this.#hitNormalX = nearestNormalX;
      this.#hitNormalZ = nearestNormalZ;
    }
    return nearest;
  }
}

/**
 * Shared bot decision brain. Refactored from the load-harness bots in
 * tools/bot.ts so the identical input-generation logic can run either
 * externally (WebSocket loadtest bots) or in-process (server-side population
 * backfill controllers). The brain is perception-only: it consumes a snapshot
 * of entity states and emits button/yaw/pitch decisions; the host owns timing,
 * transport, and world mutation.
 */
export class BotBrain {
  readonly #sailor: boolean;
  readonly #playerClass: PlayerClass;
  readonly #team: Team;
  #yaw: number;
  #pitch = 0;
  #buttons: number = InputButton.Forward;
  #nextTurnAt: number;
  #nextReactionAt: number;
  #nextWaypointAt: number;
  readonly #reactionOffsetMs: number;
  #fireHoldOffUntil = 0;
  #targetInRange = false;
  // Ranged weapons now use server-side trigger edges. Bots therefore emit a
  // one-reaction Fire pulse per loaded round instead of holding Fire through
  // the reload, which would leave the authoritative edge latch closed.
  #fireArmed = true;
  readonly #waypoints: readonly { x: number; z: number }[];
  #waypoint: { x: number; z: number };
  readonly #waypointLaneX: number;
  readonly #waypointLaneZ: number;
  #aboardVehicle = -1;
  #atHelm = false;
  #gunnerStation = -1;
  readonly #navigator: BotNavigator;
  readonly #decision: MutableBotDecision = { buttons: InputButton.Forward, yaw: 0, pitch: 0 };
  // Scratch for drySteerTarget — one per brain, mutated in place (no
  // per-decision allocation).
  readonly #steerTarget: SteerTarget = { x: 0, z: 0 };
  // Phase 8e-25 anti-stuck progress tracking (see BOT_STUCK_* constants).
  #lastProgressX = 0;
  #lastProgressZ = 0;
  #progressCheckAt = 0;
  #stuckEscapes = 0;

  constructor(index: number, team: Team, playerClass: PlayerClass, now: number) {
    this.#team = team;
    this.#playerClass = playerClass;
    this.#navigator = new BotNavigator(index);
    this.#waypointLaneX = ((index % 7) - 3) * BOT_WAYPOINT_LANE_X_M;
    this.#waypointLaneZ = (((index * 3) % 5) - 2) * BOT_WAYPOINT_LANE_Z_M;
    const classRoll = index % 20;
    this.#sailor = classRoll === 0;
    this.#yaw = Math.random() * Math.PI * 2 - Math.PI;
    this.#nextTurnAt = now;
    // Steering probes are intentionally cohort-staggered so 150 fillers do
    // not all scan the static boxes on the same 20 Hz server tick.
    this.#nextReactionAt = now + (index % BOT_REACTION_COHORTS) * BOT_REACTION_STAGGER_MS;
    // Phase 8e-2 Task 3: a second, permanent per-bot rhythm offset (seeded
    // from the stable bot index) so fire re-decisions never re-phase into a
    // metronome after the cohort stagger washes out.
    this.#reactionOffsetMs = (index * 73) % BOT_REACTION_OFFSET_SPAN_MS;
    // Wander anchors are the team's capture-point waypoints (Phase 8c-4), so
    // bot traffic actually visits every objective — the hill forts and the
    // inner city — instead of clustering at the gate.
    const teamWaypoints = team === Team.Ottoman ? OTTOMAN_WAYPOINTS : BYZANTINE_WAYPOINTS;
    const fallback = team === Team.Ottoman ? OTTOMAN_FALLBACK_WAYPOINT : BYZANTINE_FALLBACK_WAYPOINT;
    this.#waypoints = teamWaypoints.length > 0 ? teamWaypoints : [fallback];
    const initial = this.#waypoints[Math.floor(Math.random() * this.#waypoints.length)];
    this.#waypoint = initial ?? { x: 0, z: 0 };
    this.#nextWaypointAt = now + 25_000 + Math.random() * 20_000;
  }

  get sailor(): boolean {
    return this.#sailor;
  }

  get team(): Team {
    return this.#team;
  }

  get playerClass(): PlayerClass {
    return this.#playerClass;
  }

  get buttons(): number {
    return this.#buttons;
  }

  /** Phase 8e-25: how many forced waypoint escapes the stuck detector has
   * fired since the last genuine progress (diagnostics + test hook). */
  get stuckEscapes(): number {
    return this.#stuckEscapes;
  }

  get yaw(): number {
    return this.#yaw;
  }

  onHelmClaimed(): void {
    this.#aboardVehicle = 0;
    this.#atHelm = true;
    this.#gunnerStation = -1;
  }

  onGunClaimed(station: 0 | 1): void {
    this.#aboardVehicle = 0;
    this.#atHelm = false;
    this.#gunnerStation = station;
  }

  onPassengerBoarded(): void {
    this.#aboardVehicle = 0;
    this.#atHelm = false;
    this.#gunnerStation = -1;
  }

  onStationReleased(): void {
    this.#aboardVehicle = -1;
    this.#atHelm = false;
    this.#gunnerStation = -1;
  }

  decide(entities: ReadonlyMap<number, EntityState>, selfId: number, now: number, wallStates?: Uint8Array): BotDecision {
    // Phase 8e-19 Task 1: playtest-control modes gate the whole decision.
    // Standing parks the bot (buttons 0, yaw held); walking patrols without
    // combat; battle is the unchanged shipped path.
    const mode = botBehaviorMode;
    if (mode === "standing") {
      this.#decision.buttons = 0;
      this.#decision.yaw = this.#yaw;
      this.#decision.pitch = 0;
      return this.#decision;
    }
    const self = entities.get(selfId);
    const combatAllowed = mode === "battle";
    if (this.#sailor) {
      this.#sailorDecision(entities, self, now);
    } else {
      this.#fieldDecision(entities, self, now, wallStates, combatAllowed);
    }
    // Walking sailors still crew their galley but never shoot; the combat
    // freeze strips Fire/Melee from every decision (cannon crew included —
    // backfill.ts re-applies this to its cannon-crew branch).
    if (!combatAllowed || botCombatFrozen) {
      this.#buttons &= ~(InputButton.Fire | InputButton.Melee);
    }
    this.#decision.buttons = this.#buttons;
    this.#decision.yaw = this.#yaw;
    this.#decision.pitch = this.#pitch;
    return this.#decision;
  }

  #nearestEnemy(self: EntityState, entities: ReadonlyMap<number, EntityState>): EntityState | undefined {
    let nearest: EntityState | undefined;
    let nearestDistanceSquared = Infinity;
    for (const state of entities.values()) {
      if (state.team === this.#team || ((state.flags ?? 0) & PlayerFlag.Alive) === 0) continue;
      const dx = state.x - self.x;
      const dz = state.z - self.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < nearestDistanceSquared) {
        nearest = state;
        nearestDistanceSquared = distanceSquared;
      }
    }
    return nearest;
  }

  #fieldDecision(
    entities: ReadonlyMap<number, EntityState>,
    self: EntityState | undefined,
    now: number,
    wallStates: Uint8Array | undefined,
    combatAllowed: boolean,
  ): void {
    // Phase 8e-19 Task 1: combatAllowed=false (walking mode) drops enemy
    // tracking, support-packing, and every combat button — the bot still
    // wanders its team waypoints and steers around obstacles.
    const enemy = combatAllowed ? (self === undefined ? undefined : this.#nearestEnemy(self, entities)) : undefined;
    if (self !== undefined && now >= this.#nextReactionAt) {
      if (now >= this.#nextWaypointAt) {
        const next = this.#waypoints[Math.floor(Math.random() * this.#waypoints.length)];
        if (next !== undefined) this.#waypoint = next;
        this.#nextWaypointAt = now + 25_000 + Math.random() * 20_000;
      }
      const enemyDistance = enemy === undefined ? Infinity : Math.hypot(enemy.x - self.x, enemy.z - self.z);
      const supportClass = combatAllowed && (this.#playerClass === PlayerClass.Mehter || this.#playerClass === PlayerClass.Priest);
      const chasing = combatAllowed && enemy !== undefined && enemyDistance < 55;
      let targetX = chasing ? enemy.x : this.#waypoint.x + this.#waypointLaneX + (Math.random() - 0.5) * BOT_WAYPOINT_SCATTER_M;
      let targetZ = chasing ? enemy.z : this.#waypoint.z + this.#waypointLaneZ + (Math.random() - 0.5) * BOT_WAYPOINT_SCATTER_M;
      if (supportClass) {
        let allyX = self.x;
        let allyZ = self.z;
        for (const state of entities.values()) {
          if (state.team !== this.#team || ((state.flags ?? 0) & PlayerFlag.Alive) === 0) continue;
          allyX = state.x;
          allyZ = state.z;
          break;
        }
        if (Math.hypot(self.x - allyX, self.z - allyZ) > 9) {
          targetX = allyX + (Math.random() - 0.5) * 6;
          targetZ = allyZ + (Math.random() - 0.5) * 6;
        }
      }
      // Phase 8e-16 Task 3: never steer into drowning water (dock-waypoint
      // scatter put bots in the Golden Horn on a loop). Target-only rewrite;
      // the fire/melee/reload logic below is untouched, so bot combat skill
      // is unchanged — a bot facing a wet chase target just holds and shoots.
      drySteerTarget(self.x, self.z, targetX, targetZ, this.#waypoint.x, this.#waypoint.z, chasing, Math.random, this.#steerTarget);
      targetX = this.#steerTarget.x;
      targetZ = this.#steerTarget.z;
      // Phase 8e-25 anti-stuck (wander only): track real progress toward a
      // far target. A wedged bot (no movement for the check window) gets an
      // immediate different waypoint — faster than the 25-45 s re-roll and
      // enough to break a concave-corner pin. Chasing keeps the old behavior
      // (a stuck chaser is at least holding combat), and moving bots reset.
      if (!chasing && Math.hypot(targetX - self.x, targetZ - self.z) > 1 && now >= this.#progressCheckAt) {
        if (this.#progressCheckAt === 0) {
          // First check only baselines the position — never counts as stuck.
          this.#lastProgressX = self.x;
          this.#lastProgressZ = self.z;
          this.#progressCheckAt = now + BOT_STUCK_CHECK_MS;
        } else {
          const moved = Math.hypot(self.x - this.#lastProgressX, self.z - this.#lastProgressZ);
          this.#lastProgressX = self.x;
          this.#lastProgressZ = self.z;
          if (moved < BOT_STUCK_MIN_PROGRESS_M && this.#stuckEscapes < BOT_STUCK_MAX_ESCAPES) {
            this.#stuckEscapes += 1;
            let escape: { x: number; z: number } | undefined = this.#waypoints[Math.floor(Math.random() * this.#waypoints.length)];
            let guard = 0;
            while (escape !== undefined && escape.x === this.#waypoint.x && escape.z === this.#waypoint.z && guard < 8) {
              escape = this.#waypoints[Math.floor(Math.random() * this.#waypoints.length)];
              guard += 1;
            }
            if (escape !== undefined) this.#waypoint = escape;
            this.#nextWaypointAt = now + 25_000 + Math.random() * 20_000;
          } else if (moved >= BOT_STUCK_MIN_PROGRESS_M) {
            this.#stuckEscapes = 0;
          }
          this.#progressCheckAt = now + BOT_STUCK_CHECK_MS;
        }
      }
      this.#yaw = this.#navigator.steer(self.x, self.y, self.z, targetX, targetZ, wallStates)
        + (chasing ? (Math.random() - 0.5) * 0.04 : 0);
      const alive = ((self.flags ?? 0) & PlayerFlag.Alive) !== 0;
      // Phase 8e-2 Task 3: acquiring a target starts a short random hold-off
      // before the first shot; losing the target re-arms it. Shots after the
      // first are unchanged, so sustained DPS (skill) is untouched.
      const inFireRange = combatAllowed && !supportClass && enemyDistance < 45;
      if (inFireRange && !this.#targetInRange) {
        this.#fireHoldOffUntil = now + BOT_FIRE_HOLDOFF_MIN_MS + Math.random() * BOT_FIRE_HOLDOFF_SPAN_MS;
        this.#fireArmed = true;
      }
      this.#targetInRange = inFireRange;
      const needsReload = combatAllowed && !supportClass && (self.ammo ?? 0) === 0;
      if (needsReload || !inFireRange) this.#fireArmed = true;
      const mayFire = inFireRange && now >= this.#fireHoldOffUntil && this.#fireArmed && !needsReload;
      if (mayFire) this.#fireArmed = false;
      this.#buttons = alive
        ? InputButton.Forward
          | ((combatAllowed && mayFire) ? InputButton.Fire : 0)
          | ((combatAllowed && enemyDistance < 2.2) ? InputButton.Melee : 0)
          | (needsReload ? InputButton.Reload : 0)
          | ((combatAllowed && (this.#playerClass === PlayerClass.Sipahi || this.#playerClass === PlayerClass.Knight || this.#playerClass === PlayerClass.Topcu || this.#playerClass === PlayerClass.WallGunner) && Math.random() < 0.08) ? InputButton.Interact : 0)
        : 0;
      this.#nextReactionAt = now + 250 + Math.random() * 150 + this.#reactionOffsetMs;
    } else if (now >= this.#nextTurnAt) {
      this.#yaw += (Math.random() - 0.5) * 0.7;
      const strafe = Math.random();
      this.#buttons = InputButton.Forward | (strafe < 0.2 ? InputButton.Left : strafe > 0.8 ? InputButton.Right : 0);
      this.#nextTurnAt = now + 1_000 + Math.random() * 2_500;
    }
  }

  #sailorDecision(entities: ReadonlyMap<number, EntityState>, self: EntityState | undefined, now: number): void {
    if (self === undefined || ((self.flags ?? 0) & PlayerFlag.Alive) === 0) {
      this.#buttons = 0;
      return;
    }
    let galleyX = 0;
    let galleyZ = 0;
    let galleyFound = false;
    let shoreEnemyX = 0;
    let shoreEnemyZ = 0;
    let shoreEnemyFound = false;
    for (const state of entities.values()) {
      if (state.shipKind === 1 && state.team === this.#team) {
        galleyX = state.x;
        galleyZ = state.z;
        galleyFound = true;
      }
      if (state.team !== this.#team || ((state.flags ?? 0) & PlayerFlag.Alive) === 0 || state.z >= 225) continue;
      if (!shoreEnemyFound || Math.hypot(state.x - self.x, state.z - self.z) < Math.hypot(shoreEnemyX - self.x, shoreEnemyZ - self.z)) {
        shoreEnemyX = state.x;
        shoreEnemyZ = state.z;
        shoreEnemyFound = true;
      }
    }
    if ((self.health ?? 100) < 45 && self.z > 225) {
      this.#yaw = 0;
      this.#pitch = 0;
      this.#buttons = InputButton.Forward;
      return;
    }
    const dx = galleyX - self.x;
    const dz = galleyZ - self.z;
    if (this.#aboardVehicle >= 0) {
      if (this.#atHelm) {
        const dock = this.#team === Team.Ottoman ? GALLEY_DOCKS[2] : GALLEY_DOCKS[0];
        const target = dock ?? { x: this.#team === Team.Ottoman ? 284 : -284, z: 262, yaw: 0 };
        const targetDx = target.x - self.x;
        const targetDz = target.z - self.z;
        const desiredYaw = Math.atan2(-targetDx, -targetDz);
        const deltaYaw = Math.atan2(Math.sin(desiredYaw - this.#yaw), Math.cos(desiredYaw - this.#yaw));
        this.#yaw = desiredYaw;
        this.#pitch = 0;
        this.#buttons = InputButton.Forward
          | (deltaYaw > 0.15 ? InputButton.Left : deltaYaw < -0.15 ? InputButton.Right : 0);
      } else if (this.#gunnerStation >= 0) {
        const targetDx = shoreEnemyFound ? shoreEnemyX - self.x : 0;
        const targetDz = shoreEnemyFound ? shoreEnemyZ - self.z : -40;
        const distance = Math.max(1, Math.hypot(targetDx, targetDz));
        this.#yaw = Math.atan2(-targetDx, -targetDz);
        this.#pitch = Math.max(0.05, Math.min(0.9, distance < 26 ? 0.12 : 0.05));
        this.#buttons = shoreEnemyFound && distance < 55 ? InputButton.Fire : 0;
      } else {
        this.#buttons = 0;
      }
      return;
    }
    if (!galleyFound) {
      this.#buttons = 0;
      return;
    }
    // Phase 8e-16: boarding must stay dry. Swimming at the ship was the
    // residual drowning path after the field-bot water guard — a sailor
    // walking the straight line to a docked galley leaves the 6 m pier and
    // can wedge against the pier's side box, draining 3 hp/s until the feed
    // logged another drowning. A wet sailor wades straight back to shore
    // (yaw 0 = -z, the same convention as the low-health retreat above); a
    // dry sailor approaching from land aims for the pier-root line first and
    // only heads down the pier once actually standing on a deck.
    if (waterHazard(self.x, self.z)) {
      this.#yaw = 0;
      this.#pitch = 0;
      this.#buttons = InputButton.Forward;
      if (now >= this.#nextTurnAt) this.#nextTurnAt = now + 500;
      return;
    }
    let walkX = galleyX;
    let walkZ = galleyZ;
    if (!onDeck(self.x, self.z, 0.4) && self.z < galleyZ - 2) {
      walkZ = Math.min(galleyZ, GALLEY_BOARD_APPROACH_Z);
    }
    const walkDx = walkX - self.x;
    const walkDz = walkZ - self.z;
    this.#yaw = Math.atan2(-walkDx, -walkDz);
    this.#pitch = 0;
    this.#buttons = InputButton.Forward
      | (Math.hypot(dx, dz) < 6 && Math.random() < 0.1 ? InputButton.Interact : 0);
    if (now >= this.#nextTurnAt) this.#nextTurnAt = now + 500;
  }
}
