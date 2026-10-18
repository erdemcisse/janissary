import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GENERATED_MODEL_ASSETS, MODEL_MANIFEST } from "../src/game/models/manifest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STATIC_INBOX = join(REPO_ROOT, "client", "models-inbox", "glb");
const ANIMATION_INBOX = join(REPO_ROOT, "client", "models-inbox", "anims");

const EXPECTED_SOURCE_IDS = [
  "byzantine-crossbowman",
  "byzantine-guardsman",
  "caique-boat",
  "campaign-tent",
  "cypress-tree",
  "dechos-hunde-easteregg",
  "dome-church",
  "field-banner",
  "field-culverin",
  "field-oak",
  "great-basilica",
  "heavy-crossbow",
  "janissary-musketeer",
  "janissary-swordsman",
  "kilij-sword",
  "kilij-sword-alternative",
  "limestone-boulders",
  "matchlock-arquebus",
  "matchlock-arquebus-alternative",
  "minaret",
  "olive-tree",
  "ottoman-azap",
  "ottoman-gunner",
  "sahi-bombard",
  "siege-ladder",
  "siege-mantlet",
  "supply-cart",
  "timber-house",
  "wall-gun",
  "war-horse",
  "war-horse-alternative",
  "war-mace",
  "yatagan",
] as const;

const CHARACTER_ANIMATION_SOURCES: Readonly<Record<string, readonly string[]>> = {
  "byzantine-crossbowman": ["aim", "death", "fire", "idle", "rigged", "run-alt", "run", "walk"],
  "byzantine-guardsman": ["aim", "death", "fire", "idle", "rigged", "run-alt", "run", "walk"],
  "janissary-musketeer": ["aim", "death", "fire", "idle", "rigged", "run-alt", "run", "walk"],
  "janissary-swordsman": ["block", "death", "idle", "rigged", "run-alt", "run", "slash", "walk"],
  "ottoman-azap": ["aim", "death", "fire", "idle", "rigged", "run-alt", "run", "walk"],
  "ottoman-gunner": ["aim", "death", "fire", "idle", "rigged", "run-alt", "run", "walk"],
};

const EXPECTED_ANIMATION_FILES = [
  ...Object.entries(CHARACTER_ANIMATION_SOURCES).flatMap(([character, clips]) =>
    clips.map((clip) => `${character}-${clip}.glb`)),
  "war-horse-rigged.glb",
  "war-horse-walk.glb",
].sort();

describe("generated model source→runtime truth ledger", () => {
  it("accounts for all 33 owner-generated static source GLBs exactly once", () => {
    const sourceIds = GENERATED_MODEL_ASSETS.map((asset) => asset.sourceId).sort();
    expect(sourceIds).toEqual([...EXPECTED_SOURCE_IDS].sort());
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  it("matches the local 33-GLB and 50-animation owner drops when the ignored inbox is present", () => {
    if (!existsSync(STATIC_INBOX) || !existsSync(ANIMATION_INBOX)) return;
    const staticFiles = readdirSync(STATIC_INBOX).filter((file) => file.endsWith(".glb")).sort();
    expect(staticFiles).toEqual(EXPECTED_SOURCE_IDS.map((id) => `${id}.glb`).sort());
    const animationFiles = readdirSync(ANIMATION_INBOX).filter((file) => file.endsWith(".glb")).sort();
    expect(animationFiles).toEqual(EXPECTED_ANIMATION_FILES);
  });

  it("manifests every prepared output and records an honest runtime disposition", () => {
    const manifest = new Set<string>(MODEL_MANIFEST);
    for (const asset of GENERATED_MODEL_ASSETS) {
      expect(asset.prepared.length, `${asset.sourceId}: no prepared output`).toBeGreaterThan(0);
      expect(asset.runtime.trim().length, `${asset.sourceId}: no runtime disposition`).toBeGreaterThan(0);
      for (const path of asset.prepared) expect(manifest.has(path), `${asset.sourceId}: ${path} not manifested`).toBe(true);
    }
  });
});
