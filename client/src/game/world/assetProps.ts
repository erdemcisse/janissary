import * as THREE from "three";
import { DECHOS_HUNDE_EASTER_EGG, heightAt, SIEGE_LADDERS, SIEGE_MANTLETS } from "@janissary/shared";
import { loadModel } from "../models/loader";
import { WORLD_ASSET_MODELS } from "../models/manifest";
import { WATER_Y } from "./water";

/**
 * Phase 8e-27: static, non-collider landmarks made from the remaining Meshy
 * inbox exports. The placement list is deliberately sparse and deterministic:
 * it gives the battlefield a few readable landmarks without turning every
 * decorative model into a draw-call farm or an accidental collision layer.
 */
interface AssetPlacement {
  readonly key: keyof typeof WORLD_ASSET_MODELS;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly water?: boolean;
  readonly detail?: boolean;
}

const PLACEMENTS: readonly AssetPlacement[] = [
  { key: "caiqueBoat", x: -365, z: 173, yaw: Math.PI / 2, water: true },
  { key: "campaignTent", x: -220, z: 150, yaw: -0.25 },
  { key: "fieldBanner", x: -205, z: 160, yaw: 0.2 },
  { key: "supplyCart", x: -180, z: 150, yaw: 0.65 },
  ...SIEGE_LADDERS.map((ladder) => ({ key: "siegeLadder" as const, x: ladder.x, z: ladder.z, yaw: ladder.yaw })),
  ...SIEGE_MANTLETS.map((mantlet) => ({ key: "siegeMantlet" as const, x: mantlet.x, z: mantlet.z, yaw: mantlet.yaw })),
  { key: "warHorse", x: -36, z: 66, yaw: Math.PI, detail: true },
  { key: "warHorseAlternative", x: 36, z: 66, yaw: Math.PI, detail: true },
  { key: "timberHouse", x: 180, z: -330, yaw: -0.35 },
  { key: "domeChurch", x: -330, z: -360, yaw: 0.5 },
  { key: "greatBasilica", x: 310, z: -390, yaw: -0.3 },
  { key: "minaret", x: 345, z: -360, yaw: 0.1 },
  // Hidden in the forest-side landmark band: no marker, just the model and
  // the server-side radius reward when a player actually reaches it.
  { key: "dechosHundeEasterEgg", x: DECHOS_HUNDE_EASTER_EGG.x, z: DECHOS_HUNDE_EASTER_EGG.z, yaw: -0.25 },
];

interface LoadedPlacement {
  readonly mesh: THREE.Mesh;
  readonly detail: boolean;
}

export interface AssetPropsHandle {
  update(dtSeconds: number): void;
  setQuality(quality: "low" | "medium" | "high"): void;
  dispose(): void;
}

export function buildAssetProps(scene: THREE.Scene): AssetPropsHandle {
  const loaded: LoadedPlacement[] = [];
  let disposed = false;
  let quality: "low" | "medium" | "high" = "high";

  for (const placement of PLACEMENTS) {
    void loadModel(WORLD_ASSET_MODELS[placement.key])
      .then((model) => {
        if (disposed) return;
        const mesh = new THREE.Mesh(model.geometry.clone(), model.material.clone());
        mesh.name = `asset-prop-${placement.key}`;
        mesh.position.set(placement.x, placement.water ? WATER_Y : heightAt(placement.x, placement.z), placement.z);
        mesh.rotation.y = placement.yaw;
        mesh.castShadow = placement.key !== "fieldBanner";
        mesh.receiveShadow = true;
        mesh.visible = quality !== "low" || !placement.detail;
        scene.add(mesh);
        loaded.push({ mesh, detail: placement.detail === true });
      })
      .catch(() => undefined);
  }

  return {
    update(_dtSeconds: number): void {
      // Static props have no frame work; the method keeps the world-module
      // lifecycle consistent with dressing/scatter.
    },
    setQuality(nextQuality): void {
      quality = nextQuality;
      for (const entry of loaded) entry.mesh.visible = quality !== "low" || !entry.detail;
    },
    dispose(): void {
      disposed = true;
      for (const entry of loaded) {
        scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        if (Array.isArray(entry.mesh.material)) {
          for (const material of entry.mesh.material) material.dispose();
        } else {
          entry.mesh.material.dispose();
        }
      }
      loaded.length = 0;
    },
  };
}
