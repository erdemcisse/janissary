import { describe, expect, it } from "vitest";
import { ARTILLERY_EMPLACEMENTS, BOT_WAYPOINTS, WALL_SEGMENTS } from "../src/map";

/**
 * Wall-gun aim (Phase 8e-4b, ADR 0032 residual risk): the three fixed
 * Byzantine emplacements must point at the Ottoman attacker approach. The
 * engine's forward convention is (-sin yaw, -cos yaw) — the same vector the
 * server uses for the artillery muzzle velocity (world.ts updateArtillery) and
 * the client uses for the rendered gun rotation and shell visuals — so a
 * yaw=0 gun fires along -Z, into Byzantine territory. These tests pin that
 * every emplacement's muzzle vector points toward the Ottoman side (+Z).
 */

describe("wall-gun emplacement aim", () => {
  it("aims every fixed emplacement across the wall at the Ottoman approach", () => {
    for (const gun of ARTILLERY_EMPLACEMENTS) {
      const muzzleX = -Math.sin(gun.yaw);
      const muzzleZ = -Math.cos(gun.yaw);
      // The muzzle must have a positive Z component: toward the Ottoman side
      // (OTTOMAN_SPAWN sits at z = 92), never back into Byzantine territory.
      expect(muzzleZ, `emplacement ${gun.id} (${gun.x}, ${gun.z})`).toBeGreaterThan(0.99);
      expect(muzzleX, `emplacement ${gun.id} aims off the approach lane`).toBeLessThan(0.01);
      // The guns sit on the Byzantine side of the wall line and face across it.
      const wallZ = WALL_SEGMENTS[0]?.box.z ?? 0;
      expect(gun.z).toBeLessThan(wallZ);
    }
  });

  it("keeps the full yaw arc inside the attacker-facing half-plane", () => {
    for (const gun of ARTILLERY_EMPLACEMENTS) {
      // Clamped gun yaw lives in [yaw - yawArc, yaw + yawArc]; the idle muzzle
      // must still be reachable and the sweep must not swing past -Z.
      expect(gun.yaw - gun.yawArc).toBeGreaterThan(0);
      expect(gun.yaw + gun.yawArc).toBeLessThan(Math.PI * 2);
      expect(-Math.cos(gun.yaw + gun.yawArc)).toBeGreaterThan(0);
      expect(-Math.cos(gun.yaw - gun.yawArc)).toBeGreaterThan(0);
    }
  });
});

describe("bot patrol anchors", () => {
  it("keeps patrol anchors off the outer curtain", () => {
    for (const waypoint of BOT_WAYPOINTS) {
      expect(Math.abs(waypoint.z)).toBeGreaterThan(8);
    }
  });
});
