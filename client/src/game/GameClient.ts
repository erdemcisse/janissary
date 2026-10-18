import * as THREE from "three";
import {
  AOI_MAX_ENTITIES,
  ARQUEBUS_MAX_RANGE,
  ARTILLERY_PROJECTILE_GRAVITY,
  ARTILLERY_PROJECTILE_SPEED,
  CANNON_ENTITY_BASE,
  CAVALRY_MAX_SPEED,
  CAVALRY_MAX_STEP_UP,
  EntityKind,
  EARTHWORK_MAX,
  EARTHWORK_MAX_RANGE,
  EARTHWORK_MOUND_DEPTH,
  EARTHWORK_MOUND_HEIGHT,
  EARTHWORK_MOUND_WIDTH,
  EARTHWORK_TRENCH_DEPTH,
  EARTHWORK_TRENCH_HEIGHT,
  EARTHWORK_TRENCH_WIDTH,
  EarthworkKind,
  FIXED_DT_MS,
  FIXED_DT_SECONDS,
  GROUND_CENTER_Y,
  heightAt,
  impactHeightAt,
  INTERPOLATION_DELAY_MS,
  MAX_STEP_UP,
  MAX_DAILY_CONTRACTS,
  MAX_SIEGE_CANNONS,
  MAX_VEHICLES,
  MAX_HORSES,
  MessageType,
  ChatChannel,
  CombatEventType,
  SNAPSHOT_HISTORY_SIZE,
  CAPTURE_MAX_PROGRESS,
  PlayerFlag,  RoundPhase,
  SHIP_STATE_GUN1,
  SHIP_STATE_GUN2,
  SHIP_STATE_HELM,
  SHIP_STATE_PASSENGER_SHIFT,
  SHIP_STATE_SUNK,
  SIEGE_BLOCKOUT,
  SIEGE_CANNON_BOARD_RADIUS,
  SIEGE_CANNON_HP,
  PERSONAL_CANNON_HP,
  SIEGE_CANNON_MAX_PUSHERS,
  SUPPORT_AURA_RADIUS,
  SUPPORT_SPEED_MULTIPLIER,
  Team,
  PlayerClass,
  WallState,
  WALL_REPAIR_RANGE,
  RIVER_HALF_WIDTH,
  WATER_SHORE_Z,
  WATER_WADE_SPEED_MULTIPLIER,
  WATER_WADE_DEPTH,
  CAPTURE_POINTS,
  WALL_SEGMENTS,
  SIEGE_LADDERS,
  ARTILLERY_EMPLACEMENTS,
  BOMBARD_PROJECTILE_SPEED,
  PERSONAL_CANNON_PROJECTILE_SPEED,
  PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER,
  SIEGE_CANNON_MIN_PITCH,
  SIEGE_CANNON_MAX_PITCH,
  CLASS_TUNING,
  DEFAULT_WEAPON_SLOT,
  WEAPON_DEFS,
  WEAPON_SWITCH_SECONDS,
  InputButton,
  KillCause,
  SquadOp,
  WeaponType,
  XpSource,
  CAPSULE_HEIGHT,
  ShipEventType,
  MedalCategory,
  MedalTier,
  MEDAL_CATEGORY_COUNT,
  aimFovRatio,
  aimedSpreadFactor,
  MOVING_SPREAD_RADIANS,
  STANDING_SPREAD_RADIANS,
  STATIONARY_ACCURACY_SECONDS,
  createWeaponSlotState,
  stepWeaponSlots,
  weaponDefAtSlot,
  slopeSpeedFactorAt,
  decodeShipEvent,
  contractDefinition,
  decodeAccount,
  decodeBlockedIds,
  decodeChatMessage,
  decodeChatNotice,
  decodeClanState,
  decodeContractEvent,
  decodeEntityJoin,
  decodeEntityLeave,
  decodeMedalState,
  decodeMedalUnlock,
  decodePing,
  decodeSnapshot,
  decodeSquadState,
  decodeWarSummary,
  decodeWelcome,
  decodeClassStatus,
  decodeWallEvent,
  decodeXpEvent,
  decodeHitEventDamage,
  hitEventIsHeadshot,
  encodeInput,
  encodeChatReport,
  encodeChatSend,
  encodeJoin,
  encodeClassSelect,
  encodeSpawnSelect,
  encodeDeploy,
  encodeSquadCommand,
  encodePing,
  lerp,
  lerpAngle,
  distance3,
  inDeepWater,
  inRiver,
  inShallowWater,
  isAllowed,
  onDeck,
  riverCenterlineDistance,
  medalDefinition,
  medalIdentity,
  rankTitle,
  rankTier,
  readMessageType,
  raycastBoxes,
  raycastTerrain,
  simulateMovement,
  simulateCavalryMovement,
  sweepCapsuleAgainstBoxes,
  terrainGradientAt,
  xpForNextRank,
  type AccountMessage,
  type ChatMessage,
  type ClanStateMessage,
  type ContractState,
  type EntityState,
  type MedalCounterState,
  type MovementState,
  type MovementInput,
  type Snapshot,
  type WeaponSlotState,
} from "@janissary/shared";
import { InputController } from "./InputController";
import { httpServerUrl } from "../net/serverUrl";
import {
  isAuthoritativeDiscontinuity,
  reconcilePrediction,
  replayPendingBySeq,
  withinQuantizationNoise,
  type PendingInput,
  type PredictionSimulator,
} from "../net/reconciliation";
import { freezeJumpEdgeForExtrapolation, interpolationAlpha, PredictionCorrectionSmoother } from "../net/renderSmoothing";
import { applyPredictionCollision } from "../net/predictionCollision";
import { PingSmoother } from "../net/pingSmoother";
import { AudioEngine, FOOTSTEP_RUN_MIN_SPEED, footstepIntervalSeconds, footstepSurfaceAt, shotSoundForClass, type FootstepSurface } from "./audio/audioEngine";
import { BALL_POOL_SIZE, BALL_TRAIL_PUFF_SECONDS, BOLT_GLB_METERS, DAMAGE_FLOATER_POOL, DAMAGE_FLOATER_RISE_METERS, DAMAGE_FLOATER_SECONDS, EXPLOSION_FLASH_PEAK, EXPLOSION_FLASH_SECONDS, MUZZLE_LINGER_COUNT, PROJECTILE_REMOTE_CAP, PROJECTILE_TRACER_RADIUS_METERS, PROJECTILE_VISIBILITY_RADIUS_METERS, SCORCH_PEAK_ALPHA, SCORCH_POOL, SCORCH_RADIUS_METERS, SHELL_TAIL_LENGTH_METERS, SHELL_TAIL_WIDTH_METERS, SHELL_TRAIL_PUFF_SECONDS, TRACER_COLOR, TRACER_LENGTH_METERS, TRACER_OPACITY, TRACER_WIDTH_METERS, ballImpactSurface, explosionFlashScale, meleeCooldownFraction, reloadCueFor, reloadProgressFraction, scorchAlpha } from "./combatFeel";
import { CombatEventLedger } from "./combatEventLedger";
import { registerUiAudio, unregisterUiAudio } from "./audio/uiSfx";
import { configureGroundDetailQuality, gameTextures, groundDetailMaterial, groundDetailTextures } from "./textures";
import { CameraFeel } from "./cameraFeel";
import { adsFovDegrees, adsSensitivityScale, stepAdsWeight } from "./aimDownSights";
import {
  CANNON_STATE_DEPLOYED,
  CANNON_STATE_DEPLOYING,
  CANNON_STATE_DESTROYED,
  CANNON_STATE_GUNNER,
  CANNON_STATE_PERSONAL,
  CANNON_STATE_PUSHER_SHIFT,
  wallDamageTint,
  wallRegionName,
  type CannonStateInfo,
} from "./siege";
import { Viewmodel } from "./characters/viewmodel";
import {
  horseGeometry,
  MOUNTED_RIDER_CENTER_OFFSET,
  seatedSoldierGeometry,
  soldierGeometry,
  variantForSkinId,
} from "./characters/soldierModels";
import { NameplateLayout, nameplateOpacity } from "./nameplateLayout";
import { Atmosphere } from "./world/atmosphere";
import { CapturePointVisuals } from "./world/banners";
import { ParticleSystem } from "./world/particles";
import { buildTerrain, upgradeTerrainVisuals, type TerrainVisuals } from "./world/terrain";
import { buildDressing, type DressingHandle } from "./world/dressing";
import { buildBiomeGroundGeometry, buildRiverBankDecals, buildRoadDecals } from "./world/biomes";
import { buildScatter, type ScatterHandle } from "./world/scatter";
import { buildAssetProps, type AssetPropsHandle } from "./world/assetProps";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { loadModel, groundFit, prepareInstancedMaterial } from "./models/loader";
import { ARTILLERY_MODELS, GALLEY_MODEL, PROJECTILE_MODELS, WORLD_ASSET_MODELS } from "./models/manifest";
import { createHarborWater, WATER_Y, type HarborWater } from "./world/water";
import { CharacterRenderer, MOUNTED_RIG_Y_OFFSET, type RigDebugRow } from "./world/characters";
import { HorseRenderer, type HorseRigDebugRow } from "./world/horses";

export type KillFeedKind = "arquebus" | "crossbow" | "melee" | "sword" | "dagger" | "artillery" | "galleygun" | "drowning" | "unknown";

/**
 * Maps the authoritative KillCause byte (Death event value) to the feed kind.
 * An unknown future byte falls back to "unknown" so the feed never renders
 * blank, and a sourceless drowning maps to its own kind.
 */
export function killCauseKind(cause: KillCause): KillFeedKind {
  switch (cause) {
    case KillCause.Arquebus: return "arquebus";
    case KillCause.Crossbow: return "crossbow";
    case KillCause.Melee: return "melee";
    case KillCause.Sword: return "sword";
    case KillCause.Dagger: return "dagger";
    case KillCause.Artillery: return "artillery";
    case KillCause.GalleyGun: return "galleygun";
    case KillCause.Drowning: return "drowning";
    default: return "unknown";
  }
}

export interface KillFeedEntry {
  id: number;
  text: string;
  kind: KillFeedKind;
  // Structured participants for real kills (absent on world/support milestone
  // lines, which keep rendering `text` as a single phrase).
  killerName?: string;
  killerTeam?: Team;
  killerClassLabel?: string;
  victimName?: string;
  victimTeam?: Team;
  victimClassLabel?: string;
  headshot?: boolean;
  /** The local player killed or was killed; the row gets a clear red edge. */
  involvesLocal?: boolean;
  /** A blocked player is involved — the row renders de-emphasised, not hidden (Phase 8c-7). */
  deemphasized?: boolean;
}

export interface MinimapBlip {
  x: number;
  z: number;
  team: Team;
  ship: boolean;
  artillery?: boolean;
  entityId: number;
}

export interface DeathRecap {
  byName: string;
  byClassLabel: string;
  kind: KillFeedKind;
  direction: string;
}

export interface MedalDisplay {
  kind: number;
  count: number;
  title: string;
}

export interface MedalChestEntry {
  category: number;
  value: number;
  tier: number;
  nextThreshold: number;
  intoTier: number;
}

export interface ClanDisplay {
  clanId: number;
  name: string;
  tag: string;
  founderPlayerId: number;
  memberCount: number;
  role: number;
}

export interface ScoreboardRow {
  entityId: number;
  name: string;
  tag: string | undefined;
  bot: boolean;
  team: Team;
  kills: number;
  deaths: number;
  assists: number;
  captureSeconds: number;
  rank: number;
  prestige: number;
  playerClass: PlayerClass;
}

export interface CareerDisplay {
  xp: number;
  rank: number;
  prestige: number;
  xpNext: number;
  title: string;
  tier: number;
  headshots: number;
}

export interface ContractDisplay extends ContractState {
  description: string;
}

export interface MedalDisplay {
  kind: number;
  count: number;
  title: string;
}

export interface LifetimeDisplay {
  wars: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  medals: number;
}

export interface FxEvent {
  id: number;
  kind: "floaty" | "fanfare" | "toast" | "ceremony" | "ownkill";
  text: string;
  sub: string;
  at: number;
  // ownkill events get their XP total (and headshot escalation) correlated
  // from the XpEvent stream shortly after the kill itself.
  xp?: number;
  headshot?: boolean;
  // ceremony events carry the unlocked medal so the UI can render the real
  // medallion art instead of a text banner.
  medal?: { category: number; tier: number };
}

export interface WarSummaryDisplay {
  winner: Team;
  warTallyOttoman: number;
  warTallyByzantine: number;
  medals: MedalDisplay[];
  warXpEarned: number;
  welcomeBackBonus: number;
  captures: number;
  defenseKills: number;
  shots: number;
  hits: number;
  captureSeconds: number;
}

export interface DebugStats {
  pingMs: number;
  tick: number;
  corrections: number;
  bytesInPerSecond: number;
  bytesOutPerSecond: number;
  entityCount: number;
  visibleEntityCount: number;
  drawCalls: number;
  interestSetSize: number;
  snapshotAgeMs: number;
  fps: number;
  frameP95Ms: number;
  reconciliationErrorP95Cm: number;
  reconciliationErrorMaxCm: number;
  /** Squad member entity ids (empty set = no squad) — Phase 8c-7 highlight. */
  squadEntityIds: ReadonlySet<number>;
  health: number;
  ammo: number;
  reloadTicks: number;
  respawnTicks: number;
  team: Team;
  captureOwner: Team;
  captureProgress: number;
  ottomanTickets: number;
  byzantineTickets: number;
  roundPhase: RoundPhase;
  phaseRemainingTicks: number;
  kills: number;
  deaths: number;
  assists: number;
  playerId: number;
  entityId: number;
  scoreboard: readonly ScoreboardRow[];
  killFeed: readonly KillFeedEntry[];
  hitMarker: boolean;
  headshotMarker: boolean;
  killMarker: boolean;
  /** Authoritative spread rule mirrored for the reticle's heraldic brackets. */
  reticleSpreadRadians: number;
  /** Reload progress 0→1 for the reticle radial (Phase 8e-1); 1 when not reloading. */
  reloadFraction: number;
  /** Pan is loaded and the player is alive — the reticle's persistent state. */
  loaded: boolean;
  /** Brief reload-complete flash on the reticle (Phase 8e-1). */
  readyFlash: boolean;
  /** Active 1-based weapon slot (Phase 8e-3 prediction). */
  weaponSlot: number;
  /** Slot being drawn while `switching`, else 0. */
  switchTarget: number;
  /** Draw/holster in progress — Fire/Melee/Reload are inert. */
  switching: boolean;
  /** Melee swing readiness 0→1 on the reticle ring (1 = ready). */
  meleeCooldownFraction: number;
  damageDirection: number;
  careers: readonly CareerDisplay[];
  contracts: readonly ContractDisplay[];
  medals: readonly MedalDisplay[];
  medalState: { wars: number; counters: readonly MedalCounterState[] };
  clan: ClanDisplay | undefined;
  nameplateMedals: boolean;
  lifetime: LifetimeDisplay;
  warTally: { ottoman: number; byzantine: number };
  fxEvents: readonly FxEvent[];
  warSummary: WarSummaryDisplay | undefined;
  playerClass: PlayerClass;
  /** Class queued for the next spawn (8e-13). Equals playerClass when nothing is queued. */
  queuedClass: PlayerClass;
  mounted: boolean;
  torchOn: boolean;
  horseHp: number;
  points: readonly { owner: Team; progress: number }[];
  pointOccupancy: readonly number[];
  walls: readonly WallState[];
  /** Per-segment HP ÷ WALL_SEGMENT_HEALTH in sixteenths (0–16) — protocol v12. */
  wallHp: readonly number[];
  /** Live siege-cannon state for the siege objective banner and interact hints. */
  cannons: readonly CannonStateInfo[];
  /** Freshest combat-activity cluster, snapped to the nearest objective glyph (minimap pulse). */
  hotspot: { x: number; z: number } | null;
  /** Contextual interact prompt ("F — PUSH THE BOMBARD" …), empty when nothing applies. */
  interactHint: string;
  blips: readonly MinimapBlip[];
  selfX: number;
  selfZ: number;
  selfYaw: number;
  lastDeath: DeathRecap | undefined;
  classStatus: string;
  buffed: boolean;
  /** Phase 8e-25: replicated PlayerFlag word of the local entity, so the
   * prediction reads server-authoritative states (e.g. CarryingFieldGun). */
  flags: number;
  claimed: boolean;
  chatMessages: readonly ChatMessage[];
  chatNotice: string;
}

interface TimedState extends EntityState {
  receivedAt: number;
}

interface RemoteEntity {
  entityId: number;
  team: Team;
  active: boolean;
  alive: boolean;
  previous: TimedState;
  current: TimedState;
  hasPrevious: boolean;
  renderX: number;
  renderY: number;
  renderZ: number;
  renderYaw: number;
  torch: number;
  nextFarUpdateAt: number;
  lastFootstepAt: number;
}

interface RankInfo {
  rank: number;
  prestige: number;
}

interface RemoteVehicle {
  entityId: number;
  team: Team;
  active: boolean;
  previous: TimedState;
  current: TimedState;
  hasPrevious: boolean;
  renderX: number;
  renderY: number;
  renderZ: number;
  renderYaw: number;
  renderGun1Yaw: number;
  renderGun2Yaw: number;
  hullHp: number;
  shipState: number;
  listingUntil: number;
  lastWakeAt: number;
}

function createPooledVehicle(): RemoteVehicle {
  return {
    entityId: 0,
    team: Team.None,
    active: false,
    previous: emptyTimedState(),
    current: emptyTimedState(),
    hasPrevious: false,
    renderX: 0,
    renderY: 0,
    renderZ: 0,
    renderYaw: 0,
    renderGun1Yaw: Math.PI / 2,
    renderGun2Yaw: -Math.PI / 2,
    hullHp: 1000,
    shipState: 0,
    listingUntil: 0,
    lastWakeAt: 0,
  };
}

// Siege cannons (siege loop §1.7): a second vehicle type — replicated like
// galleys (unconditional interest, shipKind/shipState snapshot fields),
// rendered as heavy and field-gun instanced carriage batches. `shipState` is the cannon
// occupancy byte (CANNON_STATE_*), `shipHullHp` the 400-point cannon HP.
interface RemoteCannon {
  entityId: number;
  team: Team;
  active: boolean;
  previous: TimedState;
  current: TimedState;
  hasPrevious: boolean;
  renderX: number;
  renderZ: number;
  renderYaw: number;
  renderGunYaw: number;
  renderGunPitch: number;
  hullHp: number;
  shipState: number;
  moving: boolean;
  lastSmokeAt: number;
}

/** Phase 8e-25: prerendered nameplate sprite — the baked label (name, rank
 * markers, prestige stars) sized `width`×`height` CSS pixels; `nameBaseline`
 * is the name row's distance from the sprite top, so the draw call pins the
 * baseline to the projected screenY exactly like the old fillText layout. */
interface NameplateSprite {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly nameBaseline: number;
}

interface RemoteHorse {
  entityId: number;
  team: Team;
  active: boolean;
  previous: TimedState;
  current: TimedState;
  hasPrevious: boolean;
  renderX: number;
  renderZ: number;
}

function createPooledHorse(): RemoteHorse {
  return {
    entityId: 0,
    team: Team.None,
    active: false,
    previous: emptyTimedState(),
    current: emptyTimedState(),
    hasPrevious: false,
    renderX: 0,
    renderZ: 0,
  };
}

function createPooledCannon(): RemoteCannon {
  return {
    entityId: 0,
    team: Team.None,
    active: false,
    previous: emptyTimedState(),
    current: emptyTimedState(),
    hasPrevious: false,
    renderX: 0,
    renderZ: 0,
    renderYaw: 0,
    renderGunYaw: 0,
    renderGunPitch: 0.3,
    hullHp: SIEGE_CANNON_HP,
    shipState: 0,
    moving: false,
    lastSmokeAt: 0,
  };
}

function emptyTimedState(): TimedState {
  return { entityId: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, receivedAt: 0 };
}

function createPooledRemote(): RemoteEntity {
  return {
    entityId: 0,
    team: Team.None,
    active: false,
    alive: false,
    previous: emptyTimedState(),
    current: emptyTimedState(),
    hasPrevious: false,
    renderX: 0,
    renderY: 0,
    renderZ: 0,
    renderYaw: 0,
    torch: 0,
    nextFarUpdateAt: 0,
    lastFootstepAt: 0,
  };
}

function emptyCareer(): CareerDisplay {
  return { xp: 0, rank: 1, prestige: 0, xpNext: xpForNextRank(1), title: rankTitle(Team.Ottoman, 1), tier: 0, headshots: 0 };
}

function emptyContracts(): ContractDisplay[] {
  return Array.from({ length: MAX_DAILY_CONTRACTS }, () => ({ kind: 0, progress: 0, target: 1, reward: 0, completed: false, description: "" }));
}

function emptyMedals(): MedalDisplay[] {
  return Array.from({ length: 4 }, (_, index) => ({ kind: index + 1, count: 0, title: medalDefinition(index + 1)?.title ?? "" }));
}

const emptyStats: DebugStats = {
  pingMs: 0,
  tick: 0,
  corrections: 0,
  bytesInPerSecond: 0,
  bytesOutPerSecond: 0,
  entityCount: 0,
  visibleEntityCount: 0,
  drawCalls: 0,
  interestSetSize: 0,
  snapshotAgeMs: 0,
  fps: 0,
  frameP95Ms: 0,
  reconciliationErrorP95Cm: 0,
  reconciliationErrorMaxCm: 0,
  squadEntityIds: new Set<number>(),
  health: 100,
  ammo: 1,
  reloadTicks: 0,
  respawnTicks: 0,
  team: Team.None,
  captureOwner: Team.None,
  captureProgress: 0,
  ottomanTickets: 300,
  byzantineTickets: 300,
  roundPhase: RoundPhase.Active,
  phaseRemainingTicks: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  playerId: 0,
  entityId: 0,
  scoreboard: [],
  killFeed: [],
  hitMarker: false,
  headshotMarker: false,
  killMarker: false,
  reticleSpreadRadians: MOVING_SPREAD_RADIANS,
  reloadFraction: 1,
  loaded: true,
  readyFlash: false,
  weaponSlot: DEFAULT_WEAPON_SLOT,
  switchTarget: 0,
  switching: false,
  meleeCooldownFraction: 1,
  damageDirection: 0,
  careers: [emptyCareer(), emptyCareer()],
  contracts: emptyContracts(),
  medals: emptyMedals(),
  medalState: { wars: 0, counters: Array.from({ length: MEDAL_CATEGORY_COUNT }, (_, index) => ({ category: index + 1, value: 0, tier: 0 })) },
  clan: undefined,
  nameplateMedals: false,
  lifetime: { wars: 0, wins: 0, kills: 0, deaths: 0, captures: 0, medals: 0 },
  warTally: { ottoman: 0, byzantine: 0 },
  fxEvents: [],
  warSummary: undefined,
  playerClass: PlayerClass.None,
  queuedClass: PlayerClass.None,
  mounted: false,
  horseHp: 0,
  torchOn: false,
  points: [],
  pointOccupancy: [],
  walls: Array.from({ length: WALL_SEGMENTS.length }, () => WallState.Intact),
  wallHp: Array.from({ length: WALL_SEGMENTS.length }, () => 16),
  cannons: [],
  hotspot: null,
  interactHint: "",
  blips: [],
  selfX: 0,
  selfZ: 0,
  selfYaw: 0,
  lastDeath: undefined,
  classStatus: "",
  buffed: false,
  flags: 0,
  claimed: false,
  chatMessages: [],
  chatNotice: "",
};

// Team identity palettes — the single source of truth for Ottoman amber-red /
// Byzantine purple-gold across the 3D world (instance tints, nameplate
// chevrons, galley labels). The HUD reads the same hues through CSS variables
// in styles.css; the colorblind-safe alternate (Okabe–Ito vermillion vs sky
// blue, distinguishable under deuteranopia/protanopia) swaps both renderers
// together via setColorblindPalette so no surface ever learns a second
// mapping on its own.
interface TeamPalette {
  readonly accents: Readonly<Record<number, readonly [string, string, string]>>;
  readonly nameLabel: Readonly<Record<number, string>>;
  readonly hullTint: Readonly<Record<number, number>>;
  /** Squad identity — the one token every squad surface reads (Phase 8c-7). */
  readonly squadName: string;
}

const TEAM_PALETTES: Readonly<Record<"default" | "colorblind", TeamPalette>> = {
  default: {
    accents: {
      [Team.Ottoman]: ["#b43a32", "#e0695c", "#f0b35a"],
      [Team.Byzantine]: ["#5e3a99", "#9a7bd8", "#f0b35a"],
    },
    nameLabel: { [Team.Ottoman]: "#ef867a", [Team.Byzantine]: "#b39ae0" },
    hullTint: { [Team.Ottoman]: 0x8a2f28, [Team.Byzantine]: 0x4a3480 },
    squadName: "#63e07a",
  },
  colorblind: {
    accents: {
      [Team.Ottoman]: ["#a34a00", "#d55e00", "#e69f00"],
      [Team.Byzantine]: ["#1f6a96", "#56b4e9", "#f0b35a"],
    },
    nameLabel: { [Team.Ottoman]: "#e69f00", [Team.Byzantine]: "#56b4e9" },
    hullTint: { [Team.Ottoman]: 0xa34a00, [Team.Byzantine]: 0x1f6a96 },
    // Cyan-teal: distinguishable from the Okabe–Ito vermillion/sky-blue
    // pair AND from the green minimap territory fills (no team is green).
    squadName: "#4adede",
  },
};

const CLASS_LABELS: Readonly<Record<number, string>> = {
  [PlayerClass.Janissary]: "Janissary", [PlayerClass.Sipahi]: "Sipahi", [PlayerClass.Topcu]: "Topçu",
  [PlayerClass.Mehter]: "Mehter", [PlayerClass.Guardsman]: "Guardsman", [PlayerClass.Knight]: "Knight",
  [PlayerClass.WallGunner]: "Wall Gunner", [PlayerClass.Priest]: "Priest",
};

const SOLDIER_CLASSES: readonly PlayerClass[] = [
  PlayerClass.Janissary, PlayerClass.Sipahi, PlayerClass.Topcu, PlayerClass.Mehter,
  PlayerClass.Guardsman, PlayerClass.Knight, PlayerClass.WallGunner, PlayerClass.Priest,
];

const RENDER_INSTANCE_CAPACITY = AOI_MAX_ENTITIES + 1;
const FRAME_SAMPLE_CAPACITY = 240;
const RECONCILIATION_SAMPLE_CAPACITY = 128;
const TORCH_LIGHT_POOL_SIZE = 6;
const TORCH_LIGHT_COLOR = 0xff9a3c;
const CAMERA_BLEND_SECONDS = 0.4;
// Projectile visual pools (design doc §13). The server has no small-arms
// projectile entity — the arquebus is instant hitscan and the crossbow a flat
// 0.22 s delayed hitscan (CROSSBOW_TRAVEL_SECONDS) — so ball speeds below are
// cosmetic picks that read well at engagement ranges, capped at each weapon's
// server max range. Shells DO mirror the server simulation:
// ARTILLERY_PROJECTILE_SPEED/GRAVITY, muzzle at (gun.x, 1.5, gun.z), 5 s max
// flight — only the pitch is approximated (the server's gun pitch is the
// gunner's clamped aim, not on the wire; 0.32 matches the old fixed tracer).
// BALL_POOL_SIZE lives in combatFeel.ts (Phase 8e-1) with its sizing math.
const BALL_SPEED_ARQUEBUS = 160;
/** Phase 8e-25: one breach is announced twice (shell impact + WallEvent);
 * the second bombard-impact boom within this window is dropped per segment. */
const BREACH_BOOM_DEDUP_MS = 500;
/** Phase 8e-25: fixed local x-offsets of the two galley gun sockets. */
const GALLEY_GUN_LOCAL_X: readonly number[] = [-10.3, 10.3];
const SHELL_POOL_SIZE = 4;
const SHELL_PITCH = 0.32;
const SHELL_MAX_SECONDS = 5;
// A landed/expired shell keeps its final position this long so the server's
// ArtilleryImpact event (type 8) can place its burst where the shell actually
// went instead of the old faked "60 m ahead of the gunner" point.
const SHELL_IMPACT_MEMORY_MS = 2_000;
// Phase 8e-1 Task 1: own-shot muzzle light life and per-tier peak intensity
// (low tier runs the viewmodel sprite only — zero added per-fragment cost).
const MUZZLE_LIGHT_SECONDS = 0.08;
const MUZZLE_LIGHT_PEAK: Readonly<Record<"low" | "medium" | "high", number>> = { low: 0, medium: 18, high: 30 };
// 8e-11: module scratch for terrain-gradient reads (scorch tilt etc.) — the
// out-param pattern keeps the frame path allocation-free.
const TERRAIN_GRADIENT_SCRATCH = { x: 0, z: 0 };
const SCORCH_UP = new THREE.Vector3(0, 1, 0);

interface ScratchStaticBox {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: "earth";
}

function percentileFromRing(source: Float32Array, count: number, scratch: Float32Array, percentile: number): number {
  if (count <= 0) return 0;
  const boundedCount = Math.min(count, source.length, scratch.length);
  for (let index = 0; index < boundedCount; index += 1) scratch[index] = source[index] ?? 0;
  // Small fixed samples, sorted once per diagnostics second without allocating.
  for (let index = 1; index < boundedCount; index += 1) {
    const value = scratch[index] ?? 0;
    let insertion = index - 1;
    while (insertion >= 0 && (scratch[insertion] ?? 0) > value) {
      scratch[insertion + 1] = scratch[insertion] ?? 0;
      insertion -= 1;
    }
    scratch[insertion + 1] = value;
  }
  const selected = Math.min(boundedCount - 1, Math.ceil(boundedCount * percentile) - 1);
  return scratch[selected] ?? 0;
}

// ---------------------------------------------------------------------------
// Earthwork visuals (Phase 8c-5) — procedural geometry, baked once, origin at
// the entity position (= ground center), so instance matrices are translate +
// yaw only. Vertex colors carry the earth palette; both kinds are merged,
// non-indexed and flat-shaded like the soldier models.
// ---------------------------------------------------------------------------

function earthworkRand(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loose irregular half-dome: a hemisphere scaled to (rx, ry, rz) with a
 * seeded per-vertex jitter so piled earth never reads as a perfect ball. */
function earthDome(rx: number, ry: number, rz: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  geometry.scale(rx, ry, rz);
  const rand = earthworkRand(seed);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    if (y < 0.02) continue; // keep the ground ring flat so the pile sits flush
    const jitter = 0.9 + rand() * 0.2;
    positions.setXYZ(
      index,
      positions.getX(index) * jitter,
      Math.max(0, y * (0.92 + rand() * 0.16)),
      positions.getZ(index) * jitter,
    );
  }
  return geometry;
}

/**
 * Phase 8e-9 Task 3: radial scorch texture for the ground-decal ring — a
 * char-dark centre with an irregular-looking soft edge, the same
 * desaturated near-black the 8e-5 biome scorch bakes. One canvas, created
 * once at scene setup; the per-decal fade lives in material opacity.
 */
function makeScorchTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context !== null) {
    const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(14, 11, 8, 0.95)");
    gradient.addColorStop(0.55, "rgba(18, 14, 10, 0.55)");
    gradient.addColorStop(1, "rgba(18, 14, 10, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Fills the color attribute per vertex via `shade(x, y, z)` → THREE.Color. */
function earthPaint(geometry: THREE.BufferGeometry, shade: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    shade(positions.getX(index), positions.getY(index), positions.getZ(index), color);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const EARTH_LOOSE = new THREE.Color(0x6b5233);
const EARTH_PACKED = new THREE.Color(0x453322);
const EARTH_STONE = new THREE.Color(0x7a746a);
const TRENCH_FLOOR = new THREE.Color(0x2c2115);

/**
 * Merges earthwork primitives into one non-indexed geometry.
 *
 * `mergeGeometries` requires every input to be uniformly indexed or uniformly
 * non-indexed, and three.js is not consistent about which it produces:
 * `SphereGeometry`/`PlaneGeometry` are indexed while `IcosahedronGeometry`
 * (and everything else derived from `PolyhedronGeometry`) is not. Mixing them
 * returns `null`. Normalising to non-indexed up front is free here because the
 * merged result had to be flattened for vertex colouring anyway.
 */
function mergeEarthParts(parts: readonly THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const flatParts = parts.map((part) => {
    if (part.index === null) return part;
    const flattened = part.toNonIndexed();
    part.dispose();
    return flattened;
  });
  const merged = mergeGeometries(flatParts, false);
  for (const part of flatParts) part.dispose();
  if (merged === null) throw new Error(`GameClient: incompatible ${label} primitives`);
  merged.computeVertexNormals();
  return merged;
}

/** How far the rubble box's top vertices can sag (m). */
const RUBBLE_SAG = 0.5;

/**
 * Phase 8e-5 Task 2: breach-rubble silhouette. The collider stays the plain
 * WALL_SEGMENTS box; the RENDERED box is segmented and its top vertices sag
 * by a position-hashed amount, so a breached segment reads as a broken mound
 * instead of a clean slab. Visual only — the sag only ever lowers vertices,
 * so the mesh never pokes above the collider the sim uses. `seed` varies the
 * pattern per segment without any RNG state.
 */
function rubbleGeometry(width: number, height: number, depth: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth, 10, 1, 6);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    if (y < height / 2 - 0.01) continue; // only the top rows sag
    const x = position.getX(index);
    const z = position.getZ(index);
    let h = (Math.round((x + seed) * 10) * 374761393 + Math.round((z - seed) * 10) * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    position.setY(index, y - ((h >>> 0) / 4294967296) * RUBBLE_SAG);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Mound: a squashed jittered dome (2.4 × 1.5 × 2.4) with a darker packed
 * face on local -Z and three half-buried stones. ~190 tris. */
function moundGeometry(): THREE.BufferGeometry {
  const dome = earthPaint(
    earthDome(EARTHWORK_MOUND_WIDTH / 2, EARTHWORK_MOUND_HEIGHT, EARTHWORK_MOUND_DEPTH / 2, 0x51ed),
    (_x, _y, z, out) => out.copy(z < -0.25 ? EARTH_PACKED : EARTH_LOOSE),
  );
  const rand = earthworkRand(0xc0ffee);
  const parts: THREE.BufferGeometry[] = [dome];
  for (let index = 0; index < 3; index += 1) {
    const angle = rand() * Math.PI * 2;
    const stone = earthPaint(new THREE.IcosahedronGeometry(0.09 + rand() * 0.05, 0), (_x, _y, _z, out) => out.copy(EARTH_STONE));
    stone.translate(Math.cos(angle) * 0.85, 0.04, Math.sin(angle) * 0.85);
    parts.push(stone);
  }
  return mergeEarthParts(parts, "mound");
}

/** Trench: a dark recessed floor quad at y ≈ 0.02 framed by two low berms
 * (~0.6 tall) on the long sides, dark packed faces toward the dugout.
 * ~180 tris. Footprint 2.8 × 1.2, length along local X. */
function trenchGeometry(): THREE.BufferGeometry {
  const floor = new THREE.PlaneGeometry(EARTHWORK_TRENCH_WIDTH - 0.2, EARTHWORK_TRENCH_DEPTH - 0.2);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.02, 0);
  earthPaint(floor, (_x, _y, _z, out) => out.copy(TRENCH_FLOOR));
  const bermOffset = EARTHWORK_TRENCH_DEPTH / 2 - 0.28;
  const parts: THREE.BufferGeometry[] = [floor];
  for (const side of [1, -1]) {
    // Dark face painted on local -Z before placement; the far berm is flipped
    // so both packed faces look into the dugout.
    const berm = earthPaint(
      earthDome(EARTHWORK_TRENCH_WIDTH / 2, EARTHWORK_TRENCH_HEIGHT, 0.28, side > 0 ? 0xbeef : 0xf00d),
      (_x, _y, z, out) => out.copy(z < 0 ? EARTH_PACKED : EARTH_LOOSE),
    );
    if (side < 0) berm.rotateY(Math.PI);
    berm.translate(0, 0, bermOffset * side);
    parts.push(berm);
  }
  return mergeEarthParts(parts, "trench");
}

const CARRIAGE_WOOD = new THREE.Color(0x4a3626);
const CARRIAGE_IRON = new THREE.Color(0x2e2c30);
const CARRIAGE_WHEEL = new THREE.Color(0x5a4030);

/**
 * Siege-cannon carriage (siege loop §1.7): one merged, vertex-coloured
 * placeholder — a low wood carriage box, an iron barrel cylinder pointing
 * forward (local -Z, matching the entity yaw convention), and two spoked-out
 * wheel cylinders. Team identity comes from the per-instance tint, exactly
 * like the galley hulls. ~250 tris.
 */
function cannonCarriageGeometry(): THREE.BufferGeometry {
  const carriage = earthPaint(new THREE.BoxGeometry(1.3, 0.45, 2.2), (_x, _y, _z, out) => out.copy(CARRIAGE_WOOD));
  carriage.translate(0, 0.62, 0.15);
  const barrel = earthPaint(new THREE.CylinderGeometry(0.15, 0.21, 2.5, 10), (_x, _y, _z, out) => out.copy(CARRIAGE_IRON));
  barrel.rotateX(Math.PI / 2 - 0.1); // slight elevation, muzzle toward local -Z
  barrel.translate(0, 1.02, -0.35);
  const parts: THREE.BufferGeometry[] = [carriage, barrel];
  for (const side of [1, -1]) {
    const wheel = earthPaint(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 12), (_x, _y, _z, out) => out.copy(CARRIAGE_WHEEL));
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(side * 0.73, 0.52, 0.45);
    parts.push(wheel);
  }
  return mergeEarthParts(parts, "siege cannon");
}

const GALLEY_GUN_WOOD = new THREE.Color(0x4a3626);
const GALLEY_GUN_IRON = new THREE.Color(0x252329);

/** Small side-mounted galley piece: deliberately cheap, but visibly a cannon. */
function galleyGunGeometry(): THREE.BufferGeometry {
  const mount = earthPaint(new THREE.BoxGeometry(0.65, 0.18, 0.55), (_x, _y, _z, out) => out.copy(GALLEY_GUN_WOOD));
  mount.translate(0, 0.55, 0);
  const barrel = earthPaint(new THREE.CylinderGeometry(0.1, 0.14, 1.35, 8), (_x, _y, _z, out) => out.copy(GALLEY_GUN_IRON));
  barrel.rotateX(-Math.PI / 2 + 0.1);
  barrel.translate(0, 0.72, -0.35);
  return mergeEarthParts([mount, barrel], "galley gun");
}

declare global {
  interface Window {
    /** Dev-only (Phase 8e-5): deterministic camera placement for the terrain
     * screenshot probe. Only wired in `import.meta.env.DEV` builds. */
    __gameDebug?: {
      setCamera: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
      clearCamera: () => void;
      /** Dev-only (Phase 8e-12): A/B the rigged-character renderer against the
       * legacy procedural instanced soldiers, and read the rig pool counts. */
      legacySoldiers: (on: boolean) => void;
      characterCounts: () => { rigs: number; corpses: number; far: number; farMounted: number; farWeapons: readonly [number, number, number]; ready: boolean; deaths: { calls: number; far: number; capped: number; unrigged: number; spawned: number } };
      /** Dev-only (Phase 8e-16): per-rig action/scale state dump for the
       * T-pose/giant diagnosis probe. */
      characterRigs: () => readonly RigDebugRow[];
      /** Dev-only (Phase 8e-16): world transform of an entity's rig, for
       * probe camera placement. */
      rigWorld: (entityId: number) => { x: number; y: number; z: number; yaw: number } | null;
      /** Dev-only (Phase 8e-16): pin a rig's base clip (null releases) for
       * screenshot probes. */
      forceClip: (entityId: number, clip: string | null) => boolean;
      /** Dev-only (Phase 8e-18): pin a rig's weapon slot (null releases) for
       * blade/sidearm grip screenshots — bots never press Slot1/3. */
      forceSlot: (entityId: number, slot: number | null) => boolean;
      /** Dev-only: four XYZ Euler triples for mounted thigh/shin fitting. */
      tuneMountedPose: (values: readonly number[]) => boolean;
      /** Dev-only (Phase 8e-16): longarm span diagnostics. */
      longarmDebug: (entityId: number) => {
        clip: string | null; weaponSlot: number; visible: boolean;
        right: [number, number, number]; left: [number, number, number]; weapon: [number, number, number];
      } | null;
      /** Dev-only: near animated horse pool and live clip state. */
      horseCounts: () => { ready: boolean; rigs: number; cap: number };
      horseRigs: () => readonly HorseRigDebugRow[];
      forceHorseClip: (entityId: number, clip: "idle" | "walk" | null) => boolean;
      /** Dev-only: live rendering contract for daylight/quality probes. */
      visual: () => {
        phaseName: string;
        fogDensity: number;
        hemiIntensity: number;
        sunIntensity: number;
        exposure: number;
        toneMapping: number;
        shadows: boolean;
      };
      /** Dev-only: live biome-ground shader state for daylight probes. */
      groundArt: () => {
        compiled: boolean;
        samples: { map: boolean; normal: boolean; roughness: boolean };
      };
      /** Dev-only (Phase 8e-6 Task 0): scripted-input drive + per-frame
       * prediction recorder for the movement-feel probe. */
      movement: {
        drive: (buttons: number, yaw: number, pitch?: number) => void;
        driveStop: () => void;
        traceStart: () => void;
        traceStop: () => MovementTraceSample[];
        state: () => MovementDebugState;
      };
      /** Dev-only (Phase 8e-7): own-shot/own-hit counters plus the nearest
       * living enemy's interpolated position — the ADS probe's dispersion
       * measurement and aim targeting. 8e-9 added the artillery counters and
       * the live-shell positions the projectile-feel probe aims the debug
       * camera with. 8e-10 added lastBallImpact (own-ball impacts) so the
       * combat-polish probe can frame the real impact patch; 8e-10b added y
       * and the wall flag so wall chips can be framed too. */
      combat: {
        counters: () => { shots: number; hits: number; explosions: number; shellsFired: number };
        resetCounters: () => void;
        nearestEnemy: () => { x: number; y: number; z: number; distance: number } | null;
        /** Phase 8e-12 probe hook: the alive soldier with the most neighbours
         * within 12 m — anchors screenshots on a real scrum/firing line. */
        densestCluster: () => { x: number; y: number; z: number; count: number } | null;
        adsWeight: () => number;
        shells: () => { x: number; y: number; z: number }[];
        lastBallImpact: () => { x: number; y: number; z: number; wall: boolean; ageMs: number } | null;
        lastKillPuff: () => { x: number; y: number; z: number; ageMs: number } | null;
      };
    };
  }
}

/** One rendered frame of the local prediction, sampled by the 8e-6 probe. */
interface MovementTraceSample {
  /** ms since traceStart. */
  readonly t: number;
  /** Frame delta (ms). */
  readonly dt: number;
  /** Fixed-tick predicted state after this frame's steps. */
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** Rendered display state (extrapolated, pre-smoother). */
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  /** Correction-smoother offset. */
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  /** Fixed-step accumulator remainder (s). */
  readonly acc: number;
  readonly grounded: boolean;
  /** Unacknowledged input count. */
  readonly pending: number;
  /** Reconcile error (m) if one landed this frame, else -1. */
  readonly err: number;
  /** Corrections over threshold so far. */
  readonly corr: number;
}

/** Live snapshot for the probe's steering loop. */
interface MovementDebugState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
  readonly alive: boolean;
  readonly corrections: number;
  readonly pending: number;
  readonly lastError: number;
}

export class GameClient {
  readonly #container: HTMLElement;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(72, 1, 0.05, 600);
  readonly #clock = new THREE.Clock();
  readonly #input: InputController;
  readonly #socket: WebSocket;
  readonly #onStats: (stats: DebugStats) => void;
  readonly #onDisconnected: (reason: string) => void;
  readonly #remoteEntities = new Map<number, RemoteEntity>();
  readonly #remotePool = Array.from({ length: AOI_MAX_ENTITIES }, createPooledRemote);
  // One InstancedMesh per class; geometry carries baked faction/class vertex
  // colors (shared module cache — never disposed), instanceColor stays white
  // except for the muzzle-hit flash.
  readonly #soldierMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, vertexColors: true });
  readonly #soldierInstances = new Map<PlayerClass, THREE.InstancedMesh>();
  readonly #seatedSoldierInstances = new Map<PlayerClass, THREE.InstancedMesh>();
  readonly #soldierCounts = new Uint16Array(256);
  readonly #seatedSoldierCounts = new Uint16Array(256);
  // Near entities animate as pooled skinned rigs; far foot/mounted poses and
  // slot-specific weapons use per-model InstancedMeshes. #legacySoldiers
  // (dev A/B) or a failed load keeps the procedural path.
  readonly #characters = new CharacterRenderer(this.#scene);
  readonly #animatedHorses = new HorseRenderer(this.#scene);
  #legacySoldiers = false;
  readonly #whiteColor = new THREE.Color(0xffffff);
  readonly #instanceTransform = new THREE.Object3D();
  readonly #frustum = new THREE.Frustum();
  readonly #projectionMatrix = new THREE.Matrix4();
  readonly #frustumPoint = new THREE.Vector3();
  readonly #labelPoint = new THREE.Vector3();
  readonly #flashColor = new THREE.Color(0xe8c778);
  readonly #nameCanvas = document.createElement("canvas");
  readonly #nameContext: CanvasRenderingContext2D;
  readonly #nameplateLayout = new NameplateLayout();
  readonly #snapshotHistory = new Map<number, Snapshot>();
  readonly #combatEvents = new CombatEventLedger();
  readonly #names = new Map<number, string>();
  readonly #tags = new Map<number, string>();
  readonly #bots = new Set<number>();
  readonly #ranks = new Map<number, RankInfo>();
  readonly #classes = new Map<number, PlayerClass>();
  readonly #wallMeshes = new Map<number, { wall: THREE.InstancedMesh; rubble: THREE.InstancedMesh }>();
  readonly #wallTint = new THREE.Color(0xffffff);
  readonly #vehicles = new Map<number, RemoteVehicle>();
  readonly #vehiclePool = Array.from({ length: 8 }, createPooledVehicle);
  readonly #cannons = new Map<number, RemoteCannon>();
  readonly #cannonPool = Array.from({ length: MAX_SIEGE_CANNONS }, createPooledCannon);
  readonly #horses = new Map<number, RemoteHorse>();
  readonly #horsePool = Array.from({ length: MAX_HORSES }, createPooledHorse);
  // One instanced batch for every siege cannon (fixed + personal slots) — same pattern as the
  // galley hulls: merged vertex-coloured geometry, per-instance team tint.
  // Explicitly widened to THREE.Material (like #galleyHulls) so the Phase 8e-4
  // load can swap the vertex-coloured placeholder for the glb's atlas material.
  readonly #cannonCarriages: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    cannonCarriageGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true, vertexColors: true }),
    MAX_SIEGE_CANNONS,
  );
  // Personal Topçu field guns use the lighter field-culverin asset and a
  // separate batch so the heavy Sahi bombard never gets scaled down with them.
  readonly #personalCannonCarriages: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    cannonCarriageGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true, vertexColors: true }),
    MAX_SIEGE_CANNONS,
  );
  readonly #cannonTint = new THREE.Color(0xffffff);
  // Fixed wall-gun emplacements (Phase 8e-4): three static meshes, no colliders,
  // no per-frame work — they are pure dressing that finally draws the guns
  // ARTILLERY_EMPLACEMENTS has always described.
  readonly #emplacementMeshes: THREE.Mesh[] = [];
  #emplacementMaterial: THREE.Material | undefined = undefined;
  // Breach dressing (siege loop §2.6): rubble chunks scattered once per
  // breached segment so the passage reads walkable; shared material, disposed
  // geometries on clear.
  readonly #rubbleChunks = new Map<number, THREE.Mesh[]>();
  readonly #rubbleChunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8d877c, roughness: 1, flatShading: true });
  readonly #crackDustSegments = new Set<number>();
  readonly #galleyHulls: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    new THREE.BoxGeometry(18, 2.4, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85, flatShading: true }),
    8,
  );
  /** Two readable side guns per moving galley; bearings follow the server's gun stations. */
  readonly #galleyGunInstances: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    galleyGunGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x30251e, roughness: 0.88, flatShading: true, vertexColors: true }),
    MAX_VEHICLES * 2,
  );
  readonly #wakePuffs: { mesh: THREE.Mesh; until: number }[] = [];
  readonly #horseInstances = new THREE.InstancedMesh(
    horseGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: true }),
    RENDER_INSTANCE_CAPACITY,
  );
  #horseGeometryOwned = false;
  // Earthwork batches (Phase 8c-5): one InstancedMesh per kind, refilled from
  // #earthworkStates every frame — a full 60-earthwork field stays 2 draw
  // calls. Geometry is procedural and shared per kind.
  readonly #moundInstances = new THREE.InstancedMesh(
    moundGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }),
    EARTHWORK_MAX,
  );
  readonly #trenchInstances = new THREE.InstancedMesh(
    trenchGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true }),
    EARTHWORK_MAX,
  );
  readonly #pendingPings = new Map<number, number>();
  readonly #pingSmoother = new PingSmoother();
  #localEntityId = 0;
  #localState: MovementState = {
    x: 0,
    y: GROUND_CENTER_Y,
    z: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    yaw: 0,
    pitch: 0,
    grounded: true,
    jumpHeld: false,
  };
  #lastAuthoritative?: EntityState;
  #lastAuthoritativeTick = 0;
  // Galley passengers are server-glued to a moving deck. Keep prediction out
  // of the infantry collision path while aboard and follow the replicated
  // vehicle transform instead of generating constant correction noise.
  #localAboard = false;
  #aboardVehicleEntityId = 0;
  #aboardOffsetX = 0;
  #aboardOffsetZ = 0;
  #cameraThirdPerson = false;
  #lastMountedState = false;
  readonly #earthworkStates = new Map<number, EntityState>();
  #pendingInputs: PendingInput[] = [];
  // Per-seq predicted states (Phase 8e-6): the reconcile agreement check
  // compares the authoritative snapshot against OUR OWN prediction at the
  // acknowledged seq instead of a quantized rewind base — when they agree
  // within the wire quantization cell there is nothing to correct.
  readonly #predictedBySeq = new Map<number, MovementState>();
  #inputSequence = 0;
  #lastSnapshotTick = 0;
  #accumulator = 0;
  #artificialOneWayLatencyMs = 0;
  #bytesInWindow = 0;
  #bytesOutWindow = 0;
  #lastStatsAt = performance.now();
  #lastPingAt = 0;
  #lastSnapshotReceivedAt = 0;
  #framesSinceStats = 0;
  #corrections = 0;
  readonly #correctionSmoother = new PredictionCorrectionSmoother();
  readonly #frameSamples = new Float32Array(FRAME_SAMPLE_CAPACITY);
  readonly #frameSampleScratch = new Float32Array(FRAME_SAMPLE_CAPACITY);
  #frameSampleCount = 0;
  #frameSampleCursor = 0;
  readonly #reconciliationSamples = new Float32Array(RECONCILIATION_SAMPLE_CAPACITY);
  readonly #reconciliationSampleScratch = new Float32Array(RECONCILIATION_SAMPLE_CAPACITY);
  #reconciliationSampleCount = 0;
  #reconciliationSampleCursor = 0;
  readonly #earthworkCollisionScratch: ScratchStaticBox[] = Array.from(
    { length: EARTHWORK_MAX },
    () => ({ id: "earthwork-client", x: 0, y: 0, z: 0, width: 0, height: 0, depth: 0, material: "earth" }),
  );
  readonly #predictionSimulator: PredictionSimulator = (state, input, dtSeconds) => this.#simulatePredictedMovement(state, input, dtSeconds);
  readonly #renderInput: MovementInput = { buttons: 0, yaw: 0, pitch: 0 };
  #localRenderX = 0;
  #localRenderY = GROUND_CENTER_Y;
  #localRenderZ = 0;
  #localRenderYaw = 0;
  readonly #killFeed: KillFeedEntry[] = [];
  readonly #audio = new AudioEngine(() => ({
    x: this.#camera.position.x,
    y: this.#camera.position.y,
    z: this.#camera.position.z,
    yaw: this.#camera.rotation.y,
  }));
  #nameplateMedals = false;
  #flashUntil = new Map<number, number>();
  #effects: { object: THREE.Object3D; until: number }[] = [];
  // Pooled projectile visuals (§13): instanced balls for small arms and
  // larger shells for artillery, all state in flat arrays so the per-frame
  // advance allocates nothing. Ball slots are 0 = free, 1 = flying; shell
  // slots add 2 = landed (holding the impact point for the type-8 event).
  readonly #ballInstances: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.075, 6, 6),
    // Phase 8e-9 Task 2: the ball is a physical object now — a small dark
    // iron sphere (the Redcoats "black 3D asset" read) instead of the 8e-1
    // hot emissive head. Unlit basic material on purpose: it must read as a
    // silhouette against the dawn sky AND at night, where an unlit black dot
    // beats a standard-material sphere no light reaches. Motion readability
    // comes from the streak + trail puffs.
    new THREE.MeshBasicMaterial({ color: 0x17130e }),
    BALL_POOL_SIZE,
  );
  // Phase 8e-9 Task 2: crossbow bolts fly as real bolt meshes (arrow glb,
  // swapped in from the loader below; thin cylinder until then). Musket
  // slots keep the sphere. No additive streak on bolts — the mesh is the
  // read, a fire-tracer behind a bolt would be wrong.
  readonly #boltInstances: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.008, 0.008, BOLT_GLB_METERS, 5),
    new THREE.MeshBasicMaterial({ color: 0x241c12 }),
    BALL_POOL_SIZE,
  );
  // Tracer streaks (Phase 8e-1, restyled 8e-10 Task 1): one stretched-
  // billboard ribbon per musket ball, aligned to the velocity and broadside
  // to the camera each frame (columns set directly on scratch vectors — zero
  // allocation). 8e-10: the bright additive fire-tracer read as a laser —
  // now a short, dim, warm-grey DUST wisp (normal blending, low opacity);
  // the dark ball is the readable element, this is the dust it kicks up.
  readonly #ballStreaks: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: TRACER_COLOR,
      transparent: true,
      opacity: TRACER_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    BALL_POOL_SIZE,
  );
  readonly #shellInstances: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    // Phase 8e-9 Task 2: larger (0.52 m) so the iron ball reads at 60+ m.
    // Unlit near-black stays: a lit sphere vanishes against the night ground.
    new THREE.SphereGeometry(0.26, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x100d0a }),
    SHELL_POOL_SIZE,
  );
  // Phase 8e-9 Task 2: each shell's smoke/dust tail — a stretched billboard
  // ribbon (Redcoats' cannonBallTails equivalent), same zero-allocation
  // basis math as the ball streaks but normal-blended smoke, not additive.
  readonly #shellTails: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x8a8175,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    SHELL_POOL_SIZE,
  );
  readonly #ballActive = new Uint8Array(BALL_POOL_SIZE);
  readonly #ballX = new Float32Array(BALL_POOL_SIZE);
  readonly #ballY = new Float32Array(BALL_POOL_SIZE);
  readonly #ballZ = new Float32Array(BALL_POOL_SIZE);
  readonly #ballDirX = new Float32Array(BALL_POOL_SIZE);
  readonly #ballDirY = new Float32Array(BALL_POOL_SIZE);
  readonly #ballDirZ = new Float32Array(BALL_POOL_SIZE);
  readonly #ballSpeed = new Float32Array(BALL_POOL_SIZE);
  readonly #ballRangeLeft = new Float32Array(BALL_POOL_SIZE);
  // Phase 8e-9 Task 2: per-slot kind (0 = musket ball, 1 = crossbow bolt)
  // and why the ball will stop (0 = max range, 1 = a SIEGE_BLOCKOUT wall —
  // the server's resolveRay blocks shots on the same boxes, so the cosmetic
  // ball now stops where the authoritative ray did and chips the stone).
  readonly #ballBolt = new Uint8Array(BALL_POOL_SIZE);
  readonly #ballTracer = new Uint8Array(BALL_POOL_SIZE);
  readonly #ballStopWall = new Uint8Array(BALL_POOL_SIZE);
  // 8e-10 probe support: whether the shot belongs to the local player — the
  // impact debug hook only records own-ball impacts (bot volleys would
  // overwrite a battle-wide "latest" record within milliseconds).
  readonly #ballOwn = new Uint8Array(BALL_POOL_SIZE);
  // Per-slot seconds since the last trail puff (Phase 8e-1: puffs are
  // intermittent and tier-scaled instead of one per frame per ball).
  readonly #ballTrailAcc = new Float32Array(BALL_POOL_SIZE);
  readonly #shellState = new Uint8Array(SHELL_POOL_SIZE);
  readonly #shellGunner = new Int32Array(SHELL_POOL_SIZE);
  readonly #shellX = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellY = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellZ = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellVelX = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellVelY = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellVelZ = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellAge = new Float32Array(SHELL_POOL_SIZE);
  readonly #shellLandedAt = new Float64Array(SHELL_POOL_SIZE);
  // Per-slot seconds since the last cannonTrail puff (Phase 8e-9: the ribbon
  // tail carries the continuous read, so puffs drop to a tier-scaled
  // interval instead of one per frame per shell).
  readonly #shellTrailAcc = new Float32Array(SHELL_POOL_SIZE);
  #hitMarkerUntil = 0;
  #headshotMarkerUntil = 0;
  #killMarkerUntil = 0;
  #damageDirectionUntil = 0;
  // Phase 8e-1: reload-complete "READY" flash on the reticle (Task 4).
  #readyFlashUntil = 0;
  // Phase 8e-1 Task 1: the ONE muzzle point light (the only new light this
  // phase is allowed), parented to the camera at the viewmodel muzzle.
  // Intensity 0 while idle, so it costs nothing between shots.
  #muzzleLight!: THREE.PointLight;
  #muzzleLightT = 0;
  // Phase 8e-9 Task 3: the ONE explosion light, pooled across impacts —
  // world-positioned at the newest impact, one-frame flash envelope,
  // tier-scaled peak (off on low). Intensity 0 while idle.
  #explosionLight!: THREE.PointLight;
  #explosionLightT = 0;
  // Phase 8e-25: per-wall-segment last bombard-impact timestamp (performance
  // ms). One breach is announced twice — the shell impact (type-8) at the
  // impact point and the WallEvent breach at the segment center — and the
  // 60 ms retrigger gate alone cannot guarantee a single boom when the two
  // messages straddle the window, so the second announcement within 500 ms
  // is dropped per segment.
  readonly #breachBoomAt = new Map<number, number>();
  // Phase 8e-25: prerendered nameplate sprites. The name + rank markers +
  // prestige stars are static per entity (only the projection moves), so the
  // per-frame 2D cost drops from three shadowed fillText calls to one
  // drawImage blit. Rebuilt only when the content key changes.
  readonly #nameplateSprites = new Map<number, NameplateSprite>();
  // Phase 8e-9 Task 3: ground-scorch decal ring. Shared geometry + shared
  // canvas texture; one cloned material per slot for independent opacity.
  // Built in #setupScene; aged in #updateProjectiles.
  readonly #scorchMeshes: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>[] = [];
  readonly #scorchStart = new Float64Array(SCORCH_POOL);
  readonly #scorchLive = new Uint8Array(SCORCH_POOL);
  readonly #scorchNormal = new THREE.Vector3();
  #scorchCursor = 0;
  #scorchCount = 0;
  // Phase 8e-1 Task 6: pooled world-anchored damage floaters (ring buffer),
  // drawn on the nameplate canvas — no DOM, no allocation after construction.
  readonly #floaterX = new Float32Array(DAMAGE_FLOATER_POOL);
  readonly #floaterY = new Float32Array(DAMAGE_FLOATER_POOL);
  readonly #floaterZ = new Float32Array(DAMAGE_FLOATER_POOL);
  readonly #floaterStart = new Float64Array(DAMAGE_FLOATER_POOL);
  readonly #floaterAmount = new Uint8Array(DAMAGE_FLOATER_POOL);
  #floaterCursor = 0;
  // Tracer streak matrix scratch (Phase 8e-1) — see #updateProjectiles.
  readonly #streakX = new THREE.Vector3();
  readonly #streakY = new THREE.Vector3();
  readonly #streakZ = new THREE.Vector3();
  readonly #streakPos = new THREE.Vector3();
  readonly #streakMatrix = new THREE.Matrix4();
  // Bolt-orientation scratch (Phase 8e-9): a stable perpendicular for the
  // bolt basis — world up unless the bolt flies near-vertical.
  readonly #boltPerp = new THREE.Vector3();
  #disposed = false;
  #wallStates = new Uint8Array(WALL_SEGMENTS.length);
  // Per-segment HP in sixteenths (protocol v12), full HP until Welcome/WallEvents say otherwise.
  readonly #wallHpFrac = new Uint8Array(WALL_SEGMENTS.length).fill(16);
  // Contested-front ring buffer (siege loop §3.2): recent combat-event
  // positions (deaths, artillery impacts, breaches), pruned past 15 s.
  readonly #combatHot: { x: number; z: number; at: number }[] = [];
  #pushingCannon = false;
  #manningArtillery = false;
  #fxSequence = 0;
  #killFeedSequence = 0;
  #lastKillFeedAt = 0;
  #stats: DebugStats = { ...emptyStats };
  #prevReloadTicks = 0;
  #prevButtons = 0;
  // Phase 8e-3 weapon slots: the shared machine is stepped inside the fixed
  // prediction loop so client and server evaluate the identical button stream.
  readonly #weaponSlots: WeaponSlotState = createWeaponSlotState();
  #prevStepButtons = 0;
  #pendingSlotSwitch: { seq: number; toSlot: number } | undefined;
  #viewmodelSlot = DEFAULT_WEAPON_SLOT;
  #prevSwitching = false;
  #forceViewmodelSync = false;
  #meleeReadyAtMs = 0;
  #localFootstepAt = 0;
  // Phase 8c-7 social: blocked player ids (courtesy filter, this client's
  // view only) and the current squad's entity ids (empty = no squad).
  readonly #blockedIds = new Set<number>();
  readonly #squadEntityIds = new Set<number>();
  // Phase 8c-6 positional audio: entity ids currently running gallop/crackle
  // loops, and the candidate scratch (sorted nearest-first, allocation-free).
  readonly #gallopLoopIds = new Set<number>();
  readonly #crackleLoopIds = new Set<number>();
  readonly #loopCandidates = new Uint32Array(64);
  readonly #loopDistSq = new Float32Array(64);
  readonly #loopAt = { x: 0, z: 0 };
  #loopCandidateCount = 0;
  #localTorchAudioLit = false;
  #prevPointProgress: number[] = [];
  #prevPointOwners: Team[] = [];
  #pointsInitialized = false;
  #prevRoundPhase: RoundPhase = RoundPhase.Active;
  #captureTickAt = 0;
  #creakAt = 0;
  #nearGalley = false;
  #nearGalleyX = 0;
  #nearGalleyZ = 0;
  #chantNearby = false;
  // ADR 0045: local landing/deep-water edge trackers (frame-path, no alloc).
  #localWasGrounded = true;
  #localAirMinVelocityY = 0;
  #wasInDeepWater = false;
  #fanfarePlayed = false;
  #palette: TeamPalette = TEAM_PALETTES.default;
  #quality: "low" | "medium" | "high" = "high";
  // Phase 8c-2 world-visual modules, created in #setupScene.
  readonly #captureDiscs: THREE.Mesh[] = [];
  #atmosphere!: Atmosphere;
  #water!: HarborWater;
  #terrain!: TerrainVisuals;
  #particles!: ParticleSystem;
  #banners!: CapturePointVisuals;
  #dressing!: DressingHandle;
  /** Dev-only: the single biome ground material, for live shader checks. */
  #groundArtMaterial: THREE.MeshStandardMaterial | null = null;
  #scatter!: ScatterHandle;
  #assetProps!: AssetPropsHandle;
  // Dev-only debug camera (Phase 8e-5): set via `window.__gameDebug.setCamera`
  // for deterministic terrain screenshots; never settable in prod builds.
  #debugCamera: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;
  // Dev-only movement-feel instrumentation (Phase 8e-6 Task 0): a scripted
  // input override plus a per-frame prediction recorder, wired only in
  // `import.meta.env.DEV` via `__gameDebug.movement`. All recorder costs are
  // gated on `#movementTrace !== null`; prod frames carry one branch.
  #driveOverride: { buttons: number; yaw: number; pitch: number } | null = null;
  #movementTrace: MovementTraceSample[] | null = null;
  #movementTraceStart = 0;
  #reconcileSerial = 0;
  #traceReconcileSerial = 0;
  #lastReconcileError = -1;
  // Torch rendering (Phase 8c-5): flame emitters per lit player plus a bounded
  // pool of shadowless PointLights assigned each frame to the nearest lit
  // remotes, so per-fragment light cost never scales with torch count.
  readonly #torchEmitterIds = new Set<number>();
  #localTorchEmitterOn = false;
  readonly #torchLightPool: THREE.PointLight[] = [];
  readonly #torchNearestIds = new Int32Array(TORCH_LIGHT_POOL_SIZE);
  readonly #torchNearestDistSq = new Float32Array(TORCH_LIGHT_POOL_SIZE);
  #localTorchLight!: THREE.PointLight;
  // First↔third-person blend: 1 = settled on #cameraThirdPerson; any flip
  // restarts it at 0 and #frame eases it back over CAMERA_BLEND_SECONDS.
  #cameraBlendProgress = 1;
  #cameraBlendMix = 0;
  readonly #blendFirstPos = new THREE.Vector3();
  readonly #blendThirdPos = new THREE.Vector3();
  readonly #blendFirstQuat = new THREE.Quaternion();
  readonly #blendThirdQuat = new THREE.Quaternion();
  readonly #blendTarget = new THREE.Vector3();
  readonly #blendUp = new THREE.Vector3(0, 1, 0);
  readonly #blendEuler = new THREE.Euler(0, 0, 0, "YXZ");
  readonly #blendMatrix = new THREE.Matrix4();
  #elapsedSeconds = 0;
  readonly #cameraFeel = new CameraFeel();
  #viewmodel!: Viewmodel;
  #viewmodelClass: PlayerClass = PlayerClass.None;
  #viewmodelMounted = false;
  #prevAlive = false;
  #skinEquips: Record<number, string> = {};
  // Phase 8e-7 ADS: user-configured base FOV (the camera starts at 72), the
  // smoothed 0→1 aim blend, and the weapon fovRatio captured while aiming so
  // switching to a blade mid-blend decays with the old ratio instead of
  // snapping. #lastAppliedFov guards the projection-matrix recompute.
  #baseFovDegrees = 72;
  #adsWeight = 0;
  #adsFovRatio = 1;
  #lastAppliedFov = 72;
  #reticleSteadyAt = performance.now() + STATIONARY_ACCURACY_SECONDS * 1_000;
  // Dev-probe counters (8e-7 dispersion proof): own Fire/Hit snapshot events.
  #debugMyShots = 0;
  #debugMyHits = 0;
  // Dev-probe counters (8e-9 screenshot timing): shells launched / impacts.
  #debugShellsFired = 0;
  #debugExplosions = 0;
  // Dev-probe hook (8e-10): the last ball ground-impact point + timestamp,
  // so the screenshot probe can aim the debug camera at the ACTUAL impact
  // instead of estimating ballistics from outside. Pre-allocated record
  // (at < 0 = none yet) — mutated in place, no per-event allocation.
  #debugLastBallImpact = { x: 0, y: 0, z: 0, wall: 0, at: -1 };
  // Same for the killPuff at any non-drowning death (8e-10 Task 2) — the
  // 0.5-0.8 s puff is impossible to frame by polling the kill feed.
  #debugLastKillPuff = { x: 0, y: 0, z: 0, at: -1 };

  constructor(
    container: HTMLElement,
    url: string,
    name: string,
    preferredTeam: Team,
    preferredClass: PlayerClass,
    token: string,
    onStats: (stats: DebugStats) => void,
    onDisconnected: (reason: string) => void,
  ) {
    this.#container = container;
    this.#onStats = onStats;
    this.#onDisconnected = onDisconnected;
    this.#renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.#renderer.setPixelRatio(this.#targetPixelRatio());
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.#renderer.domElement);
    const nameContext = this.#nameCanvas.getContext("2d");
    if (nameContext === null) throw new Error("Canvas 2D is unavailable");
    this.#nameContext = nameContext;
    this.#nameCanvas.className = "name-layer";
    container.append(this.#nameCanvas);
    this.#input = new InputController(this.#renderer.domElement);
    this.#input.onViewToggle(() => {
      this.#setCameraThirdPerson(!this.#cameraThirdPerson);
    });
    this.#renderer.domElement.addEventListener("click", this.#enableAudio);
    registerUiAudio(this.#audio);
    this.#setupScene();
    this.#resize();
    window.addEventListener("resize", this.#resize);
    // Local player's equipped reward skins (8c-0 data) — used to tint the
    // first-person viewmodel trim. Remote players' skins are not on the wire
    // (see ADR 0016), so this only ever affects the local view.
    if (token !== "") {
      void fetch(`${httpServerUrl()}/skins`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((state: { equips?: Record<number, string> } | undefined) => {
          if (state?.equips === undefined || this.#disposed) return;
          this.#skinEquips = state.equips;
          this.#viewmodelClass = PlayerClass.None; // force loadout + tint re-apply next frame
        })
        .catch(() => undefined);
    }

    this.#socket = new WebSocket(url);
    this.#socket.binaryType = "arraybuffer";
    this.#socket.addEventListener("open", () => this.#send(encodeJoin({ name, preferredTeam, preferredClass, token })));
    this.#socket.addEventListener("message", this.#onSocketMessage);
    this.#socket.addEventListener("close", (event) => {
      if (!this.#disposed) this.#onDisconnected(event.reason || "Connection closed");
    });
    this.#socket.addEventListener("error", () => {
      if (!this.#disposed) this.#onDisconnected("Unable to connect to the battle server");
    });
    this.#renderer.setAnimationLoop(this.#frame);
    // Dev-only audio diagnostic (Phase 8e-0): `__audioDebug()` in the console
    // returns live one-shot/loop voice counts. Tree-shaken out of prod builds.
    if (import.meta.env.DEV) {
      window.__audioDebug = () => this.#audio.debugSnapshot();
      // Dev-only debug camera (Phase 8e-5): the terrain screenshot probe
      // positions the camera deterministically without fighting server
      // reconciliation (the local entity stays where the server put it).
      window.__gameDebug = {
        setCamera: (x: number, y: number, z: number, yaw: number, pitch: number) => {
          this.#debugCamera = { x, y, z, yaw, pitch };
        },
        clearCamera: () => {
          this.#debugCamera = null;
        },
        // Phase 8e-12 A/B: `__gameDebug.legacySoldiers(true)` switches remote
        // soldiers back to the 8c-2 procedural instanced path (perf comparison
        // + rollback); `__gameDebug.characterCounts()` reports rig/corpse/far.
        legacySoldiers: (on: boolean) => {
          this.#legacySoldiers = on;
          if (on) this.#characters.setLegacyMode();
        },
        characterCounts: () => this.#characters.debugCounts(),
        characterRigs: () => this.#characters.debugRigs(),
        rigWorld: (entityId: number) => this.#characters.debugRigWorld(entityId),
        forceClip: (entityId: number, clip: string | null) => this.#characters.debugForceClip(entityId, clip),
        forceSlot: (entityId: number, slot: number | null) => this.#characters.debugForceSlot(entityId, slot),
        tuneMountedPose: (values: readonly number[]) => this.#characters.debugTuneMountedPose(values),
        longarmDebug: (entityId: number) => this.#characters.debugLongarm(entityId),
        horseCounts: () => this.#animatedHorses.debugCounts(),
        horseRigs: () => this.#animatedHorses.debugRigs(),
        forceHorseClip: (entityId: number, clip: "idle" | "walk" | null) => this.#animatedHorses.debugForceAction(entityId, clip),
        visual: () => ({
          ...this.#atmosphere.getPhaseDebug(),
          exposure: this.#renderer.toneMappingExposure,
          toneMapping: this.#renderer.toneMapping,
          shadows: this.#renderer.shadowMap.enabled,
        }),
        groundArt: () => ({
          compiled: this.#groundArtMaterial?.userData.groundArtCompiled === true,
          samples: {
            map: this.#groundArtMaterial?.map !== undefined && this.#groundArtMaterial?.map !== null,
            normal: this.#groundArtMaterial?.normalMap !== undefined && this.#groundArtMaterial?.normalMap !== null,
            roughness: this.#groundArtMaterial?.roughnessMap !== undefined && this.#groundArtMaterial?.roughnessMap !== null,
          },
        }),
        movement: {
          drive: (buttons: number, yaw: number, pitch = 0) => {
            this.#driveOverride = { buttons, yaw, pitch };
          },
          driveStop: () => {
            this.#driveOverride = null;
          },
          traceStart: () => {
            this.#movementTrace = [];
            this.#movementTraceStart = performance.now();
            this.#traceReconcileSerial = this.#reconcileSerial;
          },
          traceStop: () => {
            const trace = this.#movementTrace ?? [];
            this.#movementTrace = null;
            return trace;
          },
          state: (): MovementDebugState => ({
            x: this.#localState.x,
            y: this.#localState.y,
            z: this.#localState.z,
            grounded: this.#localState.grounded,
            alive: this.#prevAlive,
            corrections: this.#corrections,
            pending: this.#pendingInputs.length,
            lastError: this.#lastReconcileError,
          }),
        },
        combat: {
          counters: () => ({ shots: this.#debugMyShots, hits: this.#debugMyHits, explosions: this.#debugExplosions, shellsFired: this.#debugShellsFired }),
          resetCounters: () => {
            this.#debugMyShots = 0;
            this.#debugMyHits = 0;
          },
          nearestEnemy: () => {
            let best: { x: number; y: number; z: number; distance: number } | null = null;
            for (const remote of this.#remoteEntities.values()) {
              if (!remote.active || !remote.alive || remote.team === this.#stats.team) continue;
              const distance = Math.hypot(remote.renderX - this.#localState.x, remote.renderZ - this.#localState.z);
              if (best === null || distance < best.distance) {
                best = { x: remote.renderX, y: remote.renderY, z: remote.renderZ, distance };
              }
            }
            return best;
          },
          adsWeight: () => this.#adsWeight,
          densestCluster: () => {
            let best: { x: number; y: number; z: number; count: number } | null = null;
            for (const remote of this.#remoteEntities.values()) {
              if (!remote.active || !remote.alive) continue;
              let count = 0;
              for (const other of this.#remoteEntities.values()) {
                if (other === remote || !other.active || !other.alive) continue;
                if (Math.hypot(other.renderX - remote.renderX, other.renderZ - remote.renderZ) < 12) count += 1;
              }
              if (best === null || count > best.count) best = { x: remote.renderX, y: remote.renderY, z: remote.renderZ, count };
            }
            return best;
          },
          // Phase 8e-10 probe hook: last ball ground-impact point + age, so
          // the screenshot probe can frame the ACTUAL impact patch.
          lastBallImpact: () =>
            this.#debugLastBallImpact.at < 0
              ? null
              : {
                  x: this.#debugLastBallImpact.x,
                  y: this.#debugLastBallImpact.y,
                  z: this.#debugLastBallImpact.z,
                  wall: this.#debugLastBallImpact.wall === 1,
                  ageMs: performance.now() - this.#debugLastBallImpact.at,
                },
          // Same for the killPuff at any non-drowning death (8e-10 Task 2) —
          // feed polling can't frame a 0.5-0.8 s effect at a battle-wide spot.
          lastKillPuff: () =>
            this.#debugLastKillPuff.at < 0
              ? null
              : {
                  x: this.#debugLastKillPuff.x,
                  y: this.#debugLastKillPuff.y,
                  z: this.#debugLastKillPuff.z,
                  ageMs: performance.now() - this.#debugLastKillPuff.at,
                },
          // Phase 8e-9 probe hooks: live shell positions so the probe can aim
          // the debug camera at a cannonball in flight.
          shells: () => {
            const out: { x: number; y: number; z: number }[] = [];
            for (let index = 0; index < SHELL_POOL_SIZE; index += 1) {
              if (this.#shellState[index] === 1) out.push({ x: this.#shellX[index] ?? 0, y: this.#shellY[index] ?? 0, z: this.#shellZ[index] ?? 0 });
            }
            return out;
          },
        },
      };
    }
  }

  setArtificialLatency(enabled: boolean): void {
    this.#artificialOneWayLatencyMs = enabled ? 50 : 0;
  }

  setSensitivity(sensitivity: number): void {
    this.#input.setSensitivity(sensitivity);
  }

  setNameplateMedals(enabled: boolean): void {
    this.#nameplateMedals = enabled;
  }

  setColorblindPalette(enabled: boolean): void {
    this.#palette = enabled ? TEAM_PALETTES.colorblind : TEAM_PALETTES.default;
    this.#ottomanTint.setHex(this.#palette.hullTint[Team.Ottoman] ?? 0x8a2f28);
    this.#byzantineTint.setHex(this.#palette.hullTint[Team.Byzantine] ?? 0x4a3480);
    this.#banners.setPalette(this.#palette.accents[Team.Ottoman]?.[1] ?? "#e0695c", this.#palette.accents[Team.Byzantine]?.[1] ?? "#9a7bd8");
  }

  setFov(degrees: number): void {
    this.#baseFovDegrees = Math.max(60, Math.min(110, degrees));
    const effective = adsFovDegrees(this.#baseFovDegrees, this.#adsFovRatio, this.#adsWeight);
    if (Math.abs(effective - this.#lastAppliedFov) > 0.005) {
      this.#lastAppliedFov = effective;
      this.#camera.fov = effective;
      this.#camera.updateProjectionMatrix();
    }
  }

  setQuality(quality: "low" | "medium" | "high"): void {
    if (this.#quality === quality) return;
    this.#quality = quality;
    this.#renderer.setPixelRatio(this.#targetPixelRatio());
    configureGroundDetailQuality(groundDetailTextures(), this.#renderer, quality);
    this.#atmosphere.setQuality(quality);
    this.#water.setQuality(quality);
    this.#particles.setQuality(quality);
    this.#dressing.setQuality(quality);
    this.#scatter.setQuality(quality);
    this.#assetProps.setQuality(quality);
    this.#characters.setQuality(quality);
    this.#animatedHorses.setQuality(quality);
    this.#resize();
  }

  #targetPixelRatio(): number {
    // Phase 8c-5b: measured on the M2 GPU (headless sweep at the owner's
    // window size, pr 1 / 1.5 / 2 → 20.5 / 21.3 / 26.3 ms p95). High at
    // pr 2.0 was the single largest measured lever (+24% frame time over
    // pr 1.5) and the owner's thermal-limited GPU magnifies fill cost
    // further. 1.5 on Retina (dpr 2) stays visibly sharp; 1.25 keeps
    // medium a real step below high without the old pr-1 softness.
    const cap = this.#quality === "low" ? 1 : this.#quality === "medium" ? 1.25 : 1.5;
    return Math.min(window.devicePixelRatio, cap);
  }

  setVolumes(volumes: { master: number; sfx: number; music: number }): void {
    this.#audio.setVolumes(volumes);
  }

  selectClass(playerClass: PlayerClass): void {    this.#send(encodeClassSelect(playerClass));
  }

  selectSpawn(pointIndex: number): void {
    this.#send(encodeSpawnSelect(pointIndex));
  }

  /** Phase 8e-13: humans deploy explicitly from the death screen — no auto-respawn. */
  deploy(): void {
    this.#send(encodeDeploy());
  }

  /** Phase 8c-7: in-match squad invite/leave/disband (server broadcasts SquadState). */
  sendSquadCommand(op: SquadOp, targetPlayerId: number): void {
    this.#send(encodeSquadCommand({ op, targetPlayerId }));
  }

  setTextInputActive(active: boolean): void { this.#input.setTextInputActive(active); }

  requestLock(): void { this.#input.requestLock(); }

  releaseLock(): void { this.#input.releaseLock(); }

  sendChat(channel: ChatChannel, text: string): void { this.#send(encodeChatSend({ channel, text })); }

  reportChat(messageId: number): void { this.#send(encodeChatReport(messageId)); }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#renderer.setAnimationLoop(null);
    this.#input.dispose();
    this.#renderer.domElement.removeEventListener("click", this.#enableAudio);
    unregisterUiAudio(this.#audio);
    this.#audio.dispose();
    window.removeEventListener("resize", this.#resize);
    this.#socket.removeEventListener("message", this.#onSocketMessage);
    this.#socket.close();
    this.#remoteEntities.clear();
    this.#remotePool.length = 0;
    this.#earthworkStates.clear();
    this.#atmosphere.dispose();
    this.#particles.dispose();
    this.#banners.dispose();
    this.#assetProps.dispose();
    this.#disposeObject(this.#terrain.group);
    this.#scene.remove(this.#terrain.group);
    this.#disposeObject(this.#water.group);
    this.#scene.remove(this.#water.group);
    for (const batch of [this.#moundInstances, this.#trenchInstances]) {
      this.#scene.remove(batch);
      batch.geometry.dispose();
      (batch.material as THREE.Material).dispose();
    }
    this.#scene.remove(this.#cannonCarriages);
    this.#cannonCarriages.geometry.dispose();
    (this.#cannonCarriages.material as THREE.Material).dispose();
    this.#cannonCarriages.dispose();
    this.#scene.remove(this.#personalCannonCarriages);
    this.#personalCannonCarriages.geometry.dispose();
    (this.#personalCannonCarriages.material as THREE.Material).dispose();
    this.#personalCannonCarriages.dispose();
    this.#scene.remove(this.#galleyGunInstances);
    this.#galleyGunInstances.geometry.dispose();
    (this.#galleyGunInstances.material as THREE.Material).dispose();
    this.#galleyGunInstances.dispose();
    // Fixed wall-gun emplacement meshes (Phase 8e-4). Geometry is cloned per
    // gun and the material is a per-client clone of the shared loader material,
    // so disposing both here cannot reach into the loader's module cache and
    // leave a later GameClient with a disposed material. Textures are owned by
    // the cache and survive (Material.dispose does not touch them).
    for (const mesh of this.#emplacementMeshes) {
      this.#scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.#emplacementMeshes.length = 0;
    this.#emplacementMaterial?.dispose();
    this.#emplacementMaterial = undefined;
    for (const chunks of this.#rubbleChunks.values()) {
      for (const chunk of chunks) {
        this.#scene.remove(chunk);
        chunk.geometry.dispose();
      }
    }
    this.#rubbleChunks.clear();
    this.#rubbleChunkMaterial.dispose();
    this.#cannons.clear();
    this.#cannonPool.length = 0;
    this.#horses.clear();
    this.#horsePool.length = 0;
    for (const entityId of this.#torchEmitterIds) this.#particles.removeEmitter(`torch:${entityId}`);
    this.#torchEmitterIds.clear();
    if (this.#localTorchEmitterOn) this.#particles.removeEmitter("torch:local");
    for (const light of this.#torchLightPool) this.#scene.remove(light);
    this.#scene.remove(this.#localTorchLight);
    this.#viewmodel.dispose();
    this.#cameraFeel.dispose();
    this.#characters.dispose();
    this.#animatedHorses.dispose();
    // Soldier/horse geometries come from the module-level cache in
    // soldierModels.ts and must NOT be disposed; materials are ours.
    this.#soldierMaterial.dispose();
    for (const instances of this.#soldierInstances.values()) this.#scene.remove(instances);
    for (const instances of this.#seatedSoldierInstances.values()) this.#scene.remove(instances);
    (this.#horseInstances.material as THREE.Material).dispose();
    if (this.#horseGeometryOwned) this.#horseInstances.geometry.dispose();
    for (const instances of [this.#ballInstances, this.#shellInstances, this.#ballStreaks]) {
      this.#scene.remove(instances);
      instances.geometry.dispose();
      (instances.material as THREE.Material).dispose();
      instances.dispose();
    }
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
    this.#nameCanvas.remove();
  }

  readonly #enableAudio = (): void => {
    this.#audio.ensure();
  };

  #disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) for (const entry of material) entry.dispose();
        else material.dispose();
      }
    });
  }

  // §13: a real travelling ball replaces the old fake 14 m tracer line. The
  // muzzle math (yaw-forward × 0.9, eye height +0.65) matches the previous
  // effect and the server's pending-shot origin; the direction includes pitch
  // exactly like the server's shot ray. Speeds/ranges: see the constants.
  #spawnBall(state: EntityState, crossbow: boolean, own: boolean): void {
    if (!own) {
      const dx = (state.x ?? 0) - this.#camera.position.x;
      const dz = (state.z ?? 0) - this.#camera.position.z;
      if (dx * dx + dz * dz > PROJECTILE_VISIBILITY_RADIUS_METERS ** 2) return;
      let remoteActive = 0;
      for (let index = 0; index < BALL_POOL_SIZE; index += 1) {
        if (this.#ballActive[index] === 1 && this.#ballOwn[index] === 0) remoteActive += 1;
      }
      if (remoteActive >= PROJECTILE_REMOTE_CAP[this.#quality]) return;
    }
    let slot = -1;
    for (let index = 0; index < BALL_POOL_SIZE; index += 1) {
      if (this.#ballActive[index] === 0) {
        slot = index;
        break;
      }
    }
    if (slot < 0) return;
    const yaw = state.yaw ?? 0;
    const pitch = state.pitch ?? 0;
    const cosPitch = Math.cos(pitch);
    this.#ballDirX[slot] = -Math.sin(yaw) * cosPitch;
    this.#ballDirY[slot] = Math.sin(pitch);
    this.#ballDirZ[slot] = -Math.cos(yaw) * cosPitch;
    this.#ballX[slot] = (state.x ?? 0) - Math.sin(yaw) * 0.9;
    this.#ballY[slot] = (state.y ?? 0) + 0.65;
    this.#ballZ[slot] = (state.z ?? 0) - Math.cos(yaw) * 0.9;
    const ballDef = crossbow ? WEAPON_DEFS[WeaponType.Crossbow] : WEAPON_DEFS[WeaponType.Arquebus];
    this.#ballSpeed[slot] = ballDef.projectileSpeed ?? BALL_SPEED_ARQUEBUS;
    const maxRange = ballDef.maxRange ?? ARQUEBUS_MAX_RANGE;
    // Phase 8e-9 Task 2: the server's resolveRay blocks the authoritative
    // shot on SIEGE_BLOCKOUT (all walls solid, breached included — matching
    // the server's undefined wallStates). The cosmetic ball now stops at the
    // same distance and chips the stone instead of flying through the wall.
    // Computed once at spawn — zero per-frame cost. Earthworks (dynamic) are
    // not mirrored; they're low mounds the flat shot mostly clears.
    const wallDistance = raycastBoxes(
      { x: this.#ballX[slot] ?? 0, y: this.#ballY[slot] ?? 0, z: this.#ballZ[slot] ?? 0 },
      { x: this.#ballDirX[slot] ?? 0, y: this.#ballDirY[slot] ?? 0, z: this.#ballDirZ[slot] ?? 0 },
      maxRange,
      SIEGE_BLOCKOUT,
    );
    const stopDistance = wallDistance !== undefined && wallDistance < maxRange ? wallDistance : maxRange;
    this.#ballStopWall[slot] = stopDistance < maxRange ? 1 : 0;
    this.#ballRangeLeft[slot] = stopDistance;
    this.#ballBolt[slot] = crossbow ? 1 : 0;
    const distanceSq = ((state.x ?? 0) - this.#camera.position.x) ** 2 + ((state.z ?? 0) - this.#camera.position.z) ** 2;
    this.#ballTracer[slot] = own || distanceSq <= PROJECTILE_TRACER_RADIUS_METERS ** 2 ? 1 : 0;
    this.#ballOwn[slot] = own ? 1 : 0;
    this.#ballTrailAcc[slot] = 0;
    this.#ballActive[slot] = 1;
  }

  // Phase 8e-9 Task 2: terminal puff where a ball dies — the burst matches
  // the surface the authoritative shot would have met. Ground contact
  // (ball y <= heightAt + 0.02) classifies deck/water/dirt from shared map
  // facts; a wall stop chips stone. All counts small; the particle system
  // tier-scales them internally. Phase 8e-10 Task 2: dirt hits got a real
  // soil spray (brown chunks + dust — the old lone dust puff read as
  // nothing), decks throw more splinters, walls chip grey stone.
  #ballGroundImpact(x: number, z: number, own: boolean): void {
    // Water and galley decks sit in keep-flat zones (sea band / river
    // channel); only open-ground dirt follows the heightfield (8e-11).
    const surface = ballImpactSurface(onDeck(x, z), inDeepWater(x, z) || inShallowWater(x, z) || inRiver(x, z));
    const groundY = surface === "dirt" ? heightAt(x, z) : 0;
    // 8e-10 probe hook (dev surface): record, don't allocate. Own balls only.
    if (own) {
      this.#debugLastBallImpact.x = x;
      this.#debugLastBallImpact.y = groundY + 0.1;
      this.#debugLastBallImpact.z = z;
      this.#debugLastBallImpact.wall = 0;
      this.#debugLastBallImpact.at = performance.now();
    }
    if (surface === "wood") {
      this.#particles.burst("splinter", x, 0.15, z, 5, 0, 1, 0);
      // ADR 0045: a ball finding timber (galley decks, siege props) reads.
      this.#audio.play("wood-impact", { at: { x, z } });
    } else if (surface === "water") {
      this.#particles.burst("splash", x, WATER_Y + 0.02, z, 5, 0, 1, 0);
    } else {
      this.#particles.burst("dirtChunk", x, groundY + 0.1, z, 7, 0, 1, 0);
      this.#particles.burst("impactDust", x, groundY + 0.08, z, 4, 0, 1, 0);
    }
  }

  #ballWallImpact(x: number, y: number, z: number, own: boolean): void {
    // 8e-10b probe hook (dev surface): record own wall chips so the probe can
    // frame the chip point against the stone.
    if (own) {
      this.#debugLastBallImpact.x = x;
      this.#debugLastBallImpact.y = y;
      this.#debugLastBallImpact.z = z;
      this.#debugLastBallImpact.wall = 1;
      this.#debugLastBallImpact.at = performance.now();
    }
    this.#particles.burst("stoneChip", x, y, z, 5);
    this.#particles.burst("impactDust", x, y, z, 2);
    this.#particles.burst("spark", x, y, z, 1);
  }

  // §13: artillery shell mirroring the server projectile (world.ts
  // updateArtillery): same muzzle, same speed/gravity, same 5 s cap. Fixed
  // wall-guns derive their clamped aim from the gunner state; mobile cannon
  // aim is replicated with the cannon entity. Galley guns emit the
  // same event type with a vehicle target and value 0 — those are handled by
  // #spawnCannonSmoke instead, so only target === 0 spawns an emplacement
  // shell (this also drops the old tracer wrongly spawned at emplacement 0 on
  // every galley shot).
  #spawnShell(gunId: number, gunnerEntityId: number, gunnerState?: EntityState): void {
    const gun = ARTILLERY_EMPLACEMENTS[gunId];
    if (gun === undefined) return;
    const desiredYaw = gunnerState?.yaw ?? gun.yaw;
    const yawDelta = Math.atan2(Math.sin(desiredYaw - gun.yaw), Math.cos(desiredYaw - gun.yaw));
    const yaw = gun.yaw + Math.max(-gun.yawArc, Math.min(gun.yawArc, yawDelta));
    const pitch = Math.max(gun.minPitch, Math.min(gun.maxPitch, gunnerState?.pitch ?? SHELL_PITCH));
    this.#trackShell(gun.x, gun.z, yaw, gunnerEntityId, pitch, ARTILLERY_PROJECTILE_SPEED);
  }

  // Tracked shell from an explicit muzzle — emplacements pass their static
  // gun transform, mobile siege cannons their live position/yaw (siege loop).
  #trackShell(
    x: number,
    z: number,
    yaw: number,
    gunnerEntityId: number,
    pitch = SHELL_PITCH,
    projectileSpeed = ARTILLERY_PROJECTILE_SPEED,
  ): void {
    let slot = -1;
    for (let index = 0; index < SHELL_POOL_SIZE; index += 1) {
      if (this.#shellState[index] === 0) {
        slot = index;
        break;
      }
    }
    if (slot < 0) return; // all four tracked guns busy — drop the visual
    const cosPitch = Math.cos(pitch);
    this.#shellX[slot] = x;
    // 8e-11: muzzle rides the heightfield, matching the server's
    // heightAt(gunX, gunZ) + 1.5 (emplacements sit in keep-flat zones, so
    // this only moves mobile-cannon muzzles).
    this.#shellY[slot] = heightAt(x, z) + 1.5;
    this.#shellZ[slot] = z;
    this.#shellVelX[slot] = -Math.sin(yaw) * cosPitch * projectileSpeed;
    this.#shellVelY[slot] = Math.sin(pitch) * projectileSpeed;
    this.#shellVelZ[slot] = -Math.cos(yaw) * cosPitch * projectileSpeed;
    this.#shellAge[slot] = 0;
    this.#shellLandedAt[slot] = 0;
    this.#shellGunner[slot] = gunnerEntityId;
    this.#shellState[slot] = 1;
    this.#debugShellsFired += 1; // 8e-9 probe counter (dev surface)
  }

  // The shell a gunner's ArtilleryImpact event belongs to: prefer a landed
  // slot (its position is the true impact point) over one still flying.
  #shellForGunner(gunnerEntityId: number): number {
    let flying = -1;
    for (let index = 0; index < SHELL_POOL_SIZE; index += 1) {
      if (this.#shellGunner[index] !== gunnerEntityId) continue;
      if (this.#shellState[index] === 2) return index;
      if (this.#shellState[index] === 1) flying = index;
    }
    return flying;
  }

  // Per-frame projectile advance; runs before #particles.update so trail puffs
  // spawn at this frame's positions. Instance lists are compacted each frame —
  // instance index is unrelated to pool slot.
  #updateProjectiles(dt: number): void {
    const now = performance.now();
    const puffInterval = BALL_TRAIL_PUFF_SECONDS[this.#quality];
    const streaksOn = this.#quality !== "low";
    let ballCount = 0;
    let boltCount = 0;
    for (let slot = 0; slot < BALL_POOL_SIZE; slot += 1) {
      if (this.#ballActive[slot] === 0) continue;
      const speed = this.#ballSpeed[slot] ?? 0;
      const step = speed * dt;
      const x = (this.#ballX[slot] ?? 0) + (this.#ballDirX[slot] ?? 0) * step;
      const y = (this.#ballY[slot] ?? 0) + (this.#ballDirY[slot] ?? 0) * step;
      const z = (this.#ballZ[slot] ?? 0) + (this.#ballDirZ[slot] ?? 0) * step;
      const rangeLeft = (this.#ballRangeLeft[slot] ?? 0) - step;
      // Despawn at the (wall-clamped) range or on terrain contact, matching
      // the server's stop conditions — with the terminal puff for the
      // surface the shot actually met (Phase 8e-9 Task 2). 8e-11: ground
      // contact reads the shared heightfield and the impact point bisects the
      // terrain crossing along this frame's segment (a 160 m/s ball
      // overshoots ~2.7 m per frame; a flat walk-back would bury the puff on
      // rising slopes). 8e-17: stops use impactHeightAt — over water the ball
      // visually dies at the surface (splash), not at the carved bed.
      const groundStopY = impactHeightAt(x, z) + 0.02;
      if (rangeLeft <= 0 || y <= groundStopY) {
        this.#ballActive[slot] = 0;
        const oldX = this.#ballX[slot] ?? 0;
        const oldY = this.#ballY[slot] ?? 0;
        const oldZ = this.#ballZ[slot] ?? 0;
        if (y <= groundStopY && y < oldY) {
          let lo = 0;
          let hi = 1;
          for (let iter = 0; iter < 6; iter += 1) {
            const mid = (lo + hi) / 2;
            const midY = oldY + (y - oldY) * mid;
            if (midY <= impactHeightAt(oldX + (x - oldX) * mid, oldZ + (z - oldZ) * mid) + 0.02) hi = mid;
            else lo = mid;
          }
          this.#ballGroundImpact(oldX + (x - oldX) * hi, oldZ + (z - oldZ) * hi, this.#ballOwn[slot] === 1);
        } else if (rangeLeft <= 0 && this.#ballStopWall[slot] === 1) {
          this.#ballWallImpact(
            x + (this.#ballDirX[slot] ?? 0) * rangeLeft,
            y + (this.#ballDirY[slot] ?? 0) * rangeLeft,
            z + (this.#ballDirZ[slot] ?? 0) * rangeLeft,
            this.#ballOwn[slot] === 1,
          );
        }
        continue;
      }
      this.#ballX[slot] = x;
      this.#ballY[slot] = y;
      this.#ballZ[slot] = z;
      this.#ballRangeLeft[slot] = rangeLeft;
      // Intermittent faint smoke puffs along the trajectory (Phase 8e-1) —
      // was one burst per frame per ball, which pinned the ballTrail kind at
      // its live cap whenever a volley was in the air.
      const trailAcc = (this.#ballTrailAcc[slot] ?? 0) + dt;
      if (this.#ballBolt[slot] === 0 && trailAcc >= puffInterval) {
        this.#ballTrailAcc[slot] = 0;
        this.#particles.burst("ballTrail", x, y, z, 1);
      } else {
        this.#ballTrailAcc[slot] = trailAcc;
      }
      const dirX = this.#ballDirX[slot] ?? 0;
      const dirY = this.#ballDirY[slot] ?? 0;
      const dirZ = this.#ballDirZ[slot] ?? 0;
      if (this.#ballBolt[slot] === 1) {
        // Crossbow bolt (Phase 8e-9): the arrow mesh with its +Y long axis
        // on the flight direction (a proper rotation — Z = X × Y), tip at
        // the ballistic point. No additive streak: the mesh is the read.
        this.#streakX.set(dirX, dirY, dirZ);
        this.#boltPerp.set(0, 1, 0);
        if (Math.abs(dirY) > 0.95) this.#boltPerp.set(1, 0, 0);
        this.#streakY.crossVectors(this.#boltPerp, this.#streakX).normalize();
        this.#streakZ.crossVectors(this.#streakX, this.#streakY);
        this.#streakMatrix.makeBasis(this.#streakY, this.#streakX, this.#streakZ);
        this.#streakPos.set(x - dirX * BOLT_GLB_METERS * 0.5, y - dirY * BOLT_GLB_METERS * 0.5, z - dirZ * BOLT_GLB_METERS * 0.5);
        this.#streakMatrix.setPosition(this.#streakPos);
        this.#boltInstances.setMatrixAt(boltCount, this.#streakMatrix);
        boltCount += 1;
        continue;
      }
      this.#instanceTransform.position.set(x, y, z);
      this.#instanceTransform.rotation.set(0, 0, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      this.#ballInstances.setMatrixAt(ballCount, this.#instanceTransform.matrix);
      if (streaksOn && this.#ballTracer[slot] === 1) {
        // Velocity-aligned billboard: X = flight direction (streak length),
        // Y = broadside to the camera (ribbon width). The streak's center
        // sits half a length behind the ball head.
        this.#streakX.set(dirX, dirY, dirZ);
        this.#streakPos.set(x - this.#camera.position.x, y - this.#camera.position.y, z - this.#camera.position.z);
        this.#streakY.crossVectors(this.#streakX, this.#streakPos);
        if (this.#streakY.lengthSq() > 1e-8) {
          this.#streakY.normalize();
          this.#streakZ.crossVectors(this.#streakX, this.#streakY);
          this.#streakMatrix.makeBasis(this.#streakX.multiplyScalar(TRACER_LENGTH_METERS), this.#streakY.multiplyScalar(TRACER_WIDTH_METERS), this.#streakZ);
          this.#streakPos.set(x - dirX * TRACER_LENGTH_METERS * 0.5, y - dirY * TRACER_LENGTH_METERS * 0.5, z - dirZ * TRACER_LENGTH_METERS * 0.5);
          this.#streakMatrix.setPosition(this.#streakPos);
          this.#ballStreaks.setMatrixAt(ballCount, this.#streakMatrix);
        } else {
          // Camera looking straight down the trajectory: hide the ribbon.
          this.#streakMatrix.makeScale(0, 0, 0);
          this.#ballStreaks.setMatrixAt(ballCount, this.#streakMatrix);
        }
      } else if (streaksOn) {
        // Keep the streak index aligned with the ball instance, but park
        // distant ribbons so only the close projectile read remains.
        this.#streakMatrix.makeScale(0, 0, 0);
        this.#ballStreaks.setMatrixAt(ballCount, this.#streakMatrix);
      }
      ballCount += 1;
    }
    this.#ballInstances.count = ballCount;
    this.#ballInstances.instanceMatrix.needsUpdate = true;
    this.#boltInstances.count = boltCount;
    this.#boltInstances.instanceMatrix.needsUpdate = true;
    this.#ballStreaks.count = streaksOn ? ballCount : 0;
    this.#ballStreaks.instanceMatrix.needsUpdate = true;
    let shellCount = 0;
    const shellPuffInterval = SHELL_TRAIL_PUFF_SECONDS[this.#quality];
    for (let slot = 0; slot < SHELL_POOL_SIZE; slot += 1) {
      const state = this.#shellState[slot];
      if (state === 0) continue;
      if (state === 2) {
        if (now - (this.#shellLandedAt[slot] ?? 0) > SHELL_IMPACT_MEMORY_MS) this.#shellState[slot] = 0;
        continue;
      }
      const age = (this.#shellAge[slot] ?? 0) + dt;
      // Semi-implicit Euler, matching the server tick integration.
      const velY = (this.#shellVelY[slot] ?? 0) + ARTILLERY_PROJECTILE_GRAVITY * dt;
      const x = (this.#shellX[slot] ?? 0) + (this.#shellVelX[slot] ?? 0) * dt;
      const y = (this.#shellY[slot] ?? 0) + (this.#shellVelY[slot] ?? 0) * dt;
      const z = (this.#shellZ[slot] ?? 0) + (this.#shellVelZ[slot] ?? 0) * dt;
      this.#shellVelY[slot] = velY;
      this.#shellX[slot] = x;
      this.#shellY[slot] = y;
      this.#shellZ[slot] = z;
      this.#shellAge[slot] = age;
      // Same stop conditions as the server: terrain contact or the 5 s cap.
      // Wall hits are NOT mirrored (the client has no wall AABB check here);
      // the type-8 event still places the real impact burst, at most one
      // shell-length off — documented in the phase report. 8e-11: ground
      // contact reads the shared heightfield (server rule: y <= heightAt).
      // 8e-17: impactHeightAt so shells splash at the water surface instead
      // of sinking to the carved riverbed.
      if (y <= impactHeightAt(x, z) || age >= SHELL_MAX_SECONDS) {
        this.#shellY[slot] = Math.max(y, impactHeightAt(x, z));
        this.#shellLandedAt[slot] = now;
        this.#shellState[slot] = 2;
        continue;
      }
      // Phase 8e-9 Task 2: the ribbon tail carries the continuous read, so
      // the cannonTrail puffs drop to a tier-scaled interval (was one burst
      // per frame per shell — 60/s each).
      const shellTrailAcc = (this.#shellTrailAcc[slot] ?? 0) + dt;
      if (shellTrailAcc >= shellPuffInterval) {
        this.#shellTrailAcc[slot] = 0;
        this.#particles.burst("cannonTrail", x, y, z, 1);
      } else {
        this.#shellTrailAcc[slot] = shellTrailAcc;
      }
      this.#instanceTransform.position.set(x, y, z);
      this.#instanceTransform.rotation.set(0, 0, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      this.#shellInstances.setMatrixAt(shellCount, this.#instanceTransform.matrix);
      // Smoke tail ribbon: same velocity-aligned billboard math as the ball
      // streaks, normal-blended and longer — the cannonBallTails read.
      const velX = this.#shellVelX[slot] ?? 0;
      const velZ = this.#shellVelZ[slot] ?? 0;
      const velLength = Math.hypot(velX, velY, velZ);
      if (velLength > 1e-4) {
        this.#streakX.set(velX / velLength, velY / velLength, velZ / velLength);
        this.#streakPos.set(x - this.#camera.position.x, y - this.#camera.position.y, z - this.#camera.position.z);
        this.#streakY.crossVectors(this.#streakX, this.#streakPos);
        if (this.#streakY.lengthSq() > 1e-8) {
          this.#streakY.normalize();
          this.#streakZ.crossVectors(this.#streakX, this.#streakY);
          this.#streakMatrix.makeBasis(
            this.#streakX.multiplyScalar(SHELL_TAIL_LENGTH_METERS),
            this.#streakY.multiplyScalar(SHELL_TAIL_WIDTH_METERS),
            this.#streakZ,
          );
          this.#streakPos.set(
            x - (velX / velLength) * SHELL_TAIL_LENGTH_METERS * 0.5,
            y - (velY / velLength) * SHELL_TAIL_LENGTH_METERS * 0.5,
            z - (velZ / velLength) * SHELL_TAIL_LENGTH_METERS * 0.5,
          );
          this.#streakMatrix.setPosition(this.#streakPos);
          this.#shellTails.setMatrixAt(shellCount, this.#streakMatrix);
        } else {
          this.#streakMatrix.makeScale(0, 0, 0);
          this.#shellTails.setMatrixAt(shellCount, this.#streakMatrix);
        }
      } else {
        this.#streakMatrix.makeScale(0, 0, 0);
        this.#shellTails.setMatrixAt(shellCount, this.#streakMatrix);
      }
      shellCount += 1;
    }
    this.#shellInstances.count = shellCount;
    this.#shellInstances.instanceMatrix.needsUpdate = true;
    this.#shellTails.count = shellCount;
    this.#shellTails.instanceMatrix.needsUpdate = true;
    // Phase 8e-9 Task 3: scorch decals age on the same clock; expired slots
    // hide (the ring reuses them whether hidden or not).
    for (let index = 0; index < SCORCH_POOL; index += 1) {
      if (this.#scorchLive[index] === 0) continue;
      const mesh = this.#scorchMeshes[index];
      if (mesh === undefined) {
        this.#scorchLive[index] = 0;
        continue;
      }
      const alpha = scorchAlpha((now - (this.#scorchStart[index] ?? 0)) / 1000);
      if (alpha <= 0) {
        this.#scorchLive[index] = 0;
        mesh.visible = false;
      } else {
        mesh.material.opacity = alpha * SCORCH_PEAK_ALPHA;
      }
    }
  }

  /**
   * Phase 8e-9 Task 3: the full cannonball-impact payoff, shared by the
   * shell-impact event (type 8) and the cannon-destroyed event (type 12).
   * Adds the 8e-9 layer on top of the pre-existing dust/splinter/driftSmoke
   * triple: a one-frame pooled light flash (tier-scaled, off on low), debris
   * chunks with real gravity, a short rising smoke column, a distance-scaled
   * camera shake (the trauma clamp caps simultaneous shakes), and a
   * persistent ground scorch. On water the burst turns to spray; on a deck
   * to extra splinters; neither leaves a scorch.
   */
  #explodeAt(x: number, y: number, z: number): void {
    const deck = onDeck(x, z);
    const wet = !deck && (inDeepWater(x, z) || inShallowWater(x, z) || inRiver(x, z));
    if (wet) {
      this.#particles.burst("splash", x, WATER_Y + 0.05, z, 14, 0, 1, 0);
      this.#particles.burst("smokeColumn", x, WATER_Y + 0.4, z, 2, 0, 1, 0);
    } else {
      this.#particles.burst("impactDust", x, y + 0.6, z, 14, 0, 1, 0);
      this.#particles.burst("splinter", x, y + 0.8, z, deck ? 12 : 8, 0, 1, 0);
      this.#particles.burst("driftSmoke", x, y + 1.2, z, 8, 0, 1, 0);
      this.#particles.burst("debris", x, y + 0.4, z, 8, 0, 1, 0);
      // Phase 8e-10 Task 2: a cannonball into ground throws a proper soil
      // spray on top of the explosion debris — brown, not black.
      if (!deck) this.#particles.burst("dirtChunk", x, y + 0.3, z, 8, 0, 1, 0);
      this.#particles.burst("smokeColumn", x, y + 0.5, z, 3, 0, 1, 0);
      if (!deck) this.#addScorch(x, z);
      this.#burstWallChips(x, y, z);
    }
    // The one pooled explosion light hops to the newest impact — a second
    // impact inside the 140 ms envelope simply re-peaks it there.
    this.#explosionLight.position.set(x, y + 0.7, z);
    this.#explosionLightT = EXPLOSION_FLASH_SECONDS;
    this.#cameraFeel.onExplosion(
      Math.hypot(x - this.#camera.position.x, y - this.#camera.position.y, z - this.#camera.position.z),
    );
    this.#recordCombatHotspot(x, z);
    this.#debugExplosions += 1; // 8e-9 probe counter (dev surface)
  }

  // Phase 8e-9 Task 3: stamp a ground scorch into the decal ring. Size
  // jitter is a deterministic integer hash of the spawn counter (no RNG);
  // the tiny per-slot y stagger keeps overlapping decals from z-fighting.
  // 8e-11: rides the heightfield and tilts to the terrain normal so the
  // decal hugs slopes instead of clipping into them.
  #addScorch(x: number, z: number): void {
    const index = this.#scorchCursor;
    this.#scorchCursor = (this.#scorchCursor + 1) % SCORCH_POOL;
    const mesh = this.#scorchMeshes[index];
    if (mesh === undefined) return; // pool not built yet (pre-#setupScene)
    this.#scorchCount += 1;
    const jitter = 0.85 + 0.45 * (((this.#scorchCount * 2654435761) >>> 4) % 1024) / 1024;
    mesh.position.set(x, heightAt(x, z) + 0.025 + index * 0.0012, z);
    terrainGradientAt(x, z, TERRAIN_GRADIENT_SCRATCH);
    this.#scorchNormal.set(-TERRAIN_GRADIENT_SCRATCH.x, 1, -TERRAIN_GRADIENT_SCRATCH.z).normalize();
    mesh.quaternion.setFromUnitVectors(SCORCH_UP, this.#scorchNormal);
    mesh.scale.setScalar(SCORCH_RADIUS_METERS * jitter);
    mesh.material.opacity = SCORCH_PEAK_ALPHA;
    mesh.visible = true;
    this.#scorchStart[index] = performance.now();
    this.#scorchLive[index] = 1;
  }

  #setupScene(): void {
    const textures = gameTextures();
    // Stable daylight, fog, shadows, and color grading all live in the
    // Atmosphere module (it mutates the scene/renderer it is given).
    this.#atmosphere = new Atmosphere(this.#renderer, this.#scene, this.#camera);
    const grassTexture = textures.grass;
    grassTexture.repeat.set(144, 144);
    textures.grassBump.repeat.set(144, 144);
    const groundDetails = groundDetailTextures();
    configureGroundDetailQuality(groundDetails, this.#renderer, this.#quality);
    // Phase 8e-15: the ground is a subdivided plane whose per-vertex color
    // still carries the biome grade, while the baked groundBlend attribute
    // selects tiled CC0 grass/dirt/rock PBR detail without adding extra ground
    // meshes or overdraw. Vertex z is the shared heightfield, not a flat sim
    // approximation.
    const ground = new THREE.Mesh(
      buildBiomeGroundGeometry(),
      groundDetailMaterial(groundDetails),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.#scene.add(ground);
    this.#groundArtMaterial = ground.material as THREE.MeshStandardMaterial;
    const dirtTexture = textures.dirt;
    dirtTexture.repeat.set(90, 2);
    textures.dirtBump.repeat.set(90, 2);
    const packedEarth = new THREE.Mesh(
      new THREE.PlaneGeometry(1800, 30),
      new THREE.MeshStandardMaterial({ map: dirtTexture, bumpMap: textures.dirtBump, bumpScale: 0.5, color: 0xffffff, roughness: 1 }),
    );
    packedEarth.rotation.x = -Math.PI / 2;
    packedEarth.position.set(0, 0.006, 0);
    packedEarth.receiveShadow = true;
    this.#scene.add(packedEarth);
    // Phase 8e-5 Task 1: the worn lanes (spawn→gate→city, harbor spur) as
    // dirt decal strips over the biome ground.
    buildRoadDecals(this.#scene, textures.dirt);
    // Phase 8e-17 Task 2: the eroded sand margins along the carved river
    // channel (one draped ribbon, one draw call).
    buildRiverBankDecals(this.#scene);
    const materialFor = (material: string): THREE.MeshStandardMaterial => {
      if (material === "stone") return new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stoneBump, bumpScale: 0.8, color: 0xffffff, roughness: 0.95, flatShading: true });
      if (material === "wood") return new THREE.MeshStandardMaterial({ map: textures.wood, bumpMap: textures.woodBump, bumpScale: 0.5, color: 0xffffff, roughness: 0.9, flatShading: true });
      return new THREE.MeshStandardMaterial({ map: textures.dirt, bumpMap: textures.dirtBump, bumpScale: 0.5, color: 0xffffff, roughness: 1, flatShading: true });
    };
    for (const box of SIEGE_BLOCKOUT) {
      if (box.id.startsWith("wall-segment-") || box.id.startsWith("rubble-segment-")) continue;
      if (box.id.startsWith("terrain-")) continue; // terrain module renders its own visuals
      // Phase 8e-5 Task 2: city walls read as Theodosian ashlar. The texture
      // clone per box keeps the courses ~1.6 m and stones ~2.9 m on any box
      // length instead of stretching one face-span across 38 m.
      let material = materialFor(box.material);
      if (box.material === "stone") {
        const ashlarTexture = textures.ashlar.clone();
        ashlarTexture.repeat.set(Math.max(box.width, box.depth) / 11.5, box.height / 8);
        ashlarTexture.needsUpdate = true;
        const ashlarBump = textures.ashlarBump.clone();
        ashlarBump.repeat.copy(ashlarTexture.repeat);
        ashlarBump.needsUpdate = true;
        material = new THREE.MeshStandardMaterial({ map: ashlarTexture, bumpMap: ashlarBump, bumpScale: 0.9, color: 0xffffff, roughness: 0.95, flatShading: true });
      }
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(box.width, box.height, box.depth),
        material,
      );
      mesh.position.set(box.x, box.y, box.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#scene.add(mesh);
    }
    // The twelve wall boxes share dimensions and materials. Keep their
    // per-segment damage tint and breach visibility as instance data instead
    // of paying one wall draw plus one rubble draw per segment.
    const firstWall = WALL_SEGMENTS[0]!;
    const wallInstances = new THREE.InstancedMesh(
      new THREE.BoxGeometry(firstWall.box.width, firstWall.box.height, firstWall.box.depth),
      // Instance color carries the live damage tint. Do not also enable
      // per-vertex colors: BoxGeometry has no `color` attribute, and the
      // missing channel can multiply the ashlar albedo to black on WebGL.
      new THREE.MeshStandardMaterial({ map: textures.ashlar, bumpMap: textures.ashlarBump, bumpScale: 0.9, color: 0xffffff, roughness: 0.95, flatShading: true }),
      WALL_SEGMENTS.length,
    );
    const rubbleInstances = new THREE.InstancedMesh(
      rubbleGeometry(firstWall.rubble.width, firstWall.rubble.height, firstWall.rubble.depth, 1),
      new THREE.MeshStandardMaterial({ map: textures.rubble, bumpMap: textures.rubbleBump, bumpScale: 1.0, color: 0xffffff, roughness: 1, flatShading: true }),
      WALL_SEGMENTS.length,
    );
    wallInstances.frustumCulled = false;
    rubbleInstances.frustumCulled = false;
    wallInstances.castShadow = true;
    wallInstances.receiveShadow = true;
    rubbleInstances.castShadow = true;
    rubbleInstances.receiveShadow = true;
    const instanceMatrix = new THREE.Matrix4();
    const instanceQuaternion = new THREE.Quaternion();
    const instancePosition = new THREE.Vector3();
    const instanceScale = new THREE.Vector3(1, 1, 1);
    const hiddenScale = new THREE.Vector3(0, 0, 0);
    for (const segment of WALL_SEGMENTS) {
      instancePosition.set(segment.box.x, segment.box.y, segment.box.z);
      instanceMatrix.compose(instancePosition, instanceQuaternion, instanceScale);
      wallInstances.setMatrixAt(segment.id, instanceMatrix);
      wallInstances.setColorAt(segment.id, this.#whiteColor);
      instancePosition.set(segment.rubble.x, segment.rubble.y, segment.rubble.z);
      instanceMatrix.compose(instancePosition, instanceQuaternion, hiddenScale);
      rubbleInstances.setMatrixAt(segment.id, instanceMatrix);
      this.#wallMeshes.set(segment.id, { wall: wallInstances, rubble: rubbleInstances });
    }
    wallInstances.instanceMatrix.needsUpdate = true;
    if (wallInstances.instanceColor !== null) wallInstances.instanceColor.needsUpdate = true;
    rubbleInstances.instanceMatrix.needsUpdate = true;
    this.#scene.add(wallInstances, rubbleInstances);
    for (const point of CAPTURE_POINTS) {
      const capture = new THREE.Mesh(new THREE.CylinderGeometry(point.radius, point.radius, 0.03, 32), new THREE.MeshBasicMaterial({ color: 0xd5b554, transparent: true, opacity: 0.22 }));
      capture.position.set(point.x, 0.02, point.z);
      this.#captureDiscs.push(capture);
      this.#scene.add(capture);
    }
    this.#banners = new CapturePointVisuals(this.#scene, CAPTURE_POINTS, this.#captureDiscs);
    this.#viewmodel = new Viewmodel(this.#camera);
    this.#scene.add(this.#camera);
    this.#camera.rotation.order = "YXZ";
    this.#water = createHarborWater(textures.water, WATER_SHORE_Z);
    this.#scene.add(this.#water.group);
    this.#terrain = buildTerrain(textures);
    this.#scene.add(this.#terrain.group);
    upgradeTerrainVisuals(this.#terrain);
    this.#particles = new ParticleSystem(this.#scene);
    // Persistent atmosphere: powder smoke clinging to every gun position and
    // dust motes in the dawn light along the wall line.
    for (const gun of ARTILLERY_EMPLACEMENTS) {
      this.#particles.addEmitter(`gun-smoke-${gun.id}`, "driftSmoke", gun.x, 2.2, gun.z, 1.6, 1.4);
    }
    for (let index = 0; index < 5; index += 1) {
      this.#particles.addEmitter(`wall-dust-${index}`, "ambientDust", -60 + index * 30, 3.5, 2, 1.2, 9);
    }
    for (const playerClass of SOLDIER_CLASSES) {
      const instances = new THREE.InstancedMesh(soldierGeometry(playerClass), this.#soldierMaterial, RENDER_INSTANCE_CAPACITY);
      instances.count = 0;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instances.frustumCulled = false;
      instances.castShadow = true;
      this.#soldierInstances.set(playerClass, instances);
      this.#scene.add(instances);
      const seatedInstances = new THREE.InstancedMesh(seatedSoldierGeometry(playerClass), this.#soldierMaterial, RENDER_INSTANCE_CAPACITY);
      seatedInstances.count = 0;
      seatedInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      seatedInstances.frustumCulled = false;
      seatedInstances.castShadow = true;
      this.#seatedSoldierInstances.set(playerClass, seatedInstances);
      this.#scene.add(seatedInstances);
    }
    this.#horseInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#horseInstances.frustumCulled = false;
    this.#galleyHulls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#galleyHulls.frustumCulled = false;
    this.#galleyGunInstances.count = 0;
    this.#galleyGunInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#galleyGunInstances.frustumCulled = false;
    this.#horseInstances.castShadow = true;
    this.#galleyHulls.castShadow = true;
    this.#galleyGunInstances.castShadow = true;
    this.#scene.add(this.#horseInstances, this.#galleyHulls, this.#galleyGunInstances);
    // Phase 8e-12: fire-and-forget — the procedural batches above render
    // every soldier until the rigged characters land (CharacterRenderer.ready).
    this.#characters.load();
    this.#animatedHorses.load();
    this.#cannonCarriages.count = 0;
    this.#cannonCarriages.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#cannonCarriages.frustumCulled = false;
    this.#cannonCarriages.castShadow = true;
    this.#scene.add(this.#cannonCarriages);
    this.#personalCannonCarriages.count = 0;
    this.#personalCannonCarriages.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#personalCannonCarriages.frustumCulled = false;
    this.#personalCannonCarriages.castShadow = true;
    this.#scene.add(this.#personalCannonCarriages);
    for (const instances of [this.#ballInstances, this.#shellInstances, this.#ballStreaks, this.#boltInstances, this.#shellTails]) {
      instances.count = 0;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instances.frustumCulled = false;
      this.#scene.add(instances);
    }
    // Phase 8e-9 Task 3: the pooled explosion light (one, world-positioned —
    // hops to the newest impact) and the ground-scorch decal ring. The
    // decals share one geometry + one canvas texture; per-slot cloned
    // materials so each fades independently.
    this.#explosionLight = new THREE.PointLight(0xffa050, 0, 18, 2);
    this.#explosionLight.intensity = 0;
    this.#scene.add(this.#explosionLight);
    const scorchTexture = makeScorchTexture();
    const scorchGeometry = new THREE.CircleGeometry(1, 20);
    scorchGeometry.rotateX(-Math.PI / 2); // flat on the ground, +Y normal
    for (let index = 0; index < SCORCH_POOL; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: scorchTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(scorchGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      this.#scorchMeshes.push(mesh);
      this.#scene.add(mesh);
    }
    for (const batch of [this.#moundInstances, this.#trenchInstances]) {
      batch.count = 0;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.frustumCulled = false;
      batch.castShadow = true;
      batch.receiveShadow = true;
      this.#scene.add(batch);
    }
    // Torch light pool: shadowless warm PointLights (same budget precedent as
    // the banner lights) — six shared across the nearest lit remotes, plus one
    // dedicated to the local player. Intensity 0 until assigned.
    for (let index = 0; index < TORCH_LIGHT_POOL_SIZE; index += 1) {
      const light = new THREE.PointLight(TORCH_LIGHT_COLOR, 0, 14, 2);
      this.#torchLightPool.push(light);
      this.#scene.add(light);
    }
    this.#localTorchLight = new THREE.PointLight(TORCH_LIGHT_COLOR, 0, 16, 2);
    this.#scene.add(this.#localTorchLight);
    // Phase 8e-1 Task 1: the own-shot muzzle light, riding the camera at the
    // rifle muzzle (8e-9: the glb's fitted tip sits at viewmodel-space
    // (0, 0.015, -0.66) on the BASE (0.3, -0.3, -0.52) rig → camera-space
    // (0.3, -0.285, -1.18)). Shadowless, 8 m falloff; intensity in #frame.
    this.#muzzleLight = new THREE.PointLight(0xffb35c, 0, 8, 2);
    this.#muzzleLight.position.set(0.3, -0.285, -1.18);
    this.#camera.add(this.#muzzleLight);
    // Phase 8e-9 Task 2: swap the fallback bolt cylinder for the arrow glb
    // (authored +Y, head at +Y — measured in ADR 0038): centred, scaled to
    // BOLT_GLB_METERS, and the instance basis puts +Y on the flight path.
    void loadModel(PROJECTILE_MODELS.arrow)
      .then((model) => {
        if (this.#disposed) return;
        const geometry = model.geometry.clone();
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (box === null) return;
        const length = Math.max(box.max.y - box.min.y, 1e-6);
        const scale = BOLT_GLB_METERS / length;
        geometry.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
        geometry.scale(scale, scale, scale);
        this.#boltInstances.geometry.dispose();
        this.#boltInstances.geometry = geometry;
        // The colour-only kit bakes to a vertex-colour standard material by
        // the loader; clone it (ADR 0018: dispose() owns this copy, never
        // the loader cache's).
        const fallback = this.#boltInstances.material;
        this.#boltInstances.material = model.material.clone();
        fallback.dispose();
      })
      .catch(() => undefined);
    // Phase 8c-3: swap the placeholder box hull for the real Kenney galley
    // once it loads; the box stays as the fallback. Masts/sails are part of
    // the ship glb, which is why the old separate mast batch is gone.
    void loadModel(GALLEY_MODEL)
      .then((model) => {
        if (this.#disposed) return;
        const geometry = model.geometry.clone();
        geometry.rotateY(Math.PI / 2); // ship length runs along X, matching the old hull footprint
        groundFit(geometry, 18);
        geometry.translate(0, -0.6, 0); // settle the keel slightly below the waterline
        const placeholderMaterial = this.#galleyHulls.material as THREE.Material;
        this.#galleyHulls.geometry.dispose();
        this.#galleyHulls.geometry = geometry;
        // The loader cache owns model.material. Keep a per-client copy so
        // dispose() cannot poison a second GameClient in the same page.
        this.#galleyHulls.material = model.material.clone();
        placeholderMaterial.dispose();
      })
      .catch(() => undefined);
    // Use the prepared Meshy horse for mounted cavalry and riderless mounts.
    // The instanced batch keeps the low draw-call contract; the procedural
    // horse remains a readable fallback if this asynchronous load fails.
    void loadModel(WORLD_ASSET_MODELS.warHorse)
      .then((model) => {
        if (this.#disposed) return;
        const geometry = model.geometry.clone();
        // The source is a side profile authored along X. Cavalry assets and
        // the sim use local -Z as the horse's nose direction.
        geometry.rotateY(-Math.PI / 2);
        groundFit(geometry, 2.1);
        const material = prepareInstancedMaterial(geometry, model.material);
        const placeholder = this.#horseInstances.material as THREE.Material;
        this.#horseInstances.geometry.dispose();
        this.#horseInstances.geometry = geometry;
        this.#horseInstances.material = material as THREE.MeshStandardMaterial;
        this.#horseGeometryOwned = true;
        placeholder.dispose();
      })
      .catch(() => undefined);
    this.#loadArtilleryModels();
    this.#dressing = buildDressing(this.#scene);
    this.#assetProps = buildAssetProps(this.#scene);
    // Phase 8e-5 Task 3: living-terrain scatter (visual-only, instanced,
    // tier-scaled). Fire-and-forget like the dressing above it.
    this.#scatter = buildScatter(this.#scene);
  }

  /**
   * Phase 8e-26 generated artillery models. Fire-and-forget off the frame path,
   * exactly like the galley hull above; a failed load leaves the procedural
   * mobile carriage in place and simply keeps the fixed-emplacement fallback
   * empty, so the map stays playable. The prep tool already measured and
   * baked the field-culverin's -X → -Z yaw, matching the server's artillery
   * forward convention.
   */
  #loadArtilleryModels(): void {
    void loadModel(ARTILLERY_MODELS.mobile)
      .then((model) => {
        if (this.#disposed) return;

        // Personal Topçu field guns: geometry+material swap inside their own
        // instanced batch. Keeping this separate from the heavy bombard batch
        // preserves the visual distinction between the two artillery roles.
        const carriage = model.geometry.clone();
        groundFit(carriage, 2.1);
        const artilleryMaterial = prepareInstancedMaterial(carriage, model.material);
        const placeholder = this.#personalCannonCarriages.material as THREE.Material;
        this.#personalCannonCarriages.geometry.dispose();
        this.#personalCannonCarriages.geometry = carriage;
        this.#personalCannonCarriages.material = artilleryMaterial;
        placeholder.dispose();
      })
      .catch(() => undefined);

    void loadModel(ARTILLERY_MODELS.sahiBombard)
      .then((model) => {
        if (this.#disposed) return;
        const carriage = model.geometry.clone();
        groundFit(carriage, 3.2);
        const artilleryMaterial = prepareInstancedMaterial(carriage, model.material);
        const placeholder = this.#cannonCarriages.material as THREE.Material;
        this.#cannonCarriages.geometry.dispose();
        this.#cannonCarriages.geometry = carriage;
        this.#cannonCarriages.material = artilleryMaterial;
        placeholder.dispose();
      })
      .catch(() => undefined);

    void loadModel(ARTILLERY_MODELS.emplacement)
      .then((model) => {
        if (this.#disposed) return;
        // Fixed wall guns are additive dressing only — no collider, no
        // SIEGE_BLOCKOUT entry. Their transforms remain the authoritative
        // server emplacement transforms so the visible barrel points where
        // the shell leaves the muzzle.
        const emplacementMaterial = model.material.clone();
        this.#emplacementMaterial = emplacementMaterial;
        for (const gun of ARTILLERY_EMPLACEMENTS) {
          const geometry = model.geometry.clone();
          groundFit(geometry, 2.8);
          const mesh = new THREE.Mesh(geometry, emplacementMaterial);
          mesh.position.set(gun.x, heightAt(gun.x, gun.z), gun.z);
          mesh.rotation.y = gun.yaw;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.#emplacementMeshes.push(mesh);
          this.#scene.add(mesh);
        }
      })
      .catch(() => undefined);
  }

  // Any first↔third-person flip (mount reset or V-key) restarts the short
  // blend; #frame eases #cameraBlendProgress back to 1 and crossfades the
  // viewmodel at the blend midpoint.
  #setCameraThirdPerson(thirdPerson: boolean): void {
    if (this.#cameraThirdPerson === thirdPerson) return;
    this.#cameraThirdPerson = thirdPerson;
    this.#cameraBlendProgress = 0;
  }

  // Wall visuals follow both the 2-bit state and the v12 hpFrac byte: the
  // state drives the wall/rubble swap, the hpFrac drives a reversible staged
  // crack tint (siege loop §2.2). Each wall mesh owns its material instance
  // (created per segment in #setupScene), so stages are independent per
  // segment and lighten back when repair raises the HP again — the old code
  // set the Damaged tint once and never reverted it.
  #applyWallState(segmentId: number, state: WallState, hpFrac?: number): void {
    this.#wallStates[segmentId] = state;
    if (hpFrac !== undefined) this.#wallHpFrac[segmentId] = hpFrac;
    const frac = this.#wallHpFrac[segmentId] ?? 16;
    const meshes = this.#wallMeshes.get(segmentId);
    if (meshes === undefined) return;
    const segment = WALL_SEGMENTS[segmentId];
    if (segment === undefined) return;
    const visibleScale = state === WallState.Breached ? 0 : 1;
    const rubbleScale = state === WallState.Breached ? 1 : 0;
    const wallMatrix = new THREE.Matrix4().makeTranslation(segment.box.x, segment.box.y, segment.box.z);
    wallMatrix.scale(new THREE.Vector3(visibleScale, visibleScale, visibleScale));
    meshes.wall.setMatrixAt(segmentId, wallMatrix);
    this.#wallTint.setHex(wallDamageTint(frac));
    meshes.wall.setColorAt(segmentId, this.#wallTint);
    const rubbleMatrix = new THREE.Matrix4().makeTranslation(segment.rubble.x, segment.rubble.y, segment.rubble.z);
    rubbleMatrix.scale(new THREE.Vector3(rubbleScale, rubbleScale, rubbleScale));
    meshes.rubble.setMatrixAt(segmentId, rubbleMatrix);
    meshes.wall.instanceMatrix.needsUpdate = true;
    meshes.rubble.instanceMatrix.needsUpdate = true;
    if (meshes.wall.instanceColor !== null) meshes.wall.instanceColor.needsUpdate = true;
    // Near-breach segments trickle dust; the emitter dies on breach or repair.
    if (state !== WallState.Breached && frac <= 4) {
      if (!this.#crackDustSegments.has(segmentId)) {
        const segment = WALL_SEGMENTS[segmentId];
        if (segment !== undefined) {
          this.#particles.addEmitter(`wall-crack-${segmentId}`, "ambientDust", segment.box.x, 3.2, segment.box.z + 1.8, 1.4, 4);
          this.#crackDustSegments.add(segmentId);
        }
      }
    } else if (this.#crackDustSegments.delete(segmentId)) {
      this.#particles.removeEmitter(`wall-crack-${segmentId}`);
    }
    // Breach dressing: scatter rubble chunks once so the passage reads
    // walkable; clear them if the segment ever leaves the Breached state
    // (war reset re-applies states from Welcome).
    if (state === WallState.Breached) {
      if (!this.#rubbleChunks.has(segmentId)) this.#scatterRubbleChunks(segmentId);
    } else {
      this.#clearRubbleChunks(segmentId);
    }
  }

  /** One-time low-poly debris scatter along a breached segment (seeded, no new assets). */
  #scatterRubbleChunks(segmentId: number): void {
    const segment = WALL_SEGMENTS[segmentId];
    if (segment === undefined) return;
    const rand = earthworkRand(0x5eed + segmentId * 97);
    const chunks: THREE.Mesh[] = [];
    for (let index = 0; index < 6; index += 1) {
      const sizeX = 0.35 + rand() * 0.55;
      const sizeY = 0.25 + rand() * 0.4;
      const sizeZ = 0.35 + rand() * 0.55;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), this.#rubbleChunkMaterial);
      chunk.position.set(
        segment.box.x + (rand() - 0.5) * (segment.box.width - 2),
        segment.rubble.y + segment.rubble.height / 2 + sizeY / 2 - 0.08,
        segment.rubble.z + (rand() - 0.5) * (segment.rubble.depth - 1.5),
      );
      chunk.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      this.#scene.add(chunk);
      chunks.push(chunk);
    }
    this.#rubbleChunks.set(segmentId, chunks);
  }

  #clearRubbleChunks(segmentId: number): void {
    const chunks = this.#rubbleChunks.get(segmentId);
    if (chunks === undefined) return;
    this.#rubbleChunks.delete(segmentId);
    for (const chunk of chunks) {
      this.#scene.remove(chunk);
      chunk.geometry.dispose();
    }
  }

  #acquireRemote(entityId: number): RemoteEntity | undefined {
    const remote = this.#remotePool.pop();
    if (remote === undefined) return undefined;
    remote.entityId = entityId;
    remote.active = true;
    remote.alive = false;
    remote.hasPrevious = false;
    remote.previous.receivedAt = 0;
    remote.current.receivedAt = 0;
    remote.nextFarUpdateAt = 0;
    this.#remoteEntities.set(entityId, remote);
    return remote;
  }

  #releaseRemote(entityId: number): void {
    const remote = this.#remoteEntities.get(entityId);
    if (remote === undefined) return;
    this.#remoteEntities.delete(entityId);
    remote.entityId = 0;
    remote.team = Team.None;
    remote.active = false;
    remote.alive = false;
    remote.torch = 0;
    remote.hasPrevious = false;
    this.#remotePool.push(remote);
    if (this.#torchEmitterIds.delete(entityId)) this.#particles.removeEmitter(`torch:${entityId}`);
    this.#characters.release(entityId);
    this.#animatedHorses.release(entityId);
  }

  #acquireVehicle(entityId: number): RemoteVehicle | undefined {
    const vehicle = this.#vehiclePool.pop();
    if (vehicle === undefined) return undefined;
    vehicle.entityId = entityId;
    vehicle.active = true;
    vehicle.hasPrevious = false;
    vehicle.previous.receivedAt = 0;
    vehicle.current.receivedAt = 0;
    vehicle.hullHp = 1000;
    vehicle.shipState = 0;
    vehicle.listingUntil = 0;
    this.#vehicles.set(entityId, vehicle);
    return vehicle;
  }

  #releaseVehicle(entityId: number): void {
    const vehicle = this.#vehicles.get(entityId);
    if (vehicle === undefined) return;
    this.#vehicles.delete(entityId);
    vehicle.entityId = 0;
    vehicle.active = false;
    this.#vehiclePool.push(vehicle);
  }

  #acquireCannon(entityId: number): RemoteCannon | undefined {
    const cannon = this.#cannonPool.pop();
    if (cannon === undefined) return undefined;
    cannon.entityId = entityId;
    cannon.active = true;
    cannon.hasPrevious = false;
    cannon.previous.receivedAt = 0;
    cannon.current.receivedAt = 0;
    cannon.hullHp = SIEGE_CANNON_HP;
    cannon.shipState = 0;
    cannon.moving = false;
    cannon.lastSmokeAt = 0;
    this.#cannons.set(entityId, cannon);
    return cannon;
  }

  #releaseCannon(entityId: number): void {
    const cannon = this.#cannons.get(entityId);
    if (cannon === undefined) return;
    this.#cannons.delete(entityId);
    cannon.entityId = 0;
    cannon.active = false;
    this.#cannonPool.push(cannon);
  }

  #storeCannonState(cannon: RemoteCannon, state: EntityState, receivedAt: number): void {
    const previous = cannon.previous;
    cannon.previous = cannon.current;
    cannon.current = previous;
    cannon.hasPrevious = cannon.previous.receivedAt > 0;
    cannon.current.entityId = state.entityId;
    cannon.current.x = state.x;
    cannon.current.y = state.y;
    cannon.current.z = state.z;
    cannon.current.yaw = state.yaw;
    cannon.current.pitch = state.pitch;
    cannon.current.cannonGunYaw = state.cannonGunYaw ?? state.yaw;
    cannon.current.cannonGunPitch = state.cannonGunPitch ?? 0.3;
    cannon.current.team = state.team ?? Team.None;
    cannon.current.receivedAt = receivedAt;
    cannon.team = state.team ?? Team.None;
    cannon.hullHp = state.shipHullHp ?? SIEGE_CANNON_HP;
    cannon.shipState = state.shipState ?? 0;
    // "Pushing forward" for the defender banner: real motion, not drift.
    const span = Math.max(1, cannon.current.receivedAt - cannon.previous.receivedAt);
    cannon.moving = cannon.hasPrevious
      && Math.hypot(cannon.current.x - cannon.previous.x, cannon.current.z - cannon.previous.z) * 1_000 / span > 0.3;
  }

  #acquireHorse(entityId: number): RemoteHorse | undefined {
    const horse = this.#horsePool.pop();
    if (horse === undefined) return undefined;
    horse.entityId = entityId;
    horse.active = true;
    horse.hasPrevious = false;
    horse.previous.receivedAt = 0;
    horse.current.receivedAt = 0;
    horse.team = Team.None;
    this.#horses.set(entityId, horse);
    return horse;
  }

  #releaseHorse(entityId: number): void {
    const horse = this.#horses.get(entityId);
    if (horse === undefined) return;
    this.#horses.delete(entityId);
    horse.entityId = 0;
    horse.active = false;
    this.#animatedHorses.release(entityId);
    this.#horsePool.push(horse);
  }

  #storeHorseState(horse: RemoteHorse, state: EntityState, receivedAt: number): void {
    const previous = horse.previous;
    horse.previous = horse.current;
    horse.current = previous;
    horse.hasPrevious = horse.previous.receivedAt > 0;
    horse.current.entityId = state.entityId;
    horse.current.x = state.x;
    horse.current.y = state.y;
    horse.current.z = state.z;
    horse.current.yaw = state.yaw;
    horse.current.pitch = state.pitch;
    horse.current.team = state.team ?? Team.None;
    horse.current.receivedAt = receivedAt;
    horse.team = state.team ?? Team.None;
  }

  #storeVehicleState(vehicle: RemoteVehicle, state: EntityState, receivedAt: number): void {
    const previous = vehicle.previous;
    vehicle.previous = vehicle.current;
    vehicle.current = previous;
    vehicle.hasPrevious = vehicle.previous.receivedAt > 0;
    vehicle.current.entityId = state.entityId;
    vehicle.current.x = state.x;
    vehicle.current.y = state.y;
    vehicle.current.z = state.z;
    vehicle.current.yaw = state.yaw;
    vehicle.current.shipGun1Yaw = state.shipGun1Yaw ?? state.yaw + Math.PI / 2;
    vehicle.current.shipGun2Yaw = state.shipGun2Yaw ?? state.yaw - Math.PI / 2;
    vehicle.current.pitch = state.pitch;
    vehicle.current.team = state.team ?? Team.None;
    vehicle.current.receivedAt = receivedAt;
    vehicle.team = state.team ?? Team.None;
    vehicle.hullHp = state.shipHullHp ?? 1000;
    vehicle.shipState = state.shipState ?? 0;
    if ((vehicle.shipState & SHIP_STATE_SUNK) !== 0 && vehicle.listingUntil === 0) vehicle.listingUntil = performance.now() + 8_000;
    if ((vehicle.shipState & SHIP_STATE_SUNK) === 0) vehicle.listingUntil = 0;
  }

  #storeRemoteState(remote: RemoteEntity, state: EntityState, receivedAt: number): void {
    const previous = remote.previous;
    remote.previous = remote.current;
    remote.current = previous;
    remote.hasPrevious = remote.previous.receivedAt > 0;
    remote.current.entityId = state.entityId;
    remote.current.x = state.x;
    remote.current.y = state.y;
    remote.current.z = state.z;
    remote.current.yaw = state.yaw;
    remote.current.pitch = state.pitch;
    remote.current.flags = state.flags ?? 0;
    remote.current.team = state.team ?? Team.None;
    remote.current.playerClass = state.playerClass ?? PlayerClass.None;
    remote.current.mounted = state.mounted ?? false;
    remote.current.horseHp = state.horseHp ?? 0;
    // Phase 8e-12: the equipped slot drives which hand prop a rigged
    // character shows. It's on the wire (8e-3); the render loop just never
    // copied it across before.
    remote.current.weaponSlot = state.weaponSlot ?? DEFAULT_WEAPON_SLOT;
    remote.current.receivedAt = receivedAt;
    remote.team = state.team ?? Team.None;
    remote.torch = state.torch ?? 0;
    remote.alive = ((state.flags ?? 0) & PlayerFlag.Alive) !== 0;
  }

  readonly #resize = (): void => {
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    this.#camera.aspect = width / Math.max(1, height);
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height, false);
    const pixelRatio = this.#targetPixelRatio();
    this.#nameCanvas.width = Math.max(1, Math.floor(width * pixelRatio));
    this.#nameCanvas.height = Math.max(1, Math.floor(height * pixelRatio));
    this.#nameCanvas.style.width = `${width}px`;
    this.#nameCanvas.style.height = `${height}px`;
    this.#nameContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  #send(buffer: ArrayBuffer): void {
    this.#bytesOutWindow += buffer.byteLength;
    const transmit = (): void => {
      if (!this.#disposed && this.#socket.readyState === WebSocket.OPEN) this.#socket.send(buffer);
    };
    if (this.#artificialOneWayLatencyMs > 0) window.setTimeout(transmit, this.#artificialOneWayLatencyMs);
    else transmit();
  }

  readonly #onSocketMessage = (event: MessageEvent<ArrayBuffer>): void => {
    const buffer = event.data;
    this.#bytesInWindow += buffer.byteLength;
    const process = (): void => {
      if (!this.#disposed) this.#processMessage(buffer);
    };
    if (this.#artificialOneWayLatencyMs > 0) window.setTimeout(process, this.#artificialOneWayLatencyMs);
    else process();
  };

  #processMessage(buffer: ArrayBuffer): void {
    try {
      const type = readMessageType(buffer);
      if (type === MessageType.Welcome) {
        const welcome = decodeWelcome(buffer);
        this.#localEntityId = welcome.entityId;
        this.#stats.entityId = welcome.entityId;
        this.#stats.team = welcome.team ?? Team.None;
        this.#stats.playerClass = welcome.playerClass ?? PlayerClass.None;
        this.#stats.queuedClass = this.#stats.playerClass;
        for (let segment = 0; segment < WALL_SEGMENTS.length; segment += 1) this.#applyWallState(segment, ((welcome.wallStateBits ?? 0) >>> (segment * 2) & 0x3) as WallState, welcome.wallHpFrac?.[segment] ?? 16);
        this.#stats.walls = Array.from(this.#wallStates);
        this.#stats.wallHp = Array.from(this.#wallHpFrac);
        this.#localState = {
          ...this.#localState,
          x: welcome.x,
          y: welcome.y,
          z: welcome.z,
        };
      } else if (type === MessageType.EntityJoin) {
        const joined = decodeEntityJoin(buffer);
        this.#names.set(joined.entityId, joined.name);
        if (joined.tag !== undefined) this.#tags.set(joined.entityId, joined.tag);
        else this.#tags.delete(joined.entityId);
        if (joined.bot === true) this.#bots.add(joined.entityId);
        else this.#bots.delete(joined.entityId);
        if (joined.kind === EntityKind.Galley) {
          this.#acquireVehicle(joined.entityId);
        } else if (joined.kind === EntityKind.SiegeCannon) {
          this.#acquireCannon(joined.entityId);
        } else if (joined.kind === EntityKind.Horse) {
          this.#acquireHorse(joined.entityId);
        } else if (joined.kind === EntityKind.Earthwork) {
          this.#earthworkStates.delete(joined.entityId);
        } else {
          this.#ranks.set(joined.entityId, { rank: joined.rank ?? 1, prestige: joined.prestige ?? 0 });
          this.#classes.set(joined.entityId, joined.playerClass ?? PlayerClass.None);
        }
      } else if (type === MessageType.EntityLeave) {
        const entityId = decodeEntityLeave(buffer);
        this.#releaseRemote(entityId);
        this.#releaseVehicle(entityId);
        this.#releaseCannon(entityId);
        this.#releaseHorse(entityId);
        this.#earthworkStates.delete(entityId);
        this.#names.delete(entityId);
        this.#tags.delete(entityId);
        this.#bots.delete(entityId);
        this.#ranks.delete(entityId);
        this.#classes.delete(entityId);
        this.#nameplateSprites.delete(entityId);
        this.#flashUntil.delete(entityId);
        if (this.#flashUntil.size > 512) {
          const sweepNow = performance.now();
          for (const [staleId, until] of this.#flashUntil) {
            if (until <= sweepNow) this.#flashUntil.delete(staleId);
          }
        }
      } else if (type === MessageType.MedalUnlock) {
        this.#processMedalUnlock(decodeMedalUnlock(buffer));
      } else if (type === MessageType.MedalState) {
        const state = decodeMedalState(buffer);
        this.#stats = { ...this.#stats, medalState: { wars: state.wars, counters: state.counters } };
        this.#onStats({ ...this.#stats });
      } else if (type === MessageType.ClanState) {
        this.#stats = { ...this.#stats, clan: this.#processClanState(decodeClanState(buffer)) };
        this.#onStats({ ...this.#stats });
      } else if (type === MessageType.ShipEvent) {
        this.#processShipEvent(decodeShipEvent(buffer));
      } else if (type === MessageType.ClassStatus) {
        const status = decodeClassStatus(buffer);
        // 8e-13: ClassStatus reports the QUEUED class, not the live one — the
        // snapshot (local.playerClass) stays the only source for playerClass,
        // so picking a class while alive never flickers the live viewmodel.
        if (status.accepted) this.#stats.queuedClass = status.playerClass;
        this.#stats.classStatus = status.accepted ? "Class selected for next spawn" : "Class queue is full";
      } else if (type === MessageType.WallEvent) {
        const event = decodeWallEvent(buffer);
        this.#applyWallState(event.segmentId, event.state, event.hpFrac);
        this.#stats.walls = Array.from(this.#wallStates) as WallState[];
        this.#stats.wallHp = Array.from(this.#wallHpFrac);
        const segment = WALL_SEGMENTS[event.segmentId];
        if (event.state === WallState.Breached && segment !== undefined) {
          this.#pushKillFeed(`THE ${wallRegionName(event.segmentId)} IS BREACHED!`, "unknown");
          // Phase 8e-25: the same breach was very likely already announced by
          // the shell impact (type-8); drop the duplicate boom per segment.
          if (this.#breachBoomDue(segment.box.x, segment.box.z)) {
            this.#audio.play("bombard-impact", { at: { x: segment.box.x, z: segment.box.z }, volume: 0.6 });
          }
          // Breach spectacle (siege loop §2.6): a dust plume along the whole
          // segment length — collapse dust + lingering smoke + splinter debris.
          for (let step = -2; step <= 2; step += 1) {
            const plumeX = segment.box.x + step * (segment.box.width / 5);
            this.#particles.burst("impactDust", plumeX, 1.2, segment.box.z, 8, 0, 1, 0);
            this.#particles.burst("splinter", plumeX, 1.6, segment.box.z, 4, 0, 1, 0);
            this.#particles.burst("driftSmoke", plumeX, 2.4, segment.box.z, 5, 0, 1, 0);
          }
          const distance = Math.hypot(segment.box.x - this.#localState.x, segment.box.z - this.#localState.z);
          this.#cameraFeel.onBreach(distance);
          this.#recordCombatHotspot(segment.box.x, segment.box.z);
        }
      } else if (type === MessageType.Account) {
        this.#processAccount(decodeAccount(buffer));
      } else if (type === MessageType.BlockedIds) {
        this.#blockedIds.clear();
        for (const id of decodeBlockedIds(buffer).blockedIds) this.#blockedIds.add(id);
      } else if (type === MessageType.SquadState) {
        const state = decodeSquadState(buffer);
        this.#squadEntityIds.clear();
        for (const entityId of state.memberEntityIds) this.#squadEntityIds.add(entityId);
        this.#stats = { ...this.#stats, squadEntityIds: this.#squadEntityIds };
        this.#onStats({ ...this.#stats });
      } else if (type === MessageType.ChatMessage) {
        const message = decodeChatMessage(buffer);
        // Blocked players' chat never reaches the blocking player's client
        // (Phase 8c-7 courtesy scope — this client's view only).
        if (!this.#blockedIds.has(message.playerId)) {
          this.#stats = { ...this.#stats, chatMessages: [...this.#stats.chatMessages.slice(-49), message], chatNotice: "" };
          this.#onStats({ ...this.#stats });
          this.#audio.play("chat-pop");
        }
      } else if (type === MessageType.ChatNotice) {
        this.#stats = { ...this.#stats, chatNotice: decodeChatNotice(buffer).text };
        this.#onStats({ ...this.#stats });
      } else if (type === MessageType.XpEvent) {
        this.#processXpEvent(decodeXpEvent(buffer));
      } else if (type === MessageType.ContractEvent) {
        this.#processContractEvent(decodeContractEvent(buffer));
      } else if (type === MessageType.WarSummary) {
        this.#processWarSummary(decodeWarSummary(buffer));
      } else if (type === MessageType.Snapshot) {
        this.#processSnapshot(buffer);
      } else if (type === MessageType.Pong) {
        const nonce = decodePing(buffer, MessageType.Pong);
        const sentAt = this.#pendingPings.get(nonce);
        if (sentAt !== undefined) {
          // Rolling median so one main-thread stall cannot paint one inflated
          // second (Phase 8e-4b, audit INFO-4).
          this.#stats.pingMs = Math.round(this.#pingSmoother.push(performance.now() - sentAt));
          this.#pendingPings.delete(nonce);
        }
      }
    } catch (error: unknown) {
      console.warn("Ignored invalid server message", error);
    }
  }

  #pushFx(kind: FxEvent["kind"], text: string, sub = ""): void {
    const id = this.#fxSequence++;
    this.#stats = { ...this.#stats, fxEvents: [...this.#stats.fxEvents, { id, kind, text, sub, at: performance.now() }] };
  }

  #processAccount(message: AccountMessage): void {
    try {
      localStorage.setItem("janissary-token", message.token);
      localStorage.setItem("janissary-name", message.name);
    } catch {
      // Storage can be unavailable in private contexts; gameplay continues.
    }
    const careers = message.careers.slice(0, 2);
    const displayCareers: CareerDisplay[] = [];
    for (let index = 0; index < 2; index += 1) {
      const career = careers[index];
      if (career === undefined) {
        displayCareers.push(emptyCareer());
        continue;
      }
      const xpNext = xpForNextRank(career.rank);
      const faction = index === 0 ? Team.Ottoman : Team.Byzantine;
      displayCareers.push({
        xp: career.xp,
        rank: career.rank,
        prestige: career.prestige,
        xpNext,
        title: rankTitle(faction, career.rank),
        tier: rankTier(career.rank),
        headshots: career.headshots ?? 0,
      });
    }
    const contracts: ContractDisplay[] = [];
    for (let index = 0; index < MAX_DAILY_CONTRACTS; index += 1) {
      const contract = message.contracts[index];
      if (contract === undefined) {
        contracts.push({ kind: 0, progress: 0, target: 1, reward: 0, completed: false, description: "" });
        continue;
      }
      contracts.push({ ...contract, description: contractDefinition(contract.kind)?.description ?? "" });
    }
    const medals: MedalDisplay[] = message.medals.map((medal) => ({ ...medal, title: medalDefinition(medal.kind)?.title ?? "" }));
    this.#stats = {
      ...this.#stats,
      playerId: message.playerId,
      careers: displayCareers,
      contracts,
      medals,
      lifetime: { ...message.lifetime },
      warTally: { ottoman: message.warTallyOttoman, byzantine: message.warTallyByzantine },
      claimed: message.claimed,
    };
  }

  #processXpEvent(event: ReturnType<typeof decodeXpEvent>): void {
    const factionIndex = event.faction === Team.Ottoman ? 0 : 1;
    const careers = [...this.#stats.careers];
    const current = careers[factionIndex];
    if (current !== undefined) {
      const xpNext = xpForNextRank(event.rank);
      careers[factionIndex] = {
        xp: event.totalXp,
        rank: event.rank,
        prestige: event.prestige,
        xpNext,
        title: rankTitle(event.faction, event.rank),
        tier: rankTier(event.rank),
        headshots: current.headshots ?? 0,
      };
    }
    this.#stats = { ...this.#stats, careers };
    if (event.leveled) {
      const title = rankTitle(event.faction, event.rank);
      const sub = event.prestiged ? `${title} · Prestige ${event.prestige}` : "";
      this.#pushFx("fanfare", event.prestiged ? `${title} (Gazi ${event.prestige})` : `Promoted to ${title}`, sub);
      this.#audio.promotionSting();
      const selfName = this.#displayName(this.#localEntityId);
      this.#pushKillFeed(`${selfName} was promoted to ${title}`, "unknown");
    }
    if (event.source === XpSource.EasterEgg) {
      this.#pushFx("fanfare", "The hidden hound was found", `+${event.amount} XP`);
    } else if (event.amount >= 10 || event.source === XpSource.PointCaptured || event.source === XpSource.Contract || event.source === XpSource.WelcomeBack || event.source === XpSource.WarVictory || event.source === XpSource.WarParticipation) {
      const label = event.amount >= 10 || event.source === XpSource.Contract || event.source === XpSource.WelcomeBack ? `+${event.amount} XP` : "";
      if (label !== "") this.#pushFx("floaty", label);
    }
    if (event.headshot) this.#markLastKillFeedHeadshot();
    this.#correlateOwnKill(event);
  }

  // The own-kill notification is pushed on the Death combat event; the XP it
  // was worth (and whether it was a headshot) arrives on the XpEvent stream,
  // so correlate the two within the same short window the kill feed uses.
  #correlateOwnKill(event: ReturnType<typeof decodeXpEvent>): void {
    const killXp = event.source === XpSource.Kill || event.source === XpSource.MountedKill
      || event.source === XpSource.DefenseKill || event.source === XpSource.DismountRider;
    const headshotXp = event.headshot || event.source === XpSource.Headshot;
    if (!killXp && !headshotXp) return;
    const latest = [...this.#stats.fxEvents].reverse().find((fx) => fx.kind === "ownkill");
    if (latest === undefined || performance.now() - latest.at > 3_000) return;
    // ADR 0045: headshot kills get their own crack on top of the kill sting;
    // ordinary kills keep the 8e-1 hit-ding family.
    if (headshotXp) this.#audio.play("headshot");
    this.#stats = {
      ...this.#stats,
      fxEvents: this.#stats.fxEvents.map((fx) => (fx.id === latest.id
        ? { ...fx, xp: (fx.xp ?? 0) + event.amount, headshot: (fx.headshot ?? false) || headshotXp }
        : fx)),
    };
  }

  #markLastKillFeedHeadshot(): void {
    const latest = this.#killFeed[0];
    if (latest === undefined || latest.killerName === undefined || latest.headshot === true) return;
    if (performance.now() - this.#lastKillFeedAt > 3_000) return;
    latest.headshot = true;
  }

  #processContractEvent(event: ReturnType<typeof decodeContractEvent>): void {
    const contracts = [...this.#stats.contracts];
    const existing = contracts[event.slot];
    if (existing !== undefined) {
      contracts[event.slot] = {
        kind: event.kind,
        progress: event.progress,
        target: event.target,
        reward: event.reward,
        completed: event.completed,
        description: contractDefinition(event.kind)?.description ?? "",
      };
    }
    this.#stats = { ...this.#stats, contracts };
    if (event.completed) {
      const description = contractDefinition(event.kind)?.description ?? "Contract";
      this.#pushFx("toast", `Contract complete: ${description}`, `+${event.reward} XP`);
      this.#audio.synthNow(740, 0.18, 0.035);
    }
  }

  #processWarSummary(message: ReturnType<typeof decodeWarSummary>): void {
    const medals: MedalDisplay[] = [];
    for (let index = 0; index < 4; index += 1) {
      const kind = index + 1;
      if ((message.medalMask & (1 << index)) !== 0) {
        medals.push({ kind, count: 1, title: medalDefinition(kind)?.title ?? "" });
      }
    }
    const existingCounts = [...this.#stats.medals];
    const lifetime = { ...this.#stats.lifetime };
    for (const medal of medals) {
      const slot = existingCounts[indexOfMedal(existingCounts, medal.kind)];
      if (slot !== undefined) slot.count += 1;
      lifetime.medals += 1;
    }
    lifetime.wars += 1;
    if (message.winner === this.#stats.team) lifetime.wins += 1;
    lifetime.kills += message.kills;
    lifetime.deaths += message.deaths;
    lifetime.captures += message.captures;
    this.#stats = {
      ...this.#stats,
      medals: existingCounts,
      lifetime,
      warTally: { ottoman: message.warTallyOttoman, byzantine: message.warTallyByzantine },
      warSummary: {
        winner: message.winner,
        warTallyOttoman: message.warTallyOttoman,
        warTallyByzantine: message.warTallyByzantine,
        medals,
        warXpEarned: message.warXpEarned,
        welcomeBackBonus: message.welcomeBackBonus,
        captures: message.captures,
        defenseKills: message.defenseKills,
        shots: message.shots,
        hits: message.hits,
        captureSeconds: message.captureSeconds,
      },
    };
    if (message.welcomeBackBonus > 0) {
      this.#pushFx("toast", "Welcome back! First war of the day", `+${message.welcomeBackBonus} XP bonus`);
    }
  }

  #processMedalUnlock(event: ReturnType<typeof decodeMedalUnlock>): void {
    const identity = medalIdentity(event.category as MedalCategory, event.tier as MedalTier);
    const tierLabel = event.tier === MedalTier.Bronze ? "Bronze" : event.tier === MedalTier.Silver ? "Silver" : "Gold";
    // A ceremony event (not a plain toast): the UI renders the real medallion
    // art with a beat of pause before the reveal, escalating with the tier.
    const id = this.#fxSequence++;
    this.#stats = {
      ...this.#stats,
      fxEvents: [...this.#stats.fxEvents, { id, kind: "ceremony", text: event.name, sub: `${tierLabel} · ${identity?.description ?? ""}`, at: performance.now(), medal: { category: event.category, tier: event.tier } }],
    };
    // Delay the sting so it lands with the medallion reveal, not during the
    // pause beat — same escalating 1/2/3-note cue Phase 7 shipped.
    window.setTimeout(() => { if (!this.#disposed) this.#audio.medalSting(event.tier); }, 350);
  }

  #processClanState(event: ClanStateMessage): ClanDisplay | undefined {
    if (event.clanId === 0) return undefined;
    return {
      clanId: event.clanId,
      name: event.name,
      tag: event.tag,
      founderPlayerId: event.founderPlayerId,
      memberCount: event.memberCount,
      role: event.role,
    };
  }

  #displayName(entityId: number): string {
    const tag = this.#tags.get(entityId);
    const name = this.#names.get(entityId) ?? `Player ${entityId}`;
    return tag === undefined ? name : `[${tag}] ${name}`;
  }

  /**
   * Kill-feed name lookup. The feed is global — snapshot events broadcast to
   * every client — but names arrive via AOI-scoped EntityJoin, so a killer or
   * victim that never entered this client's interest set has no name and
   * "#displayName" would print "Player 40" (reads as a bug; Phase 8e-16's
   * drowning-line spam surfaced it). Unknown entities render as a generic
   * soldier instead.
   */
  #feedName(entityId: number, sentenceStart = false): string {
    const tag = this.#tags.get(entityId);
    const name = this.#names.get(entityId);
    if (name === undefined) return sentenceStart ? "A soldier" : "a soldier";
    return tag === undefined ? name : `[${tag}] ${name}`;
  }

  #highestMedalTier(): { category: number; tier: number } | undefined {
    let best: { category: number; tier: number } | undefined;
    for (const counter of this.#stats.medalState.counters) {
      if ((counter.tier ?? 0) <= 0) continue;
      if (best === undefined || counter.tier > best.tier) best = { category: counter.category, tier: counter.tier };
    }
    return best;
  }

  #processShipEvent(event: ReturnType<typeof decodeShipEvent>): void {
    const vehicle = this.#vehicles.get(event.vehicleEntityId);
    const at = vehicle === undefined
      ? undefined
      : { x: vehicle.renderX || vehicle.current.x, z: vehicle.renderZ || vehicle.current.z };
    if (at !== undefined) {
      if (event.eventType === ShipEventType.HelmClaimed
        || event.eventType === ShipEventType.Gun1Claimed
        || event.eventType === ShipEventType.Gun2Claimed
        || event.eventType === ShipEventType.PassengerBoarded) {
        this.#audio.galleyBoard(at);
      } else if (event.eventType === ShipEventType.HelmReleased
        || event.eventType === ShipEventType.Gun1Released
        || event.eventType === ShipEventType.Gun2Released
        || event.eventType === ShipEventType.PassengerLeft) {
        this.#audio.galleyLeave(at);
      }
    }
    if (event.eventType === ShipEventType.Sunk) {
      if (vehicle !== undefined) vehicle.listingUntil = performance.now() + 8_000;
      this.#pushFx("toast", `${vehicle?.team === Team.Ottoman ? "The Ottoman" : vehicle?.team === Team.Byzantine ? "The Byzantine" : "A"} galley was sunk`, "");
      if (at !== undefined) this.#audio.play("splash-big", { at, volume: 0.6 });
    } else if (event.eventType === ShipEventType.Respawned) {
      if (vehicle !== undefined) {
        vehicle.listingUntil = 0;
        vehicle.hullHp = 1000;
      }
    }
  }

  #processSnapshot(buffer: ArrayBuffer): void {
    const baseTick = buffer.byteLength >= 14 ? new DataView(buffer).getUint32(10, true) : 0;
    const baseline = baseTick === 0 ? undefined : this.#snapshotHistory.get(baseTick);
    const snapshot = decodeSnapshot(buffer, baseline);
    this.#snapshotHistory.set(snapshot.tick, snapshot);
    while (this.#snapshotHistory.size > SNAPSHOT_HISTORY_SIZE) {
      const oldest = this.#snapshotHistory.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.#snapshotHistory.delete(oldest);
    }
    this.#lastSnapshotTick = snapshot.tick;
    this.#stats.tick = snapshot.tick;
    this.#stats.entityCount = snapshot.entities.size;
    const receivedAt = performance.now();
    this.#lastSnapshotReceivedAt = receivedAt;
    const local = snapshot.entities.get(this.#localEntityId);
    if (local !== undefined) {
      // Replay uses the authoritative mount/aura mode from this snapshot.
      this.#stats.mounted = local.mounted ?? false;
      this.#stats.buffed = ((local.flags ?? 0) & PlayerFlag.AuraActive) !== 0;
      this.#stats.flags = local.flags ?? 0;
      this.#reconcileLocal(local, snapshot.tick, snapshot.ackInputSeq);
      this.#stats.health = local.health ?? 0;
      this.#stats.ammo = local.ammo ?? 0;
      this.#stats.reloadTicks = local.reloadTicks ?? 0;
      this.#stats.respawnTicks = local.respawnTicks ?? 0;
      this.#stats.team = local.team ?? this.#stats.team;
      this.#stats.kills = local.kills ?? 0;
      this.#stats.deaths = local.deaths ?? 0;
      this.#stats.assists = local.assists ?? 0;
      this.#stats.playerClass = local.playerClass ?? this.#stats.playerClass;
      this.#stats.horseHp = local.horseHp ?? 0;
      this.#stats.torchOn = (local.torch ?? 0) !== 0;
      this.#pushingCannon = ((local.flags ?? 0) & PlayerFlag.PushingCannon) !== 0;
      this.#manningArtillery = ((local.flags ?? 0) & PlayerFlag.ManningArtillery) !== 0;
      const alive = ((local.flags ?? 0) & PlayerFlag.Alive) !== 0;
      // 8e-13: the queued class is consumed at spawn — sync it from the live
      // class ONLY on the dead→alive edge (#prevAlive updates below). Syncing
      // on every alive snapshot would clobber an ESC-menu pick within 50 ms.
      if (alive && !this.#prevAlive) this.#stats.queuedClass = this.#stats.playerClass;
      const reloadTicks = local.reloadTicks ?? 0;
      const ammo = local.ammo ?? 0;
      // Weapon slots (Phase 8e-3): reconcile the prediction machine against
      // the authoritative state. Death resets to the spawn state (slot 2, no
      // draw); an acked switch the server disagrees with snaps back.
      const serverSlot = local.weaponSlot ?? DEFAULT_WEAPON_SLOT;
      if (!alive) {
        this.#weaponSlots.activeSlot = DEFAULT_WEAPON_SLOT;
        this.#weaponSlots.targetSlot = DEFAULT_WEAPON_SLOT;
        this.#weaponSlots.ticksRemaining = 0;
        this.#pendingSlotSwitch = undefined;
        if (this.#viewmodelSlot !== DEFAULT_WEAPON_SLOT) this.#forceViewmodelSync = true;
      } else if (this.#pendingSlotSwitch !== undefined && snapshot.ackInputSeq >= this.#pendingSlotSwitch.seq) {
        if ((local.weaponSwitchTicks ?? 0) > 0) {
          // The server accepted the press but is still mid-draw — the wire
          // carries the active slot + remaining ticks, not the target, so an
          // ack during the draw always reads the OLD slot. Adopt the server's
          // remaining time and keep our target; both machines flip together.
          this.#weaponSlots.activeSlot = serverSlot;
          this.#weaponSlots.targetSlot = this.#pendingSlotSwitch.toSlot;
          this.#weaponSlots.ticksRemaining = local.weaponSwitchTicks ?? 0;
        } else if (serverSlot !== this.#pendingSlotSwitch.toSlot) {
          // No draw in flight and the slot disagrees: the press was lost or
          // rejected — snap back to the authoritative state.
          this.#weaponSlots.activeSlot = serverSlot;
          this.#weaponSlots.targetSlot = serverSlot;
          this.#weaponSlots.ticksRemaining = 0;
          this.#forceViewmodelSync = true;
        }
        this.#pendingSlotSwitch = undefined;
      } else if (this.#pendingSlotSwitch === undefined && (local.weaponSwitchTicks ?? 0) === 0 && this.#weaponSlots.ticksRemaining === 0 && serverSlot !== this.#weaponSlots.activeSlot) {
        // Settle-heal: no switch awaiting an ack and neither side mid-draw,
        // yet the slots disagree — a press raced the respawn snapshot or its
        // ack edge was missed. Snap to the authoritative slot.
        this.#weaponSlots.activeSlot = serverSlot;
        this.#weaponSlots.targetSlot = serverSlot;
        this.#forceViewmodelSync = true;
      }
      this.#stats.weaponSlot = this.#weaponSlots.activeSlot;
      this.#stats.switchTarget = this.#weaponSlots.ticksRemaining > 0 ? this.#weaponSlots.targetSlot : 0;
      this.#stats.switching = this.#weaponSlots.ticksRemaining > 0;
      const equippedDef = this.#stats.mounted ? WEAPON_DEFS[WeaponType.Saber] : weaponDefAtSlot(this.#stats.playerClass, this.#weaponSlots.activeSlot);
      this.#stats.meleeCooldownFraction = meleeCooldownFraction(this.#meleeReadyAtMs, performance.now(), equippedDef.cooldownSeconds);
      if (alive) {
        // Holstered reloads progress server-side, so cues are gated on the
        // ranged weapon being in hand when the snapshot lands — a completion
        // or stage crossing while holstered plays nothing (Phase 8e-8).
        const reloadFraction = reloadProgressFraction(this.#stats.playerClass, reloadTicks);
        const cue = reloadCueFor(this.#prevReloadTicks, reloadTicks, ammo, equippedDef.kind === "ranged", this.#stats.reloadFraction, reloadFraction);
        if (cue === "start") {
          this.#audio.play("reload-start");
          this.#viewmodel.onReloadStart(reloadTicks / 20);
        } else if (cue === "finish") {
          this.#audio.play("reload-finish");
          // Phase 8e-1 Task 4: READY flash on the reticle + a short bright
          // cue — the reload completion the owner never noticed bottom-left.
          this.#readyFlashUntil = performance.now() + 450;
          this.#audio.readyCue();
        } else if (cue === "pour") this.#audio.reloadPour();
        else if (cue === "ram") this.#audio.reloadRam();
        else if (cue === "click") this.#audio.play("reload-click");
      }
      this.#prevReloadTicks = reloadTicks;
      // Reticle state (Task 4): radial progress from shared tuning and the
      // persistent loaded/unloaded read on the dot itself.
      const reloadFraction = reloadProgressFraction(this.#stats.playerClass, reloadTicks);
      this.#stats.reloadFraction = reloadFraction;
      this.#stats.loaded = alive && ammo > 0;
      if (alive && !this.#prevAlive) {
        this.#viewmodel.onSpawn();
        // Respawn arms the button edge with whatever is currently held: a
        // slot key held through death is not a fresh press — mirrors the
        // server's spawnPlayer prevButtons seeding (review finding fix).
        this.#prevStepButtons = this.#input.buttons;
      }
      this.#prevAlive = alive;
    }
    this.#stats.captureOwner = snapshot.meta.captureOwner;
    this.#stats.captureProgress = snapshot.meta.captureProgress / CAPTURE_MAX_PROGRESS;
    this.#stats.ottomanTickets = snapshot.meta.ottomanTickets;
    this.#stats.byzantineTickets = snapshot.meta.byzantineTickets;
    this.#stats.roundPhase = snapshot.meta.roundPhase;
    this.#stats.phaseRemainingTicks = snapshot.meta.phaseRemainingTicks;
    this.#stats.points = snapshot.meta.points ?? [];
    if (this.#stats.roundPhase !== this.#prevRoundPhase) {
      if (this.#stats.roundPhase === RoundPhase.Victory && !this.#fanfarePlayed) {
        this.#fanfarePlayed = true;
        this.#audio.play("victory-fanfare");
      }
      this.#cameraFeel.setVictory(this.#stats.roundPhase === RoundPhase.Victory);
      this.#prevRoundPhase = this.#stats.roundPhase;
    }
    const points = snapshot.meta.points ?? [];
    const occupancy = CAPTURE_POINTS.map(() => 0);
    for (const [entityId, state] of snapshot.entities) {
      if (entityId === this.#localEntityId || ((state.flags ?? 0) & PlayerFlag.Alive) === 0) continue;
      for (let pointIndex = 0; pointIndex < CAPTURE_POINTS.length; pointIndex += 1) {
        const point = CAPTURE_POINTS[pointIndex];
        if (point === undefined) continue;
        if (Math.hypot((state.x ?? 0) - point.x, (state.z ?? 0) - point.z) <= point.radius) occupancy[pointIndex] = (occupancy[pointIndex] ?? 0) + 1;
      }
    }
    if (this.#localEntityId !== 0 && ((this.#stats.health ?? 0) > 0)) {
      for (let pointIndex = 0; pointIndex < CAPTURE_POINTS.length; pointIndex += 1) {
        const point = CAPTURE_POINTS[pointIndex];
        if (point === undefined) continue;
        if (Math.hypot(this.#localState.x - point.x, this.#localState.z - point.z) <= point.radius) occupancy[pointIndex] = (occupancy[pointIndex] ?? 0) + 1;
      }
    }
    this.#stats.pointOccupancy = occupancy;
    const now = performance.now();
    let captureTickAt: { x: number; z: number } | undefined;
    let captureTakenAt: { x: number; z: number } | undefined;
    if (this.#pointsInitialized) {
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        const point = points[pointIndex];
        if (point === undefined) continue;
        const definition = CAPTURE_POINTS[pointIndex];
        if (definition === undefined) continue;
        const previousProgress = this.#prevPointProgress[pointIndex] ?? 0;
        if (Math.abs(point.progress - previousProgress) > 0.4) captureTickAt = { x: definition.x, z: definition.z };
        const previousOwner = this.#prevPointOwners[pointIndex] ?? Team.None;
        if (point.owner !== Team.None && point.owner !== previousOwner) captureTakenAt = { x: definition.x, z: definition.z };
      }
    }
    this.#pointsInitialized = true;
    this.#prevPointProgress = points.map((point) => point.progress);
    this.#prevPointOwners = points.map((point) => point.owner);
    if (captureTakenAt !== undefined) this.#audio.captureTaken(captureTakenAt);
    if (captureTickAt !== undefined && now >= this.#captureTickAt) {
      this.#captureTickAt = now + 900;
      this.#audio.captureTick(captureTickAt);
    }

    for (const [entityId, state] of snapshot.entities) {
      if (entityId === this.#localEntityId) continue;
      if (state.shipKind === EntityKind.Galley) {
        const vehicle = this.#vehicles.get(entityId) ?? this.#acquireVehicle(entityId);
        if (vehicle !== undefined) this.#storeVehicleState(vehicle, state, receivedAt);
        continue;
      }
      if (state.shipKind === EntityKind.SiegeCannon) {
        const cannon = this.#cannons.get(entityId) ?? this.#acquireCannon(entityId);
        if (cannon !== undefined) this.#storeCannonState(cannon, state, receivedAt);
        continue;
      }
      if (state.shipKind === EntityKind.Horse) {
        const horse = this.#horses.get(entityId) ?? this.#acquireHorse(entityId);
        if (horse !== undefined) this.#storeHorseState(horse, state, receivedAt);
        continue;
      }
      if (state.shipKind === EntityKind.Earthwork) {
        // Tracked for Phase 8c-5 rendering; the collider lives server-side.
        this.#earthworkStates.set(entityId, state);
        continue;
      }
      const remote = this.#remoteEntities.get(entityId) ?? this.#acquireRemote(entityId);
      if (remote !== undefined) this.#storeRemoteState(remote, state, receivedAt);
    }
    this.#stats.scoreboard = Array.from(snapshot.entities.values()).map((state) => {
      const rankInfo = this.#ranks.get(state.entityId);
      return {
        entityId: state.entityId,
        name: this.#names.get(state.entityId) ?? `Player ${state.entityId}`,
        tag: this.#tags.get(state.entityId),
        bot: this.#bots.has(state.entityId),
        team: state.team ?? Team.None,
        kills: state.kills ?? 0,
        deaths: state.deaths ?? 0,
        assists: state.assists ?? 0,
        captureSeconds: state.captureSeconds ?? 0,
        rank: rankInfo?.rank ?? 1,
        prestige: rankInfo?.prestige ?? 0,
        playerClass: state.playerClass ?? this.#classes.get(state.entityId) ?? PlayerClass.None,
      };
    });
    for (const event of snapshot.meta.events) {
      // The server retains each event for several ticks so packet loss cannot
      // erase a shot. Consecutive snapshots therefore carry the same id; only
      // the first copy may produce audio, particles, recoil, hit markers, or
      // visible projectiles.
      if (!this.#combatEvents.accept(event.id)) continue;
      if (event.type === 1) {
        this.#flashUntil.set(event.sourceEntityId, performance.now() + 100);
        // Phase 8e-12: the shooter's rigged character plays its recoil clip
        // (no-op for the local entity and for far/instanced soldiers).
        this.#characters.onFire(event.sourceEntityId, performance.now());
        const sourceState = snapshot.entities.get(event.sourceEntityId);
        // The distant bed is only for reports outside the positional mix. A
        // close firing line must not hear the same shot twice (one-shot plus
        // delayed bed rumble).
        this.#audio.noteFireEvent(sourceState === undefined ? undefined : { x: sourceState.x ?? 0, z: sourceState.z ?? 0 });
        if (sourceState !== undefined) {
          const shotSound = shotSoundForClass(sourceState.playerClass ?? PlayerClass.None);
          this.#spawnBall(sourceState, shotSound === "crossbow", event.sourceEntityId === this.#localEntityId);
          if (event.sourceEntityId === this.#localEntityId) {
            // Own shot on its own audio channel (Phase 8e-1 Task 3): the
            // dedicated own-gunshot gate can never drop it, it's louder and
            // center-panned, and a low synthesized thump sits under it.
            this.#audio.ownShot(shotSound === "crossbow");
            this.#cameraFeel.onFire();
            this.#viewmodel.onFire();
            this.#debugMyShots += 1; // 8e-7 probe counter (dev surface)
            // The one muzzle point light (Task 1), tier-scaled intensity —
            // off entirely on low (the viewmodel sprite still reads there).
            if (shotSound !== "crossbow") this.#muzzleLightT = MUZZLE_LIGHT_SECONDS;
          } else if (shotSound === "crossbow") {
            this.#audio.playCrossbow({ x: sourceState.x ?? 0, z: sourceState.z ?? 0 });
          } else {
            this.#audio.play("gunshot", { at: { x: sourceState.x ?? 0, z: sourceState.z ?? 0 } });
          }
          // Arquebus fire belches powder smoke plus one long-lived haze that
          // builds over a busy firing line; a crossbow only puffs a little
          // string dust. Direction biases the smoke down the barrel line. All
          // of it spawns on the snapshot carrying the fire event — the audio
          // path adds no delay gate on particles.
          const fireYaw = sourceState.yaw ?? 0;
          const dirX = -Math.sin(fireYaw);
          const dirZ = -Math.cos(fireYaw);
          const muzzleX = (sourceState.x ?? 0) + dirX * 0.9;
          const muzzleY = (sourceState.y ?? 0) + 0.65;
          const muzzleZ = (sourceState.z ?? 0) + dirZ * 0.9;
          if (shotSound === "crossbow") {
            this.#particles.burst("impactDust", muzzleX, muzzleY, muzzleZ, 2, dirX, 0.1, dirZ);
          } else {
            // The flash is the first 100 ms (Phase 8e-1 Task 1); the smoke is
            // the after-story. Remote shooters only — the local player's
            // flash is the viewmodel sprite + muzzle light, and a world-space
            // billboard 0.9 m in front of the camera would just be a blob.
            if (event.sourceEntityId !== this.#localEntityId) {
              this.#particles.burst("muzzleFlash", muzzleX, muzzleY, muzzleZ, 1);
            }
            // Own-shot smoke spawns 1.2 m further downrange (8e-9 probe
            // rounds 1–2): the muzzle anchor sits 0.9 m from the eye, and a
            // full-density plume there whites out the lens through the whole
            // reload. Remote shooters keep the anchor exactly at the muzzle.
            const own = event.sourceEntityId === this.#localEntityId;
            const push = own ? 1.2 : 0;
            const smokeX = muzzleX + dirX * push;
            const smokeZ = muzzleZ + dirZ * push;
            // 8e-10 Task 1: 8 → 5 puffs — the restyled powder-grey-brown
            // cloud is smaller and thinner, so it needs fewer particles.
            this.#particles.burst("muzzleSmoke", smokeX, muzzleY, smokeZ, 5, dirX, 0.25, dirZ);
            this.#particles.burst("muzzleHaze", smokeX, muzzleY + 0.3, smokeZ, 1);
            // Phase 8e-9 Task 4: the puff that STAYS after the plume blows
            // downrange — hangs 1.5–2.5 s at the muzzle, own shot included.
            // Tier-scaled count, off on low (MUZZLE_LINGER_COUNT).
            const linger = MUZZLE_LINGER_COUNT[this.#quality];
            if (linger > 0) this.#particles.burst("muzzleLinger", smokeX, muzzleY, smokeZ, linger);
            // Phase 8e-10 Task 1: a small ground-level dust puff at the
            // shooter's feet when firing off bare dirt/grass — the shot
            // kicks the ground up. Stone, wood decks, and water stay clean.
            const standSurface = footstepSurfaceAt(sourceState.x ?? 0, sourceState.z ?? 0);
            if (standSurface === "grass" || standSurface === "dirt") {
              this.#particles.burst("impactDust", sourceState.x ?? 0, 0.07, sourceState.z ?? 0, 2, dirX, 0.4, dirZ);
            }
          }
        }
      }
      if (event.type === CombatEventType.MeleeSwing) {
        // Server emits this for every accepted swing, including misses, and
        // carries the actual visual slot (bots select slot 2 but draw slot 1).
        this.#characters.onMelee(event.sourceEntityId, event.value, performance.now());
      }
      if (event.type === 7) {
        // Emplacement guns only: galley guns emit the same event with their
        // vehicle as target and value 0 (those get #spawnCannonSmoke below) —
        // this also drops the stray effect the old code spawned at
        // emplacement 0 on every galley shot.
        if (event.targetEntityId === 0) {
          this.#spawnShell(event.value, event.sourceEntityId, snapshot.entities.get(event.sourceEntityId));
          const gun = ARTILLERY_EMPLACEMENTS[event.value];
          if (gun !== undefined) {
            const source = snapshot.entities.get(event.sourceEntityId);
            const desiredYaw = source?.yaw ?? gun.yaw;
            const yawDelta = Math.atan2(Math.sin(desiredYaw - gun.yaw), Math.cos(desiredYaw - gun.yaw));
            const aimYaw = gun.yaw + Math.max(-gun.yawArc, Math.min(gun.yawArc, yawDelta));
            this.#audio.play("bombard-fire", { at: { x: gun.x, z: gun.z } });
            this.#particles.burst("driftSmoke", gun.x, 2, gun.z, 6, -Math.sin(aimYaw), 0.5, -Math.cos(aimYaw));
            this.#particles.burst("spark", gun.x, 1.8, gun.z, 8, -Math.sin(aimYaw), 0.6, -Math.cos(aimYaw));
          }
        } else if (event.targetEntityId >= CANNON_ENTITY_BASE) {
          // Mobile siege-cannon shot (siege loop §1.7): the target is the
          // cannon entity and value the cannon gun id (16 + index) — the
          // shell tracks from the cannon's live position/yaw, not a static
          // emplacement transform.
          const cannon = this.#cannons.get(event.targetEntityId);
          if (cannon !== undefined && (cannon.shipState & CANNON_STATE_DESTROYED) === 0) {
            // 8e-19 Task 7: the local player's own shot was already predicted
            // on the Fire edge — spawning again would double the visual. The
            // audio + muzzle smoke below still play (they are event-driven).
            if (this.#shellForGunner(event.sourceEntityId) < 0) {
              const personal = (cannon.shipState & CANNON_STATE_PERSONAL) !== 0;
              this.#trackShell(
                cannon.renderX,
                cannon.renderZ,
                cannon.renderGunYaw,
                event.sourceEntityId,
                cannon.renderGunPitch,
                personal ? PERSONAL_CANNON_PROJECTILE_SPEED : BOMBARD_PROJECTILE_SPEED,
              );
            }
            this.#audio.play("bombard-fire", { at: { x: cannon.renderX, z: cannon.renderZ } });
            const muzzleX = -Math.sin(cannon.renderGunYaw);
            const muzzleZ = -Math.cos(cannon.renderGunYaw);
            this.#particles.burst("driftSmoke", cannon.renderX + muzzleX * 1.6, 1.7, cannon.renderZ + muzzleZ * 1.6, 6, muzzleX, 0.5, muzzleZ);
            this.#particles.burst("spark", cannon.renderX + muzzleX * 1.6, 1.5, cannon.renderZ + muzzleZ * 1.6, 8, muzzleX, 0.6, muzzleZ);
          }
        }
      }
      if (event.type === 8) {
        // Tracked emplacement shell: the burst goes where the shell actually
        // flew (the server event carries no position). Otherwise (galley
        // guns, or the shell pool was full) keep the old 60 m guess. Phase
        // 8e-9 Task 3: #explodeAt owns the full impact payoff for both.
        const shell = this.#shellForGunner(event.sourceEntityId);
        if (shell >= 0) {
          const impactX = this.#shellX[shell] ?? 0;
          const impactY = this.#shellY[shell] ?? 0;
          const impactZ = this.#shellZ[shell] ?? 0;
          this.#shellState[shell] = 0;
          if (this.#breachBoomDue(impactX, impactZ)) this.#audio.play("bombard-impact", { at: { x: impactX, z: impactZ } });
          this.#explodeAt(impactX, impactY, impactZ);
        } else {
          const gunner = snapshot.entities.get(event.sourceEntityId);
          if (gunner !== undefined) {
            const originX = gunner.x ?? 0;
            const originZ = gunner.z ?? 0;
            const directionX = -Math.sin(gunner.yaw ?? 0);
            const directionZ = -Math.cos(gunner.yaw ?? 0);
            const impactX = originX + directionX * 60;
            const impactZ = originZ + directionZ * 60;
            if (this.#breachBoomDue(impactX, impactZ)) this.#audio.play("bombard-impact", { at: { x: impactX, z: impactZ } });
            // 8e-11: the 60 m guess lands on the heightfield, not z=0.
            this.#explodeAt(impactX, heightAt(impactX, impactZ), impactZ);
          }
        }
      }
      if (event.type === 2 && event.sourceEntityId === this.#localEntityId) {
        const headshot = hitEventIsHeadshot(event.value);
        // Keep the red headshot read long enough to distinguish it from a
        // normal hit at 20 Hz snapshots. The old 130/180 ms windows were
        // effectively a single blink on a busy battlefield.
        const markerNow = performance.now();
        this.#hitMarkerUntil = markerNow + 220;
        this.#headshotMarkerUntil = headshot ? markerNow + 320 : 0;
        this.#audio.play("hit-confirm");
        this.#debugMyHits += 1; // 8e-7 probe counter (dev surface)
        // Phase 8e-1 Task 6: damage reply at the world hit point. The Hit
        // event's value IS the post-falloff damage amount (server world.ts
        // emitEvent(CombatEventType.Hit, …, damage)) — real numbers, not a
        // fixed glyph.
        const ownHitTarget = snapshot.entities.get(event.targetEntityId);
        if (ownHitTarget !== undefined && event.value > 0) {
          const slot = this.#floaterCursor;
          this.#floaterCursor = (slot + 1) % DAMAGE_FLOATER_POOL;
          this.#floaterX[slot] = ownHitTarget.x ?? 0;
          this.#floaterY[slot] = (ownHitTarget.y ?? 0) + 1.2;
          this.#floaterZ[slot] = ownHitTarget.z ?? 0;
          this.#floaterAmount[slot] = Math.min(255, decodeHitEventDamage(event.value));
          this.#floaterStart[slot] = performance.now();
        }
      }
      if (event.type === 2) {
        const hitTarget = snapshot.entities.get(event.targetEntityId);
        if (hitTarget !== undefined) {
          this.#particles.burst("impactDust", hitTarget.x ?? 0, (hitTarget.y ?? 0) + 0.9, hitTarget.z ?? 0, 4);
          this.#particles.burst("hitMark", hitTarget.x ?? 0, (hitTarget.y ?? 0) + 1, hitTarget.z ?? 0, 6, 0, 1, 0);
        }
        // Melee impact: the attacker's replicated weapon slot says exactly
        // whether the swing was a blade (8e-3) — the class-guessing heuristic
        // is gone. Butt strokes (ranged slot in hand) stay silent by design.
        const attackerState = snapshot.entities.get(event.sourceEntityId);
        const meleeAttacker = attackerState !== undefined
          && (((attackerState.flags ?? 0) & PlayerFlag.Mounted) !== 0 || (attackerState.weaponSlot ?? DEFAULT_WEAPON_SLOT) !== 2);
        if (meleeAttacker) {
          this.#audio.play("sword-impact", { at: { x: hitTarget?.x ?? 0, z: hitTarget?.z ?? 0 } });
        }
      }
      if (event.type === 2 && event.targetEntityId === this.#localEntityId) {
        const attacker = snapshot.entities.get(event.sourceEntityId);
        if (attacker !== undefined) this.#stats.damageDirection = Math.atan2(attacker.x - this.#localState.x, attacker.z - this.#localState.z);
        this.#damageDirectionUntil = performance.now() + 500;
        this.#cameraFeel.onDamage();
        // ADR 0045: a bullet finding YOUR flesh gets its own wet thud —
        // center-panned, distinct from the positional sword-impact above.
        this.#audio.play("flesh-hit");
      }
      if (event.type === 3) {
        const source = this.#feedName(event.sourceEntityId);
        const target = this.#feedName(event.targetEntityId);
        const sourceState = snapshot.entities.get(event.sourceEntityId);
        const targetState = snapshot.entities.get(event.targetEntityId);
        const sourceRank = this.#ranks.get(event.sourceEntityId) ?? { rank: 1, prestige: 0 };
        const targetRank = this.#ranks.get(event.targetEntityId) ?? { rank: 1, prestige: 0 };
        const sourceTitle = rankTitle(sourceState?.team ?? Team.None, sourceRank.rank);
        const targetTitle = rankTitle(targetState?.team ?? Team.None, targetRank.rank);
        const sourceClass = CLASS_LABELS[sourceState?.playerClass ?? PlayerClass.None] ?? sourceTitle;
        const targetClass = CLASS_LABELS[targetState?.playerClass ?? PlayerClass.None] ?? targetTitle;
        // Authoritative cause from the Death event's value byte (Phase 8c-7) —
        // the flag-guessing heuristic is gone. A drowning is sourceless
        // (entity 0) and renders as a world-style line, not a killer row.
        const cause = killCauseKind(event.value as KillCause);
        const drowning = event.sourceEntityId === 0 || cause === "drowning";
        if (drowning) {
          this.#pushKillFeed(`${this.#feedName(event.targetEntityId, true)} drowned in the Golden Horn`, "drowning");
        } else {
          this.#pushKillFeed(`${sourceClass} ${source} struck down ${targetClass} ${target}`, cause, {
            killerName: source,
            killerTeam: sourceState?.team ?? Team.None,
            killerClassLabel: sourceClass,
            victimName: target,
            victimTeam: targetState?.team ?? Team.None,
            victimClassLabel: targetClass,
            involvesLocal: event.sourceEntityId === this.#localEntityId || event.targetEntityId === this.#localEntityId,
            deemphasized: this.#blockedIds.has(event.sourceEntityId) || this.#blockedIds.has(event.targetEntityId),
          });
        }
        // Phase 8e-10 Task 2: every death reads at distance — a brief dark
        // cloth/dust burst at the victim (no gore, per the visual bible).
        // Drownings slip under quietly and stay clean.
        if (!drowning && targetState !== undefined) {
          this.#particles.burst("killPuff", targetState.x ?? 0, (targetState.y ?? 0) + 0.9, targetState.z ?? 0, 7);
          // ADR 0045: low-gain gore flavor under the kill puff, positional so
          // distant kills stay quiet.
          this.#audio.play("splat-gore", { at: { x: targetState.x ?? 0, z: targetState.z ?? 0 } });
          // Phase 8e-12: the victim's rig plays its clamped death clip and
          // lingers as a corpse (pool-capped; far victims just vanish as before).
          this.#characters.onDeath(
            event.targetEntityId,
            targetState.x ?? 0,
            targetState.y ?? 0,
            targetState.z ?? 0,
            targetState.yaw ?? 0,
            targetState.playerClass ?? this.#classes.get(event.targetEntityId) ?? PlayerClass.None,
            performance.now(),
          );
          // 8e-10 probe hook (dev surface): record, don't allocate — the
          // screenshot probe re-aims the debug camera at the reported victim.
          this.#debugLastKillPuff.x = targetState.x ?? 0;
          this.#debugLastKillPuff.y = (targetState.y ?? 0) + 0.9;
          this.#debugLastKillPuff.z = targetState.z ?? 0;
          this.#debugLastKillPuff.at = performance.now();
        }
        if (!drowning && event.sourceEntityId === this.#localEntityId) {
          this.#killMarkerUntil = performance.now() + 600;
          this.#audio.killSting();
          this.#cameraFeel.onKill();
          // The local player's own-kill payoff notification; its XP total and
          // headshot escalation are correlated from the XpEvent stream in
          // #processXpEvent (same heuristic window as the kill-feed headshot).
          this.#pushFx("ownkill", `${targetClass} down`);
        }
        if (event.targetEntityId === this.#localEntityId) {
          this.#audio.play("death");
          this.#stats.lastDeath = {
            byName: drowning ? "the Golden Horn" : source,
            byClassLabel: drowning ? "The water" : sourceClass,
            kind: cause,
            direction: drowning ? "" : this.#deathDirection(event.sourceEntityId, snapshot),
          };
        } else if (targetState !== undefined) {
          this.#audio.play("death", { at: { x: targetState.x ?? 0, z: targetState.z ?? 0 } });
        }
        // A bladed melee kill lands the distinct sword impact at the victim.
        if (cause === "melee" && targetState !== undefined) {
          this.#audio.play("sword-impact", { at: { x: targetState.x ?? 0, z: targetState.z ?? 0 } });
        }
        if (targetState !== undefined) this.#recordCombatHotspot(targetState.x ?? 0, targetState.z ?? 0);
      }
      if (event.type === 10) {
        const source = this.#displayName(event.sourceEntityId);
        const sourceState = snapshot.entities.get(event.sourceEntityId);
        const sourceClass = CLASS_LABELS[sourceState?.playerClass ?? PlayerClass.None] ?? "Mehter";
        const sourceRank = this.#ranks.get(event.sourceEntityId) ?? { rank: 1, prestige: 0 };
        const title = rankTitle(sourceState?.team ?? Team.None, sourceRank.rank);
        const line = sourceClass === "Priest" ? `${title} ${source} kept the banner flying` : `${title} ${source} kept the drums beating`;
        this.#pushKillFeed(line, "unknown");
      }
      if (event.type === 11) {
        const vehicle = snapshot.entities.get(event.targetEntityId);
        const side = vehicle?.team === Team.Ottoman ? "Ottoman" : "Byzantine";
        this.#pushKillFeed(`The ${side} galley slipped beneath the waves`, "galleygun");
        this.#audio.play("bombard-impact", { at: { x: vehicle?.x ?? 0, z: vehicle?.z ?? 0 } });
      }
      if (event.type === 12) {
        // Siege cannon destroyed (siege loop §1.5): the target is the cannon
        // entity; a Byzantine-held bombard reads as a captured one (§1.6).
        const cannon = this.#cannons.get(event.targetEntityId);
        this.#pushKillFeed(cannon?.team === Team.Byzantine ? "A CAPTURED BOMBARD IS DESTROYED" : "AN OTTOMAN BOMBARD IS DESTROYED", "artillery");
        if (cannon !== undefined) {
          this.#audio.play("bombard-impact", { at: { x: cannon.renderX, z: cannon.renderZ } });
          // Phase 8e-9 Task 3: the same full explosion payoff as a shell
          // impact — a powder store going up should not read smaller than
          // the shell that lit it.
          this.#explodeAt(cannon.renderX, heightAt(cannon.renderX, cannon.renderZ) + 0.4, cannon.renderZ);
        }
      }
      if (event.type === 7) {
        const galley = this.#vehicles.get(event.targetEntityId);
        if (galley !== undefined && (galley.shipState & SHIP_STATE_SUNK) === 0) {
          this.#spawnCannonSmoke(galley.renderX, galley.renderZ, galley.renderYaw);
        }
      }
    }
    // Minimap blips: every entity the client already tracks (the AOI interest
    // set — teammates and enemies alike come from this same set; there is no
    // separate server feed and no omniscient enemy data, per the visual bible's
    // hard anti-wallhack rule).
    const blips: MinimapBlip[] = [];
    for (const remote of this.#remoteEntities.values()) {
      if (!remote.active || !remote.alive || remote.current.receivedAt === 0) continue;
      blips.push({ x: remote.current.x, z: remote.current.z, team: remote.team, ship: false, entityId: remote.entityId });
    }
    for (const vehicle of this.#vehicles.values()) {
      if (!vehicle.active || vehicle.current.receivedAt === 0) continue;
      if ((vehicle.shipState & SHIP_STATE_SUNK) !== 0) continue;
      blips.push({ x: vehicle.current.x, z: vehicle.current.z, team: vehicle.team, ship: true, entityId: vehicle.entityId });
    }
    for (const cannon of this.#cannons.values()) {
      if (!cannon.active || cannon.current.receivedAt === 0) continue;
      if ((cannon.shipState & CANNON_STATE_DESTROYED) !== 0) continue;
      blips.push({ x: cannon.current.x, z: cannon.current.z, team: cannon.team, ship: false, artillery: true, entityId: cannon.entityId });
    }
    this.#stats.blips = blips;
    this.#stats.selfX = this.#localState.x;
    this.#stats.selfZ = this.#localState.z;
    this.#stats.selfYaw = this.#input.yaw;
    // Siege-loop HUD state: cannon states for the objective banner, the
    // contested-front hotspot for the minimap pulse, and the contextual
    // interact hint (push/man/deploy/repair).
    const cannonInfos: CannonStateInfo[] = [];
    for (const cannon of this.#cannons.values()) {
      if (!cannon.active || cannon.current.receivedAt === 0) continue;
      cannonInfos.push({
        entityId: cannon.entityId,
        x: cannon.current.x,
        z: cannon.current.z,
        team: cannon.team,
        state: cannon.shipState,
        hullHp: cannon.hullHp,
        moving: cannon.moving,
      });
    }
    this.#stats.cannons = cannonInfos;
    this.#stats.hotspot = this.#computeHotspot(now);
    this.#stats.interactHint = this.#computeInteractHint();
    this.#stats.killFeed = this.#killFeed.slice(0, 5);
    this.#stats.hitMarker = performance.now() < this.#hitMarkerUntil;
    this.#stats.headshotMarker = performance.now() < this.#headshotMarkerUntil;
    this.#stats.killMarker = performance.now() < this.#killMarkerUntil;
    this.#stats.readyFlash = performance.now() < this.#readyFlashUntil;
    this.#onStats({ ...this.#stats });
    for (const entityId of this.#remoteEntities.keys()) if (!snapshot.entities.has(entityId)) this.#releaseRemote(entityId);
    for (const entityId of this.#horses.keys()) if (!snapshot.entities.has(entityId)) this.#releaseHorse(entityId);
    for (const entityId of this.#earthworkStates.keys()) if (!snapshot.entities.has(entityId)) this.#earthworkStates.delete(entityId);
  }

  #pushKillFeed(line: string, kind: KillFeedKind, participants?: Omit<KillFeedEntry, "id" | "text" | "kind">): void {
    const entry: KillFeedEntry = { id: this.#killFeedSequence++, text: line, kind, ...participants };
    if (this.#killFeed[0]?.text === line) return;
    this.#killFeed.unshift(entry);
    this.#lastKillFeedAt = performance.now();
  }

  // Contested-front tracking (siege loop §3.2): the snapshot event loop and
  // the WallEvent handler drop combat positions here; #computeHotspot snaps
  // the freshest cluster to the nearest objective glyph for the minimap pulse.
  #recordCombatHotspot(x: number, z: number): void {
    this.#combatHot.push({ x, z, at: performance.now() });
    if (this.#combatHot.length > 32) this.#combatHot.shift();
  }

  #computeHotspot(now: number): { x: number; z: number } | null {
    while (this.#combatHot.length > 0 && now - (this.#combatHot[0]?.at ?? 0) > 15_000) this.#combatHot.shift();
    const freshest = this.#combatHot[this.#combatHot.length - 1];
    if (freshest === undefined) return null;
    // Cluster around the freshest event; the centroid is the raw hotspot.
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (const entry of this.#combatHot) {
      if (Math.hypot(entry.x - freshest.x, entry.z - freshest.z) > 40) continue;
      sumX += entry.x;
      sumZ += entry.z;
      count += 1;
    }
    if (count === 0) return null;
    const clusterX = sumX / count;
    const clusterZ = sumZ / count;
    // Snap to the nearest objective glyph: capture points or wall segments.
    let best: { x: number; z: number } | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    const consider = (x: number, z: number): void => {
      const distSq = (x - clusterX) ** 2 + (z - clusterZ) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = { x, z };
      }
    };
    for (const point of CAPTURE_POINTS) consider(point.x, point.z);
    for (const segment of WALL_SEGMENTS) consider(segment.box.x, segment.box.z);
    return best;
  }

  // ArtilleryImpact on a wall segment (siege loop §2.2): an extra stone-chip
  // burst at the impact point so wall hits read differently from ground hits.
  #burstWallChips(x: number, y: number, z: number): void {
    for (const segment of WALL_SEGMENTS) {
      if ((this.#wallStates[segment.id] ?? 0) === WallState.Breached) continue;
      if (Math.abs(x - segment.box.x) > segment.box.width / 2 + 3) continue;
      if (Math.abs(z - segment.box.z) > segment.box.depth / 2 + 3) continue;
      this.#particles.burst("impactDust", x, y + 1.6, z, 8, 0, 1, 0);
      this.#particles.burst("splinter", x, y + 2, z, 6, 0, 1, 0);
      // ADR 0045: a shell striking the curtain reads as a deep structural
      // thud, not just dust — long reach, quiet beyond it.
      this.#audio.play("thud", { at: { x, z } });
      return;
    }
  }

  /** The nearest active, not-destroyed cannon within `radiusSq` of (x, z). */
  #nearestCannon(x: number, z: number, radiusSq: number): RemoteCannon | undefined {
    let nearestCannon: RemoteCannon | undefined;
    let nearestCannonDistSq = radiusSq;
    for (const cannon of this.#cannons.values()) {
      if (!cannon.active || cannon.current.receivedAt === 0) continue;
      if ((cannon.shipState & CANNON_STATE_DESTROYED) !== 0) continue;
      const distSq = (cannon.current.x - x) ** 2 + (cannon.current.z - z) ** 2;
      if (distSq < nearestCannonDistSq) {
        nearestCannonDistSq = distSq;
        nearestCannon = cannon;
      }
    }
    return nearestCannon;
  }

  #vehicleForAboard(x: number, z: number): RemoteVehicle | undefined {
    let nearest: RemoteVehicle | undefined;
    let nearestDistanceSq = 14 * 14;
    for (const vehicle of this.#vehicles.values()) {
      if (!vehicle.active || vehicle.current.receivedAt === 0 || (vehicle.shipState & SHIP_STATE_SUNK) !== 0) continue;
      const distanceSq = (vehicle.current.x - x) ** 2 + (vehicle.current.z - z) ** 2;
      if (distanceSq >= nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearest = vehicle;
    }
    return nearest;
  }

  // Contextual interact prompt (siege loop §1.2/§2.5). Computed at snapshot
  // rate — the prompt is advisory; the server validates every Interact.
  #computeInteractHint(): string {
    if (this.#stats.health <= 0 || this.#stats.respawnTicks > 0) return "";
    const x = this.#localState.x;
    const z = this.#localState.z;
    if (this.#localAboard) return "F — LEAVE THE GALLEY";
    for (const ladder of SIEGE_LADDERS) {
      if (Math.hypot(x - ladder.x, z - ladder.z) <= ladder.radius) return "F — CLIMB THE SIEGE LADDER";
    }
    for (const vehicle of this.#vehicles.values()) {
      if (!vehicle.active || vehicle.current.receivedAt === 0 || (vehicle.shipState & SHIP_STATE_SUNK) !== 0) continue;
      if (Math.hypot(x - vehicle.current.x, z - vehicle.current.z) <= 14) return "F — BOARD THE GALLEY";
    }
    const nearestCannon = this.#nearestCannon(x, z, SIEGE_CANNON_BOARD_RADIUS * SIEGE_CANNON_BOARD_RADIUS);
    if (nearestCannon !== undefined) {
      if (this.#manningArtillery) {
        // Deploy starts on a Fire edge; Interact undeploys or steps off (server-side).
        return (nearestCannon.shipState & (CANNON_STATE_DEPLOYED | CANNON_STATE_DEPLOYING)) !== 0
          ? "F — LOWER & LEAVE THE BOMBARD"
          : "FIRE — DEPLOY THE BOMBARD · F — STEP OFF";
      }
      const artilleryClass = this.#stats.playerClass === PlayerClass.Topcu || this.#stats.playerClass === PlayerClass.WallGunner;
      const gunnerFree = (nearestCannon.shipState & CANNON_STATE_GUNNER) === 0;
      const pushers = (nearestCannon.shipState >> CANNON_STATE_PUSHER_SHIFT) & 0x3;
      const mobile = (nearestCannon.shipState & (CANNON_STATE_DEPLOYED | CANNON_STATE_DEPLOYING)) === 0;
      if (artilleryClass && gunnerFree) return "F — MAN THE BOMBARD";
      if (mobile && pushers < SIEGE_CANNON_MAX_PUSHERS) return "F — PUSH THE BOMBARD";
    }
    // Defender repair: a Byzantine within range of a Damaged segment (§2.5).
    if (this.#stats.team === Team.Byzantine) {
      for (const segment of WALL_SEGMENTS) {
        if ((this.#wallStates[segment.id] ?? 0) !== WallState.Damaged) continue;
        if (Math.abs(x - segment.box.x) > segment.box.width / 2 + WALL_REPAIR_RANGE) continue;
        if (Math.abs(z - segment.box.z) > segment.box.depth / 2 + WALL_REPAIR_RANGE) continue;
        return "F — REPAIR THE WALL";
      }
    }
    return "";
  }

  // Compass-ish direction from the local player toward their killer, relative
  // to the direction the player was facing — used by the death recap.
  #deathDirection(attackerEntityId: number, snapshot: Snapshot): string {
    const attacker = snapshot.entities.get(attackerEntityId);
    if (attacker === undefined) return "";
    const worldAngle = Math.atan2((attacker.x ?? 0) - this.#localState.x, (attacker.z ?? 0) - this.#localState.z);
    const forward = Math.atan2(-Math.sin(this.#localState.yaw), -Math.cos(this.#localState.yaw));
    let relative = worldAngle - forward;
    while (relative > Math.PI) relative -= 2 * Math.PI;
    while (relative < -Math.PI) relative += 2 * Math.PI;
    if (Math.abs(relative) < Math.PI / 4) return "from ahead";
    if (Math.abs(relative) > (3 * Math.PI) / 4) return "from behind";
    return relative > 0 ? "from your left" : "from your right";
  }

  #fillNearbyEarthworkBoxes(x: number, z: number): number {
    let count = 0;
    const radiusSquared = 24 * 24;
    for (const state of this.#earthworkStates.values()) {
      const dx = state.x - x;
      const dz = state.z - z;
      if (dx * dx + dz * dz > radiusSquared) continue;
      const box = this.#earthworkCollisionScratch[count];
      if (box === undefined) break;
      const kind = state.earthworkKind as EarthworkKind | undefined;
      const trench = kind === EarthworkKind.Trench;
      box.x = state.x;
      box.y = state.y;
      box.z = state.z;
      box.width = trench ? EARTHWORK_TRENCH_WIDTH : EARTHWORK_MOUND_WIDTH;
      box.height = trench ? EARTHWORK_TRENCH_HEIGHT : EARTHWORK_MOUND_HEIGHT;
      box.depth = trench ? EARTHWORK_TRENCH_DEPTH : EARTHWORK_MOUND_DEPTH;
      count += 1;
    }
    return count;
  }

  #movementSpeedMultiplierAt(x: number, z: number): number {
    const support = this.#stats.buffed ? SUPPORT_SPEED_MULTIPLIER : 1;
    // Phase 8e-25 (reality pass): the server replicates the Topçu field-gun
    // carry as a player flag so prediction applies the same 0.7× as the
    // authoritative sim — before this, only the server slowed the carrier
    // and every Topçu rubber-banded.
    const carrying = (this.#stats.flags & PlayerFlag.CarryingFieldGun) !== 0;
    const dryFooting = onDeck(x, z) || (z <= WATER_SHORE_Z - WATER_WADE_DEPTH && !inRiver(x, z));
    return support * (dryFooting ? 1 : WATER_WADE_SPEED_MULTIPLIER) * (carrying ? PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER : 1);
  }

  #simulatePredictedMovement(state: Readonly<MovementState>, input: Readonly<MovementInput>, dtSeconds: number): MovementState {
    if (this.#localAboard) {
      return { ...state, velocityX: 0, velocityY: 0, velocityZ: 0, grounded: true, jumpHeld: false };
    }
    const mounted = this.#stats.mounted;
    const speedMultiplier = this.#movementSpeedMultiplierAt(state.x, state.z);
    // Directional slope resistance (Phase 8e-8): foot-only, identical shared
    // function + box list the server uses. The earthwork scratch is filled at
    // the current position and consumed by the probe; the sweep below refills
    // it at the next position.
    const earthworkCount = this.#fillNearbyEarthworkBoxes(state.x, state.z);
    const slopeFactor = mounted
      ? 1
      : slopeSpeedFactorAt(state.x, state.z, state.y - CAPSULE_HEIGHT / 2, input.buttons, input.yaw, SIEGE_BLOCKOUT, this.#wallStates, this.#earthworkCollisionScratch, earthworkCount);
    const next = (mounted ? simulateCavalryMovement : simulateMovement)(state, input, dtSeconds, speedMultiplier * slopeFactor);
    const predictedY = next.y;
    const sweepEarthworkCount = this.#fillNearbyEarthworkBoxes(next.x, next.z);
    const collision = sweepCapsuleAgainstBoxes(
      state,
      next,
      SIEGE_BLOCKOUT,
      this.#wallStates,
      mounted,
      this.#earthworkCollisionScratch,
      sweepEarthworkCount,
      mounted ? CAVALRY_MAX_STEP_UP : MAX_STEP_UP,
    );
    return applyPredictionCollision(next, collision, predictedY);
  }

  #displayAboardState(state: MovementState, now: number): MovementState {
    if (!this.#localAboard || this.#aboardVehicleEntityId === 0) return state;
    const vehicle = this.#vehicles.get(this.#aboardVehicleEntityId);
    if (vehicle === undefined || vehicle.current.receivedAt === 0) return state;
    const from = vehicle.hasPrevious ? vehicle.previous : vehicle.current;
    const to = vehicle.current;
    const alpha = interpolationAlpha(now - INTERPOLATION_DELAY_MS, from.receivedAt, to.receivedAt);
    const vehicleX = lerp(from.x, to.x, alpha);
    const vehicleZ = lerp(from.z, to.z, alpha);
    const vehicleYaw = lerpAngle(from.yaw, to.yaw, alpha);
    return {
      ...state,
      x: vehicleX + Math.cos(vehicleYaw) * this.#aboardOffsetX - Math.sin(vehicleYaw) * this.#aboardOffsetZ,
      y: 1.2,
      z: vehicleZ + Math.sin(vehicleYaw) * this.#aboardOffsetX + Math.cos(vehicleYaw) * this.#aboardOffsetZ,
      yaw: vehicleYaw,
      velocityX: 0,
      velocityY: 0,
      velocityZ: 0,
      grounded: true,
      jumpHeld: false,
    };
  }

  #recordReconciliationError(errorMeters: number): void {
    this.#reconciliationSamples[this.#reconciliationSampleCursor] = errorMeters * 100;
    this.#reconciliationSampleCursor = (this.#reconciliationSampleCursor + 1) % this.#reconciliationSamples.length;
    this.#reconciliationSampleCount = Math.min(this.#reconciliationSamples.length, this.#reconciliationSampleCount + 1);
  }

  #inferGrounded(state: Readonly<MovementState>): boolean {
    if (state.velocityY > 0.1) return false;
    const earthworkCount = this.#fillNearbyEarthworkBoxes(state.x, state.z);
    const collision = sweepCapsuleAgainstBoxes(
      { x: state.x, y: state.y, z: state.z, grounded: true },
      state,
      SIEGE_BLOCKOUT,
      this.#wallStates,
      this.#stats.mounted,
      this.#earthworkCollisionScratch,
      earthworkCount,
      this.#stats.mounted ? CAVALRY_MAX_STEP_UP : MAX_STEP_UP,
    );
    return collision.grounded && Math.abs(collision.y - state.y) <= 0.06;
  }

  #reconcileLocal(authoritative: EntityState, tick: number, ackInputSeq: number): void {
    const authoritativeAboard = ((authoritative.flags ?? 0) & PlayerFlag.Aboard) !== 0;
    if (authoritativeAboard) {
      const vehicle = this.#vehicleForAboard(authoritative.x, authoritative.z);
      const entering = !this.#localAboard;
      if (vehicle !== undefined && this.#aboardVehicleEntityId !== vehicle.entityId) {
        const dx = authoritative.x - vehicle.current.x;
        const dz = authoritative.z - vehicle.current.z;
        const cos = Math.cos(vehicle.current.yaw);
        const sin = Math.sin(vehicle.current.yaw);
        this.#aboardOffsetX = cos * dx + sin * dz;
        this.#aboardOffsetZ = -sin * dx + cos * dz;
        this.#aboardVehicleEntityId = vehicle.entityId;
      }
      this.#localAboard = true;
      this.#localState = {
        x: authoritative.x,
        y: authoritative.y,
        z: authoritative.z,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0,
        yaw: authoritative.yaw,
        pitch: authoritative.pitch,
        grounded: true,
        jumpHeld: false,
      };
      if (entering) this.#correctionSmoother.reset();
      this.#pendingInputs = [];
      this.#predictedBySeq.clear();
      this.#lastAuthoritative = authoritative;
      this.#lastAuthoritativeTick = tick;
      return;
    }
    if (this.#localAboard) {
      this.#localAboard = false;
      this.#aboardVehicleEntityId = 0;
      this.#aboardOffsetX = 0;
      this.#aboardOffsetZ = 0;
      this.#pendingInputs = [];
      this.#predictedBySeq.clear();
      this.#correctionSmoother.reset();
    }
    let velocityX = this.#localState.velocityX;
    let velocityY = this.#localState.velocityY;
    let velocityZ = this.#localState.velocityZ;
    let discontinuity = false;
    if (this.#lastAuthoritative !== undefined && tick > this.#lastAuthoritativeTick) {
      const seconds = (tick - this.#lastAuthoritativeTick) * FIXED_DT_SECONDS;
      const wasAlive = ((this.#lastAuthoritative.flags ?? 0) & PlayerFlag.Alive) !== 0;
      const isAlive = ((authoritative.flags ?? 0) & PlayerFlag.Alive) !== 0;
      discontinuity = wasAlive !== isAlive
        || isAuthoritativeDiscontinuity(this.#lastAuthoritative, authoritative, seconds, CAVALRY_MAX_SPEED);
      if (discontinuity) {
        velocityX = 0;
        velocityY = 0;
        velocityZ = 0;
        this.#correctionSmoother.reset();
      } else {
        velocityX = (authoritative.x - this.#lastAuthoritative.x) / seconds;
        velocityY = (authoritative.y - this.#lastAuthoritative.y) / seconds;
        velocityZ = (authoritative.z - this.#lastAuthoritative.z) / seconds;
      }
    }
    let acknowledgedJumpHeld = this.#localState.jumpHeld;
    for (const input of this.#pendingInputs) {
      if (input.seq > ackInputSeq) break;
      acknowledgedJumpHeld = (input.buttons & InputButton.Jump) !== 0;
    }
    // Agreement path (Phase 8e-6): compare the snapshot against OUR OWN
    // prediction at the acknowledged seq. Inside the wire quantization cell
    // there is no real divergence — rewinding would only inject wire noise
    // (plus inferred-velocity error) into the mirror, the 8e-6 glitch.
    if (!discontinuity) {
      const ackedPrediction = this.#predictedBySeq.get(ackInputSeq);
      if (ackedPrediction !== undefined && withinQuantizationNoise(ackedPrediction, authoritative)) {
        const errorDistance = distance3(ackedPrediction, authoritative);
        this.#recordReconciliationError(errorDistance);
        this.#lastReconcileError = errorDistance;
        this.#reconcileSerial += 1;
        this.#pendingInputs = this.#pendingInputs.filter((input) => input.seq > ackInputSeq);
        for (const seq of this.#predictedBySeq.keys()) {
          if (seq <= ackInputSeq) this.#predictedBySeq.delete(seq);
        }
        this.#lastAuthoritative = authoritative;
        this.#lastAuthoritativeTick = tick;
        return;
      }
    }
    const beforeCorrection = this.#localState;
    const authoritativeState: MovementState = {
      x: authoritative.x,
      y: authoritative.y,
      z: authoritative.z,
      velocityX,
      velocityY,
      velocityZ,
      yaw: authoritative.yaw,
      pitch: authoritative.pitch,
      grounded: false,
      jumpHeld: discontinuity ? false : acknowledgedJumpHeld,
    };
    authoritativeState.grounded = this.#inferGrounded(authoritativeState);
    if (authoritativeState.grounded) authoritativeState.velocityY = 0;
    const result = reconcilePrediction(this.#localState, authoritativeState, ackInputSeq, this.#pendingInputs, 0.02, this.#predictionSimulator);
    this.#recordReconciliationError(result.errorDistance);
    this.#lastReconcileError = result.errorDistance;
    this.#reconcileSerial += 1;
    if (result.errorDistance > 0.001) this.#correctionSmoother.preserveBeforeCorrection(beforeCorrection, result.state);
    this.#localState = result.state;
    this.#pendingInputs = result.pending;
    // Re-seed the prediction history from the post-rewind lineage — states
    // descending from the pre-rewind base are stale.
    this.#predictedBySeq.clear();
    for (const [seq, replayedState] of replayPendingBySeq(authoritativeState, result.pending, this.#predictionSimulator)) {
      this.#predictedBySeq.set(seq, replayedState);
    }
    if (result.corrected) this.#corrections += 1;
    this.#lastAuthoritative = authoritative;
    this.#lastAuthoritativeTick = tick;
  }

  #fixedPredictionStep(): void {
    if (this.#localEntityId === 0) return;
    this.#inputSequence = (this.#inputSequence + 1) >>> 0;
    const drive = this.#driveOverride;
    const input: PendingInput = {
      seq: this.#inputSequence,
      buttons: drive?.buttons ?? this.#input.buttons,
      yaw: drive?.yaw ?? this.#input.yaw,
      pitch: drive?.pitch ?? this.#input.pitch,
      dtSeconds: FIXED_DT_SECONDS,
    };
    this.#localState = this.#simulatePredictedMovement(this.#localState, input, FIXED_DT_SECONDS);
    this.#predictedBySeq.set(input.seq, this.#localState);
    // Weapon slots: same machine, same button stream as the server (8e-3) —
    // prediction parity by construction, reconciled on snapshot acks. The
    // server only steps the machine for the living (world.ts skips dead
    // slots), so the prediction freezes too while dead; the fresh-press edge
    // is re-armed on the respawn transition in the snapshot handler.
    const switchStarted = this.#prevAlive ? stepWeaponSlots(this.#weaponSlots, input.buttons, this.#prevStepButtons) : 0;
    this.#prevStepButtons = input.buttons;
    if (switchStarted !== 0) this.#pendingSlotSwitch = { seq: input.seq, toSlot: switchStarted };
    this.#pendingInputs.push(input);
    if (this.#pendingInputs.length > 128) {
      const dropped = this.#pendingInputs.splice(0, this.#pendingInputs.length - 128);
      for (const stale of dropped) this.#predictedBySeq.delete(stale.seq);
    }
    this.#send(encodeInput({
      seq: input.seq,
      lastSnapshotTick: this.#lastSnapshotTick,
      buttons: input.buttons,
      yaw: input.yaw,
      pitch: input.pitch,
      dtMs: FIXED_DT_MS,
    }));
  }

  #renderRemoteEntities(now: number): void {
    const renderTime = now - INTERPOLATION_DELAY_MS;
    this.#camera.updateMatrixWorld();
    this.#projectionMatrix.multiplyMatrices(this.#camera.projectionMatrix, this.#camera.matrixWorldInverse);
    this.#frustum.setFromProjectionMatrix(this.#projectionMatrix);
    const context = this.#nameContext;
    const width = this.#container.clientWidth || window.innerWidth;
    const height = this.#container.clientHeight || window.innerHeight;
    context.clearRect(0, 0, width, height);
    context.font = "600 12px 'Alegreya Sans', system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillStyle = "rgba(255,255,255,0.9)";
    context.shadowColor = "rgba(0,0,0,0.85)";
    context.shadowBlur = 3;
    context.globalAlpha = 1;
    this.#soldierCounts.fill(0);
    this.#seatedSoldierCounts.fill(0);
    this.#characters.beginFrame(this.#camera.position.x, this.#camera.position.z);
    this.#animatedHorses.beginFrame();
    this.#nameplateLayout.reset();
    let horseCount = 0;
    let galleyCount = 0;
    let galleyGunCount = 0;
    let visibleCount = 0;
    this.#chantNearby = false;
    this.#nearGalley = false;
    let nearestGalleyDistanceSq = Infinity;
    for (const remote of this.#remoteEntities.values()) {
      if (!remote.active || !remote.alive || remote.current.receivedAt === 0) continue;
      const dx = remote.current.x - this.#camera.position.x;
      const dz = remote.current.z - this.#camera.position.z;
      // Low tier skips the expensive near-rig eligibility band sooner. It
      // still keeps the far instanced silhouette, but avoids interpolation and
      // animation work for soldiers that are already too small to read.
      const nearRadius = this.#quality === "low" ? 42 : this.#quality === "medium" ? 54 : 60;
      const near = dx * dx + dz * dz <= nearRadius * nearRadius;
      if (near) {
        const from = remote.hasPrevious ? remote.previous : remote.current;
        const to = remote.current;
        const alpha = interpolationAlpha(renderTime, from.receivedAt, to.receivedAt);
        remote.renderX = lerp(from.x, to.x, alpha);
        remote.renderY = lerp(from.y, to.y, alpha);
        remote.renderZ = lerp(from.z, to.z, alpha);
        remote.renderYaw = lerpAngle(from.yaw, to.yaw, alpha);
        // Phase 8e-10 Task 3: the old 0.35 m-per-snapshot "moved" gate only
        // fired near full speed — walking soldiers were silent. Cadence now
        // follows interpolated ground speed, same stride math as the local
        // player, and the surface comes from the worn-road-aware classifier.
        // 8e-19: walk-only, so the run sample flag is always false.
        const stepDistance = remote.hasPrevious ? Math.hypot(remote.renderX - from.x, remote.renderZ - from.z) : 0;
        const stepSpeed = (stepDistance * 1_000) / Math.max(1, to.receivedAt - from.receivedAt);
        if (stepSpeed > 0.5 && remote.alive && !(remote.current.mounted ?? false) && now >= remote.lastFootstepAt) {
          remote.lastFootstepAt = now + footstepIntervalSeconds(stepSpeed) * 1_000;
          this.#playFootstep(footstepSurfaceAt(remote.renderX, remote.renderZ), { x: remote.renderX, z: remote.renderZ }, stepSpeed >= FOOTSTEP_RUN_MIN_SPEED);
        }
      } else if (now >= remote.nextFarUpdateAt) {
        remote.renderX = remote.current.x;
        remote.renderY = remote.current.y;
        remote.renderZ = remote.current.z;
        remote.renderYaw = remote.current.yaw;
        remote.nextFarUpdateAt = now + 200;
      }
      this.#frustumPoint.set(remote.renderX, remote.renderY + 0.4, remote.renderZ);
      if (!this.#frustum.containsPoint(this.#frustumPoint)) continue;
      const mounted = remote.current.mounted ?? false;
      const movementDuration = Math.max(1, remote.current.receivedAt - remote.previous.receivedAt);
      const movementSpeed = remote.hasPrevious
        ? Math.hypot(remote.current.x - remote.previous.x, remote.current.z - remote.previous.z) * 1_000 / movementDuration
        : 0;
      const gallopAmount = mounted ? Math.min(1, movementSpeed / CAVALRY_MAX_SPEED) : 0;
      const gallopPhase = now * 0.014 + remote.entityId * 0.37;
      const gallopBob = Math.sin(gallopPhase) * 0.035 * gallopAmount;
      this.#instanceTransform.position.set(
        remote.renderX,
        remote.renderY + (mounted ? MOUNTED_RIDER_CENTER_OFFSET + gallopBob : 0),
        remote.renderZ,
      );
      this.#instanceTransform.rotation.set(0, remote.renderYaw, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      const remoteClass = this.#classes.get(remote.entityId) ?? PlayerClass.None;
      const flash = (this.#flashUntil.get(remote.entityId) ?? 0) > now;
      const artilleryHands = ((remote.current.flags ?? 0) & (PlayerFlag.ManningArtillery | PlayerFlag.PushingCannon)) !== 0;
      // Rigged characters draw foot soldiers — skinned rigs near, baked pose
      // batches far. Mounted cavalry uses the same faction/class asset with a
      // post-mixer seated lower-body pose and the correct slot-1 blade.
      const drawnByCharacters = !this.#legacySoldiers && this.#characters.offer({
        entityId: remote.entityId,
        playerClass: remoteClass,
        x: remote.renderX,
        y: remote.renderY + (mounted ? MOUNTED_RIG_Y_OFFSET : 0),
        z: remote.renderZ,
        yaw: remote.renderYaw,
        speed: mounted ? 0 : movementSpeed,
        // Artillery crew operate the carriage with empty hands. In
        // particular, the Topçu must never keep a rifle welded to the wrist
        // while aiming, firing, or pushing a cannon.
        weaponSlot: mounted ? 1 : artilleryHands ? 0 : (remote.current.weaponSlot ?? DEFAULT_WEAPON_SLOT),
        near,
        distanceSq: dx * dx + dz * dz,
        flash,
        mounted,
      }, now);
      if (!drawnByCharacters) {
        const batchClass = remoteClass !== PlayerClass.None && this.#soldierInstances.has(remoteClass)
          ? remoteClass
          : remote.team === Team.Byzantine ? PlayerClass.Guardsman : PlayerClass.Janissary;
        const counts = mounted ? this.#seatedSoldierCounts : this.#soldierCounts;
        const instances = (mounted ? this.#seatedSoldierInstances : this.#soldierInstances).get(batchClass);
        if (instances !== undefined) {
          const instanceIndex = counts[batchClass] ?? 0;
          counts[batchClass] = instanceIndex + 1;
          instances.setMatrixAt(instanceIndex, this.#instanceTransform.matrix);
          instances.setColorAt(instanceIndex, flash ? this.#flashColor : this.#whiteColor);
        }
      }
      if (remoteClass === PlayerClass.Priest && Math.hypot(remote.renderX - this.#camera.position.x, remote.renderZ - this.#camera.position.z) <= SUPPORT_AURA_RADIUS + 2) this.#chantNearby = true;
      visibleCount += 1;
      if (mounted) {
        const horseGroundY = remote.renderY - GROUND_CENTER_Y + 0.05;
        const animated = this.#animatedHorses.offer({
          entityId: remote.entityId,
          x: remote.renderX,
          y: horseGroundY,
          z: remote.renderZ,
          yaw: remote.renderYaw,
          speed: movementSpeed,
          distanceSq: dx * dx + dz * dz,
        });
        if (!animated) {
          this.#instanceTransform.position.set(remote.renderX, horseGroundY + gallopBob, remote.renderZ);
          this.#instanceTransform.rotation.set(Math.sin(gallopPhase * 2) * 0.018 * gallopAmount, remote.renderYaw, 0);
          this.#instanceTransform.scale.set(1, 1, 1);
          this.#instanceTransform.updateMatrix();
          this.#horseInstances.setMatrixAt(horseCount, this.#instanceTransform.matrix);
          horseCount += 1;
        }
      }
      if (near) {
        this.#labelPoint.set(remote.renderX, remote.renderY + (mounted ? 2.05 : 1.35), remote.renderZ).project(this.#camera);
        if (this.#labelPoint.z >= -1 && this.#labelPoint.z <= 1) {
          const screenX = (this.#labelPoint.x * 0.5 + 0.5) * width;
          const screenY = (-this.#labelPoint.y * 0.5 + 0.5) * height;
          this.#nameplateLayout.consider(remote.entityId, dx * dx + dz * dz, screenX, screenY);
        }
      }
    }
    // Riderless horses are replicated world props. Nearby ones use the same
    // prepared Meshy rig as cavalry; far/Low/saturated/load-failure cases stay
    // in the cheap static instance batch.
    for (const horse of this.#horses.values()) {
      if (!horse.active || horse.current.receivedAt === 0 || horseCount >= RENDER_INSTANCE_CAPACITY) continue;
      const from = horse.hasPrevious ? horse.previous : horse.current;
      const to = horse.current;
      const alpha = interpolationAlpha(renderTime, from.receivedAt, to.receivedAt);
      horse.renderX = lerp(from.x, to.x, alpha);
      horse.renderZ = lerp(from.z, to.z, alpha);
      const groundY = heightAt(horse.renderX, horse.renderZ);
      const horseYaw = lerpAngle(from.yaw, to.yaw, alpha);
      const horseDx = horse.renderX - this.#camera.position.x;
      const horseDz = horse.renderZ - this.#camera.position.z;
      const animated = this.#animatedHorses.offer({
        entityId: horse.entityId,
        x: horse.renderX,
        y: groundY + 0.05,
        z: horse.renderZ,
        yaw: horseYaw,
        speed: 0,
        distanceSq: horseDx * horseDx + horseDz * horseDz,
      });
      if (!animated) {
        const idlePhase = now * 0.0015 + horse.entityId * 0.19;
        this.#instanceTransform.position.set(horse.renderX, groundY + 0.05 + Math.sin(idlePhase) * 0.008, horse.renderZ);
        this.#instanceTransform.rotation.set(0, horseYaw, 0);
        this.#instanceTransform.scale.set(1, 1, 1);
        this.#instanceTransform.updateMatrix();
        this.#horseInstances.setMatrixAt(horseCount, this.#instanceTransform.matrix);
        this.#horseInstances.setColorAt(horseCount, horse.team === Team.Byzantine ? this.#byzantineTint : this.#ottomanTint);
        horseCount += 1;
      }
      visibleCount += 1;
    }
    if (this.#cameraThirdPerson && this.#stats.health > 0 && this.#stats.respawnTicks === 0) {
      const localClass = this.#stats.playerClass !== PlayerClass.None && this.#soldierInstances.has(this.#stats.playerClass)
        ? this.#stats.playerClass
        : this.#stats.team === Team.Byzantine ? PlayerClass.Guardsman : PlayerClass.Janissary;
      const mounted = this.#stats.mounted;
      const speed = Math.hypot(this.#localState.velocityX, this.#localState.velocityZ);
      const gallopAmount = mounted ? Math.min(1, speed / CAVALRY_MAX_SPEED) : 0;
      const gallopPhase = now * 0.014 + this.#localEntityId * 0.37;
      const gallopBob = Math.sin(gallopPhase) * 0.035 * gallopAmount;
      this.#instanceTransform.position.set(
        this.#localRenderX,
        this.#localRenderY + (mounted ? MOUNTED_RIDER_CENTER_OFFSET + gallopBob : 0),
        this.#localRenderZ,
      );
      this.#instanceTransform.rotation.set(0, this.#localRenderYaw, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      const localDrawnByCharacters = !this.#legacySoldiers && this.#characters.offer({
        entityId: this.#localEntityId,
        playerClass: localClass,
        x: this.#localRenderX,
        y: this.#localRenderY + (mounted ? MOUNTED_RIG_Y_OFFSET : 0),
        z: this.#localRenderZ,
        yaw: this.#localRenderYaw,
        speed: mounted ? 0 : speed,
        weaponSlot: mounted ? 1 : (this.#stats.weaponSlot ?? DEFAULT_WEAPON_SLOT),
        near: true,
        distanceSq: Math.hypot(this.#localRenderX - this.#camera.position.x, this.#localRenderZ - this.#camera.position.z) ** 2,
        flash: false,
        mounted,
      }, now);
      if (!localDrawnByCharacters) {
        const counts = mounted ? this.#seatedSoldierCounts : this.#soldierCounts;
        const instances = (mounted ? this.#seatedSoldierInstances : this.#soldierInstances).get(localClass);
        if (instances !== undefined) {
          const instanceIndex = counts[localClass] ?? 0;
          counts[localClass] = instanceIndex + 1;
          instances.setMatrixAt(instanceIndex, this.#instanceTransform.matrix);
          instances.setColorAt(instanceIndex, this.#whiteColor);
        }
      }
      if (mounted) {
        const horseGroundY = this.#localRenderY - GROUND_CENTER_Y + 0.05;
        const localHorseDx = this.#localRenderX - this.#camera.position.x;
        const localHorseDz = this.#localRenderZ - this.#camera.position.z;
        const animated = this.#animatedHorses.offer({
          entityId: this.#localEntityId,
          x: this.#localRenderX,
          y: horseGroundY,
          z: this.#localRenderZ,
          yaw: this.#localRenderYaw,
          speed,
          distanceSq: localHorseDx * localHorseDx + localHorseDz * localHorseDz,
        });
        if (!animated) {
          this.#instanceTransform.position.set(this.#localRenderX, horseGroundY + gallopBob, this.#localRenderZ);
          this.#instanceTransform.rotation.set(Math.sin(gallopPhase * 2) * 0.018 * gallopAmount, this.#localRenderYaw, 0);
          this.#instanceTransform.updateMatrix();
          this.#horseInstances.setMatrixAt(horseCount, this.#instanceTransform.matrix);
          horseCount += 1;
        }
      }
    }
    for (const [playerClass, instances] of this.#soldierInstances) {
      instances.count = this.#soldierCounts[playerClass] ?? 0;
      instances.instanceMatrix.needsUpdate = true;
      if (instances.instanceColor !== null) instances.instanceColor.needsUpdate = true;
    }
    for (const [playerClass, instances] of this.#seatedSoldierInstances) {
      instances.count = this.#seatedSoldierCounts[playerClass] ?? 0;
      instances.instanceMatrix.needsUpdate = true;
      if (instances.instanceColor !== null) instances.instanceColor.needsUpdate = true;
    }
    this.#drawNameplates(context);
    this.#drawDamageFloaters(context, width, height, now);
    for (const vehicle of this.#vehicles.values()) {
      if (!vehicle.active || vehicle.current.receivedAt === 0) continue;
      const from = vehicle.hasPrevious ? vehicle.previous : vehicle.current;
      const to = vehicle.current;
      const alpha = interpolationAlpha(renderTime, from.receivedAt, to.receivedAt);
      vehicle.renderX = lerp(from.x, to.x, alpha);
      vehicle.renderZ = lerp(from.z, to.z, alpha);
      vehicle.renderYaw = lerpAngle(from.yaw, to.yaw, alpha);
      vehicle.renderGun1Yaw = lerpAngle(from.shipGun1Yaw ?? vehicle.renderYaw + Math.PI / 2, to.shipGun1Yaw ?? vehicle.renderYaw + Math.PI / 2, alpha);
      vehicle.renderGun2Yaw = lerpAngle(from.shipGun2Yaw ?? vehicle.renderYaw - Math.PI / 2, to.shipGun2Yaw ?? vehicle.renderYaw - Math.PI / 2, alpha);
      if (Math.hypot(vehicle.renderX - this.#camera.position.x, vehicle.renderZ - this.#camera.position.z) <= 70) this.#nearGalley = true;
      const galleyDistanceSq = (vehicle.renderX - this.#camera.position.x) ** 2 + (vehicle.renderZ - this.#camera.position.z) ** 2;
      if (galleyDistanceSq < nearestGalleyDistanceSq) {
        nearestGalleyDistanceSq = galleyDistanceSq;
        this.#nearGalleyX = vehicle.renderX;
        this.#nearGalleyZ = vehicle.renderZ;
      }
      const sinking = now < (vehicle.listingUntil ?? 0);
      const tilt = sinking ? Math.min(1, ((vehicle.listingUntil ?? now) - now) / 8_000) : 0;
      this.#instanceTransform.position.set(vehicle.renderX, sinking ? -tilt * 1.4 : 0, vehicle.renderZ);
      this.#instanceTransform.rotation.set(sinking ? tilt * 0.5 : 0, vehicle.renderYaw, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      this.#galleyHulls.setMatrixAt(galleyCount, this.#instanceTransform.matrix);
      this.#galleyHulls.setColorAt(galleyCount, vehicle.team === Team.Ottoman ? this.#ottomanTint : this.#byzantineTint);
      galleyCount += 1;
      const shipCos = Math.cos(vehicle.renderYaw);
      const shipSin = Math.sin(vehicle.renderYaw);
      // Phase 8e-25: the two gun sockets are fixed local x-offsets — hoisted
      // so the render loop no longer allocates an array per galley per frame.
      const gunX0 = vehicle.renderX + shipCos * (GALLEY_GUN_LOCAL_X[0] ?? 0);
      const gunX1 = vehicle.renderX + shipCos * (GALLEY_GUN_LOCAL_X[1] ?? 0);
      for (let gunSlot = 0; gunSlot < GALLEY_GUN_LOCAL_X.length; gunSlot += 1) {
        if (galleyGunCount >= MAX_VEHICLES * 2) break;
        const gunX = gunSlot === 0 ? gunX0 : gunX1;
        const gunYaw = gunSlot === 0 ? vehicle.renderGun1Yaw : vehicle.renderGun2Yaw;
        const gunZ = vehicle.renderZ + shipSin * (GALLEY_GUN_LOCAL_X[gunSlot] ?? 0);
        this.#instanceTransform.position.set(gunX, 0.88, gunZ);
        this.#instanceTransform.rotation.set(0, gunYaw, sinking ? 0.5 : 0);
        this.#instanceTransform.scale.set(1, 1, 1);
        this.#instanceTransform.updateMatrix();
        this.#galleyGunInstances.setMatrixAt(galleyGunCount, this.#instanceTransform.matrix);
        this.#galleyGunInstances.setColorAt(galleyGunCount, vehicle.team === Team.Ottoman ? this.#ottomanTint : this.#byzantineTint);
        galleyGunCount += 1;
      }
      if (now >= vehicle.lastWakeAt && !sinking) {
        vehicle.lastWakeAt = now + 420;
        const wake = this.#spawnWake(vehicle.renderX, vehicle.renderZ);
        if (wake !== undefined) this.#wakePuffs.push(wake);
      }
      this.#labelPoint.set(vehicle.renderX, 4.6, vehicle.renderZ).project(this.#camera);
      if (this.#labelPoint.z >= -1 && this.#labelPoint.z <= 1) {
        const screenX = (this.#labelPoint.x * 0.5 + 0.5) * width;
        const screenY = (-this.#labelPoint.y * 0.5 + 0.5) * height;
        context.fillStyle = this.#palette.nameLabel[vehicle.team] ?? "#ef867a";
        context.fillText(this.#names.get(vehicle.entityId) ?? "Galley", screenX, screenY);
        const helm = (vehicle.shipState & SHIP_STATE_HELM) !== 0 ? 1 : 0;
        const guns = ((vehicle.shipState & SHIP_STATE_GUN1) !== 0 ? 1 : 0) + ((vehicle.shipState & SHIP_STATE_GUN2) !== 0 ? 1 : 0);
        const passengers = (vehicle.shipState >> SHIP_STATE_PASSENGER_SHIFT) & 0xf;
        context.fillStyle = "rgba(255,255,255,0.85)";
        context.fillText(`crew ${helm + guns + passengers}/7 · ${vehicle.hullHp}`, screenX, screenY - 12);
      }
    }
    this.#galleyHulls.count = galleyCount;
    this.#galleyHulls.instanceMatrix.needsUpdate = true;
    if (this.#galleyHulls.instanceColor !== null) this.#galleyHulls.instanceColor.needsUpdate = true;
    this.#galleyGunInstances.count = galleyGunCount;
    this.#galleyGunInstances.instanceMatrix.needsUpdate = true;
    if (this.#galleyGunInstances.instanceColor !== null) this.#galleyGunInstances.instanceColor.needsUpdate = true;
    // Siege cannons: interpolated like vehicles, with separate heavy and
    // personal carriage batches. Destroyed guns render as a tilted, darkened wreck until the
    // server respawns them; damaged guns smoke below 40% HP (siege loop §1.7).
    let cannonCount = 0;
    let personalCannonCount = 0;
    for (const cannon of this.#cannons.values()) {
      if (!cannon.active || cannon.current.receivedAt === 0) continue;
      const from = cannon.hasPrevious ? cannon.previous : cannon.current;
      const to = cannon.current;
      const alpha = interpolationAlpha(renderTime, from.receivedAt, to.receivedAt);
      cannon.renderX = lerp(from.x, to.x, alpha);
      cannon.renderZ = lerp(from.z, to.z, alpha);
      cannon.renderYaw = lerpAngle(from.yaw, to.yaw, alpha);
      cannon.renderGunYaw = lerpAngle(from.cannonGunYaw ?? from.yaw, to.cannonGunYaw ?? to.yaw, alpha);
      cannon.renderGunPitch = lerp(from.cannonGunPitch ?? 0.3, to.cannonGunPitch ?? 0.3, alpha);
      const destroyed = (cannon.shipState & CANNON_STATE_DESTROYED) !== 0;
      const lowHp = cannon.hullHp < ((cannon.shipState & CANNON_STATE_PERSONAL) !== 0 ? PERSONAL_CANNON_HP : SIEGE_CANNON_HP) * 0.4;
      // 8e-11: carriages ride the heightfield (the server's cannon entity y
      // is the same heightAt sample, so interpolation stays glued to ground).
      const cannonGroundY = heightAt(cannon.renderX, cannon.renderZ);
      const personal = (cannon.shipState & CANNON_STATE_PERSONAL) !== 0;
      this.#instanceTransform.position.set(cannon.renderX, cannonGroundY + (destroyed ? -0.2 : 0), cannon.renderZ);
      // A deployed piece traverses its tube independently of the carriage.
      // The generated bombard is a single flattened mesh, so the visible
      // carriage follows the authoritative gun bearing while firing; this
      // keeps the muzzle and the replicated shell on the same line instead of
      // leaving a barrel visibly aimed at the old carriage heading.
      const gunner = (cannon.shipState & CANNON_STATE_GUNNER) !== 0;
      const visualYaw = !destroyed && gunner ? cannon.renderGunYaw : cannon.renderYaw;
      this.#instanceTransform.rotation.set(0, visualYaw, destroyed ? 0.38 : 0);
      this.#instanceTransform.scale.set(personal ? 0.72 : 1, personal ? 0.72 : 1, personal ? 0.72 : 1);
      this.#instanceTransform.updateMatrix();
      const instances = personal ? this.#personalCannonCarriages : this.#cannonCarriages;
      const instanceIndex = personal ? personalCannonCount : cannonCount;
      instances.setMatrixAt(instanceIndex, this.#instanceTransform.matrix);
      // Generated artillery keeps its own atlas; the instance tint is white
      // in the healthy state and only darkens damaged/destroyed guns.
      this.#cannonTint.copy(this.#whiteColor);
      if (destroyed) this.#cannonTint.multiplyScalar(0.45);
      else if (lowHp) this.#cannonTint.multiplyScalar(0.7);
      instances.setColorAt(instanceIndex, this.#cannonTint);
      if (personal) personalCannonCount += 1;
      else cannonCount += 1;
      if ((destroyed || lowHp) && now >= cannon.lastSmokeAt) {
        cannon.lastSmokeAt = now + (destroyed ? 900 : 650);
        this.#particles.burst("driftSmoke", cannon.renderX, cannonGroundY + 1.3, cannon.renderZ, destroyed ? 2 : 1);
      }
      this.#labelPoint.set(cannon.renderX, cannonGroundY + 2.4, cannon.renderZ).project(this.#camera);
      if (this.#labelPoint.z >= -1 && this.#labelPoint.z <= 1) {
        const screenX = (this.#labelPoint.x * 0.5 + 0.5) * width;
        const screenY = (-this.#labelPoint.y * 0.5 + 0.5) * height;
        context.fillStyle = this.#palette.nameLabel[cannon.team] ?? "#ef867a";
        context.fillText(this.#names.get(cannon.entityId) ?? (personal ? "Field gun" : "Bombard"), screenX, screenY);
        const gunner = (cannon.shipState & CANNON_STATE_GUNNER) !== 0 ? 1 : 0;
        const pushers = (cannon.shipState >> CANNON_STATE_PUSHER_SHIFT) & 0x3;
        const mode = destroyed ? "wrecked" : (cannon.shipState & CANNON_STATE_DEPLOYED) !== 0 ? "deployed" : (cannon.shipState & CANNON_STATE_DEPLOYING) !== 0 ? "deploying" : "limbered";
        context.fillStyle = "rgba(255,255,255,0.85)";
        context.fillText(destroyed ? mode : `${mode} · crew ${gunner + pushers}/3 · ${cannon.hullHp}`, screenX, screenY - 12);
      }
    }
    this.#cannonCarriages.count = cannonCount;
    this.#cannonCarriages.instanceMatrix.needsUpdate = true;
    if (this.#cannonCarriages.instanceColor !== null) this.#cannonCarriages.instanceColor.needsUpdate = true;
    this.#personalCannonCarriages.count = personalCannonCount;
    this.#personalCannonCarriages.instanceMatrix.needsUpdate = true;
    if (this.#personalCannonCarriages.instanceColor !== null) this.#personalCannonCarriages.instanceColor.needsUpdate = true;
    for (let index = this.#wakePuffs.length - 1; index >= 0; index -= 1) {
      const puff = this.#wakePuffs[index];
      if (puff !== undefined && puff.until <= now) {
        this.#scene.remove(puff.mesh);
        puff.mesh.geometry.dispose();
        (puff.mesh.material as THREE.Material).dispose();
        this.#wakePuffs.splice(index, 1);
      }
    }
    this.#horseInstances.count = horseCount;
    this.#horseInstances.instanceMatrix.needsUpdate = true;
    this.#stats.visibleEntityCount = visibleCount;
    for (let index = this.#effects.length - 1; index >= 0; index -= 1) {
      const effect = this.#effects[index];
      if (effect !== undefined && effect.until <= now) { this.#scene.remove(effect.object); this.#effects.splice(index, 1); }
    }
    if (this.#nameplateMedals) this.#drawSelfNameplate(width, height);
  }

  // Gallop hooves and torch crackle loops (Phase 8c-6), local + nearest-N
  // remotes. Runs every frame; the engine fades loops in/out, and the loop
  // start/stop edges drive the torch ignite/extinguish transients.
  /**
   * One footstep: every surface maps to its manifest sample (dirt got a real
   * CC0 sample in ADR 0045, replacing the 8e-10 synth), grass switching
   * walk/run by speed.
   */
  #playFootstep(surface: FootstepSurface, at: { x: number; z: number } | undefined, running: boolean): void {
    this.#audio.play(footstepKey(surface, running), at === undefined ? {} : { at });
  }

  #updateAudioLoops(): void {
    const audio = this.#audio;
    const gallopRate = (speed: number): number => 0.6 + 0.4 * Math.min(1, speed / CAVALRY_MAX_SPEED);
    const alive = this.#stats.health > 0 && this.#stats.respawnTicks === 0;
    const localSpeed = Math.hypot(this.#localState.velocityX, this.#localState.velocityZ);

    // --- local gallop ---
    const localGallop = this.#stats.mounted && alive && localSpeed > 0.4;
    this.#loopAt.x = this.#localRenderX;
    this.#loopAt.z = this.#localRenderZ;
    if (localGallop) {
      audio.startPositionalLoop("gallop", 0, this.#loopAt, gallopRate(localSpeed));
      audio.updatePositionalLoop("gallop", 0, this.#loopAt, gallopRate(localSpeed));
    } else {
      audio.stopPositionalLoop("gallop", 0);
    }

    // --- remote gallop: nearest four mounted movers within 55 m ---
    this.#loopCandidateCount = 0;
    for (const remote of this.#remoteEntities.values()) {
      if (!remote.active || !remote.alive || !(remote.current.mounted ?? false)) continue;
      const dx = remote.current.x - this.#localRenderX;
      const dz = remote.current.z - this.#localRenderZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= 55 * 55) continue;
      const moved = remote.hasPrevious && Math.hypot(remote.current.x - remote.previous.x, remote.current.z - remote.previous.z)
        * 1_000 / Math.max(1, remote.current.receivedAt - remote.previous.receivedAt) > 0.4;
      if (!moved) continue;
      this.#insertLoopCandidate(remote.entityId, distSq);
    }
    this.#syncLoopSet("gallop", this.#gallopLoopIds, 4);

    // --- local torch crackle ---
    const localLit = this.#stats.torchOn && alive;
    this.#loopAt.x = this.#localRenderX;
    this.#loopAt.z = this.#localRenderZ;
    if (localLit) {
      audio.startPositionalLoop("torch-crackle", 0, this.#loopAt, 1);
      audio.updatePositionalLoop("torch-crackle", 0, this.#loopAt, 1);
    } else {
      audio.stopPositionalLoop("torch-crackle", 0);
    }
    if (localLit !== this.#localTorchAudioLit) {
      this.#localTorchAudioLit = localLit;
      if (localLit) audio.torchIgnite(this.#loopAt);
      else audio.torchExtinguish(this.#loopAt);
    }

    // --- remote torch crackle: nearest four lit remotes within 30 m ---
    this.#loopCandidateCount = 0;
    for (const remote of this.#remoteEntities.values()) {
      if (!remote.active || !remote.alive || remote.torch === 0) continue;
      const dx = remote.current.x - this.#localRenderX;
      const dz = remote.current.z - this.#localRenderZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= 30 * 30) continue;
      this.#insertLoopCandidate(remote.entityId, distSq);
    }
    this.#syncLoopSet("torch-crackle", this.#crackleLoopIds, 4);
  }

  /** Nearest-first fixed-size insertion into the loop candidate scratch. */
  #insertLoopCandidate(entityId: number, distSq: number): void {
    let insertion = this.#loopCandidateCount;
    while (insertion > 0 && distSq < (this.#loopDistSq[insertion - 1] ?? Infinity)) insertion -= 1;
    if (insertion >= this.#loopCandidates.length) return;
    const newCount = Math.min(this.#loopCandidates.length, this.#loopCandidateCount + 1);
    for (let index = newCount - 1; index > insertion; index -= 1) {
      this.#loopCandidates[index] = this.#loopCandidates[index - 1] ?? 0;
      this.#loopDistSq[index] = this.#loopDistSq[index - 1] ?? 0;
    }
    this.#loopCandidates[insertion] = entityId;
    this.#loopDistSq[insertion] = distSq;
    this.#loopCandidateCount = newCount;
  }

  /**
   * Diff the running loop set against the nearest-N candidates: stop loops
   * for ids that fell out (torch loops trigger the extinguish transient on
   * the way down), start/update the rest.
   */
  #syncLoopSet(key: string, running: Set<number>, limit: number): void {
    const audio = this.#audio;
    const count = Math.min(limit, this.#loopCandidateCount);
    const stillWanted = new Set<number>();
    for (let index = 0; index < count; index += 1) {
      const id = this.#loopCandidates[index] ?? 0;
      if (id === 0) break;
      stillWanted.add(id);
    }
    for (const id of running) {
      if (stillWanted.has(id)) continue;
      running.delete(id);
      if (audio.stopPositionalLoop(key, id) && key === "torch-crackle") {
        const remote = this.#remoteEntities.get(id);
        this.#loopAt.x = remote?.current.x ?? this.#localRenderX;
        this.#loopAt.z = remote?.current.z ?? this.#localRenderZ;
        audio.torchExtinguish(this.#loopAt);
      }
    }
    for (let index = 0; index < count; index += 1) {
      const id = this.#loopCandidates[index] ?? 0;
      if (id === 0) break;
      const remote = this.#remoteEntities.get(id);
      if (remote === undefined) continue;
      this.#loopAt.x = remote.current.x;
      this.#loopAt.z = remote.current.z;
      const rate = key === "gallop"
        ? 0.6 + 0.4 * Math.min(1, this.#remoteSpeed01(remote) / CAVALRY_MAX_SPEED)
        : 1;
      if (running.has(id)) {
        audio.updatePositionalLoop(key, id, this.#loopAt, rate);
      } else {
        running.add(id);
        audio.startPositionalLoop(key, id, this.#loopAt, rate);
        if (key === "torch-crackle") audio.torchIgnite(this.#loopAt);
      }
    }
  }

  /** Remote horizontal speed (m/s) from the interpolation pair. */
  #remoteSpeed01(remote: RemoteEntity): number {
    const from = remote.hasPrevious ? remote.previous : remote.current;
    const span = Math.max(1, remote.current.receivedAt - from.receivedAt);
    return Math.hypot(remote.current.x - from.x, remote.current.z - from.z) * 1_000 / span;
  }

  // Earthworks are server-authoritative static cover; their states only
  // change on snapshot, but refilling both batches each frame keeps the code
  // path identical to the other instanced batches and costs ~60 matrix writes.
  #renderEarthworks(): void {
    let moundCount = 0;
    let trenchCount = 0;
    for (const state of this.#earthworkStates.values()) {
      const trench = state.earthworkKind === EarthworkKind.Trench;
      const batch = trench ? this.#trenchInstances : this.#moundInstances;
      const index = trench ? trenchCount : moundCount;
      if (index >= EARTHWORK_MAX) continue;
      this.#instanceTransform.position.set(state.x, state.y, state.z);
      this.#instanceTransform.rotation.set(0, state.yaw, 0);
      this.#instanceTransform.scale.set(1, 1, 1);
      this.#instanceTransform.updateMatrix();
      batch.setMatrixAt(index, this.#instanceTransform.matrix);
      if (trench) trenchCount += 1;
      else moundCount += 1;
    }
    this.#moundInstances.count = moundCount;
    this.#moundInstances.instanceMatrix.needsUpdate = true;
    this.#trenchInstances.count = trenchCount;
    this.#trenchInstances.instanceMatrix.needsUpdate = true;
  }

  // Torch flames + the bounded light pool. Runs after #renderRemoteEntities so
  // remote render positions are current. Light assignment re-selects the
  // nearest six lit remotes every frame via fixed-size insertion (no sort, no
  // allocation); unassigned pool lights sit at intensity 0.
  #updateTorches(): void {
    this.#torchNearestDistSq.fill(Number.POSITIVE_INFINITY);
    for (const remote of this.#remoteEntities.values()) {
      if (!remote.active || !remote.alive || remote.torch === 0 || remote.current.receivedAt === 0) continue;
      const flameY = remote.renderY + 1.4;
      if (this.#torchEmitterIds.has(remote.entityId)) {
        this.#particles.setEmitterPosition(`torch:${remote.entityId}`, remote.renderX, flameY, remote.renderZ);
      } else {
        this.#particles.addEmitter(`torch:${remote.entityId}`, "torchFlame", remote.renderX, flameY, remote.renderZ, 4, 0.06);
        this.#torchEmitterIds.add(remote.entityId);
      }
      const dx = remote.renderX - this.#camera.position.x;
      const dz = remote.renderZ - this.#camera.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= (this.#torchNearestDistSq[TORCH_LIGHT_POOL_SIZE - 1] ?? Number.POSITIVE_INFINITY)) continue;
      let slot = TORCH_LIGHT_POOL_SIZE - 1;
      while (slot > 0 && (this.#torchNearestDistSq[slot - 1] ?? 0) > distSq) {
        this.#torchNearestDistSq[slot] = this.#torchNearestDistSq[slot - 1] ?? 0;
        this.#torchNearestIds[slot] = this.#torchNearestIds[slot - 1] ?? 0;
        slot -= 1;
      }
      this.#torchNearestDistSq[slot] = distSq;
      this.#torchNearestIds[slot] = remote.entityId;
    }
    // Reap emitters whose torch went out or whose owner died (entity leaves
    // are already handled in #releaseRemote).
    for (const entityId of this.#torchEmitterIds) {
      const remote = this.#remoteEntities.get(entityId);
      if (remote !== undefined && remote.alive && remote.torch !== 0) continue;
      this.#particles.removeEmitter(`torch:${entityId}`);
      this.#torchEmitterIds.delete(entityId);
    }
    for (let index = 0; index < TORCH_LIGHT_POOL_SIZE; index += 1) {
      const light = this.#torchLightPool[index];
      if (light === undefined) continue;
      const distSq = this.#torchNearestDistSq[index] ?? Number.POSITIVE_INFINITY;
      const remote = this.#remoteEntities.get(this.#torchNearestIds[index] ?? 0);
      if (remote !== undefined && distSq !== Number.POSITIVE_INFINITY && remote.alive && remote.torch !== 0) {
        light.position.set(remote.renderX, remote.renderY + 1.4, remote.renderZ);
        light.intensity = 5;
      } else {
        light.intensity = 0;
      }
    }
    // Local torch: a dedicated slightly-larger light plus a flame that rides
    // just ahead of the first-person view (or above the player model in third).
    const localLit = this.#stats.torchOn && this.#stats.health > 0 && this.#stats.respawnTicks === 0;
    if (localLit) {
      let flameX = this.#localRenderX;
      let flameY = this.#localRenderY + 1.5;
      let flameZ = this.#localRenderZ;
      if (!this.#cameraThirdPerson) {
        flameX = this.#camera.position.x - Math.sin(this.#input.yaw) * 0.45;
        flameY = this.#camera.position.y + 0.15;
        flameZ = this.#camera.position.z - Math.cos(this.#input.yaw) * 0.45;
      }
      if (this.#localTorchEmitterOn) {
        this.#particles.setEmitterPosition("torch:local", flameX, flameY, flameZ);
      } else {
        this.#particles.addEmitter("torch:local", "torchFlame", flameX, flameY, flameZ, 4, 0.06);
        this.#localTorchEmitterOn = true;
      }
      this.#localTorchLight.position.set(flameX, flameY, flameZ);
      this.#localTorchLight.intensity = 6;
    } else {
      if (this.#localTorchEmitterOn) {
        this.#particles.removeEmitter("torch:local");
        this.#localTorchEmitterOn = false;
      }
      this.#localTorchLight.intensity = 0;
    }
  }

  // Phase 8e-25: prerendered nameplate sprite (interface at module scope).
  #drawNameplates(context: CanvasRenderingContext2D): void {
    for (let index = 0; index < this.#nameplateLayout.count; index += 1) {
      if (!this.#nameplateLayout.accept(index)) continue;
      const entityId = this.#nameplateLayout.entityIds[index] ?? 0;
      const remote = this.#remoteEntities.get(entityId);
      if (remote === undefined) continue;
      const opacity = nameplateOpacity(Math.sqrt(this.#nameplateLayout.distanceSquared[index] ?? 0));
      if (opacity <= 0) continue;
      const screenX = this.#nameplateLayout.screenX[index] ?? 0;
      const screenY = this.#nameplateLayout.screenY[index] ?? 0;
      const rankInfo = this.#ranks.get(entityId);
      const tier = rankTier(rankInfo?.rank ?? 1);
      const prestige = Math.min(5, rankInfo?.prestige ?? 0);
      const accent = (this.#palette.accents[remote.team] ?? this.#palette.accents[Team.Ottoman]) as readonly [string, string, string];
      const squad = this.#squadEntityIds.has(entityId);
      const sprite = this.#ensureNameplateSprite(entityId, this.#displayName(entityId), tier, prestige, squad, accent[tier] ?? accent[0] ?? "#b43a32");
      if (sprite !== undefined) {
        context.globalAlpha = opacity;
        context.drawImage(sprite.canvas, Math.round(screenX - sprite.width / 2), Math.round(screenY - sprite.nameBaseline), sprite.width, sprite.height);
        continue;
      }
      // Fallback (sprite build failed): the original per-frame fillText path.
      context.globalAlpha = opacity;
      context.fillStyle = accent[tier] ?? accent[0] ?? "#b43a32";
      context.fillText(tier === 0 ? "▲" : tier === 1 ? "▲▲" : "▲▲▲", screenX, screenY + 10);
      context.fillStyle = squad ? this.#palette.squadName : "rgba(255,255,255,0.9)";
      context.fillText(this.#displayName(entityId), screenX, screenY);
      if (prestige > 0) {
        context.fillStyle = "#ffd166";
        context.fillText(prestige === 1 ? "★" : prestige === 2 ? "★★" : prestige === 3 ? "★★★" : prestige === 4 ? "★★★★" : "★★★★★", screenX, screenY - 12);
      }
      // Bot names already use the "Bot ####" convention. The former separate
      // `(AI)` line doubled label height and was the worst crowd-overlap case.
    }
    context.globalAlpha = 1;
  }

  /** Phase 8e-25: builds (or returns the cached) baked nameplate sprite for
   * an entity. The content key covers every text/fill that can change: name,
   * rank tier, prestige, squad tint, and the team accent. Sprite canvases use
   * the same pixel-ratio transform and font/shadow state as the live overlay,
   * so the baked image is pixel-identical to the old per-frame fillText. */
  #ensureNameplateSprite(entityId: number, name: string, tier: number, prestige: number, squad: boolean, accent: string): NameplateSprite | undefined {
    const key = `${name}|${tier}|${prestige}|${squad ? 1 : 0}|${accent}`;
    const cached = this.#nameplateSprites.get(entityId);
    if (cached !== undefined && cached.key === key) return cached;
    if (this.#nameplateSprites.size > 512) {
      for (const [staleId, sprite] of this.#nameplateSprites) {
        if (this.#remoteEntities.has(staleId) && sprite !== cached) continue;
        this.#nameplateSprites.delete(staleId);
      }
    }
    const canvas = document.createElement("canvas");
    const spriteContext = canvas.getContext("2d");
    if (spriteContext === null) return undefined;
    const ratio = Math.max(1, this.#targetPixelRatio());
    const stars = prestige === 0 ? "" : prestige >= 5 ? "★★★★★" : "★".repeat(prestige);
    const markers = tier === 0 ? "▲" : tier === 1 ? "▲▲" : "▲▲▲";
    // Measure with the exact live state, then bake at the overlay's scale.
    spriteContext.font = "600 12px 'Alegreya Sans', system-ui, sans-serif";
    spriteContext.textAlign = "center";
    spriteContext.textBaseline = "bottom";
    const nameWidth = spriteContext.measureText(name).width;
    const starsWidth = stars === "" ? 0 : spriteContext.measureText(stars).width;
    const markersWidth = spriteContext.measureText(markers).width;
    const width = Math.max(80, Math.ceil(Math.max(nameWidth, starsWidth, markersWidth)) + 36);
    const height = 60;
    const nameBaseline = 26;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    spriteContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    spriteContext.font = "600 12px 'Alegreya Sans', system-ui, sans-serif";
    spriteContext.textAlign = "center";
    spriteContext.textBaseline = "bottom";
    spriteContext.shadowColor = "rgba(0,0,0,0.85)";
    spriteContext.shadowBlur = 3;
    spriteContext.fillStyle = accent;
    spriteContext.fillText(markers, width / 2, nameBaseline + 10);
    spriteContext.fillStyle = squad ? this.#palette.squadName : "rgba(255,255,255,0.9)";
    spriteContext.fillText(name, width / 2, nameBaseline);
    if (stars !== "") {
      spriteContext.fillStyle = "#ffd166";
      spriteContext.fillText(stars, width / 2, nameBaseline - 12);
    }
    const sprite: NameplateSprite = { key, canvas, width, height, nameBaseline };
    this.#nameplateSprites.set(entityId, sprite);
    return sprite;
  }

  // Phase 8e-1 Task 6: pooled damage floaters, projected onto the nameplate
  // canvas (same zero-allocation overlay as the nameplates). Each floater
  // rises half a metre and fades over DAMAGE_FLOATER_SECONDS.
  #drawDamageFloaters(context: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    let any = false;
    for (let slot = 0; slot < DAMAGE_FLOATER_POOL; slot += 1) {
      const start = this.#floaterStart[slot] ?? 0;
      if (start === 0) continue;
      const age = (now - start) / 1_000;
      if (age >= DAMAGE_FLOATER_SECONDS) {
        this.#floaterStart[slot] = 0;
        continue;
      }
      const progress = age / DAMAGE_FLOATER_SECONDS;
      const rise = DAMAGE_FLOATER_RISE_METERS * (1 - (1 - progress) * (1 - progress)); // ease-out
      this.#labelPoint.set(this.#floaterX[slot] ?? 0, (this.#floaterY[slot] ?? 0) + rise, this.#floaterZ[slot] ?? 0).project(this.#camera);
      if (this.#labelPoint.z < -1 || this.#labelPoint.z > 1) continue;
      const screenX = (this.#labelPoint.x * 0.5 + 0.5) * width;
      const screenY = (-this.#labelPoint.y * 0.5 + 0.5) * height;
      if (!any) {
        context.font = "700 22px 'IBM Plex Mono', monospace";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        any = true;
      }
      context.globalAlpha = 1 - progress * progress;
      context.fillStyle = "#ffd166";
      // Phase 8e-25 (D19): shadow the gold numerals — the bright 8e-24 sky
      // made the old unshadowed text near-invisible.
      context.shadowColor = "rgba(0,0,0,0.85)";
      context.shadowBlur = 3;
      context.fillText(String(this.#floaterAmount[slot] ?? 0), screenX, screenY);
      context.shadowBlur = 0;
    }
    if (any) {
      context.globalAlpha = 1;
      context.font = "600 12px 'Alegreya Sans', system-ui, sans-serif";
    }
  }

  #drawSelfNameplate(width: number, height: number): void {
    if (this.#localEntityId === 0) return;
    const best = this.#highestMedalTier();
    if (best === undefined) return;
    const identity = medalIdentity(best.category as MedalCategory, best.tier as MedalTier);
    if (identity === undefined) return;
    const faction = this.#stats.team === Team.Byzantine ? Team.Byzantine : Team.Ottoman;
    const style = identity.styles[faction] ?? identity.styles[Team.Ottoman];
    const point = this.#labelPoint.set(this.#camera.position.x, this.#camera.position.y + 0.35, this.#camera.position.z).project(this.#camera);
    if (point.z < -1 || point.z > 1) return;
    const x = (point.x * 0.5 + 0.5) * width;
    const y = (-point.y * 0.5 + 0.5) * height;
    const context = this.#nameContext;
    const radius = 7;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = style.accentColor;
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = style.ribbonColor;
    context.stroke();
    context.beginPath();
    context.arc(x, y, radius - 2.5, 0, Math.PI * 2);
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.stroke();
    context.font = "600 7px system-ui, sans-serif";
    context.fillStyle = "#141210";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(best.tier === MedalTier.Bronze ? "I" : best.tier === MedalTier.Silver ? "II" : "III", x, y + 0.5);
  }

  readonly #ottomanTint = new THREE.Color(TEAM_PALETTES.default.hullTint[Team.Ottoman]);
  readonly #byzantineTint = new THREE.Color(TEAM_PALETTES.default.hullTint[Team.Byzantine]);

  #spawnWake(x: number, z: number): { mesh: THREE.Mesh; until: number } | undefined {
    if (this.#wakePuffs.length >= 24) return undefined;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.5, 5, 5), new THREE.MeshBasicMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.5 }));
    puff.position.set(x, 0.35, z);
    this.#scene.add(puff);
    return { mesh: puff, until: performance.now() + 900 };
  }

  #spawnCannonSmoke(x: number, z: number, yaw: number): void {
    const origin = new THREE.Vector3(x - Math.cos(yaw) * 9, 1.8, z - Math.sin(yaw) * 9);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), new THREE.MeshBasicMaterial({ color: 0xd7d3c8, transparent: true, opacity: 0.5 }));
    smoke.position.copy(origin);
    this.#scene.add(smoke);
    this.#effects.push({ object: smoke, until: performance.now() + 900 });
  }

  // Client mirror of the server's placeEarthwork aim derivation
  // (server/src/sim/world.ts): ray from the eye (y + 0.65) against the shared
  // heightfield (raycastTerrain — Phase 8e-11; the old feet-plane mirror was
  // flat-ground only), must point down, land 1-10 m out, and pass the shared
  // terrain clearance. The 2 s cooldown and aliveness stay server-side — the
  // server still authoritatively validates every placement.
  #earthworkAimValid(): boolean {
    const pitch = this.#input.pitch;
    const directionY = Math.sin(pitch);
    if (directionY >= -0.02) return false;
    const cosPitch = Math.cos(pitch);
    const yaw = this.#input.yaw;
    const directionX = -Math.sin(yaw) * cosPitch;
    const directionZ = -Math.cos(yaw) * cosPitch;
    const distance = raycastTerrain(this.#localState.x, this.#localState.y + 0.65, this.#localState.z, directionX, directionY, directionZ, EARTHWORK_MAX_RANGE);
    if (distance === undefined || distance < 1) return false;
    return isAllowed(this.#localState.x + directionX * distance, this.#localState.z + directionZ * distance, 1.5);
  }

  /** Phase 8e-25: returns true when a bombard-impact boom is allowed at (x,
   * z) — false when the nearest wall segment already boomed within the dedup
   * window (one breach announces twice: the shell impact and the WallEvent).
   * Also records the boom so the second announcement is dropped. */
  #breachBoomDue(x: number, z: number): boolean {
    let nearestId = -1;
    let nearestSquared = Number.POSITIVE_INFINITY;
    for (const segment of WALL_SEGMENTS) {
      const dx = x - segment.box.x;
      const dz = z - segment.box.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= nearestSquared) continue;
      nearestSquared = distanceSquared;
      nearestId = segment.id;
    }
    if (nearestId < 0) return true;
    const now = performance.now();
    const last = this.#breachBoomAt.get(nearestId) ?? 0;
    if (now - last < BREACH_BOOM_DEDUP_MS) return false;
    this.#breachBoomAt.set(nearestId, now);
    return true;
  }

  #updateAmbientAudio(now: number): void {
    this.#audio.update(now);
    this.#audio.setChantActive(this.#chantNearby);
    if (this.#nearGalley && now >= this.#creakAt) {
      this.#creakAt = now + 6_500;
      this.#audio.galleyCreak({ x: this.#nearGalleyX, z: this.#nearGalleyZ });
    }
    // ADR 0045: the quiet shore bed follows proximity to the nearest water
    // edge (river bank or the Golden Horn shoreline), full at the waterline,
    // silent ~40 m inland. Dead players hear nothing.
    const alive = this.#stats.health > 0 && this.#stats.respawnTicks === 0;
    if (alive) {
      const x = this.#localState.x;
      const z = this.#localState.z;
      const riverDistance = Math.max(0, riverCenterlineDistance(x, z) - RIVER_HALF_WIDTH);
      const seaDistance = Math.max(0, WATER_SHORE_Z - z);
      const shoreDistance = Math.min(riverDistance, seaDistance);
      this.#audio.setShoreProximity(1 - Math.min(1, shoreDistance / 40));
    } else {
      this.#audio.setShoreProximity(0);
    }
  }

  #updateDiagnostics(now: number): void {
    if (now - this.#lastPingAt >= 1_000 && this.#socket.readyState === WebSocket.OPEN) {
      const nonce = Math.floor(now) >>> 0;
      this.#pendingPings.set(nonce, now);
      this.#send(encodePing(MessageType.Ping, nonce));
      this.#lastPingAt = now;
    }
    this.#audio.setAmbientActive(this.#localEntityId !== 0 && this.#stats.roundPhase === RoundPhase.Active);
    const elapsed = now - this.#lastStatsAt;
    if (elapsed < 1_000) return;
    const expiredFx = this.#stats.fxEvents.filter((event) => now - event.at < (event.kind === "ceremony" ? 5_000 : event.kind === "fanfare" ? 3_200 : event.kind === "ownkill" ? 2_800 : 6_000));
    const frameP95Ms = percentileFromRing(this.#frameSamples, this.#frameSampleCount, this.#frameSampleScratch, 0.95);
    const reconciliationErrorP95Cm = percentileFromRing(
      this.#reconciliationSamples,
      this.#reconciliationSampleCount,
      this.#reconciliationSampleScratch,
      0.95,
    );
    let reconciliationErrorMaxCm = 0;
    for (let index = 0; index < this.#reconciliationSampleCount; index += 1) {
      reconciliationErrorMaxCm = Math.max(reconciliationErrorMaxCm, this.#reconciliationSamples[index] ?? 0);
    }
    this.#stats = {
      ...this.#stats,
      corrections: this.#corrections,
      bytesInPerSecond: Math.round((this.#bytesInWindow * 1_000) / elapsed),
      bytesOutPerSecond: Math.round((this.#bytesOutWindow * 1_000) / elapsed),
      interestSetSize: this.#remoteEntities.size + (this.#localEntityId === 0 ? 0 : 1),
      snapshotAgeMs: this.#lastSnapshotReceivedAt === 0 ? 0 : Math.round(now - this.#lastSnapshotReceivedAt),
      fps: Math.round((this.#framesSinceStats * 1_000) / elapsed),
      frameP95Ms: Math.round(frameP95Ms * 10) / 10,
      reconciliationErrorP95Cm: Math.round(reconciliationErrorP95Cm * 10) / 10,
      reconciliationErrorMaxCm: Math.round(reconciliationErrorMaxCm * 10) / 10,
      fxEvents: expiredFx,
    };
    this.#onStats({ ...this.#stats });
    this.#bytesInWindow = 0;
    this.#bytesOutWindow = 0;
    this.#framesSinceStats = 0;
    this.#lastStatsAt = now;
  }

  readonly #frame = (): void => {
    const frameDelta = this.#clock.getDelta();
    const dt = Math.min(frameDelta, 0.1);
    this.#frameSamples[this.#frameSampleCursor] = frameDelta * 1_000;
    this.#frameSampleCursor = (this.#frameSampleCursor + 1) % this.#frameSamples.length;
    this.#frameSampleCount = Math.min(this.#frameSamples.length, this.#frameSampleCount + 1);
    this.#accumulator += dt;
    while (this.#accumulator >= FIXED_DT_SECONDS) {
      this.#fixedPredictionStep();
      this.#accumulator -= FIXED_DT_SECONDS;
    }
    const driveFrame = this.#driveOverride;
    this.#renderInput.buttons = freezeJumpEdgeForExtrapolation(driveFrame?.buttons ?? this.#input.buttons, this.#localState.jumpHeld);
    this.#renderInput.yaw = driveFrame?.yaw ?? this.#input.yaw;
    this.#renderInput.pitch = driveFrame?.pitch ?? this.#input.pitch;
    const displayState = this.#displayAboardState(this.#simulatePredictedMovement(this.#localState, this.#renderInput, this.#accumulator), performance.now());
    if (this.#movementTrace !== null) {
      const err = this.#reconcileSerial !== this.#traceReconcileSerial ? this.#lastReconcileError : -1;
      this.#traceReconcileSerial = this.#reconcileSerial;
      this.#movementTrace.push({
        t: performance.now() - this.#movementTraceStart,
        dt: frameDelta * 1_000,
        fx: this.#localState.x,
        fy: this.#localState.y,
        fz: this.#localState.z,
        rx: displayState.x,
        ry: displayState.y,
        rz: displayState.z,
        ox: this.#correctionSmoother.offsetX,
        oy: this.#correctionSmoother.offsetY,
        oz: this.#correctionSmoother.offsetZ,
        acc: this.#accumulator,
        grounded: this.#localState.grounded,
        pending: this.#pendingInputs.length,
        err,
        corr: this.#corrections,
      });
    }
    this.#localRenderX = displayState.x + this.#correctionSmoother.offsetX;
    this.#localRenderY = displayState.y + this.#correctionSmoother.offsetY;
    this.#localRenderZ = displayState.z + this.#correctionSmoother.offsetZ;
    this.#localRenderYaw = displayState.yaw;
    // Mount-aware camera default (Phase 8c-4): third person while mounted,
    // first person on foot, reset to that default on mount/dismount. The
    // view-toggle key (V) overrides in either state on top of the default.
    // Flips no longer cut: #setCameraThirdPerson restarts a ~0.4 s smoothstep
    // blend that computes BOTH transforms and mixes them (position lerp +
    // quaternion slerp, scratch objects only) before cameraFeel layers its
    // offsets on top.
    const mountedNow = this.#stats.mounted;
    if (mountedNow !== this.#lastMountedState) {
      this.#lastMountedState = mountedNow;
      this.#setCameraThirdPerson(mountedNow);
      // ADR 0045: rare flavor — a neigh sells the mount instant.
      if (mountedNow) this.#audio.play("horse-neigh");
    }
    if (this.#cameraBlendProgress < 1) {
      this.#cameraBlendProgress = Math.min(1, this.#cameraBlendProgress + dt / CAMERA_BLEND_SECONDS);
      const t = this.#cameraBlendProgress;
      const eased = t * t * (3 - 2 * t);
      const mix = this.#cameraThirdPerson ? eased : 1 - eased;
      this.#cameraBlendMix = mix;
      const forwardX = -Math.sin(this.#input.yaw);
      const forwardZ = -Math.cos(this.#input.yaw);
      const eyeHeight = mountedNow ? 2.5 : 1.55;
      this.#blendThirdPos.set(
        this.#localRenderX - forwardX * 3.4,
        this.#localRenderY + eyeHeight - 0.2,
        this.#localRenderZ - forwardZ * 3.4,
      );
      this.#blendTarget.set(
        this.#localRenderX + forwardX * 5,
        this.#localRenderY + eyeHeight * 0.9,
        this.#localRenderZ + forwardZ * 5,
      );
      this.#blendMatrix.lookAt(this.#blendThirdPos, this.#blendTarget, this.#blendUp);
      this.#blendThirdQuat.setFromRotationMatrix(this.#blendMatrix);
      this.#blendFirstPos.set(this.#localRenderX, this.#localRenderY + (mountedNow ? 2.2 : 0.65), this.#localRenderZ);
      this.#blendFirstQuat.setFromEuler(this.#blendEuler.set(this.#input.pitch, this.#input.yaw, 0));
      this.#camera.position.lerpVectors(this.#blendFirstPos, this.#blendThirdPos, mix);
      this.#camera.quaternion.slerpQuaternions(this.#blendFirstQuat, this.#blendThirdQuat, mix);
    } else if (this.#cameraThirdPerson) {
      this.#cameraBlendMix = 1;
      const eyeHeight = mountedNow ? 2.5 : 1.55;
      const forwardX = -Math.sin(this.#input.yaw);
      const forwardZ = -Math.cos(this.#input.yaw);
      const offset = 3.4;
      this.#camera.position.set(
        this.#localRenderX - forwardX * offset,
        this.#localRenderY + eyeHeight - 0.2,
        this.#localRenderZ - forwardZ * offset,
      );
      this.#camera.lookAt(
        this.#localRenderX + forwardX * 5,
        this.#localRenderY + eyeHeight * 0.9,
        this.#localRenderZ + forwardZ * 5,
      );
    } else {
      this.#cameraBlendMix = 0;
      this.#camera.position.set(this.#localRenderX, this.#localRenderY + (mountedNow ? 2.2 : 0.65), this.#localRenderZ);
      this.#camera.rotation.set(this.#input.pitch, this.#input.yaw, 0);
    }
    // The equipped weapon def (predicted): drives ADS eligibility and the
    // reticle's swing-cooldown ring below.
    const predictedDef = this.#stats.mounted ? WEAPON_DEFS[WeaponType.Saber] : weaponDefAtSlot(this.#stats.playerClass, this.#weaponSlots.activeSlot);
    this.#cameraFeel.update(dt);
    this.#cameraFeel.apply(this.#camera);
    if (this.#debugCamera !== null) {
      this.#camera.position.set(this.#debugCamera.x, this.#debugCamera.y, this.#debugCamera.z);
      this.#camera.rotation.set(this.#debugCamera.pitch, this.#debugCamera.yaw, 0);
    }
    // 8e-11: never sink the eye under the heightfield — the third-person boom
    // reaches 3.4 m behind the player, which slopes can now bury.
    if (this.#debugCamera === null) {
      // impactHeightAt, not heightAt: over the carved channel/sea the floor
      // is the water surface, so a downward pitch from a bridge or the shore
      // can never dip the eye under the (single-sided) water plane.
      const cameraFloor = impactHeightAt(this.#camera.position.x, this.#camera.position.z) + 0.3;
      if (this.#camera.position.y < cameraFloor) this.#camera.position.y = cameraFloor;
    }
    // Phase 8e-7 ADS: one smoothed blend weight drives the FOV zoom, the
    // mouse-sensitivity rescale, and the viewmodel shouldering in lockstep.
    // Foot-only and ranged-slot-only — blades, the lance, and support
    // primaries (drum/standard) never aim; a mid-draw switch, mounting, or
    // death drops the blend. The fovRatio is captured while aiming so a
    // mid-decay slot change decays with the old ratio instead of snapping.
    const adsEligible = (this.#renderInput.buttons & InputButton.Aim) !== 0
      && this.#prevAlive
      && !this.#stats.mounted
      && this.#weaponSlots.ticksRemaining === 0
      && !CLASS_TUNING[this.#stats.playerClass].support
      && predictedDef.kind === "ranged";
    if (adsEligible) this.#adsFovRatio = aimFovRatio(predictedDef.id);
    this.#adsWeight = stepAdsWeight(this.#adsWeight, adsEligible ? 1 : 0, dt);
    if (this.#adsWeight === 0 && this.#adsFovRatio !== 1) this.#adsFovRatio = 1;
    const effectiveFov = adsFovDegrees(this.#baseFovDegrees, this.#adsFovRatio, this.#adsWeight);
    if (Math.abs(effectiveFov - this.#lastAppliedFov) > 0.005) {
      this.#lastAppliedFov = effectiveFov;
      this.#camera.fov = effectiveFov;
      this.#camera.updateProjectionMatrix();
    }
    this.#input.setAimScale(adsSensitivityScale(this.#baseFovDegrees, this.#adsFovRatio, this.#adsWeight));
    this.#viewmodel.setAimWeight(this.#adsWeight);
    // Mirror the server's exact movement/settle/ADS spread rule for the HUD.
    // The center pin remains the camera ray; only the four heraldic brackets
    // breathe to show the possible random deviation around that trajectory.
    const reticleNow = performance.now();
    const reticleSpeed = Math.hypot(this.#localState.velocityX, this.#localState.velocityZ);
    if (reticleSpeed > 0.15) this.#reticleSteadyAt = reticleNow + STATIONARY_ACCURACY_SECONDS * 1_000;
    const baseSpread = reticleSpeed > 0.15 || reticleNow < this.#reticleSteadyAt ? MOVING_SPREAD_RADIANS : STANDING_SPREAD_RADIANS;
    const aimedFactor = predictedDef.kind === "ranged" ? aimedSpreadFactor(predictedDef.id, adsEligible) : 1;
    this.#stats.reticleSpreadRadians = predictedDef.kind === "ranged"
      ? baseSpread * aimedFactor
      : STANDING_SPREAD_RADIANS;
    if (this.#stats.playerClass !== this.#viewmodelClass || this.#stats.mounted !== this.#viewmodelMounted) {
      this.#viewmodelClass = this.#stats.playerClass;
      this.#viewmodelMounted = this.#stats.mounted;
      this.#viewmodelSlot = this.#weaponSlots.activeSlot;
      this.#viewmodel.setLoadout(this.#viewmodelClass, this.#viewmodelMounted, this.#viewmodelSlot);
      const skinVariant = variantForSkinId(this.#skinEquips[this.#viewmodelClass]);
      this.#viewmodel.setSkinTint(skinVariant === 2 ? 0xffd166 : skinVariant === 1 ? 0x8a6b42 : undefined);
    }
    // Weapon-slot draw (8e-3): a predicted switch start lowers the current
    // weapon and raises the target over WEAPON_SWITCH_SECONDS; a
    // reconciliation snap or death forces an immediate re-sync instead.
    if (this.#forceViewmodelSync) {
      this.#forceViewmodelSync = false;
      this.#prevSwitching = false;
      this.#viewmodelSlot = this.#weaponSlots.activeSlot;
      this.#viewmodel.setLoadout(this.#stats.playerClass, this.#stats.mounted, this.#viewmodelSlot);
    } else {
      const switchingNow = this.#weaponSlots.ticksRemaining > 0;
      if (switchingNow && !this.#prevSwitching) {
        this.#viewmodelSlot = this.#weaponSlots.targetSlot;
        this.#viewmodel.startSwitch(this.#stats.playerClass, this.#stats.mounted, this.#viewmodelSlot, WEAPON_SWITCH_SECONDS);
        this.#audio.weaponDraw(this.#weaponSlots.targetSlot === 2 ? "gun" : "blade");
      }
      this.#prevSwitching = switchingNow;
    }
    const moveSpeed01 = Math.min(1, Math.hypot(this.#localState.velocityX, this.#localState.velocityZ) / 5.5);
    // Weapon stowed while pushing a siege gun (siege loop §1.3) — the same
    // first-person-only visibility rule, plus the new push flag.
    this.#viewmodel.setVisible(this.#cameraBlendMix <= 0.5 && !this.#pushingCannon && !this.#manningArtillery);
    this.#viewmodel.update(dt, moveSpeed01);
    // Muzzle light decay (Phase 8e-1): exponential, frame-rate independent.
    if (this.#muzzleLightT > 0) {
      this.#muzzleLightT = Math.max(0, this.#muzzleLightT - dt);
      this.#muzzleLight.intensity = MUZZLE_LIGHT_PEAK[this.#quality] * (this.#muzzleLightT / MUZZLE_LIGHT_SECONDS);
    } else if (this.#muzzleLight.intensity !== 0) {
      this.#muzzleLight.intensity = 0;
    }
    // Explosion light decay (Phase 8e-9 Task 3): same one-envelope pattern —
    // a fast 140 ms flash at the newest impact point, off on the low tier.
    if (this.#explosionLightT > 0) {
      this.#explosionLightT = Math.max(0, this.#explosionLightT - dt);
      this.#explosionLight.intensity =
        EXPLOSION_FLASH_PEAK[this.#quality] * explosionFlashScale(EXPLOSION_FLASH_SECONDS - this.#explosionLightT);
    } else if (this.#explosionLight.intensity !== 0) {
      this.#explosionLight.intensity = 0;
    }
    const now = performance.now();
    const buttons = this.#input.buttons;
    // Melee swing presentation: the E key always swings; left-click swings
    // too while a blade is the equipped slot (the server resolves the same
    // path). The predicted def (computed above) drives the reticle's
    // swing-cooldown ring.
    const meleeHeld = (buttons & InputButton.Melee) !== 0 || (predictedDef.kind === "melee" && (buttons & InputButton.Fire) !== 0);
    const meleeWasHeld = (this.#prevButtons & InputButton.Melee) !== 0 || (predictedDef.kind === "melee" && (this.#prevButtons & InputButton.Fire) !== 0);
    if (meleeHeld && !meleeWasHeld && this.#weaponSlots.ticksRemaining === 0) {
      this.#audio.play("melee-swing");
      this.#viewmodel.onMelee();
      this.#meleeReadyAtMs = now + predictedDef.cooldownSeconds * 1000;
    }
    const raiseEdge = (buttons & InputButton.RaiseEarthwork) !== 0 && (this.#prevButtons & InputButton.RaiseEarthwork) === 0;
    const digEdge = (buttons & InputButton.DigEarthwork) !== 0 && (this.#prevButtons & InputButton.DigEarthwork) === 0;
    // Phase 8e-19 Task 7: the local player's own artillery shot is predicted
    // on the Fire edge — the shell spawns INSTANTLY at the manned cannon's
    // live transform with the server's exact pitch clamp (world.ts:
    // gunPitch = clamp(gunner pitch, 0.05, 0.9)). The old mirror waited for
    // the type-7 event (one snapshot later) and flew the fixed SHELL_PITCH
    // arc, so the own cannonball started late and landed where the player did
    // not aim — the "choppy" read. The server event then dedups (see the
    // type-7 branches) instead of spawning a second shell.
    const firePressed = (buttons & InputButton.Fire) !== 0 && (this.#prevButtons & InputButton.Fire) === 0;
    if (this.#manningArtillery && firePressed) {
      const cannon = this.#nearestCannon(this.#localState.x, this.#localState.z, SIEGE_CANNON_BOARD_RADIUS * SIEGE_CANNON_BOARD_RADIUS);
      if (cannon !== undefined && (cannon.shipState & CANNON_STATE_DESTROYED) === 0) {
        const remoteCannon = this.#cannons.get(cannon.entityId);
        const personal = (cannon.shipState & CANNON_STATE_PERSONAL) !== 0;
        const gunYaw = remoteCannon?.renderGunYaw ?? this.#input.yaw;
        const gunPitch = Math.max(SIEGE_CANNON_MIN_PITCH, Math.min(SIEGE_CANNON_MAX_PITCH, this.#input.pitch));
        this.#trackShell(
          cannon.renderX,
          cannon.renderZ,
          gunYaw,
          this.#localEntityId,
          gunPitch,
          personal ? PERSONAL_CANNON_PROJECTILE_SPEED : BOMBARD_PROJECTILE_SPEED,
        );
      }
    }
    if (raiseEdge || digEdge) {
      // Instant honest feedback: the server's cheap placement checks are
      // mirrored client-side (#earthworkAimValid), so an impossible placement
      // jerks the shovel instead of swinging. The 2 s cooldown is server-side
      // only — a cooldown rejection still shows the swing.
      const valid = this.#earthworkAimValid();
      if (valid) {
        this.#audio.play(raiseEdge ? "shovel-raise" : "shovel-dig", { at: { x: this.#localRenderX, z: this.#localRenderZ } });
        this.#viewmodel.playShovelUse(raiseEdge ? "raise" : "dig");
      } else {
        this.#audio.placementDenied({ x: this.#localRenderX, z: this.#localRenderZ });
        this.#viewmodel.playDenied();
      }
    }
    const interactPressed = (buttons & InputButton.Interact) !== 0 && (this.#prevButtons & InputButton.Interact) === 0;
    if (interactPressed && !this.#localAboard) {
      for (const ladder of SIEGE_LADDERS) {
        if (Math.hypot(this.#localState.x - ladder.x, this.#localState.z - ladder.z) <= ladder.radius) {
          // The source is a long field recording; the bounded window keeps a
          // single climb cue from becoming another delayed battlefield tail.
          this.#audio.play("ladder-climb", { at: { x: ladder.x, z: ladder.z }, volume: 0.3, durationSeconds: 0.8 });
          break;
        }
      }
    }
    this.#prevButtons = buttons;
    const alive = this.#stats.respawnTicks === 0 && this.#stats.health > 0;
    const moving = (buttons & (InputButton.Forward | InputButton.Backward | InputButton.Left | InputButton.Right)) !== 0;
    if (alive && moving && !this.#stats.mounted && now >= this.#localFootstepAt) {
      // Phase 8e-10 Task 3: cadence follows actual ground speed (stride /
      // speed) instead of a fixed 500 ms — top speed steps fast, a wade slow;
      // worn roads play dirt steps (real sample since ADR 0045). 8e-19:
      // walk-only — grass never switches to the run sample.
      const speed = Math.hypot(this.#localState.velocityX, this.#localState.velocityZ);
      if (speed < 0.5) {
        // Buttons held against a wall: no motion, no steps — recheck soon.
        this.#localFootstepAt = now + 150;
      } else {
        this.#localFootstepAt = now + footstepIntervalSeconds(speed) * 1_000;
        this.#playFootstep(footstepSurfaceAt(this.#localState.x, this.#localState.z), undefined, speed >= FOOTSTEP_RUN_MIN_SPEED);
      }
    }
    // ADR 0045: landing thud scaled by fall speed, and the deep-water entry
    // splash. Both are edge-triggered off the predicted local state.
    if (alive) {
      const grounded = this.#localState.grounded;
      if (!grounded) {
        this.#localAirMinVelocityY = Math.min(this.#localAirMinVelocityY, this.#localState.velocityY);
      } else if (!this.#localWasGrounded) {
        if (this.#localAirMinVelocityY < -3.5) {
          this.#audio.play("jump-land", { volume: Math.min(1, -this.#localAirMinVelocityY / 9) });
        }
        this.#localAirMinVelocityY = 0;
      }
      this.#localWasGrounded = grounded;
      const deepWater = inDeepWater(this.#localState.x, this.#localState.z);
      if (deepWater && !this.#wasInDeepWater) {
        this.#audio.play("splash-big", { at: { x: this.#localState.x, z: this.#localState.z } });
      }
      this.#wasInDeepWater = deepWater;
    } else {
      this.#localWasGrounded = true;
      this.#localAirMinVelocityY = 0;
      this.#wasInDeepWater = false;
    }
    this.#renderRemoteEntities(now);
    this.#characters.endFrame(dt, now);
    this.#animatedHorses.endFrame(dt);
    this.#renderEarthworks();
    this.#updateTorches();
    this.#updateAudioLoops();
    this.#stats.hitMarker = now < this.#hitMarkerUntil;
    this.#stats.headshotMarker = now < this.#headshotMarkerUntil;
    this.#stats.killMarker = now < this.#killMarkerUntil;
    this.#stats.readyFlash = now < this.#readyFlashUntil;
    if (now >= this.#damageDirectionUntil) this.#stats.damageDirection = 0;
    this.#elapsedSeconds += dt;
    this.#water.update(this.#elapsedSeconds);
    this.#updateProjectiles(dt);
    this.#particles.update(dt);
    this.#banners.update(dt, this.#stats.points);
    this.#dressing.update(dt);
    this.#assetProps.update(dt);
    this.#atmosphere.render();
    this.#stats.drawCalls = this.#renderer.info.render.calls;
    this.#framesSinceStats += 1;
    this.#updateAmbientAudio(now);
    this.#updateDiagnostics(now);
    this.#correctionSmoother.advance(dt);
  };
}

function indexOfMedal(medals: readonly MedalDisplay[], kind: number): number {
  return medals.findIndex((medal) => medal.kind === kind);
}

function footstepKey(surface: FootstepSurface, running: boolean): string {
  if (surface === "water") return "footstep-water";
  if (surface === "stone") return "footsteps-stone";
  if (surface === "wood") return "footsteps-wood";
  if (surface === "dirt") return "footsteps-dirt";
  return running ? "footsteps-grass-run" : "footsteps-grass-walk";
}
