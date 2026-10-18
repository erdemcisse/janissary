import { describe, expect, it } from "vitest";
import {
  CAVALRY_RIDER_HITBOX_RAISE,
  CombatEventType,
  decodeHitEventDamage,
  FIXED_DT_MS,
  HEADSHOT_CENTER_OFFSET,
  HEADSHOT_RADIUS,
  hitEventIsHeadshot,
  InputButton,
  KillCause,
  PlayerFlag,
  Team,
  WEAPON_DEFS,
  WeaponType,
  XP_EVENT_FLAG_HEADSHOT,
  XP_HEADSHOT_BONUS,
  XpSource,
} from "@janissary/shared";
import { addPlayer, applyDamage, createWorldState, enqueueInput, stepWorld, type WorldState } from "../src/sim/world";

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

function queuedXp(world: WorldState, predicate: (source: number, amount: number, flags: number) => boolean): boolean {
  let index = world.xpQueueHead;
  while (index !== world.xpQueueTail) {
    const source = world.xpQueueSources[index];
    const amount = world.xpQueueAmounts[index];
    const flags = world.xpQueueFlags[index];
    if (source !== undefined && amount !== undefined && flags !== undefined && predicate(source, amount, flags)) return true;
    index = (index + 1) % world.xpQueueSources.length;
  }
  return false;
}

function deathEvents(world: WorldState): readonly { sourceEntityId: number; targetEntityId: number; value: number }[] {
  return world.events.filter((event) => event.type === CombatEventType.Death).map(({ sourceEntityId, targetEntityId, value }) => ({ sourceEntityId, targetEntityId, value }));
}

describe("combat correctness", () => {
  it("melee cannot pass through blockout geometry and removes attacker spawn protection", () => {
    const world = createWorldState();
    const attacker = addPlayer(world, "attacker", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    expect(attacker).toBeDefined(); expect(target).toBeDefined();
    if (attacker === undefined || target === undefined) return;
    world.x[attacker.slot] = -33; world.z[attacker.slot] = 2.05; world.yaw[attacker.slot] = 0;
    world.x[target.slot] = -33; world.z[target.slot] = -0.1;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    enqueueInput(world, attacker.entityId, input(world.tick, 1, InputButton.Melee));
    stepWorld(world);
    expect((world.flags[attacker.slot] ?? 0) & PlayerFlag.SpawnProtected).toBe(0);
    expect(world.health[target.slot]).toBe(100);
  });

  it("reload completion uses the weapon def magazine size", () => {
    const world = createWorldState();
    const player = addPlayer(world, "reloader", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    const tuning = WEAPON_DEFS[WeaponType.Arquebus] as { magazineSize: number | undefined };
    const originalMagazineSize = tuning.magazineSize;
    tuning.magazineSize = 3;
    try {
      world.ammo[player.slot] = 0;
      enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.Reload));
      stepWorld(world);
      const reloadUntil = world.reloadUntilTick[player.slot] ?? 0;
      while (world.tick <= reloadUntil) stepWorld(world);
      expect(world.ammo[player.slot]).toBe(3);
    } finally {
      tuning.magazineSize = originalMagazineSize;
    }
  });

  it("applies tunable arquebus falloff from close range through the effective maximum", () => {
    const shootAt = (distance: number): number => {
      const world = createWorldState();
      const shooter = addPlayer(world, `shooter-${distance}`, Team.Ottoman);
      const target = addPlayer(world, `target-${distance}`, Team.Byzantine);
      if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
      world.x[shooter.slot] = 80;
      world.z[shooter.slot] = -20;
      world.x[target.slot] = 80;
      world.z[target.slot] = -20 + distance;
      world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
      applyDamage(world, shooter.slot, target.slot, WEAPON_DEFS[WeaponType.Arquebus].damage, distance, false, KillCause.Arquebus, 40, 100, 1, 0.25);
      return 100 - (world.health[target.slot] ?? 100);
    };

    const close = shootAt(10);
    const mid = shootAt(50);
    const far = shootAt(90);
    expect(close).toBe(60);
    expect(mid).toBeGreaterThanOrEqual(45);
    expect(mid).toBeLessThanOrEqual(55);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThanOrEqual(20);
    expect(close).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

function armedPair(): { world: WorldState; shooter: { entityId: number; slot: number }; target: { entityId: number; slot: number } } {
  const world = createWorldState();
  const shooter = addPlayer(world, "shooter", Team.Ottoman);
  const target = addPlayer(world, "target", Team.Byzantine);
  if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
  world.x[shooter.slot] = 80;
  world.z[shooter.slot] = -20;
  world.yaw[shooter.slot] = Math.PI;
  // Mounted riders steer toward desiredYaw gradually (spawn facing now aims
  // at the wall, not fixed yaw), so the explicit facing must set both.
  world.desiredYaw[shooter.slot] = Math.PI;
  world.x[target.slot] = 80;
  world.z[target.slot] = -10;
  world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
  // Warm up beyond STATIONARY_ACCURACY_SECONDS so the shot uses standing
  // spread (0.008 rad), which keeps a 10 m headshot deterministic.
  for (let index = 0; index < 20; index += 1) stepWorld(world);
  return { world, shooter, target };
}

describe("headshot detection", () => {
  it("applies the weapon multiplier and marks the authoritative hit event", () => {
    const { world, shooter, target } = armedPair();
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const headCenterY = (world.y[target.slot] ?? 0) + 0.35 + HEADSHOT_CENTER_OFFSET;
    const headPitch = Math.atan2(headCenterY - eyeY, 10);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, headPitch));
    stepWorld(world);
    const hit = [...world.events].reverse().find((event) => event.type === CombatEventType.Hit && event.sourceEntityId === shooter.entityId);
    // 60 arquebus damage × 1.75 — a headshot is lethal from full health.
    expect(world.health[target.slot]).toBe(0);
    expect(hit).toBeDefined();
    expect(hitEventIsHeadshot(hit?.value ?? 0)).toBe(true);
    expect(decodeHitEventDamage(hit?.value ?? 0)).toBe(105);
  });

  it("kills on a headshot regardless of distance — falloff never softens the head", () => {
    // The audit contract: "headshots are lethal regardless of distance". The
    // head multiplier applies to the full base damage, never the
    // falloff-reduced amount, so a 100 m arquebus headshot (body falloff would
    // leave 15) still one-shots a full-health target.
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    const distance = 100;
    applyDamage(world, shooter.slot, target.slot, WEAPON_DEFS[WeaponType.Arquebus].damage, distance, true, KillCause.Arquebus, 40, 100, WEAPON_DEFS[WeaponType.Arquebus].headshotMultiplier, 0.25);
    expect(world.health[target.slot]).toBe(0);
  });

  it("keeps the body-shot curve independent of the head rule — a 100 m body shot barely dents", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    applyDamage(world, shooter.slot, target.slot, WEAPON_DEFS[WeaponType.Arquebus].damage, 100, false, KillCause.Arquebus, 40, 100, WEAPON_DEFS[WeaponType.Arquebus].headshotMultiplier, 0.25);
    expect(world.health[target.slot]).toBe(100 - Math.round(60 * 0.25));
  });

  it("crossbow body shots kill in two hits — the audit's ~two-hit body claim", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    const def = WEAPON_DEFS[WeaponType.Crossbow];
    applyDamage(world, shooter.slot, target.slot, def.damage, 10, false, KillCause.Crossbow, 0, 0, def.headshotMultiplier);
    expect(world.health[target.slot]).toBe(50);
    expect(world.health[target.slot]).toBeGreaterThan(0);
    applyDamage(world, shooter.slot, target.slot, def.damage, 10, false, KillCause.Crossbow, 0, 0, def.headshotMultiplier);
    expect(world.health[target.slot]).toBe(0);
  });

  it("classifies a shot aimed at the head crown as a headshot kill with bonus XP and the kill flag", () => {
    const { world, shooter, target } = armedPair();
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const headCenterY = (world.y[target.slot] ?? 0) + 0.35 + HEADSHOT_CENTER_OFFSET;
    const distance = 10;
    const headPitch = Math.atan2(headCenterY - eyeY, distance);
    world.health[target.slot] = 40;
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, headPitch));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(0);
    expect(world.warHeadshots[shooter.slot]).toBe(1);
    expect(queuedXp(world, (source, amount) => source === XpSource.Headshot && amount === XP_HEADSHOT_BONUS)).toBe(true);
    expect(queuedXp(world, (_source, _amount, flags) => (flags & XP_EVENT_FLAG_HEADSHOT) !== 0)).toBe(true);
  });

  it("does not headshot a ray aimed at the body center", () => {
    const { world, shooter, target } = armedPair();
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const bodyCenterY = (world.y[target.slot] ?? 0) + 0.35;
    const distance = 10;
    const bodyPitch = Math.atan2(bodyCenterY - eyeY, distance);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, bodyPitch));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(100 - 60);
    expect(world.warHeadshots[shooter.slot]).toBe(0);
    expect(queuedXp(world, (source) => source === XpSource.Headshot)).toBe(false);
  });

  it("does not headshot a mounted target when the shot meets the raised rider body", () => {
    const { world, shooter, target } = armedPair();
    world.mounted[target.slot] = 1;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[target.slot] = 80;
    stepWorld(world);
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const riderCenterY = (world.y[target.slot] ?? 0) + 0.35 + CAVALRY_RIDER_HITBOX_RAISE;
    const distance = 10;
    const levelPitch = Math.atan2(riderCenterY - eyeY, distance);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, levelPitch));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(40);
    expect(world.horseHp[target.slot]).toBe(80);
    expect(world.warHeadshots[shooter.slot]).toBe(0);
    expect(queuedXp(world, (source) => source === XpSource.Headshot)).toBe(false);
  });

  it("treats the head as a meaningfully smaller target than the body", () => {
    const position = { x: 0, y: 0.9, z: 0 };
    const bodyCenterY = position.y + 0.35;
    const headCenterY = bodyCenterY + HEADSHOT_CENTER_OFFSET;
    const bodyRadius = 0.62;
    expect(HEADSHOT_RADIUS / bodyRadius).toBeLessThan(0.5);
    expect(Math.pow(HEADSHOT_RADIUS / bodyRadius, 2)).toBeLessThan(0.1);
    expect(headCenterY - HEADSHOT_RADIUS).toBeCloseTo(bodyCenterY + bodyRadius);
  });

  it("classifies a horse-only shot on a mounted target as horse damage, not rider damage", () => {
    const { world, shooter, target } = armedPair();
    world.mounted[target.slot] = 1;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[target.slot] = 40;
    stepWorld(world);
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const horseCenterY = (world.y[target.slot] ?? 0) + 0.15;
    const distance = 10;
    const horsePitch = Math.atan2(horseCenterY - eyeY, distance);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, horsePitch));
    stepWorld(world);
    // Only the horse sphere intersects this ray: the rider sphere is 1.1 m
    // above the horse center with radius 0.62, the head another 0.8 m up.
    expect(world.health[target.slot]).toBe(100);
    expect(world.horseHp[target.slot]).toBe(0);
    expect(world.mounted[target.slot]).toBe(0);
    expect(world.warHits[shooter.slot]).toBe(1);
    expect(queuedXp(world, (source) => source === XpSource.DismountRider)).toBe(true);
  });
});

describe("kill cause on the Death event (Phase 8c-7)", () => {
  it("reports a mounted arquebus kill as Arquebus, not Melee", () => {
    // The concrete misreport that motivated the fix: the old client heuristic
    // read the killer's Mounted flag and showed a melee icon for a ranged kill.
    const { world, shooter, target } = armedPair();
    world.mounted[shooter.slot] = 1;
    world.flags[shooter.slot] = (world.flags[shooter.slot] ?? 0) | PlayerFlag.Mounted;
    world.horseHp[shooter.slot] = 100;
    world.health[target.slot] = 40;
    const eyeY = (world.y[shooter.slot] ?? 0) + 0.65;
    const bodyCenterY = (world.y[target.slot] ?? 0) + 0.35;
    const distance = 10;
    const pitch = Math.atan2(bodyCenterY - eyeY, distance);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, Math.PI, pitch));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(0);
    const deaths = deathEvents(world);
    expect(deaths.length).toBe(1);
    expect(deaths[0]?.sourceEntityId).toBe(shooter.entityId);
    expect(deaths[0]?.value).toBe(KillCause.Arquebus);
    // The killer was mounted, so the mounted-kill XP still applies.
    expect(queuedXp(world, (source) => source === XpSource.MountedKill)).toBe(true);
  });

  it("reports a melee kill as Melee", () => {
    const world = createWorldState();
    const attacker = addPlayer(world, "attacker", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    expect(attacker).toBeDefined(); expect(target).toBeDefined();
    if (attacker === undefined || target === undefined) return;
    // Open ground, target directly ahead within the butt-stroke's 1.8 m reach
    // (8e-3: right-click with a ranged slot is the weakest tier, 15 damage, so
    // the one-swing kill uses a 15 HP target and still reports Melee).
    world.x[attacker.slot] = 0; world.z[attacker.slot] = 10; world.yaw[attacker.slot] = Math.PI;
    world.x[target.slot] = 0; world.z[target.slot] = 8.4;
    world.health[target.slot] = 15;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    enqueueInput(world, attacker.entityId, input(world.tick, 1, InputButton.Melee));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(0);
    const deaths = deathEvents(world);
    expect(deaths.length).toBe(1);
    expect(deaths[0]?.value).toBe(KillCause.Melee);
  });

  it("reports drowning as a sourceless Death with KillCause.Drowning", () => {
    const world = createWorldState();
    const player = addPlayer(world, "swimmer", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    // Deep water past the shore; low health so the drain kills quickly. The
    // drain applies once per second (every 20 ticks), so run well past that.
    world.x[player.slot] = 0;
    world.z[player.slot] = 260;
    world.health[player.slot] = 6;
    world.flags[player.slot] = (world.flags[player.slot] ?? 0) & ~PlayerFlag.Aboard;
    for (let tick = 0; tick < 80 && (world.health[player.slot] ?? 0) > 0; tick += 1) {
      enqueueInput(world, player.entityId, input(world.tick, tick + 1, 0));
      stepWorld(world);
    }
    expect(world.health[player.slot]).toBe(0);
    const deaths = deathEvents(world);
    expect(deaths.length).toBe(1);
    expect(deaths[0]?.sourceEntityId).toBe(0); // sourceless, like GalleySunk
    expect(deaths[0]?.targetEntityId).toBe(player.entityId);
    expect(deaths[0]?.value).toBe(KillCause.Drowning);
  });
});
