import { describe, expect, it } from "vitest";
import {
  AIM_TUNING,
  FIXED_DT_MS,
  InputButton,
  PlayerFlag,
  Team,
  WEAPON_SWITCH_TICKS,
  WeaponType,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld, type WorldState } from "../src/sim/world";

/**
 * Phase 8e-7 aim-down-sights, server side. The aimed-spread factor is
 * authoritative here — these tests prove the Aim bit tightens real shot
 * dispersion (not just a client zoom), that mounted aiming is inert, and that
 * the bit composes safely with the 8e-3 slot machine.
 *
 * Dispersion is measured directly off the crossbow's PendingShot directions
 * (the bolt's travel time leaves the shot observable in world.pendingShots).
 * The world RNG is a deterministic xorshift consumed only by fireWeapon in
 * these minimal worlds, so two identically-stepped worlds draw the SAME
 * spread samples — the aimed run's deviations are the unaimed run's scaled by
 * the AIM_TUNING factor, exactly.
 */

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

/** Byzantine defender on open meadow, warmed past STATIONARY_ACCURACY_SECONDS. */
function crossbowShooter(): { world: WorldState; entityId: number; slot: number } {
  const world = createWorldState();
  const shooter = addPlayer(world, "shooter", Team.Byzantine);
  if (shooter === undefined) throw new Error("slots unavailable");
  world.x[shooter.slot] = 60;
  world.z[shooter.slot] = -60;
  world.yaw[shooter.slot] = 0;
  world.desiredYaw[shooter.slot] = 0;
  for (let index = 0; index < 20; index += 1) stepWorld(world);
  return { world, entityId: shooter.entityId, slot: shooter.slot };
}

/** Fires `shots` crossbow bolts with explicit trigger pulses; returns per-shot angular deviations from the aim line. */
function shotDeviations(world: WorldState, entityId: number, slot: number, shots: number, buttons: number): { yaw: number[]; pitch: number[] } {
  const yaw: number[] = [];
  const pitch: number[] = [];
  let seq = 1000;
  for (let index = 0; index < shots; index += 1) {
    world.ammo[slot] = 1;
    world.nextFireTick[slot] = 0;
    enqueueInput(world, entityId, input(world.tick, seq, buttons));
    seq += 1;
    stepWorld(world);
    const shot = world.pendingShots[world.pendingShots.length - 1];
    if (shot === undefined) throw new Error("crossbow shot did not enter pendingShots");
    yaw.push(Math.abs(Math.atan2(-shot.directionX, -shot.directionZ)));
    pitch.push(Math.abs(Math.asin(Math.max(-1, Math.min(1, shot.directionY)))));
    world.pendingShots.length = 0;
    enqueueInput(world, entityId, input(world.tick, seq, 0));
    seq += 1;
    stepWorld(world);
  }
  return { yaw, pitch };
}

const maxOf = (values: readonly number[]): number => values.reduce((max, value) => Math.max(max, value), 0);

describe("aim down sights (Phase 8e-7)", () => {
  it("aimed fire tightens shot dispersion by the AIM_TUNING factor", () => {
    const shots = 24;
    const unaimedRun = crossbowShooter();
    const unaimed = shotDeviations(unaimedRun.world, unaimedRun.entityId, unaimedRun.slot, shots, InputButton.Fire);
    const aimedRun = crossbowShooter();
    const aimed = shotDeviations(aimedRun.world, aimedRun.entityId, aimedRun.slot, shots, InputButton.Fire | InputButton.Aim);
    // Same seed, same step sequence, same draws: per-shot deviations scale by
    // exactly the factor. Assert per-shot to prove it is the same samples,
    // not a statistical fluke.
    const factor = AIM_TUNING[WeaponType.Crossbow]?.spreadFactor ?? 1;
    for (let index = 0; index < shots; index += 1) {
      const unaimedDev = Math.max(unaimed.yaw[index] ?? 0, unaimed.pitch[index] ?? 0);
      const aimedDev = Math.max(aimed.yaw[index] ?? 0, aimed.pitch[index] ?? 0);
      expect(aimedDev).toBeCloseTo(unaimedDev * factor, 10);
    }
    expect(maxOf(aimed.yaw)).toBeLessThan(maxOf(unaimed.yaw));
  });

  it("aiming while mounted does not tighten spread (foot-only, both sides agree)", () => {
    const shots = 12;
    const unaimedRun = crossbowShooter();
    const unaimed = shotDeviations(unaimedRun.world, unaimedRun.entityId, unaimedRun.slot, shots, InputButton.Fire);
    const mountedRun = crossbowShooter();
    mountedRun.world.mounted[mountedRun.slot] = 1;
    const mountedAimed = shotDeviations(mountedRun.world, mountedRun.entityId, mountedRun.slot, shots, InputButton.Fire | InputButton.Aim);
    for (let index = 0; index < shots; index += 1) {
      expect(mountedAimed.yaw[index]).toBeCloseTo(unaimed.yaw[index] ?? 0, 10);
      expect(mountedAimed.pitch[index]).toBeCloseTo(unaimed.pitch[index] ?? 0, 10);
    }
  });

  it("aimed long-range fire lands measurably more hits (end-to-end)", () => {
    const hitsWith = (aiming: boolean): number => {
      const world = createWorldState();
      const shooter = addPlayer(world, "shooter", Team.Ottoman);
      const target = addPlayer(world, "target", Team.Byzantine);
      if (shooter === undefined || target === undefined) throw new Error("slots unavailable");
      world.x[shooter.slot] = 60;
      world.z[shooter.slot] = -60;
      world.yaw[shooter.slot] = 0;
      world.desiredYaw[shooter.slot] = 0;
      world.x[target.slot] = 60;
      world.z[target.slot] = -155; // 95 m down the aim line, near max range
      world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
      for (let index = 0; index < 20; index += 1) stepWorld(world);
      const bodyPitch = Math.atan2(((world.y[target.slot] ?? 0) + 0.35) - ((world.y[shooter.slot] ?? 0) + 0.65), 95);
      let hits = 0;
      let seq = 1;
      for (let index = 0; index < 30; index += 1) {
        world.ammo[shooter.slot] = 1;
        world.nextFireTick[shooter.slot] = 0;
        world.health[target.slot] = 100;
        enqueueInput(world, shooter.entityId, input(world.tick, seq, InputButton.Fire | (aiming ? InputButton.Aim : 0), 0, bodyPitch));
        seq += 1;
        stepWorld(world);
        // Health-delta counting: the event ring shifts out entries older than
        // a few ticks, so event indices are not stable across steps.
        if ((world.health[target.slot] ?? 100) < 100) hits += 1;
        enqueueInput(world, shooter.entityId, input(world.tick, seq, 0, 0, bodyPitch));
        seq += 1;
        stepWorld(world);
      }
      return hits;
    };
    const unaimedHits = hitsWith(false);
    const aimedHits = hitsWith(true);
    // Standing base spread 0.008 rad at 95 m scatters ±0.76 m around the
    // 0.62 m body sphere — a real miss chance; aimed (×0.35) scatters ±0.27 m
    // and essentially cannot miss a centered aim.
    expect(aimedHits).toBeGreaterThan(unaimedHits);
    expect(aimedHits).toBeGreaterThanOrEqual(28);
  });

  it("holding Aim with a blade equipped still swings the blade (no broken state)", () => {
    const world = createWorldState();
    const attacker = addPlayer(world, "attacker", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    if (attacker === undefined || target === undefined) throw new Error("slots unavailable");
    world.x[attacker.slot] = 60;
    world.z[attacker.slot] = -60;
    world.yaw[attacker.slot] = 0;
    world.desiredYaw[attacker.slot] = 0;
    world.x[target.slot] = 60;
    world.z[target.slot] = -62; // 2 m ahead, inside the 2.2 m blade reach
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.activeWeaponSlot[attacker.slot] = 1; // kilij in hand
    enqueueInput(world, attacker.entityId, input(world.tick, 1, InputButton.Fire | InputButton.Aim));
    stepWorld(world);
    expect(world.health[target.slot]).toBe(100 - 35);
    expect(world.pendingShots).toHaveLength(0);
    expect(world.nextMeleeTick[attacker.slot]).toBeGreaterThan(world.tick);
  });

  it("a same-tick Slot+Aim+Fire press starts the draw but not a shot", () => {
    const world = createWorldState();
    const player = addPlayer(world, "switcher", Team.Ottoman);
    if (player === undefined) throw new Error("slots unavailable");
    world.x[player.slot] = 60;
    world.z[player.slot] = -60;
    enqueueInput(world, player.entityId, input(world.tick, 1, InputButton.Slot3 | InputButton.Aim | InputButton.Fire));
    stepWorld(world);
    expect(world.weaponSwitchTicks[player.slot]).toBe(WEAPON_SWITCH_TICKS);
    expect(world.ammo[player.slot]).toBe(1);
    expect(world.pendingShots).toHaveLength(0);
  });

  it("the Aim bit is movement-inert: identical trajectories with and without it", () => {
    const run = (withAim: boolean): { x: number; y: number; z: number } => {
      const world = createWorldState();
      const player = addPlayer(world, "runner", Team.Ottoman);
      if (player === undefined) throw new Error("slots unavailable");
      world.x[player.slot] = 60;
      world.z[player.slot] = -60;
      let seq = 1;
      for (let tick = 0; tick < 60; tick += 1) {
        // Sprint forward; toggle aim twice and hop once — the aim bit must
        // not perturb the movement sim (prediction parity by construction:
        // both sides step the same simulateMovement with this same word).
        let buttons = InputButton.Forward;
        if (withAim && ((tick >= 10 && tick < 20) || (tick >= 30 && tick < 45))) buttons |= InputButton.Aim;
        if (tick === 25) buttons |= InputButton.Jump;
        enqueueInput(world, player.entityId, input(world.tick, seq, buttons));
        seq += 1;
        stepWorld(world);
      }
      return { x: world.x[player.slot] ?? 0, y: world.y[player.slot] ?? 0, z: world.z[player.slot] ?? 0 };
    };
    const plain = run(false);
    const aiming = run(true);
    expect(aiming.x).toBeCloseTo(plain.x, 12);
    expect(aiming.y).toBeCloseTo(plain.y, 12);
    expect(aiming.z).toBeCloseTo(plain.z, 12);
  });
});
