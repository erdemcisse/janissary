import { describe, expect, it } from "vitest";
import {
  FIXED_DT_MS,
  GROUND_CENTER_Y,
  heightAt,
  InputButton,
  PlayerFlag,
  Team,
} from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld } from "../src/sim/world";
import { cannonProjectileGunId } from "../src/sim/cannon";

function input(worldTick: number, seq: number, buttons: number, yaw = 0, pitch = 0) {
  return { seq, lastSnapshotTick: worldTick, buttons, yaw, pitch, dtMs: FIXED_DT_MS };
}

/** Server eye height above the capsule centre, mirroring the fire path. */
const EYE_OFFSET = 0.65;
/** Server torso hit-sphere offset above the capsule centre. */
const TORSO_OFFSET = 0.35;

/**
 * Phase 8e-11 server adoption: ground contact, hitscan clipping, shell impacts
 * and earthwork placement all read the shared heightfield instead of z=0.
 * Coordinates below are surveyed open-field spots (see ADR 0040); flat-ground
 * behavior is covered by the pre-existing suites, which run in keep-flat zones.
 */
describe("terrain heightfield adoption (Phase 8e-11)", () => {
  it("settles a teleported player onto the hilltop floor", () => {
    const world = createWorldState();
    const player = addPlayer(world, "hilltop", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    // (710,-745) is a surveyed local maximum, heightAt ≈ 16.2 (8e-17 field).
    world.x[player.slot] = 710;
    world.z[player.slot] = -745;
    world.y[player.slot] = heightAt(710, -745) + GROUND_CENTER_Y + 1.2;
    for (let index = 0; index < 90; index += 1) stepWorld(world);
    expect(world.y[player.slot] ?? 0).toBeCloseTo(heightAt(710, -745) + GROUND_CENTER_Y, 2);
  });

  it("blocks a hitscan shot with a ridge and lands a control shot at the same range", () => {
    // Surveyed pair (8e-17 field): both endpoints in a deep open hollow
    // (h ≈ -10.8, mask = 1), the ground between cresting ~8.8 m above the
    // eye line (min LOS clearance ≈ -8.8 m, hugely tolerant of spread jitter).
    const world = createWorldState();
    const shooter = addPlayer(world, "ridge-shooter", Team.Ottoman);
    const target = addPlayer(world, "ridge-target", Team.Byzantine);
    expect(shooter).toBeDefined();
    expect(target).toBeDefined();
    if (shooter === undefined || target === undefined) return;
    const sx = 740.3, sz = -277.5, tx = 679.7, tz = -242.5;
    world.x[shooter.slot] = sx;
    world.z[shooter.slot] = sz;
    world.y[shooter.slot] = heightAt(sx, sz) + GROUND_CENTER_Y;
    world.x[target.slot] = tx;
    world.z[target.slot] = tz;
    world.y[target.slot] = heightAt(tx, tz) + GROUND_CENTER_Y;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    // Warm up so both stand still (standing spread) on the heightfield.
    for (let index = 0; index < 20; index += 1) stepWorld(world);
    const distance = Math.hypot(tx - sx, tz - sz);
    const eyeY = (world.y[shooter.slot] ?? 0) + EYE_OFFSET;
    const torsoY = (world.y[target.slot] ?? 0) + TORSO_OFFSET;
    // Sim convention: direction = (-sin(yaw), -cos(yaw)); target is (+x,+z) away.
    const yaw = Math.atan2(-(tx - sx), -(tz - sz));
    const pitch = Math.atan2(torsoY - eyeY, distance);
    enqueueInput(world, shooter.entityId, input(world.tick, 1, InputButton.Fire, yaw, pitch));
    stepWorld(world);
    expect(world.warShots[shooter.slot]).toBe(1);
    expect(world.warHits[shooter.slot]).toBe(0);
    expect(world.health[target.slot]).toBe(100);

    // Control: identical range (70 m) down a clear lane of the flat central
    // corridor must hit. x = 30 stays 11 m clear of the city-wall-north box
    // (spans x -19..19 at z = -84) and 1.5 m clear of defender-cover-b
    // (x ≤ 28.5 at z ≈ -50); standing spread (0.008 rad) deflects ≤ 0.56 m
    // at 70 m — inside the 0.62 m body sphere.
    const flat = createWorldState();
    const flatShooter = addPlayer(flat, "flat-shooter", Team.Ottoman);
    const flatTarget = addPlayer(flat, "flat-target", Team.Byzantine);
    expect(flatShooter).toBeDefined();
    expect(flatTarget).toBeDefined();
    if (flatShooter === undefined || flatTarget === undefined) return;
    flat.x[flatShooter.slot] = 30;
    flat.z[flatShooter.slot] = -20;
    flat.x[flatTarget.slot] = 30;
    flat.z[flatTarget.slot] = -90;
    flat.flags[flatTarget.slot] = (flat.flags[flatTarget.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    for (let index = 0; index < 20; index += 1) stepWorld(flat);
    const flatEyeY = (flat.y[flatShooter.slot] ?? 0) + EYE_OFFSET;
    const flatTorsoY = (flat.y[flatTarget.slot] ?? 0) + TORSO_OFFSET;
    const flatPitch = Math.atan2(flatTorsoY - flatEyeY, 70);
    enqueueInput(flat, flatShooter.entityId, input(flat.tick, 1, InputButton.Fire, 0, flatPitch));
    stepWorld(flat);
    expect(flat.warHits[flatShooter.slot]).toBe(1);
    expect(flat.health[flatTarget.slot]).toBeLessThan(100);
  });

  it("impacts a cannon shell on a hillside instead of flying through to z=0", () => {
    const world = createWorldState();
    const gunner = addPlayer(world, "gunner", Team.Ottoman);
    expect(gunner).toBeDefined();
    if (gunner === undefined) return;
    // Surveyed approach to the (710,-745) hill (8e-17 field): from (660,-690)
    // the ground rises monotonically ~0.09 m/m along (0.678,-0.735) — 12.97 at
    // the muzzle to 16.06 at d≈72. A level shell starting 3 m above the local
    // ground meets the rising slope after ~71 m; under the old y<=0 rule it
    // would tunnel and stop far out at y≈0, under the surface.
    const projectile = 0;
    const startX = 660, startZ = -690;
    world.projectileActive[projectile] = 1;
    world.projectileSourceSlot[projectile] = gunner.slot;
    world.projectileGun[projectile] = cannonProjectileGunId(0);
    world.projectileX[projectile] = startX;
    world.projectileZ[projectile] = startZ;
    world.projectileY[projectile] = heightAt(startX, startZ) + 3;
    const dirX = 0.678, dirZ = -0.735; // surveyed uphill direction, normalized
    world.projectileVelocityX[projectile] = dirX * 40;
    world.projectileVelocityY[projectile] = 0;
    world.projectileVelocityZ[projectile] = dirZ * 40;
    world.projectileUntilTick[projectile] = world.tick + 1000;
    let steps = 0;
    while (world.projectileActive[projectile] !== 0 && steps < 300) {
      stepWorld(world);
      steps += 1;
    }
    expect(world.projectileActive[projectile]).toBe(0);
    const finalX = world.projectileX[projectile] ?? 0;
    const finalY = world.projectileY[projectile] ?? 0;
    const finalZ = world.projectileZ[projectile] ?? 0;
    const travelled = Math.hypot(finalX - startX, finalZ - startZ);
    expect(travelled).toBeLessThan(74); // never reached the crest line
    expect(finalY).toBeGreaterThan(2); // struck the hillside, not the old z=0 plane
    expect(finalY).toBeLessThanOrEqual(heightAt(finalX, finalZ));
    expect(finalY).toBeGreaterThan(heightAt(finalX, finalZ) - 1); // no deep tunnelling
  });

  it("places an earthwork on sloped ground with its base on the heightfield", () => {
    const world = createWorldState();
    const builder = addPlayer(world, "slope-builder", Team.Ottoman);
    expect(builder).toBeDefined();
    if (builder === undefined) return;
    // (100,-300): surveyed gentle slope (|∇h| ≈ 0.06, uphill toward +x).
    const bx = 100, bz = -300;
    world.x[builder.slot] = bx;
    world.z[builder.slot] = bz;
    world.y[builder.slot] = heightAt(bx, bz) + GROUND_CENTER_Y;
    for (let index = 0; index < 20; index += 1) stepWorld(world);
    // Aim 5 m downhill (-x): yaw π/2 points along (-1, 0).
    const targetX = bx - 5, targetZ = bz;
    const eyeY = (world.y[builder.slot] ?? 0) + EYE_OFFSET;
    const pitch = Math.atan2(heightAt(targetX, targetZ) - eyeY, 5);
    enqueueInput(world, builder.entityId, input(world.tick, 1, InputButton.RaiseEarthwork, Math.PI / 2, pitch));
    stepWorld(world);
    expect(world.earthworkCount).toBe(1);
    const placedX = world.earthworkX[0] ?? 0;
    const placedZ = world.earthworkZ[0] ?? 0;
    expect(Math.hypot(placedX - targetX, placedZ - targetZ)).toBeLessThan(1.5);
    // The base sits on the heightfield at the placed position (earthwork coords
    // are Float32Array-quantized, so re-sampling heightAt there differs from the
    // placement-time float64 sample by ~gradient×1e-6 — compare loosely).
    expect(world.earthworkY[0] ?? 0).toBeCloseTo(heightAt(placedX, placedZ), 5);
  });
});
