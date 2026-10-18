import {
  ARQUEBUS_DAMAGE,
  ARQUEBUS_FIRE_COOLDOWN_SECONDS,
  ARQUEBUS_FALLOFF_START,
  ARQUEBUS_FALLOFF_MIN_FRACTION,
  ARQUEBUS_MAX_RANGE,
  ARQUEBUS_RELOAD_SECONDS,
  BUTTSTROKE_DAMAGE,
  BUTTSTROKE_FORWARD_DOT,
  BUTTSTROKE_RANGE,
  BUTTSTROKE_SWING_SECONDS,
  CAVALRY_SABER_RANGE,
  CROSSBOW_DAMAGE,
  CROSSBOW_FIRE_COOLDOWN_SECONDS,
  CROSSBOW_MAX_RANGE,
  CROSSBOW_RELOAD_SECONDS,
  CROSSBOW_TRAVEL_SECONDS,
  DAGGER_DAMAGE,
  DAGGER_FORWARD_DOT,
  DAGGER_RANGE,
  DAGGER_SWING_SECONDS,
  MELEE_DAMAGE,
  MELEE_FORWARD_DOT,
  MELEE_RANGE,
  MELEE_SWING_SECONDS,
  SUPPORT_MELEE_DAMAGE,
  WeaponType,
  PlayerClass,
  Team,
} from "./constants";

/**
 * Data-driven weapon table (Phase 8e-3): the single source of truth for every
 * hand weapon a soldier can hold. New eras add ROWS, not code — a Vienna 1683
 * flintlock pistol is another def plus a loadout entry. `slot` is the 1/2/3
 * key row: 1 = blade, 2 = primary (ranged), 3 = sidearm. Base spread is NOT in
 * the table on purpose: it is movement-state-derived (moving vs. standing, see
 * MOVING_SPREAD_RADIANS/STANDING_SPREAD_RADIANS), not a static weapon stat. The
 * aimed-fire multiplier lives in AIM_TUNING below (Phase 8e-7).
 */
export interface WeaponDef {
  readonly id: WeaponType;
  readonly slot: 1 | 2 | 3;
  readonly name: string;
  readonly era: string;
  readonly kind: "melee" | "ranged";
  readonly damage: number;
  /** Swing or fire interval. */
  readonly cooldownSeconds: number;
  // ranged only:
  readonly reloadSeconds?: number;
  readonly magazineSize?: number;
  readonly projectileSpeed?: number;
  readonly maxRange?: number;
  /** Distance beyond which damage falls off; undefined = no falloff. */
  readonly falloffStart?: number;
  /** Minimum damage fraction at the weapon's effective maximum range. */
  readonly falloffMinFraction?: number;
  /** Flat hit-resolution delay (crossbow bolt travel time). */
  readonly travelSeconds?: number;
  // melee only:
  readonly meleeRange?: number;
  /** Minimum attacker-forward dot product for a hit (arc check). */
  readonly meleeForwardDot?: number;
  readonly viewmodelKey: string;
  readonly soundGroup: string;
  /** Server-authoritative headshot multiplier for hits that enter the head sphere. */
  readonly headshotMultiplier: number;
}

export const WEAPON_DEFS: Readonly<Record<WeaponType, WeaponDef>> = {
  [WeaponType.Arquebus]: {
    id: WeaponType.Arquebus, slot: 2, name: "Arquebus", era: "1453", kind: "ranged",
    damage: ARQUEBUS_DAMAGE, cooldownSeconds: ARQUEBUS_FIRE_COOLDOWN_SECONDS,
    reloadSeconds: ARQUEBUS_RELOAD_SECONDS, magazineSize: 1,
    projectileSpeed: 160, maxRange: ARQUEBUS_MAX_RANGE, falloffStart: ARQUEBUS_FALLOFF_START,
    falloffMinFraction: ARQUEBUS_FALLOFF_MIN_FRACTION,
    travelSeconds: 0, viewmodelKey: "arquebus", soundGroup: "gunshot", headshotMultiplier: 1.75,
  },
  [WeaponType.Crossbow]: {
    id: WeaponType.Crossbow, slot: 2, name: "Crossbow", era: "1453", kind: "ranged",
    damage: CROSSBOW_DAMAGE, cooldownSeconds: CROSSBOW_FIRE_COOLDOWN_SECONDS,
    reloadSeconds: CROSSBOW_RELOAD_SECONDS, magazineSize: 1,
    projectileSpeed: 55, maxRange: CROSSBOW_MAX_RANGE,
    travelSeconds: CROSSBOW_TRAVEL_SECONDS, viewmodelKey: "crossbow", soundGroup: "crossbow", headshotMultiplier: 2.1,
  },
  [WeaponType.Sword]: {
    id: WeaponType.Sword, slot: 1, name: "Arming sword", era: "1453", kind: "melee",
    damage: MELEE_DAMAGE, cooldownSeconds: MELEE_SWING_SECONDS,
    meleeRange: MELEE_RANGE, meleeForwardDot: MELEE_FORWARD_DOT,
    viewmodelKey: "sword", soundGroup: "blade", headshotMultiplier: 1.5,
  },
  [WeaponType.Kilij]: {
    id: WeaponType.Kilij, slot: 1, name: "Kilij", era: "1453", kind: "melee",
    damage: MELEE_DAMAGE, cooldownSeconds: MELEE_SWING_SECONDS,
    meleeRange: MELEE_RANGE, meleeForwardDot: MELEE_FORWARD_DOT,
    viewmodelKey: "kilij", soundGroup: "blade", headshotMultiplier: 1.5,
  },
  [WeaponType.Hanger]: {
    id: WeaponType.Hanger, slot: 1, name: "Hanger", era: "1453", kind: "melee",
    damage: SUPPORT_MELEE_DAMAGE, cooldownSeconds: MELEE_SWING_SECONDS,
    meleeRange: MELEE_RANGE, meleeForwardDot: MELEE_FORWARD_DOT,
    viewmodelKey: "sword", soundGroup: "blade", headshotMultiplier: 1.5,
  },
  [WeaponType.Dagger]: {
    id: WeaponType.Dagger, slot: 3, name: "Dagger", era: "1453", kind: "melee",
    damage: DAGGER_DAMAGE, cooldownSeconds: DAGGER_SWING_SECONDS,
    meleeRange: DAGGER_RANGE, meleeForwardDot: DAGGER_FORWARD_DOT,
    viewmodelKey: "dagger", soundGroup: "blade", headshotMultiplier: 1.5,
  },
  // Mounted-cavalry blade; not in any foot loadout (the mount grants it).
  [WeaponType.Saber]: {
    id: WeaponType.Saber, slot: 1, name: "Saber", era: "1453", kind: "melee",
    damage: MELEE_DAMAGE, cooldownSeconds: MELEE_SWING_SECONDS,
    meleeRange: CAVALRY_SABER_RANGE, meleeForwardDot: MELEE_FORWARD_DOT,
    viewmodelKey: "saber", soundGroup: "blade", headshotMultiplier: 1.5,
  },
  // Weakest melee tier: right-click with a ranged weapon equipped.
  [WeaponType.ButtStroke]: {
    id: WeaponType.ButtStroke, slot: 2, name: "Butt stroke", era: "1453", kind: "melee",
    damage: BUTTSTROKE_DAMAGE, cooldownSeconds: BUTTSTROKE_SWING_SECONDS,
    meleeRange: BUTTSTROKE_RANGE, meleeForwardDot: BUTTSTROKE_FORWARD_DOT,
    viewmodelKey: "arquebus", soundGroup: "blunt", headshotMultiplier: 1.5,
  },
};

/**
 * Per-class 1/2/3 loadouts. Slot 1 is the faction blade (support classes get
 * the weaker hanger), slot 2 the faction ranged primary (unchanged stats;
 * support classes carry one but cannot fire or reload it — the class-based
 * support rule is unchanged), slot 3 the fast sidearm dagger.
 */
export const LOADOUTS: Readonly<Record<PlayerClass, readonly [WeaponType, WeaponType, WeaponType]>> = {
  [PlayerClass.None]: [WeaponType.Sword, WeaponType.Arquebus, WeaponType.Dagger],
  [PlayerClass.Janissary]: [WeaponType.Kilij, WeaponType.Arquebus, WeaponType.Dagger],
  [PlayerClass.Sipahi]: [WeaponType.Kilij, WeaponType.Arquebus, WeaponType.Dagger],
  [PlayerClass.Topcu]: [WeaponType.Kilij, WeaponType.Arquebus, WeaponType.Dagger],
  [PlayerClass.Mehter]: [WeaponType.Hanger, WeaponType.Arquebus, WeaponType.Dagger],
  [PlayerClass.Guardsman]: [WeaponType.Sword, WeaponType.Crossbow, WeaponType.Dagger],
  [PlayerClass.Knight]: [WeaponType.Sword, WeaponType.Crossbow, WeaponType.Dagger],
  [PlayerClass.WallGunner]: [WeaponType.Sword, WeaponType.Crossbow, WeaponType.Dagger],
  [PlayerClass.Priest]: [WeaponType.Hanger, WeaponType.Crossbow, WeaponType.Dagger],
};

export const WEAPON_SLOT_COUNT = 3;
/** Slot selected on spawn/respawn: the ranged primary. */
export const DEFAULT_WEAPON_SLOT = 2;

/**
 * Aim-down-sights tuning (Phase 8e-7), WEAPON_DEFS-adjacent on purpose: aimed
 * fire tightens the movement-state-derived base spread by `spreadFactor`
 * (server-authoritative, applied in fireWeapon), and `fovRatio` scales the
 * client's configured base FOV while aiming (presentation only). A ratio, not
 * an absolute FOV, because the base FOV is user-configurable (60-110°).
 * Melee weapons have no row — aiming a blade is a no-op.
 */
export interface AimTuning {
  /** Multiplier on the fire spread while aiming (server-authoritative). */
  readonly spreadFactor: number;
  /** Aimed FOV = base FOV × this ratio (client presentation). */
  readonly fovRatio: number;
}

export const AIM_TUNING: Readonly<Partial<Record<WeaponType, AimTuning>>> = {
  [WeaponType.Arquebus]: { spreadFactor: 0.35, fovRatio: 0.72 },
  [WeaponType.Crossbow]: { spreadFactor: 0.35, fovRatio: 0.72 },
};

/**
 * Spread multiplier for a shot fired with the given aim state: the weapon's
 * AIM_TUNING factor while aiming, 1 otherwise (and always 1 for weapons
 * without an aim row — blades, the butt stroke, the saber).
 */
export function aimedSpreadFactor(weapon: WeaponType, aiming: boolean): number {
  if (!aiming) return 1;
  return AIM_TUNING[weapon]?.spreadFactor ?? 1;
}

/** Aimed-FOV ratio for a weapon (1 = no zoom — melee/no row). */
export function aimFovRatio(weapon: WeaponType): number {
  return AIM_TUNING[weapon]?.fovRatio ?? 1;
}

export function loadoutForClass(playerClass: PlayerClass): readonly [WeaponType, WeaponType, WeaponType] {
  return LOADOUTS[playerClass] ?? LOADOUTS[PlayerClass.None];
}

/** WeaponDef for a 1-based slot (1/2/3) of a class's loadout. */
export function weaponDefAtSlot(playerClass: PlayerClass, slot: number): WeaponDef {
  const loadout = loadoutForClass(playerClass);
  const weapon = loadout[slot - 1] ?? loadout[1];
  return WEAPON_DEFS[weapon];
}

/**
 * The class's slot-2 ranged weapon — the old `weaponForClass` semantics,
 * now a table lookup (team only breaks the Team.None tie).
 */
export function rangedWeaponForClass(playerClass: PlayerClass, team: Team): WeaponDef {
  const loadout = LOADOUTS[playerClass];
  if (loadout !== undefined) return WEAPON_DEFS[loadout[1]];
  return WEAPON_DEFS[team === Team.Byzantine ? WeaponType.Crossbow : WeaponType.Arquebus];
}

export interface ClassTuning {
  readonly team: Team;
  readonly title: string;
  readonly cavalry: boolean;
  readonly artillery: boolean;
  readonly support: boolean;
}

export const CLASS_TUNING: Readonly<Record<PlayerClass, ClassTuning>> = {
  [PlayerClass.None]: { team: Team.None, title: "Unassigned", cavalry: false, artillery: false, support: false },
  [PlayerClass.Janissary]: { team: Team.Ottoman, title: "Janissary", cavalry: false, artillery: false, support: false },
  [PlayerClass.Sipahi]: { team: Team.Ottoman, title: "Sipahi", cavalry: true, artillery: false, support: false },
  [PlayerClass.Topcu]: { team: Team.Ottoman, title: "Topçu", cavalry: false, artillery: true, support: false },
  [PlayerClass.Mehter]: { team: Team.Ottoman, title: "Mehter", cavalry: false, artillery: false, support: true },
  [PlayerClass.Guardsman]: { team: Team.Byzantine, title: "Guardsman", cavalry: false, artillery: false, support: false },
  [PlayerClass.Knight]: { team: Team.Byzantine, title: "Knight", cavalry: true, artillery: false, support: false },
  [PlayerClass.WallGunner]: { team: Team.Byzantine, title: "Wall Gunner", cavalry: false, artillery: true, support: false },
  [PlayerClass.Priest]: { team: Team.Byzantine, title: "Priest", cavalry: false, artillery: false, support: true },
};

export function defaultClassForTeam(team: Team): PlayerClass {
  return team === Team.Ottoman ? PlayerClass.Janissary : PlayerClass.Guardsman;
}
