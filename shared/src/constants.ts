export const PROTOCOL_VERSION = 16;
export const SERVER_TICK_RATE = 20;
export const SERVER_SNAPSHOT_RATE = 10;
export const SNAPSHOT_TICK_DIVISOR = SERVER_TICK_RATE / SERVER_SNAPSHOT_RATE;
export const FIXED_DT_SECONDS = 1 / SERVER_TICK_RATE;
export const FIXED_DT_MS = 1000 / SERVER_TICK_RATE;
export const INTERPOLATION_DELAY_MS = 100;
export const MAX_PLAYERS = 1_200;
export const MAX_ENTITY_ID = 65_535;
export const MAX_NAME_BYTES = 24;
export const MAX_INPUT_QUEUE = 64;
/**
 * Infantry top speed — Phase 8e-19 Task 2: walk-only movement. The owner
 * banned sprinting; there was never a sprint button (register: "no sprint"
 * design call), only the run GAIT clip + run footstep sample above ~4.5 m/s
 * that read as a sprint. MAX_SPEED is now the walk speed itself, raised
 * 6 → 6.8 m/s (+13.3%, the owner's "faster pace a bit"). Cavalry scales
 * off it (CAVALRY_SPEED_MULTIPLIER) — a mount, not a sprint.
 */
export const MAX_SPEED = 6.8;
export const GROUND_ACCELERATION = 30;
export const GRAVITY = -24;
export const CAPSULE_HEIGHT = 1.8;
export const CAPSULE_RADIUS = 0.4;
export const GROUND_CENTER_Y = CAPSULE_HEIGHT / 2;
/** Highest vertical face infantry may traverse without jumping. */
export const MAX_STEP_UP = 2.5;
/**
 * Mounted movement keeps enough clearance for the 2.4 m hill-fort tiers, but
 * jumping remains a much smaller hop and cannot vault those tiers.
 */
export const CAVALRY_MAX_STEP_UP = 2.4;
/** Extra support overlap retained only while already grounded on that top. */
export const GROUND_SUPPORT_HYSTERESIS = 0.15;
/** Numerical tolerance used when resolving a falling capsule onto a top. */
export const GROUND_CONTACT_EPSILON = 0.01;
/** Tuned physical apex above take-off for an infantry jump. */
export const JUMP_HEIGHT = 1.2;
export const JUMP_IMPULSE = Math.sqrt(-2 * GRAVITY * JUMP_HEIGHT);
/** A horse can hop low cover, but cannot jump onto the 2.4 m terrain tiers. */
export const CAVALRY_JUMP_HEIGHT = 0.55;
export const CAVALRY_JUMP_IMPULSE = Math.sqrt(-2 * GRAVITY * CAVALRY_JUMP_HEIGHT);
// Phase 8c-4 world expansion: 1800 x 1800 battlefield. This is well beyond the
// old ±327.67 m position range, so POSITION_SCALE dropped from 100 (cm) to 10
// (dm) — the wire layout is unchanged, precision is 5 cm average. See ADR 0019.
export const WORLD_HALF_EXTENT = 900;
export const POSITION_SCALE = 10;
export const MAX_POSITION = 3276.7;
export const AOI_CELL_SIZE = 32;
export const AOI_ENTER_RADIUS = 140;
export const AOI_EXIT_RADIUS = 160;
export const AOI_RADIUS = AOI_EXIT_RADIUS;
export const AOI_MAX_ENTITIES = 150;
export const SNAPSHOT_HISTORY_SIZE = 64;
export const MAX_MESSAGES_PER_SECOND = 80;
export const MAX_CONNECTIONS_PER_IP = 128;
export const DEFAULT_SERVER_PORT = 9001;
export const MAX_TOKEN_BYTES = 128;
export const MAX_CHAT_BYTES = 160;
export const MAX_DAILY_CONTRACTS = 3;
export const MEDAL_KIND_COUNT = 4;
export const WALL_SEGMENT_COUNT = 12;
export const ARTILLERY_EMPLACEMENT_COUNT = 3;
export const MAX_ARTILLERY_PROJECTILES = 64;
export const VEHICLE_ENTITY_BASE = 10_000;
export const EARTHWORK_ENTITY_BASE = 20_000;
export const CANNON_ENTITY_BASE = 30_000;
export const HORSE_ENTITY_BASE = 40_000;
export const MAX_VEHICLES = 4;
/** The four original Ottoman mobile bombards. Personal field guns use the slots after these. */
export const FIXED_SIEGE_CANNON_COUNT = 4;
/** One small field gun per live artillery-class owner, with room for both teams. */
export const MAX_PERSONAL_CANNONS = 64;
export const MAX_SIEGE_CANNONS = FIXED_SIEGE_CANNON_COUNT + MAX_PERSONAL_CANNONS;
export const MAX_HORSES = 64;
export const GALLEY_PASSENGER_SLOTS = 4;
export const MAX_CAPTURE_POINTS = 7;
/** Wire sentinel for the always-available fixed home-base spawn. */
export const BASE_SPAWN_POINT_INDEX = 0xff;
/** Terrain props stay this far inside the authoritative world clamp. */
export const TERRAIN_PROP_WORLD_MARGIN = 20;

export const enum XpSource {
  CapturePresence = 1,
  PointCaptured = 2,
  Kill = 3,
  Assist = 4,
  DefenseKill = 5,
  WarVictory = 6,
  WarParticipation = 7,
  Contract = 8,
  WelcomeBack = 9,
  MountedKill = 10,
  DismountRider = 11,
  ArtilleryWallHit = 12,
  BreachCreated = 13,
  CrewAssist = 14,
  ArtilleryKill = 15,
  SupportTick = 16,
  SupportKillAssist = 17,
  GalleyKill = 18,
  HullDamage = 19,
  SinkingBlow = 20,
  HelmAssist = 21,
  Headshot = 22,
  CannonDestroyed = 23,
  SiegePush = 24,
  WallRepair = 25,
  EasterEgg = 26,
}

export const XP_EVENT_FLAG_AT_GATE = 1 << 0;
export const XP_EVENT_FLAG_HEADSHOT = 1 << 1;

/** Combat-event value byte: Hit damage uses the lower seven bits. */
export const HIT_EVENT_FLAG_HEADSHOT = 1 << 7;
export const HIT_EVENT_DAMAGE_MASK = 0x7f;
export function encodeHitEventValue(damage: number, headshot: boolean): number {
  return (Math.min(HIT_EVENT_DAMAGE_MASK, Math.max(0, Math.round(damage))) & HIT_EVENT_DAMAGE_MASK)
    | (headshot ? HIT_EVENT_FLAG_HEADSHOT : 0);
}
export function decodeHitEventDamage(value: number): number { return value & HIT_EVENT_DAMAGE_MASK; }
export function hitEventIsHeadshot(value: number): boolean { return (value & HIT_EVENT_FLAG_HEADSHOT) !== 0; }

/**
 * Headshot hit geometry. The body hit test is a sphere of radius 0.62 centered
 * 0.35 m above the feet; the head is a smaller sphere of HEADSHOT_RADIUS centered
 * HEADSHOT_CENTER_OFFSET further up, so the head spans the crown of the body
 * capsule and is roughly (0.18 / 0.62)^2 = 8.4% of the body's cross-section —
 * a meaningfully harder target (see ADR 0014).
 */
export const HEADSHOT_RADIUS = 0.18;
export const HEADSHOT_CENTER_OFFSET = 0.8;
export const XP_HEADSHOT_BONUS = 15;

export const enum ContractKind {
  CapturePoints = 1,
  KillsAtGate = 2,
  WarWin = 3,
  Assists = 4,
  DefenseKills = 5,
  CavalryKills = 6,
  GalleyKills = 7,
  BreachCreated = 8,
  ArtilleryKills = 9,
  RidersUnhorsed = 10,
}

export const enum MedalKind {
  MostCaptures = 1,
  BestMarksman = 2,
  GateKeeper = 3,
  VeteranPresence = 4,
}

export const enum InputButton {
  Forward = 1 << 0,
  Backward = 1 << 1,
  Left = 1 << 2,
  Right = 1 << 3,
  Fire = 1 << 4,
  Reload = 1 << 5,
  Melee = 1 << 6,
  Crouch = 1 << 7,
  Interact = 1 << 8,
  RaiseEarthwork = 1 << 9,
  DigEarthwork = 1 << 10,
  Torch = 1 << 11,
  Jump = 1 << 12,
  // Aim down sights (Phase 8e-7, protocol v14): hold-to-aim. A level-acted bit —
  // no edges are consumed anywhere, so nothing can wedge across death/respawn.
  // Fills the lowest of the reserved low-word bits 13-15.
  Aim = 1 << 13,
  // Weapon slots (Phase 8e-3, protocol v13). These live in the high u16 of the
  // wire input's widened buttons field; bits 14-15 stay reserved for future
  // movement/action inputs.
  Slot1 = 1 << 16,
  Slot2 = 1 << 17,
  Slot3 = 1 << 18,
}

/** Every client input bit accepted by the authoritative input validator. */
export const VALID_INPUT_BUTTON_MASK = InputButton.Slot3 * 2 - 1;

export const enum Team {
  None = 0,
  Ottoman = 1,
  Byzantine = 2,
}

export const enum WeaponType {
  Arquebus = 1,
  Crossbow = 2,
  // Phase 8e-3 weapon slots: melee weapons join the table. None of these are
  // carried on the wire; they index WEAPON_DEFS/LOADOUTS in shared tuning.
  Sword = 3,
  Dagger = 4,
  Kilij = 5,
  Hanger = 6,
  Saber = 7,
  ButtStroke = 8,
}

export const enum PlayerClass {
  None = 0,
  Janissary = 1,
  Sipahi = 2,
  Topcu = 3,
  Guardsman = 4,
  Knight = 5,
  WallGunner = 6,
  Mehter = 7,
  Priest = 8,
}

export const enum WallState {
  Intact = 0,
  Damaged = 1,
  Breached = 2,
}

export const enum PlayerFlag {
  Alive = 1 << 0,
  Reloading = 1 << 1,
  SpawnProtected = 1 << 2,
  Crouched = 1 << 3,
  Mounted = 1 << 4,
  ManningArtillery = 1 << 5,
  AuraActive = 1 << 6,
  Aboard = 1 << 7,
  // Widens the snapshot Gameplay flags field to u16 on the wire (protocol v12).
  PushingCannon = 1 << 8,
  // Phase 8e-25 (reality pass): a Topçu carrying their undeployed, uncrewed
  // personal field gun moves at PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER. The
  // server sets this every tick; the client prediction reads it so both
  // sides apply the same factor (previously server-only — every Topçu
  // rubber-banded because the client predicted full speed).
  CarryingFieldGun = 1 << 9,
}

export const enum RoundPhase {
  Active = 1,
  Victory = 2,
}

export const enum CombatEventType {
  Fire = 1,
  Hit = 2,
  Death = 3,
  Capture = 4,
  Victory = 5,
  Respawn = 6,
  ArtilleryFire = 7,
  ArtilleryImpact = 8,
  Breach = 9,
  SupportMilestone = 10,
  GalleySunk = 11,
  CannonDestroyed = 12,
  /** Accepted authoritative melee attempt (hit or miss); value is the visual
   * weapon slot so bot slot-1 fallback and human butt strokes render truthfully. */
  MeleeSwing = 13,
}

/**
 * What actually killed someone, carried in the Death event's previously
 * unused `value` byte (Phase 8c-7). The client feed renders from this instead
 * of guessing from the killer's snapshot flags — a mounted arquebus kill is a
 * ranged kill, not melee. 8e-3 split blade kills out of generic Melee for the
 * kill feed (value byte has room; no wire-format change). Saber and
 * butt-stroke kills still report Melee.
 */
export const enum KillCause {
  Arquebus = 1,
  Crossbow = 2,
  Melee = 3,
  Artillery = 4,
  GalleyGun = 5,
  Drowning = 6,
  Sword = 7,
  Dagger = 8,
}

export const MAX_HEALTH = 100;
export const HEALTH_REGEN_PER_SECOND = 5;
export const HEALTH_REGEN_DELAY_SECONDS = 8;
export const RESPAWN_SECONDS = 3;
// Phase 8e-13 (ADR 0041): the forced countdown is gone for humans — death opens
// the deploy screen immediately and the player redeploys on their own click
// (Deploy message). This floor is the only enforced death cost left for
// humans: the earliest a deploy request is honored. Bots still auto-respawn
// after RESPAWN_SECONDS.
export const DEPLOY_MIN_SECONDS = 1.5;
export const SPAWN_PROTECTION_SECONDS = 2;
// War length, tuned 2026-08-02 per direct playtest feedback: at the original 300-ticket pool,
// a war holding just 1-2 of 3 points drains in ~4-8 minutes, and the abrupt reset read as "the
// session restarting" rather than a new chapter of one long siege. Raised 8x so a full-blowout
// war (all 3 points held, worst-case 4/s drain) still takes a genuine 10 minutes, and a typical
// contested war (1-2 points held, ~1-2/s average drain) runs 20-40 minutes — long enough to feel
// like a real siege without being literally endless. The drain-by-points curve itself is
// unchanged (it was already reasonable); only the pool size changed. See ADR 0017.
export const WAR_TICKETS = 2_400;
// Longer than before (10s) so the victory ceremony Phase 8c-1 builds out has room to actually
// play before the next war begins, without making players wait too long for it.
export const VICTORY_SECONDS = 20;
export const CAPTURE_MAX_PROGRESS = 100;
export const CAPTURE_RATE_PER_PLAYER = 12;
export const CAPTURE_MAX_PLAYERS = 4;
// Indexed by the exact number of points held. Every additional objective now
// matters, while full seven-point dominance still caps at the ADR 0017/0019
// floor of 4/s: 2,400 tickets / 4 = 600 seconds. Fractional rates accumulate
// in the authoritative sim instead of being truncated. See ADR 0024.
export const CAPTURE_TICKET_DRAIN_BY_POINTS = [0, 0.5, 0.75, 1, 1.75, 2.5, 3.25, 4] as const;

// Earthwork (shovel) tuning — first-pass balance numbers, flagged in ADR 0019.
export const EARTHWORK_MAX = 60;
export const EARTHWORK_COOLDOWN_SECONDS = 2;
export const EARTHWORK_MAX_RANGE = 10;
// 1.5 m clears the standing eye line (1.55) so a mound is real cover, and stays
// under MAX_STEP_UP (2.5) so it remains climbable.
export const EARTHWORK_MOUND_HEIGHT = 1.5;
export const EARTHWORK_MOUND_WIDTH = 2.4;
export const EARTHWORK_MOUND_DEPTH = 2.4;
export const EARTHWORK_TRENCH_HEIGHT = 0.6;
export const EARTHWORK_TRENCH_WIDTH = 2.8;
export const EARTHWORK_TRENCH_DEPTH = 1.2;

export const enum EarthworkKind {
  Mound = 1,
  Trench = 2,
}
export const LAG_COMPENSATION_MAX_SECONDS = 0.25;
export const LAG_COMPENSATION_HISTORY_TICKS = 8;
export const ASSIST_DAMAGE_THRESHOLD = 25;
export const ASSIST_WINDOW_SECONDS = 10;
export const MELEE_DAMAGE = 35;
export const MELEE_RANGE = 2.2;
export const MELEE_SWING_SECONDS = 0.8;
/** Minimum attacker-forward dot product for a melee hit (≈69° half-arc). */
export const MELEE_FORWARD_DOT = 0.35;
// Phase 8e-3 weapon slots: sidearm dagger (faster, weaker, shorter, tighter
// arc) and the rifle-butt stroke a ranged slot performs on right-click.
export const DAGGER_DAMAGE = 20;
export const DAGGER_RANGE = 1.8;
export const DAGGER_SWING_SECONDS = 0.48;
export const DAGGER_FORWARD_DOT = 0.5;
export const BUTTSTROKE_DAMAGE = 15;
export const BUTTSTROKE_RANGE = 1.8;
export const BUTTSTROKE_SWING_SECONDS = 0.9;
export const BUTTSTROKE_FORWARD_DOT = 0.45;
/** Server-authoritative draw/holster time when switching weapon slots. */
export const WEAPON_SWITCH_SECONDS = 0.6;
export const WEAPON_SWITCH_TICKS = Math.round(WEAPON_SWITCH_SECONDS * SERVER_TICK_RATE);
export const ARQUEBUS_DAMAGE = 60;
export const ARQUEBUS_FALLOFF_START = 40;
export const ARQUEBUS_MAX_RANGE = 100;
/** Minimum fraction of base damage at the effective maximum range. */
export const ARQUEBUS_FALLOFF_MIN_FRACTION = 0.25;
export const ARQUEBUS_RELOAD_SECONDS = 6;
export const ARQUEBUS_FIRE_COOLDOWN_SECONDS = 0.8;
export const CROSSBOW_DAMAGE = 50;
export const CROSSBOW_MAX_RANGE = 90;
export const CROSSBOW_RELOAD_SECONDS = 4;
export const CROSSBOW_FIRE_COOLDOWN_SECONDS = 1;
export const CROSSBOW_TRAVEL_SECONDS = 0.22;
export const STATIONARY_ACCURACY_SECONDS = 0.8;
export const MOVING_SPREAD_RADIANS = 0.075;
export const STANDING_SPREAD_RADIANS = 0.008;
export const CAVALRY_SPEED_MULTIPLIER = 2.6;
export const CAVALRY_MAX_SPEED = MAX_SPEED * CAVALRY_SPEED_MULTIPLIER;
export const CAVALRY_ACCELERATION = 11;
export const CAVALRY_BRAKE_ACCELERATION = 18;
export const CAVALRY_TURN_RATE_RADIANS = 1.35;
export const CAVALRY_HORSE_HEALTH = 80;
export const CAVALRY_REMOUNT_RADIUS = 3;
export const CAVALRY_RIDER_HITBOX_RAISE = 0.9;
export const CAVALRY_HORSE_HIT_RADIUS = 0.9;
export const CAVALRY_LANCE_MIN_SPEED_FRACTION = 0.6;
export const CAVALRY_LANCE_MAX_DAMAGE = 90;
export const CAVALRY_LANCE_RECOUCH_SECONDS = 1.5;
export const CAVALRY_SABER_RANGE = 2.6;
export const CAVALRY_DISMOUNT_MARKER_SECONDS = 30;
export const CAVALRY_STAGGER_SECONDS = 1;
export const CLASS_CAVALRY_CAP_FRACTION = 0.2;
export const CLASS_ARTILLERY_CAP_FRACTION = 0.15;
export const CLASS_SUPPORT_CAP_FRACTION = 0.05;
export const SUPPORT_AURA_RADIUS = 12;
export const SUPPORT_RELOAD_MULTIPLIER = 0.85;
export const SUPPORT_SPEED_MULTIPLIER = 1.05;
export const SUPPORT_PAUSE_SECONDS = 4;
export const SUPPORT_AURA_RECOMPUTE_TICKS = 5;
export const SUPPORT_IN_COMBAT_SECONDS = 5;
export const SUPPORT_XP_PER_SECOND_PER_TEAMMATE = 2;
export const SUPPORT_XP_CAP_PER_SECOND = 10;
export const SUPPORT_MELEE_DAMAGE = 25;
export const XP_SUPPORT_KILL_ASSIST = 10;
export const SUPPORT_MILESTONE_EVERY = 25;
// Fixed Byzantine wall-guns are the quick small-cannon position: they can
// answer a push every three seconds. The mobile Sahi bombards below are the
// deliberate siege pieces and use their own 30–60 second reload curve.
export const ARTILLERY_SOLO_RELOAD_SECONDS = 3;
export const ARTILLERY_CREW_RELOAD_SECONDS = 3;
export const ARTILLERY_PROJECTILE_SPEED = 58;
export const ARTILLERY_PROJECTILE_GRAVITY = -18;
export const ARTILLERY_DIRECT_DAMAGE = 100;
export const ARTILLERY_SPLASH_RADIUS = 4;
export const ARTILLERY_SPLASH_EDGE_DAMAGE = 20;
export const ARTILLERY_WALL_DAMAGE = 120;
export const ARTILLERY_CREW_RADIUS = 4;
/** Heavy mobile Sahi bombard: slow to work, but capable of breaking a wall. */
export const BOMBARD_SOLO_RELOAD_SECONDS = 60;
export const BOMBARD_CREW_RELOAD_SECONDS = 30;
export const BOMBARD_PROJECTILE_SPEED = 48;
export const BOMBARD_DIRECT_DAMAGE = 170;
export const BOMBARD_SPLASH_RADIUS = 5;
export const BOMBARD_SPLASH_EDGE_DAMAGE = 35;
export const BOMBARD_WALL_DAMAGE = 180;
export const WALL_SEGMENT_HEALTH = 600;
export const XP_MOUNTED_KILL = 45;
export const XP_DISMOUNT_RIDER = 50;
export const XP_ARTILLERY_WALL_HIT = 30;
export const XP_BREACH_CREATED = 200;
export const XP_ARTILLERY_KILL = 55;
export const XP_ARTILLERY_CREW_ASSIST = 5;
export const WATER_SHORE_Z = 230;
/**
 * Visual water surface height (m), mirrored by the client's WATER_Y in
 * water.ts. Shared so the client can clamp visual projectile stops to the
 * surface over water zones (8e-17) without importing a client module.
 * The sim never reads this: every water rule is an x,z-zone test.
 */
export const WATER_SURFACE_Y = 0.03;
export const WATER_WADE_DEPTH = 5;
/** Water still slows infantry, but crossing a ford should be traversal, not a
 * near-stop. The previous 0.35 multiplier made even shallow crossings feel
 * sticky and made open-water recovery unnecessarily punishing. */
export const WATER_WADE_SPEED_MULTIPLIER = 0.6;
export const WATER_DRAIN_PER_SECOND = 3;
export const GALLEY_MAX_SPEED = 11;
export const GALLEY_ACCELERATION = 3;
export const GALLEY_BRAKE_ACCELERATION = 4;
export const GALLEY_TURN_RATE_RADIANS = 0.6;
// Galley navigable bounds (Phase 8c-4b): the sea band plus the river channel
// that runs from the Golden Horn into the west interior. The river geometry
// itself (RIVER_SEGMENTS/RIVER_HEADWATER in map.ts) is the true water
// boundary; the lane is an outer clamp and the sim additionally clamps to
// water geometry so galleys cannot sail over dry land.
export const GALLEY_LANE_MIN_Z = -240;
export const GALLEY_LANE_MAX_Z = 292;
export const GALLEY_LANE_MIN_X = -420;
export const GALLEY_LANE_MAX_X = 296;
export const GALLEY_HULL_HP = 1_000;
export const GALLEY_HULL_HALF_WIDTH = 9.5;
export const GALLEY_HULL_HALF_DEPTH = 2.4;
export const GALLEY_GUN_RELOAD_SECONDS = 6;
export const GALLEY_GUN_DAMAGE = 70;
export const GALLEY_SPLASH_RADIUS = 3;
export const GALLEY_SPLASH_EDGE_DAMAGE = 20;
export const GALLEY_SINK_SECONDS = 8;
export const GALLEY_RESPAWN_SECONDS = 45;
// Phase 8c-4b: an abandoned, at-rest galley more than 40 m from its dock is
// recalled to the dock after this delay, so a docked galley is reliably
// available to board (see ADR 0021).
export const GALLEY_RECALL_SECONDS = 15;
export const GALLEY_BOARD_RADIUS = 3;
export const GALLEY_HELM_ASSIST_DISTANCE = 12;
export const XP_GALLEY_KILL = 55;
export const XP_HULL_DAMAGE_DIVISOR = 50;
export const XP_SINKING_BLOW = 150;
export const XP_HELM_ASSIST = 10;

// Siege-loop mobile cannons (design doc docs/design/siege-loop.md, protocol v12).
// The four fixed Ottoman bombard emplacements are replaced by mobile cannons
// that spawn at CANNON_STAGING (map.ts) and are pushed to the wall; only the
// three Byzantine wall-guns remain as fixed emplacements.
export const SIEGE_CANNON_HP = 400;
export const SIEGE_CANNON_PUSH_SPEED_SOLO = 1.4;
export const SIEGE_CANNON_PUSH_SPEED_CREW = 2.0;
export const SIEGE_CANNON_MAX_PUSHERS = 2;
export const SIEGE_CANNON_DEPLOY_SECONDS = 3;
export const SIEGE_CANNON_UNDEPLOY_SECONDS = 2;
export const SIEGE_CANNON_RESPAWN_SECONDS = 60;
/** Topçu personal field gun: lighter carriage, shorter arc, and less wall damage than a bombard. */
export const PERSONAL_CANNON_HP = 220;
export const PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER = 0.7;
export const PERSONAL_CANNON_DEPLOY_SECONDS = 2;
export const PERSONAL_CANNON_UNDEPLOY_SECONDS = 1.5;
export const PERSONAL_CANNON_RELOAD_SECONDS = 8;
export const PERSONAL_CANNON_PROJECTILE_SPEED = 48;
export const PERSONAL_CANNON_DIRECT_DAMAGE = 75;
export const PERSONAL_CANNON_SPLASH_RADIUS = 3;
export const PERSONAL_CANNON_SPLASH_EDGE_DAMAGE = 15;
export const PERSONAL_CANNON_WALL_DAMAGE = 70;
export const PERSONAL_CANNON_RESPAWN_SECONDS = 5;
export const PERSONAL_CANNON_RADIUS = 1.15;
export const RIDERLESS_HORSE_LIFETIME_SECONDS = 300;
export const SIEGE_CANNON_BOARD_RADIUS = 3;
export const SIEGE_CANNON_RADIUS = 1.5;
// Aim limits reuse the old Ottoman bombard emplacement values.
export const SIEGE_CANNON_YAW_ARC = 0.62;
export const SIEGE_CANNON_MIN_PITCH = 0.12;
export const SIEGE_CANNON_MAX_PITCH = 0.6;
// Defender wall repair channel: restores HP but never revives a breach.
export const WALL_REPAIR_HP_PER_SECOND = 20;
export const WALL_REPAIR_RANGE = 3;
export const XP_CANNON_DESTROYED = 100;
export const XP_BREACH_CONTRIBUTOR = 100;
export const XP_WALL_HIT_CREW_SHARE = 10;
export const SIEGE_PUSH_XP_PER_SECOND = 2;
export const WALL_REPAIR_XP_PER_SECOND = 2;
/** One-time per-war reward for finding the owner-generated hound landmark. */
export const XP_EASTER_EGG = 100;
