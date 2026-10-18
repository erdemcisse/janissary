import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { crossbowFit } from "../src/game/characters/viewmodel";

describe("authored first-person weapon fitting", () => {
  it("maps the heavy crossbow stock to a 0.85 m -Z firing silhouette", () => {
    // Prepared Meshy contract: stock/prod length X, broad limbs Z, thin Y.
    const geometry = new THREE.BoxGeometry(0.85, 0.117, 0.588);
    crossbowFit(geometry);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    expect(box).not.toBeNull();
    if (box === null) return;
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.z).toBeCloseTo(0.85, 5);
    expect(size.x).toBeCloseTo(0.588, 5);
    expect(box.max.z).toBeCloseTo(0.26, 5);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 5);
  });
});
