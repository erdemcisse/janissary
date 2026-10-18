import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DAYLIGHT_PROFILE, RENDERING_PROFILE, daylightFogDensity } from "../src/game/world/atmosphere";

describe("fixed daylight contract", () => {
  it("keeps one bright, high-sun presentation instead of a dark cycle state", () => {
    expect(Object.isFrozen(DAYLIGHT_PROFILE)).toBe(true);
    expect(DAYLIGHT_PROFILE.phaseName).toBe("bright-stylized-day");
    expect(DAYLIGHT_PROFILE.sunElevationDeg).toBeGreaterThanOrEqual(60);
    expect(DAYLIGHT_PROFILE.sunIntensity).toBeGreaterThanOrEqual(1.8);
    expect(DAYLIGHT_PROFILE.hemiIntensity).toBeGreaterThanOrEqual(1);
    expect(DAYLIGHT_PROFILE.ambientIntensity).toBeGreaterThanOrEqual(0.45);
  });

  it("uses direct neutral output with no reflection or post-processing pass", () => {
    expect(DAYLIGHT_PROFILE.toneMappingExposure).toBeGreaterThanOrEqual(1);
    expect(DAYLIGHT_PROFILE.toneMappingExposure).toBeLessThanOrEqual(1.2);
    expect(RENDERING_PROFILE.toneMapping).toBe(THREE.NeutralToneMapping);
    expect(RENDERING_PROFILE.environmentReflections).toBe(false);
    expect(RENDERING_PROFILE.postProcessingPasses).toBe(0);
    expect(RENDERING_PROFILE.shadowMapSize).toEqual({ low: 0, medium: 512, high: 1024 });
  });

  it("uses blue sky and green ground bounce instead of brown dawn fill", () => {
    const red = (DAYLIGHT_PROFILE.hemiGround >> 16) & 0xff;
    const green = (DAYLIGHT_PROFILE.hemiGround >> 8) & 0xff;
    const blue = DAYLIGHT_PROFILE.hemiGround & 0xff;
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it("keeps the 475 metre objective sightline clear on every quality tier", () => {
    const transmittanceAt = (quality: "low" | "medium" | "high", distance: number): number => {
      const densityDistance = daylightFogDensity(quality) * distance;
      return Math.exp(-(densityDistance * densityDistance));
    };
    expect(daylightFogDensity("high")).toBeLessThan(daylightFogDensity("medium"));
    expect(daylightFogDensity("medium")).toBeLessThan(daylightFogDensity("low"));
    expect(transmittanceAt("low", 475)).toBeGreaterThan(0.85);
  });
});
