import { describe, expect, it } from "vitest";
import { BASE_SPAWN_POINT_INDEX, CAPTURE_POINTS, PlayerClass, Team } from "@janissary/shared";
import {
  chatEnterSuppressed,
  classPickAppliesTo,
  deathPhase,
  deathScreenVisible,
  deployArmed,
  reconcileSpawnSelection,
  spawnMarkers,
} from "../src/ui/deathFlow";
import { SELECTABLE_CLASSES } from "../src/ui/ClassPicker";

/**
 * Phase 8e-13 death → deploy state machine. Death is read from snapshot
 * health; respawnTicks is only the deploy floor now (humans never
 * auto-respawn — protocol v15 Deploy). These tests pin the phase transitions
 * and the edge cases from the phase spec.
 */
describe("deathPhase", () => {
  it("is alive whenever health is positive, ignoring the timer", () => {
    expect(deathPhase(100, 0)).toBe("alive");
    expect(deathPhase(1, 0)).toBe("alive");
    // Stale floor ticks while alive (e.g. an old respawnAtTick in flight) must
    // not open the death UI.
    expect(deathPhase(100, 30)).toBe("alive");
  });

  it("is dead-pending while the deploy floor counts down — with no seconds shown", () => {
    expect(deathPhase(0, 30)).toBe("dead-pending");
    expect(deathPhase(0, 1)).toBe("dead-pending");
  });

  it("is dead-ready once the floor reaches zero", () => {
    expect(deathPhase(0, 0)).toBe("dead-ready");
  });

  it("walks the full life cycle: alive → pending → ready → alive", () => {
    const seen = [deathPhase(100, 0), deathPhase(0, 30), deathPhase(0, 0), deathPhase(100, 0)];
    expect(seen).toEqual(["alive", "dead-pending", "dead-ready", "alive"]);
  });
});

describe("death screen visibility and deploy arming", () => {
  it("shows the death screen in both dead phases and only then", () => {
    expect(deathScreenVisible("alive")).toBe(false);
    expect(deathScreenVisible("dead-pending")).toBe(true);
    expect(deathScreenVisible("dead-ready")).toBe(true);
  });

  it("arms Deploy only in dead-ready (the server re-checks the floor anyway)", () => {
    expect(deployArmed("alive")).toBe(false);
    expect(deployArmed("dead-pending")).toBe(false);
    expect(deployArmed("dead-ready")).toBe(true);
  });

  it("suppresses Enter-to-open-chat exactly while the death screen is up", () => {
    expect(chatEnterSuppressed("alive")).toBe(false);
    expect(chatEnterSuppressed("dead-pending")).toBe(true);
    expect(chatEnterSuppressed("dead-ready")).toBe(true);
  });
});

describe("class picking", () => {
  it("queues for this deploy while dead and for the next life while alive", () => {
    expect(classPickAppliesTo("dead-pending")).toBe("this-deploy");
    expect(classPickAppliesTo("dead-ready")).toBe("this-deploy");
    expect(classPickAppliesTo("alive")).toBe("next-life");
  });
});

describe("spawn markers", () => {
  const owned = CAPTURE_POINTS.map(() => ({ owner: Team.None }));

  it("always offers home base first, even with no points owned", () => {
    const markers = spawnMarkers(owned, Team.Ottoman);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.pointIndex).toBe(BASE_SPAWN_POINT_INDEX);
    expect(markers[0]?.home).toBe(true);
  });

  it("offers exactly the team-owned capture points as forward spawns", () => {
    const points = CAPTURE_POINTS.map((_, index) => ({ owner: index === 2 || index === 4 ? Team.Ottoman : Team.None }));
    const markers = spawnMarkers(points, Team.Ottoman);
    expect(markers.map((marker) => marker.pointIndex)).toEqual([BASE_SPAWN_POINT_INDEX, 2, 4]);
    // Byzantine sees its own ownership view of the same field.
    expect(spawnMarkers(points, Team.Byzantine)).toHaveLength(1);
  });

  it("uses the team's own home base position", () => {
    const ottoman = spawnMarkers(owned, Team.Ottoman)[0];
    const byzantine = spawnMarkers(owned, Team.Byzantine)[0];
    expect(ottoman?.z).toBeGreaterThan(0); // Ottoman camp is seaward (z = +92)
    expect(byzantine?.z).toBeLessThan(0); // Byzantine base is city-side (z = -92)
  });
});

describe("reconcileSpawnSelection", () => {
  it("keeps home base and still-owned points", () => {
    const points = CAPTURE_POINTS.map((_, index) => ({ owner: index === 3 ? Team.Byzantine : Team.None }));
    expect(reconcileSpawnSelection(BASE_SPAWN_POINT_INDEX, points, Team.Byzantine)).toBe(BASE_SPAWN_POINT_INDEX);
    expect(reconcileSpawnSelection(3, points, Team.Byzantine)).toBe(3);
  });

  it("drops a lost point back to home base", () => {
    const points = CAPTURE_POINTS.map(() => ({ owner: Team.None }));
    expect(reconcileSpawnSelection(4, points, Team.Ottoman)).toBe(BASE_SPAWN_POINT_INDEX);
  });
});

/** The ClassPicker digit order is the pre-8e-13 ClassSelect order — muscle memory holds. */
describe("class picker ordering", () => {
  it("keeps digits 1–8 on the historical card order", () => {
    expect([...SELECTABLE_CLASSES]).toEqual([
      PlayerClass.Janissary, PlayerClass.Sipahi, PlayerClass.Topcu, PlayerClass.Mehter,
      PlayerClass.Guardsman, PlayerClass.Knight, PlayerClass.WallGunner, PlayerClass.Priest,
    ]);
  });
});
