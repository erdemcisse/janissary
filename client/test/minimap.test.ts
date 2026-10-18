import { describe, expect, it } from "vitest";
import {
  HUD_MINIMAP_HALF_EXTENT,
  MINIMAP_DEFAULT_SIZE,
  MINIMAP_LEGEND,
  hudMinimapViewport,
  worldToHudMapFor,
  worldToMapFor,
} from "../src/ui/Minimap";

describe("minimap chart contract", () => {
  it("restores the original compact HUD chart footprint", () => {
    expect(MINIMAP_DEFAULT_SIZE).toBe(224);
  });

  it("uses a modest player-centred zoom while leaving the death-map projection full-world", () => {
    expect(HUD_MINIMAP_HALF_EXTENT).toBe(700);
    const local = worldToHudMapFor(MINIMAP_DEFAULT_SIZE, 120, -80);
    expect(local(120, -80)).toEqual([112, 112]);
    expect(local(820, -80)[0]).toBeCloseTo(MINIMAP_DEFAULT_SIZE - 10, 8);

    const full = worldToMapFor(MINIMAP_DEFAULT_SIZE);
    const fullOffset = full(100, 0)[0] - full(0, 0)[0];
    const localOffset = worldToHudMapFor(MINIMAP_DEFAULT_SIZE, 0, 0)(100, 0)[0] - 112;
    expect(localOffset).toBeGreaterThan(fullOffset);
  });

  it("clamps the moving viewport at world edges instead of exposing empty canvas", () => {
    expect(hudMinimapViewport(850, -850)).toEqual({ centerX: 200, centerZ: -200, halfExtent: 700 });
    const project = worldToHudMapFor(MINIMAP_DEFAULT_SIZE, 850, -850);
    expect(project(900, -900)).toEqual([MINIMAP_DEFAULT_SIZE - 10, 10]);
  });

  it("projects world bounds inside the padded chart frame", () => {
    const project = worldToMapFor(MINIMAP_DEFAULT_SIZE);
    const [left, top] = project(-900, -900);
    const [right, bottom] = project(900, 900);
    expect(left).toBe(10);
    expect(top).toBe(10);
    expect(right).toBe(MINIMAP_DEFAULT_SIZE - 10);
    expect(bottom).toBe(MINIMAP_DEFAULT_SIZE - 10);
  });

  it("keeps the legend silhouette-first and team-neutral", () => {
    expect(MINIMAP_LEGEND.map((item) => item.key)).toEqual(["ally", "enemy", "ship", "gun"]);
    expect(MINIMAP_LEGEND.map((item) => item.label)).toEqual(["ALLY", "ENEMY", "SHIP", "GUN"]);
  });
});
