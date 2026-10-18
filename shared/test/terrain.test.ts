import { describe, expect, it } from "vitest";
import {
  ARTILLERY_EMPLACEMENTS,
  BYZANTINE_SPAWN,
  CANNON_STAGING,
  CAPTURE_POINTS,
  DOCK_PIERS,
  OTTOMAN_SPAWN,
  RIVER_BRIDGES,
  RIVER_FORDS,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  TERRAIN_PROPS,
  WATER_SHORE_Z,
  heightAt,
  impactHeightAt,
  raycastTerrain,
  terrainGradientAt,
  terrainMaskAt,
  TERRAIN_FIELD_MAX_HEIGHT,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_OCTAVES,
} from "../src/index";

/**
 * Phase 8e-11 (ADR 0040): the shared heightfield is the single source of
 * truth for ground height on both sides. These tests pin determinism, the
 * keep-flat mask over every gameplay structure, the gradient bounds the ray
 * marcher and the ground snap rely on, and the pinned probe table that makes
 * any terrain change a loud, deliberate event (the terrain IS map data).
 *
 * Phase 8e-17 (ADR 0044) retuned the field toward the redcoats.io references
 * (bolder relief, city bias, carved river channel). The 8e-11 contracts are
 * unchanged — same single heightAt, same keep-flat semantics, same parity —
 * but pins that asserted "river channel == 0" now assert the carve profile:
 * the channel bed is BELOW zero, fords stay shallow, bridge decks stay
 * exactly flat and fully supported.
 *
 * Phase 8e-19 (ADR 0047 Task 8) A/B-raised the primary octave 22 → 30 m and
 * the fine octave 1.6 → 2.2 m (measured span 41.6 → 48.2 m, open-field max
 * gradient 0.212 → 0.235 — both still under the walkability pins). The probe
 * table below is the loud re-pin for that retune.
 */

describe("terrain heightfield", () => {
  it("is deterministic and matches the pinned probe table", () => {
    const probes: readonly { x: number; z: number; h: number }[] = [
      { x: -500, z: -400, h: -7.434886314518546 },
      { x: 300, z: -250, h: -7.108086834949698 },
      { x: -150, z: 100, h: 3.4942950663252406 },
      { x: 450, z: 150, h: -3.1832298995204686 },
      { x: -700, z: 0, h: -16.37407854812234 },
      { x: 150, z: -500, h: -4.7580107475957805 },
      { x: -250, z: -650, h: -18.117341423483154 },
      { x: 650, z: 450, h: -4.246233126735915 },
      { x: -350, z: 350, h: -1.7626108569199914 },
      { x: 100, z: 205, h: 0.5763934061232067 },
    ];
    for (const probe of probes) {
      expect(heightAt(probe.x, probe.z)).toBe(probe.h);
      // Repeated evaluation is bit-identical (no hidden state).
      expect(heightAt(probe.x, probe.z)).toBe(probe.h);
    }
  });

  it("is exactly flat at every capture point, spawn, gun and staging", () => {
    for (const point of CAPTURE_POINTS) expect(heightAt(point.x, point.z)).toBe(0);
    expect(heightAt(OTTOMAN_SPAWN.x, OTTOMAN_SPAWN.z)).toBe(0);
    expect(heightAt(BYZANTINE_SPAWN.x, BYZANTINE_SPAWN.z)).toBe(0);
    for (const gun of ARTILLERY_EMPLACEMENTS) expect(heightAt(gun.x, gun.z)).toBe(0);
    for (const gun of CANNON_STAGING) expect(heightAt(gun.x, gun.z)).toBe(0);
  });

  it("is exactly flat under every terrain prop footprint", () => {
    for (const prop of TERRAIN_PROPS) {
      expect(heightAt(prop.x, prop.z)).toBe(0);
    }
  });

  it("is exactly flat across the wall lane and the siege corridor", () => {
    for (let x = -80; x <= 80; x += 10) {
      for (let z = -12; z <= 12; z += 6) expect(heightAt(x, z)).toBe(0);
    }
    for (let x = -35; x <= 35; x += 7) {
      for (let z = -120; z <= 125; z += 15) expect(heightAt(x, z)).toBe(0);
    }
  });

  it("carves the river channel: deep bed, shallow fords, flat supported bridges", () => {
    // 8e-17 (ADR 0044): the channel is carved BELOW zero — deep reaches sit
    // at -2.2 m, fords at -0.35 m (a readable wade), and a small levee lip
    // rises just past the waterline. Bridge footprints stay exactly flat
    // (independent-review finding R1, ADR 0040 §11) and the carve keeps out
    // of them, so the 36 m decks are fully supported.
    for (const ford of RIVER_FORDS) {
      expect(heightAt(ford.x, ford.z)).toBeCloseTo(-0.35, 6);
      // The visual surface clamp reports the water surface, not the bed.
      expect(impactHeightAt(ford.x, ford.z)).toBeCloseTo(0.03, 6);
    }
    // A deep reach away from fords/bridges (z = -60 centerline): flat bed
    // out to d = 8, then the bank rises through the waterline to the lip.
    expect(heightAt(-330, -60)).toBeCloseTo(-2.2, 6);
    expect(heightAt(-324, -60)).toBeCloseTo(-2.2, 6);
    expect(heightAt(-316, -60)).toBeCloseTo(-0.1005, 3); // just past the waterline
    expect(heightAt(-314, -60)).toBeGreaterThan(0.05); // the levee lip
    // The headwater lake basin is carved too.
    expect(heightAt(RIVER_HEADWATER.x, RIVER_HEADWATER.z)).toBeCloseTo(-2.2, 6);
    // The mouth fades to the flat sea bed at the shore line.
    expect(heightAt(-330, WATER_SHORE_Z)).toBe(0);
    // Every centerline sample is either carved (below the old flat 0) or
    // exactly 0 inside a bridge keep-out / the mouth fade.
    for (const segment of RIVER_SEGMENTS) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const h = heightAt(segment.x1 + (segment.x2 - segment.x1) * t, segment.z1 + (segment.z2 - segment.z1) * t);
        expect(h).toBeLessThanOrEqual(0);
        expect(h).toBeGreaterThanOrEqual(-2.2);
      }
    }
    // Full bridge footprints, not just centers: the 36 m decks reach ~25 m
    // off the river centerline — beyond the carved channel — so the mask
    // adds a per-bridge rect AND the carve keeps out of the footprint.
    for (const bridge of RIVER_BRIDGES) {
      for (let dx = -bridge.width / 2 - 1; dx <= bridge.width / 2 + 1; dx += 2) {
        for (let dz = -bridge.depth / 2 - 1; dz <= bridge.depth / 2 + 1; dz += 2) {
          expect(heightAt(bridge.x + dx, bridge.z + dz)).toBe(0);
        }
      }
    }
    for (const pier of DOCK_PIERS) expect(heightAt(pier.x, pier.z)).toBe(0);
  });

  it("is exactly flat in the sea band and the wade line", () => {
    for (let x = -800; x <= 800; x += 100) {
      expect(heightAt(x, 235)).toBe(0);
      expect(heightAt(x, 290)).toBe(0);
    }
  });

  it("stays within the relief budget and has real hills in the open field", () => {
    let max = -Infinity;
    let min = Infinity;
    for (let x = -900; x <= 900; x += 6) {
      for (let z = -900; z <= 900; z += 6) {
        const h = heightAt(x, z);
        max = Math.max(max, h);
        min = Math.min(min, h);
      }
    }
    // The field bound (noise + city bias) plus the carve bed below zero.
    expect(max).toBeLessThanOrEqual(TERRAIN_FIELD_MAX_HEIGHT + 1e-9);
    expect(min).toBeGreaterThanOrEqual(-TERRAIN_FIELD_MAX_HEIGHT - 2.2 - 1e-9);
    // 8e-17 "tens of metres high, hundreds wide" (ADR 0044): measured span
    // 41.6 m (2026-08-06, 4 m grid); pin well under that so the bold relief
    // itself is contract, not accident.
    expect(max - min).toBeGreaterThanOrEqual(30);
  });

  it("keeps the gradient under the ray-marcher bound everywhere", () => {
    // This bound is the contract TERRAIN_RAY_MAX_GRADIENT = 1.25 relies on:
    // sphere-tracing steps are safe only while the true gradient stays below
    // it. Measured 2026-08-06 after the 8e-17 retune (2 m grid): map-wide
    // max ≈ 0.56 (an adaptive mask-feather bank), open field ≤ 0.23. The
    // 1.25 constant keeps ~2× margin over this pin for the analytic feather
    // worst case (~0.8) plus the carve bank (~0.5).
    // If a mask/octave change pushes this over 1.0, raise the ray bound in
    // terrain.ts in the same commit.
    const gradient = { x: 0, z: 0 };
    let maxGradient = 0;
    let maxFieldGradient = 0;
    for (let x = -900; x <= 900; x += 4) {
      for (let z = -900; z <= 900; z += 4) {
        terrainGradientAt(x, z, gradient);
        const magnitude = Math.hypot(gradient.x, gradient.z);
        maxGradient = Math.max(maxGradient, magnitude);
        if (terrainMaskAt(x, z) > 0.98) maxFieldGradient = Math.max(maxFieldGradient, magnitude);
      }
    }
    expect(maxGradient).toBeLessThan(1);
    // Rolling, not cliffs: the open field itself stays gentle.
    expect(maxFieldGradient).toBeLessThan(0.35);
    // ~200k-sample map scan: fine solo, wall-clock flaky at the default 5 s
    // under full-suite parallel load (INFO-5) — explicit budget, same
    // treatment as the biomes z-pin stride test.
  }, 15000);

  it("is continuous across the wire quantization step (5 cm)", () => {
    // POSITION_SCALE = 10 quantizes replicated positions to 0.05 m; the two
    // sides can disagree about a sampled position by at most that much, so
    // the sampled floor can disagree by at most gradient × 0.05 (≤ 5 cm) —
    // inside the 8e-6 reconciliation noise floor. No cliffs allowed.
    const probes = [
      [0, 40], [-150, 100], [-500, -400], [300, -250], [-330, 60], [74, 42],
      [-470 + 40, -150], [0, 135], [-620, 404], [596, -880],
    ] as const;
    for (const [x, z] of probes) {
      const here = heightAt(x, z);
      expect(Math.abs(heightAt(x + 0.05, z) - here)).toBeLessThan(0.06);
      expect(Math.abs(heightAt(x, z + 0.05) - here)).toBeLessThan(0.06);
    }
  });

  it("keeps the mask factor inside [0, 1] and reports full relief in the open field", () => {
    let sawFullRelief = false;
    for (let x = -880; x <= 880; x += 17) {
      for (let z = -880; z <= 880; z += 17) {
        const mask = terrainMaskAt(x, z);
        expect(mask).toBeGreaterThanOrEqual(0);
        expect(mask).toBeLessThanOrEqual(1);
        if (mask === 1) sawFullRelief = true;
      }
    }
    expect(sawFullRelief).toBe(true);
  });

  it("raycastTerrain hits ground aimed at it and misses rays that stay above", () => {
    // Straight down hits exactly at the shooter's own clearance.
    const hillX = -700;
    const hillZ = 0;
    const ground = heightAt(hillX, hillZ);
    const down = raycastTerrain(hillX, ground + 1.5, hillZ, 0, -1, 0, 50);
    expect(down).toBeDefined();
    expect(down ?? 0).toBeCloseTo(1.5, 1);
    // An ascending ray from the valley floor never hits (terrain can't out-rise it).
    expect(raycastTerrain(hillX, ground + 1.5, hillZ, 0, 1, 0, 100)).toBeUndefined();
    // A level ray 1.5 m over the flat sea never hits.
    expect(raycastTerrain(0, 1.5, 260, 1, 0, 0, 200)).toBeUndefined();
    // A ray aimed into the map from high above hits somewhere.
    const diving = raycastTerrain(300, 40, -250, 0, -1, 0, 100);
    expect(diving).toBeDefined();
    expect(40 - (diving ?? 0)).toBeCloseTo(heightAt(300, -250), 1);
    // A ray starting under the terrain reports an immediate hit.
    expect(raycastTerrain(hillX, ground - 0.5, hillZ, 0, 1, 0, 10)).toBe(0);
  });

  it("raycastTerrain crosses a crest and strikes the far slope (cannon-arc case)", () => {
    // Find a valley point west of the origin corridor, then fire a shallow
    // descending ray from behind the western rim: it must clear the rim and
    // land inside the valley, not report a hit on the near rim top.
    const valleyX = -700;
    const valleyZ = 0;
    const valleyFloor = heightAt(valleyX, valleyZ);
    expect(valleyFloor).toBeLessThan(-3); // the pinned valley from the probe table
    const originX = -760;
    const originY = heightAt(originX, valleyZ) + 6;
    const drop = originY - valleyFloor;
    const run = valleyX - originX;
    const length = Math.hypot(run, drop);
    const hit = raycastTerrain(originX, originY, valleyZ, run / length, -drop / length, 0, 200);
    expect(hit).toBeDefined();
    expect(hit ?? 0).toBeGreaterThan(run * 0.5); // landed past the midpoint
    expect(hit ?? 0).toBeLessThanOrEqual(length + 1);
  });

  it("evaluates 200k samples inside the perf budget", () => {
    const start = performance.now();
    let sink = 0;
    for (let index = 0; index < 200_000; index += 1) {
      sink += heightAt((index * 37) % 1800 - 900, (index * 91) % 1800 - 900);
    }
    const elapsed = performance.now() - start;
    expect(Number.isFinite(sink)).toBe(true);
    // Measured ~0.3 µs/sample (2026-08-04, M2); budget is 20× headroom for CI.
    expect(elapsed).toBeLessThan(1500);
  });

  it("declares the octave budget the relief test enforces", () => {
    expect(TERRAIN_OCTAVES.length).toBe(4);
    // 8e-19 Task 8: 30 + 11 + 5 + 2.2 = 48.2 (was 39.6 at 8e-17).
    expect(TERRAIN_MAX_HEIGHT).toBeCloseTo(48.2, 6);
    expect(TERRAIN_FIELD_MAX_HEIGHT).toBeCloseTo(59.2, 6);
  });
});
