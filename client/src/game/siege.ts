import { CAPTURE_POINTS, Team, WALL_SEGMENTS, WallState } from "@janissary/shared";

/**
 * Siege-loop client helpers (design doc docs/design/siege-loop.md):
 * the cannon occupancy-byte layout, wall damage tint stages, wall region
 * vocabulary, the bearing math for the banner pointer, and the client-side
 * siege objective computation behind the WarScore banner's second line.
 *
 * Everything here is pure so the logic stays unit-testable without standing
 * up a renderer (client/test/siegeObjective.test.ts).
 */

// Cannon `shipState` occupancy byte (siege-loop §1.7, replicated per snapshot):
// bit0 destroyed, bit1 deployed, bit2 deploying/undeploying, bit3 gunner
// present, bits 4–5 pusher count.
export const CANNON_STATE_DESTROYED = 1 << 0;
export const CANNON_STATE_DEPLOYED = 1 << 1;
export const CANNON_STATE_DEPLOYING = 1 << 2;
export const CANNON_STATE_GUNNER = 1 << 3;
export const CANNON_STATE_PUSHER_SHIFT = 4;
export const CANNON_STATE_PERSONAL = 1 << 6;

/** Cannon state surfaced to the HUD (banner objective + interact hints). */
export interface CannonStateInfo {
  entityId: number;
  x: number;
  z: number;
  team: Team;
  state: number;
  hullHp: number;
  /** Moved faster than a drift over the last snapshot pair (drives "STOP THE GUNS"). */
  moving: boolean;
}

/** Wall-region vocabulary for the breach kill-feed line (siege-loop §2.4). */
export function wallRegionName(segmentId: number): string {
  if (segmentId <= 3) return "WEST WALL";
  if (segmentId <= 7) return "CENTER WALL";
  return "EAST WALL";
}

/**
 * Reversible hpFrac (0–16 sixteenths of WALL_SEGMENT_HEALTH) → wall tint, in
 * four crack stages at ¾ / ½ / ¼ / near-zero HP: progressive darkening and
 * desaturation of the stone. Full HP returns white (the un-tinted texture),
 * so a repaired segment lightens back on its own.
 */
export function wallDamageTint(hpFrac: number): number {
  if (hpFrac > 12) return 0xffffff;
  if (hpFrac > 8) return 0xd9d3c9;
  if (hpFrac > 4) return 0xaaa196;
  if (hpFrac > 1) return 0x847b6f;
  return 0x625e57;
}

/** Eight-way compass label for a world offset; north is -Z (toward the city), east +X. */
export function compassBearing(dx: number, dz: number): string {
  const index = Math.round(Math.atan2(dx, -dz) / (Math.PI / 4));
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(index + 8) % 8] ?? "N";
}

export interface SiegeObjectiveInput {
  team: Team;
  captureOwner: Team;
  walls: readonly WallState[];
  wallHp: readonly number[];
  cannons: readonly CannonStateInfo[];
  selfX: number;
  selfZ: number;
}

export interface SiegeObjective {
  text: string;
  targetX: number;
  targetZ: number;
}

/** Nearest point to (x, z) among candidates, or undefined when empty. */
function nearestPoint(candidates: readonly { x: number; z: number }[], x: number, z: number): { x: number; z: number } | undefined {
  let best: { x: number; z: number } | undefined;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distSq = (candidate.x - x) ** 2 + (candidate.z - z) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = candidate;
    }
  }
  return best;
}

/**
 * The non-breached segment with the lowest hpFrac — "weakest" for attackers,
 * "most threatened" for defenders. Ties break toward the player.
 */
function weakestSegment(input: SiegeObjectiveInput): { x: number; z: number } | undefined {
  let best: { x: number; z: number } | undefined;
  let bestHp = Number.POSITIVE_INFINITY;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (const segment of WALL_SEGMENTS) {
    if ((input.walls[segment.id] ?? WallState.Intact) === WallState.Breached) continue;
    const hp = input.wallHp[segment.id] ?? 16;
    const distSq = (segment.box.x - input.selfX) ** 2 + (segment.box.z - input.selfZ) ** 2;
    if (hp < bestHp || (hp === bestHp && distSq < bestDistSq)) {
      bestHp = hp;
      bestDistSq = distSq;
      best = { x: segment.box.x, z: segment.box.z };
    }
  }
  return best;
}

/**
 * The team-specific siege objective line under the war-score banner
 * (siege-loop §2.3), computed client-side from state the client already has.
 * The returned target feeds the banner's bearing + distance pointer (§3.2).
 * undefined = fall back to the existing hold/contest text only.
 */
export function siegeObjective(input: SiegeObjectiveInput): SiegeObjective | undefined {
  const liveCannons = input.cannons.filter((cannon) => (cannon.state & CANNON_STATE_DESTROYED) === 0);
  const breached = WALL_SEGMENTS.filter((segment) => (input.walls[segment.id] ?? WallState.Intact) === WallState.Breached);
  const anyBreach = breached.length > 0;

  if (input.team === Team.Ottoman) {
    if (anyBreach) {
      if (input.captureOwner === Team.Ottoman) return undefined; // gate held — existing hold text
      const gate = CAPTURE_POINTS.find((point) => point.id === "GATE");
      if (gate === undefined) return undefined;
      return { text: "THROUGH THE BREACH — TAKE THE GATE", targetX: gate.x, targetZ: gate.z };
    }
    const deployed = liveCannons.some((cannon) => (cannon.state & CANNON_STATE_DEPLOYED) !== 0);
    const segment = weakestSegment(input);
    if (deployed) {
      if (segment === undefined) return undefined;
      return { text: "BREACH THE WALL", targetX: segment.x, targetZ: segment.z };
    }
    // No guns forward yet: point at the gun to push (or the wall as a fallback).
    const cannon = nearestPoint(liveCannons, input.selfX, input.selfZ) ?? segment;
    if (cannon === undefined) return undefined;
    return { text: "PUSH THE GUNS FORWARD", targetX: cannon.x, targetZ: cannon.z };
  }

  if (input.team === Team.Byzantine) {
    if (anyBreach) {
      const breach = nearestPoint(breached.map((segment) => ({ x: segment.box.x, z: segment.box.z })), input.selfX, input.selfZ);
      if (breach === undefined) return undefined;
      return { text: "HOLD THE BREACH", targetX: breach.x, targetZ: breach.z };
    }
    const enemyCannons = liveCannons.filter((cannon) => cannon.team === Team.Ottoman);
    const deployedEnemy = enemyCannons.filter((cannon) => (cannon.state & (CANNON_STATE_DEPLOYED | CANNON_STATE_DEPLOYING)) !== 0);
    const anyDamaged = input.walls.some((state) => state === WallState.Damaged);
    if (deployedEnemy.length > 0 || anyDamaged) {
      const target = nearestPoint(deployedEnemy, input.selfX, input.selfZ) ?? weakestSegment(input);
      if (target === undefined) return undefined;
      return { text: "BREAK THE BOMBARDS", targetX: target.x, targetZ: target.z };
    }
    const movingEnemy = enemyCannons.filter((cannon) => cannon.moving);
    if (movingEnemy.length > 0) {
      const target = nearestPoint(movingEnemy, input.selfX, input.selfZ);
      if (target === undefined) return undefined;
      return { text: "STOP THE GUNS — KILL THE CREW", targetX: target.x, targetZ: target.z };
    }
    return undefined;
  }

  return undefined;
}
