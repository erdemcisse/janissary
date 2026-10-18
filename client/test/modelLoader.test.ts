import { describe, expect, it } from "vitest";
import { resolveModelResourceUrl } from "../src/game/models/loader";

describe("model resource URL fallback", () => {
  it("replaces the known missing Kenney atlas without touching other resources", () => {
    const atlas = resolveModelResourceUrl("/models/ships/kenney-pirate/Textures/colormap.png");
    expect(atlas.startsWith("data:image/png;base64,")).toBe(true);
    expect(resolveModelResourceUrl("/models/artillery/field-culverin.glb")).toBe("/models/artillery/field-culverin.glb");
  });
});
