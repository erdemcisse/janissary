import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  GROUND_ART_PROFILE,
  groundAnisotropyForQuality,
  groundDetailMaterial,
  type GroundDetailTextures,
} from "../src/game/textures";

function detailTextures(): GroundDetailTextures {
  const family = () => ({ map: new THREE.Texture(), normal: new THREE.Texture(), roughness: new THREE.Texture() });
  return { grass: family() };
}

describe("bright stylized ground", () => {
  it("pins a green-dominant meadow palette and restrained normal detail", () => {
    const red = (GROUND_ART_PROFILE.grassTint >> 16) & 0xff;
    const green = (GROUND_ART_PROFILE.grassTint >> 8) & 0xff;
    const blue = GROUND_ART_PROFILE.grassTint & 0xff;
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
    expect(GROUND_ART_PROFILE.grassStylization).toBeGreaterThanOrEqual(0.8);
    expect(GROUND_ART_PROFILE.normalStrength).toBeLessThanOrEqual(0.3);
  });

  it("injects the meadow remap into the one blended ground material", () => {
    const material = groundDetailMaterial(detailTextures());
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: [
        "#include <common>",
        "#include <map_fragment>",
        "#include <normal_fragment_maps>",
        "#include <roughnessmap_fragment>",
      ].join("\n"),
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain("meadowAlbedo");
    expect(shader.fragmentShader).toContain("uGroundGrassStylization");
    expect(shader.fragmentShader).toContain("uGroundDirtTint");
    expect(shader.fragmentShader).toContain("uGroundRockTint");
    expect(shader.fragmentShader).not.toContain("uGroundDirtMap");
    expect(shader.fragmentShader).not.toContain("#include <map_fragment>");
    expect(shader.fragmentShader).toContain("#include <normal_fragment_maps>");
    expect(shader.fragmentShader).toContain("#include <roughnessmap_fragment>");
    expect(material.userData.groundArtCompiled).toBe(true);
    expect(material.customProgramCacheKey()).toBe("bright-stylized-ground-v4");
    material.dispose();
  });

  it("keeps anisotropic filtering quality-tiered and hardware-capped", () => {
    expect(groundAnisotropyForQuality("low", 16)).toBe(1);
    expect(groundAnisotropyForQuality("medium", 16)).toBe(4);
    expect(groundAnisotropyForQuality("high", 16)).toBe(8);
    expect(groundAnisotropyForQuality("high", 2)).toBe(2);
  });
});
