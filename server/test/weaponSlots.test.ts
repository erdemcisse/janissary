import { describe, expect, it } from "vitest";
import {
  CombatEventType,
  FIXED_DT_MS,
  FIXED_DT_SECONDS,
  InputButton,
  KillCause,
  PlayerFlag,
  Team,
  WEAPON_DEFS,
  WEAPON_SWITCH_TICKS,
  WeaponType,
  createWeaponSlotState,
  stepWeaponSlots,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, requestDeploy, stepWorld, type WorldState } from "../src/sim/world";

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

const inputSeqs = new WeakMap<WorldState, number>();

function tickWith(world: WorldState, inputs: { entityId: number; buttons: number; yaw?: number }[], ticks: number): void {
  // enqueueInput rejects stale seqs, so the counter must survive across calls.
  let seq = inputSeqs.get(world) ?? 1;
  for (let index = 0; index < ticks; index += 1) {
    for (const entry of inputs) {
      enqueueInput(world, entry.entityId, {
        seq,
        lastSnapshotTick: 0,
        buttons: entry.buttons,
        yaw: entry.yaw ?? 0,
        pitch: 0,
        dtMs: FIXED_DT_MS,
      });
      seq += 1;
    }
    stepWorld(world);
  }
  inputSeqs.set(world, seq);
}

function ticksOf(seconds: number): number {
  return Math.ceil(seconds / FIXED_DT_SECONDS);
}

/** Open-field pair: attacker at (60, -60) facing -z, target `distance` ahead. */
function meleePair(distance: number, attackerTeam = Team.Ottoman): { world: WorldState; attacker: { entityId: number; slot: number }; target: { entityId: number; slot: number } } {
  const world = createWorldState();
  const attacker = addPlayer(world, "attacker", attackerTeam);
  const target = addPlayer(world, "target", attackerTeam === Team.Ottoman ? Team.Byzantine : Team.Ottoman);
  if (attacker === undefined || target === undefined) throw new Error("slots unavailable");
  world.x[attacker.slot] = 60;
  world.z[attacker.slot] = -60;
  world.x[target.slot] = 60;
  world.z[target.slot] = -60 - distance;
  world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
  return { world, attacker, target };
}

describe("weapon slots (Phase 8e-3)", () => {
  it("server slot state replays the shared machine exactly (prediction parity)", () => {
    const world = createWorldState();
    const player = addPlayer(world, "parity", Team.Ottoman);
    if (player === undefined) throw new Error("slots unavailable");
    const machine = createWeaponSlotState();
    // Press slot 1; a mid-draw slot-3 press (ignored); hold slot 3 through a
    // full draw; back to slot 2.
    const stream: number[] = [
      InputButton.Slot1,
      ...Array.from({ length: WEAPON_SWITCH_TICKS + 2 }, (_, index) => (index === 2 ? InputButton.Slot3 : 0)),
      InputButton.Slot3, InputButton.Slot3,
      ...Array.from({ length: WEAPON_SWITCH_TICKS + 1 }, () => 0),
      InputButton.Slot2,
      ...Array.from({ length: WEAPON_SWITCH_TICKS + 1 }, () => 0),
    ];
    let previousButtons = 0;
    let seq = 1;
    for (const buttons of stream) {
      enqueueInput(world, player.entityId, input(world.tick, seq, buttons));
      seq += 1;
      stepWorld(world);
      stepWeaponSlots(machine, buttons, previousButtons);
      previousButtons = buttons;
      expect(world.activeWeaponSlot[player.slot]).toBe(machine.activeSlot);
      expect(world.weaponSwitchTarget[player.slot]).toBe(machine.targetSlot);
      expect(world.weaponSwitchTicks[player.slot]).toBe(machine.ticksRemaining);
    }
    expect(machine.activeSlot).toBe(2);
  });

  it("blocks fire while the draw timer runs, then allows it after", () => {
    const world = createWorldState();
    const player = addPlayer(world, "switcher", Team.Ottoman);
    if (player === undefined) throw new Error("slots unavailable");
    // Same-tick Slot1 + Fire: the machine steps before combat, so the shot is inert.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Slot1 | InputButton.Fire }], 1);
    expect(world.weaponSwitchTicks[player.slot]).toBe(WEAPON_SWITCH_TICKS);
    expect(world.ammo[player.slot]).toBe(1);
    // Held fire through the rest of the draw: still blocked.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Fire }], WEAPON_SWITCH_TICKS);
    expect(world.activeWeaponSlot[player.slot]).toBe(1);
    expect(world.ammo[player.slot]).toBe(1);
    // Back to slot 2; once the draw lands the next Fire consumes the round.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Slot2 }], 1);
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS);
    expect(world.activeWeaponSlot[player.slot]).toBe(2);
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Fire }], 1);
    expect(world.ammo[player.slot]).toBe(0);
  });

  it("resolves sword and dagger damage, reach, and cooldown from the weapon table", () => {
    const world = createWorldState();
    const sword = addPlayer(world, "sword", Team.Ottoman);
    const dagger = addPlayer(world, "dagger", Team.Ottoman);
    const swordTarget = addPlayer(world, "st", Team.Byzantine);
    const daggerTarget = addPlayer(world, "dt", Team.Byzantine);
    if (sword === undefined || dagger === undefined || swordTarget === undefined || daggerTarget === undefined) throw new Error("slots unavailable");
    world.x[sword.slot] = 60; world.z[sword.slot] = -60;
    world.x[dagger.slot] = 63; world.z[dagger.slot] = -60;
    world.x[swordTarget.slot] = 60; world.z[swordTarget.slot] = -61.5;
    world.x[daggerTarget.slot] = 63; world.z[daggerTarget.slot] = -61.5;
    world.flags[swordTarget.slot] = (world.flags[swordTarget.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.flags[daggerTarget.slot] = (world.flags[daggerTarget.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.activeWeaponSlot[sword.slot] = 1;
    world.activeWeaponSlot[dagger.slot] = 3;
    tickWith(world, [
      { entityId: sword.entityId, buttons: InputButton.Melee },
      { entityId: dagger.entityId, buttons: InputButton.Melee },
    ], 1);
    expect(world.health[swordTarget.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Kilij].damage);
    expect(world.health[daggerTarget.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Dagger].damage);
    // Cooldowns land on the table values (world.tick is the swing's tick).
    expect(world.nextMeleeTick[sword.slot] ?? 0).toBe(world.tick + ticksOf(WEAPON_DEFS[WeaponType.Kilij].cooldownSeconds));
    expect(world.nextMeleeTick[dagger.slot] ?? 0).toBe(world.tick + ticksOf(WEAPON_DEFS[WeaponType.Dagger].cooldownSeconds));
    expect(world.events.find((event) => event.type === CombatEventType.MeleeSwing && event.sourceEntityId === sword.entityId)?.value).toBe(1);
    expect(world.events.find((event) => event.type === CombatEventType.MeleeSwing && event.sourceEntityId === dagger.entityId)?.value).toBe(3);
  });

  it("gives the sword more reach than the dagger", () => {
    // 1.9 m: inside the kilij's 2.2 m, outside the dagger's 1.8 m.
    const { world, attacker, target } = meleePair(1.9);
    world.activeWeaponSlot[attacker.slot] = 1;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    expect(world.health[target.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Kilij].damage);

    const second = meleePair(1.9);
    second.world.activeWeaponSlot[second.attacker.slot] = 3;
    tickWith(second.world, [{ entityId: second.attacker.entityId, buttons: InputButton.Melee }], 1);
    expect(second.world.health[second.target.slot]).toBe(100);
    expect(second.world.events.find((event) => event.type === CombatEventType.MeleeSwing)?.value).toBe(3);
  });

  it("right-click with a ranged slot performs the weakest-tier butt stroke", () => {
    const { world, attacker, target } = meleePair(1.5);
    // Slot 2 (arquebus) is the default; a human right-click must NOT swing a blade.
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    expect(world.health[target.slot]).toBe(100 - WEAPON_DEFS[WeaponType.ButtStroke].damage);
    expect(world.events.find((event) => event.type === CombatEventType.MeleeSwing)?.value).toBe(2);
  });

  it("a bot's close-quarters swing resolves its slot-1 blade", () => {
    const world = createWorldState();
    const bot = addPlayer(world, "bot", Team.Ottoman, undefined, true);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (bot === undefined || target === undefined) throw new Error("slots unavailable");
    world.x[bot.slot] = 60; world.z[bot.slot] = -60;
    world.x[target.slot] = 60; world.z[target.slot] = -61.5;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // Bots never switch slots: the swing comes through the slot-1 def anyway.
    expect(world.activeWeaponSlot[bot.slot]).toBe(2);
    tickWith(world, [{ entityId: bot.entityId, buttons: InputButton.Melee }], 1);
    expect(world.health[target.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Kilij].damage);
    expect(world.events.find((event) => event.type === CombatEventType.MeleeSwing && event.sourceEntityId === bot.entityId)?.value).toBe(1);
  });

  it("left-click with a blade equipped swings it instead of firing", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 1;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Fire }], 1);
    expect(world.health[target.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Kilij].damage);
    expect(world.ammo[attacker.slot]).toBe(1);
    expect(world.events.some((event) => event.type === CombatEventType.Fire && event.sourceEntityId === attacker.entityId)).toBe(false);
  });

  it("left-click with the dagger is melee and never emits a projectile fire event", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 3;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Fire }], 1);
    expect(world.health[target.slot]).toBe(100 - WEAPON_DEFS[WeaponType.Dagger].damage);
    expect(world.ammo[attacker.slot]).toBe(1);
    expect(world.events.some((event) => event.type === CombatEventType.Fire && event.sourceEntityId === attacker.entityId)).toBe(false);
  });

  it("progresses the reload at full rate while holstered, and comes up loaded on draw", () => {
    // Phase 8e-8 (ADR 0037): holstered reloads run at full rate — the
    // deadline is absolute and no longer slides. This replaces the 8e-3
    // freeze pin ("freezes the reload while the ranged weapon is holstered").
    const world = createWorldState();
    const player = addPlayer(world, "reloader", Team.Ottoman);
    if (player === undefined) throw new Error("slots unavailable");
    world.ammo[player.slot] = 0;
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Reload }], 1);
    expect(world.reloadUntilTick[player.slot] ?? 0).toBeGreaterThan(world.tick);
    // Holster to slot 1 and let the draw + a stretch of holstered ticks pass.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Slot1 }], 1);
    const deadline = world.reloadUntilTick[player.slot] ?? 0;
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS + 10);
    expect(world.activeWeaponSlot[player.slot]).toBe(1);
    // The deadline did not slide: the remaining ticks shrank while holstered.
    expect((world.reloadUntilTick[player.slot] ?? 0) - world.tick).toBeLessThan(deadline - (world.tick - (WEAPON_SWITCH_TICKS + 11)));
    // Wait out the rest of the reload while still on slot 1: ammo refills
    // without the weapon in hand, and the Reloading flag clears.
    while ((world.reloadUntilTick[player.slot] ?? 0) > world.tick) {
      tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 1);
    }
    expect(world.ammo[player.slot]).toBe(1);
    expect((world.flags[player.slot] ?? 0) & PlayerFlag.Reloading).toBe(0);
    // Drawing slot 2 now comes up loaded: no reload starts, fire is possible.
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Slot2 }], 1);
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS);
    expect(world.activeWeaponSlot[player.slot]).toBe(2);
    expect(world.ammo[player.slot]).toBe(1);
    expect(world.reloadUntilTick[player.slot] ?? 0).toBe(0);
  });

  it("does not interrupt the holstered reload by swinging the blade", () => {
    const world = createWorldState();
    const player = addPlayer(world, "reloader", Team.Ottoman);
    if (player === undefined) throw new Error("slots unavailable");
    world.ammo[player.slot] = 0;
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Reload }], 1);
    const deadline = world.reloadUntilTick[player.slot] ?? 0;
    tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Slot1 }], 1);
    tickWith(world, [{ entityId: player.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS);
    // Several blade swings (melee has no ammo/reload interaction).
    for (let swing = 0; swing < 4; swing += 1) {
      tickWith(world, [{ entityId: player.entityId, buttons: InputButton.Melee }], 2);
      tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 1);
    }
    expect(world.reloadUntilTick[player.slot] ?? 0).toBeGreaterThan(0);
    // The deadline was never extended by the swings: it lands on schedule.
    while ((world.reloadUntilTick[player.slot] ?? 0) > world.tick) {
      tickWith(world, [{ entityId: player.entityId, buttons: 0 }], 1);
    }
    expect(world.ammo[player.slot]).toBe(1);
    expect(world.reloadUntilTick[player.slot] ?? 0).toBe(0);
    expect((world.flags[player.slot] ?? 0) & PlayerFlag.Reloading).toBe(0);
    expect(deadline).toBeLessThanOrEqual(world.tick);
  });

  it("clears a holstered reload on death and respawn", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 1; // blade: 35 dmg, one hit kill at 30 HP
    world.ammo[target.slot] = 0;
    tickWith(world, [{ entityId: target.entityId, buttons: InputButton.Reload }], 1);
    tickWith(world, [{ entityId: target.entityId, buttons: InputButton.Slot1 }], 1);
    tickWith(world, [{ entityId: target.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS);
    expect(world.reloadUntilTick[target.slot] ?? 0).toBeGreaterThan(world.tick);
    world.health[target.slot] = 30;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    const deaths = world.events.filter((event) => event.type === CombatEventType.Death);
    expect(deaths).toHaveLength(1);
    // Dead players skip the sim block, so the timer cannot complete or slide
    // while dead; respawn clears it (spawnPlayer) and ammo comes back full.
    tickWith(world, [{ entityId: attacker.entityId, buttons: 0 }], ticksOf(3) + 5);
    // 8e-13: humans redeploy only on an explicit Deploy request.
    expect(requestDeploy(world, target.entityId)).toBe(true);
    expect(world.health[target.slot]).toBe(100);
    expect(world.reloadUntilTick[target.slot] ?? 0).toBe(0);
    expect(world.ammo[target.slot]).toBe(1);
    expect((world.flags[target.slot] ?? 0) & PlayerFlag.Reloading).toBe(0);
  });

  it("resets to slot 2 with no draw timer on respawn", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 1;
    // The victim was mid-draw toward slot 3 when the blow landed.
    world.activeWeaponSlot[target.slot] = 1;
    world.weaponSwitchTarget[target.slot] = 3;
    world.weaponSwitchTicks[target.slot] = 5;
    world.health[target.slot] = 30;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    const deaths = world.events.filter((event) => event.type === CombatEventType.Death);
    expect(deaths).toHaveLength(1);
    expect(deaths[0]?.value).toBe(KillCause.Sword);
    // Dead players are skipped by the combat loop; wait out the deploy floor.
    tickWith(world, [{ entityId: attacker.entityId, buttons: 0 }], ticksOf(3) + 5);
    // 8e-13: humans redeploy only on an explicit Deploy request.
    expect(requestDeploy(world, target.entityId)).toBe(true);
    expect(world.health[target.slot]).toBe(100);
    expect(world.activeWeaponSlot[target.slot]).toBe(2);
    expect(world.weaponSwitchTarget[target.slot]).toBe(2);
    expect(world.weaponSwitchTicks[target.slot]).toBe(0);
  });

  it("reports a dagger kill as KillCause.Dagger", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 3;
    world.health[target.slot] = 15;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    const deaths = world.events.filter((event) => event.type === CombatEventType.Death);
    expect(deaths).toHaveLength(1);
    expect(deaths[0]?.value).toBe(KillCause.Dagger);
  });

  it("a slot button held through death and respawn does not start a draw", () => {
    const { world, attacker, target } = meleePair(1.5);
    world.activeWeaponSlot[attacker.slot] = 1;
    world.health[target.slot] = 30;
    tickWith(world, [{ entityId: attacker.entityId, buttons: InputButton.Melee }], 1);
    expect(world.events.some((event) => event.type === CombatEventType.Death)).toBe(true);
    // The victim holds Slot1 from the death tick through the respawn and well
    // past any draw window: a held key is not a fresh press, so nothing may
    // start — spawnPlayer seeds prevButtons from the live buttons (8e-3
    // review finding).
    tickWith(world, [
      { entityId: attacker.entityId, buttons: 0 },
      { entityId: target.entityId, buttons: InputButton.Slot1 },
    ], ticksOf(3) + 5 + WEAPON_SWITCH_TICKS + 2);
    // 8e-13: humans redeploy only on an explicit Deploy request.
    expect(requestDeploy(world, target.entityId)).toBe(true);
    expect(world.health[target.slot]).toBe(100);
    expect(world.activeWeaponSlot[target.slot]).toBe(2);
    expect(world.weaponSwitchTicks[target.slot]).toBe(0);
    // A genuine re-press after release still works.
    tickWith(world, [{ entityId: target.entityId, buttons: 0 }], 2);
    tickWith(world, [{ entityId: target.entityId, buttons: InputButton.Slot1 }], 1);
    tickWith(world, [{ entityId: target.entityId, buttons: 0 }], WEAPON_SWITCH_TICKS + 1);
    expect(world.activeWeaponSlot[target.slot]).toBe(1);
  });
});
