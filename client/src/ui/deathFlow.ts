import { BASE_SPAWN_POINT_INDEX, CAPTURE_POINTS, BYZANTINE_SPAWN, OTTOMAN_SPAWN, Team } from "@janissary/shared";

/**
 * Phase 8e-13 death → deploy flow, as pure functions so App.tsx, the
 * DeathScreen and the EscMenu share one tested definition of the state
 * machine. Everything derives from snapshot state the client already has
 * (health, respawnTicks, point owners) — no new wire data.
 *
 * The phases:
 *
 *  - "alive"        — health > 0. No death UI. Class picks queue for the next
 *                     life (the server applies desiredClass at the next spawn).
 *  - "dead-pending" — dead, deploy floor (server DEPLOY_MIN_SECONDS) not yet
 *                     reached; respawnTicks > 0 is the floor countdown. The
 *                     deploy button is visibly disarmed — and shows NO seconds.
 *  - "dead-ready"   — dead and respawnTicks === 0: Deploy is armed. Deploying
 *                     is a client request; the server revalidates the floor,
 *                     the class caps, and the requested spawn point.
 *
 * Edge-case rulings (each covered by deathFlow.test.ts):
 *  - Dying with the ESC menu open closes the menu (App effect) so the death
 *    screen is what you see; ESC is still allowed to reopen the menu OVER the
 *    death screen (the menu is the louder context for chat/class keys).
 *  - Enter opens chat everywhere EXCEPT while dead, where Enter deploys.
 *  - Class keys (1–8) are always safe: alive they queue; dead they queue for
 *    the imminent deploy. Weapon-slot presses 1–3 they may shadow are inert
 *    server-side while dead, and spawnPlayer reseeds prevButtons on deploy.
 *  - A selected forward spawn whose ownership flips drops back to home base.
 */

export type DeathPhase = "alive" | "dead-pending" | "dead-ready";

export function deathPhase(health: number, respawnTicks: number): DeathPhase {
  if (health > 0) return "alive";
  return respawnTicks > 0 ? "dead-pending" : "dead-ready";
}

export function deathScreenVisible(phase: DeathPhase): boolean {
  return phase !== "alive";
}

/** Deploy may be SENT only from dead-ready; the server re-checks the floor. */
export function deployArmed(phase: DeathPhase): boolean {
  return phase === "dead-ready";
}

/** Enter-to-open-chat is suppressed while dead — Enter is the deploy key there. */
export function chatEnterSuppressed(phase: DeathPhase): boolean {
  return phase !== "alive";
}

/** Where a class pick applies, for the picker's hint line. */
export function classPickAppliesTo(phase: DeathPhase): "next-life" | "this-deploy" {
  return phase === "alive" ? "next-life" : "this-deploy";
}

export interface SpawnMarker {
  /** SpawnSelect wire value: capture-point index, or BASE_SPAWN_POINT_INDEX. */
  readonly pointIndex: number;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly home: boolean;
}

/**
 * Spawn choices rendered over the death-screen minimap: home base plus every
 * capture point our team owned in the latest snapshot. Ownership and enemy
 * presence are re-validated server-side at deploy time (world.ts
 * validForwardSpawn), so a stale marker can never teleport anyone hostile.
 */
export function spawnMarkers(points: readonly { owner: Team }[], team: Team): readonly SpawnMarker[] {
  const home = team === Team.Byzantine ? BYZANTINE_SPAWN : OTTOMAN_SPAWN;
  const markers: SpawnMarker[] = [{ pointIndex: BASE_SPAWN_POINT_INDEX, label: "Home base", x: home.x, z: home.z, home: true }];
  for (let index = 0; index < CAPTURE_POINTS.length; index += 1) {
    const point = CAPTURE_POINTS[index];
    if (point === undefined || points[index]?.owner !== team) continue;
    markers.push({ pointIndex: index, label: point.id.replaceAll("_", " "), x: point.x, z: point.z, home: false });
  }
  return markers;
}

/**
 * The selected spawn falls back to home base when the point is lost (or the
 * roster changes) — mirrors the old SpawnSelect behavior.
 */
export function reconcileSpawnSelection(selected: number, points: readonly { owner: Team }[], team: Team): number {
  if (selected === BASE_SPAWN_POINT_INDEX) return selected;
  return points[selected]?.owner === team ? selected : BASE_SPAWN_POINT_INDEX;
}
