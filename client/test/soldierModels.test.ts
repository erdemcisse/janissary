import { describe, expect, it } from "vitest";
import { PlayerClass } from "@janissary/shared";
import {
  MOUNTED_RIDER_CENTER_OFFSET,
  seatedSoldierGeometry,
  soldierGeometry,
} from "../src/game/characters/soldierModels";

describe("cavalry rider geometry", () => {
  it("caches a distinct seated pose with raised, saddle-safe legs", () => {
    const standing = soldierGeometry(PlayerClass.Sipahi);
    const seated = seatedSoldierGeometry(PlayerClass.Sipahi);
    expect(seatedSoldierGeometry(PlayerClass.Sipahi)).toBe(seated);
    expect(seated).not.toBe(standing);

    const standingPosition = standing.getAttribute("position");
    const seatedPosition = seated.getAttribute("position");
    expect(seatedPosition.count).toBe(standingPosition.count);
    let changedVertices = 0;
    for (let index = 0; index < seatedPosition.count; index += 1) {
      if (Math.abs(seatedPosition.getX(index) - standingPosition.getX(index)) > 0.001
        || Math.abs(seatedPosition.getY(index) - standingPosition.getY(index)) > 0.001
        || Math.abs(seatedPosition.getZ(index) - standingPosition.getZ(index)) > 0.001) changedVertices += 1;
    }
    expect(changedVertices).toBeGreaterThan(20);

    seated.computeBoundingBox();
    expect((seated.boundingBox?.min.y ?? -Infinity) + MOUNTED_RIDER_CENTER_OFFSET).toBeGreaterThan(0);
  });
});
