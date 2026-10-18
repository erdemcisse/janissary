import {
  ANTI_FARM_DECAY,
  ANTI_FARM_MAX_KILLS_PER_VICTIM,
  ANTI_FARM_WINDOW_SECONDS,
  ASSIST_DAMAGE_THRESHOLD,
  ASSIST_WINDOW_SECONDS,
  BEST_MARKSMAN_MIN_SHOTS,
  BASE_SPAWN_POINT_INDEX,
  BYZANTINE_SPAWN,
  CAPTURE_MAX_PLAYERS,
  CAPTURE_MAX_PROGRESS,
  CAPTURE_POINT,
  CAPTURE_POINTS,
  DECHOS_HUNDE_EASTER_EGG,
  CAPTURE_RATE_PER_PLAYER,
  CAPTURE_TICKET_DRAIN_BY_POINTS,
  CAPSULE_RADIUS,
  CLASS_SUPPORT_CAP_FRACTION,
  FIXED_SIEGE_CANNON_COUNT,
  CombatEventType,
  encodeHitEventValue,
  EARTHWORK_COOLDOWN_SECONDS,
  EARTHWORK_MAX,
  EARTHWORK_MAX_RANGE,
  EARTHWORK_MOUND_HEIGHT,
  EARTHWORK_TRENCH_HEIGHT,
  EarthworkKind,
  FIXED_DT_SECONDS,
  GALLEY_ACCELERATION,
  GALLEY_BOARD_RADIUS,
  GALLEY_GUN_DAMAGE,
  GALLEY_GUN_RELOAD_SECONDS,
  GALLEY_HULL_HP,
  GALLEY_RECALL_SECONDS,
  GALLEY_LANE_MAX_X,
  GALLEY_LANE_MAX_Z,
  KillCause,
  GALLEY_LANE_MIN_X,
  GALLEY_LANE_MIN_Z,
  GALLEY_PASSENGER_SLOTS,
  GALLEY_RESPAWN_SECONDS,
  GALLEY_SINK_SECONDS,
  GALLEY_SPLASH_EDGE_DAMAGE,
  GALLEY_SPLASH_RADIUS,
  GATE_KILL_RADIUS,
  GROUND_CENTER_Y,
  HARBOR_POINT_INDEX,
  HEADSHOT_CENTER_OFFSET,
  HEADSHOT_RADIUS,
  HEALTH_REGEN_DELAY_SECONDS,
  HEALTH_REGEN_PER_SECOND,
  IDLE_XP_CUTOFF_SECONDS,
  InputButton,
  PlayerClass,
  LAG_COMPENSATION_HISTORY_TICKS,
  LAG_COMPENSATION_MAX_SECONDS,
  MAX_HEALTH,
  MAX_INPUT_QUEUE,
  MAX_PLAYERS,
  MAX_VEHICLES,
  MELEE_FORWARD_DOT,
  MELEE_RANGE,
  MedalCategory,
  MedalKind,
  OTTOMAN_SPAWN,
  PlayerFlag,
  DEPLOY_MIN_SECONDS,
  RESPAWN_SECONDS,
  RoundPhase,
            ShipEventType,
  SIEGE_BLOCKOUT,
  SIEGE_LADDERS,
  ARTILLERY_EMPLACEMENTS,
  WALL_SEGMENTS,
  ARTILLERY_EMPLACEMENT_COUNT,
  ARTILLERY_PROJECTILE_GRAVITY,
  ARTILLERY_PROJECTILE_SPEED,
  ARTILLERY_DIRECT_DAMAGE,
  ARTILLERY_SPLASH_RADIUS,
  ARTILLERY_SPLASH_EDGE_DAMAGE,
  ARTILLERY_SOLO_RELOAD_SECONDS,
  ARTILLERY_CREW_RELOAD_SECONDS,
  ARTILLERY_CREW_RADIUS,
  ARTILLERY_WALL_DAMAGE,
  BOMBARD_SOLO_RELOAD_SECONDS,
  BOMBARD_CREW_RELOAD_SECONDS,
  BOMBARD_PROJECTILE_SPEED,
  BOMBARD_DIRECT_DAMAGE,
  BOMBARD_SPLASH_RADIUS,
  BOMBARD_SPLASH_EDGE_DAMAGE,
  BOMBARD_WALL_DAMAGE,
  CAVALRY_HORSE_HEALTH,
  CAVALRY_REMOUNT_RADIUS,
  CAVALRY_RIDER_HITBOX_RAISE,
  CAVALRY_HORSE_HIT_RADIUS,
  CAVALRY_LANCE_MIN_SPEED_FRACTION,
  CAVALRY_LANCE_MAX_DAMAGE,
  CAVALRY_LANCE_RECOUCH_SECONDS,
  CAVALRY_MAX_STEP_UP,
  CAVALRY_DISMOUNT_MARKER_SECONDS,
  CAVALRY_STAGGER_SECONDS,
  MAX_ARTILLERY_PROJECTILES,
  MAX_SIEGE_CANNONS,
  MAX_HORSES,
  PERSONAL_CANNON_DIRECT_DAMAGE,
  PERSONAL_CANNON_DEPLOY_SECONDS,
  PERSONAL_CANNON_PROJECTILE_SPEED,
  PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER,
  PERSONAL_CANNON_RELOAD_SECONDS,
  PERSONAL_CANNON_RESPAWN_SECONDS,
  PERSONAL_CANNON_SPLASH_EDGE_DAMAGE,
  PERSONAL_CANNON_SPLASH_RADIUS,
  PERSONAL_CANNON_UNDEPLOY_SECONDS,
  PERSONAL_CANNON_WALL_DAMAGE,
  RIDERLESS_HORSE_LIFETIME_SECONDS,
  SIEGE_CANNON_BOARD_RADIUS,
  SIEGE_CANNON_DEPLOY_SECONDS,
  SIEGE_CANNON_MAX_PUSHERS,
  SIEGE_CANNON_MIN_PITCH,
  SIEGE_CANNON_MAX_PITCH,
  SIEGE_CANNON_PUSH_SPEED_CREW,
  SIEGE_CANNON_PUSH_SPEED_SOLO,
  SIEGE_CANNON_RESPAWN_SECONDS,
  SIEGE_CANNON_UNDEPLOY_SECONDS,
  SIEGE_CANNON_YAW_ARC,
  SIEGE_PUSH_XP_PER_SECOND,
  WALL_REPAIR_HP_PER_SECOND,
  WALL_REPAIR_RANGE,
  WALL_REPAIR_XP_PER_SECOND,
  SUPPORT_AURA_RADIUS,
  SUPPORT_AURA_RECOMPUTE_TICKS,
  SUPPORT_IN_COMBAT_SECONDS,
  SUPPORT_PAUSE_SECONDS,
  SUPPORT_RELOAD_MULTIPLIER,
  SUPPORT_SPEED_MULTIPLIER,
  SUPPORT_XP_CAP_PER_SECOND,
  SUPPORT_XP_PER_SECOND_PER_TEAMMATE,
  SUPPORT_MILESTONE_EVERY,
  WATER_DRAIN_PER_SECOND,
  WATER_SHORE_Z,
  WATER_WADE_DEPTH,
  WATER_WADE_SPEED_MULTIPLIER,
  WALL_SEGMENT_COUNT,
  WALL_SEGMENT_HEALTH,
  WallState,

  XP_EVENT_FLAG_HEADSHOT,
  XP_HEADSHOT_BONUS,
  XP_MOUNTED_KILL,
  XP_DISMOUNT_RIDER,
  XP_ARTILLERY_WALL_HIT,
  XP_BREACH_CREATED,
  XP_ARTILLERY_KILL,
  XP_ARTILLERY_CREW_ASSIST,
  XP_GALLEY_KILL,
  XP_HELM_ASSIST,
  XP_HULL_DAMAGE_DIVISOR,
  XP_SINKING_BLOW,
  XP_SUPPORT_KILL_ASSIST,
  XP_CANNON_DESTROYED,
  XP_BREACH_CONTRIBUTOR,
  XP_WALL_HIT_CREW_SHARE,
  SPAWN_PROTECTION_SECONDS,
  STATIONARY_ACCURACY_SECONDS,
  STANDING_SPREAD_RADIANS,
  Team,
  VICTORY_SECONDS,
  WAR_PARTICIPATION_MIN_SECONDS,
  WAR_TICKETS,
  WeaponType,
  XP_ASSIST,
  XP_CAPTURE_PRESENCE_PER_SECOND,
  XP_DEFENSE_KILL,
  XP_EVENT_FLAG_AT_GATE,
  XP_KILL,
  XP_POINT_CAPTURED,
  XP_WAR_PARTICIPATION,
  XP_WAR_VICTORY,
  XP_EASTER_EGG,
  XpSource,
  MOVING_SPREAD_RADIANS,
  raycastBoxes,
  simulateMovement,
  simulateCavalryMovement,
  sweepCapsuleAgainstBoxes,
  isWallBoxSolid,
  type CombatEvent,
  type EntityState,
  type InputMessage,
  type MovementState,
  type SnapshotMeta,
} from "@janissary/shared";
import { CLASS_TUNING, CAPSULE_HEIGHT, EntityKind, GALLEY_DOCKS, WEAPON_DEFS, aimedSpreadFactor, defaultClassForTeam, heightAt, inDeepWater, inRiver, isAllowed, onDeck, rangedWeaponForClass, raycastTerrain, slopeSpeedFactorAt, stepWeaponSlots, weaponDefAtSlot, DEFAULT_WEAPON_SLOT, type WeaponSlotState } from "@janissary/shared";
import { earthworkCollider, earthworkEntityId } from "./earthwork";
import { clampToWaterGeometry } from "./vehicle";
import {
  clampRewindTick,
} from "./lagCompensation";
import {
  createSpatialHash,
  querySpatialHashInto,
  rebuildSpatialHash,
  type SpatialHash,
} from "./spatialHash";
import {
  GALLEY_COUNT,
  createVehicleState,
  galleyProjectileGunId,
  isGalleyProjectileGun,
    spawnVehicleAtDock,
  stepGalleyKinematics,
  vehicleAabbOverlap,
  vehicleEntityId,
      vehicleLocalToWorld,
  vehicleOccupancyState,
  vehicleWorldHalfExtents,
  vehicleWorldToLocal,
  type HelmInput,
  type VehicleState,
} from "./vehicle";
import {
  CANNON_DAMAGER_RING,
  cannonEntityId,
  cannonIndexForProjectileGun,
  cannonOccupancyState,
  cannonPositionBlocked,
  cannonProjectileGunId,
  cannonPusherCount,
  clampCannonPosition,
  createCannonState,
  destroyCannon,
  isCannonProjectileGun,
  respawnCannon,
  spawnCannonsAtStaging,
  spawnPersonalCannon,
  despawnCannon,
  cannonRadius,
  isPersonalCannon,
  type CannonState,
} from "./cannon";
import { createHorseState, despawnHorse, findFreeHorse, horseEntityId, spawnHorse, type HorseState } from "./horse";

const XP_QUEUE_CAPACITY = 4096;
const MEDAL_QUEUE_CAPACITY = 1024;
const FARM_TRACKED_VICTIMS = 4;
const SHIP_EVENT_CAPACITY = 64;
/** Recent-damager ring per wall segment, for breach-contributor XP. */
const WALL_CONTRIBUTOR_RING = 4;

export interface QueuedInput extends InputMessage {}

interface DamageRecord {
  sourceEntityId: number;
  amount: number;
  tick: number;
}

interface PendingShot {
  sourceEntityId: number;
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  damage: number;
  headshotMultiplier: number;
  maxRange: number;
  /** Falloff start distance from the firing weapon's def; 0 = no falloff. */
  falloffStart: number;
  /** Minimum damage fraction at the effective maximum range. */
  falloffMinFraction?: number;
  killCause: KillCause;
  rewindTick: number;
  resolveTick: number;
}

interface TimedEvent extends CombatEvent {
  tick: number;
}

export interface RewindFrame {
  tick: number;
  readonly alive: Uint8Array;
  readonly entityId: Uint16Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly mounted: Uint8Array;
  readonly horseHp: Uint8Array;
  readonly aboard: Int8Array;
  readonly aboardOffsetX: Float32Array;
  readonly aboardOffsetZ: Float32Array;
  readonly vehicleX: Float32Array;
  readonly vehicleZ: Float32Array;
  readonly vehicleYaw: Float32Array;
}

export interface SimulationPhaseTimings {
  input: number;
  movement: number;
  combat: number;
  capture: number;
  artillery: number;
  naval: number;
}

export interface WorldState {
  tick: number;
  count: number;
  nextEntityId: number;
  randomState: number;
  readonly active: Uint8Array;
  readonly entityId: Uint16Array;
  readonly slotByEntityId: Map<number, number>;
  readonly name: string[];
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly velocityZ: Float32Array;
  readonly grounded: Uint8Array;
  readonly jumpHeld: Uint8Array;
  readonly yaw: Float32Array;
  readonly desiredYaw: Float32Array;
  readonly pitch: Float32Array;
  readonly buttons: Uint32Array;
  readonly prevButtons: Uint32Array;
  readonly ackInputSeq: Uint32Array;
  readonly lastReceivedInputSeq: Uint32Array;
  readonly inputQueues: QueuedInput[][];
  readonly team: Uint8Array;
  readonly playerClass: Uint8Array;
  readonly desiredClass: Uint8Array;
  readonly mounted: Uint8Array;
  readonly horseHp: Uint8Array;
  readonly horseMarkerUntilTick: Uint32Array;
  readonly horseMarkerX: Float32Array;
  readonly horseMarkerZ: Float32Array;
  readonly horses: HorseState;
  readonly staggerUntilTick: Uint32Array;
  readonly nextInteractTick: Uint32Array;
  readonly mannedGun: Int8Array;
  readonly gunnerSlot: Int16Array;
  readonly gunReloadUntilTick: Uint32Array;
  readonly gunYaw: Float32Array;
  readonly gunPitch: Float32Array;
  readonly projectileActive: Uint8Array;
  readonly projectileSourceSlot: Uint16Array;
  readonly projectileGun: Int8Array;
  readonly projectileX: Float32Array;
  readonly projectileY: Float32Array;
  readonly projectileZ: Float32Array;
  readonly projectileVelocityX: Float32Array;
  readonly projectileVelocityY: Float32Array;
  readonly projectileVelocityZ: Float32Array;
  readonly projectileUntilTick: Uint32Array;
  readonly wallHp: Uint16Array;
  readonly wallState: Uint8Array;
  readonly wallEventSegments: Uint8Array;
  readonly wallEventStates: Uint8Array;
  readonly wallEventAttackers: Uint16Array;
  readonly wallEventHpFrac: Uint8Array;
  /** Last emitted hpFrac per segment; damage/repair events fire on 1/16 crossings. */
  readonly wallLastFrac: Uint8Array;
  /** Recent wall damagers per segment (WALL_CONTRIBUTOR_RING entries each). */
  readonly wallContributorSlot: Int16Array;
  readonly wallContributorTick: Uint32Array;
  wallEventCount: number;
  readonly health: Uint8Array;
  /** u16: PlayerFlag.PushingCannon = 1<<8 must fit (protocol v12). */
  readonly flags: Uint16Array;
  readonly ammo: Uint8Array;
  readonly reloadUntilTick: Uint32Array;
  /** Active 1-based weapon slot per player (Phase 8e-3). */
  readonly activeWeaponSlot: Uint8Array;
  /** Slot being drawn while weaponSwitchTicks > 0. */
  readonly weaponSwitchTarget: Uint8Array;
  /** Draw/holster ticks remaining before the switch lands. */
  readonly weaponSwitchTicks: Uint8Array;
  /** 1 for server-driven bots: their melee resolves through the slot-1 def. */
  readonly bot: Uint8Array;
  readonly nextFireTick: Uint32Array;
  readonly nextMeleeTick: Uint32Array;
  readonly respawnAtTick: Uint32Array;
  readonly requestedSpawnPoint: Int8Array;
  readonly spawnProtectionUntilTick: Uint32Array;
  readonly lastDamagedTick: Uint32Array;
  readonly stationarySinceTick: Uint32Array;
  readonly kills: Uint8Array;
  readonly deaths: Uint8Array;
  readonly assists: Uint8Array;
  readonly captureTicks: Uint32Array;
  readonly damageRecords: DamageRecord[][];
  readonly rewindFrames: RewindFrame[];
  readonly pendingShots: PendingShot[];
  readonly events: TimedEvent[];
  readonly spatialHash: SpatialHash;
  readonly queryScratch: number[];
  readonly combatRewindTick: Uint32Array;
  readonly phaseTimings: SimulationPhaseTimings;
  readonly lastInputTick: Uint32Array;
  readonly warTicks: Uint32Array;
  readonly warCaptures: Uint16Array;
  readonly warShots: Uint16Array;
  readonly warHits: Uint16Array;
  readonly warHeadshots: Uint16Array;
  readonly warDefenseKills: Uint16Array;
  readonly warXp: Uint32Array;
  /** One-time Dechos Hunde discovery guard for the current war. */
  readonly easterEggFound: Uint8Array;
  readonly captureXpCarry: Float32Array;
  readonly pointOwner: Uint8Array;
  readonly pointProgress: Float32Array;
  readonly medalBits: Uint8Array;
  readonly farmVictims: Int32Array;
  readonly farmCounts: Uint8Array;
  readonly farmWindowTicks: Uint32Array;
  readonly xpQueueSlots: Uint16Array;
  readonly xpQueueSources: Uint8Array;
  readonly xpQueueAmounts: Uint16Array;
  readonly xpQueueFlags: Uint8Array;
  readonly medalQueueSlots: Uint16Array;
  readonly medalQueueCategories: Uint8Array;
  readonly medalQueueAmounts: Uint32Array;
  readonly torch: Uint8Array;
  readonly earthworkKind: Uint8Array;
  readonly earthworkX: Float32Array;
  readonly earthworkY: Float32Array;
  readonly earthworkZ: Float32Array;
  readonly earthworkPlacedTick: Uint32Array;
  earthworkCount: number;
  readonly nextEarthworkTick: Uint32Array;
  nextEventId: number;
  xpQueueHead: number;
  xpQueueTail: number;
  medalQueueHead: number;
  medalQueueTail: number;
  captureOwner: Team;
  captureProgress: number;
  ottomanTickets: number;
  byzantineTickets: number;
  ottomanTicketDrainCarry: number;
  byzantineTicketDrainCarry: number;
  roundPhase: RoundPhase;
  phaseUntilTick: number;
  readonly vehicles: VehicleState;
  readonly shipEventVehicles: Uint8Array;
  readonly shipEventTypes: Uint8Array;
  readonly shipEventOccupants: Uint16Array;
  shipEventHead: number;
  shipEventTail: number;
  readonly auraPauseUntilTick: Uint32Array;
  readonly auraXpCarry: Float32Array;
  readonly auraSource: Int16Array;
  readonly auraBuffed: Uint8Array;
  readonly lastCombatTick: Uint32Array;
  readonly buffedKillAssists: Uint16Array;
  readonly aboardVehicle: Int8Array;
  readonly aboardOffsetX: Float32Array;
  readonly aboardOffsetZ: Float32Array;
  readonly hullDamageCarry: Float32Array;
  readonly cannons: CannonState;
  /** Cannon a player crews (gunner or pusher): cannon index or -1. */
  readonly cannonCrew: Int8Array;
  readonly pushXpCarry: Float32Array;
  readonly repairXpCarry: Float32Array;
}

function allocateFloat(): Float32Array { return new Float32Array(MAX_PLAYERS); }

function createFrame(): RewindFrame {
  return {
    tick: 0,
    alive: new Uint8Array(MAX_PLAYERS),
    entityId: new Uint16Array(MAX_PLAYERS),
    x: allocateFloat(),
    y: allocateFloat(),
    z: allocateFloat(),
    mounted: new Uint8Array(MAX_PLAYERS),
    horseHp: new Uint8Array(MAX_PLAYERS),
    aboard: new Int8Array(MAX_PLAYERS).fill(-1),
    aboardOffsetX: allocateFloat(),
    aboardOffsetZ: allocateFloat(),
    vehicleX: new Float32Array(MAX_VEHICLES),
    vehicleZ: new Float32Array(MAX_VEHICLES),
    vehicleYaw: new Float32Array(MAX_VEHICLES),
  };
}

export function createWorldState(): WorldState {
  const vehicles = createVehicleState(GALLEY_DOCKS);
  for (let index = 0; index < GALLEY_COUNT; index += 1) {
    const dock = GALLEY_DOCKS[index];
    if (dock !== undefined) spawnVehicleAtDock(vehicles, index, dock.team, dock, GALLEY_HULL_HP);
  }
  const cannons = createCannonState();
  spawnCannonsAtStaging(cannons);
  return {
    tick: 0,
    count: 0,
    nextEntityId: 1,
    randomState: 0x5eeda11,
    active: new Uint8Array(MAX_PLAYERS),
    entityId: new Uint16Array(MAX_PLAYERS),
    slotByEntityId: new Map<number, number>(),
    name: new Array<string>(MAX_PLAYERS).fill(""),
    x: allocateFloat(), y: allocateFloat(), z: allocateFloat(),
    velocityX: allocateFloat(), velocityY: allocateFloat(), velocityZ: allocateFloat(),
    grounded: new Uint8Array(MAX_PLAYERS), jumpHeld: new Uint8Array(MAX_PLAYERS),
    yaw: allocateFloat(), desiredYaw: allocateFloat(), pitch: allocateFloat(),
    buttons: new Uint32Array(MAX_PLAYERS),
    prevButtons: new Uint32Array(MAX_PLAYERS),
    ackInputSeq: new Uint32Array(MAX_PLAYERS),
    lastReceivedInputSeq: new Uint32Array(MAX_PLAYERS),
    inputQueues: Array.from({ length: MAX_PLAYERS }, () => []),
    team: new Uint8Array(MAX_PLAYERS), playerClass: new Uint8Array(MAX_PLAYERS), desiredClass: new Uint8Array(MAX_PLAYERS), mounted: new Uint8Array(MAX_PLAYERS), horseHp: new Uint8Array(MAX_PLAYERS), horseMarkerUntilTick: new Uint32Array(MAX_PLAYERS), horseMarkerX: allocateFloat(), horseMarkerZ: allocateFloat(), staggerUntilTick: new Uint32Array(MAX_PLAYERS), nextInteractTick: new Uint32Array(MAX_PLAYERS), mannedGun: new Int8Array(MAX_PLAYERS).fill(-1), gunnerSlot: new Int16Array(ARTILLERY_EMPLACEMENT_COUNT).fill(-1), gunReloadUntilTick: new Uint32Array(ARTILLERY_EMPLACEMENT_COUNT), gunYaw: new Float32Array(ARTILLERY_EMPLACEMENT_COUNT), gunPitch: new Float32Array(ARTILLERY_EMPLACEMENT_COUNT), projectileActive: new Uint8Array(MAX_ARTILLERY_PROJECTILES), projectileSourceSlot: new Uint16Array(MAX_ARTILLERY_PROJECTILES), projectileGun: new Int8Array(MAX_ARTILLERY_PROJECTILES).fill(-1), projectileX: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileY: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileZ: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileVelocityX: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileVelocityY: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileVelocityZ: new Float32Array(MAX_ARTILLERY_PROJECTILES), projectileUntilTick: new Uint32Array(MAX_ARTILLERY_PROJECTILES), wallHp: new Uint16Array(WALL_SEGMENT_COUNT).fill(WALL_SEGMENT_HEALTH), wallState: new Uint8Array(WALL_SEGMENT_COUNT), wallEventSegments: new Uint8Array(WALL_SEGMENT_COUNT), wallEventStates: new Uint8Array(WALL_SEGMENT_COUNT), wallEventAttackers: new Uint16Array(WALL_SEGMENT_COUNT), wallEventHpFrac: new Uint8Array(WALL_SEGMENT_COUNT), wallLastFrac: new Uint8Array(WALL_SEGMENT_COUNT).fill(16), wallContributorSlot: new Int16Array(WALL_SEGMENT_COUNT * WALL_CONTRIBUTOR_RING).fill(-1), wallContributorTick: new Uint32Array(WALL_SEGMENT_COUNT * WALL_CONTRIBUTOR_RING), wallEventCount: 0, health: new Uint8Array(MAX_PLAYERS), flags: new Uint16Array(MAX_PLAYERS), ammo: new Uint8Array(MAX_PLAYERS),
    reloadUntilTick: new Uint32Array(MAX_PLAYERS), nextFireTick: new Uint32Array(MAX_PLAYERS), nextMeleeTick: new Uint32Array(MAX_PLAYERS),
    activeWeaponSlot: new Uint8Array(MAX_PLAYERS), weaponSwitchTarget: new Uint8Array(MAX_PLAYERS), weaponSwitchTicks: new Uint8Array(MAX_PLAYERS), bot: new Uint8Array(MAX_PLAYERS),
    respawnAtTick: new Uint32Array(MAX_PLAYERS), requestedSpawnPoint: new Int8Array(MAX_PLAYERS).fill(-1), spawnProtectionUntilTick: new Uint32Array(MAX_PLAYERS), lastDamagedTick: new Uint32Array(MAX_PLAYERS), stationarySinceTick: new Uint32Array(MAX_PLAYERS),
    kills: new Uint8Array(MAX_PLAYERS), deaths: new Uint8Array(MAX_PLAYERS), assists: new Uint8Array(MAX_PLAYERS), captureTicks: new Uint32Array(MAX_PLAYERS),
    damageRecords: Array.from({ length: MAX_PLAYERS }, () => []),
    rewindFrames: Array.from({ length: LAG_COMPENSATION_HISTORY_TICKS }, createFrame),
    pendingShots: [], events: [], nextEventId: 1,
    spatialHash: createSpatialHash(), queryScratch: [], combatRewindTick: new Uint32Array(MAX_PLAYERS),
    phaseTimings: { input: 0, movement: 0, combat: 0, capture: 0, artillery: 0, naval: 0 },
    lastInputTick: new Uint32Array(MAX_PLAYERS),
    warTicks: new Uint32Array(MAX_PLAYERS),
    warCaptures: new Uint16Array(MAX_PLAYERS),
    warShots: new Uint16Array(MAX_PLAYERS),
    warHits: new Uint16Array(MAX_PLAYERS),
    warHeadshots: new Uint16Array(MAX_PLAYERS),
    warDefenseKills: new Uint16Array(MAX_PLAYERS),
    warXp: new Uint32Array(MAX_PLAYERS),
    easterEggFound: new Uint8Array(MAX_PLAYERS),
    captureXpCarry: new Float32Array(MAX_PLAYERS),
    pointOwner: new Uint8Array(CAPTURE_POINTS.length),
    pointProgress: new Float32Array(CAPTURE_POINTS.length),
    medalBits: new Uint8Array(MAX_PLAYERS),
    farmVictims: new Int32Array(MAX_PLAYERS * FARM_TRACKED_VICTIMS).fill(-1),
    farmCounts: new Uint8Array(MAX_PLAYERS * FARM_TRACKED_VICTIMS),
    farmWindowTicks: new Uint32Array(MAX_PLAYERS * FARM_TRACKED_VICTIMS),
    xpQueueSlots: new Uint16Array(XP_QUEUE_CAPACITY),
    xpQueueSources: new Uint8Array(XP_QUEUE_CAPACITY),
    xpQueueAmounts: new Uint16Array(XP_QUEUE_CAPACITY),
    xpQueueFlags: new Uint8Array(XP_QUEUE_CAPACITY),
    medalQueueSlots: new Uint16Array(MEDAL_QUEUE_CAPACITY),
    medalQueueCategories: new Uint8Array(MEDAL_QUEUE_CAPACITY),
    medalQueueAmounts: new Uint32Array(MEDAL_QUEUE_CAPACITY),
    torch: new Uint8Array(MAX_PLAYERS),
    earthworkKind: new Uint8Array(EARTHWORK_MAX),
    earthworkX: new Float32Array(EARTHWORK_MAX),
    earthworkY: new Float32Array(EARTHWORK_MAX),
    earthworkZ: new Float32Array(EARTHWORK_MAX),
    earthworkPlacedTick: new Uint32Array(EARTHWORK_MAX),
    earthworkCount: 0,
    nextEarthworkTick: new Uint32Array(MAX_PLAYERS),
    captureOwner: Team.None, captureProgress: 0, ottomanTickets: WAR_TICKETS, byzantineTickets: WAR_TICKETS,
    ottomanTicketDrainCarry: 0, byzantineTicketDrainCarry: 0,
    roundPhase: RoundPhase.Active, phaseUntilTick: 0,
    xpQueueHead: 0,
    xpQueueTail: 0,
    medalQueueHead: 0,
    medalQueueTail: 0,
    vehicles,
    shipEventVehicles: new Uint8Array(SHIP_EVENT_CAPACITY),
    shipEventTypes: new Uint8Array(SHIP_EVENT_CAPACITY),
    shipEventOccupants: new Uint16Array(SHIP_EVENT_CAPACITY),
    shipEventHead: 0,
    shipEventTail: 0,
    auraPauseUntilTick: new Uint32Array(MAX_PLAYERS),
    auraXpCarry: new Float32Array(MAX_PLAYERS),
    auraSource: new Int16Array(MAX_PLAYERS).fill(-1),
    auraBuffed: new Uint8Array(MAX_PLAYERS),
    lastCombatTick: new Uint32Array(MAX_PLAYERS),
    buffedKillAssists: new Uint16Array(MAX_PLAYERS),
    aboardVehicle: new Int8Array(MAX_PLAYERS).fill(-1),
    aboardOffsetX: allocateFloat(),
    aboardOffsetZ: allocateFloat(),
    hullDamageCarry: allocateFloat(),
    cannons,
    horses: createHorseState(),
    cannonCrew: new Int8Array(MAX_PLAYERS).fill(-1),
    pushXpCarry: allocateFloat(),
    repairXpCarry: allocateFloat(),
  };
}
function findFreeSlot(world: WorldState): number {
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) if (world.active[slot] === 0) return slot;
  return -1;
}

/** Scratch for stepping the shared slot machine from typed arrays (no allocation). */
const weaponSlotScratch: WeaponSlotState = { activeSlot: DEFAULT_WEAPON_SLOT, targetSlot: DEFAULT_WEAPON_SLOT, ticksRemaining: 0 };
function ticks(seconds: number): number { return Math.ceil(seconds / FIXED_DT_SECONDS); }
function isAlive(world: WorldState, slot: number): boolean { return (world.flags[slot] ?? 0) & PlayerFlag.Alive ? true : false; }

// Reused scratch for nearby-earthwork collider boxes — the sim is
// zero-allocation, so the fill below writes into this fixed array and the
// collision sweep/raycast consume only the first `count` entries. Mutable
// mirror of StaticBox (readonly), assignable to the sweep's parameter.
interface ScratchBox {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: "stone" | "earth" | "wood";
}

const earthworkBoxScratch: ScratchBox[] = Array.from(
  { length: EARTHWORK_MAX },
  () => ({ id: "earthwork-scratch", x: 0, y: 0, z: 0, width: 0, height: 0, depth: 0, material: "earth" as const }),
);

function fillNearbyEarthworkBoxes(world: WorldState, x: number, z: number, radius: number, out: ScratchBox[]): number {
  let count = 0;
  const radiusSquared = radius * radius;
  for (let index = 0; index < EARTHWORK_MAX; index += 1) {
    if ((world.earthworkKind[index] ?? 0) === 0) continue;
    const dx = (world.earthworkX[index] ?? 0) - x;
    const dz = (world.earthworkZ[index] ?? 0) - z;
    if (dx * dx + dz * dz > radiusSquared) continue;
    const box = out[count];
    if (box === undefined) continue;
    const kind = world.earthworkKind[index] as EarthworkKind;
    const collider = earthworkCollider(index, kind, world.earthworkX[index] ?? 0, world.earthworkY[index] ?? 0, world.earthworkZ[index] ?? 0);
    box.id = collider.id;
    box.x = collider.x;
    box.y = collider.y;
    box.z = collider.z;
    box.width = collider.width;
    box.height = collider.height;
    box.depth = collider.depth;
    count += 1;
  }
  return count;
}
function classMatchesTeam(playerClass: PlayerClass, team: Team): boolean { return CLASS_TUNING[playerClass]?.team === team; }
function isCavalryClass(playerClass: PlayerClass): boolean { return CLASS_TUNING[playerClass]?.cavalry === true; }
function isArtilleryClass(playerClass: PlayerClass): boolean { return CLASS_TUNING[playerClass]?.artillery === true; }
function personalCannonIndexForOwner(world: WorldState, slot: number): number {
  for (let index = FIXED_SIEGE_CANNON_COUNT; index < MAX_SIEGE_CANNONS; index += 1) {
    if (world.cannons.active[index] !== 0 && world.cannons.ownerSlot[index] === slot) return index;
  }
  return -1;
}

function releasePersonalCannon(world: WorldState, slot: number): void {
  const index = personalCannonIndexForOwner(world, slot);
  if (index < 0) return;
  releaseCannonStation(world, slot);
  despawnCannon(world.cannons, index);
}

/**
 * Releases a wall-gun emplacement occupied by `slot` (both directions of the
 * owner/emplacement pair). Death, disconnect, and respawn all call this; the
 * emplacement must never stay booked by a player who is no longer alive and
 * manning it (reality-pass finding: dying at a wall-gun left `gunnerSlot`
 * occupied forever, blocking every later attempt including re-manning after
 * redeploy).
 */
function releaseMannedGun(world: WorldState, slot: number): void {
  const gun = world.mannedGun[slot] ?? -1;
  if (gun >= 0) world.gunnerSlot[gun] = -1;
  world.mannedGun[slot] = -1;
  world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.ManningArtillery;
}

function ensurePersonalCannon(world: WorldState, slot: number): void {
  if (world.playerClass[slot] !== PlayerClass.Topcu) return;
  if (personalCannonIndexForOwner(world, slot) >= 0) return;
  for (let index = FIXED_SIEGE_CANNON_COUNT; index < MAX_SIEGE_CANNONS; index += 1) {
    if (world.cannons.active[index] !== 0) continue;
    const yaw = world.yaw[slot] ?? 0;
    const sideX = Math.cos(yaw);
    const sideZ = -Math.sin(yaw);
    spawnPersonalCannon(world.cannons, index, slot, (world.x[slot] ?? 0) + sideX * 1.5, (world.z[slot] ?? 0) + sideZ * 1.5, yaw, world.team[slot] as Team, world.tick);
    return;
  }
}

function riderlessHorseNear(world: WorldState, slot: number): number {
  const radiusSquared = CAVALRY_REMOUNT_RADIUS * CAVALRY_REMOUNT_RADIUS;
  let nearest = -1;
  let nearestDistance = radiusSquared;
  for (let index = 0; index < MAX_HORSES; index += 1) {
    if (world.horses.active[index] === 0) continue;
    const dx = (world.horses.x[index] ?? 0) - (world.x[slot] ?? 0);
    const dz = (world.horses.z[index] ?? 0) - (world.z[slot] ?? 0);
    const distance = dx * dx + dz * dz;
    if (distance <= nearestDistance) { nearest = index; nearestDistance = distance; }
  }
  return nearest;
}

function leaveHorse(world: WorldState, slot: number): void {
  const index = findFreeHorse(world.horses);
  if (index < 0) return;
  spawnHorse(world.horses, index, world.x[slot] ?? 0, world.z[slot] ?? 0, world.yaw[slot] ?? 0, world.team[slot] as Team, world.tick);
}

function updateRiderlessHorses(world: WorldState): void {
  const lifetime = ticks(RIDERLESS_HORSE_LIFETIME_SECONDS);
  for (let index = 0; index < MAX_HORSES; index += 1) {
    if (world.horses.active[index] !== 0 && world.tick - (world.horses.lastTouchedTick[index] ?? 0) >= lifetime) despawnHorse(world.horses, index);
  }
}

function classWithinCap(world: WorldState, slot: number, playerClass: PlayerClass, team: Team): boolean {
  if (!isCavalryClass(playerClass) && !isArtilleryClass(playerClass) && !isSupportClass(playerClass)) return true;
  let teamTotal = 0;
  let roleTotal = 0;
  for (let index = 0; index < MAX_PLAYERS; index += 1) {
    // Phase 8e-25 (reality pass): bots are excluded from the tally. The role
    // caps exist so a HUMAN pick is never crowded out; the backfill's ~100
    // filler bots otherwise exhausted the support/artillery/cavalry slots
    // (2 support slots / team at 50 bots) before a player ever chose them.
    if (index === slot || world.active[index] === 0 || world.team[index] !== team || world.bot[index] === 1) continue;
    teamTotal += 1;
    const current = world.desiredClass[index] as PlayerClass;
    if ((isCavalryClass(playerClass) && isCavalryClass(current)) || (isArtilleryClass(playerClass) && isArtilleryClass(current)) || (isSupportClass(playerClass) && isSupportClass(current))) roleTotal += 1;
  }
  const cap = isCavalryClass(playerClass) ? Math.max(1, Math.floor((teamTotal + 1) * 0.2))
    : isArtilleryClass(playerClass) ? Math.max(1, Math.floor((teamTotal + 1) * 0.15))
      : Math.max(1, Math.floor((teamTotal + 1) * CLASS_SUPPORT_CAP_FRACTION));
  return roleTotal < cap;
}

function enemyPresentAtPoint(world: WorldState, pointIndex: number, team: Team): boolean {
  const point = CAPTURE_POINTS[pointIndex];
  if (point === undefined) return true;
  const radiusSquared = point.radius * point.radius;
  for (let candidate = 0; candidate < MAX_PLAYERS; candidate += 1) {
    if (world.active[candidate] === 0 || !isAlive(world, candidate) || world.team[candidate] === team) continue;
    const dx = (world.x[candidate] ?? 0) - point.x;
    const dz = (world.z[candidate] ?? 0) - point.z;
    if (dx * dx + dz * dz <= radiusSquared) return true;
  }
  return false;
}

function spawnCenterY(world: WorldState, x: number, z: number): number {
  // Terrain floor first (0 at every capture point by the keep-flat mask), then
  // any solid box the capsule stands on (hill-fort stack tops, platforms).
  let centerY = heightAt(x, z) + GROUND_CENTER_Y;
  for (const box of SIEGE_BLOCKOUT) {
    if (!isWallBoxSolid(box, world.wallState)) continue;
    if (Math.abs(x - box.x) > box.width / 2 - CAPSULE_RADIUS || Math.abs(z - box.z) > box.depth / 2 - CAPSULE_RADIUS) continue;
    centerY = Math.max(centerY, box.y + box.height / 2 + GROUND_CENTER_Y);
  }
  return centerY;
}

function validForwardSpawn(world: WorldState, pointIndex: number, team: Team): boolean {
  const point = CAPTURE_POINTS[pointIndex];
  return point !== undefined && world.pointOwner[pointIndex] === team && !enemyPresentAtPoint(world, pointIndex, team);
}

/**
 * Spawn facing (siege-loop §3.2): face the team's primary objective instead of
 * the fixed home-base yaw. Ottomans face the weakest non-breached wall segment
 * (the gate once every segment is breached); Byzantines face the
 * most-threatened (lowest-HP damaged) segment, or the gate while the wall is
 * untouched. yaw convention matches movement: forward = (-sin(yaw), -cos(yaw)).
 */
function spawnFacingYaw(world: WorldState, team: Team, spawnX: number, spawnZ: number): number {
  let targetX = CAPTURE_POINT.x;
  let targetZ = CAPTURE_POINT.z;
  let weakestHp = Infinity;
  for (const wall of WALL_SEGMENTS) {
    if (world.wallState[wall.id] === WallState.Breached) continue;
    const hp = world.wallHp[wall.id] ?? 0;
    if (team === Team.Byzantine && hp >= WALL_SEGMENT_HEALTH) continue;
    if (hp < weakestHp) {
      weakestHp = hp;
      targetX = wall.box.x;
      targetZ = wall.box.z;
    }
  }
  return Math.atan2(-(targetX - spawnX), -(targetZ - spawnZ));
}

/**
 * Phase 8e-13 (ADR 0041): bots keep the classic auto-respawn timer; humans
 * wait for an explicit Deploy request, so a human's respawnAtTick is only the
 * deploy-eligibility floor (DEPLOY_MIN_SECONDS), not a schedule.
 */
function scheduleRespawn(world: WorldState, slot: number): void {
  world.respawnAtTick[slot] = world.tick + ticks(world.bot[slot] === 1 ? RESPAWN_SECONDS : DEPLOY_MIN_SECONDS);
}

function spawnPlayer(world: WorldState, slot: number): void {
  const team = world.team[slot] as Team;
  const base = team === Team.Ottoman ? OTTOMAN_SPAWN : BYZANTINE_SPAWN;
  const requestedPoint = world.requestedSpawnPoint[slot] ?? -1;
  const point = requestedPoint >= 0 && validForwardSpawn(world, requestedPoint, team) ? CAPTURE_POINTS[requestedPoint] : undefined;
  let spawnX = base.x;
  let spawnY = heightAt(base.x, base.z) + GROUND_CENTER_Y;
  let spawnZ = base.z;
  if (point !== undefined) {
    spawnX = point.x;
    // The gate objective straddles the intact wall. Six metres of team-side
    // offset keeps the capsule clear while remaining inside its radius-eight
    // capture zone. Other objectives are clear at their centres.
    spawnZ = requestedPoint === 0 ? point.z + (team === Team.Ottoman ? 6 : -6) : point.z;
    spawnY = spawnCenterY(world, spawnX, spawnZ);
  }
  world.requestedSpawnPoint[slot] = -1;
  const playerClass = world.desiredClass[slot] as PlayerClass;
  world.playerClass[slot] = classMatchesTeam(playerClass, world.team[slot] as Team) ? playerClass : defaultClassForTeam(world.team[slot] as Team);
  const ranged = rangedWeaponForClass(world.playerClass[slot] as PlayerClass, world.team[slot] as Team);
  const support = isSupportClass(world.playerClass[slot] as PlayerClass);
  world.x[slot] = spawnX; world.y[slot] = spawnY; world.z[slot] = spawnZ;
  world.velocityX[slot] = 0; world.velocityY[slot] = 0; world.velocityZ[slot] = 0;
  world.grounded[slot] = 1; world.jumpHeld[slot] = 0;
  const spawnYaw = spawnFacingYaw(world, world.team[slot] as Team, spawnX, spawnZ);
  world.yaw[slot] = spawnYaw; world.desiredYaw[slot] = spawnYaw; world.pitch[slot] = 0;
  world.health[slot] = MAX_HEALTH; world.ammo[slot] = support ? 0 : (ranged.magazineSize ?? 1);
  const mountedSpawn = isCavalryClass(world.playerClass[slot] as PlayerClass);
  world.flags[slot] = PlayerFlag.Alive | PlayerFlag.SpawnProtected | (mountedSpawn ? PlayerFlag.Mounted : 0);
  world.spawnProtectionUntilTick[slot] = world.tick + ticks(SPAWN_PROTECTION_SECONDS);
  world.reloadUntilTick[slot] = 0;
  world.nextFireTick[slot] = 0;
  world.nextMeleeTick[slot] = 0;
  world.nextEarthworkTick[slot] = 0;
  world.respawnAtTick[slot] = 0;
  world.lastDamagedTick[slot] = 0;
  world.stationarySinceTick[slot] = world.tick;
  world.mounted[slot] = mountedSpawn ? 1 : 0; world.horseHp[slot] = mountedSpawn ? CAVALRY_HORSE_HEALTH : 0; world.staggerUntilTick[slot] = 0;
  // A respawn is a fresh state: no emplacement, vehicle station, or cannon
  // crew can survive death (reality pass — stale mannedGun/gunnerSlot and
  // aboardVehicle glued players to a dead station after redeploy).
  releaseMannedGun(world, slot);
  world.aboardVehicle[slot] = -1;
  world.cannonCrew[slot] = -1; world.pushXpCarry[slot] = 0; world.repairXpCarry[slot] = 0;
  world.torch[slot] = 0;
  // Held buttons are not fresh presses: seed prevButtons from the live value so
  // a key held through death doesn't read as a rising edge on the respawn tick
  // (8e-3 review finding — covered the slot machine AND the torch toggle).
  world.prevButtons[slot] = world.buttons[slot] ?? 0;
  // Weapon slots reset on every (re)spawn: the ranged primary, no draw timer.
  world.activeWeaponSlot[slot] = DEFAULT_WEAPON_SLOT;
  world.weaponSwitchTarget[slot] = DEFAULT_WEAPON_SLOT;
  world.weaponSwitchTicks[slot] = 0;
  ensurePersonalCannon(world, slot);
  emitEvent(world, CombatEventType.Respawn, world.entityId[slot] ?? 0, 0, 0);
}

export function addPlayer(world: WorldState, name: string, team: Team = Team.Ottoman, playerClass: PlayerClass = defaultClassForTeam(team), bot = false): { entityId: number; slot: number } | undefined {
  const slot = findFreeSlot(world);
  if (slot < 0 || team === Team.None) return undefined;
  const entityId = world.nextEntityId;
  world.nextEntityId = entityId >= 65_535 ? 1 : entityId + 1;
  if (world.slotByEntityId.has(entityId)) return undefined;
  world.active[slot] = 1; world.entityId[slot] = entityId; world.slotByEntityId.set(entityId, slot); world.name[slot] = name;
  world.bot[slot] = bot ? 1 : 0;
  world.team[slot] = team; world.desiredClass[slot] = classMatchesTeam(playerClass, team) && classWithinCap(world, slot, playerClass, team) ? playerClass : defaultClassForTeam(team); world.ackInputSeq[slot] = 0; world.lastReceivedInputSeq[slot] = 0; world.inputQueues[slot]?.splice(0);
  world.kills[slot] = 0; world.deaths[slot] = 0; world.assists[slot] = 0; world.captureTicks[slot] = 0; world.damageRecords[slot]?.splice(0);
  world.lastInputTick[slot] = 0;
  world.warTicks[slot] = 0; world.warCaptures[slot] = 0; world.warShots[slot] = 0; world.warHits[slot] = 0; world.warHeadshots[slot] = 0;
  world.warDefenseKills[slot] = 0; world.warXp[slot] = 0; world.captureXpCarry[slot] = 0; world.medalBits[slot] = 0;
  world.easterEggFound[slot] = 0;
  clearFarmEntries(world, slot);
  world.count += 1; spawnPlayer(world, slot);
  return { entityId, slot };
}

export function removePlayer(world: WorldState, entityId: number): boolean {
  const slot = world.slotByEntityId.get(entityId);
  if (slot === undefined) return false;
  if (world.mounted[slot] !== 0) dismount(world, slot, false, true);
  releasePersonalCannon(world, slot);
  world.active[slot] = 0;
  world.entityId[slot] = 0;
  world.team[slot] = Team.None;
  world.health[slot] = 0;
  world.flags[slot] = 0;
  releaseMannedGun(world, slot);
  releaseCannonStation(world, slot);
  releaseVehicleStation(world, slot);
  world.auraBuffed[slot] = 0;
  world.auraSource[slot] = -1;
  world.playerClass[slot] = PlayerClass.None;
  world.desiredClass[slot] = PlayerClass.None;
  world.mounted[slot] = 0;
  world.horseHp[slot] = 0;
  world.buttons[slot] = 0;
  world.grounded[slot] = 0;
  world.jumpHeld[slot] = 0;
  world.ammo[slot] = 0;
  world.reloadUntilTick[slot] = 0;
  world.activeWeaponSlot[slot] = 0;
  world.weaponSwitchTarget[slot] = 0;
  world.weaponSwitchTicks[slot] = 0;
  world.bot[slot] = 0;
  world.nextFireTick[slot] = 0;
  world.nextMeleeTick[slot] = 0;
  world.nextEarthworkTick[slot] = 0;
  world.torch[slot] = 0;
  world.easterEggFound[slot] = 0;
  world.prevButtons[slot] = 0;
  world.respawnAtTick[slot] = 0;
  world.requestedSpawnPoint[slot] = -1;
  world.spawnProtectionUntilTick[slot] = 0;
  world.lastDamagedTick[slot] = 0;
  world.stationarySinceTick[slot] = 0;
  world.ackInputSeq[slot] = 0;
  world.lastReceivedInputSeq[slot] = 0;
  world.slotByEntityId.delete(entityId);
  world.name[slot] = "";
  world.inputQueues[slot]?.splice(0);
  world.damageRecords[slot]?.splice(0);
  clearFarmEntries(world, slot);
  world.count -= 1;
  return true;
}

export function enqueueInput(world: WorldState, entityId: number, input: QueuedInput): boolean {
  const slot = world.slotByEntityId.get(entityId);
  if (slot === undefined || input.seq <= (world.lastReceivedInputSeq[slot] ?? 0)) return false;
  world.lastReceivedInputSeq[slot] = input.seq;
  const queue = world.inputQueues[slot]; if (queue === undefined) return false;
  if (queue.length >= MAX_INPUT_QUEUE) queue.splice(0, queue.length - MAX_INPUT_QUEUE + 1);
  queue.push(input); return true;
}

export function requestClass(world: WorldState, entityId: number, playerClass: PlayerClass): boolean {
  const slot = world.slotByEntityId.get(entityId);
  if (slot === undefined || !classMatchesTeam(playerClass, world.team[slot] as Team)) return false;
  if (!classWithinCap(world, slot, playerClass, world.team[slot] as Team)) return false;
  world.desiredClass[slot] = playerClass;
  return true;
}

/**
 * Phase 8e-13 (ADR 0041): explicit redeploy. The player must be dead and the
 * DEPLOY_MIN_SECONDS floor (recorded in respawnAtTick at death) must have
 * elapsed; spawnPlayer then consumes the already-recorded spawn point and
 * class. While alive it is a no-op, so a double-click or a late duplicate
 * Deploy is harmless.
 */
export function requestDeploy(world: WorldState, entityId: number): boolean {
  const slot = world.slotByEntityId.get(entityId);
  if (slot === undefined || world.active[slot] === 0 || isAlive(world, slot)) return false;
  if (world.tick < (world.respawnAtTick[slot] ?? 0)) return false;
  spawnPlayer(world, slot);
  return true;
}

/** Records only a point index; the authoritative position is never supplied by the client. */
export function requestSpawnPoint(world: WorldState, entityId: number, pointIndex: number): boolean {
  const slot = world.slotByEntityId.get(entityId);
  if (slot === undefined || isAlive(world, slot)) return false;
  if (pointIndex === BASE_SPAWN_POINT_INDEX) {
    world.requestedSpawnPoint[slot] = -1;
    return true;
  }
  const team = world.team[slot] as Team;
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= CAPTURE_POINTS.length) return false;
  if (!validForwardSpawn(world, pointIndex, team)) return false;
  world.requestedSpawnPoint[slot] = pointIndex;
  return true;
}

function movementStateAt(world: WorldState, slot: number): MovementState {
  return { x: world.x[slot] ?? 0, y: world.y[slot] ?? GROUND_CENTER_Y, z: world.z[slot] ?? 0, velocityX: world.velocityX[slot] ?? 0, velocityY: world.velocityY[slot] ?? 0, velocityZ: world.velocityZ[slot] ?? 0, yaw: world.yaw[slot] ?? 0, pitch: world.pitch[slot] ?? 0, grounded: world.grounded[slot] !== 0, jumpHeld: world.jumpHeld[slot] !== 0 };
}

function writeMovementState(world: WorldState, slot: number, state: Readonly<MovementState>): void {
  world.x[slot] = state.x; world.y[slot] = state.y; world.z[slot] = state.z; world.velocityX[slot] = state.velocityX; world.velocityY[slot] = state.velocityY; world.velocityZ[slot] = state.velocityZ; world.yaw[slot] = state.yaw; world.pitch[slot] = state.pitch;
  world.grounded[slot] = state.grounded ? 1 : 0; world.jumpHeld[slot] = state.jumpHeld ? 1 : 0;
}

function randomSigned(world: WorldState): number {
  let value = world.randomState >>> 0;
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
  world.randomState = value >>> 0;
  return (world.randomState / 0xffff_ffff) * 2 - 1;
}

function emitEvent(world: WorldState, type: CombatEventType, sourceEntityId: number, targetEntityId: number, value: number): void {
  world.events.push({ id: world.nextEventId++ & 0xffff, type, sourceEntityId, targetEntityId, value: Math.max(0, Math.min(255, Math.round(value))), tick: world.tick });
  if (world.events.length > 32) world.events.shift();
}

function xpEligible(world: WorldState, slot: number): boolean {
  return world.tick - (world.lastInputTick[slot] ?? world.tick) <= ticks(IDLE_XP_CUTOFF_SECONDS);
}

function grantXp(world: WorldState, slot: number, source: XpSource, amount: number, flags = 0): void {
  if (amount <= 0 || !xpEligible(world, slot)) return;
  const index = world.xpQueueTail;
  world.xpQueueSlots[index] = slot;
  world.xpQueueSources[index] = source;
  world.xpQueueAmounts[index] = Math.min(65_535, amount);
  world.xpQueueFlags[index] = flags;
  world.xpQueueTail = (world.xpQueueTail + 1) % XP_QUEUE_CAPACITY;
  if (world.xpQueueTail === world.xpQueueHead) world.xpQueueHead = (world.xpQueueHead + 1) % XP_QUEUE_CAPACITY;
  world.warXp[slot] = Math.min(0xffff_ffff, (world.warXp[slot] ?? 0) + amount);
}

function checkEasterEggDiscovery(world: WorldState, slot: number): void {
  if (world.easterEggFound[slot] !== 0 || !isAlive(world, slot)) return;
  const dx = (world.x[slot] ?? 0) - DECHOS_HUNDE_EASTER_EGG.x;
  const dz = (world.z[slot] ?? 0) - DECHOS_HUNDE_EASTER_EGG.z;
  if (dx * dx + dz * dz > DECHOS_HUNDE_EASTER_EGG.radius * DECHOS_HUNDE_EASTER_EGG.radius) return;
  world.easterEggFound[slot] = 1;
  grantXp(world, slot, XpSource.EasterEgg, XP_EASTER_EGG);
}

/**
 * Queues a lifetime medal counter delta for a slot. Drains off the tick path
 * through drainMedalCounters; the same anti-idle rule as XP keeps AFK players
 * from farming collection progress.
 */
function grantMedalCounter(world: WorldState, slot: number, category: MedalCategory, amount: number): void {
  if (amount <= 0 || !xpEligible(world, slot)) return;
  const index = world.medalQueueTail;
  world.medalQueueSlots[index] = slot;
  world.medalQueueCategories[index] = category;
  world.medalQueueAmounts[index] = Math.min(0xffff_ffff, amount);
  world.medalQueueTail = (world.medalQueueTail + 1) % MEDAL_QUEUE_CAPACITY;
  if (world.medalQueueTail === world.medalQueueHead) world.medalQueueHead = (world.medalQueueHead + 1) % MEDAL_QUEUE_CAPACITY;
}

export function drainMedalCounters(world: WorldState): readonly { slot: number; category: MedalCategory; amount: number }[] {
  const drained: { slot: number; category: MedalCategory; amount: number }[] = [];
  while (world.medalQueueHead !== world.medalQueueTail) {
    const slot = world.medalQueueSlots[world.medalQueueHead];
    const category = world.medalQueueCategories[world.medalQueueHead] as MedalCategory;
    const amount = world.medalQueueAmounts[world.medalQueueHead];
    world.medalQueueHead = (world.medalQueueHead + 1) % MEDAL_QUEUE_CAPACITY;
    if (slot === undefined || category === undefined || amount === undefined) continue;
    drained.push({ slot, category, amount });
  }
  return drained;
}

function farmDecay(world: WorldState, killerSlot: number, victimSlot: number): boolean {
  const base = killerSlot * FARM_TRACKED_VICTIMS;
  let freeIndex = -1;
  for (let index = 0; index < FARM_TRACKED_VICTIMS; index += 1) {
    const entry = base + index;
    const victim = world.farmVictims[entry] ?? -1;
    if (victim === victimSlot) {
      const windowStart = world.farmWindowTicks[entry] ?? world.tick;
      if (world.tick - windowStart > ticks(ANTI_FARM_WINDOW_SECONDS)) {
        world.farmCounts[entry] = 1;
        world.farmWindowTicks[entry] = world.tick;
        return false;
      }
      const count = Math.min(255, (world.farmCounts[entry] ?? 0) + 1);
      world.farmCounts[entry] = count;
      world.farmWindowTicks[entry] = world.tick;
      return count > ANTI_FARM_MAX_KILLS_PER_VICTIM;
    }
    if (victim < 0 && freeIndex < 0) freeIndex = entry;
  }
  if (freeIndex >= 0) {
    world.farmVictims[freeIndex] = victimSlot;
    world.farmCounts[freeIndex] = 1;
    world.farmWindowTicks[freeIndex] = world.tick;
  }
  return false;
}

function clearFarmEntries(world: WorldState, slot: number): void {
  const base = slot * FARM_TRACKED_VICTIMS;
  for (let index = 0; index < FARM_TRACKED_VICTIMS; index += 1) {
    const entry = base + index;
    world.farmVictims[entry] = -1;
    world.farmCounts[entry] = 0;
    world.farmWindowTicks[entry] = 0;
  }
  for (let other = 0; other < MAX_PLAYERS; other += 1) {
    if (other === slot) continue;
    const otherBase = other * FARM_TRACKED_VICTIMS;
    for (let index = 0; index < FARM_TRACKED_VICTIMS; index += 1) {
      const entry = otherBase + index;
      if ((world.farmVictims[entry] ?? -1) === slot) world.farmVictims[entry] = -1;
    }
  }
}

function distanceToCapturePoint(world: WorldState, slot: number): number {
  return Math.hypot((world.x[slot] ?? 0) - CAPTURE_POINT.x, (world.z[slot] ?? 0) - CAPTURE_POINT.z);
}

function isSupportClass(playerClass: PlayerClass): boolean {
  return CLASS_TUNING[playerClass]?.support === true;
}

function emitShipEvent(world: WorldState, vehicleIndex: number, eventType: ShipEventType, occupantEntityId: number): void {
  const index = world.shipEventTail;
  world.shipEventVehicles[index] = vehicleIndex;
  world.shipEventTypes[index] = eventType;
  world.shipEventOccupants[index] = occupantEntityId;
  world.shipEventTail = (world.shipEventTail + 1) % SHIP_EVENT_CAPACITY;
  if (world.shipEventTail === world.shipEventHead) world.shipEventHead = (world.shipEventHead + 1) % SHIP_EVENT_CAPACITY;
}

export function drainShipEvents(world: WorldState): readonly { vehicleIndex: number; eventType: ShipEventType; occupantEntityId: number }[] {
  const events: { vehicleIndex: number; eventType: ShipEventType; occupantEntityId: number }[] = [];
  while (world.shipEventHead !== world.shipEventTail) {
    events.push({
      vehicleIndex: world.shipEventVehicles[world.shipEventHead] ?? 0,
      eventType: world.shipEventTypes[world.shipEventHead] as ShipEventType,
      occupantEntityId: world.shipEventOccupants[world.shipEventHead] ?? 0,
    });
    world.shipEventHead = (world.shipEventHead + 1) % SHIP_EVENT_CAPACITY;
  }
  return events;
}

function vehiclePassengerSlot(world: WorldState, vehicleIndex: number, slot: number): number {
  for (let index = 0; index < GALLEY_PASSENGER_SLOTS; index += 1) {
    if ((world.vehicles.passengers[vehicleIndex * GALLEY_PASSENGER_SLOTS + index] ?? -1) === slot) {
      return vehicleIndex * GALLEY_PASSENGER_SLOTS + index;
    }
  }
  return -1;
}

function vehicleStationForSlot(world: WorldState, vehicleIndex: number, slot: number): "helm" | "gun1" | "gun2" | "passenger" | undefined {
  if ((world.vehicles.helm[vehicleIndex] ?? -1) === slot) return "helm";
  if ((world.vehicles.gun1[vehicleIndex] ?? -1) === slot) return "gun1";
  if ((world.vehicles.gun2[vehicleIndex] ?? -1) === slot) return "gun2";
  if (vehiclePassengerSlot(world, vehicleIndex, slot) >= 0) return "passenger";
  return undefined;
}

function releaseVehicleStation(world: WorldState, slot: number): void {
  const vehicleIndex = world.aboardVehicle[slot] ?? -1;
  if (vehicleIndex < 0 || world.vehicles.active[vehicleIndex] === 0) return;
  const station = vehicleStationForSlot(world, vehicleIndex, slot);
  const occupantEntityId = world.entityId[slot] ?? 0;
  if (station === "helm") {
    world.vehicles.helm[vehicleIndex] = -1;
    emitShipEvent(world, vehicleIndex, ShipEventType.HelmReleased, occupantEntityId);
  } else if (station === "gun1") {
    world.vehicles.gun1[vehicleIndex] = -1;
    emitShipEvent(world, vehicleIndex, ShipEventType.Gun1Released, occupantEntityId);
  } else if (station === "gun2") {
    world.vehicles.gun2[vehicleIndex] = -1;
    emitShipEvent(world, vehicleIndex, ShipEventType.Gun2Released, occupantEntityId);
  } else if (station === "passenger") {
    const passengerSlot = vehiclePassengerSlot(world, vehicleIndex, slot);
    if (passengerSlot >= 0) world.vehicles.passengers[passengerSlot] = -1;
    world.vehicles.passengerCount[vehicleIndex] = Math.max(0, (world.vehicles.passengerCount[vehicleIndex] ?? 0) - 1);
    emitShipEvent(world, vehicleIndex, ShipEventType.PassengerLeft, occupantEntityId);
  }
  world.aboardVehicle[slot] = -1;
  world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.Aboard;
  const galleyX = world.vehicles.x[vehicleIndex] ?? 0;
  const galleyZ = world.vehicles.z[vehicleIndex] ?? 0;
  world.x[slot] = galleyX;
  world.z[slot] = Math.min(galleyZ, WATER_SHORE_Z + 2);
  world.y[slot] = heightAt(world.x[slot] ?? 0, world.z[slot] ?? 0) + GROUND_CENTER_Y;
  world.velocityY[slot] = 0;
  world.grounded[slot] = 1;
  world.jumpHeld[slot] = 0;
}

function boardVehicle(world: WorldState, slot: number, vehicleIndex: number): void {
  const vehicles = world.vehicles;
  const occupantEntityId = world.entityId[slot] ?? 0;
  if ((vehicles.helm[vehicleIndex] ?? -1) < 0) {
    vehicles.helm[vehicleIndex] = slot;
    emitShipEvent(world, vehicleIndex, ShipEventType.HelmClaimed, occupantEntityId);
  } else if ((vehicles.gun1[vehicleIndex] ?? -1) < 0) {
    vehicles.gun1[vehicleIndex] = slot;
    emitShipEvent(world, vehicleIndex, ShipEventType.Gun1Claimed, occupantEntityId);
  } else if ((vehicles.gun2[vehicleIndex] ?? -1) < 0) {
    vehicles.gun2[vehicleIndex] = slot;
    emitShipEvent(world, vehicleIndex, ShipEventType.Gun2Claimed, occupantEntityId);
  } else if ((vehicles.passengerCount[vehicleIndex] ?? 0) < GALLEY_PASSENGER_SLOTS) {
    for (let index = 0; index < GALLEY_PASSENGER_SLOTS; index += 1) {
      const passengerSlot = vehicleIndex * GALLEY_PASSENGER_SLOTS + index;
      if ((vehicles.passengers[passengerSlot] ?? -1) >= 0) continue;
      vehicles.passengers[passengerSlot] = slot;
      vehicles.passengerCount[vehicleIndex] = (vehicles.passengerCount[vehicleIndex] ?? 0) + 1;
      emitShipEvent(world, vehicleIndex, ShipEventType.PassengerBoarded, occupantEntityId);
      break;
    }
  } else {
    return;
  }
  const local = vehicleWorldToLocal(vehicles.x[vehicleIndex] ?? 0, vehicles.z[vehicleIndex] ?? 0, vehicles.yaw[vehicleIndex] ?? 0, world.x[slot] ?? 0, world.z[slot] ?? 0);
  world.aboardVehicle[slot] = vehicleIndex;
  world.aboardOffsetX[slot] = local.x;
  world.aboardOffsetZ[slot] = local.z;
  world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.Aboard;
  world.velocityX[slot] = 0;
  world.velocityZ[slot] = 0;
  world.velocityY[slot] = 0;
  world.grounded[slot] = 1;
  world.jumpHeld[slot] = 0;
  world.respawnAtTick[slot] = 0;
}

function aboardWorldPosition(world: WorldState, slot: number): { x: number; z: number } | undefined {
  const vehicleIndex = world.aboardVehicle[slot] ?? -1;
  if (vehicleIndex < 0 || world.vehicles.active[vehicleIndex] === 0) return undefined;
  const vehicles = world.vehicles;
  return vehicleLocalToWorld(
    vehicles.x[vehicleIndex] ?? 0,
    vehicles.z[vehicleIndex] ?? 0,
    vehicles.yaw[vehicleIndex] ?? 0,
    world.aboardOffsetX[slot] ?? 0,
    world.aboardOffsetZ[slot] ?? 0,
  );
}

function auraEligible(world: WorldState, slot: number): boolean {
  return isSupportClass(world.playerClass[slot] as PlayerClass) && isAlive(world, slot) && world.tick >= (world.auraPauseUntilTick[slot] ?? 0);
}

function inCombat(world: WorldState, slot: number): boolean {
  return world.tick - (world.lastCombatTick[slot] ?? 0) <= ticks(SUPPORT_IN_COMBAT_SECONDS)
    || world.tick - (world.lastDamagedTick[slot] ?? 0) <= ticks(SUPPORT_IN_COMBAT_SECONDS);
}

function updateAuras(world: WorldState): void {
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.auraBuffed[slot] === 0) continue;
    world.auraBuffed[slot] = 0;
    world.auraSource[slot] = -1;
    world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.AuraActive;
  }
  for (let support = 0; support < MAX_PLAYERS; support += 1) {
    if (!auraEligible(world, support)) continue;
    querySpatialHashInto(world.spatialHash, world, world.x[support] ?? 0, world.z[support] ?? 0, SUPPORT_AURA_RADIUS, world.queryScratch);
    let combatTeammates = 0;
    for (const target of world.queryScratch) {
      if (target === support || world.active[target] === 0 || !isAlive(world, target) || world.team[target] !== world.team[support]) continue;
      world.auraBuffed[target] = 1;
      world.auraSource[target] = support;
      world.flags[target] = (world.flags[target] ?? 0) | PlayerFlag.AuraActive;
      if (inCombat(world, target)) combatTeammates += 1;
    }
    if (combatTeammates > 0) {
      world.auraXpCarry[support] = (world.auraXpCarry[support] ?? 0) + Math.min(SUPPORT_XP_CAP_PER_SECOND, SUPPORT_XP_PER_SECOND_PER_TEAMMATE * combatTeammates) * FIXED_DT_SECONDS * SUPPORT_AURA_RECOMPUTE_TICKS;
      const whole = Math.floor(world.auraXpCarry[support] ?? 0);
      if (whole >= 1) {
        world.auraXpCarry[support] = (world.auraXpCarry[support] ?? 0) - whole;
        grantXp(world, support, XpSource.SupportTick, whole);
      }
    }
  }
}

function waterMultiplier(world: WorldState, slot: number): number {
  const x = world.x[slot] ?? 0;
  const z = world.z[slot] ?? 0;
  if ((world.flags[slot] ?? 0) & PlayerFlag.Aboard) return 1;
  // Bridge decks and dock piers are dry footing, not water (Phase 8c-4b).
  if (onDeck(x, z)) return 1;
  if (z <= WATER_SHORE_Z - WATER_WADE_DEPTH && !inRiver(x, z)) return 1;
  return WATER_WADE_SPEED_MULTIPLIER;
}

function applyWaterDrain(world: WorldState, slot: number): void {
  const x = world.x[slot] ?? 0;
  const z = world.z[slot] ?? 0;
  if ((world.flags[slot] ?? 0) & PlayerFlag.Aboard) return;
  // Docks and bridge decks are not swimming — standing on a pier keeps the
  // feet dry regardless of world z (Phase 8c-4b galley-access fix).
  if (onDeck(x, z)) return;
  if (!inDeepWater(x, z)) return;
  if (world.tick % ticks(1) !== 0) return;
  world.health[slot] = Math.max(0, (world.health[slot] ?? 0) - WATER_DRAIN_PER_SECOND);
  world.lastDamagedTick[slot] = world.tick;
  if ((world.health[slot] ?? 0) > 0) return;
  if (world.mounted[slot] !== 0) dismount(world, slot, false, true);
  releasePersonalCannon(world, slot);
  world.flags[slot] = 0;
  scheduleRespawn(world, slot);
  world.deaths[slot] = Math.min(255, (world.deaths[slot] ?? 0) + 1);
  // Drowning was silent: water deaths emitted no event, so no kill-feed line
  // and no death notification (Phase 8c-7). Sourceless event: source 0, the
  // same convention GalleySunk uses; the feed renders it as a world-style
  // line, and the client's name lookup must tolerate entity 0.
  emitEvent(world, CombatEventType.Death, 0, world.entityId[slot] ?? 0, KillCause.Drowning);
}

function harborHeldBy(world: WorldState, team: Team): boolean {
  return (world.pointOwner[HARBOR_POINT_INDEX] ?? Team.None) === team;
}

function damageGalleyHull(world: WorldState, vehicleIndex: number, damage: number, sourceSlot: number): void {
  const vehicles = world.vehicles;
  if (vehicles.active[vehicleIndex] === 0 || (vehicles.listingUntilTick[vehicleIndex] ?? 0) > world.tick) return;
  const remaining = Math.max(0, (vehicles.hullHp[vehicleIndex] ?? 0) - Math.round(damage));
  vehicles.hullHp[vehicleIndex] = remaining;
  if (sourceSlot >= 0 && world.active[sourceSlot] !== 0) {
    world.hullDamageCarry[sourceSlot] = (world.hullDamageCarry[sourceSlot] ?? 0) + damage;
    while ((world.hullDamageCarry[sourceSlot] ?? 0) >= XP_HULL_DAMAGE_DIVISOR) {
      world.hullDamageCarry[sourceSlot] -= XP_HULL_DAMAGE_DIVISOR;
      grantXp(world, sourceSlot, XpSource.HullDamage, 1);
    }
  }
  if (remaining > 0) return;
  sinkGalley(world, vehicleIndex, sourceSlot);
}

function sinkGalley(world: WorldState, vehicleIndex: number, sourceSlot: number): void {
  const vehicles = world.vehicles;
  if ((vehicles.listingUntilTick[vehicleIndex] ?? 0) > world.tick) return;
  vehicles.listingUntilTick[vehicleIndex] = world.tick + ticks(GALLEY_SINK_SECONDS);
  vehicles.speed[vehicleIndex] = 0;
  emitShipEvent(world, vehicleIndex, ShipEventType.Sunk, 0);
  emitEvent(world, CombatEventType.GalleySunk, 0, vehicleEntityId(vehicleIndex), 0);
  if (sourceSlot >= 0 && world.active[sourceSlot] !== 0) {
    const shooterVehicle = world.aboardVehicle[sourceSlot] ?? -1;
    const crew: number[] = [];
    if (shooterVehicle >= 0) {
      const candidates = [vehicles.helm[shooterVehicle] ?? -1, vehicles.gun1[shooterVehicle] ?? -1, vehicles.gun2[shooterVehicle] ?? -1];
      for (const candidate of candidates) {
        if (candidate >= 0 && world.active[candidate] !== 0 && !crew.includes(candidate)) crew.push(candidate);
      }
      for (let index = 0; index < GALLEY_PASSENGER_SLOTS; index += 1) {
        const passenger = vehicles.passengers[shooterVehicle * GALLEY_PASSENGER_SLOTS + index] ?? -1;
        if (passenger >= 0 && world.active[passenger] !== 0 && !crew.includes(passenger)) crew.push(passenger);
      }
    } else {
      crew.push(sourceSlot);
    }
    const share = Math.max(1, Math.floor(XP_SINKING_BLOW / Math.max(1, crew.length)));
    for (const crewSlot of crew) {
      grantXp(world, crewSlot, XpSource.SinkingBlow, share);
      grantMedalCounter(world, crewSlot, MedalCategory.SeaWolf, 1);
    }
  }
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0 || (world.aboardVehicle[slot] ?? -1) !== vehicleIndex) continue;
    releaseVehicleStation(world, slot);
  }
}

function respawnGalley(world: WorldState, vehicleIndex: number): void {
  const dock = GALLEY_DOCKS[vehicleIndex];
  if (dock === undefined) return;
  spawnVehicleAtDock(world.vehicles, vehicleIndex, dock.team, dock, GALLEY_HULL_HP);
  emitShipEvent(world, vehicleIndex, ShipEventType.Respawned, 0);
}

function updateVehicles(world: WorldState): void {
  const vehicles = world.vehicles;
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    if (vehicles.active[vehicleIndex] === 0) {
      const respawnAt = vehicles.respawnAtTick[vehicleIndex] ?? 0;
      if (respawnAt > 0 && world.tick >= respawnAt && harborHeldBy(world, vehicles.team[vehicleIndex] as Team)) {
        respawnGalley(world, vehicleIndex);
      }
      continue;
    }
    const listing = (vehicles.listingUntilTick[vehicleIndex] ?? 0) > world.tick;
    const listingEnded = (vehicles.listingUntilTick[vehicleIndex] ?? 0) > 0 && world.tick >= (vehicles.listingUntilTick[vehicleIndex] ?? 0);
    if (listingEnded) {
      vehicles.active[vehicleIndex] = 0;
      vehicles.listingUntilTick[vehicleIndex] = 0;
      vehicles.respawnAtTick[vehicleIndex] = world.tick + ticks(GALLEY_RESPAWN_SECONDS);
      vehicles.helm[vehicleIndex] = -1;
      vehicles.gun1[vehicleIndex] = -1;
      vehicles.gun2[vehicleIndex] = -1;
      vehicles.passengerCount[vehicleIndex] = 0;
      for (let index = 0; index < GALLEY_PASSENGER_SLOTS; index += 1) vehicles.passengers[vehicleIndex * GALLEY_PASSENGER_SLOTS + index] = -1;
      continue;
    }
    if (listing) continue;

    const helm = vehicles.helm[vehicleIndex] ?? -1;
    let kinematics = { x: vehicles.x[vehicleIndex] ?? 0, z: vehicles.z[vehicleIndex] ?? 0, yaw: vehicles.yaw[vehicleIndex] ?? 0, speed: vehicles.speed[vehicleIndex] ?? 0 };
    if (helm >= 0 && world.active[helm] !== 0 && isAlive(world, helm)) {
      const buttons = world.buttons[helm] ?? 0;
      const helmInput: HelmInput = {
        forward: (buttons & InputButton.Forward) !== 0 ? 1 : (buttons & InputButton.Backward) !== 0 ? -1 : 0,
        turn: (buttons & InputButton.Right) !== 0 ? 1 : (buttons & InputButton.Left) !== 0 ? -1 : 0,
      };
      kinematics = stepGalleyKinematics(kinematics, helmInput, FIXED_DT_SECONDS);
    } else {
      kinematics.speed = Math.max(0, kinematics.speed - GALLEY_ACCELERATION * FIXED_DT_SECONDS);
      // Same heading convention as the helmed path (x += cos, z += sin): an
      // unhelmed galley keeps drifting along its current heading while
      // decelerating, instead of the old 90°-off drift.
      kinematics.x = Math.max(GALLEY_LANE_MIN_X, Math.min(GALLEY_LANE_MAX_X, kinematics.x + Math.cos(kinematics.yaw) * kinematics.speed * FIXED_DT_SECONDS));
      kinematics.z = Math.max(GALLEY_LANE_MIN_Z, Math.min(GALLEY_LANE_MAX_Z, kinematics.z + Math.sin(kinematics.yaw) * kinematics.speed * FIXED_DT_SECONDS));
    }
    // Water containment (Phase 8c-4b): the lane box now covers the river, so
    // clamp the galley into actual water geometry (sea band or river channel)
    // instead of letting it sail over dry land.
    const water = clampToWaterGeometry(kinematics.x, kinematics.z);
    kinematics.x = water.x;
    kinematics.z = water.z;
    vehicles.x[vehicleIndex] = kinematics.x;
    vehicles.z[vehicleIndex] = kinematics.z;
    vehicles.yaw[vehicleIndex] = kinematics.yaw;
    vehicles.speed[vehicleIndex] = kinematics.speed;

    // Vacant-recall (Phase 8c-4b): an abandoned galley at rest far from its
    // dock is recalled to the dock after a short delay, so there is reliably
    // something to board without chasing a patrol route.
    const occupants = (vehicles.helm[vehicleIndex] ?? -1) >= 0
      || (vehicles.gun1[vehicleIndex] ?? -1) >= 0
      || (vehicles.gun2[vehicleIndex] ?? -1) >= 0
      || (vehicles.passengerCount[vehicleIndex] ?? 0) > 0;
    const dockX = vehicles.dockX[vehicleIndex] ?? 0;
    const dockZ = vehicles.dockZ[vehicleIndex] ?? 0;
    const awayFromDock = Math.hypot(kinematics.x - dockX, kinematics.z - dockZ) > 40;
    if (occupants || kinematics.speed > 0.1 || !awayFromDock) {
      vehicles.recallAtTick[vehicleIndex] = 0;
    } else if ((vehicles.recallAtTick[vehicleIndex] ?? 0) === 0) {
      vehicles.recallAtTick[vehicleIndex] = world.tick + ticks(GALLEY_RECALL_SECONDS);
    } else if (world.tick >= (vehicles.recallAtTick[vehicleIndex] ?? 0)) {
      respawnGalley(world, vehicleIndex);
      continue;
    }

    for (let other = vehicleIndex + 1; other < MAX_VEHICLES; other += 1) {
      if (vehicles.active[other] === 0 || (vehicles.listingUntilTick[other] ?? 0) > world.tick) continue;
      const otherX = vehicles.x[other] ?? 0;
      const otherZ = vehicles.z[other] ?? 0;
      const otherYaw = vehicles.yaw[other] ?? 0;
      if (!vehicleAabbOverlap(kinematics, { x: otherX, z: otherZ, yaw: otherYaw })) continue;
      const overlap = Math.abs(kinematics.x - otherX);
      const push = Math.max(0.1, (vehicleWorldHalfExtents(kinematics.yaw).halfWidth + vehicleWorldHalfExtents(otherYaw).halfWidth) - overlap);
      vehicles.x[vehicleIndex] = Math.max(GALLEY_LANE_MIN_X, Math.min(GALLEY_LANE_MAX_X, kinematics.x - Math.sign(kinematics.x - otherX || 1) * push * 0.5));
      vehicles.x[other] = Math.max(GALLEY_LANE_MIN_X, Math.min(GALLEY_LANE_MAX_X, otherX + Math.sign(kinematics.x - otherX || 1) * push * 0.5));
      vehicles.speed[vehicleIndex] = 0;
      vehicles.speed[other] = 0;
    }

    const fireGun = (station: number, gunnerSlot: number, reloadUntilTick: number): void => {
      if (gunnerSlot < 0 || world.active[gunnerSlot] === 0 || !isAlive(world, gunnerSlot)) return;
      if (world.tick < reloadUntilTick) return;
      if ((world.buttons[gunnerSlot] ?? 0) & InputButton.Fire) {
        const gunId = galleyProjectileGunId(vehicleIndex, station);
        let projectile = -1;
        for (let index = 0; index < MAX_ARTILLERY_PROJECTILES; index += 1) if (world.projectileActive[index] === 0) { projectile = index; break; }
        if (projectile < 0) return;
        if (station === 0) vehicles.gun1ReloadUntilTick[vehicleIndex] = world.tick + ticks(GALLEY_GUN_RELOAD_SECONDS);
        else vehicles.gun2ReloadUntilTick[vehicleIndex] = world.tick + ticks(GALLEY_GUN_RELOAD_SECONDS);
        const previousGunYaw = station === 0 ? vehicles.gun1Yaw[vehicleIndex] : vehicles.gun2Yaw[vehicleIndex];
        const gunYaw = world.desiredYaw[gunnerSlot] ?? previousGunYaw ?? kinematics.yaw;
        const gunPitch = Math.max(0.05, Math.min(0.9, world.pitch[gunnerSlot] ?? 0.25));
        if (station === 0) vehicles.gun1Yaw[vehicleIndex] = gunYaw;
        else vehicles.gun2Yaw[vehicleIndex] = gunYaw;
        const gunLocalX = (station === 0 ? -1 : 1) * (9.5 + 0.8);
        const muzzle = vehicleLocalToWorld(kinematics.x, kinematics.z, kinematics.yaw, gunLocalX, 0);
        const cosPitch = Math.cos(gunPitch);
        world.projectileActive[projectile] = 1;
        world.projectileSourceSlot[projectile] = gunnerSlot;
        world.projectileGun[projectile] = gunId;
        world.projectileX[projectile] = muzzle.x;
        world.projectileY[projectile] = 1.6;
        world.projectileZ[projectile] = muzzle.z;
        world.projectileVelocityX[projectile] = -Math.sin(gunYaw) * cosPitch * ARTILLERY_PROJECTILE_SPEED;
        world.projectileVelocityY[projectile] = Math.sin(gunPitch) * ARTILLERY_PROJECTILE_SPEED;
        world.projectileVelocityZ[projectile] = -Math.cos(gunYaw) * cosPitch * ARTILLERY_PROJECTILE_SPEED;
        world.projectileUntilTick[projectile] = world.tick + ticks(5);
        emitEvent(world, CombatEventType.ArtilleryFire, world.entityId[gunnerSlot] ?? 0, vehicleEntityId(vehicleIndex), 0);
      }
    };
    fireGun(0, vehicles.gun1[vehicleIndex] ?? -1, vehicles.gun1ReloadUntilTick[vehicleIndex] ?? 0);
    fireGun(1, vehicles.gun2[vehicleIndex] ?? -1, vehicles.gun2ReloadUntilTick[vehicleIndex] ?? 0);
  }
}

function projectileHitsGalley(world: WorldState, x: number, z: number, excludeVehicle = -1): number {
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    if (world.vehicles.active[vehicleIndex] === 0 || vehicleIndex === excludeVehicle) continue;
    const extents = vehicleWorldHalfExtents(world.vehicles.yaw[vehicleIndex] ?? 0);
    if (Math.abs(x - (world.vehicles.x[vehicleIndex] ?? 0)) <= extents.halfWidth && Math.abs(z - (world.vehicles.z[vehicleIndex] ?? 0)) <= extents.halfDepth) {
      return vehicleIndex;
    }
  }
  return -1;
}

function settleWar(world: WorldState, winner: Team): void {
  let maxCaptures = 0;
  let maxDefenseKills = 0;
  let maxPresence = 0;
  let bestMarksmanSlot = -1;
  let bestMarksmanRatio = -1;
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    if ((world.warTicks[slot] ?? 0) >= ticks(WAR_PARTICIPATION_MIN_SECONDS)) grantXp(world, slot, XpSource.WarParticipation, XP_WAR_PARTICIPATION);
    if (world.team[slot] === winner) grantXp(world, slot, XpSource.WarVictory, XP_WAR_VICTORY);
    const captures = world.warCaptures[slot] ?? 0;
    if (captures > maxCaptures) maxCaptures = captures;
    const defenseKills = world.warDefenseKills[slot] ?? 0;
    if (defenseKills > maxDefenseKills) maxDefenseKills = defenseKills;
    const presence = world.captureTicks[slot] ?? 0;
    if (presence > maxPresence) maxPresence = presence;
    const shots = world.warShots[slot] ?? 0;
    if (shots >= BEST_MARKSMAN_MIN_SHOTS) {
      const ratio = (world.warHits[slot] ?? 0) / shots;
      if (ratio > bestMarksmanRatio) {
        bestMarksmanRatio = ratio;
        bestMarksmanSlot = slot;
      }
    }
  }
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    let mask = 0;
    if (maxCaptures > 0 && (world.warCaptures[slot] ?? 0) === maxCaptures) mask |= 1 << (MedalKind.MostCaptures - 1);
    if (maxDefenseKills > 0 && (world.warDefenseKills[slot] ?? 0) === maxDefenseKills) mask |= 1 << (MedalKind.GateKeeper - 1);
    if (maxPresence > 0 && (world.captureTicks[slot] ?? 0) === maxPresence) mask |= 1 << (MedalKind.VeteranPresence - 1);
    if (slot === bestMarksmanSlot) mask |= 1 << (MedalKind.BestMarksman - 1);
    world.medalBits[slot] = mask;
  }
}

function resetWarStats(world: WorldState): void {
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    world.warTicks[slot] = 0;
    world.warCaptures[slot] = 0;
    world.warShots[slot] = 0;
    world.warHits[slot] = 0;
    world.warDefenseKills[slot] = 0;
    world.warXp[slot] = 0;
    world.easterEggFound[slot] = 0;
    world.captureXpCarry[slot] = 0;
    world.medalBits[slot] = 0;
  }
}

function captureRewindFrame(world: WorldState): void {
  const frame = world.rewindFrames[world.tick % LAG_COMPENSATION_HISTORY_TICKS];
  if (frame === undefined) return;
  frame.tick = world.tick;
  frame.entityId.set(world.entityId);
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) frame.alive[slot] = world.active[slot] !== 0 && isAlive(world, slot) ? 1 : 0;
  frame.x.set(world.x); frame.y.set(world.y); frame.z.set(world.z);
  frame.mounted.set(world.mounted); frame.horseHp.set(world.horseHp);
  frame.aboard.set(world.aboardVehicle); frame.aboardOffsetX.set(world.aboardOffsetX); frame.aboardOffsetZ.set(world.aboardOffsetZ);
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    frame.vehicleX[vehicleIndex] = world.vehicles.x[vehicleIndex] ?? 0;
    frame.vehicleZ[vehicleIndex] = world.vehicles.z[vehicleIndex] ?? 0;
    frame.vehicleYaw[vehicleIndex] = world.vehicles.yaw[vehicleIndex] ?? 0;
  }
}

function frameForTick(world: WorldState, requestedTick: number): RewindFrame | undefined {
  const clamped = clampRewindTick(world.tick, requestedTick, ticks(LAG_COMPENSATION_MAX_SECONDS));
  let candidate: RewindFrame | undefined;
  for (const frame of world.rewindFrames) if (frame.tick <= clamped && (candidate === undefined || frame.tick > candidate.tick)) candidate = frame;
  return candidate;
}

function raySphereDistance(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, radius: number): number | undefined {
  const toX = cx - ox; const toY = cy - oy; const toZ = cz - oz;
  const projection = toX * dx + toY * dy + toZ * dz;
  if (projection < 0) return undefined;
  const perpendicularSquared = toX * toX + toY * toY + toZ * toZ - projection * projection;
  if (perpendicularSquared > radius * radius) return undefined;
  return projection - Math.sqrt(radius * radius - perpendicularSquared);
}

export type RayHitKind = "head" | "rider" | "horse" | "none";

export interface RayHit {
  readonly kind: RayHitKind;
  readonly distance: number | undefined;
}

/**
 * Pure classification of which body region a ray first intersects for a target
 * at `position` (feet at `position.y`): the head sphere sits on the crown of
 * the body sphere (HEADSHOT_CENTER_OFFSET above the body center, radius
 * HEADSHOT_RADIUS), so a headshot requires the ray to pass above the body's
 * top surface — meaningfully harder than a body hit (see ADR 0014). The head
 * takes precedence over the body; the horse sphere (mounted only) is never a
 * head target. Aboard targets ride with their feet lowered by 0.15 m.
 */
export function rayHitKind(
  origin: Readonly<{ x: number; y: number; z: number }>,
  direction: Readonly<{ x: number; y: number; z: number }>,
  position: Readonly<{ x: number; y: number; z: number }>,
  mounted: boolean,
  aboard: boolean,
): RayHit {
  const bodyCenterY = position.y + 0.35 + (mounted ? CAVALRY_RIDER_HITBOX_RAISE : aboard ? -0.15 : 0);
  const head = raySphereDistance(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, position.x, bodyCenterY + HEADSHOT_CENTER_OFFSET, position.z, HEADSHOT_RADIUS);
  if (head !== undefined) return { kind: "head", distance: head };
  const rider = raySphereDistance(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, position.x, bodyCenterY, position.z, 0.62);
  if (rider !== undefined) return { kind: "rider", distance: rider };
  const horse = mounted ? raySphereDistance(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, position.x, position.y + 0.15, position.z, CAVALRY_HORSE_HIT_RADIUS) : undefined;
  if (horse !== undefined) return { kind: "horse", distance: horse };
  return { kind: "none", distance: undefined };
}

function resolveRay(world: WorldState, shot: PendingShot): void {
  const sourceSlot = world.slotByEntityId.get(shot.sourceEntityId);
  if (sourceSlot === undefined || !isAlive(world, sourceSlot)) return;
  const frame = frameForTick(world, shot.rewindTick);
  const earthworkCount = fillNearbyEarthworkBoxes(world, shot.x + shot.directionX * shot.maxRange * 0.5, shot.z + shot.directionZ * shot.maxRange * 0.5, shot.maxRange * 0.5 + 3, earthworkBoxScratch);
  const wallDistance = raycastBoxes({ x: shot.x, y: shot.y, z: shot.z }, { x: shot.directionX, y: shot.directionY, z: shot.directionZ }, shot.maxRange, SIEGE_BLOCKOUT, undefined, earthworkBoxScratch, earthworkCount) ?? shot.maxRange;
  // Terrain clip (Phase 8e-11): a hill between shooter and target stops the
  // ball. Marched against the same heightfield the client renders, so the
  // visual tracer and the damage ray end at the same hillside.
  const groundDistance = raycastTerrain(shot.x, shot.y, shot.z, shot.directionX, shot.directionY, shot.directionZ, wallDistance) ?? wallDistance;
  let bestSlot = -1; let bestDistance = groundDistance; let bestHitHead = false; let bestHitHorse = false;
  // Enemy siege cannons are sphere targets on the same ray (design §1.5).
  let bestCannon = -1;
  for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    if (world.cannons.active[index] === 0 || (world.cannons.hp[index] ?? 0) === 0) continue;
    if ((world.cannons.team[index] ?? 0) === world.team[sourceSlot]) continue;
    const cannonX = world.cannons.x[index] ?? 0;
    const cannonZ = world.cannons.z[index] ?? 0;
    const distance = raySphereDistance(shot.x, shot.y, shot.z, shot.directionX, shot.directionY, shot.directionZ, cannonX, heightAt(cannonX, cannonZ) + 1, cannonZ, cannonRadius(world.cannons, index));
    if (distance !== undefined && distance <= bestDistance) {
      bestDistance = distance;
      bestCannon = index;
    }
  }
  const centerDistance = shot.maxRange * 0.5;
  querySpatialHashInto(
    world.spatialHash,
    world,
    shot.x + shot.directionX * centerDistance,
    shot.z + shot.directionZ * centerDistance,
    centerDistance + 3,
    world.queryScratch,
  );
  for (const slot of world.queryScratch) {
    if (slot === sourceSlot || world.active[slot] === 0 || !isAlive(world, slot) || world.team[slot] === world.team[sourceSlot]) continue;
    if (frame !== undefined && (frame.alive[slot] === 0 || frame.entityId[slot] !== world.entityId[slot])) continue;
    let targetX = frame?.x[slot] ?? world.x[slot] ?? 0;
    let targetY = frame?.y[slot] ?? world.y[slot] ?? 0;
    let targetZ = frame?.z[slot] ?? world.z[slot] ?? 0;
    const frameAboard = frame?.aboard[slot] ?? -1;
    const aboardVehicleIndex = frame !== undefined ? frameAboard : (world.aboardVehicle[slot] ?? -1);
    if (aboardVehicleIndex >= 0) {
      const vehicleX = frame !== undefined ? (frame.vehicleX[aboardVehicleIndex] ?? 0) : (world.vehicles.x[aboardVehicleIndex] ?? 0);
      const vehicleZ = frame !== undefined ? (frame.vehicleZ[aboardVehicleIndex] ?? 0) : (world.vehicles.z[aboardVehicleIndex] ?? 0);
      const vehicleYaw = frame !== undefined ? (frame.vehicleYaw[aboardVehicleIndex] ?? 0) : (world.vehicles.yaw[aboardVehicleIndex] ?? 0);
      const localOffsetX = frame !== undefined ? (frame.aboardOffsetX[slot] ?? 0) : (world.aboardOffsetX[slot] ?? 0);
      const localOffsetZ = frame !== undefined ? (frame.aboardOffsetZ[slot] ?? 0) : (world.aboardOffsetZ[slot] ?? 0);
      const local = vehicleLocalToWorld(vehicleX, vehicleZ, vehicleYaw, localOffsetX, localOffsetZ);
      targetX = local.x;
      targetZ = local.z;
      targetY = 1.2;
    }
    const targetMounted = (frame?.mounted[slot] ?? world.mounted[slot] ?? 0) !== 0;
    const hit = rayHitKind({ x: shot.x, y: shot.y, z: shot.z }, { x: shot.directionX, y: shot.directionY, z: shot.directionZ }, { x: targetX, y: targetY, z: targetZ }, targetMounted, aboardVehicleIndex >= 0);
    if (hit.kind !== "none" && hit.distance !== undefined && hit.distance <= bestDistance) {
      bestDistance = hit.distance;
      bestSlot = slot;
      bestCannon = -1;
      bestHitHorse = hit.kind === "horse";
      bestHitHead = hit.kind === "head";
    }
  }
  if (bestSlot >= 0) {
    world.warHits[sourceSlot] = Math.min(65_535, (world.warHits[sourceSlot] ?? 0) + 1);
    grantMedalCounter(world, sourceSlot, MedalCategory.Marksman, 1);
    if (bestHitHorse) applyHorseDamage(world, sourceSlot, bestSlot, shot.damage);
    else applyDamage(world, sourceSlot, bestSlot, shot.damage, bestDistance, bestHitHead, shot.killCause, shot.falloffStart, shot.maxRange, shot.headshotMultiplier, shot.falloffMinFraction ?? 0.5);
  } else if (bestCannon >= 0) {
    damageCannon(world, bestCannon, shot.damage, sourceSlot);
  }
}

function dismount(world: WorldState, slot: number, stagger: boolean, leaveHorseBehind = true): void {
  if (world.mounted[slot] === 0) return;
  world.mounted[slot] = 0;
  world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.Mounted;
  if (leaveHorseBehind) leaveHorse(world, slot);
  world.horseMarkerX[slot] = world.x[slot] ?? 0;
  world.horseMarkerZ[slot] = world.z[slot] ?? 0;
  world.horseMarkerUntilTick[slot] = world.tick + ticks(CAVALRY_DISMOUNT_MARKER_SECONDS);
  if (stagger) world.staggerUntilTick[slot] = world.tick + ticks(CAVALRY_STAGGER_SECONDS);
}

function applyHorseDamage(world: WorldState, sourceSlot: number, targetSlot: number, damage: number): void {
  if (world.mounted[targetSlot] === 0 || (world.flags[targetSlot] ?? 0) & PlayerFlag.SpawnProtected) return;
  const remaining = Math.max(0, (world.horseHp[targetSlot] ?? 0) - Math.round(damage));
  world.horseHp[targetSlot] = remaining;
  emitEvent(world, CombatEventType.Hit, world.entityId[sourceSlot] ?? 0, world.entityId[targetSlot] ?? 0, encodeHitEventValue(damage, false));
  if (remaining > 0) return;
  dismount(world, targetSlot, true, false);
  grantXp(world, sourceSlot, XpSource.DismountRider, XP_DISMOUNT_RIDER);
}

export function applyDamage(
  world: WorldState,
  sourceSlot: number,
  targetSlot: number,
  baseDamage: number,
  distance: number,
  headshot = false,
  cause: KillCause,
  falloffStart = 0,
  falloffMaxRange = 0,
  headshotMultiplier = 1,
  falloffMinFraction = 0.5,
): void {
  if ((world.flags[targetSlot] ?? 0) & PlayerFlag.SpawnProtected) return;
  const sourceId = world.entityId[sourceSlot] ?? 0; const targetId = world.entityId[targetSlot] ?? 0;
  const appliedBaseDamage = headshot ? baseDamage * headshotMultiplier : baseDamage;
  // Headshots are lethal regardless of distance (audit PHASE 4): the head
  // multiplier applies to the full base damage, never the falloff-reduced
  // amount, so a distant headshot still one-shots a full-health target.
  const damage = headshot || falloffStart <= 0 || distance <= falloffStart
    ? appliedBaseDamage
    : appliedBaseDamage * Math.max(falloffMinFraction, 1 - (distance - falloffStart) / Math.max(falloffMaxRange - falloffStart, 1));
  world.health[targetSlot] = Math.max(0, (world.health[targetSlot] ?? 0) - Math.round(damage));
  world.lastDamagedTick[targetSlot] = world.tick;
  world.lastCombatTick[targetSlot] = world.tick;
  world.damageRecords[targetSlot]?.push({ sourceEntityId: sourceId, amount: damage, tick: world.tick });
  emitEvent(world, CombatEventType.Hit, sourceId, targetId, encodeHitEventValue(damage, headshot));
  if (headshot) grantXp(world, sourceSlot, XpSource.Headshot, XP_HEADSHOT_BONUS);
  if ((world.health[targetSlot] ?? 0) > 0) return;
  if (world.mounted[targetSlot] !== 0) dismount(world, targetSlot, false, true);
  // Death must release every occupied station or the state is unexitable:
  // wall-gun emplacements kept their gunner slot booked by a corpse, and
  // dead galley crew stayed glued to their station, re-gluing the respawned
  // player to the ship every tick and blocking other boarders (reality pass).
  releaseMannedGun(world, targetSlot);
  if ((world.aboardVehicle[targetSlot] ?? -1) >= 0) releaseVehicleStation(world, targetSlot);
  releasePersonalCannon(world, targetSlot);
  world.flags[targetSlot] = 0; scheduleRespawn(world, targetSlot); world.deaths[targetSlot] = Math.min(255, (world.deaths[targetSlot] ?? 0) + 1);
  world.kills[sourceSlot] = Math.min(255, (world.kills[sourceSlot] ?? 0) + 1);
  const windowStart = world.tick - ticks(ASSIST_WINDOW_SECONDS);
  const records = world.damageRecords[targetSlot] ?? [];
  const assistDamage = new Map<number, number>();
  for (const record of records) if (record.sourceEntityId !== sourceId && record.tick >= windowStart) assistDamage.set(record.sourceEntityId, (assistDamage.get(record.sourceEntityId) ?? 0) + record.amount);
  for (const [entityId, amount] of assistDamage) {
    if (amount < ASSIST_DAMAGE_THRESHOLD) continue;
    const assistSlot = world.slotByEntityId.get(entityId); if (assistSlot !== undefined) world.assists[assistSlot] = Math.min(255, (world.assists[assistSlot] ?? 0) + 1);
    if (assistSlot !== undefined) grantXp(world, assistSlot, XpSource.Assist, XP_ASSIST);
  }
  records.splice(0);
  // The Death event's value byte carries the authoritative kill cause
  // (Phase 8c-7) — the client feed renders from this, never from the killer's
  // current snapshot flags (a mounted arquebus kill is ranged, not melee).
  emitEvent(world, CombatEventType.Death, sourceId, targetId, cause);
  const atGate = distanceToCapturePoint(world, sourceSlot) <= GATE_KILL_RADIUS;
  const defenseKill = atGate && world.captureOwner === world.team[sourceSlot];
  const decayed = farmDecay(world, sourceSlot, targetSlot);
  const mountedKill = world.mounted[sourceSlot] !== 0;
  const artilleryKill = (world.mannedGun[sourceSlot] ?? -1) >= 0;
  const galleyKill = (world.aboardVehicle[sourceSlot] ?? -1) >= 0;
  if (defenseKill) grantMedalCounter(world, sourceSlot, MedalCategory.GateKeeper, 1);
  if (mountedKill) grantMedalCounter(world, sourceSlot, MedalCategory.Cavalry, 1);
  if (galleyKill) grantMedalCounter(world, sourceSlot, MedalCategory.SeaWolf, 1);
  const baseXp = galleyKill ? XP_GALLEY_KILL : artilleryKill ? XP_ARTILLERY_KILL : mountedKill ? XP_MOUNTED_KILL : defenseKill ? XP_DEFENSE_KILL : XP_KILL;
  const amount = Math.max(1, Math.round(baseXp * (decayed ? ANTI_FARM_DECAY : 1)));
  let killFlags = atGate ? XP_EVENT_FLAG_AT_GATE : 0;
  if (headshot) {
    world.warHeadshots[sourceSlot] = Math.min(65_535, (world.warHeadshots[sourceSlot] ?? 0) + 1);
    killFlags |= XP_EVENT_FLAG_HEADSHOT;
  }
  grantXp(world, sourceSlot, galleyKill ? XpSource.GalleyKill : artilleryKill ? XpSource.ArtilleryKill : mountedKill ? XpSource.MountedKill : defenseKill ? XpSource.DefenseKill : XpSource.Kill, amount, killFlags);
  if (defenseKill) world.warDefenseKills[sourceSlot] = Math.min(65_535, (world.warDefenseKills[sourceSlot] ?? 0) + 1);
  if (galleyKill) {
    const vehicleIndex = world.aboardVehicle[sourceSlot] ?? -1;
    if (vehicleIndex >= 0) {
      const helm = world.vehicles.helm[vehicleIndex] ?? -1;
      if (helm >= 0 && helm !== sourceSlot && world.active[helm] !== 0) grantXp(world, helm, XpSource.HelmAssist, XP_HELM_ASSIST);
    }
  }
  const supportSource = world.auraSource[sourceSlot] ?? -1;
  if (supportSource >= 0 && world.active[supportSource] !== 0 && world.team[supportSource] === world.team[sourceSlot]) {
    grantMedalCounter(world, supportSource, MedalCategory.StandardBearer, 1);
    grantXp(world, supportSource, XpSource.SupportKillAssist, XP_SUPPORT_KILL_ASSIST);
    const milestones = Math.floor((world.buffedKillAssists[supportSource] ?? 0) / SUPPORT_MILESTONE_EVERY);
    world.buffedKillAssists[supportSource] = Math.min(65_535, (world.buffedKillAssists[supportSource] ?? 0) + 1);
    const nextMilestones = Math.floor((world.buffedKillAssists[supportSource] ?? 0) / SUPPORT_MILESTONE_EVERY);
    if (nextMilestones > milestones) emitEvent(world, CombatEventType.SupportMilestone, world.entityId[supportSource] ?? 0, 0, nextMilestones);
  }
}

/**
 * Shovel earthwork placement (Phase 8c-4, design doc section 5). Server
 * derives the aimed ground point by marching the aim ray against the shared
 * heightfield (Phase 8e-11 — previously the horizontal feet plane, identical
 * on flat ground, wrong when aiming across a slope), validates it with the
 * shared terrain clearance (`isAllowed`, same rules as set dressing), and
 * spawns a capped earthwork entity (60 map-wide, oldest-expires-first).
 * First-pass numbers: 2 s per-player cooldown, 10 m placement range — see
 * ADR 0019.
 */
function placeEarthwork(world: WorldState, slot: number, kind: EarthworkKind): void {
  if (!isAlive(world, slot) || (world.nextEarthworkTick[slot] ?? 0) > world.tick) return;
  const eyeY = (world.y[slot] ?? 0) + 0.65;
  const pitch = world.pitch[slot] ?? 0;
  const directionY = Math.sin(pitch);
  if (directionY >= -0.02) return;
  const cosPitch = Math.cos(pitch);
  const yaw = world.yaw[slot] ?? 0;
  const directionX = -Math.sin(yaw) * cosPitch;
  const directionZ = -Math.cos(yaw) * cosPitch;
  const distance = raycastTerrain(world.x[slot] ?? 0, eyeY, world.z[slot] ?? 0, directionX, directionY, directionZ, EARTHWORK_MAX_RANGE);
  if (distance === undefined || distance < 1) return;
  const targetX = (world.x[slot] ?? 0) + directionX * distance;
  const targetZ = (world.z[slot] ?? 0) + directionZ * distance;
  if (!isAllowed(targetX, targetZ, 1.5)) return;
  world.nextEarthworkTick[slot] = world.tick + ticks(EARTHWORK_COOLDOWN_SECONDS);
  let index = -1;
  for (let candidate = 0; candidate < EARTHWORK_MAX; candidate += 1) {
    if ((world.earthworkKind[candidate] ?? 0) === 0) {
      index = candidate;
      break;
    }
  }
  if (index < 0) {
    let oldest = 0;
    let oldestTick = Infinity;
    for (let candidate = 0; candidate < EARTHWORK_MAX; candidate += 1) {
      const placedTick = world.earthworkPlacedTick[candidate] ?? 0;
      if (placedTick < oldestTick) {
        oldest = candidate;
        oldestTick = placedTick;
      }
    }
    index = oldest;
  }
  const wasActive = (world.earthworkKind[index] ?? 0) !== 0;
  world.earthworkKind[index] = kind;
  world.earthworkX[index] = targetX;
  world.earthworkZ[index] = targetZ;
  world.earthworkY[index] = heightAt(targetX, targetZ);
  world.earthworkPlacedTick[index] = world.tick;
  world.earthworkCount = Math.min(EARTHWORK_MAX, (world.earthworkCount ?? 0) + (wasActive ? 0 : 1));
}

function startReload(world: WorldState, slot: number): void {
  if (!isAlive(world, slot) || (world.ammo[slot] ?? 0) > 0 || (world.reloadUntilTick[slot] ?? 0) > world.tick) return;
  const playerClass = world.playerClass[slot] as PlayerClass;
  if (isSupportClass(playerClass)) return;
  // Only the equipped slot-2 ranged weapon reloads, and never mid-draw.
  if ((world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT) !== 2 || (world.weaponSwitchTicks[slot] ?? 0) > 0) return;
  const def = rangedWeaponForClass(playerClass, world.team[slot] as Team);
  const buffed = (world.flags[slot] ?? 0) & PlayerFlag.AuraActive;
  const duration = (def.reloadSeconds ?? 0) * (buffed ? SUPPORT_RELOAD_MULTIPLIER : 1);
  if (duration <= 0) return;
  world.reloadUntilTick[slot] = world.tick + ticks(duration);
  world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.Reloading;
}

function fireWeapon(world: WorldState, slot: number, rewindTick: number): void {
  // Fire is inert during the draw timer (Phase 8e-3).
  if (!isAlive(world, slot) || (world.weaponSwitchTicks[slot] ?? 0) > 0) return;
  const playerClass = world.playerClass[slot] as PlayerClass;
  const def = weaponDefAtSlot(playerClass, world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT);
  // Left-click with a blade equipped swings it, same as right-click — this is
  // checked before the ammo gate so an empty pan never blocks the blade.
  if (def.kind === "melee") { melee(world, slot); return; }
  // Support classes cannot fire, reload, or carry ammunition at all (they
  // spawn with an empty pan and startReload refuses them). The explicit gate
  // keeps the rule readable and directly testable instead of relying only on
  // ammo starvation.
  if (isSupportClass(playerClass)) {
    world.auraPauseUntilTick[slot] = world.tick + ticks(SUPPORT_PAUSE_SECONDS);
    return;
  }
  if ((world.nextFireTick[slot] ?? 0) > world.tick || (world.ammo[slot] ?? 0) === 0 || (world.reloadUntilTick[slot] ?? 0) > world.tick) return;
  const moving = Math.hypot(world.velocityX[slot] ?? 0, world.velocityZ[slot] ?? 0) > 0.15;
  const steady = world.tick - (world.stationarySinceTick[slot] ?? world.tick) >= ticks(STATIONARY_ACCURACY_SECONDS);
  // Phase 8e-7 ADS: holding Aim tightens spread by the weapon's AIM_TUNING
  // factor. Foot-only — a mounted rider gets no steadier (the client
  // presentation suppresses ADS mounted too, so both sides agree). The bit is
  // level-acted: no state to clear on death/switch; fire is already inert
  // mid-draw and melee-kind slots redirected above, so the factor can only
  // ever reach a live ranged shot.
  const aiming = ((world.buttons[slot] ?? 0) & InputButton.Aim) !== 0 && (world.mounted[slot] ?? 0) === 0;
  const spread = (moving || !steady ? MOVING_SPREAD_RADIANS : STANDING_SPREAD_RADIANS) * aimedSpreadFactor(def.id, aiming);
  const yaw = (world.yaw[slot] ?? 0) + randomSigned(world) * spread;
  const pitch = (world.pitch[slot] ?? 0) + randomSigned(world) * spread;
  const cosPitch = Math.cos(pitch);
  const shot: PendingShot = { sourceEntityId: world.entityId[slot] ?? 0, x: world.x[slot] ?? 0, y: (world.y[slot] ?? 0) + 0.65, z: world.z[slot] ?? 0, directionX: -Math.sin(yaw) * cosPitch, directionY: Math.sin(pitch), directionZ: -Math.cos(yaw) * cosPitch, damage: def.damage, headshotMultiplier: def.headshotMultiplier, maxRange: def.maxRange ?? 0, falloffStart: def.falloffStart ?? 0, falloffMinFraction: def.falloffMinFraction ?? 0.5, killCause: def.id === WeaponType.Crossbow ? KillCause.Crossbow : KillCause.Arquebus, rewindTick, resolveTick: world.tick + ticks(def.travelSeconds ?? 0) };
  world.ammo[slot] = 0; world.nextFireTick[slot] = world.tick + ticks(def.cooldownSeconds); world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.SpawnProtected;
  world.warShots[slot] = Math.min(65_535, (world.warShots[slot] ?? 0) + 1);
  world.lastCombatTick[slot] = world.tick;
  // The Fire event is published at trigger time, not resolution time. The
  // client spawns the visible ball and plays the shot from this event, so a
  // travel-time weapon (crossbow) must announce the shot when it leaves the
  // barrel, not when the ball lands 0.22 s later; the damage ray still
  // resolves on resolveTick below.
  emitEvent(world, CombatEventType.Fire, world.entityId[slot] ?? 0, 0, 0);
  if ((def.travelSeconds ?? 0) <= 0) resolveRay(world, shot); else world.pendingShots.push(shot);
}

function melee(world: WorldState, slot: number): void {
  if (!isAlive(world, slot) || (world.nextMeleeTick[slot] ?? 0) > world.tick) return;
  // Melee is inert during the draw timer (Phase 8e-3).
  if ((world.weaponSwitchTicks[slot] ?? 0) > 0) return;
  const playerClass = world.playerClass[slot] as PlayerClass;
  const support = isSupportClass(playerClass);
  const mounted = world.mounted[slot] !== 0;
  // Def selection (Phase 8e-3): mounted fights with the saber; an equipped
  // melee slot uses its own def; a bot right-clicking with a ranged slot
  // falls back to its slot-1 blade (bots never switch slots); a human
  // right-clicking with a ranged slot performs the weakest-tier butt stroke.
  const equippedSlot = world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT;
  const equipped = weaponDefAtSlot(playerClass, equippedSlot);
  const def = mounted
    ? WEAPON_DEFS[WeaponType.Saber]
    : equipped.kind === "melee"
      ? equipped
      : (world.bot[slot] ?? 0) !== 0 ? weaponDefAtSlot(playerClass, 1) : WEAPON_DEFS[WeaponType.ButtStroke];
  const killCause = def.id === WeaponType.Dagger ? KillCause.Dagger
    : def.id === WeaponType.Sword || def.id === WeaponType.Kilij || def.id === WeaponType.Hanger ? KillCause.Sword
      : KillCause.Melee;
  // Attacking with the blade does NOT cancel an in-flight reload (Phase 8e-8,
  // ADR 0037): holstered reloads progress at full rate, and melee is just
  // another weapon use. The Reloading flag stays set while the timer runs;
  // spawn protection still breaks on the attack.
  world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.SpawnProtected;
  world.nextMeleeTick[slot] = world.tick + ticks(def.cooldownSeconds);
  // Animation truth: publish every accepted swing, including misses. The
  // value carries what is visibly used, which differs from the selected slot
  // for bots (they keep slot 2 selected but draw their slot-1 blade in melee).
  const visualSlot = mounted ? 1 : equipped.kind === "melee" ? equippedSlot : (world.bot[slot] ?? 0) !== 0 ? 1 : 2;
  emitEvent(world, CombatEventType.MeleeSwing, world.entityId[slot] ?? 0, 0, visualSlot);
  if (support) world.auraPauseUntilTick[slot] = world.tick + ticks(SUPPORT_PAUSE_SECONDS);
  const yaw = world.yaw[slot] ?? 0;
  const range = def.meleeRange ?? MELEE_RANGE;
  const arcDot = def.meleeForwardDot ?? MELEE_FORWARD_DOT;
  querySpatialHashInto(world.spatialHash, world, world.x[slot] ?? 0, world.z[slot] ?? 0, range, world.queryScratch);
  let struck = false;
  for (const target of world.queryScratch) {
    if (target === slot || world.active[target] === 0 || !isAlive(world, target) || world.team[target] === world.team[slot]) continue;
    const dx = (world.x[target] ?? 0) - (world.x[slot] ?? 0); const dz = (world.z[target] ?? 0) - (world.z[slot] ?? 0);
    const distance = Math.hypot(dx, dz); const forward = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.max(distance, 0.001);
    if (distance <= range && forward > arcDot) {
      const eyeY = (world.y[slot] ?? 0) + 0.35;
      const directionX = dx / Math.max(distance, 0.001);
      const directionZ = dz / Math.max(distance, 0.001);
      const wallDistance = raycastBoxes(
        { x: world.x[slot] ?? 0, y: eyeY, z: world.z[slot] ?? 0 },
        { x: directionX, y: 0, z: directionZ },
        distance,
        SIEGE_BLOCKOUT,
      );
      if (wallDistance !== undefined && wallDistance < distance) continue;
      const speedFraction = Math.hypot(world.velocityX[slot] ?? 0, world.velocityZ[slot] ?? 0) / 15.6;
      const lanceDamage = mounted && speedFraction >= CAVALRY_LANCE_MIN_SPEED_FRACTION ? CAVALRY_LANCE_MAX_DAMAGE * Math.min(1, speedFraction) : 0;
      const damage = lanceDamage > 0 ? lanceDamage : def.damage;
      applyDamage(world, slot, target, damage, distance, false, killCause);
      if (lanceDamage > 0) world.nextMeleeTick[slot] = world.tick + ticks(CAVALRY_LANCE_RECOUCH_SECONDS);
      struck = true;
      break;
    }
  }
  // Melee also damages enemy siege cannons in range (design §1.5).
  if (!struck) for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    if (world.cannons.active[index] === 0 || (world.cannons.hp[index] ?? 0) === 0) continue;
    if ((world.cannons.team[index] ?? 0) === world.team[slot]) continue;
    const dx = (world.cannons.x[index] ?? 0) - (world.x[slot] ?? 0);
    const dz = (world.cannons.z[index] ?? 0) - (world.z[slot] ?? 0);
    const distance = Math.hypot(dx, dz);
    if (distance > range + cannonRadius(world.cannons, index)) continue;
    const forward = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / Math.max(distance, 0.001);
    if (forward <= arcDot) continue;
    const eyeY = (world.y[slot] ?? 0) + 0.35;
    const wallDistance = raycastBoxes(
      { x: world.x[slot] ?? 0, y: eyeY, z: world.z[slot] ?? 0 },
      { x: dx / Math.max(distance, 0.001), y: 0, z: dz / Math.max(distance, 0.001) },
      distance,
      SIEGE_BLOCKOUT,
    );
    if (wallDistance !== undefined && wallDistance < distance) continue;
    damageCannon(world, index, def.damage, slot);
    break;
  }
}

// ---------------------------------------------------------------------------
// Mobile siege cannons (siege-loop phase, docs/design/siege-loop.md). Stations,
// pushing, deploy timers, firing, damage/destruction — all riding the existing
// artillery/projectile and galley-style station pipelines, not a parallel one.
// ---------------------------------------------------------------------------

function releaseCannonStation(world: WorldState, slot: number): void {
  const cannonIndex = world.cannonCrew[slot] ?? -1;
  if (cannonIndex < 0) return;
  const cannons = world.cannons;
  if ((cannons.gunner[cannonIndex] ?? -1) === slot) cannons.gunner[cannonIndex] = -1;
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
    const entry = cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index;
    if ((cannons.pushers[entry] ?? -1) === slot) cannons.pushers[entry] = -1;
  }
  world.cannonCrew[slot] = -1;
  world.flags[slot] = (world.flags[slot] ?? 0) & ~(PlayerFlag.ManningArtillery | PlayerFlag.PushingCannon);
  world.pushXpCarry[slot] = 0;
}

/**
 * Boards a nearby cannon (design §1.2/§1.6): gunner seat for the artillery
 * class, otherwise a free pusher slot for any class. An enemy-team cannon may
 * only be boarded when it has no crew at all, and boarding transfers its team
 * (capture). Pusher attach is rejected while deployed or deploying (mutual
 * exclusion with pushing, enforced server-side).
 */
function tryBoardCannon(world: WorldState, slot: number): boolean {
  const cannons = world.cannons;
  const playerTeam = world.team[slot] as Team;
  const artillery = isArtilleryClass(world.playerClass[slot] as PlayerClass);
  for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    if (cannons.active[index] === 0 || (cannons.hp[index] ?? 0) === 0) continue;
    if (isPersonalCannon(cannons, index) && cannons.ownerSlot[index] !== slot) continue;
    const dx = (world.x[slot] ?? 0) - (cannons.x[index] ?? 0);
    const dz = (world.z[slot] ?? 0) - (cannons.z[index] ?? 0);
    if (Math.hypot(dx, dz) > SIEGE_CANNON_BOARD_RADIUS) continue;
    const gunnerFree = (cannons.gunner[index] ?? -1) < 0;
    const pusherCount = cannonPusherCount(cannons, index);
    if ((cannons.team[index] as Team) !== playerTeam && (gunnerFree === false || pusherCount > 0)) continue;
    if (gunnerFree && artillery) {
      cannons.gunner[index] = slot;
      cannons.team[index] = playerTeam;
      cannons.gunYaw[index] = cannons.yaw[index] ?? 0;
      cannons.gunPitch[index] = Math.max(SIEGE_CANNON_MIN_PITCH, 0.3);
      world.cannonCrew[slot] = index;
      world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.ManningArtillery;
      return true;
    }
    const transitioning = (cannons.deployUntilTick[index] ?? 0) > world.tick || (cannons.undeployUntilTick[index] ?? 0) > world.tick;
    if (isPersonalCannon(cannons, index) || pusherCount >= SIEGE_CANNON_MAX_PUSHERS || (cannons.deployed[index] ?? 0) === 1 || transitioning) continue;
    for (let subslot = 0; subslot < SIEGE_CANNON_MAX_PUSHERS; subslot += 1) {
      const entry = index * SIEGE_CANNON_MAX_PUSHERS + subslot;
      if ((cannons.pushers[entry] ?? -1) >= 0) continue;
      cannons.pushers[entry] = slot;
      break;
    }
    cannons.team[index] = playerTeam;
    world.cannonCrew[slot] = index;
    world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.PushingCannon;
    return true;
  }
  return false;
}

/** The pushers' normalized movement input, same button mapping as infantry. */
function pusherWish(world: WorldState, slot: number): { x: number; z: number } {
  const buttons = world.buttons[slot] ?? 0;
  let forward = 0;
  let strafe = 0;
  if ((buttons & InputButton.Forward) !== 0) forward += 1;
  if ((buttons & InputButton.Backward) !== 0) forward -= 1;
  if ((buttons & InputButton.Right) !== 0) strafe += 1;
  if ((buttons & InputButton.Left) !== 0) strafe -= 1;
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude < 0.01) return { x: 0, z: 0 };
  const yaw = world.desiredYaw[slot] ?? 0;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  return { x: (strafe * cosYaw - forward * sinYaw) / magnitude, z: (-strafe * sinYaw - forward * cosYaw) / magnitude };
}

/** Glues a crew member to their carriage socket (movement phase). */
function glueCannonCrew(world: WorldState, slot: number, cannonIndex: number): void {
  const cannons = world.cannons;
  const yaw = cannons.yaw[cannonIndex] ?? 0;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const sideX = Math.cos(yaw);
  const sideZ = -Math.sin(yaw);
  let offsetForward = 0;
  let offsetSide = 1.3;
  if ((cannons.gunner[cannonIndex] ?? -1) !== slot) {
    let subslot = 0;
    for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
      if ((cannons.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] ?? -1) === slot) {
        subslot = index;
        break;
      }
    }
    offsetForward = -1.8;
    offsetSide = subslot === 0 ? -0.7 : 0.7;
  }
  world.x[slot] = (cannons.x[cannonIndex] ?? 0) + forwardX * offsetForward + sideX * offsetSide;
  world.z[slot] = (cannons.z[cannonIndex] ?? 0) + forwardZ * offsetForward + sideZ * offsetSide;
  world.y[slot] = heightAt(world.x[slot] ?? 0, world.z[slot] ?? 0) + GROUND_CENTER_Y;
  world.yaw[slot] = world.desiredYaw[slot] ?? yaw;
  world.velocityX[slot] = 0;
  world.velocityY[slot] = 0;
  world.velocityZ[slot] = 0;
  world.grounded[slot] = 1;
  world.jumpHeld[slot] = 0;
}

function recordCannonDamager(world: WorldState, cannonIndex: number, slot: number, damage: number): void {
  const cannons = world.cannons;
  const base = cannonIndex * CANNON_DAMAGER_RING;
  let oldest = base;
  let oldestTick = Infinity;
  for (let index = 0; index < CANNON_DAMAGER_RING; index += 1) {
    const entry = base + index;
    if ((cannons.damagerSlot[entry] ?? -1) === slot) {
      cannons.damagerTick[entry] = world.tick;
      cannons.damagerDamage[entry] = (cannons.damagerDamage[entry] ?? 0) + damage;
      return;
    }
    const tick = cannons.damagerTick[entry] ?? 0;
    if ((cannons.damagerSlot[entry] ?? -1) < 0 || tick < oldestTick) {
      oldestTick = (cannons.damagerSlot[entry] ?? -1) < 0 ? -1 : tick;
      oldest = entry;
    }
  }
  cannons.damagerSlot[oldest] = slot;
  cannons.damagerTick[oldest] = world.tick;
  cannons.damagerDamage[oldest] = damage;
}

/**
 * Cannon hull damage (design §1.5) — arquebus/crossbow hits, melee, and
 * artillery splash all land here, the same shape as damageGalleyHull. At 0 HP
 * the crew is thrown clear, the kill-feed event fires, the killer and recent
 * damagers (assist window/threshold) are paid, and the wreck respawns at the
 * staging line after SIEGE_CANNON_RESPAWN_SECONDS.
 */
function damageCannon(world: WorldState, cannonIndex: number, damage: number, sourceSlot: number): void {
  const cannons = world.cannons;
  if (cannons.active[cannonIndex] === 0 || (cannons.hp[cannonIndex] ?? 0) === 0) return;
  if (sourceSlot >= 0 && world.active[sourceSlot] !== 0) recordCannonDamager(world, cannonIndex, sourceSlot, damage);
  const remaining = Math.max(0, (cannons.hp[cannonIndex] ?? 0) - Math.round(damage));
  cannons.hp[cannonIndex] = remaining;
  if (remaining > 0) return;
  const killerActive = sourceSlot >= 0 && world.active[sourceSlot] !== 0;
  emitEvent(world, CombatEventType.CannonDestroyed, killerActive ? (world.entityId[sourceSlot] ?? 0) : 0, cannonEntityId(cannonIndex), 0);
  if (killerActive) grantXp(world, sourceSlot, XpSource.CannonDestroyed, XP_CANNON_DESTROYED);
  const windowStart = world.tick - ticks(ASSIST_WINDOW_SECONDS);
  const base = cannonIndex * CANNON_DAMAGER_RING;
  for (let index = 0; index < CANNON_DAMAGER_RING; index += 1) {
    const entry = base + index;
    const damager = cannons.damagerSlot[entry] ?? -1;
    if (damager < 0 || damager === sourceSlot || world.active[damager] === 0) continue;
    if ((cannons.damagerTick[entry] ?? 0) < windowStart || (cannons.damagerDamage[entry] ?? 0) < ASSIST_DAMAGE_THRESHOLD) continue;
    grantXp(world, damager, XpSource.CannonDestroyed, Math.floor(XP_CANNON_DESTROYED / 2));
  }
  const gunner = cannons.gunner[cannonIndex] ?? -1;
  if (gunner >= 0) releaseCannonStation(world, gunner);
  for (let index = 0; index < SIEGE_CANNON_MAX_PUSHERS; index += 1) {
    const pusher = cannons.pushers[cannonIndex * SIEGE_CANNON_MAX_PUSHERS + index] ?? -1;
    if (pusher >= 0) releaseCannonStation(world, pusher);
  }
  destroyCannon(cannons, cannonIndex, world.tick + ticks(isPersonalCannon(cannons, cannonIndex) ? PERSONAL_CANNON_RESPAWN_SECONDS : SIEGE_CANNON_RESPAWN_SECONDS));
}

/** Per-segment recent damagers (design §2.4): breaching pays the crew. */
function recordWallContributor(world: WorldState, segmentId: number, slot: number): void {
  const base = segmentId * WALL_CONTRIBUTOR_RING;
  let oldest = base;
  let oldestTick = Infinity;
  for (let index = 0; index < WALL_CONTRIBUTOR_RING; index += 1) {
    const entry = base + index;
    if ((world.wallContributorSlot[entry] ?? -1) === slot) {
      world.wallContributorTick[entry] = world.tick;
      return;
    }
    const tick = world.wallContributorTick[entry] ?? 0;
    if ((world.wallContributorSlot[entry] ?? -1) < 0 || tick < oldestTick) {
      oldestTick = (world.wallContributorSlot[entry] ?? -1) < 0 ? -1 : tick;
      oldest = entry;
    }
  }
  world.wallContributorSlot[oldest] = slot;
  world.wallContributorTick[oldest] = world.tick;
}

function wallHpFrac(hp: number): number {
  return Math.max(0, Math.min(16, Math.round((hp / WALL_SEGMENT_HEALTH) * 16)));
}

/** Per-segment hpFrac bytes for the Welcome message (protocol v12). */
export function wallHpFractions(world: WorldState): number[] {
  const fractions: number[] = [];
  for (let index = 0; index < WALL_SEGMENT_COUNT; index += 1) fractions.push(wallHpFrac(world.wallHp[index] ?? 0));
  return fractions;
}

/**
 * Nearest repairable wall segment for a defender: Damaged only — a breach is
 * permanent and an Intact segment needs nothing (design §2.5). Distance is
 * measured to the segment box, and only Byzantines repair, so attackers keep
 * Interact free for boarding near the wall.
 */
function repairableSegmentNear(world: WorldState, slot: number): number {
  if (world.team[slot] !== Team.Byzantine) return -1;
  for (const wall of WALL_SEGMENTS) {
    if (world.wallState[wall.id] !== WallState.Damaged) continue;
    const dx = Math.max(0, Math.abs((world.x[slot] ?? 0) - wall.box.x) - wall.box.width / 2);
    const dz = Math.max(0, Math.abs((world.z[slot] ?? 0) - wall.box.z) - wall.box.depth / 2);
    if (Math.hypot(dx, dz) <= WALL_REPAIR_RANGE) return wall.id;
  }
  return -1;
}

/**
 * Defender repair channel (design §2.5): hold Interact near a Damaged segment
 * to restore WALL_REPAIR_HP_PER_SECOND; the weapon is stowed for the tick (the
 * caller skips fire/reload/melee). Emits a WallEvent on 1/16 hpFrac crossings
 * and when the segment returns to Intact at full HP. Returns true while
 * repairing so the combat phase stows the weapon.
 */
function updateWallRepair(world: WorldState, slot: number): boolean {
  const segment = repairableSegmentNear(world, slot);
  if (segment < 0) return false;
  const hp = Math.min(WALL_SEGMENT_HEALTH, Math.round((world.wallHp[segment] ?? 0) + WALL_REPAIR_HP_PER_SECOND * FIXED_DT_SECONDS));
  world.wallHp[segment] = hp;
  world.repairXpCarry[slot] = (world.repairXpCarry[slot] ?? 0) + WALL_REPAIR_XP_PER_SECOND * FIXED_DT_SECONDS;
  const whole = Math.floor(world.repairXpCarry[slot] ?? 0);
  if (whole >= 1) {
    world.repairXpCarry[slot] = (world.repairXpCarry[slot] ?? 0) - whole;
    grantXp(world, slot, XpSource.WallRepair, whole);
  }
  const frac = wallHpFrac(hp);
  if (hp >= WALL_SEGMENT_HEALTH) {
    world.wallState[segment] = WallState.Intact;
    world.wallLastFrac[segment] = 16;
    addWallEvent(world, segment, WallState.Intact, world.entityId[slot] ?? 0, 16);
  } else if (frac !== (world.wallLastFrac[segment] ?? 16)) {
    world.wallLastFrac[segment] = frac;
    addWallEvent(world, segment, WallState.Damaged, world.entityId[slot] ?? 0, frac);
  }
  return true;
}

function updateCannons(world: WorldState): void {
  const cannons = world.cannons;
  for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    if (cannons.active[index] === 0) continue;
    const personal = isPersonalCannon(cannons, index);
    if (personal) {
      const owner = cannons.ownerSlot[index] ?? -1;
      if (owner < 0 || world.active[owner] === 0 || !isAlive(world, owner) || world.playerClass[owner] !== PlayerClass.Topcu) {
        if (owner >= 0) releaseCannonStation(world, owner);
        despawnCannon(cannons, index);
        continue;
      }
    }
    if ((cannons.hp[index] ?? 0) === 0) {
      // A personal field gun reforms beside its owner after a short rebuild;
      // the large bombards keep their long staging-line respawn.
      const respawnAt = cannons.respawnAtTick[index] ?? 0;
      if (respawnAt > 0 && world.tick >= respawnAt) {
        if (personal) {
          const owner = cannons.ownerSlot[index] ?? -1;
          if (owner >= 0 && world.active[owner] !== 0 && isAlive(world, owner) && world.playerClass[owner] === PlayerClass.Topcu) {
            spawnPersonalCannon(cannons, index, owner, world.x[owner] ?? 0, world.z[owner] ?? 0, world.yaw[owner] ?? 0, world.team[owner] as Team, world.tick);
          } else despawnCannon(cannons, index);
        } else respawnCannon(cannons, index);
      }
      continue;
    }
    if (personal && (cannons.gunner[index] ?? -1) < 0 && cannonPusherCount(cannons, index) === 0 && (cannons.deployed[index] ?? 0) === 0) {
      const owner = cannons.ownerSlot[index] ?? -1;
      const yaw = world.yaw[owner] ?? cannons.yaw[index] ?? 0;
      const sideX = Math.cos(yaw);
      const sideZ = -Math.sin(yaw);
      cannons.x[index] = (world.x[owner] ?? 0) + sideX * 1.5;
      cannons.z[index] = (world.z[owner] ?? 0) + sideZ * 1.5;
      cannons.yaw[index] = yaw;
      cannons.gunYaw[index] = yaw;
    }
    // Crew validity sweep: death or leave releases the station.
    const gunner = cannons.gunner[index] ?? -1;
    if (gunner >= 0 && (world.active[gunner] === 0 || !isAlive(world, gunner) || (world.cannonCrew[gunner] ?? -1) !== index)) {
      releaseCannonStation(world, gunner);
      cannons.gunner[index] = -1;
    }
    for (let subslot = 0; subslot < SIEGE_CANNON_MAX_PUSHERS; subslot += 1) {
      const entry = index * SIEGE_CANNON_MAX_PUSHERS + subslot;
      const pusher = cannons.pushers[entry] ?? -1;
      if (pusher >= 0 && (world.active[pusher] === 0 || !isAlive(world, pusher) || (world.cannonCrew[pusher] ?? -1) !== index)) {
        releaseCannonStation(world, pusher);
        cannons.pushers[entry] = -1;
      }
    }
    // Deploy / undeploy timers.
    if ((cannons.deployUntilTick[index] ?? 0) > 0 && world.tick >= (cannons.deployUntilTick[index] ?? 0)) {
      cannons.deployed[index] = 1;
      cannons.deployUntilTick[index] = 0;
    }
    if ((cannons.undeployUntilTick[index] ?? 0) > 0 && world.tick >= (cannons.undeployUntilTick[index] ?? 0)) {
      cannons.deployed[index] = 0;
      cannons.undeployUntilTick[index] = 0;
      if (personal) {
        const gunner = cannons.gunner[index] ?? -1;
        if (gunner >= 0) releaseCannonStation(world, gunner);
      }
    }
    const transitioning = (cannons.deployUntilTick[index] ?? 0) > world.tick || (cannons.undeployUntilTick[index] ?? 0) > world.tick;
    const pusherCount = cannonPusherCount(cannons, index);
    const crewedGunner = cannons.gunner[index] ?? -1;
    if (crewedGunner >= 0) {
      // Deploy starts on a Fire edge while undeployed — firing is impossible
      // then, so the button is free (design §1.4). Interact undeploys or
      // releases (tryInteract).
      const fireHeld = ((world.buttons[crewedGunner] ?? 0) & InputButton.Fire) !== 0;
      const fireEdge = fireHeld && ((world.prevButtons[crewedGunner] ?? 0) & InputButton.Fire) === 0;
      if (fireEdge && (cannons.deployed[index] ?? 0) === 0 && !transitioning && pusherCount === 0) {
        cannons.deployUntilTick[index] = world.tick + ticks(personal ? PERSONAL_CANNON_DEPLOY_SECONDS : SIEGE_CANNON_DEPLOY_SECONDS);
      }
      // Aim: the gunner's view clamped to the carriage yaw arc, emplacement-style.
      const carriageYaw = cannons.yaw[index] ?? 0;
      const desiredYaw = world.desiredYaw[crewedGunner] ?? carriageYaw;
      const yawDelta = Math.atan2(Math.sin(desiredYaw - carriageYaw), Math.cos(desiredYaw - carriageYaw));
      cannons.gunYaw[index] = carriageYaw + Math.max(-SIEGE_CANNON_YAW_ARC, Math.min(SIEGE_CANNON_YAW_ARC, yawDelta));
      cannons.gunPitch[index] = Math.max(SIEGE_CANNON_MIN_PITCH, Math.min(SIEGE_CANNON_MAX_PITCH, world.pitch[crewedGunner] ?? 0.3));
      // Fire: fully deployed only, same reload curve and crew bonus as emplacements.
      if (fireHeld && (cannons.deployed[index] ?? 0) === 1 && !transitioning && world.tick >= (cannons.reloadUntilTick[index] ?? 0)) {
        let projectile = -1;
        for (let candidate = 0; candidate < MAX_ARTILLERY_PROJECTILES; candidate += 1) {
          if (world.projectileActive[candidate] === 0) {
            projectile = candidate;
            break;
          }
        }
        if (projectile >= 0) {
          const cannonX = cannons.x[index] ?? 0;
          const cannonZ = cannons.z[index] ?? 0;
          let crew = 0;
          for (let helper = 0; helper < MAX_PLAYERS && crew < 2; helper += 1) {
            if (helper === crewedGunner || world.active[helper] === 0 || !isAlive(world, helper) || world.team[helper] !== world.team[crewedGunner]) continue;
            if (Math.hypot((world.x[helper] ?? 0) - cannonX, (world.z[helper] ?? 0) - cannonZ) > ARTILLERY_CREW_RADIUS) continue;
            crew += 1;
            grantXp(world, helper, XpSource.CrewAssist, XP_ARTILLERY_CREW_ASSIST);
          }
          const reload = personal
            ? PERSONAL_CANNON_RELOAD_SECONDS
            : BOMBARD_SOLO_RELOAD_SECONDS + (BOMBARD_CREW_RELOAD_SECONDS - BOMBARD_SOLO_RELOAD_SECONDS) * (crew / 2);
          cannons.reloadUntilTick[index] = world.tick + ticks(reload);
          const yaw = cannons.gunYaw[index] ?? carriageYaw;
          const pitch = cannons.gunPitch[index] ?? 0.3;
          const cosPitch = Math.cos(pitch);
          world.projectileActive[projectile] = 1;
          world.projectileSourceSlot[projectile] = crewedGunner;
          world.projectileGun[projectile] = cannonProjectileGunId(index);
          world.projectileX[projectile] = cannonX - Math.sin(yaw) * 1.2;
          world.projectileY[projectile] = heightAt(cannonX, cannonZ) + 1.5;
          world.projectileZ[projectile] = cannonZ - Math.cos(yaw) * 1.2;
          const projectileSpeed = personal ? PERSONAL_CANNON_PROJECTILE_SPEED : BOMBARD_PROJECTILE_SPEED;
          world.projectileVelocityX[projectile] = -Math.sin(yaw) * cosPitch * projectileSpeed;
          world.projectileVelocityY[projectile] = Math.sin(pitch) * projectileSpeed;
          world.projectileVelocityZ[projectile] = -Math.cos(yaw) * cosPitch * projectileSpeed;
          world.projectileUntilTick[projectile] = world.tick + ticks(5);
          emitEvent(world, CombatEventType.ArtilleryFire, world.entityId[crewedGunner] ?? 0, cannonEntityId(index), cannonProjectileGunId(index));
        }
      }
    }
    // Pushing: the cannon cannot move while deployed or mid-transition.
    if (pusherCount > 0 && (cannons.deployed[index] ?? 0) === 0 && !transitioning) {
      let wishX = 0;
      let wishZ = 0;
      for (let subslot = 0; subslot < SIEGE_CANNON_MAX_PUSHERS; subslot += 1) {
        const pusher = cannons.pushers[index * SIEGE_CANNON_MAX_PUSHERS + subslot] ?? -1;
        if (pusher < 0) continue;
        const wish = pusherWish(world, pusher);
        wishX += wish.x;
        wishZ += wish.z;
      }
      const magnitude = Math.hypot(wishX, wishZ);
      if (magnitude > 0.01) {
        wishX /= magnitude;
        wishZ /= magnitude;
        const speed = (pusherCount >= 2 ? SIEGE_CANNON_PUSH_SPEED_CREW : SIEGE_CANNON_PUSH_SPEED_SOLO) * (personal ? PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER : 1);
        const oldX = cannons.x[index] ?? 0;
        const oldZ = cannons.z[index] ?? 0;
        // Axis-separated slide so a cannon grinds along a wall face.
        let nextX = oldX + wishX * speed * FIXED_DT_SECONDS;
        if (cannonPositionBlocked(nextX, oldZ, world.wallState, cannonRadius(cannons, index))) nextX = oldX;
        let nextZ = oldZ + wishZ * speed * FIXED_DT_SECONDS;
        if (cannonPositionBlocked(nextX, nextZ, world.wallState, cannonRadius(cannons, index))) nextZ = oldZ;
        const clamped = clampCannonPosition(nextX, nextZ);
        if (clamped.x !== oldX || clamped.z !== oldZ) {
          cannons.x[index] = clamped.x;
          cannons.z[index] = clamped.z;
          cannons.yaw[index] = Math.atan2(-wishX, -wishZ);
          cannons.lastMovedTick[index] = world.tick;
        }
      }
    }
    // Push XP: attached pushers earn only while the cannon has moved recently
    // (no idling on an abandoned gun, design §2.4).
    if (pusherCount > 0 && world.tick - (cannons.lastMovedTick[index] ?? 0) <= ticks(5)) {
      for (let subslot = 0; subslot < SIEGE_CANNON_MAX_PUSHERS; subslot += 1) {
        const pusher = cannons.pushers[index * SIEGE_CANNON_MAX_PUSHERS + subslot] ?? -1;
        if (pusher < 0) continue;
        world.pushXpCarry[pusher] = (world.pushXpCarry[pusher] ?? 0) + SIEGE_PUSH_XP_PER_SECOND * FIXED_DT_SECONDS;
        const whole = Math.floor(world.pushXpCarry[pusher] ?? 0);
        if (whole >= 1) {
          world.pushXpCarry[pusher] = (world.pushXpCarry[pusher] ?? 0) - whole;
          grantXp(world, pusher, XpSource.SiegePush, whole);
        }
      }
    }
  }
}

/** F-key ladder traversal: one authoritative hop across the curtain. */
function tryUseSiegeLadder(world: WorldState, slot: number): boolean {
  const buttons = world.buttons[slot] ?? 0;
  const previous = world.prevButtons[slot] ?? 0;
  if ((buttons & InputButton.Interact) === 0 || (previous & InputButton.Interact) !== 0) return false;
  const x = world.x[slot] ?? 0;
  const z = world.z[slot] ?? 0;
  for (const ladder of SIEGE_LADDERS) {
    if (Math.hypot(x - ladder.x, z - ladder.z) > ladder.radius) continue;
    const targetZ = ladder.z + (z >= ladder.z ? -ladder.crossingDepth : ladder.crossingDepth);
    world.x[slot] = ladder.x;
    world.z[slot] = targetZ;
    world.y[slot] = spawnCenterY(world, ladder.x, targetZ);
    world.velocityX[slot] = 0;
    world.velocityY[slot] = 0;
    world.velocityZ[slot] = 0;
    return true;
  }
  return false;
}

function tryInteract(world: WorldState, slot: number): void {
  if (world.tick < (world.nextInteractTick[slot] ?? 0) || !isAlive(world, slot)) return;
  world.nextInteractTick[slot] = world.tick + ticks(0.5);
  const activeGun = world.mannedGun[slot] ?? -1;
  if (activeGun >= 0) {
    world.gunnerSlot[activeGun] = -1;
    world.mannedGun[slot] = -1;
    world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.ManningArtillery;
    return;
  }
  if ((world.aboardVehicle[slot] ?? -1) >= 0) {
    releaseVehicleStation(world, slot);
    return;
  }
  const playerClass = world.playerClass[slot] as PlayerClass;
  if (world.mounted[slot] !== 0) { dismount(world, slot, false); return; }
  const crewCannon = world.cannonCrew[slot] ?? -1;
  if (crewCannon >= 0) {
    const cannons = world.cannons;
    if ((cannons.gunner[crewCannon] ?? -1) === slot
      && (cannons.hp[crewCannon] ?? 0) > 0
      && (cannons.deployed[crewCannon] ?? 0) === 1
      && (cannons.undeployUntilTick[crewCannon] ?? 0) <= world.tick) {
      // Gunner on a deployed gun: lower the piece and step away immediately.
      // The carriage remains locked for the two-second limber animation, but
      // the player is no longer glued to the gun and can leave the operation.
      cannons.undeployUntilTick[crewCannon] = world.tick + ticks(isPersonalCannon(cannons, crewCannon) ? PERSONAL_CANNON_UNDEPLOY_SECONDS : SIEGE_CANNON_UNDEPLOY_SECONDS);
      releaseCannonStation(world, slot);
    } else {
      releaseCannonStation(world, slot);
    }
    return;
  }
  if (tryUseSiegeLadder(world, slot)) return;
  // Interact near a repairable (Damaged) segment is the defender repair
  // channel — it must never also trigger boarding (design §2.5).
  if (repairableSegmentNear(world, slot) >= 0) return;
  if (tryBoardCannon(world, slot)) return;
  if (isArtilleryClass(playerClass)) {
    for (const gun of ARTILLERY_EMPLACEMENTS) {
      const gunner = world.gunnerSlot[gun.id] ?? -1;
      if (gun.team !== world.team[slot] || gunner >= 0 || Math.hypot((world.x[slot] ?? 0) - gun.x, (world.z[slot] ?? 0) - gun.z) > 3) continue;
      world.gunnerSlot[gun.id] = slot;
      world.mannedGun[slot] = gun.id;
      world.gunYaw[gun.id] = gun.yaw;
      world.gunPitch[gun.id] = Math.max(gun.minPitch, 0.3);
      world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.ManningArtillery;
      return;
    }
  }
  // Riderless horses are public mounts: either team and every class may take
  // one. The server consumes the horse entity so two players cannot mount it.
  const horseIndex = riderlessHorseNear(world, slot);
  if (horseIndex >= 0) {
    despawnHorse(world.horses, horseIndex);
    world.mounted[slot] = 1;
    world.horseHp[slot] = CAVALRY_HORSE_HEALTH;
    world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.Mounted;
    return;
  }
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    if (world.vehicles.active[vehicleIndex] === 0) continue;
    const extents = vehicleWorldHalfExtents(world.vehicles.yaw[vehicleIndex] ?? 0);
    const dx = (world.x[slot] ?? 0) - (world.vehicles.x[vehicleIndex] ?? 0);
    const dz = (world.z[slot] ?? 0) - (world.vehicles.z[vehicleIndex] ?? 0);
    if (Math.abs(dx) <= extents.halfWidth + GALLEY_BOARD_RADIUS && Math.abs(dz) <= extents.halfDepth + GALLEY_BOARD_RADIUS) {
      boardVehicle(world, slot, vehicleIndex);
      return;
    }
  }
  if (!isCavalryClass(playerClass)) return;
  const teamSpawn = world.team[slot] === Team.Ottoman ? OTTOMAN_SPAWN : BYZANTINE_SPAWN;
  let canMount = Math.hypot((world.x[slot] ?? 0) - teamSpawn.x, (world.z[slot] ?? 0) - teamSpawn.z) <= 12;
  if (!canMount) for (let rider = 0; rider < MAX_PLAYERS; rider += 1) {
    if (world.active[rider] === 0 || (world.horseMarkerUntilTick[rider] ?? 0) < world.tick) continue;
    if (Math.hypot((world.x[slot] ?? 0) - (world.horseMarkerX[rider] ?? 0), (world.z[slot] ?? 0) - (world.horseMarkerZ[rider] ?? 0)) <= CAVALRY_REMOUNT_RADIUS) { canMount = true; break; }
  }
  if (canMount) {
    world.mounted[slot] = 1; world.horseHp[slot] = CAVALRY_HORSE_HEALTH;
    world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.Mounted;
  }
}

function addWallEvent(world: WorldState, segmentId: number, state: WallState, attackerEntityId: number, hpFrac: number): void {
  const index = world.wallEventCount;
  if (index >= WALL_SEGMENT_COUNT) return;
  world.wallEventSegments[index] = segmentId;
  world.wallEventStates[index] = state;
  world.wallEventAttackers[index] = attackerEntityId;
  world.wallEventHpFrac[index] = hpFrac;
  world.wallEventCount += 1;
}

function impactArtillery(world: WorldState, projectile: number): void {
  const sourceSlot = world.projectileSourceSlot[projectile] ?? 0;
  const gunId = world.projectileGun[projectile] ?? -1;
  const gun = ARTILLERY_EMPLACEMENTS[gunId];
  const galleyProjectile = isGalleyProjectileGun(gunId);
  if (galleyProjectile) {
    const x = world.projectileX[projectile] ?? 0;
    const y = world.projectileY[projectile] ?? 0;
    const z = world.projectileZ[projectile] ?? 0;
    const hull = projectileHitsGalley(world, x, z);
    if (hull >= 0) {
      const hullDamage = GALLEY_GUN_DAMAGE;
      damageGalleyHull(world, hull, hullDamage, sourceSlot);
    }
    if (y <= heightAt(x, z) || world.tick >= (world.projectileUntilTick[projectile] ?? 0)) {
      emitEvent(world, CombatEventType.ArtilleryImpact, world.entityId[sourceSlot] ?? 0, 0, 0);
    } else {
      querySpatialHashInto(world.spatialHash, world, x, z, GALLEY_SPLASH_RADIUS, world.queryScratch);
      for (const target of world.queryScratch) {
        if (!isAlive(world, target) || world.active[target] === 0) continue;
        const distance = Math.hypot((world.x[target] ?? 0) - x, (world.z[target] ?? 0) - z);
        if (distance > GALLEY_SPLASH_RADIUS) continue;
        const damage = distance < 0.8 ? GALLEY_GUN_DAMAGE : GALLEY_SPLASH_EDGE_DAMAGE + (GALLEY_GUN_DAMAGE - GALLEY_SPLASH_EDGE_DAMAGE) * (1 - distance / GALLEY_SPLASH_RADIUS);
        if (world.mounted[target] !== 0 && Math.abs((world.y[target] ?? 0) - y) < 1.5) applyHorseDamage(world, sourceSlot, target, damage);
        else applyDamage(world, sourceSlot, target, damage, distance, false, KillCause.GalleyGun);
      }
      emitEvent(world, CombatEventType.ArtilleryImpact, world.entityId[sourceSlot] ?? 0, 0, 0);
    }
    return;
  }
  if (gun === undefined && !isCannonProjectileGun(gunId)) return;
  if (world.active[sourceSlot] === 0) return;
  // Cannon projectiles resolve to kind "bombard": they damage walls through
  // this existing path, exactly like the removed fixed bombards (design §1.8).
  const bombard = isCannonProjectileGun(gunId) || gun?.kind === "bombard";
  const cannonIndex = isCannonProjectileGun(gunId) ? cannonIndexForProjectileGun(gunId) : -1;
  const personalCannon = cannonIndex >= 0 && isPersonalCannon(world.cannons, cannonIndex);
  const heavyBombard = cannonIndex >= 0 && !personalCannon;
  const wallDamage = personalCannon ? PERSONAL_CANNON_WALL_DAMAGE : heavyBombard ? BOMBARD_WALL_DAMAGE : ARTILLERY_WALL_DAMAGE;
  const splashRadius = personalCannon ? PERSONAL_CANNON_SPLASH_RADIUS : heavyBombard ? BOMBARD_SPLASH_RADIUS : ARTILLERY_SPLASH_RADIUS;
  const splashEdgeDamage = personalCannon ? PERSONAL_CANNON_SPLASH_EDGE_DAMAGE : heavyBombard ? BOMBARD_SPLASH_EDGE_DAMAGE : ARTILLERY_SPLASH_EDGE_DAMAGE;
  const directDamage = personalCannon ? PERSONAL_CANNON_DIRECT_DAMAGE : heavyBombard ? BOMBARD_DIRECT_DAMAGE : ARTILLERY_DIRECT_DAMAGE;
  const x = world.projectileX[projectile] ?? 0;
  const y = world.projectileY[projectile] ?? 0;
  const z = world.projectileZ[projectile] ?? 0;
  let wallId = -1;
  if (bombard) for (const wall of WALL_SEGMENTS) {
    const box = wall.box;
    if (world.wallState[wall.id] === WallState.Breached) continue;
    if (Math.abs(x - box.x) <= box.width / 2 + 1 && Math.abs(z - box.z) <= box.depth / 2 + 1 && y <= box.y + box.height / 2 + 1) { wallId = wall.id; break; }
  }
  if (wallId >= 0) {
    const previousState = world.wallState[wallId] as WallState;
    const hp = Math.max(0, (world.wallHp[wallId] ?? 0) - wallDamage);
    world.wallHp[wallId] = hp;
    const frac = wallHpFrac(hp);
    const nextState = hp === 0 ? WallState.Breached : hp <= WALL_SEGMENT_HEALTH / 2 ? WallState.Damaged : WallState.Intact;
    if (nextState !== previousState) {
      world.wallState[wallId] = nextState;
      world.wallLastFrac[wallId] = frac;
      addWallEvent(world, wallId, nextState, world.entityId[sourceSlot] ?? 0, frac);
      if (nextState === WallState.Breached) {
        emitEvent(world, CombatEventType.Breach, world.entityId[sourceSlot] ?? 0, 0, wallId);
        grantXp(world, sourceSlot, XpSource.BreachCreated, XP_BREACH_CREATED);
        // The breach pays the whole recent crew, not just the last shot (§2.4).
        const base = wallId * WALL_CONTRIBUTOR_RING;
        for (let index = 0; index < WALL_CONTRIBUTOR_RING; index += 1) {
          const contributor = world.wallContributorSlot[base + index] ?? -1;
          if (contributor < 0 || contributor === sourceSlot || world.active[contributor] === 0) continue;
          grantXp(world, contributor, XpSource.BreachCreated, XP_BREACH_CONTRIBUTOR);
        }
      }
    } else if (frac !== (world.wallLastFrac[wallId] ?? 16)) {
      world.wallLastFrac[wallId] = frac;
      addWallEvent(world, wallId, nextState, world.entityId[sourceSlot] ?? 0, frac);
    }
    recordWallContributor(world, wallId, sourceSlot);
    grantXp(world, sourceSlot, XpSource.ArtilleryWallHit, XP_ARTILLERY_WALL_HIT);
    grantMedalCounter(world, sourceSlot, MedalCategory.WallBreaker, wallDamage);
    // Crew share on every wall hit: same-team players near the firing gun
    // (cannon or emplacement), not only at fire time (§2.4).
    let gunX = gun?.x ?? 0;
    let gunZ = gun?.z ?? 0;
    if (isCannonProjectileGun(gunId)) {
      const cannonIndex = cannonIndexForProjectileGun(gunId);
      gunX = world.cannons.x[cannonIndex] ?? 0;
      gunZ = world.cannons.z[cannonIndex] ?? 0;
    }
    for (let helper = 0; helper < MAX_PLAYERS; helper += 1) {
      if (helper === sourceSlot || world.active[helper] === 0 || !isAlive(world, helper) || world.team[helper] !== world.team[sourceSlot]) continue;
      if (Math.hypot((world.x[helper] ?? 0) - gunX, (world.z[helper] ?? 0) - gunZ) > ARTILLERY_CREW_RADIUS) continue;
      grantXp(world, helper, XpSource.CrewAssist, XP_WALL_HIT_CREW_SHARE);
    }
  }
  querySpatialHashInto(world.spatialHash, world, x, z, splashRadius, world.queryScratch);
  for (const target of world.queryScratch) {
    if (!isAlive(world, target) || world.active[target] === 0) continue;
    const distance = Math.hypot((world.x[target] ?? 0) - x, (world.z[target] ?? 0) - z);
    if (distance > splashRadius) continue;
    const damage = distance < 0.8 ? directDamage : splashEdgeDamage + (directDamage - splashEdgeDamage) * (1 - distance / splashRadius);
    if (world.mounted[target] !== 0 && Math.abs((world.y[target] ?? 0) - y) < 1.5) applyHorseDamage(world, sourceSlot, target, damage);
    else applyDamage(world, sourceSlot, target, damage, distance, false, KillCause.Artillery);
  }
  // Artillery splash also damages siege cannons — wall-guns are the natural
  // counter-battery (design §1.5). Same falloff as player splash.
  for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
    if (world.cannons.active[index] === 0 || (world.cannons.hp[index] ?? 0) === 0) continue;
    const distance = Math.hypot((world.cannons.x[index] ?? 0) - x, (world.cannons.z[index] ?? 0) - z);
    if (distance > splashRadius + cannonRadius(world.cannons, index)) continue;
    const damage = distance < 0.8 ? directDamage : splashEdgeDamage + (directDamage - splashEdgeDamage) * Math.max(0, 1 - distance / splashRadius);
    if (damage > 0) damageCannon(world, index, damage, sourceSlot);
  }
  emitEvent(world, CombatEventType.ArtilleryImpact, world.entityId[sourceSlot] ?? 0, 0, 0);
}

function updateArtillery(world: WorldState): void {
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    const gunId = world.mannedGun[slot] ?? -1;
    if (gunId < 0 || !isAlive(world, slot)) continue;
    const gun = ARTILLERY_EMPLACEMENTS[gunId];
    if (gun === undefined) continue;
    const yawDelta = Math.atan2(Math.sin((world.desiredYaw[slot] ?? gun.yaw) - gun.yaw), Math.cos((world.desiredYaw[slot] ?? gun.yaw) - gun.yaw));
    world.gunYaw[gunId] = gun.yaw + Math.max(-gun.yawArc, Math.min(gun.yawArc, yawDelta));
    world.gunPitch[gunId] = Math.max(gun.minPitch, Math.min(gun.maxPitch, world.pitch[slot] ?? 0.3));
    if ((world.buttons[slot] ?? 0) & InputButton.Fire && world.tick >= (world.gunReloadUntilTick[gunId] ?? 0)) {
      let projectile = -1;
      for (let index = 0; index < MAX_ARTILLERY_PROJECTILES; index += 1) if (world.projectileActive[index] === 0) { projectile = index; break; }
      if (projectile < 0) continue;
      let crew = 0;
      for (let helper = 0; helper < MAX_PLAYERS && crew < 2; helper += 1) if (helper !== slot && world.active[helper] !== 0 && isAlive(world, helper) && world.team[helper] === world.team[slot] && Math.hypot((world.x[helper] ?? 0) - gun.x, (world.z[helper] ?? 0) - gun.z) <= ARTILLERY_CREW_RADIUS) { crew += 1; grantXp(world, helper, XpSource.CrewAssist, XP_ARTILLERY_CREW_ASSIST); }
      const reload = ARTILLERY_SOLO_RELOAD_SECONDS + (ARTILLERY_CREW_RELOAD_SECONDS - ARTILLERY_SOLO_RELOAD_SECONDS) * (crew / 2);
      world.gunReloadUntilTick[gunId] = world.tick + ticks(reload);
      const yaw = world.gunYaw[gunId] ?? gun.yaw; const pitch = world.gunPitch[gunId] ?? 0.3; const cosPitch = Math.cos(pitch);
      world.projectileActive[projectile] = 1; world.projectileSourceSlot[projectile] = slot; world.projectileGun[projectile] = gunId;
      world.projectileX[projectile] = gun.x; world.projectileY[projectile] = heightAt(gun.x, gun.z) + 1.5; world.projectileZ[projectile] = gun.z;
      world.projectileVelocityX[projectile] = -Math.sin(yaw) * cosPitch * ARTILLERY_PROJECTILE_SPEED;
      world.projectileVelocityY[projectile] = Math.sin(pitch) * ARTILLERY_PROJECTILE_SPEED;
      world.projectileVelocityZ[projectile] = -Math.cos(yaw) * cosPitch * ARTILLERY_PROJECTILE_SPEED;
      world.projectileUntilTick[projectile] = world.tick + ticks(5);
      emitEvent(world, CombatEventType.ArtilleryFire, world.entityId[slot] ?? 0, 0, gunId);
    }
  }
  for (let projectile = 0; projectile < MAX_ARTILLERY_PROJECTILES; projectile += 1) {
    if (world.projectileActive[projectile] === 0) continue;
    world.projectileX[projectile] = (world.projectileX[projectile] ?? 0) + (world.projectileVelocityX[projectile] ?? 0) * FIXED_DT_SECONDS;
    world.projectileY[projectile] = (world.projectileY[projectile] ?? 0) + (world.projectileVelocityY[projectile] ?? 0) * FIXED_DT_SECONDS;
    world.projectileZ[projectile] = (world.projectileZ[projectile] ?? 0) + (world.projectileVelocityZ[projectile] ?? 0) * FIXED_DT_SECONDS;
    world.projectileVelocityY[projectile] = (world.projectileVelocityY[projectile] ?? 0) + ARTILLERY_PROJECTILE_GRAVITY * FIXED_DT_SECONDS;
    const gunId = world.projectileGun[projectile] ?? -1;
    if (isGalleyProjectileGun(gunId)) {
      const x = world.projectileX[projectile] ?? 0;
      const z = world.projectileZ[projectile] ?? 0;
      const sourceVehicle = world.aboardVehicle[world.projectileSourceSlot[projectile] ?? 0] ?? -1;
      const hull = projectileHitsGalley(world, x, z, sourceVehicle);
      // Ground/water impact: terrain height everywhere — over land the
      // heightfield, over water the carved bed below the surface (8e-17).
      // The client visual stops shells at the water surface instead
      // (impactHeightAt); the ≤2.2 m event-vs-visual delta over the channel
      // is documented in ADR 0044 as an accepted divergence.
      if (hull >= 0 || (world.projectileY[projectile] ?? 0) <= heightAt(x, z) || world.tick >= (world.projectileUntilTick[projectile] ?? 0)) {
        impactArtillery(world, projectile);
        world.projectileActive[projectile] = 0;
      }
      continue;
    }
    const gun = ARTILLERY_EMPLACEMENTS[gunId];
    let hitWall = false;
    if (gun?.kind === "bombard" || isCannonProjectileGun(gunId)) for (const wall of WALL_SEGMENTS) {
      const box = wall.box;
      if (world.wallState[wall.id] === WallState.Breached) continue;
      if (Math.abs((world.projectileX[projectile] ?? 0) - box.x) <= box.width / 2 && Math.abs((world.projectileZ[projectile] ?? 0) - box.z) <= box.depth / 2 && (world.projectileY[projectile] ?? 0) <= box.y + box.height / 2) { hitWall = true; break; }
    }
    if (hitWall || (world.projectileY[projectile] ?? 0) <= heightAt(world.projectileX[projectile] ?? 0, world.projectileZ[projectile] ?? 0) || world.tick >= (world.projectileUntilTick[projectile] ?? 0)) { impactArtillery(world, projectile); world.projectileActive[projectile] = 0; }
  }
}

function updateCapture(world: WorldState): void {
  let ottomanHeld = 0;
  let byzantineHeld = 0;
  for (let pointIndex = 0; pointIndex < CAPTURE_POINTS.length; pointIndex += 1) {
    const point = CAPTURE_POINTS[pointIndex];
    if (point === undefined) continue;
    let ottoman = 0; let byzantine = 0;
    querySpatialHashInto(world.spatialHash, world, point.x, point.z, point.radius, world.queryScratch);
    for (const slot of world.queryScratch) {
      if (world.active[slot] === 0 || !isAlive(world, slot)) continue;
      if (Math.hypot((world.x[slot] ?? 0) - point.x, (world.z[slot] ?? 0) - point.z) > point.radius) continue;
      if (world.team[slot] === Team.Ottoman) ottoman += 1; else if (world.team[slot] === Team.Byzantine) byzantine += 1;
    }
    let progress = world.pointProgress[pointIndex] ?? 0;
    if (ottoman > 0 && byzantine === 0) progress = Math.min(CAPTURE_MAX_PROGRESS, progress + CAPTURE_RATE_PER_PLAYER * Math.min(CAPTURE_MAX_PLAYERS, ottoman) * FIXED_DT_SECONDS);
    else if (byzantine > 0 && ottoman === 0) progress = Math.max(-CAPTURE_MAX_PROGRESS, progress - CAPTURE_RATE_PER_PLAYER * Math.min(CAPTURE_MAX_PLAYERS, byzantine) * FIXED_DT_SECONDS);
    else if (ottoman === 0 && byzantine === 0) progress *= 0.985;
    world.pointProgress[pointIndex] = progress;
    const owner = progress >= CAPTURE_MAX_PROGRESS ? Team.Ottoman : progress <= -CAPTURE_MAX_PROGRESS ? Team.Byzantine : Team.None;
    const previousOwner = world.pointOwner[pointIndex] as Team;
    world.pointOwner[pointIndex] = owner;
    if (owner !== previousOwner && owner !== Team.None) {
      emitEvent(world, CombatEventType.Capture, 0, 0, owner);
      for (const slot of world.queryScratch) if (world.active[slot] !== 0 && isAlive(world, slot) && world.team[slot] === owner) {
        world.warCaptures[slot] = Math.min(65_535, (world.warCaptures[slot] ?? 0) + 1);
        grantXp(world, slot, XpSource.PointCaptured, XP_POINT_CAPTURED);
      }
    }
    if (owner === Team.Ottoman) ottomanHeld += 1;
    else if (owner === Team.Byzantine) byzantineHeld += 1;
    if (owner !== Team.None) for (const slot of world.queryScratch) if (isAlive(world, slot) && world.team[slot] === owner) {
      world.captureTicks[slot] = (world.captureTicks[slot] ?? 0) + 1;
      world.captureXpCarry[slot] = (world.captureXpCarry[slot] ?? 0) + XP_CAPTURE_PRESENCE_PER_SECOND * FIXED_DT_SECONDS;
      const whole = Math.floor(world.captureXpCarry[slot] ?? 0);
      if (whole >= 1) { world.captureXpCarry[slot] -= whole; grantXp(world, slot, XpSource.CapturePresence, whole); }
    }
  }
  world.captureOwner = world.pointOwner[0] as Team;
  world.captureProgress = world.pointProgress[0] ?? 0;
  if (world.tick % ticks(1) !== 0) return;
  world.byzantineTicketDrainCarry += CAPTURE_TICKET_DRAIN_BY_POINTS[ottomanHeld] ?? 4;
  const byzantineDrain = Math.floor(world.byzantineTicketDrainCarry);
  world.byzantineTicketDrainCarry -= byzantineDrain;
  world.byzantineTickets = Math.max(0, world.byzantineTickets - byzantineDrain);
  world.ottomanTicketDrainCarry += CAPTURE_TICKET_DRAIN_BY_POINTS[byzantineHeld] ?? 4;
  const ottomanDrain = Math.floor(world.ottomanTicketDrainCarry);
  world.ottomanTicketDrainCarry -= ottomanDrain;
  world.ottomanTickets = Math.max(0, world.ottomanTickets - ottomanDrain);
  if (world.ottomanTickets === 0 || world.byzantineTickets === 0) {
    const winner = world.ottomanTickets === 0 ? Team.Byzantine : Team.Ottoman;
    world.roundPhase = RoundPhase.Victory; world.phaseUntilTick = world.tick + ticks(VICTORY_SECONDS);
    emitEvent(world, CombatEventType.Victory, winner, 0, 0);
    settleWar(world, winner);
  }
}

export function resetRoundForPlaytest(world: WorldState): void {
  world.roundPhase = RoundPhase.Active; world.phaseUntilTick = 0; world.captureOwner = Team.None; world.captureProgress = 0; world.ottomanTickets = WAR_TICKETS; world.byzantineTickets = WAR_TICKETS; world.ottomanTicketDrainCarry = 0; world.byzantineTicketDrainCarry = 0;
  world.pendingShots.length = 0; world.events.length = 0;
  world.pointOwner.fill(Team.None); world.pointProgress.fill(0); world.wallHp.fill(WALL_SEGMENT_HEALTH); world.wallState.fill(WallState.Intact); world.wallEventCount = 0;
  world.wallContributorSlot.fill(-1); world.wallContributorTick.fill(0); world.wallLastFrac.fill(16);
  world.gunnerSlot.fill(-1); world.mannedGun.fill(-1); world.projectileActive.fill(0);
  for (let index = FIXED_SIEGE_CANNON_COUNT; index < MAX_SIEGE_CANNONS; index += 1) despawnCannon(world.cannons, index);
  world.horses.active.fill(0); world.horses.team.fill(Team.None);
  spawnCannonsAtStaging(world.cannons);
  world.cannonCrew.fill(-1); world.pushXpCarry.fill(0); world.repairXpCarry.fill(0);
  world.earthworkKind.fill(0); world.earthworkCount = 0; world.nextEarthworkTick.fill(0);
  resetWarStats(world);
  for (let index = 0; index < GALLEY_COUNT; index += 1) {
    const dock = GALLEY_DOCKS[index];
    if (dock !== undefined) spawnVehicleAtDock(world.vehicles, index, dock.team, dock, GALLEY_HULL_HP);
  }
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    if ((world.aboardVehicle[slot] ?? -1) >= 0) releaseVehicleStation(world, slot);
    world.requestedSpawnPoint[slot] = -1;
    spawnPlayer(world, slot);
  }
}

export function stepWorld(world: WorldState): void {
  world.tick = (world.tick + 1) >>> 0;
  if (world.roundPhase === RoundPhase.Victory) {
    const startedAt = performance.now();
    if (world.tick >= world.phaseUntilTick) resetRoundForPlaytest(world);
    rebuildSpatialHash(world.spatialHash, world);
    captureRewindFrame(world);
    world.phaseTimings.input = 0;
    world.phaseTimings.movement = performance.now() - startedAt;
    world.phaseTimings.combat = 0;
    world.phaseTimings.capture = 0;
    world.phaseTimings.artillery = 0;
    world.phaseTimings.naval = 0;
    return;
  }

  let startedAt = performance.now();
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    world.combatRewindTick[slot] = world.tick;
    world.warTicks[slot] = Math.min(0xffff_ffff, (world.warTicks[slot] ?? 0) + 1);
    const input = world.inputQueues[slot]?.shift();
    if (input === undefined) continue;
    world.prevButtons[slot] = world.buttons[slot] ?? 0;
    world.buttons[slot] = input.buttons;
    world.desiredYaw[slot] = input.yaw;
    world.pitch[slot] = input.pitch;
    world.ackInputSeq[slot] = input.seq;
    world.lastInputTick[slot] = world.tick;
    world.combatRewindTick[slot] = input.lastSnapshotTick;
  }
  world.phaseTimings.input = performance.now() - startedAt;

  startedAt = performance.now();
  updateVehicles(world);
  world.phaseTimings.naval = performance.now() - startedAt;

  // Siege cannons: a vehicle-type update folded into the naval timing field
  // (lighter touch than widening SimulationPhaseTimings).
  startedAt = performance.now();
  updateCannons(world);
  world.phaseTimings.naval += performance.now() - startedAt;
  updateRiderlessHorses(world);

  startedAt = performance.now();
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    if (!isAlive(world, slot)) {
      // Humans redeploy only on an explicit Deploy request (8e-13); their
      // respawnAtTick is the deploy floor, not a schedule. Bots keep the timer.
      if (world.bot[slot] === 1 && world.tick >= (world.respawnAtTick[slot] ?? 0)) spawnPlayer(world, slot);
      continue;
    }
    if (world.tick < (world.staggerUntilTick[slot] ?? 0) || (world.mannedGun[slot] ?? -1) >= 0) {
      // Stowed operators (wall-gun gunners, staggering cavalry) are never
      // carrying their field gun.
      world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.CarryingFieldGun;
      continue;
    }
    if ((world.aboardVehicle[slot] ?? -1) >= 0) {
      world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.CarryingFieldGun;
      const position = aboardWorldPosition(world, slot);
      if (position !== undefined) {
        world.x[slot] = position.x;
        world.y[slot] = 1.2;
        world.z[slot] = position.z;
        const vehicleIndex = world.aboardVehicle[slot] ?? 0;
        world.yaw[slot] = world.vehicles.yaw[vehicleIndex] ?? 0;
        world.velocityX[slot] = 0;
        world.velocityY[slot] = 0;
        world.velocityZ[slot] = 0;
        world.grounded[slot] = 1;
        world.jumpHeld[slot] = 0;
      }
      continue;
    }
    // Cannon crew ride the carriage: the gunner and pushers are glued to
    // their sockets instead of running the infantry movement simulation.
    const crewCannon = world.cannonCrew[slot] ?? -1;
    if (crewCannon >= 0) {
      world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.CarryingFieldGun;
      if (world.cannons.active[crewCannon] === 1 && (world.cannons.hp[crewCannon] ?? 0) > 0) {
        glueCannonCrew(world, slot, crewCannon);
        continue;
      }
      releaseCannonStation(world, slot);
    }
    const previous = movementStateAt(world, slot);
    const mounted = world.mounted[slot] !== 0;
    const buffed = (world.flags[slot] ?? 0) & PlayerFlag.AuraActive;
    const wade = waterMultiplier(world, slot);
    // Directional slope resistance (Phase 8e-8, ADR 0037): foot movement only,
    // probed against the same boxes the sweep resolves (SIEGE_BLOCKOUT plus
    // the earthwork fill at the current position). The earthwork scratch is
    // refilled for the sweep below; the slope probe consumes it first.
    const slopeEarthworkCount = mounted ? 0 : fillNearbyEarthworkBoxes(world, previous.x, previous.z, 24, earthworkBoxScratch);
    const slopeFactor = mounted
      ? 1
      : slopeSpeedFactorAt(previous.x, previous.z, previous.y - CAPSULE_HEIGHT / 2, world.buttons[slot] ?? 0, world.desiredYaw[slot] ?? 0, SIEGE_BLOCKOUT, world.wallState, earthworkBoxScratch, slopeEarthworkCount);
    const speedMultiplier = (buffed ? SUPPORT_SPEED_MULTIPLIER * wade : wade) * slopeFactor;
    const personalCannon = personalCannonIndexForOwner(world, slot);
    const carryingFieldGun = personalCannon >= 0
      && (world.cannons.deployed[personalCannon] ?? 0) === 0
      && (world.cannonCrew[slot] ?? -1) < 0;
    // Phase 8e-25 (reality pass): replicate the carry state as a player flag
    // every tick so the client prediction applies the same speed factor —
    // before this, the 0.7× penalty was server-only and every Topçu player
    // rubber-banded against their own prediction.
    if (carryingFieldGun) world.flags[slot] = (world.flags[slot] ?? 0) | PlayerFlag.CarryingFieldGun;
    else world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.CarryingFieldGun;
    const carriedSpeed = carryingFieldGun ? PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER : 1;
    const next = mounted
      ? simulateCavalryMovement(previous, { buttons: world.buttons[slot] ?? 0, yaw: world.desiredYaw[slot] ?? 0, pitch: world.pitch[slot] ?? 0 }, FIXED_DT_SECONDS, speedMultiplier)
      : simulateMovement(previous, { buttons: world.buttons[slot] ?? 0, yaw: world.desiredYaw[slot] ?? 0, pitch: world.pitch[slot] ?? 0 }, FIXED_DT_SECONDS, speedMultiplier * carriedSpeed);
    const earthworkCount = fillNearbyEarthworkBoxes(world, next.x, next.z, 24, earthworkBoxScratch);
    const collision = sweepCapsuleAgainstBoxes(previous, next, SIEGE_BLOCKOUT, world.wallState, mounted, earthworkBoxScratch, earthworkCount, mounted ? CAVALRY_MAX_STEP_UP : undefined);
    const predictedY = next.y;
    next.x = collision.x; next.y = collision.y; next.z = collision.z;
    next.grounded = collision.grounded;
    if (collision.grounded || collision.y > predictedY + 0.001) next.velocityY = 0;
    writeMovementState(world, slot, next);
    if (Math.hypot(next.velocityX, next.velocityZ) < 0.15) { if ((world.stationarySinceTick[slot] ?? 0) === 0) world.stationarySinceTick[slot] = world.tick; } else world.stationarySinceTick[slot] = world.tick;
    if ((world.flags[slot] ?? 0) & PlayerFlag.SpawnProtected && world.tick >= (world.spawnProtectionUntilTick[slot] ?? 0)) world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // A holstered or mid-draw ranged weapon keeps reloading: the deadline is
    // absolute, so reloadTicks run down (and the client's radial advances)
    // while the blade is out. Drawing a weapon whose holstered reload has
    // finished comes up loaded (Phase 8e-8, ADR 0037 — replaces the 8e-3
    // freeze, which slid the deadline one tick per holstered tick).
    if ((world.reloadUntilTick[slot] ?? 0) > 0 && world.tick >= (world.reloadUntilTick[slot] ?? 0)) {
      world.ammo[slot] = rangedWeaponForClass(world.playerClass[slot] as PlayerClass, world.team[slot] as Team).magazineSize ?? 1;
      world.reloadUntilTick[slot] = 0;
      world.flags[slot] = (world.flags[slot] ?? 0) & ~PlayerFlag.Reloading;
    }
    if (world.tick - (world.lastDamagedTick[slot] ?? 0) >= ticks(HEALTH_REGEN_DELAY_SECONDS) && (world.health[slot] ?? 0) < MAX_HEALTH && world.tick % ticks(1) === 0) world.health[slot] = Math.min(MAX_HEALTH, (world.health[slot] ?? 0) + HEALTH_REGEN_PER_SECOND);
    applyWaterDrain(world, slot);
    checkEasterEggDiscovery(world, slot);
  }
  rebuildSpatialHash(world.spatialHash, world);
  captureRewindFrame(world);
  world.phaseTimings.movement = performance.now() - startedAt;

  startedAt = performance.now();
  if (world.tick % SUPPORT_AURA_RECOMPUTE_TICKS === 0) updateAuras(world);
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0 || !isAlive(world, slot)) continue;
    if ((world.buttons[slot] ?? 0) & InputButton.Torch && ((world.prevButtons[slot] ?? 0) & InputButton.Torch) === 0) {
      world.torch[slot] = ((world.torch[slot] ?? 0) === 0 ? 1 : 0);
    }
    // Weapon slots: stepped through the one shared machine the client's
    // fixed-step prediction also runs (Phase 8e-3), driven from typed-array
    // scratch so the sim stays allocation-free.
    weaponSlotScratch.activeSlot = world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT;
    weaponSlotScratch.targetSlot = world.weaponSwitchTarget[slot] ?? DEFAULT_WEAPON_SLOT;
    weaponSlotScratch.ticksRemaining = world.weaponSwitchTicks[slot] ?? 0;
    stepWeaponSlots(weaponSlotScratch, world.buttons[slot] ?? 0, world.prevButtons[slot] ?? 0);
    world.activeWeaponSlot[slot] = weaponSlotScratch.activeSlot;
    world.weaponSwitchTarget[slot] = weaponSlotScratch.targetSlot;
    world.weaponSwitchTicks[slot] = weaponSlotScratch.ticksRemaining;
    if ((world.buttons[slot] ?? 0) & InputButton.Interact) tryInteract(world, slot);
    if ((world.mannedGun[slot] ?? -1) >= 0) continue;
    // Cannon crew have their weapons stowed: the gunner's Fire drives the
    // cannon (updateCannons), pushers cannot fire, reload, or melee (§1.3).
    if ((world.cannonCrew[slot] ?? -1) >= 0) continue;
    // Galley gun stations stow personal weapons the same way: one trigger
    // press must drive exactly one weapon, so a gunner holding Fire fires the
    // ship gun (updateVehicles) and never their personal arquebus in the same
    // tick (reality pass — a single trigger produced two projectiles). Helm
    // and passengers keep their personal weapons.
    if ((world.aboardVehicle[slot] ?? -1) >= 0) {
      const vehicleIndex = world.aboardVehicle[slot] ?? 0;
      const station = vehicleStationForSlot(world, vehicleIndex, slot);
      if (station === "gun1" || station === "gun2") continue;
    }
    // Defender repair channel: hold Interact near a Damaged segment; repairing
    // is defenseless, so it stows the weapon for the tick (§2.5).
    if (((world.buttons[slot] ?? 0) & InputButton.Interact) !== 0 && updateWallRepair(world, slot)) continue;
    if ((world.buttons[slot] ?? 0) & InputButton.RaiseEarthwork) placeEarthwork(world, slot, EarthworkKind.Mound);
    if ((world.buttons[slot] ?? 0) & InputButton.DigEarthwork) placeEarthwork(world, slot, EarthworkKind.Trench);
    const buttons = world.buttons[slot] ?? 0;
    const fireHeld = (buttons & InputButton.Fire) !== 0;
    const fireEdge = fireHeld && ((world.prevButtons[slot] ?? 0) & InputButton.Fire) === 0;
    const activeDef = weaponDefAtSlot(world.playerClass[slot] as PlayerClass, world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT);
    if (buttons & InputButton.Reload) startReload(world, slot);
    if (buttons & InputButton.Melee) melee(world, slot);
    // Ranged weapons are deliberate single shots: a held trigger is not
    // re-armed by the reload completing. Blades retain their cadence-based
    // held-input behaviour, and bots pulse Fire once per loaded round.
    else if (activeDef.kind === "melee") {
      // A blade slot is never allowed to enter fireWeapon/resolveRay. Keep
      // this branch explicit: it protects sword and dagger from any future
      // ranged-slot refactor and makes the left-click contract unambiguous.
      if (fireHeld) melee(world, slot);
    } else if (fireEdge) {
      fireWeapon(world, slot, world.combatRewindTick[slot] ?? world.tick);
    }
  }
  for (let index = world.pendingShots.length - 1; index >= 0; index -= 1) { const shot = world.pendingShots[index]; if (shot !== undefined && shot.resolveTick <= world.tick) { resolveRay(world, shot); world.pendingShots.splice(index, 1); } }
  world.phaseTimings.combat = performance.now() - startedAt;

  startedAt = performance.now();
  updateArtillery(world);
  world.phaseTimings.artillery = performance.now() - startedAt;

  startedAt = performance.now();
  updateCapture(world);
  const oldestEvent = world.tick - 4; while ((world.events[0]?.tick ?? world.tick) < oldestEvent) world.events.shift();
  world.phaseTimings.capture = performance.now() - startedAt;
}

export function entityStateAt(world: WorldState, slot: number): EntityState {
  return writeEntityStateAt(world, slot, {
    entityId: 0, x: 0, y: GROUND_CENTER_Y, z: 0, yaw: 0, pitch: 0,
  });
}

export function writeEntityStateAt(world: WorldState, slot: number, state: EntityState): EntityState {
  const reloadTicks = Math.max(0, (world.reloadUntilTick[slot] ?? 0) - world.tick);
  const respawnTicks = Math.max(0, (world.respawnAtTick[slot] ?? 0) - world.tick);
  state.entityId = world.entityId[slot] ?? 0;
  const aboard = (world.aboardVehicle[slot] ?? -1) >= 0;
  if (aboard) {
    const position = aboardWorldPosition(world, slot);
    state.x = position?.x ?? (world.x[slot] ?? 0);
    state.y = 1.2;
    state.z = position?.z ?? (world.z[slot] ?? 0);
    const vehicleIndex = world.aboardVehicle[slot] ?? 0;
    state.yaw = world.vehicles.yaw[vehicleIndex] ?? (world.yaw[slot] ?? 0);
  } else {
    state.x = world.x[slot] ?? 0;
    state.y = world.y[slot] ?? GROUND_CENTER_Y;
    state.z = world.z[slot] ?? 0;
    state.yaw = world.yaw[slot] ?? 0;
  }
  state.pitch = world.pitch[slot] ?? 0;
  state.team = world.team[slot] as Team;
  state.health = world.health[slot] ?? 0;
  state.flags = world.flags[slot] ?? 0;
  state.ammo = world.ammo[slot] ?? 0;
  state.reloadTicks = Math.min(255, reloadTicks);
  state.weaponSlot = world.activeWeaponSlot[slot] ?? DEFAULT_WEAPON_SLOT;
  state.weaponSwitchTicks = world.weaponSwitchTicks[slot] ?? 0;
  state.respawnTicks = Math.min(255, respawnTicks);
  state.kills = world.kills[slot] ?? 0;
  state.deaths = world.deaths[slot] ?? 0;
  state.assists = world.assists[slot] ?? 0;
  state.captureSeconds = Math.floor((world.captureTicks[slot] ?? 0) * FIXED_DT_SECONDS);
  state.playerClass = world.playerClass[slot] as PlayerClass;
  state.mounted = world.mounted[slot] !== 0;
  state.horseHp = world.horseHp[slot] ?? 0;
  state.torch = world.torch[slot] ?? 0;
  state.earthworkKind = 0;
  return state;
}

export function writeVehicleEntityStateAt(world: WorldState, vehicleIndex: number, state: EntityState): EntityState {
  state.entityId = vehicleEntityId(vehicleIndex);
  state.x = world.vehicles.x[vehicleIndex] ?? 0;
  state.y = 0;
  state.z = world.vehicles.z[vehicleIndex] ?? 0;
  state.yaw = world.vehicles.yaw[vehicleIndex] ?? 0;
  state.pitch = 0;
  state.team = world.vehicles.team[vehicleIndex] as Team;
  state.health = 0;
  state.flags = 0;
  state.ammo = 0;
  state.reloadTicks = 0;
  state.respawnTicks = 0;
  state.kills = 0;
  state.deaths = 0;
  state.assists = 0;
  state.captureSeconds = 0;
  state.shipKind = EntityKind.Galley;
  state.shipHullHp = world.vehicles.hullHp[vehicleIndex] ?? 0;
  state.shipState = vehicleOccupancyState(world.vehicles, vehicleIndex, (world.vehicles.listingUntilTick[vehicleIndex] ?? 0) > world.tick);
  state.shipGun1Yaw = world.vehicles.gun1Yaw[vehicleIndex] ?? state.yaw + Math.PI / 2;
  state.shipGun2Yaw = world.vehicles.gun2Yaw[vehicleIndex] ?? state.yaw - Math.PI / 2;
  return state;
}

export function writeCannonEntityStateAt(world: WorldState, cannonIndex: number, state: EntityState): EntityState {
  state.entityId = cannonEntityId(cannonIndex);
  state.x = world.cannons.x[cannonIndex] ?? 0;
  // Cannons carry no y in their sim state; the terrain height is the same
  // deterministic function on both sides, so the wire value is derived here
  // and the client derives the same value for rendering (Phase 8e-11).
  state.y = heightAt(state.x, world.cannons.z[cannonIndex] ?? 0);
  state.z = world.cannons.z[cannonIndex] ?? 0;
  state.yaw = world.cannons.yaw[cannonIndex] ?? 0;
  state.pitch = 0;
  // The carriage bearing and the traversed gun bearing are different once a
  // deployed bombard is aimed. Replicate both so remote shells and the barrel
  // orientation use the same authoritative direction as the server.
  state.cannonGunYaw = world.cannons.gunYaw[cannonIndex] ?? state.yaw;
  state.cannonGunPitch = world.cannons.gunPitch[cannonIndex] ?? 0.3;
  state.team = world.cannons.team[cannonIndex] as Team;
  state.health = 0;
  state.flags = 0;
  state.ammo = 0;
  state.reloadTicks = 0;
  state.respawnTicks = 0;
  state.kills = 0;
  state.deaths = 0;
  state.assists = 0;
  state.captureSeconds = 0;
  state.shipKind = EntityKind.SiegeCannon;
  // HP is encoded ÷10 in one byte on the wire (protocol v12).
  state.shipHullHp = world.cannons.hp[cannonIndex] ?? 0;
  state.shipState = cannonOccupancyState(world.cannons, cannonIndex, world.tick);
  return state;
}

export function writeHorseEntityStateAt(world: WorldState, horseIndex: number, state: EntityState): EntityState {
  state.entityId = horseEntityId(horseIndex);
  state.x = world.horses.x[horseIndex] ?? 0;
  state.y = heightAt(state.x, world.horses.z[horseIndex] ?? 0);
  state.z = world.horses.z[horseIndex] ?? 0;
  state.yaw = world.horses.yaw[horseIndex] ?? 0;
  state.pitch = 0;
  state.team = world.horses.team[horseIndex] as Team;
  state.health = 0;
  state.flags = 0;
  state.ammo = 0;
  state.reloadTicks = 0;
  state.respawnTicks = 0;
  state.kills = 0;
  state.deaths = 0;
  state.assists = 0;
  state.captureSeconds = 0;
  state.playerClass = PlayerClass.None;
  state.mounted = false;
  state.horseHp = 0;
  state.shipKind = EntityKind.Horse;
  state.shipHullHp = 0;
  state.shipState = 0;
  return state;
}

export function writeEarthworkEntityStateAt(world: WorldState, index: number, state: EntityState): EntityState {
  state.entityId = earthworkEntityId(index);
  const kind = world.earthworkKind[index] as EarthworkKind;
  state.x = world.earthworkX[index] ?? 0;
  state.y = (world.earthworkY[index] ?? 0) + (kind === EarthworkKind.Trench ? EARTHWORK_TRENCH_HEIGHT : EARTHWORK_MOUND_HEIGHT) / 2;
  state.z = world.earthworkZ[index] ?? 0;
  state.yaw = 0;
  state.pitch = 0;
  state.team = Team.None;
  state.health = 0;
  state.flags = 0;
  state.ammo = 0;
  state.reloadTicks = 0;
  state.respawnTicks = 0;
  state.kills = 0;
  state.deaths = 0;
  state.assists = 0;
  state.captureSeconds = 0;
  state.playerClass = PlayerClass.None;
  state.mounted = false;
  state.horseHp = 0;
  state.shipKind = EntityKind.Earthwork;
  state.shipHullHp = 0;
  state.shipState = 0;
  state.torch = 0;
  state.earthworkKind = world.earthworkKind[index] ?? 0;
  return state;
}

export function snapshotMeta(world: WorldState): SnapshotMeta {
  return { captureOwner: world.captureOwner, captureProgress: Math.round(world.captureProgress), ottomanTickets: world.ottomanTickets, byzantineTickets: world.byzantineTickets, roundPhase: world.roundPhase, phaseRemainingTicks: Math.max(0, world.phaseUntilTick - world.tick), events: world.events.map(({ tick: _tick, ...event }) => event), points: CAPTURE_POINTS.map((_, index) => ({ owner: world.pointOwner[index] as Team, progress: Math.round(world.pointProgress[index] ?? 0) })) };
}

export function packedWallStates(world: WorldState): number {
  let packed = 0;
  for (let index = 0; index < WALL_SEGMENT_COUNT; index += 1) packed |= (world.wallState[index] ?? 0) << (index * 2);
  return packed >>> 0;
}

export function drainWallEvents(world: WorldState): readonly { segmentId: number; state: WallState; attackerEntityId: number; hpFrac: number }[] {
  const events: { segmentId: number; state: WallState; attackerEntityId: number; hpFrac: number }[] = [];
  for (let index = 0; index < world.wallEventCount; index += 1) events.push({ segmentId: world.wallEventSegments[index] ?? 0, state: world.wallEventStates[index] as WallState, attackerEntityId: world.wallEventAttackers[index] ?? 0, hpFrac: world.wallEventHpFrac[index] ?? 0 });
  world.wallEventCount = 0;
  return events;
}
