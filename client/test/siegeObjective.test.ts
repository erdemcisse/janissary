import { describe, expect, it } from "vitest";
import { Team, WALL_SEGMENT_COUNT, WallState } from "@janissary/shared";
import {
  CANNON_STATE_DEPLOYED,
  CANNON_STATE_DESTROYED,
  compassBearing,
  siegeObjective,
  wallDamageTint,
  wallRegionName,
  type CannonStateInfo,
  type SiegeObjectiveInput,
} from "../src/game/siege";

/**
 * Siege-loop banner logic (design doc siege-loop §2.3/§3.2): the per-team
 * objective progression, its bearing target, and the wall legibility helpers
 * (crack-stage tint, region vocabulary, compass labels).
 */

const intactWalls = (): WallState[] => Array.from({ length: WALL_SEGMENT_COUNT }, () => WallState.Intact);
const fullHp = (): number[] => Array.from({ length: WALL_SEGMENT_COUNT }, () => 16);

function cannon(overrides: Partial<CannonStateInfo> = {}): CannonStateInfo {
  return {
    entityId: 30_000,
    x: 0,
    z: 60,
    team: Team.Ottoman,
    state: 0,
    hullHp: 400,
    moving: false,
    ...overrides,
  };
}

function input(overrides: Partial<SiegeObjectiveInput> = {}): SiegeObjectiveInput {
  return {
    team: Team.Ottoman,
    captureOwner: Team.None,
    walls: intactWalls(),
    wallHp: fullHp(),
    cannons: [],
    selfX: 0,
    selfZ: 100,
    ...overrides,
  };
}

describe("siegeObjective — Ottoman progression", () => {
  it("says PUSH THE GUNS FORWARD with no breach and nothing deployed, pointing at the gun", () => {
    const objective = siegeObjective(input({ cannons: [cannon({ x: 8, z: 84 })] }));
    expect(objective?.text).toBe("PUSH THE GUNS FORWARD");
    expect(objective?.targetX).toBe(8);
    expect(objective?.targetZ).toBe(84);
  });

  it("falls back to the weakest segment when no cannon exists", () => {
    const wallHp = fullHp();
    wallHp[5] = 6;
    const objective = siegeObjective(input({ wallHp }));
    expect(objective?.text).toBe("PUSH THE GUNS FORWARD");
    expect(objective?.targetX).toBe(-66 + 5 * 12); // segment 5 center
  });

  it("says BREACH THE WALL once a cannon is deployed, pointing at the weakest segment", () => {
    const wallHp = fullHp();
    wallHp[2] = 4;
    const objective = siegeObjective(input({ wallHp, cannons: [cannon({ state: CANNON_STATE_DEPLOYED })] }));
    expect(objective?.text).toBe("BREACH THE WALL");
    expect(objective?.targetX).toBe(-66 + 2 * 12); // segment 2 center
  });

  it("ignores destroyed cannons for the deployed check", () => {
    const objective = siegeObjective(input({
      cannons: [cannon({ state: CANNON_STATE_DEPLOYED | CANNON_STATE_DESTROYED })],
    }));
    expect(objective?.text).toBe("PUSH THE GUNS FORWARD");
  });

  it("says THROUGH THE BREACH once a breach exists and the gate is not held", () => {
    const walls = intactWalls();
    walls[7] = WallState.Breached;
    const objective = siegeObjective(input({ walls, cannons: [cannon({ state: CANNON_STATE_DEPLOYED })] }));
    expect(objective?.text).toBe("THROUGH THE BREACH — TAKE THE GATE");
    expect(objective?.targetX).toBe(0);
    expect(objective?.targetZ).toBe(0);
  });

  it("returns undefined when the Ottomans hold the gate", () => {
    const walls = intactWalls();
    walls[7] = WallState.Breached;
    expect(siegeObjective(input({ walls, captureOwner: Team.Ottoman }))).toBeUndefined();
  });
});

describe("siegeObjective — Byzantine mirror", () => {
  const byzantine = (overrides: Partial<SiegeObjectiveInput> = {}): SiegeObjectiveInput =>
    input({ team: Team.Byzantine, selfZ: -40, ...overrides });

  it("says STOP THE GUNS when an enemy cannon is moving undeployed", () => {
    const objective = siegeObjective(byzantine({ cannons: [cannon({ moving: true, x: -20 })] }));
    expect(objective?.text).toBe("STOP THE GUNS — KILL THE CREW");
    expect(objective?.targetX).toBe(-20);
  });

  it("says BREAK THE BOMBARDS when an enemy cannon is deployed", () => {
    const objective = siegeObjective(byzantine({ cannons: [cannon({ state: CANNON_STATE_DEPLOYED, moving: true })] }));
    expect(objective?.text).toBe("BREAK THE BOMBARDS");
  });

  it("says BREAK THE BOMBARDS when the wall is damaged, even with no cannons", () => {
    const walls = intactWalls();
    walls[9] = WallState.Damaged;
    const wallHp = fullHp();
    wallHp[9] = 10; // a Damaged segment has taken HP loss on the wire
    const objective = siegeObjective(byzantine({ walls, wallHp }));
    expect(objective?.text).toBe("BREAK THE BOMBARDS");
    expect(objective?.targetX).toBe(-66 + 9 * 12);
  });

  it("says HOLD THE BREACH once a breach exists, pointing at the breach", () => {
    const walls = intactWalls();
    walls[1] = WallState.Breached;
    const objective = siegeObjective(byzantine({ walls, cannons: [cannon({ state: CANNON_STATE_DEPLOYED })] }));
    expect(objective?.text).toBe("HOLD THE BREACH");
    expect(objective?.targetX).toBe(-66 + 1 * 12);
  });

  it("ignores a captured (Byzantine-held) cannon as a threat", () => {
    const objective = siegeObjective(byzantine({
      cannons: [cannon({ team: Team.Byzantine, state: CANNON_STATE_DEPLOYED, moving: true })],
    }));
    expect(objective).toBeUndefined();
  });

  it("returns undefined while the line is quiet", () => {
    expect(siegeObjective(byzantine())).toBeUndefined();
  });

  it("returns undefined for spectators", () => {
    expect(siegeObjective(input({ team: Team.None }))).toBeUndefined();
  });
});

describe("wall legibility helpers", () => {
  it("maps hpFrac to the four crack stages and back to pristine", () => {
    expect(wallDamageTint(16)).toBe(0xffffff);
    expect(wallDamageTint(13)).toBe(0xffffff);
    expect(wallDamageTint(12)).toBe(0xd9d3c9);
    expect(wallDamageTint(8)).toBe(0xaaa196);
    expect(wallDamageTint(4)).toBe(0x847b6f);
    expect(wallDamageTint(1)).toBe(0x625e57);
    expect(wallDamageTint(0)).toBe(0x625e57);
  });

  it("names the wall regions west/center/east", () => {
    expect(wallRegionName(0)).toBe("WEST WALL");
    expect(wallRegionName(3)).toBe("WEST WALL");
    expect(wallRegionName(4)).toBe("CENTER WALL");
    expect(wallRegionName(7)).toBe("CENTER WALL");
    expect(wallRegionName(8)).toBe("EAST WALL");
    expect(wallRegionName(11)).toBe("EAST WALL");
  });

  it("labels compass bearings with north at -Z", () => {
    expect(compassBearing(0, -10)).toBe("N");
    expect(compassBearing(10, 0)).toBe("E");
    expect(compassBearing(0, 10)).toBe("S");
    expect(compassBearing(-10, 0)).toBe("W");
    expect(compassBearing(7, -7)).toBe("NE");
  });
});
