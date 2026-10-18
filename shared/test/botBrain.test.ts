import { describe, expect, it } from "vitest";
import { BotBrain, BotNavigator, drySteerTarget, waterHazard } from "../src/botBrain";
import { GROUND_CENTER_Y, InputButton, PlayerClass, PlayerFlag, Team } from "../src/constants";
import type { EntityState } from "../src/protocol";

/**
 * Direct unit assertions on the shared bot brain. The 150-bot steering fixture
 * (server/test/botSteering.test.ts) drives `decide()` at scale but asserts
 * steering outcomes only; the fire rhythm, reload, melee, dead-player, and
 * sailor branches below are the parts the phase 8e-2 volley work changed and
 * nothing asserted directly.
 */

function withFixedRandom<T>(value: number, run: () => T): T {
  const original = Math.random;
  Math.random = () => value;
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

function state(entityId: number, team: Team, flags: number, x = 0, z = 0, ammo = 10, health = 100): EntityState {
  return { entityId, x, y: GROUND_CENTER_Y, z, yaw: 0, pitch: 0, team, flags, ammo, health };
}

function brain(index = 0, playerClass = PlayerClass.Janissary, now = 0): BotBrain {
  return withFixedRandom(0.5, () => new BotBrain(index, Team.Ottoman, playerClass, now));
}

/** decide() consumes Math.random internally, so every call must stay inside the fixed window. */
function decide(bot: BotBrain, entities: ReadonlyMap<number, EntityState>, selfId: number, now: number): ReturnType<BotBrain["decide"]> {
  return withFixedRandom(0.5, () => bot.decide(entities, selfId, now));
}

describe("bot fire rhythm (8e-2 hold-off)", () => {
  it("holds the first shot after acquiring a target, then fires on later reactions", () => {
    const bot = brain(2);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const enemy = state(2, Team.Byzantine, PlayerFlag.Alive, 10, 0); // 10 m away
    const entities = new Map<number, EntityState>([[self.entityId, self], [enemy.entityId, enemy]]);

    // First reaction after acquisition: hold-off armed, no Fire yet.
    const first = decide(bot, entities, self.entityId, 250);
    expect(first.buttons & InputButton.Fire).toBe(0);
    // Hold-off max is 120 + 480 = 600 ms after the reaction that armed it.
    const next = decide(bot, entities, self.entityId, 250 + 610);
    expect(next.buttons & InputButton.Fire).not.toBe(0);
  });

  it("re-arms the hold-off after the target leaves range", () => {
    const bot = brain(2);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    decide(bot, entities, self.entityId, 250); // no enemy: no hold-off

    const enemy = state(2, Team.Byzantine, PlayerFlag.Alive, 10, 0);
    entities.set(enemy.entityId, enemy);
    decide(bot, entities, self.entityId, 500); // acquire -> arm
    expect(decide(bot, entities, self.entityId, 510).buttons & InputButton.Fire).toBe(0);

    entities.set(enemy.entityId, { ...enemy, z: 200 }); // target lost
    decide(bot, entities, self.entityId, 1_600);
    entities.set(enemy.entityId, { ...enemy, z: 0 }); // re-acquired
    const reacquired = decide(bot, entities, self.entityId, 1_700);
    expect(reacquired.buttons & InputButton.Fire).toBe(0);
  });

  it("does not fire within the reaction window before the first re-decision", () => {
    const bot = brain(2);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const enemy = state(2, Team.Byzantine, PlayerFlag.Alive, 10, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self], [enemy.entityId, enemy]]);
    const decision = decide(bot, entities, self.entityId, 10);
    expect(decision.buttons & InputButton.Fire).toBe(0);
  });
});

describe("bot combat decisions", () => {
  it("requests a reload when the magazine is empty", () => {
    const bot = brain(3);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0, 0);
    const enemy = state(2, Team.Byzantine, PlayerFlag.Alive, 10, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self], [enemy.entityId, enemy]]);
    const decision = decide(bot, entities, self.entityId, 250 + 610);
    expect(decision.buttons & InputButton.Reload).not.toBe(0);
  });

  it("raises melee only point-blank and keeps moving otherwise", () => {
    const bot = brain(3);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const enemy = state(2, Team.Byzantine, PlayerFlag.Alive, 2, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self], [enemy.entityId, enemy]]);
    const close = decide(bot, entities, self.entityId, 250 + 610);
    expect(close.buttons & InputButton.Melee).not.toBe(0);
    expect(close.buttons & InputButton.Forward).not.toBe(0);

    entities.set(enemy.entityId, { ...enemy, x: 40 });
    const far = decide(bot, entities, self.entityId, 1_500);
    expect(far.buttons & InputButton.Melee).toBe(0);
  });

  it("emits no movement or combat buttons while dead", () => {
    const bot = brain(3);
    const self = state(1, Team.Ottoman, 0, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    const decision = decide(bot, entities, self.entityId, 1_000);
    expect(decision.buttons).toBe(0);
  });

  it("ignores dead and allied entities when picking a target", () => {
    const bot = brain(3);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([
      [self.entityId, self],
      [2, state(2, Team.Ottoman, PlayerFlag.Alive, 3, 0)],
      [3, state(3, Team.Byzantine, 0, 4, 0)],
      [4, state(4, Team.Byzantine, PlayerFlag.Alive, 8, 0)],
    ]);
    // Only entity 4 is a live enemy; the bot must face it (steering heads to
    // the 8 m target) and fire once the acquisition hold-off has elapsed.
    const armed = decide(bot, entities, self.entityId, 250 + 610);
    expect(armed.buttons & InputButton.Fire).toBe(0);
    const decision = decide(bot, entities, self.entityId, 1_500);
    expect(decision.buttons & InputButton.Fire).not.toBe(0);
  });
});

describe("bot reaction cadence", () => {
  it("staggers first reactions by stable cohorts (50 ms per cohort)", () => {
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    const cohort2 = brain(2); // nextReactionAt = 100
    const cohort3 = brain(3); // nextReactionAt = 150
    // Before either reaction lands, no steering happened: yaw stays at its
    // init value (0 with the fixed RNG).
    decide(cohort2, entities, self.entityId, 0);
    decide(cohort3, entities, self.entityId, 0);
    expect(cohort2.yaw).toBe(0);
    expect(cohort3.yaw).toBe(0);
    // At t=100 the cohort-2 bot re-decides (steers toward its waypoint) while
    // the cohort-3 bot is still inside its stagger window.
    decide(cohort2, entities, self.entityId, 100);
    decide(cohort3, entities, self.entityId, 100);
    expect(cohort2.yaw).not.toBe(0);
    expect(cohort3.yaw).toBe(0);
    // At t=150 the cohort-3 bot joins; its re-decision steering differs from
    // the idle yaw.
    decide(cohort3, entities, self.entityId, 150);
    expect(cohort3.yaw).not.toBe(0);
  });
});

describe("bot sailor decisions", () => {
  it("stands still when dead and only interacts at boarding distance", () => {
    const bot = brain(0, PlayerClass.Janissary);
    const self = state(1, Team.Ottoman, 0, 0, 0);
    const galley = state(2, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    galley.shipKind = 1;
    const entities = new Map<number, EntityState>([[self.entityId, self], [galley.entityId, galley]]);
    const dead = decide(bot, entities, self.entityId, 100);
    expect(dead.buttons).toBe(0);

    const alive = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities2 = new Map<number, EntityState>([[alive.entityId, alive], [galley.entityId, galley]]);
    const decision = decide(bot, entities2, alive.entityId, 100);
    expect(decision.buttons & InputButton.Forward).not.toBe(0);
  });
});

describe("bot water avoidance (8e-16)", () => {
  // The Ottoman dock waypoint sits ON pier-0's deck (x -284±3, z 236±8), so
  // the waypoint itself is dry by the server's drain predicate while the
  // Golden Horn around it (z > 230 off-deck) is not.
  const DOCK = { x: -284, z: 232 };
  const scratch = (): { x: number; z: number } => ({ x: 0, z: 0 });

  it("classifies the Golden Horn, the pier deck, and dry land correctly", () => {
    expect(waterHazard(-276, 240)).toBe(true); // open water beside the pier
    expect(waterHazard(DOCK.x, DOCK.z)).toBe(false); // pier deck — dry
    expect(waterHazard(0, 100)).toBe(false); // inland
    expect(waterHazard(0, 228)).toBe(false); // wade band is not deep
  });

  it("re-scatters a wet waypoint target and falls back to the pier deck", () => {
    const out = scratch();
    // Fixed RNG at 0.999 scatters (+7.98, +7.98) — straight into open water;
    // every re-roll is equally wet, so the guard must land on the waypoint.
    drySteerTarget(DOCK.x, 220, -276, 240, DOCK.x, DOCK.z, false, () => 0.999, out);
    expect(out.x).toBe(DOCK.x);
    expect(out.z).toBe(DOCK.z);
    expect(waterHazard(out.x, out.z)).toBe(false);
  });

  it("keeps a dry scatter untouched", () => {
    const out = scratch();
    drySteerTarget(0, 100, 4, 104, 0, 72, false, () => 0.5, out);
    expect(out).toEqual({ x: 4, z: 104 });
  });

  it("holds at the waterline instead of chasing an enemy into the sea", () => {
    const out = scratch();
    drySteerTarget(10, 220, 10, 240, DOCK.x, DOCK.z, true, () => 0.5, out);
    expect(out).toEqual({ x: 10, z: 220 }); // self — hold, keep shooting
  });

  it("walks a bot already in deep water toward the nearest dry heading", () => {
    const out = scratch();
    // Bot standing in open water south of the pier; its target is wet too.
    drySteerTarget(-276, 238, -276, 244, DOCK.x, DOCK.z, true, () => 0.5, out);
    expect(waterHazard(out.x, out.z)).toBe(false);
    // The probe found a dry point one probe-step (12 m) away.
    expect(Math.hypot(out.x - -276, out.z - 238)).toBeCloseTo(12, 5);
  });

  it("decide() never steers a dock-anchored bot into the Golden Horn", () => {
    // brain()'s fixed 0.5 constructor RNG picks OTTOMAN_WAYPOINTS[4] — the
    // galley-dock waypoint — so this exercises the real decision path.
    const bot = brain(2);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, DOCK.x, 220);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    // RNG 0.999 makes every scatter maximally wet (+8, +8 off the waypoint).
    const decision = withFixedRandom(0.999, () => bot.decide(entities, self.entityId, 250));
    // The guard falls back to the pier waypoint: from (x,220) toward
    // (x,232) is due +Z — yaw π (or -π). Unguarded steering toward
    // (-276,240) would sit ~0.38 rad off that bearing.
    expect(Math.abs(Math.abs(decision.yaw) - Math.PI)).toBeLessThan(0.01);
  });
});

describe("sailor boarding water guard (8e-16)", () => {
  // brain(0) is a sailor (index % 20 === 0). Ottoman galley dock 0 sits at
  // (-284, 242), at the end of pier 0 (x -284±3, z 228–244, dry via onDeck).
  const GALLEY = { x: -284, z: 242 };
  function sailorEntities(selfX: number, selfZ: number, galleyX = GALLEY.x, galleyZ = GALLEY.z): { entities: Map<number, EntityState>; selfId: number } {
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, selfX, selfZ);
    const galley = state(2, Team.Ottoman, PlayerFlag.Alive, galleyX, galleyZ);
    galley.shipKind = 1;
    return { entities: new Map<number, EntityState>([[self.entityId, self], [galley.entityId, galley]]), selfId: self.entityId };
  }

  it("a sailor already in the Golden Horn wades shoreward and never Interacts", () => {
    const bot = brain(0);
    const { entities, selfId } = sailorEntities(-276, 240); // open water beside pier 0
    const decision = decide(bot, entities, selfId, 100);
    expect(decision.buttons & InputButton.Forward).not.toBe(0);
    expect(decision.buttons & InputButton.Interact).toBe(0);
    // yaw 0 walks -z — back toward the shore, same as the low-health retreat.
    expect(Math.abs(decision.yaw)).toBeLessThan(0.01);
  });

  it("a shore sailor aims at the pier-root line, not straight at the ship", () => {
    const bot = brain(0);
    const { entities, selfId } = sailorEntities(-260, 210); // dry land
    const decision = decide(bot, entities, selfId, 100);
    // Guarded target: (-284, 229) — pier root, dry (wade band + onDeck).
    const expected = Math.atan2(-(-284 - -260), -(229 - 210));
    expect(decision.yaw).toBeCloseTo(expected, 5);
    // The direct-to-ship bearing is ~0.26 rad off — this is what used to
    // walk sailors into the water beside the pier.
    const direct = Math.atan2(-(GALLEY.x - -260), -(GALLEY.z - 210));
    expect(Math.abs(decision.yaw - direct)).toBeGreaterThan(0.2);
    expect(waterHazard(-284, 229)).toBe(false);
  });

  it("a sailor on the pier deck walks straight down it to the galley", () => {
    const bot = brain(0);
    const { entities, selfId } = sailorEntities(-284, 232); // pier 0 deck
    const decision = decide(bot, entities, selfId, 100);
    // Straight +z along the pier — yaw π.
    expect(Math.abs(Math.abs(decision.yaw) - Math.PI)).toBeLessThan(0.01);
  });

  it("a sailing galley (mid-harbour) lures the sailor only to the waterline", () => {
    const bot = brain(0);
    const { entities, selfId } = sailorEntities(-260, 210, 0, 250); // galley sailing
    const decision = decide(bot, entities, selfId, 100);
    // Walks to (0, 229) — the shore directly below the ship — and parks dry.
    const expected = Math.atan2(-(0 - -260), -(229 - 210));
    expect(decision.yaw).toBeCloseTo(expected, 5);
  });
});

describe("navigator reuses its decision object", () => {
  it("never allocates a fresh BotDecision per decide call", () => {
    const bot = brain(1);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    const first = decide(bot, entities, self.entityId, 0);
    const second = decide(bot, entities, self.entityId, 50);
    expect(second).toBe(first);
  });

  it("returns zero turn when already at the target", () => {
    const navigator = new BotNavigator(0);
    expect(navigator.steer(10, GROUND_CENTER_Y, 10, 10, 10)).toBe(0);
  });
});

describe("bot anti-stuck escape (Phase 8e-25)", () => {
  it("forces waypoint re-rolls while a wanderer is wedged with no progress", () => {
    const bot = brain(4);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    // First reaction baselines the position; the bot then stands still
    // (wedged against a concave corner) for several check windows.
    decide(bot, entities, self.entityId, 250);
    expect(bot.stuckEscapes).toBe(0);
    for (let now = 500; now <= 6_000; now += 250) decide(bot, entities, self.entityId, now);
    expect(bot.stuckEscapes).toBeGreaterThan(0);
  });

  it("resets the escape counter as soon as the bot makes real progress", () => {
    const bot = brain(4);
    const self = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    const entities = new Map<number, EntityState>([[self.entityId, self]]);
    decide(bot, entities, self.entityId, 250);
    for (let now = 500; now <= 6_000; now += 250) decide(bot, entities, self.entityId, now);
    expect(bot.stuckEscapes).toBeGreaterThan(0);
    // The bot is un-wedged and keeps walking (30 m per decision, far past
    // the progress threshold per check window) — the counter must stay 0.
    const moving = state(1, Team.Ottoman, PlayerFlag.Alive, 0, 0);
    entities.set(moving.entityId, moving);
    for (let now = 6_250; now <= 9_000; now += 250) {
      moving.x += 30;
      moving.z += 30;
      decide(bot, entities, self.entityId, now);
    }
    expect(bot.stuckEscapes).toBe(0);
  });
});
