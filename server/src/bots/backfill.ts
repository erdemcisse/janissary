import {
  BotBrain,
  EntityKind,
  FIXED_DT_MS,
  InputButton,
  MAX_PLAYERS,
  MAX_SIEGE_CANNONS,
  MAX_VEHICLES,
  PlayerClass,
  SIEGE_CANNON_BOARD_RADIUS,
  Team,
  WALL_SEGMENTS,
  WallState,
  getBotBehaviorMode,
  isBotCombatFrozen,
  type EntityState,
} from "@janissary/shared";
import { addPlayer, enqueueInput, removePlayer, type WorldState } from "../sim/world";
import { vehicleEntityId } from "../sim/vehicle";
import { cannonPusherCount } from "../sim/cannon";

/**
 * In-process population backfill. Runs the same BotBrain decision logic as the
 * load-harness bots in tools/bot.ts, but feeds the authoritative world directly
 * instead of going through a WebSocket. Bots are filler only: a human joining a
 * team evicts that team's lowest-tenure bot first, so bots can never block a
 * human, and the controller backs off as humans fill the population floor.
 */
export interface BackfillConfig {
  /** Total target bots across both teams (default 100, clamped 60-150). */
  readonly floorTarget: number;
  /** Absolute cap on server-side bots; worst case floor + 1,000 humans stays under MAX_PLAYERS. */
  readonly maxServerBots: number;
  /** Slots kept free for humans beyond the loadtest headroom (1,000 bots). */
  readonly reserveSlots: number;
  /** Backfill evaluation interval in ticks (25 ticks = 1.25 s). */
  readonly checkEveryTicks: number;
}

interface ServerBot {
  readonly entityId: number;
  readonly slot: number;
  readonly team: Team;
  readonly brain: BotBrain;
  joinedAtTick: number;
  lastInputTick: number;
  seq: number;
  /** Suppresses Interact re-sends while a cannon board attempt is in flight. */
  interactCooldownUntilTick: number;
  /** Phase 8e-25 pusher-deadlock fix: carriage position probes + stuck tally
   * so a pusher releases its station once the cannon has stopped advancing. */
  pushProbeX: number;
  pushProbeZ: number;
  pushStuckTicks: number;
  /** Phase 8e-25: cannon the pusher just released; skipped for a few seconds
   * so the bot does not re-board the same pinned carriage and loop forever. */
  cannonAvoidIndex: number;
  cannonAvoidUntilTick: number;
}

/** Phase 8e-25: how long a pusher waits with no carriage movement before
 * releasing the station (30 ticks = 1.5 s). */
const PUSHER_STUCK_TICKS = 30;
/** Ignore a just-released cannon in the crew search for this long (6 s). */
const CANNON_AVOID_TICKS = 120;

export function defaultBackfillConfig(environment: Readonly<Record<string, string | undefined>> = process.env): BackfillConfig {
  const floorTarget = Math.max(60, Math.min(150, Number.parseInt(environment.BOT_FLOOR_TARGET ?? "100", 10)));
  return {
    floorTarget,
    maxServerBots: floorTarget,
    reserveSlots: 50,
    checkEveryTicks: 25,
  };
}

function classRollFor(index: number, team: Team): PlayerClass {
  const roll = index % 20;
  return roll === 0 ? (team === Team.Ottoman ? PlayerClass.Janissary : PlayerClass.Guardsman)
    : roll === 1 ? (team === Team.Ottoman ? PlayerClass.Mehter : PlayerClass.Priest)
      : roll === 2 ? (team === Team.Ottoman ? PlayerClass.Sipahi : PlayerClass.Knight)
        // Ottoman artillery crews the mobile siege cannons, so it rolls twice
        // as often as the Byzantine wall-gun class (siege-loop phase).
        : roll === 3 || (roll === 7 && team === Team.Ottoman) ? (team === Team.Ottoman ? PlayerClass.Topcu : PlayerClass.WallGunner)
          : (team === Team.Ottoman ? PlayerClass.Janissary : PlayerClass.Guardsman);
}

export class BotBackfill {
  readonly #world: WorldState;
  readonly #config: BackfillConfig;
  readonly #bots = new Map<number, ServerBot>();
  readonly #perception = new Map<number, EntityState>();
  #nextIndex = 1;
  /** Phase 8e-19 Task 1: dev-admin bot-count override (0-150); the #backfill
   * pass prunes or fills to match it. Undefined = the config floor. */
  #floorOverride: number | undefined;

  constructor(world: WorldState, config: BackfillConfig) {
    this.#world = world;
    this.#config = config;
  }

  get count(): number {
    return this.#bots.size;
  }

  get maxServerBots(): number {
    return this.#config.maxServerBots;
  }

  /** Effective floor target — the admin override when set, else the config. */
  get floorTarget(): number {
    return this.#floorOverride ?? this.#config.floorTarget;
  }

  /** Phase 8e-19 Task 1: dev-admin bot count (clamped 0-150 here too, so a
   * misbehaving caller cannot blow past MAX_PLAYERS). */
  setFloorTarget(target: number): void {
    this.#floorOverride = Math.max(0, Math.min(150, Math.trunc(target)));
  }

  botsOnTeam(team: Team): readonly ServerBot[] {
    const onTeam: ServerBot[] = [];
    for (const bot of this.#bots.values()) if (bot.team === team) onTeam.push(bot);
    return onTeam;
  }

  isServerBot(entityId: number): boolean {
    return this.#bots.has(entityId);
  }

  /** Removes the lowest-tenure (oldest join) bot on a team; returns true if one was evicted. */
  evictLowestTenureOnTeam(team: Team): boolean {
    let victim: ServerBot | undefined;
    for (const bot of this.#bots.values()) {
      if (bot.team !== team) continue;
      if (victim === undefined || bot.joinedAtTick < victim.joinedAtTick) victim = bot;
    }
    if (victim === undefined) return false;
    this.remove(victim.entityId);
    return true;
  }

  /** Removes a server bot by entity id (also used if a bot is displaced by other means). */
  remove(entityId: number): void {
    const bot = this.#bots.get(entityId);
    if (bot === undefined) return;
    this.#bots.delete(entityId);
    removePlayer(this.#world, entityId);
  }

  /** Called once per tick from the server loop. */
  step(tick: number): void {
    if (this.#bots.size > 0) {
      this.#rebuildPerception();
      const now = performance.now();
      for (const bot of this.#bots.values()) this.#feedBot(bot, tick, now);
    }
    if (tick % this.#config.checkEveryTicks === 0) this.#backfill(tick);
  }

  #feedBot(bot: ServerBot, tick: number, now: number): void {
    // Phase 8e-19 Task 1: playtest modes. In any non-battle mode the Topcu
    // cannon-crew branch yields to the brain's own decision (standing parks
    // them, walking patrols); the combat freeze then strips Fire/Melee from
    // whatever decision survived — the crew branch never sees a gun.
    const mode = getBotBehaviorMode();
    const decision = bot.team === Team.Ottoman && bot.brain.playerClass === PlayerClass.Topcu && mode === "battle"
      ? this.#cannonCrewDecision(bot, tick)
      : bot.brain.decide(this.#perception, bot.entityId, now, this.#world.wallState);
    const buttons = isBotCombatFrozen() ? decision.buttons & ~(InputButton.Fire | InputButton.Melee) : decision.buttons;
    bot.seq = (bot.seq + 1) >>> 0;
    enqueueInput(this.#world, bot.entityId, {
      seq: bot.seq,
      lastSnapshotTick: tick,
      buttons,
      yaw: decision.yaw,
      pitch: decision.pitch,
      dtMs: FIXED_DT_MS,
    });
    bot.lastInputTick = tick;
  }

  /**
   * Minimal siege-loop exercise for Ottoman Topcu bots: walk to the nearest
   * not-fully-crewed cannon and board it (gunner seat if free, else pusher),
   * pushers steer the carriage at the weakest non-breached wall segment, and
   * the gunner deploys within ~80 m of it and holds Fire on the wall. Not
   * meant to play well — meant to keep the loop moving.
   */
  #cannonCrewDecision(bot: ServerBot, tick: number): { buttons: number; yaw: number; pitch: number } {
    const world = this.#world;
    const cannons = world.cannons;
    let targetX = 0;
    let targetZ = 0;
    let weakestHp = Infinity;
    for (const segment of WALL_SEGMENTS) {
      if (world.wallState[segment.id] === WallState.Breached) continue;
      const hp = world.wallHp[segment.id] ?? 0;
      if (hp < weakestHp) {
        weakestHp = hp;
        targetX = segment.box.x;
        targetZ = segment.box.z;
      }
    }
    const crewIndex = world.cannonCrew[bot.slot] ?? -1;
    if (crewIndex >= 0 && cannons.active[crewIndex] === 1 && (cannons.hp[crewIndex] ?? 0) > 0) {
      const cannonX = cannons.x[crewIndex] ?? 0;
      const cannonZ = cannons.z[crewIndex] ?? 0;
      const yaw = Math.atan2(-(targetX - cannonX), -(targetZ - cannonZ));
      if ((cannons.gunner[crewIndex] ?? -1) === bot.slot) {
        const deployed = (cannons.deployed[crewIndex] ?? 0) === 1;
        const distance = Math.hypot(targetX - cannonX, targetZ - cannonZ);
        // A held Fire edge starts the deploy; once deployed the same held
        // button fires at the wall. Before deploy, Fire is the deploy trigger
        // and is only armed when no pusher is attached (deploy is rejected
        // while the carriage is being pushed) — waiting with buttons 0
        // preserves the trigger edge for the moment the pushers release,
        // otherwise a pusher bot left the gunner holding a dead edge forever.
        if (deployed) return { buttons: InputButton.Fire, yaw, pitch: 0.35 };
        if (distance <= 80 && cannonPusherCount(cannons, crewIndex) === 0) return { buttons: InputButton.Fire, yaw, pitch: 0.35 };
        return { buttons: 0, yaw, pitch: 0.35 };
      }
      // Pusher: steer the carriage at the wall. A cannon pinned against the
      // blockout with pushers attached can never deploy (deploy requires
      // pusherCount === 0), so a pusher that has stopped advancing releases
      // the station — the deadlock fix: without this, the siege loop froze
      // with the gunner holding Fire into the wall forever.
      const advanced = Math.abs(cannonX - bot.pushProbeX) + Math.abs(cannonZ - bot.pushProbeZ) > 0.05;
      bot.pushProbeX = cannonX;
      bot.pushProbeZ = cannonZ;
      bot.pushStuckTicks = advanced ? 0 : bot.pushStuckTicks + 1;
      if (bot.pushStuckTicks >= PUSHER_STUCK_TICKS) {
        bot.pushStuckTicks = 0;
        bot.cannonAvoidIndex = crewIndex;
        bot.cannonAvoidUntilTick = tick + CANNON_AVOID_TICKS;
        if (tick >= bot.interactCooldownUntilTick) {
          bot.interactCooldownUntilTick = tick + 15;
          return { buttons: InputButton.Interact, yaw, pitch: 0 };
        }
      }
      return { buttons: InputButton.Forward, yaw, pitch: 0 };
    }
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let index = 0; index < MAX_SIEGE_CANNONS; index += 1) {
      if (cannons.active[index] === 0 || (cannons.hp[index] ?? 0) === 0) continue;
      // A deployed carriage cannot take pushers, and a cannon this bot just
      // released is pinned — skip both so the crew search keeps moving.
      if ((cannons.deployed[index] ?? 0) === 1) continue;
      if (tick < bot.cannonAvoidUntilTick && index === bot.cannonAvoidIndex) continue;
      if ((cannons.gunner[index] ?? -1) >= 0 && cannonPusherCount(cannons, index) >= 2) continue;
      const distance = Math.hypot((world.x[bot.slot] ?? 0) - (cannons.x[index] ?? 0), (world.z[bot.slot] ?? 0) - (cannons.z[index] ?? 0));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    if (nearest < 0) return { buttons: 0, yaw: 0, pitch: 0 };
    const dx = (cannons.x[nearest] ?? 0) - (world.x[bot.slot] ?? 0);
    const dz = (cannons.z[nearest] ?? 0) - (world.z[bot.slot] ?? 0);
    const yaw = Math.atan2(-dx, -dz);
    if (nearestDistance <= SIEGE_CANNON_BOARD_RADIUS - 0.5) {
      // tryInteract is level-triggered at 0.5 s, so pulse Interact once and
      // stand by while the board registers (a held button would re-trigger
      // and immediately release the station again).
      if (tick >= bot.interactCooldownUntilTick) {
        bot.interactCooldownUntilTick = tick + 15;
        return { buttons: InputButton.Interact, yaw, pitch: 0 };
      }
      return { buttons: 0, yaw, pitch: 0 };
    }
    return { buttons: InputButton.Forward, yaw, pitch: 0 };
  }

  #backfill(tick: number): void {
    // Phase 8e-19 Task 1: the admin override prunes the roster when lowered
    // (lowest-tenure bots leave first, same eviction rule as human joins).
    const effectiveFloor = this.floorTarget;
    const effectiveMax = Math.max(this.#config.maxServerBots, effectiveFloor);
    const perTeam = Math.ceil(effectiveFloor / 2);
    const hardCeiling = MAX_PLAYERS - this.#config.reserveSlots;
    for (const team of [Team.Ottoman, Team.Byzantine]) {
      while (this.botsOnTeam(team).length > perTeam) {
        if (!this.evictLowestTenureOnTeam(team)) break;
      }
      while (this.#bots.size < effectiveMax && this.#world.count < hardCeiling) {
        const humansOnTeam = this.#humanCountOnTeam(team);
        if (humansOnTeam + this.botsOnTeam(team).length >= perTeam) break;
        if (!this.#spawnBot(team, tick)) break;
      }
    }
  }

  #humanCountOnTeam(team: Team): number {
    let humans = 0;
    for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
      if (this.#world.active[slot] === 0) continue;
      if ((this.#world.team[slot] ?? Team.None) !== team) continue;
      if (this.#bots.has(this.#world.entityId[slot] ?? 0)) continue;
      humans += 1;
    }
    return humans;
  }

  #spawnBot(team: Team, tick: number): boolean {
    const index = this.#nextIndex;
    this.#nextIndex += 1;
    const playerClass = classRollFor(index, team);
    const brain = new BotBrain(index, team, playerClass, performance.now());
    const name = `Bot ${String(index).padStart(4, "0")}`;
    const spawned = addPlayer(this.#world, name, team, playerClass, true);
    if (spawned === undefined) return false;
    this.#bots.set(spawned.entityId, {
      entityId: spawned.entityId,
      slot: spawned.slot,
      team,
      brain,
      joinedAtTick: tick,
      lastInputTick: tick,
      seq: 0,
      interactCooldownUntilTick: 0,
      pushProbeX: this.#world.x[spawned.slot] ?? 0,
      pushProbeZ: this.#world.z[spawned.slot] ?? 0,
      pushStuckTicks: 0,
      cannonAvoidIndex: -1,
      cannonAvoidUntilTick: 0,
    });
    return true;
  }

  #rebuildPerception(): void {
    const perception = this.#perception;
    for (const entityId of perception.keys()) {
      if (!this.#world.slotByEntityId.has(entityId) && !isVehicleEntityId(entityId)) perception.delete(entityId);
    }
    for (const [entityId, slot] of this.#world.slotByEntityId) {
      let state = perception.get(entityId);
      if (state === undefined) {
        state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        perception.set(entityId, state);
      }
      state.x = this.#world.x[slot] ?? 0;
      state.y = this.#world.y[slot] ?? 0;
      state.z = this.#world.z[slot] ?? 0;
      state.yaw = this.#world.yaw[slot] ?? 0;
      state.pitch = this.#world.pitch[slot] ?? 0;
      state.team = this.#world.team[slot] as Team;
      state.flags = this.#world.flags[slot] ?? 0;
      state.ammo = this.#world.ammo[slot] ?? 0;
      state.playerClass = this.#world.playerClass[slot] as PlayerClass;
      state.mounted = this.#world.mounted[slot] !== 0;
    }
    for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
      if (this.#world.vehicles.active[vehicleIndex] === 0) continue;
      const entityId = vehicleEntityId(vehicleIndex);
      let state = perception.get(entityId);
      if (state === undefined) {
        state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
        perception.set(entityId, state);
      }
      state.x = this.#world.vehicles.x[vehicleIndex] ?? 0;
      state.y = 0;
      state.z = this.#world.vehicles.z[vehicleIndex] ?? 0;
      state.yaw = this.#world.vehicles.yaw[vehicleIndex] ?? 0;
      state.team = this.#world.vehicles.team[vehicleIndex] as Team;
      state.shipKind = EntityKind.Galley;
    }
  }
}

function isVehicleEntityId(entityId: number): boolean {
  return entityId >= 10_000;
}
