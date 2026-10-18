import { describe, expect, it } from "vitest";
import { HORSE_RIG_CAPS, HORSE_RIG_RADIUS_METERS, canAcquireHorseRig, horseClipFor } from "../src/game/world/horses";

describe("animated horse LOD and clip policy", () => {
  it("keeps low tier static and bounds animated rigs on stronger tiers", () => {
    expect(HORSE_RIG_CAPS).toEqual({ low: 0, medium: 4, high: 8 });
    expect(HORSE_RIG_RADIUS_METERS).toBe(46);
    expect(canAcquireHorseRig(0, HORSE_RIG_CAPS.low)).toBe(false);
    expect(canAcquireHorseRig(3, HORSE_RIG_CAPS.medium)).toBe(true);
    // A previously built High-tier free pool must not bypass Medium's cap.
    expect(canAcquireHorseRig(4, HORSE_RIG_CAPS.medium)).toBe(false);
    expect(canAcquireHorseRig(7, HORSE_RIG_CAPS.high)).toBe(true);
    expect(canAcquireHorseRig(8, HORSE_RIG_CAPS.high)).toBe(false);
  });

  it("enters and leaves walk with hysteresis", () => {
    expect(horseClipFor("idle", 0.34)).toBe("idle");
    expect(horseClipFor("idle", 0.35)).toBe("walk");
    expect(horseClipFor("walk", 0.2)).toBe("walk");
    expect(horseClipFor("walk", 0.17)).toBe("idle");
  });
});
