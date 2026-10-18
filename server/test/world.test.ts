import { describe, expect, it } from "vitest";
import { BASE_SPAWN_POINT_INDEX, CAPTURE_MAX_PROGRESS, CAPTURE_POINTS, FIXED_DT_MS, FIXED_DT_SECONDS, GRAVITY, GROUND_CENTER_Y, InputButton, JUMP_HEIGHT, MAX_SPEED, OTTOMAN_SPAWN, PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER, PlayerClass, PlayerFlag, Team, WAR_TICKETS } from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, removePlayer, requestDeploy, requestSpawnPoint, stepWorld } from "../src/sim/world";

describe("authoritative simulation", () => {
  it("moves a player while clamping speed and ground contact", () => {
    const world = createWorldState();
    const player = addPlayer(world, "test");
    expect(player).toBeDefined();
    if (player === undefined) return;
    for (let seq = 1; seq <= 40; seq += 1) {
      enqueueInput(world, player.entityId, {
        seq,
        lastSnapshotTick: 0,
        buttons: InputButton.Forward,
        yaw: 0,
        pitch: 0,
        dtMs: FIXED_DT_MS,
      });
      stepWorld(world);
    }
    // 8e-19: MAX_SPEED is 6.8, which float32 storage cannot represent exactly
    // (6.80000019) — the cap assertion needs the storage epsilon.
    expect(Math.hypot(world.velocityX[player.slot] ?? 0, world.velocityZ[player.slot] ?? 0)).toBeLessThanOrEqual(MAX_SPEED + 1e-4);
    expect(world.y[player.slot]).toBeCloseTo(GROUND_CENTER_Y);
    expect(world.ackInputSeq[player.slot]).toBe(40);
  });

  it("accumulates gravity during a fall and completes a jump arc", () => {
    const world = createWorldState();
    const player = addPlayer(world, "jumper");
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.y[player.slot] = 8;
    world.velocityY[player.slot] = 7;
    world.grounded[player.slot] = 0;
    const verticalVelocities: number[] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      stepWorld(world);
      verticalVelocities.push(world.velocityY[player.slot] ?? 0);
    }
    expect(verticalVelocities[0]).toBeCloseTo(7 + GRAVITY * FIXED_DT_SECONDS);
    expect(verticalVelocities[1]).toBeCloseTo(7 + GRAVITY * FIXED_DT_SECONDS * 2);
    expect(Math.max(...verticalVelocities)).toBeGreaterThan(0);
    expect(verticalVelocities.some((velocity) => velocity < 0)).toBe(true);
    expect(world.y[player.slot]).toBeCloseTo(GROUND_CENTER_Y);
    expect(world.velocityY[player.slot]).toBe(0);
  });

  it("executes one grounded jump per press without bunny-hop speed gain", () => {
    const world = createWorldState();
    const player = addPlayer(world, "jumper");
    expect(player).toBeDefined();
    if (player === undefined) return;
    let takeoffs = 0;
    let wasGrounded = world.grounded[player.slot] !== 0;
    let maximumY = world.y[player.slot] ?? GROUND_CENTER_Y;
    let maximumHorizontalSpeed = 0;
    for (let tick = 1; tick <= 60; tick += 1) {
      enqueueInput(world, player.entityId, {
        seq: tick,
        lastSnapshotTick: world.tick,
        buttons: InputButton.Forward | InputButton.Jump,
        yaw: 0,
        pitch: 0,
        dtMs: FIXED_DT_MS,
      });
      stepWorld(world);
      const grounded = world.grounded[player.slot] !== 0;
      if (wasGrounded && !grounded) takeoffs += 1;
      wasGrounded = grounded;
      maximumY = Math.max(maximumY, world.y[player.slot] ?? 0);
      maximumHorizontalSpeed = Math.max(maximumHorizontalSpeed, Math.hypot(world.velocityX[player.slot] ?? 0, world.velocityZ[player.slot] ?? 0));
    }
    expect(takeoffs).toBe(1);
    expect(maximumY - GROUND_CENTER_Y).toBeCloseTo(JUMP_HEIGHT, 1);
    expect(maximumHorizontalSpeed).toBeLessThanOrEqual(MAX_SPEED + 1e-4); // float32 epsilon, 8e-19
    expect(world.grounded[player.slot]).toBe(1);

    enqueueInput(world, player.entityId, { seq: 61, lastSnapshotTick: world.tick, buttons: 0, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    stepWorld(world);
    enqueueInput(world, player.entityId, { seq: 62, lastSnapshotTick: world.tick, buttons: InputButton.Jump, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    stepWorld(world);
    expect(world.grounded[player.slot]).toBe(0);
    expect(world.velocityY[player.slot]).toBeGreaterThan(0);
  });

  it("clears liveness and combat state when a slot is released", () => {
    const world = createWorldState();
    const player = addPlayer(world, "departing");
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.flags[player.slot] = PlayerFlag.Alive | PlayerFlag.Reloading;
    world.health[player.slot] = 73;
    world.reloadUntilTick[player.slot] = 99;
    world.nextFireTick[player.slot] = 88;
    expect(removePlayer(world, player.entityId)).toBe(true);
    expect(world.active[player.slot]).toBe(0);
    expect(world.entityId[player.slot]).toBe(0);
    expect(world.flags[player.slot]).toBe(0);
    expect(world.health[player.slot]).toBe(0);
    expect(world.reloadUntilTick[player.slot]).toBe(0);
    expect(world.nextFireTick[player.slot]).toBe(0);
  });

  it("revalidates an owned forward spawn at deploy time", () => {
    const world = createWorldState();
    const player = addPlayer(world, "forward", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    const hillIndex = 4;
    const hill = CAPTURE_POINTS[hillIndex];
    expect(hill).toBeDefined();
    if (hill === undefined) return;
    world.pointOwner[hillIndex] = Team.Ottoman;
    world.flags[player.slot] = 0;
    world.health[player.slot] = 0;
    world.respawnAtTick[player.slot] = world.tick; // deploy floor already reached
    expect(requestSpawnPoint(world, player.entityId, hillIndex)).toBe(true);
    // 8e-13: humans no longer auto-respawn — Deploy performs the spawn and
    // revalidates the requested point at deploy time. (No stepWorld here: an
    // unattended point decays to Team.None in updateCapture, which is exactly
    // what the revalidation guards against.)
    expect(requestDeploy(world, player.entityId)).toBe(true);
    expect(world.x[player.slot]).toBeCloseTo(hill.x);
    expect(world.z[player.slot]).toBeCloseTo(hill.z);
    expect(world.y[player.slot]).toBeGreaterThan(GROUND_CENTER_Y);
    expect(world.requestedSpawnPoint[player.slot]).toBe(-1);
  });

  it("falls back to base if ownership flips or an enemy contests the point", () => {
    const flipped = createWorldState();
    const first = addPlayer(flipped, "flipped", Team.Ottoman);
    expect(first).toBeDefined();
    if (first === undefined) return;
    flipped.pointOwner[4] = Team.Ottoman;
    flipped.flags[first.slot] = 0;
    flipped.respawnAtTick[first.slot] = 1;
    expect(requestSpawnPoint(flipped, first.entityId, 4)).toBe(true);
    flipped.pointOwner[4] = Team.Byzantine;
    stepWorld(flipped);
    expect(requestDeploy(flipped, first.entityId)).toBe(true);
    expect({ x: flipped.x[first.slot], z: flipped.z[first.slot] }).toEqual({ x: OTTOMAN_SPAWN.x, z: OTTOMAN_SPAWN.z });

    const contested = createWorldState();
    const second = addPlayer(contested, "contested", Team.Ottoman);
    const enemy = addPlayer(contested, "enemy", Team.Byzantine);
    expect(second).toBeDefined();
    expect(enemy).toBeDefined();
    if (second === undefined || enemy === undefined) return;
    const point = CAPTURE_POINTS[5];
    expect(point).toBeDefined();
    if (point === undefined) return;
    contested.pointOwner[5] = Team.Ottoman;
    contested.flags[second.slot] = 0;
    contested.respawnAtTick[second.slot] = 1;
    expect(requestSpawnPoint(contested, second.entityId, 5)).toBe(true);
    contested.x[enemy.slot] = point.x;
    contested.z[enemy.slot] = point.z;
    stepWorld(contested);
    expect(requestDeploy(contested, second.entityId)).toBe(true);
    expect({ x: contested.x[second.slot], z: contested.z[second.slot] }).toEqual({ x: OTTOMAN_SPAWN.x, z: OTTOMAN_SPAWN.z });
    expect(requestSpawnPoint(contested, enemy.entityId, 5)).toBe(false);
  });

  it("rejects a dead player's request for an unowned point", () => {
    const world = createWorldState();
    const player = addPlayer(world, "intruder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.flags[player.slot] = 0;
    world.health[player.slot] = 0;
    world.respawnAtTick[player.slot] = 1;
    world.pointOwner[6] = Team.Byzantine;
    expect(requestSpawnPoint(world, player.entityId, 6)).toBe(false);
    stepWorld(world);
    expect(requestDeploy(world, player.entityId)).toBe(true);
    expect({ x: world.x[player.slot], z: world.z[player.slot] }).toEqual({ x: OTTOMAN_SPAWN.x, z: OTTOMAN_SPAWN.z });
  });

  it("keeps home base available and accumulates fractional ticket drain", () => {
    const world = createWorldState();
    const player = addPlayer(world, "holder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;
    world.flags[player.slot] = 0;
    world.respawnAtTick[player.slot] = 1;
    expect(requestSpawnPoint(world, player.entityId, BASE_SPAWN_POINT_INDEX)).toBe(true);
    stepWorld(world);
    expect(requestDeploy(world, player.entityId)).toBe(true);
    expect({ x: world.x[player.slot], z: world.z[player.slot] }).toEqual({ x: OTTOMAN_SPAWN.x, z: OTTOMAN_SPAWN.z });

    const point = CAPTURE_POINTS[0];
    expect(point).toBeDefined();
    if (point === undefined) return;
    world.x[player.slot] = point.x;
    world.z[player.slot] = point.z;
    world.pointProgress[0] = CAPTURE_MAX_PROGRESS;
    for (let tick = 0; tick < 20; tick += 1) stepWorld(world);
    expect(world.byzantineTickets).toBe(WAR_TICKETS);
    expect(world.byzantineTicketDrainCarry).toBeCloseTo(0.5);
    for (let tick = 0; tick < 20; tick += 1) stepWorld(world);
    expect(world.byzantineTickets).toBe(WAR_TICKETS - 1);
    expect(world.byzantineTicketDrainCarry).toBeCloseTo(0);
  });
});

describe("field-gun carry replication (Phase 8e-25)", () => {
  it("sets the CarryingFieldGun flag for a Topçu with an undeployed, uncrewed personal gun", () => {
    const world = createWorldState();
    const topcu = addPlayer(world, "topcu", Team.Ottoman, PlayerClass.Topcu);
    expect(topcu).toBeDefined();
    if (topcu === undefined) return;
    stepWorld(world);
    expect((world.flags[topcu.slot] ?? 0) & PlayerFlag.CarryingFieldGun).not.toBe(0);
    // The replicated flag is the client's only authority for the carry — the
    // same 0.7 factor the authoritative sim applies to movement.
    expect(PERSONAL_CANNON_PUSH_SPEED_MULTIPLIER).toBeLessThan(1);
  });

  it("clears the carry flag once the gunner boards the personal cannon", () => {
    const world = createWorldState();
    const topcu = addPlayer(world, "topcu", Team.Ottoman, PlayerClass.Topcu);
    expect(topcu).toBeDefined();
    if (topcu === undefined) return;
    stepWorld(world);
    const personal = (() => {
      for (let index = 0; index < world.cannons.ownerSlot.length; index += 1) {
        if (world.cannons.active[index] !== 0 && (world.cannons.ownerSlot[index] ?? -1) === topcu.slot) return index;
      }
      return -1;
    })();
    expect(personal).toBeGreaterThanOrEqual(0);
    world.cannonCrew[topcu.slot] = personal;
    stepWorld(world);
    expect((world.flags[topcu.slot] ?? 0) & PlayerFlag.CarryingFieldGun).toBe(0);
  });
});

describe("directional slope resistance (Phase 8e-8)", () => {
  it("slows a foot soldier climbing the defender platform vs flat-field walking", () => {    // The defender platform (SIEGE_BLOCKOUT, deterministic): z ∈ [-34, -14],
    // top 2.0 m. Both players are in the SAME world (SIEGE_BLOCKOUT applies
    // to everyone); the control walks the open field near the Ottoman spawn,
    // the climber approaches the platform from z = -35.9 so the 1.5 m
    // ahead-probe reads the rise from the very first tick. Walking +Z (yaw π).
    const world = createWorldState();
    const flat = addPlayer(world, "flat", Team.Ottoman);
    const climber = addPlayer(world, "climber", Team.Ottoman);
    expect(flat).toBeDefined();
    expect(climber).toBeDefined();
    if (flat === undefined || climber === undefined) return;
    world.x[flat.slot] = 0;
    world.z[flat.slot] = 60; // open field: probe never touches a box
    world.x[climber.slot] = 0;
    world.z[climber.slot] = -35.9;
    for (let tick = 0; tick < 30; tick += 1) {
      for (const slot of [flat.slot, climber.slot]) {
        enqueueInput(world, world.entityId[slot] ?? 0, {
          seq: tick * 2 + 1,
          lastSnapshotTick: 0,
          buttons: InputButton.Forward,
          yaw: Math.PI, // facing +Z
          pitch: 0,
          dtMs: FIXED_DT_MS,
        });
      }
      stepWorld(world); // one sim tick per input tick
    }
    const flatDistance = (world.z[flat.slot] ?? 0) - 60;
    const climbDistance = (world.z[climber.slot] ?? 0) + 35.9;
    // The climber actually stepped onto the 2.0 m platform…
    expect(world.y[climber.slot] ?? 0).toBeGreaterThan(GROUND_CENTER_Y + 1.5);
    // …and lost ground to the flat-field control while the probe read the
    // rise. Resistance bites only within 1.5 m of an edge, so the ratio stays
    // far above the 0.6 curve floor.
    expect(climbDistance).toBeLessThan(flatDistance);
    expect(climbDistance / flatDistance).toBeGreaterThan(0.8);
  });

  it("does not apply slope resistance to mounted movement", () => {
    const world = createWorldState();
    const rider = addPlayer(world, "rider", Team.Ottoman, undefined, false);
    expect(rider).toBeDefined();
    if (rider === undefined) return;
    world.x[rider.slot] = 0;
    world.z[rider.slot] = -35;
    world.mounted[rider.slot] = 1;
    const startZ = world.z[rider.slot] ?? 0;
    for (let tick = 0; tick < 40; tick += 1) {
      enqueueInput(world, rider.entityId, {
        seq: tick + 1,
        lastSnapshotTick: 0,
        buttons: InputButton.Forward,
        yaw: Math.PI,
        pitch: 0,
        dtMs: FIXED_DT_MS,
      });
      stepWorld(world);
    }
    // Mounted: no slope factor; the rider crosses the platform at full
    // gallop speed (the phase rule: do not touch mount movement).
    expect((world.z[rider.slot] ?? 0) - startZ).toBeGreaterThan(2);
    expect(world.mounted[rider.slot]).toBe(1);
  });
});
