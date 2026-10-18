import { describe, expect, it } from "vitest";
import { clampRewindTick, rayHitsSphere, rewoundPosition, type PositionFrame } from "../src/sim/lagCompensation";
import { FIXED_DT_MS, HEADSHOT_CENTER_OFFSET, HEADSHOT_RADIUS, InputButton, PlayerFlag, Team } from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, rayHitKind, stepWorld } from "../src/sim/world";

describe("lag compensation", () => {
  it("rewinds a moving target to the shooter's acknowledged interpolation tick", () => {
    const frames: PositionFrame[] = [
      { tick: 10, positions: new Map([[2, { x: 0, y: 1, z: -20 }]]) },
      { tick: 13, positions: new Map([[2, { x: 8, y: 1, z: -20 }]]) },
    ];
    const position = rewoundPosition(frames, 2, 10, 13, 5);
    expect(position).toEqual({ x: 0, y: 1, z: -20 });
    const hit = rayHitsSphere({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, position!, 0.7);
    expect(hit).toBeCloseTo(19.3, 1);
  });

  it("clamps a maliciously old rewind request to the history window", () => {
    expect(clampRewindTick(30, 1, 5)).toBe(25);
    expect(clampRewindTick(30, 99, 5)).toBe(30);
  });

  it("registers a 150 ms-late shot against the moving target's interpolated historical position", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    expect(shooter).toBeDefined(); expect(target).toBeDefined();
    if (shooter === undefined || target === undefined) return;
    world.x[shooter.slot] = 0; world.z[shooter.slot] = 20; world.yaw[shooter.slot] = 0;
    world.x[target.slot] = 0; world.z[target.slot] = 10;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.tick = 19; world.stationarySinceTick[shooter.slot] = 1;
    stepWorld(world); // captures tick 20 with target at x=0
    world.x[target.slot] = 4; // target has moved by the time the input reaches the server
    enqueueInput(world, shooter.entityId, {
      seq: 1, lastSnapshotTick: 20, buttons: InputButton.Fire, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS,
    });
    stepWorld(world);
    expect(world.health[target.slot]).toBeLessThan(100);
  });

  it("accepts only the same alive entity from the requested rewind frame", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const target = addPlayer(world, "target", Team.Byzantine);
    expect(shooter).toBeDefined(); expect(target).toBeDefined();
    if (shooter === undefined || target === undefined) return;
    world.x[shooter.slot] = 0; world.z[shooter.slot] = 20; world.yaw[shooter.slot] = 0;
    world.x[target.slot] = 0; world.z[target.slot] = 10;
    world.flags[shooter.slot] = (world.flags[shooter.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.flags[target.slot] = (world.flags[target.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.tick = 19;
    world.stationarySinceTick[shooter.slot] = 1;
    stepWorld(world);
    const aliveTick = world.tick;

    world.flags[target.slot] = 0;
    world.health[target.slot] = 0;
    world.respawnAtTick[target.slot] = world.tick + 100;
    stepWorld(world);
    const deadTick = world.tick;

    world.flags[target.slot] = PlayerFlag.Alive;
    world.health[target.slot] = 100;
    enqueueInput(world, shooter.entityId, {
      seq: 1, lastSnapshotTick: aliveTick, buttons: InputButton.Fire, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS,
    });
    stepWorld(world);
    expect(world.health[target.slot]).toBeLessThan(100);

    world.health[target.slot] = 100;
    world.ammo[shooter.slot] = 1;
    world.nextFireTick[shooter.slot] = 0;
    enqueueInput(world, shooter.entityId, {
      seq: 2, lastSnapshotTick: deadTick, buttons: InputButton.Fire, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS,
    });
    stepWorld(world);
    expect(world.health[target.slot]).toBe(100);
  });

  it("rejects a rewound slot after its entity id has been reused", () => {
    const world = createWorldState();
    const shooter = addPlayer(world, "shooter", Team.Ottoman);
    const firstTarget = addPlayer(world, "first target", Team.Byzantine);
    expect(shooter).toBeDefined(); expect(firstTarget).toBeDefined();
    if (shooter === undefined || firstTarget === undefined) return;
    world.x[shooter.slot] = 0; world.z[shooter.slot] = 20; world.yaw[shooter.slot] = 0;
    world.x[firstTarget.slot] = 0; world.z[firstTarget.slot] = 10;
    world.flags[shooter.slot] = (world.flags[shooter.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    world.flags[firstTarget.slot] = (world.flags[firstTarget.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    stepWorld(world);
    const oldEntityTick = world.tick;
    const oldSlot = firstTarget.slot;
    world.nextEntityId = firstTarget.entityId + 1;
    world.slotByEntityId.delete(firstTarget.entityId);
    world.active[oldSlot] = 0;
    world.count -= 1;
    const replacement = addPlayer(world, "replacement", Team.Byzantine);
    expect(replacement?.slot).toBe(oldSlot);
    if (replacement === undefined) return;
    world.x[replacement.slot] = 0; world.z[replacement.slot] = 10;
    world.flags[replacement.slot] = (world.flags[replacement.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
    enqueueInput(world, shooter.entityId, {
      seq: 1, lastSnapshotTick: oldEntityTick, buttons: InputButton.Fire, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS,
    });
    stepWorld(world);
    expect(world.health[replacement.slot]).toBe(100);
  });
});

describe("mounted rewind hitboxes", () => {
  it("separates horse and raised rider spheres at a rewind boundary", () => {
    const position = { x: 0, y: 0.9, z: 0 };
    expect(rayHitKind({ x: 0, y: 1.05, z: 8 }, { x: 0, y: 0, z: -1 }, position, true, false).kind).toBe("horse");
    expect(rayHitKind({ x: 0, y: 2.2, z: 8 }, { x: 0, y: 0, z: -1 }, position, true, false).kind).toBe("rider");
    expect(rayHitKind({ x: 4, y: 2.2, z: 8 }, { x: 0, y: 0, z: -1 }, position, true, false).kind).toBe("none");
  });

  it("classifies a headshot only when the ray clears the body crown", () => {
    const position = { x: 0, y: 0.9, z: 0 };
    const bodyCenterY = position.y + 0.35;
    const headCenterY = bodyCenterY + HEADSHOT_CENTER_OFFSET;
    const headOriginY = 1.55;
    const distance = 20;
    const headPitch = Math.atan2(headCenterY - headOriginY, distance);
    const direction = { x: 0, y: Math.sin(headPitch), z: -Math.cos(headPitch) };
    const head = rayHitKind({ x: 0, y: headOriginY, z: distance }, direction, position, false, false);
    expect(head.kind).toBe("head");
    expect(head.distance).toBeGreaterThan(19);
    expect(head.distance).toBeLessThanOrEqual(20);

    const bodyPitch = Math.atan2(bodyCenterY - headOriginY, distance);
    const bodyDirection = { x: 0, y: Math.sin(bodyPitch), z: -Math.cos(bodyPitch) };
    expect(rayHitKind({ x: 0, y: headOriginY, z: distance }, bodyDirection, position, false, false).kind).toBe("rider");

    const overPitch = Math.atan2(headCenterY + HEADSHOT_RADIUS + 0.05 - headOriginY, distance);
    const overDirection = { x: 0, y: Math.sin(overPitch), z: -Math.cos(overPitch) };
    expect(rayHitKind({ x: 0, y: headOriginY, z: distance }, overDirection, position, false, false).kind).toBe("none");
  });
});
