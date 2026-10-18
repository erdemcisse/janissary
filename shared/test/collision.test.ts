import { describe, expect, it } from "vitest";
import { sweepCapsuleAgainstBoxes } from "../src/collision";
import { GRAVITY, GROUND_CENTER_Y, WallState } from "../src/constants";
import { RIVER_BRIDGES, RIVER_BRIDGE_RAILINGS, SIEGE_BLOCKOUT } from "../src/map";
import { TERRAIN_PROPS } from "../src/terrain-props";

const FIXED_DT_SECONDS = 1 / 20;

interface StepState {
  x: number;
  y: number;
  z: number;
  velocityY: number;
  grounded: boolean;
}

function step(state: StepState, input: { x: number; z: number }, wallStates?: Uint8Array): StepState {
  // Mirrors the server loop: simulateMovement (gravity + ground clamp) then
  // sweepCapsuleAgainstBoxes, zeroing vertical velocity when the collision
  // pushes the capsule upward.
  const velocityY = state.grounded ? 0 : state.velocityY + GRAVITY * FIXED_DT_SECONDS;
  let y = state.y + velocityY * FIXED_DT_SECONDS;
  if (y <= GROUND_CENTER_Y) {
    y = GROUND_CENTER_Y;
  }
  const proposed = { x: input.x, y, z: input.z };
  const next = sweepCapsuleAgainstBoxes(state, proposed, SIEGE_BLOCKOUT, wallStates);
  return { ...next, velocityY: next.grounded ? 0 : velocityY };
}

function spread(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function settled(samples: readonly StepState[], tail = 10): { ySpread: number; y: number; velocityY: number } {
  const tailSamples = samples.slice(-tail);
  const last = tailSamples[tailSamples.length - 1];
  return { ySpread: spread(tailSamples.map((sample) => sample.y)), y: last?.y ?? 0, velocityY: last?.velocityY ?? 0 };
}

function expectNoVerticalReboundAfterLeavingSupport(samples: readonly StepState[]): void {
  let descending = false;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous === undefined || current === undefined) continue;
    const deltaY = current.y - previous.y;
    if (deltaY < -0.02) descending = true;
    if (descending) expect(deltaY).toBeLessThanOrEqual(0.02);
  }
  expect(descending).toBe(true);
}

function expectMonotonicClimb(samples: readonly StepState[]): void {
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous === undefined || current === undefined) continue;
    expect(current.y).toBeGreaterThanOrEqual(previous.y - 0.02);
  }
}

const platform = SIEGE_BLOCKOUT.find((box) => box.id === "defender-platform");
if (platform === undefined) throw new Error("defender-platform missing from blockout");

describe("capsule collision against obstacles", () => {
  it("keeps a player on the bridge deck instead of passing through its railing", () => {
    const bridge = RIVER_BRIDGES[1];
    const railing = RIVER_BRIDGE_RAILINGS.find((box) => box.id === "river-bridge-road-railing-south");
    if (bridge === undefined || railing === undefined) throw new Error("road bridge railing missing");
    const deckTop = bridge.y + bridge.height / 2;
    const restY = deckTop + 0.9;
    let state = { x: bridge.x, z: bridge.z + bridge.depth / 2 - 0.8, y: restY, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 30; tick += 1) {
      state = step(state, { x: state.x, z: state.z + 0.35 });
    }
    expect(state.z).toBeLessThanOrEqual(railing.z - railing.depth / 2 - 0.39);
    expect(state.y).toBeCloseTo(restY);
  });

  it("keeps a player standing on the defender platform stable instead of bouncing", () => {
    const top = platform.y + platform.height / 2;
    const restY = top + 0.9;
    const samples: StepState[] = [];
    let state = { x: 0, z: -24, y: restY, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 40; tick += 1) {
      state = step(state, { x: state.x, z: state.z });
      samples.push(state);
    }
    const result = settled(samples);
    expect(result.y).toBeCloseTo(restY);
    expect(result.ySpread).toBeLessThan(0.02);
    expect(result.velocityY).toBe(0);
  });

  it("walks over a breached rubble route without bouncing and settles on the far side", () => {
    const wallStates = new Uint8Array(12);
    wallStates[0] = WallState.Breached;
    const samples: StepState[] = [];
    let state = { x: -66, z: 4.5, y: GROUND_CENTER_Y, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 90; tick += 1) {
      state = step(state, { x: -66, z: state.z - 0.15 }, wallStates);
      samples.push(state);
    }
    const onRubble = samples.filter((sample) => sample.z > -3 && sample.z < 2);
    expect(onRubble.length).toBeGreaterThan(10);
    expect(spread(onRubble.map((sample) => sample.y))).toBeLessThan(0.02);
    expect(samples.at(-1)?.z ?? 0).toBeLessThan(-4);
    const result = settled(samples);
    expect(result.y).toBeCloseTo(GROUND_CENTER_Y);
    expect(result.ySpread).toBeLessThan(0.02);
    expect(result.velocityY).toBe(0);
  });

  it("stands on the top stair step beside the wall without bouncing and is deflected by the wall", () => {
    const topStair = SIEGE_BLOCKOUT.find((box) => box.id === "west-stair-6");
    if (topStair === undefined) throw new Error("west-stair-6 missing from blockout");
    const top = topStair.y + topStair.height / 2;
    const restY = top + 0.9;
    const standSamples: StepState[] = [];
    let standState = { x: -45, z: 0, y: restY, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 40; tick += 1) {
      standState = step(standState, { x: standState.x, z: standState.z });
      standSamples.push(standState);
    }
    const standResult = settled(standSamples);
    expect(standResult.y).toBeCloseTo(restY);
    expect(standResult.ySpread).toBeLessThan(0.02);

    const walkSamples: StepState[] = [];
    let walkState = { x: -45, y: restY, z: 0, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 140; tick += 1) {
      walkState = step(walkState, { x: walkState.x - 0.15, z: walkState.z });
      walkSamples.push(walkState);
    }
    expect(Math.abs(walkSamples.at(-1)?.z ?? 0)).toBeGreaterThan(0.5);
    const walkResult = settled(walkSamples);
    expect(walkResult.ySpread).toBeLessThan(0.02);
    expect(walkResult.velocityY).toBe(0);
  });

  it("walks off the platform ledge and lands cleanly instead of bouncing at the edge", () => {
    const top = platform.y + platform.height / 2;
    const samples: StepState[] = [];
    let state = { x: 0, z: -14, y: top + 0.9, velocityY: 0, grounded: true };
    for (let tick = 0; tick < 40; tick += 1) {
      state = step(state, { x: 0, z: state.z + 0.15 });
      samples.push(state);
    }
    expect(samples.at(-1)?.z ?? 0).toBeGreaterThan(-10);
    const result = settled(samples);
    expect(result.y).toBeCloseTo(GROUND_CENTER_Y);
    expect(result.ySpread).toBeLessThan(0.02);
    expect(result.velocityY).toBe(0);
    expectNoVerticalReboundAfterLeavingSupport(samples);
  });
});

function walkTo(
  state: StepState,
  targetX: number,
  targetZ: number,
  ticks: number,
  wallStates?: Uint8Array,
  distancePerTick = 0.15,
): StepState[] {
  const samples: StepState[] = [];
  let current = state;
  const steps = Math.max(1, Math.ceil(Math.hypot(targetX - current.x, targetZ - current.z) / distancePerTick));
  for (let tick = 0; tick < Math.min(ticks, steps); tick += 1) {
    current = step(current, { x: current.x + (targetX - state.x) / steps, z: current.z + (targetZ - state.z) / steps }, wallStates);
    samples.push(current);
  }
  return samples;
}

describe("hill-fortress stacks and rock-stair clusters (Phase 8c-4)", () => {
  it("generates every stack from tiers at most MAX_STEP_UP tall with a capturable top", () => {
    const stacks = new Map<string, { id: string; y: number; height: number; width: number; depth: number; x: number; z: number }[]>();
    for (const prop of TERRAIN_PROPS) {
      if (!prop.id.startsWith("terrain-stack-")) continue;
      const site = prop.id.slice("terrain-stack-".length, prop.id.lastIndexOf("-"));
      const tiers = stacks.get(site) ?? [];
      tiers.push({ id: prop.id, y: prop.collider.y, height: prop.collider.height, width: prop.collider.width, depth: prop.collider.depth, x: prop.collider.x, z: prop.collider.z });
      stacks.set(site, tiers);
    }
    expect(stacks.size).toBe(4);
    const totals: number[] = [];
    for (const [site, tiers] of stacks) {
      const ordered = [...tiers].sort((left, right) => left.y - right.y);
      let previousTop = 0;
      for (const tier of ordered) {
        expect(tier.height).toBeLessThanOrEqual(2.5);
        expect(tier.y - tier.height / 2).toBeCloseTo(previousTop, 5);
        expect(tier.y + tier.height / 2 - previousTop).toBeLessThanOrEqual(2.5);
        previousTop = tier.y + tier.height / 2;
      }
      totals.push(previousTop);
      const topTier = ordered[ordered.length - 1];
      if (topTier === undefined) continue;
      expect(Math.min(topTier.width, topTier.depth)).toBeGreaterThanOrEqual(18);
      void site;
    }
    const fortTotals = totals.filter((total) => total <= 10.1);
    expect(fortTotals.length).toBe(3);
    expect(fortTotals.every((total) => total >= 6)).toBe(true);
    expect(Math.max(...totals)).toBeGreaterThan(10);
  });

  it("walks a player from the ground to the top of a hill-fortress stack and stands stable", () => {
    const site = TERRAIN_PROPS.find((prop) => prop.id.startsWith("terrain-stack-") && prop.id.endsWith("-0"));
    expect(site).toBeDefined();
    if (site === undefined) return;
    const base = site.collider;
    const walkSamples = walkTo({ x: base.x, z: base.z + base.depth / 2 + 1, y: GROUND_CENTER_Y, velocityY: 0, grounded: true }, base.x, base.z, 400, undefined, 0.08);
    expect(Math.max(...walkSamples.map((sample) => sample.y))).toBeGreaterThan(5);
    expectMonotonicClimb(walkSamples);
    const standSamples: StepState[] = [];
    const last = walkSamples[walkSamples.length - 1];
    if (last === undefined) return;
    let standing = last;
    for (let tick = 0; tick < 30; tick += 1) {
      standing = step(standing, { x: base.x, z: base.z });
      standSamples.push(standing);
    }
    expect(spread(standSamples.map((sample) => sample.y))).toBeLessThan(0.02);
    expect(standSamples.at(-1)?.velocityY ?? -1).toBe(0);
  });

  it("generates rock-stair clusters whose steps stay within MAX_STEP_UP", () => {
    const clusters = new Map<string, { top: number; x: number; z: number }[]>();
    for (const prop of TERRAIN_PROPS) {
      if (!prop.id.startsWith("terrain-rock-stair-")) continue;
      const cluster = prop.id.slice(0, prop.id.lastIndexOf("-"));
      const rocks = clusters.get(cluster) ?? [];
      rocks.push({ top: prop.collider.y + prop.collider.height / 2, x: prop.collider.x, z: prop.collider.z });
      clusters.set(cluster, rocks);
    }
    expect(clusters.size).toBeGreaterThanOrEqual(2);
    for (const rocks of clusters.values()) {
      expect(rocks.length).toBeGreaterThanOrEqual(3);
      expect(rocks.length).toBeLessThanOrEqual(5);
      const ordered = [...rocks].sort((left, right) => left.top - right.top);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (previous === undefined || current === undefined) continue;
        expect(current.top - previous.top).toBeGreaterThan(0.5);
        expect(current.top - previous.top).toBeLessThanOrEqual(2.5);
      }
    }
  });

  it("climbs a rock-stair cluster end to end and settles on top", () => {
    const clusterRocks = TERRAIN_PROPS
      .filter((prop) => prop.id.startsWith("terrain-rock-stair-1-"))
      .sort((left, right) => left.collider.y - right.collider.y);
    const first = clusterRocks[0];
    const last = clusterRocks[clusterRocks.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;
    const dx = last.collider.x - first.collider.x;
    const dz = last.collider.z - first.collider.z;
    const length = Math.hypot(dx, dz);
    const axisX = dx / length;
    const axisZ = dz / length;
    const startX = first.collider.x - axisX * 3;
    const startZ = first.collider.z - axisZ * 3;
    const targetX = last.collider.x;
    const targetZ = last.collider.z;
    const walkSamples = walkTo({ x: startX, z: startZ, y: GROUND_CENTER_Y, velocityY: 0, grounded: true }, targetX, targetZ, 400, undefined, 0.04);
    expect(Math.max(...walkSamples.map((sample) => sample.y))).toBeGreaterThan(5);
    // The four footprints overlap. Moving slowly across all three seams used
    // to alternate support tops and produce an up/down sawtooth.
    expectMonotonicClimb(walkSamples);
    const standSamples: StepState[] = [];
    const settled = walkSamples[walkSamples.length - 1];
    if (settled === undefined) return;
    let standing = settled;
    for (let tick = 0; tick < 30; tick += 1) {
      standing = step(standing, { x: standing.x, z: standing.z });
      standSamples.push(standing);
    }
    expect(spread(standSamples.map((sample) => sample.y))).toBeLessThan(0.02);
    expect(standSamples.at(-1)?.velocityY ?? -1).toBe(0);
  });
});
