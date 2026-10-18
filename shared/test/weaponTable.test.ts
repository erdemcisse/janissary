import { describe, expect, it } from "vitest";
import {
  LOADOUTS,
  MAX_HEALTH,
  WEAPON_DEFS,
  WeaponType,
  loadoutForClass,
  weaponDefAtSlot,
} from "../src/index";
import { PlayerClass } from "../src/constants";

// WeaponType/PlayerClass are const enums (erased at compile time), so the
// invariant loops iterate explicit id lists instead of Object.values().
const ALL_WEAPONS: readonly WeaponType[] = [
  WeaponType.Arquebus,
  WeaponType.Crossbow,
  WeaponType.Sword,
  WeaponType.Dagger,
  WeaponType.Kilij,
  WeaponType.Hanger,
  WeaponType.Saber,
  WeaponType.ButtStroke,
];

const ALL_CLASSES: readonly PlayerClass[] = [
  PlayerClass.Janissary,
  PlayerClass.Sipahi,
  PlayerClass.Topcu,
  PlayerClass.Guardsman,
  PlayerClass.Knight,
  PlayerClass.WallGunner,
  PlayerClass.Mehter,
  PlayerClass.Priest,
];

/**
 * Reality pass (full-audit slice 1): the WEAPON_DEFS/LOADOUTS tables are the
 * data-driven contract the server, client, and bots all read. These tests pin
 * the table invariants so a future era-pack row cannot silently break the
 * combat loop — every weapon defined, every category carry the fields its
 * path needs, every class a complete loadout, and the headshot/body damage
 * math keeps the audit's "lethal headshot, ~two-hit body" contract.
 */
describe("weapon table invariants (reality pass)", () => {
  it("defines every WeaponType exactly once with a valid category", () => {
    for (const weapon of ALL_WEAPONS) {
      const def = WEAPON_DEFS[weapon];
      expect(def, `missing def for ${weapon}`).toBeDefined();
      expect(["melee", "ranged"]).toContain(def?.kind);
      expect(def?.damage).toBeGreaterThan(0);
      expect(def?.cooldownSeconds).toBeGreaterThan(0);
      expect(def?.headshotMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every melee def the fields melee() needs and every ranged def the ammo fields", () => {
    for (const def of ALL_WEAPONS.map((weapon) => WEAPON_DEFS[weapon])) {
      if (def.kind === "melee") {
        expect(def.meleeRange, `${def.name} lacks meleeRange`).toBeGreaterThan(0);
        expect(def.meleeForwardDot, `${def.name} lacks meleeForwardDot`).toBeGreaterThan(-1);
      } else {
        expect(def.magazineSize, `${def.name} lacks magazineSize`).toBeGreaterThan(0);
        expect(def.reloadSeconds, `${def.name} lacks reloadSeconds`).toBeGreaterThan(0);
        expect(def.projectileSpeed, `${def.name} lacks projectileSpeed`).toBeGreaterThan(0);
        expect(def.maxRange, `${def.name} lacks maxRange`).toBeGreaterThan(0);
      }
    }
  });

  it("gives every PlayerClass a complete 1/2/3 loadout of real weapons", () => {
    for (const playerClass of ALL_CLASSES) {
      const loadout = loadoutForClass(playerClass);
      expect(loadout).toHaveLength(3);
      for (const weapon of loadout) {
        expect(WEAPON_DEFS[weapon], `class ${playerClass} references ${weapon}`).toBeDefined();
      }
      // The mount-granted saber is not in any foot loadout.
      expect(loadout).not.toContain(WeaponType.Saber);
    }
  });

  it("keeps slot semantics: 1 blade, 2 ranged primary, 3 dagger", () => {
    for (const playerClass of ALL_CLASSES) {
      const loadout = loadoutForClass(playerClass);
      expect(WEAPON_DEFS[loadout[0]].kind).toBe("melee");
      expect(WEAPON_DEFS[loadout[1]].kind).toBe("ranged");
      expect(loadout[2]).toBe(WeaponType.Dagger);
    }
  });

  it("keeps headshots lethal and body shots within the ~two-hit band", () => {
    for (const def of ALL_WEAPONS.map((weapon) => WEAPON_DEFS[weapon])) {
      if (def.kind !== "ranged") continue;
      // Headshot damage (full base × multiplier, no falloff) must one-shot.
      expect(def.damage * def.headshotMultiplier).toBeGreaterThanOrEqual(MAX_HEALTH);
      // Body shots: two hits at most against full health (the audit claim).
      expect(def.damage * 2).toBeGreaterThanOrEqual(MAX_HEALTH);
    }
  });

  it("keeps the slot table aligned with weaponDefAtSlot", () => {
    for (const playerClass of ALL_CLASSES) {
      for (let slot = 1; slot <= 3; slot += 1) {
        expect(weaponDefAtSlot(playerClass, slot).id).toBe(LOADOUTS[playerClass][slot - 1]);
      }
    }
  });
});
