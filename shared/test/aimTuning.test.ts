import { describe, expect, it } from "vitest";
import {
  AIM_TUNING,
  LOADOUTS,
  MOVING_SPREAD_RADIANS,
  STANDING_SPREAD_RADIANS,
  WEAPON_DEFS,
  WeaponType,
  aimFovRatio,
  aimedSpreadFactor,
} from "../src/index";

/**
 * Phase 8e-7 ADS tuning: the shared AIM_TUNING table is the single source of
 * truth for the server-authoritative aimed-spread factor and the client FOV
 * ratio. These tests pin the table's shape so a future era-pack row can't
 * silently break the invariants the server and client rely on.
 */
describe("AIM_TUNING (Phase 8e-7)", () => {
  it("carries rows only for ranged weapons", () => {
    for (const [weapon, aim] of Object.entries(AIM_TUNING)) {
      const def = WEAPON_DEFS[Number(weapon) as WeaponType];
      expect(def, `AIM_TUNING row ${weapon} has no weapon def`).toBeDefined();
      expect(def.kind).toBe("ranged");
      expect(aim?.spreadFactor).toBeGreaterThan(0);
      expect(aim?.spreadFactor).toBeLessThanOrEqual(1);
      expect(aim?.fovRatio).toBeGreaterThan(0);
      expect(aim?.fovRatio).toBeLessThanOrEqual(1);
    }
  });

  it("covers every slot-2 primary in the 1453 loadouts", () => {
    for (const loadout of Object.values(LOADOUTS)) {
      const primary = WEAPON_DEFS[loadout[1]];
      expect(AIM_TUNING[primary.id], `${primary.name} has no aim row`).toBeDefined();
    }
  });

  it("aimedSpreadFactor applies the row only while aiming and only to ranged", () => {
    expect(aimedSpreadFactor(WeaponType.Arquebus, false)).toBe(1);
    expect(aimedSpreadFactor(WeaponType.Crossbow, false)).toBe(1);
    expect(aimedSpreadFactor(WeaponType.Arquebus, true)).toBe(AIM_TUNING[WeaponType.Arquebus]?.spreadFactor);
    expect(aimedSpreadFactor(WeaponType.Crossbow, true)).toBe(AIM_TUNING[WeaponType.Crossbow]?.spreadFactor);
    // Blades, the saber, and the butt stroke never tighten.
    expect(aimedSpreadFactor(WeaponType.Sword, true)).toBe(1);
    expect(aimedSpreadFactor(WeaponType.Dagger, true)).toBe(1);
    expect(aimedSpreadFactor(WeaponType.Saber, true)).toBe(1);
    expect(aimedSpreadFactor(WeaponType.ButtStroke, true)).toBe(1);
  });

  it("aimFovRatio zooms ranged weapons and leaves melee at 1", () => {
    expect(aimFovRatio(WeaponType.Arquebus)).toBeLessThan(1);
    expect(aimFovRatio(WeaponType.Crossbow)).toBeLessThan(1);
    expect(aimFovRatio(WeaponType.Sword)).toBe(1);
    expect(aimFovRatio(WeaponType.Dagger)).toBe(1);
  });

  it("the shipped factors keep aimed-moving less accurate than unaimed-standing", () => {
    // Balance sanity: ADS tightens but does not replace the stand-still
    // discipline — running-and-gunning while aiming must stay worse than a
    // planted, unaimed shot.
    const aimedMoving = MOVING_SPREAD_RADIANS * aimedSpreadFactor(WeaponType.Arquebus, true);
    expect(aimedMoving).toBeGreaterThan(STANDING_SPREAD_RADIANS);
  });
});
