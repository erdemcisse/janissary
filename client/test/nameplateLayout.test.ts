import { describe, expect, it } from "vitest";
import { NameplateLayout, nameplateOpacity } from "../src/game/nameplateLayout";

describe("nameplate layout", () => {
  it("keeps only the nearest fixed-capacity candidates without frame allocations", () => {
    const layout = new NameplateLayout(3, 10);
    layout.consider(1, 100, 10, 10);
    layout.consider(2, 25, 20, 20);
    layout.consider(3, 64, 30, 30);
    layout.consider(4, 16, 40, 40);
    expect(layout.count).toBe(3);
    expect(Array.from(layout.entityIds)).toEqual([4, 2, 3]);
  });

  it("gives the nearest label priority inside the suppression radius", () => {
    const layout = new NameplateLayout(4, 20);
    layout.consider(1, 4, 100, 100);
    layout.consider(2, 9, 112, 108);
    layout.consider(3, 16, 160, 100);
    expect(layout.accept(0)).toBe(true);
    expect(layout.accept(1)).toBe(false);
    expect(layout.accept(2)).toBe(true);
    layout.reset();
    expect(layout.count).toBe(0);
  });

  it("fades labels continuously to zero at the distance cutoff", () => {
    expect(nameplateOpacity(10)).toBe(1);
    expect(nameplateOpacity(39)).toBeCloseTo(0.5, 6);
    expect(nameplateOpacity(60)).toBe(0);
    expect(nameplateOpacity(80)).toBe(0);
  });
});
