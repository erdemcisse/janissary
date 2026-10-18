import { describe, expect, it } from "vitest";
import { reticleGapForSpread } from "../src/ui/Hud";

describe("medieval trajectory reticle", () => {
  it("contracts under accurate aimed fire and expands to the moving cone", () => {
    expect(reticleGapForSpread(0.0028)).toBe(5);
    expect(reticleGapForSpread(0.008)).toBeGreaterThan(5);
    expect(reticleGapForSpread(0.075)).toBe(14);
  });

  it("clamps malformed or out-of-range spread values", () => {
    expect(reticleGapForSpread(-1)).toBe(5);
    expect(reticleGapForSpread(1)).toBe(14);
  });
});
