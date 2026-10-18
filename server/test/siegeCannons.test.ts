import { describe, expect, it } from "vitest";
import {
  ARTILLERY_EMPLACEMENTS,
  ARTILLERY_SOLO_RELOAD_SECONDS,
  BOMBARD_SOLO_RELOAD_SECONDS,
  BOMBARD_WALL_DAMAGE,
  CombatEventType,
  FIXED_DT_MS,
  FIXED_DT_SECONDS,
  PERSONAL_CANNON_HP,
  PERSONAL_CANNON_WALL_DAMAGE,
  PlayerClass,
  InputButton,
  PlayerFlag,
  SIEGE_CANNON_HP,
  SIEGE_CANNON_PUSH_SPEED_CREW,
  SIEGE_CANNON_PUSH_SPEED_SOLO,
  SIEGE_LADDERS,
  Team,
  WALL_SEGMENT_HEALTH,
  WallState,
  XP_ARTILLERY_WALL_HIT,
  XP_BREACH_CONTRIBUTOR,
  XP_BREACH_CREATED,
  XP_CANNON_DESTROYED,
} from "@janissary/shared";
import {
  addPlayer,
  createWorldState,
  drainWallEvents,
  enqueueInput,
  stepWorld,
  wallHpFractions,
  type WorldState,
} from "../src/sim/world";
import { CANNON_PROJECTILE_GUN_BASE, cannonEntityId, cannonProjectileGunId } from "../src/sim/cannon";

interface TestPlayer {
  entityId: number;
  slot: number;
}

function player(world: WorldState, name: string, team: Team, playerClass?: PlayerClass): TestPlayer {
  const added = addPlayer(world, name, team);
  if (added === undefined) throw new Error("Slots unavailable");
  if (playerClass !== undefined) {
    // Bypass the class caps: these tests need specific crew compositions.
    world.desiredClass[added.slot] = playerClass;
    world.playerClass[added.slot] = playerClass;
  }
  return added;
}

function place(world: WorldState, target: TestPlayer, x: number, z: number): void {
  world.x[target.slot] = x;
  world.z[target.slot] = z;
}

/** Input sequence numbers must keep increasing per entity across runs. */
const inputSeqs = new WeakMap<WorldState, Map<number, number>>();

/** Feeds each listed player one input per tick and steps the world. */
function run(world: WorldState, inputs: { player: TestPlayer; buttons: number; yaw?: number; pitch?: number }[], ticks: number): void {
  let seqs = inputSeqs.get(world);
  if (seqs === undefined) {
    seqs = new Map<number, number>();
    inputSeqs.set(world, seqs);
  }
  for (let index = 0; index < ticks; index += 1) {
    for (const entry of inputs) {
      const seq = (seqs.get(entry.player.entityId) ?? 0) + 1;
      seqs.set(entry.player.entityId, seq);
      enqueueInput(world, entry.player.entityId, {
        seq,
        lastSnapshotTick: 0,
        buttons: entry.buttons,
        yaw: entry.yaw ?? 0,
        pitch: entry.pitch ?? 0,
        dtMs: FIXED_DT_MS,
      });
    }
    stepWorld(world);
  }
}

function boardCannon(world: WorldState, target: TestPlayer, cannonIndex: number): void {
  place(world, target, world.cannons.x[cannonIndex] ?? 0, (world.cannons.z[cannonIndex] ?? 0) + 1);
  run(world, [{ player: target, buttons: InputButton.Interact }], 1);
}

function pushYaw(): number {
  // Cannon forward = (-sin(yaw), -cos(yaw)); yaw 0 pushes toward -z (the wall).
  return 0;
}

describe("siege cannons", () => {
  it("spawn active at the staging line with full HP and Ottoman ownership", () => {
    const world = createWorldState();
    expect(world.cannons.active[0]).toBe(1);
    expect(world.cannons.hp[0]).toBe(SIEGE_CANNON_HP);
    expect(world.cannons.team[0]).toBe(Team.Ottoman);
    expect(world.cannons.x[0]).toBeCloseTo(-24, 3);
    expect(world.cannons.z[0]).toBeCloseTo(84, 3);
  });

  it("gives each accepted Topçu one owner-bound light field gun", () => {
    const world = createWorldState();
    const topcu = addPlayer(world, "topcu", Team.Ottoman, PlayerClass.Topcu);
    expect(topcu).toBeDefined();
    if (topcu === undefined) return;
    const fieldGuns = [] as number[];
    for (let index = 4; index < world.cannons.active.length; index += 1) {
      if (world.cannons.active[index] !== 0) fieldGuns.push(index);
    }
    expect(fieldGuns).toHaveLength(1);
    const index = fieldGuns[0] ?? -1;
    expect(world.playerClass[topcu.slot]).toBe(PlayerClass.Topcu);
    expect(world.cannons.personal[index]).toBe(1);
    expect(world.cannons.ownerSlot[index]).toBe(topcu.slot);
    expect(world.cannons.hp[index]).toBe(PERSONAL_CANNON_HP);
    expect(world.cannons.hp[index]).toBeLessThan(SIEGE_CANNON_HP);
  });

  it("lets a Topçu deploy and fire the personal gun through the wall-impact path", () => {
    const world = createWorldState();
    const topcu = addPlayer(world, "topcu", Team.Ottoman, PlayerClass.Topcu);
    expect(topcu).toBeDefined();
    if (topcu === undefined) return;
    let index = -1;
    for (let candidate = 4; candidate < world.cannons.active.length; candidate += 1) {
      if (world.cannons.ownerSlot[candidate] === topcu.slot) { index = candidate; break; }
    }
    expect(index).toBeGreaterThanOrEqual(4);
    world.cannons.x[index] = -66;
    world.cannons.z[index] = 4;
    world.cannons.yaw[index] = 0;
    world.x[topcu.slot] = -66;
    world.z[topcu.slot] = 5;
    boardCannon(world, topcu, index);
    expect(world.cannons.gunner[index]).toBe(topcu.slot);
    run(world, [{ player: topcu, buttons: InputButton.Fire, yaw: 0, pitch: 0.3 }], 43);
    expect(world.cannons.deployed[index]).toBe(1);
    expect(world.events.some((event) => event.type === CombatEventType.ArtilleryFire && event.targetEntityId === cannonEntityId(index))).toBe(true);
    run(world, [{ player: topcu, buttons: 0 }], 20);
    expect(world.wallHp[0]).toBe(WALL_SEGMENT_HEALTH - PERSONAL_CANNON_WALL_DAMAGE);
    expect(world.warXp[topcu.slot] ?? 0).toBeGreaterThanOrEqual(XP_ARTILLERY_WALL_HIT);
  });

  it("spawns Sipahi mounted and leaves a public horse that an enemy infantryman can claim", () => {
    const world = createWorldState();
    const sipahi = addPlayer(world, "sipahi", Team.Ottoman, PlayerClass.Sipahi);
    const enemy = addPlayer(world, "enemy", Team.Byzantine, PlayerClass.Guardsman);
    expect(sipahi).toBeDefined();
    expect(enemy).toBeDefined();
    if (sipahi === undefined || enemy === undefined) return;
    expect(world.mounted[sipahi.slot]).toBe(1);
    run(world, [{ player: sipahi, buttons: InputButton.Interact }], 1);
    let horse = -1;
    for (let index = 0; index < world.horses.active.length; index += 1) if (world.horses.active[index] !== 0) { horse = index; break; }
    expect(horse).toBeGreaterThanOrEqual(0);
    world.x[enemy.slot] = world.horses.x[horse] ?? 0;
    world.z[enemy.slot] = world.horses.z[horse] ?? 0;
    run(world, [{ player: enemy, buttons: InputButton.Interact }], 1);
    expect(world.mounted[enemy.slot]).toBe(1);
    expect(world.horses.active[horse]).toBe(0);
  });

  it("moves at 1.4 m/s with one pusher and 2.0 m/s with two", () => {
    const solo = createWorldState();
    const pusherA = player(solo, "pusherA", Team.Ottoman);
    boardCannon(solo, pusherA, 0);
    expect(solo.cannonCrew[pusherA.slot]).toBe(0);
    expect((solo.flags[pusherA.slot] ?? 0) & PlayerFlag.PushingCannon).not.toBe(0);
    const startZ = solo.cannons.z[0] ?? 0;
    run(solo, [{ player: pusherA, buttons: InputButton.Forward, yaw: pushYaw() }], 100);
    const soloDistance = startZ - (solo.cannons.z[0] ?? 0);
    expect(soloDistance).toBeCloseTo(SIEGE_CANNON_PUSH_SPEED_SOLO * 100 * FIXED_DT_SECONDS, 1);
    expect(solo.cannons.yaw[0]).toBeCloseTo(0, 3);

    const crewed = createWorldState();
    const pusherB = player(crewed, "pusherB", Team.Ottoman);
    const pusherC = player(crewed, "pusherC", Team.Ottoman);
    boardCannon(crewed, pusherB, 0);
    boardCannon(crewed, pusherC, 0);
    const crewedStartZ = crewed.cannons.z[0] ?? 0;
    run(crewed, [
      { player: pusherB, buttons: InputButton.Forward, yaw: pushYaw() },
      { player: pusherC, buttons: InputButton.Forward, yaw: pushYaw() },
    ], 100);
    const crewedDistance = crewedStartZ - (crewed.cannons.z[0] ?? 0);
    expect(crewedDistance).toBeCloseTo(SIEGE_CANNON_PUSH_SPEED_CREW * 100 * FIXED_DT_SECONDS, 1);
    expect(crewedDistance).toBeGreaterThan(soloDistance);
  });

  it("cannot be pushed through an intact wall segment", () => {
    const world = createWorldState();
    world.cannons.x[0] = -66;
    world.cannons.z[0] = 4;
    const pusher = player(world, "pusher", Team.Ottoman);
    boardCannon(world, pusher, 0);
    run(world, [{ player: pusher, buttons: InputButton.Forward, yaw: pushYaw() }], 100);
    // The wall box (z ±1.5) plus the carriage radius (1.5) stops the cannon at z = 3.
    expect(world.cannons.z[0] ?? 0).toBeGreaterThan(2.9);
    expect(world.cannons.z[0] ?? 4).toBeLessThan(3.2);
  });

  it("stows the pusher's weapon while pushing", () => {
    const world = createWorldState();
    const pusher = player(world, "pusher", Team.Ottoman);
    boardCannon(world, pusher, 0);
    expect(world.ammo[pusher.slot]).toBe(1);
    run(world, [{ player: pusher, buttons: InputButton.Forward | InputButton.Fire | InputButton.Melee | InputButton.Reload, yaw: pushYaw() }], 20);
    expect(world.warShots[pusher.slot] ?? 0).toBe(0);
    expect(world.ammo[pusher.slot]).toBe(1);
    expect(world.nextMeleeTick[pusher.slot] ?? 0).toBe(0);
  });

  it("pays push XP only while the cannon is moving", () => {
    const world = createWorldState();
    const pusher = player(world, "pusher", Team.Ottoman);
    boardCannon(world, pusher, 0);
    run(world, [{ player: pusher, buttons: InputButton.Forward, yaw: pushYaw() }], 100);
    const afterPush = world.warXp[pusher.slot] ?? 0;
    expect(afterPush).toBeGreaterThanOrEqual(8);
    expect(afterPush).toBeLessThanOrEqual(12);
    // Accrual continues through the 5 s grace window, then stops: a further
    // idle stretch must add nothing.
    run(world, [{ player: pusher, buttons: 0 }], 140);
    const afterGrace = world.warXp[pusher.slot] ?? 0;
    run(world, [{ player: pusher, buttons: 0 }], 60);
    expect(world.warXp[pusher.slot] ?? 0).toBe(afterGrace);
  });

  it("gates firing behind the deploy timer and deploys only without pushers", () => {
    const world = createWorldState();
    const gunner = player(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    boardCannon(world, gunner, 0);
    expect(world.cannons.gunner[0]).toBe(gunner.slot);
    expect((world.flags[gunner.slot] ?? 0) & PlayerFlag.ManningArtillery).not.toBe(0);
    // A Fire edge while undeployed starts the 3 s deploy.
    run(world, [{ player: gunner, buttons: InputButton.Fire, yaw: 0, pitch: 0.3 }], 1);
    expect(world.cannons.deployUntilTick[0] ?? 0).toBeGreaterThan(world.tick);
    run(world, [{ player: gunner, buttons: InputButton.Fire, yaw: 0, pitch: 0.3 }], 30);
    expect(world.cannons.deployed[0]).toBe(0);
    expect(world.events.some((event) => event.type === CombatEventType.ArtilleryFire)).toBe(false);
    // 30 more ticks complete the deploy; the held Fire then fires immediately.
    run(world, [{ player: gunner, buttons: InputButton.Fire, yaw: 0, pitch: 0.3 }], 31);
    expect(world.cannons.deployed[0]).toBe(1);
    const fireEvent = world.events.find((event) => event.type === CombatEventType.ArtilleryFire);
    expect(fireEvent).toBeDefined();
    expect(fireEvent?.targetEntityId).toBe(cannonEntityId(0));
    expect(fireEvent?.value).toBe(cannonProjectileGunId(0));
    expect(world.cannons.reloadUntilTick[0] ?? 0).toBeGreaterThan(world.tick);
    expect((world.cannons.reloadUntilTick[0] ?? 0) - world.tick).toBeGreaterThanOrEqual(Math.ceil(BOMBARD_SOLO_RELOAD_SECONDS / FIXED_DT_SECONDS) - 1);
    expect((world.cannons.reloadUntilTick[0] ?? 0) - world.tick).toBeLessThanOrEqual(Math.ceil(BOMBARD_SOLO_RELOAD_SECONDS / FIXED_DT_SECONDS));
    // Interact while deployed immediately frees the gunner and starts the 2 s
    // undeploy animation, so the player can leave the operation.
    run(world, [{ player: gunner, buttons: InputButton.Interact }], 1);
    expect(world.cannons.undeployUntilTick[0] ?? 0).toBeGreaterThan(world.tick);
    expect(world.cannons.gunner[0]).toBe(-1);
    expect(world.cannonCrew[gunner.slot] ?? -1).toBe(-1);
    run(world, [{ player: gunner, buttons: 0 }], 41);
    expect(world.cannons.deployed[0]).toBe(0);
  });

  it("rejects pusher attach while deployed and cannot deploy with pushers attached", () => {
    const world = createWorldState();
    const gunner = player(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    const pusher = player(world, "pusher", Team.Ottoman);
    boardCannon(world, pusher, 0);
    boardCannon(world, gunner, 0);
    expect(world.cannons.gunner[0]).toBe(gunner.slot);
    // Pusher attached: the gunner's Fire edge must not start a deploy.
    run(world, [
      { player: gunner, buttons: InputButton.Fire },
      { player: pusher, buttons: 0 },
    ], 5);
    expect(world.cannons.deployUntilTick[0] ?? 0).toBe(0);
    expect(world.cannons.deployed[0]).toBe(0);
    // Deployed cannon: a second pusher cannot attach, and it cannot be pushed.
    world.cannons.deployed[0] = 1;
    const startZ = world.cannons.z[0] ?? 0;
    const late = player(world, "late", Team.Ottoman);
    boardCannon(world, late, 0);
    expect(world.cannonCrew[late.slot] ?? -1).toBe(-1);
    run(world, [
      { player: gunner, buttons: 0 },
      { player: pusher, buttons: InputButton.Forward, yaw: pushYaw() },
    ], 40);
    expect(world.cannons.z[0]).toBe(startZ);
  });

  it("releases the crew, pays killer and assist, and respawns at staging after 60 s", () => {
    const world = createWorldState();
    const gunner = player(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    const pusher = player(world, "pusher", Team.Ottoman);
    boardCannon(world, gunner, 0);
    boardCannon(world, pusher, 0);
    const assister = player(world, "assister", Team.Byzantine);
    const killer = player(world, "killer", Team.Byzantine);
    world.cannons.hp[0] = 60;
    // Stand on the far side of the carriage, clear of both crew sockets, so
    // the melee swings hit the cannon instead of the glued crew.
    place(world, assister, -24, 86.5);
    place(world, killer, -23, 86.5);
    // Blades equipped (slot 1): the 8e-3 butt stroke with a ranged slot in
    // hand is the weakest tier and would not finish the gun in two swings.
    world.activeWeaponSlot[assister.slot] = 1;
    world.activeWeaponSlot[killer.slot] = 1;
    run(world, [
      { player: gunner, buttons: 0 },
      { player: pusher, buttons: 0 },
      { player: assister, buttons: InputButton.Melee, yaw: 0 },
      { player: killer, buttons: InputButton.Melee, yaw: 0 },
    ], 2);
    expect(world.cannons.hp[0]).toBe(0);
    expect(world.events.some((event) => event.type === CombatEventType.CannonDestroyed
      && event.sourceEntityId === (world.entityId[killer.slot] ?? 0)
      && event.targetEntityId === cannonEntityId(0))).toBe(true);
    // Crew thrown clear.
    expect(world.cannons.gunner[0]).toBe(-1);
    expect(world.cannonCrew[gunner.slot] ?? -1).toBe(-1);
    expect(world.cannonCrew[pusher.slot] ?? -1).toBe(-1);
    expect((world.flags[pusher.slot] ?? 0) & PlayerFlag.PushingCannon).toBe(0);
    expect((world.flags[gunner.slot] ?? 0) & PlayerFlag.ManningArtillery).toBe(0);
    // Killer 100, assister half.
    expect(world.warXp[killer.slot] ?? 0).toBeGreaterThanOrEqual(XP_CANNON_DESTROYED);
    expect(world.warXp[assister.slot] ?? 0).toBeGreaterThanOrEqual(XP_CANNON_DESTROYED / 2);
    const respawnIn = (world.cannons.respawnAtTick[0] ?? 0) - world.tick;
    expect(respawnIn).toBeGreaterThanOrEqual(Math.ceil(60 / FIXED_DT_SECONDS) - 1);
    expect(respawnIn).toBeLessThanOrEqual(Math.ceil(60 / FIXED_DT_SECONDS));
    // Wreck stays put until the respawn tick, then returns to staging.
    run(world, [
      { player: gunner, buttons: 0 },
      { player: pusher, buttons: 0 },
      { player: assister, buttons: 0 },
      { player: killer, buttons: 0 },
    ], Math.ceil(60 / FIXED_DT_SECONDS) + 1);
    expect(world.cannons.hp[0]).toBe(SIEGE_CANNON_HP);
    expect(world.cannons.x[0]).toBeCloseTo(-24, 3);
    expect(world.cannons.z[0]).toBeCloseTo(84, 3);
    expect(world.cannons.team[0]).toBe(Team.Ottoman);
  });

  it("allows enemy capture only when the cannon has no crew", () => {
    const world = createWorldState();
    const pusher = player(world, "pusher", Team.Ottoman);
    const enemy = player(world, "enemy", Team.Byzantine, PlayerClass.WallGunner);
    boardCannon(world, pusher, 0);
    expect(world.cannonCrew[pusher.slot]).toBe(0);
    // Crewed enemy cannon: boarding is rejected.
    boardCannon(world, enemy, 0);
    expect(world.cannonCrew[enemy.slot] ?? -1).toBe(-1);
    expect(world.cannons.team[0]).toBe(Team.Ottoman);
    // Pusher steps off; now the uncrewed cannon is capturable. Feed the enemy
    // empty inputs too, clearing the stale Interact from the rejected attempt.
    run(world, [
      { player: pusher, buttons: 0 },
      { player: enemy, buttons: 0 },
    ], 12);
    run(world, [
      { player: pusher, buttons: InputButton.Interact },
      { player: enemy, buttons: 0 },
    ], 1);
    expect(world.cannonCrew[pusher.slot] ?? -1).toBe(-1);
    // Let the interact rate limit from the rejected attempts expire.
    run(world, [
      { player: pusher, buttons: 0 },
      { player: enemy, buttons: 0 },
    ], 12);
    boardCannon(world, enemy, 0);
    expect(world.cannons.gunner[0]).toBe(enemy.slot);
    expect(world.cannons.team[0]).toBe(Team.Byzantine);
  });

  it("damages wall segments through the existing bombard impact path", () => {
    const world = createWorldState();
    world.cannons.x[0] = -66;
    world.cannons.z[0] = 30;
    world.cannons.yaw[0] = 0;
    const gunner = player(world, "gunner", Team.Ottoman, PlayerClass.Topcu);
    boardCannon(world, gunner, 0);
    // Deploy (60 ticks), then the held Fire launches at the wall.
    run(world, [{ player: gunner, buttons: InputButton.Fire, yaw: 0, pitch: 0.1 }], 61);
    expect(world.cannons.deployed[0]).toBe(1);
    const fired = world.events.find((event) => event.type === CombatEventType.ArtilleryFire);
    expect(fired?.value).toBe(CANNON_PROJECTILE_GUN_BASE);
    run(world, [{ player: gunner, buttons: 0 }], 30);
    expect(world.wallHp[0]).toBe(WALL_SEGMENT_HEALTH - BOMBARD_WALL_DAMAGE);
    expect(world.wallState[0]).toBe(WallState.Intact);
    expect(world.warXp[gunner.slot] ?? 0).toBeGreaterThanOrEqual(XP_ARTILLERY_WALL_HIT);
    const events = drainWallEvents(world);
    const hit = events.find((event) => event.segmentId === 0);
    expect(hit).toBeDefined();
    expect(hit?.hpFrac).toBe(Math.round(((WALL_SEGMENT_HEALTH - BOMBARD_WALL_DAMAGE) / WALL_SEGMENT_HEALTH) * 16));
    expect(wallHpFractions(world)[0]).toBe(hit?.hpFrac);
  });

  it("keeps fixed wall-guns on the quick three-second reload profile", () => {
    const world = createWorldState();
    const gunner = player(world, "wall-gunner", Team.Byzantine, PlayerClass.WallGunner);
    const gun = ARTILLERY_EMPLACEMENTS[0];
    expect(gun).toBeDefined();
    if (gun === undefined) return;
    place(world, gunner, gun.x, gun.z);
    run(world, [{ player: gunner, buttons: InputButton.Interact }], 1);
    expect(world.mannedGun[gunner.slot]).toBe(0);
    run(world, [{ player: gunner, buttons: InputButton.Fire, yaw: gun.yaw, pitch: 0.3 }], 1);
    expect((world.gunReloadUntilTick[0] ?? 0) - world.tick).toBe(Math.ceil(ARTILLERY_SOLO_RELOAD_SECONDS / FIXED_DT_SECONDS));
  });

  it("lets either side traverse the generated siege ladder with F", () => {
    const world = createWorldState();
    const climber = player(world, "climber", Team.Ottoman);
    const ladder = SIEGE_LADDERS[0];
    expect(ladder).toBeDefined();
    if (ladder === undefined) return;
    place(world, climber, ladder.x, ladder.z + 0.4);
    run(world, [{ player: climber, buttons: InputButton.Interact }], 1);
    expect(world.x[climber.slot]).toBeCloseTo(ladder.x, 3);
    expect(world.z[climber.slot]).toBeCloseTo(ladder.z - ladder.crossingDepth, 3);
    run(world, [{ player: climber, buttons: 0 }], 12);
    run(world, [{ player: climber, buttons: InputButton.Interact }], 1);
    expect(world.z[climber.slot]).toBeCloseTo(ladder.z + ladder.crossingDepth, 3);
  });

  it("pays the breaching gunner, the contributors, and the crew share", () => {
    const world = createWorldState();
    world.wallHp[0] = 240;
    world.cannons.x[0] = -68;
    world.cannons.z[0] = 30;
    world.cannons.yaw[0] = 0;
    world.cannons.x[1] = -64;
    world.cannons.z[1] = 30;
    world.cannons.yaw[1] = 0;
    const gunnerA = player(world, "gunnerA", Team.Ottoman, PlayerClass.Topcu);
    const gunnerB = player(world, "gunnerB", Team.Ottoman, PlayerClass.Topcu);
    const crew = player(world, "crew", Team.Ottoman);
    boardCannon(world, gunnerA, 0);
    boardCannon(world, gunnerB, 1);
    place(world, crew, -64, 33);
    // Both deploy and fire once at segment 0; gunnerB's hit breaches it.
    run(world, [
      { player: gunnerA, buttons: InputButton.Fire, yaw: 0, pitch: 0.1 },
      { player: gunnerB, buttons: InputButton.Fire, yaw: 0, pitch: 0.1 },
      { player: crew, buttons: 0 },
    ], 61);
    expect(world.cannons.deployed[0]).toBe(1);
    expect(world.cannons.deployed[1]).toBe(1);
    run(world, [
      { player: gunnerA, buttons: 0 },
      { player: gunnerB, buttons: 0 },
      { player: crew, buttons: 0 },
    ], 30);
    expect(world.wallState[0]).toBe(WallState.Breached);
    // Breacher: 200 breach + 30 wall hit; contributor: 100 + 30 wall hit.
    expect(world.warXp[gunnerB.slot] ?? 0).toBeGreaterThanOrEqual(XP_BREACH_CREATED + XP_ARTILLERY_WALL_HIT);
    expect(world.warXp[gunnerA.slot] ?? 0).toBeGreaterThanOrEqual(XP_BREACH_CONTRIBUTOR + XP_ARTILLERY_WALL_HIT);
    // Crew within 4 m of a firing cannon earns a share on its wall hits.
    expect(world.warXp[crew.slot] ?? 0).toBeGreaterThanOrEqual(10);
  });

  it("repairs a Damaged segment back to Intact but never touches a breach", () => {
    const world = createWorldState();
    world.wallHp[0] = 400;
    world.wallState[0] = WallState.Damaged;
    const mender = player(world, "mender", Team.Byzantine);
    place(world, mender, -66, -3);
    run(world, [{ player: mender, buttons: InputButton.Interact | InputButton.Fire }], 100);
    expect(world.wallHp[0] ?? 0).toBeGreaterThan(400);
    // Repairing stows the weapon.
    expect(world.warShots[mender.slot] ?? 0).toBe(0);
    expect(world.warXp[mender.slot] ?? 0).toBeGreaterThanOrEqual(8);
    run(world, [{ player: mender, buttons: InputButton.Interact }], 120);
    expect(world.wallHp[0]).toBe(WALL_SEGMENT_HEALTH);
    expect(world.wallState[0]).toBe(WallState.Intact);
    const events = drainWallEvents(world);
    expect(events.some((event) => event.segmentId === 0 && event.state === WallState.Intact && event.hpFrac === 16)).toBe(true);

    const breachedWorld = createWorldState();
    breachedWorld.wallHp[1] = 0;
    breachedWorld.wallState[1] = WallState.Breached;
    const idle = player(breachedWorld, "idle", Team.Byzantine);
    place(breachedWorld, idle, -54, -3);
    run(breachedWorld, [{ player: idle, buttons: InputButton.Interact }], 40);
    expect(breachedWorld.wallHp[1]).toBe(0);
    expect(breachedWorld.wallState[1]).toBe(WallState.Breached);
    expect(breachedWorld.wallEventCount).toBe(0);
    expect(breachedWorld.warXp[idle.slot] ?? 0).toBe(0);
  });
});
