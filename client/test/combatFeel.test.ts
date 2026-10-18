import { describe, expect, it } from "vitest";
import { PlayerClass } from "@janissary/shared";
import { BALL_POOL_SIZE, RELOAD_STAGE_FRACTIONS, meleeCooldownFraction, reloadCueFor, reloadProgressFraction, reloadStageCrossed } from "../src/game/combatFeel";

describe("BALL_POOL_SIZE", () => {
  it("covers a 20-shooter volley with headroom (design brief)", () => {
    expect(BALL_POOL_SIZE).toBeGreaterThanOrEqual(40);
  });
});

describe("reloadProgressFraction", () => {
  it("is 1 when not reloading", () => {
    expect(reloadProgressFraction(PlayerClass.Janissary, 0)).toBe(1);
  });

  it("starts at 0 at the full arquebus reload (6 s × 20 Hz = 120 ticks)", () => {
    expect(reloadProgressFraction(PlayerClass.Janissary, 120)).toBe(0);
  });

  it("is halfway through at half the ticks", () => {
    expect(reloadProgressFraction(PlayerClass.Janissary, 60)).toBeCloseTo(0.5, 5);
  });

  it("uses the crossbow's 4 s reload for crossbow classes", () => {
    expect(reloadProgressFraction(PlayerClass.Guardsman, 80)).toBe(0);
    expect(reloadProgressFraction(PlayerClass.Guardsman, 40)).toBeCloseTo(0.5, 5);
  });

  it("clamps out-of-range ticks", () => {
    expect(reloadProgressFraction(PlayerClass.Janissary, 255)).toBe(0);
    expect(reloadProgressFraction(PlayerClass.Janissary, -5)).toBe(1);
  });
});

describe("reloadStageCrossed (Phase 8e-2 Task 4)", () => {
  it("fires each stage exactly once across a full sweep", () => {
    const fired: string[] = [];
    let prev = 0;
    for (let tick = 119; tick >= 0; tick -= 1) {
      const fraction = reloadProgressFraction(PlayerClass.Janissary, tick);
      const stage = reloadStageCrossed(prev, fraction);
      if (stage !== undefined) fired.push(stage);
      prev = fraction;
    }
    expect(fired).toEqual(RELOAD_STAGE_FRACTIONS.map((stage) => stage.key));
  });

  it("crosses a stage on the threshold and not before or after", () => {
    expect(reloadStageCrossed(0.2, 0.29)).toBeUndefined();
    expect(reloadStageCrossed(0.29, 0.3)).toBe("reload-pour");
    expect(reloadStageCrossed(0.3, 0.45)).toBeUndefined();
    expect(reloadStageCrossed(0.59, 0.61)).toBe("reload-ram");
    expect(reloadStageCrossed(0.8, 0.9)).toBe("reload-click");
    expect(reloadStageCrossed(0.9, 1)).toBeUndefined();
  });

  it("never refires when the fraction stalls", () => {
    expect(reloadStageCrossed(0.31, 0.31)).toBeUndefined();
  });
});

describe("meleeCooldownFraction (Phase 8e-3)", () => {
  it("is 1 when the blade is ready", () => {
    expect(meleeCooldownFraction(1000, 1000, 0.8)).toBe(1);
    expect(meleeCooldownFraction(900, 1000, 0.8)).toBe(1);
  });

  it("is 0 immediately after the swing and climbs linearly", () => {
    expect(meleeCooldownFraction(1800, 1000, 0.8)).toBe(0);
    expect(meleeCooldownFraction(1800, 1400, 0.8)).toBeCloseTo(0.5, 5);
  });

  it("scales with the equipped def's cooldown (dagger recovers faster)", () => {
    // 240 ms into recovery: sword (0.8 s) at 0.3, dagger (0.48 s) at 0.5.
    expect(meleeCooldownFraction(1800, 1240, 0.8)).toBeCloseTo(0.3, 5);
    expect(meleeCooldownFraction(1480, 1240, 0.48)).toBeCloseTo(0.5, 5);
  });

  it("treats a non-positive cooldown as always ready", () => {
    expect(meleeCooldownFraction(9999, 0, 0)).toBe(1);
  });
});

describe("reloadCueFor (Phase 8e-8 Task 1)", () => {
  const fraction = (ticks: number): number => reloadProgressFraction(PlayerClass.Janissary, ticks);

  it("plays the start cue only when the ranged weapon is in hand", () => {
    expect(reloadCueFor(0, 120, 0, true, 1, 0)).toBe("start");
    // A reload that began ≤100 ms before the snapshot must not play the
    // ramrod start while the blade is out.
    expect(reloadCueFor(0, 120, 0, false, 1, 0)).toBe("none");
  });

  it("plays the finish cue only when holding the weapon as it completes", () => {
    expect(reloadCueFor(60, 0, 1, true, fraction(60), fraction(0))).toBe("finish");
    // Holstered completion: the radial hides, no flash, no sound — the
    // loaded pip on draw is the only presentation.
    expect(reloadCueFor(60, 0, 1, false, fraction(60), fraction(0))).toBe("none");
  });

  it("does not play finish when the completion did not reload anything", () => {
    expect(reloadCueFor(0, 0, 1, true, 1, 1)).toBe("none");
  });

  it("crosses foley stages only while holding the weapon", () => {
    // 100 -> 80 ticks crosses reload-pour (fraction 0.3); holstered: none.
    expect(reloadCueFor(100, 80, 0, true, fraction(100), fraction(80))).toBe("pour");
    expect(reloadCueFor(100, 80, 0, false, fraction(100), fraction(80))).toBe("none");
    // 40 -> 10 crosses reload-click (0.85: 10/120 = 0.083 -> fraction 0.917).
    expect(reloadCueFor(40, 10, 0, true, fraction(40), fraction(10))).toBe("click");
  });

  it("is none between stage crossings", () => {
    expect(reloadCueFor(110, 100, 0, true, fraction(110), fraction(100))).toBe("none");
  });

  it("prefers the completion edge over a stage crossing on the same sample", () => {
    // A long snapshot gap crossing both a stage and the end: finish wins.
    expect(reloadCueFor(40, 0, 1, true, fraction(40), 1)).toBe("finish");
  });
});

describe("Phase 8e-9 — projectile & explosion feel math", () => {
  it("ballImpactSurface classifies deck before water before dirt", async () => {
    const { ballImpactSurface } = await import("../src/game/combatFeel");
    expect(ballImpactSurface(true, true)).toBe("wood"); // deck over water wins
    expect(ballImpactSurface(true, false)).toBe("wood");
    expect(ballImpactSurface(false, true)).toBe("water");
    expect(ballImpactSurface(false, false)).toBe("dirt");
  });

  it("explosionTraumaForDistance: full inside, zero outside, monotonic between", async () => {
    const { explosionTraumaForDistance, EXPLOSION_SHAKE_FULL_METERS, EXPLOSION_SHAKE_ZERO_METERS, EXPLOSION_SHAKE_MAX_TRAUMA } = await import("../src/game/combatFeel");
    expect(explosionTraumaForDistance(0)).toBe(EXPLOSION_SHAKE_MAX_TRAUMA);
    expect(explosionTraumaForDistance(EXPLOSION_SHAKE_FULL_METERS)).toBe(EXPLOSION_SHAKE_MAX_TRAUMA);
    expect(explosionTraumaForDistance(EXPLOSION_SHAKE_ZERO_METERS)).toBe(0);
    expect(explosionTraumaForDistance(EXPLOSION_SHAKE_ZERO_METERS + 20)).toBe(0);
    const near = explosionTraumaForDistance(EXPLOSION_SHAKE_FULL_METERS + 5);
    const far = explosionTraumaForDistance(EXPLOSION_SHAKE_ZERO_METERS - 5);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(near).toBeLessThan(EXPLOSION_SHAKE_MAX_TRAUMA);
  });

  it("explosionFlashScale decays 1 → 0 over the flash life", async () => {
    const { explosionFlashScale, EXPLOSION_FLASH_SECONDS } = await import("../src/game/combatFeel");
    expect(explosionFlashScale(0)).toBe(1);
    expect(explosionFlashScale(EXPLOSION_FLASH_SECONDS / 2)).toBeCloseTo(0.5, 5);
    expect(explosionFlashScale(EXPLOSION_FLASH_SECONDS)).toBe(0);
    expect(explosionFlashScale(EXPLOSION_FLASH_SECONDS * 2)).toBe(0);
  });

  it("scorchAlpha holds, fades over the tail, and expires at SCORCH_SECONDS", async () => {
    const { scorchAlpha, SCORCH_SECONDS, SCORCH_FADE_SECONDS } = await import("../src/game/combatFeel");
    expect(scorchAlpha(0)).toBe(1);
    expect(scorchAlpha(SCORCH_SECONDS - SCORCH_FADE_SECONDS)).toBe(1);
    expect(scorchAlpha(SCORCH_SECONDS - SCORCH_FADE_SECONDS / 2)).toBeCloseTo(0.5, 5);
    expect(scorchAlpha(SCORCH_SECONDS)).toBe(0);
    expect(scorchAlpha(SCORCH_SECONDS + 1)).toBe(0);
    expect(scorchAlpha(-1)).toBe(0);
  });

  it("muzzle linger is tier-scaled and off on low", async () => {
    const { MUZZLE_LINGER_COUNT } = await import("../src/game/combatFeel");
    expect(MUZZLE_LINGER_COUNT.low).toBe(0);
    expect(MUZZLE_LINGER_COUNT.medium).toBeGreaterThan(0);
    expect(MUZZLE_LINGER_COUNT.high).toBeGreaterThanOrEqual(MUZZLE_LINGER_COUNT.medium);
  });

  it("shell trail puffs are tier-scaled intervals, never per-frame", async () => {
    const { SHELL_TRAIL_PUFF_SECONDS } = await import("../src/game/combatFeel");
    // 1/60 s would recreate the per-frame burst this constant replaced.
    for (const tier of ["low", "medium", "high"] as const) {
      expect(SHELL_TRAIL_PUFF_SECONDS[tier]).toBeGreaterThan(1 / 60);
    }
    expect(SHELL_TRAIL_PUFF_SECONDS.low).toBeGreaterThan(SHELL_TRAIL_PUFF_SECONDS.high);
  });
});
