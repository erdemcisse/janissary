/**
 * Phase 8c-3 model manifest — every glb the client loads lives here, so
 * tools/check-assets.mjs can gate referenced-but-missing files and credits
 * coverage exactly like the audio manifest. Paths are relative to
 * client/public/. All packs are CC0 (see CREDITS.md, "3D models").
 *
 * Only a handful of files are referenced out of the sorted drop on purpose:
 * an InstancedMesh per gameplay variant used, not per file in the pack.
 */

// Terrain dressing rotation (InstancedMesh per variant) — siege-worn mix of
// live and dead trees from the Ultimate Nature pack.
export const TERRAIN_ROCK_MODELS = [
  "models/props/nature-ultimate/Rock_1.glb",
  "models/props/nature-ultimate/Rock_3.glb",
  "models/props/nature-ultimate/Rock_Moss_2.glb",
  // Meshy limestone boulders, prepared to the same 2 m footprint budget as
  // the sourced rock stairs. It is visual-only; shared terrain props still
  // own collision and placement.
  "models/scatter/meshy/limestone-boulders.glb",
] as const;

export const TERRAIN_TREE_MODELS = [
  "models/props/nature-ultimate/CommonTree_1.glb",
  "models/props/nature-ultimate/CommonTree_2.glb",
  "models/props/nature-ultimate/CommonTree_Dead_1.glb",
] as const;

// War-galley silhouette for the naval hull InstancedMesh.
export const GALLEY_MODEL = "models/ships/kenney-pirate/ship-pirate-medium.glb";

// Fortress/dock dressing — additive, non-collider visuals only.
export const DRESSING_MODELS = {
  tower: "models/props/kenney-pirate/tower-complete-small.glb",
  dock: "models/props/kenney-pirate/structure-platform-dock.glb",
  // Inner-city street dressing + gate pennants (Phase 8c-4).
  barrel: "models/props/kenney-pirate/barrel.glb",
  crate: "models/props/kenney-pirate/crate.glb",
  crateBottles: "models/props/kenney-pirate/crate-bottles.glb",
  chest: "models/props/kenney-pirate/chest.glb",
  cart: "models/props/kenney-pirate/platform-planks.glb",
  flag: "models/props/kenney-pirate/flag-pennant.glb",
} as const;

/**
 * Artillery (Phase 8e-26). These are the prepared, project-owned Meshy props.
 * The raw inbox exports are never loaded by the client: `tools/prep-artillery`
 * strips unused PBR maps, compresses the atlas to 1k, normalizes the ground
 * pivot, and applies the measured field-culverin yaw. The runtime still keeps
 * the procedural carriage as a load-failure fallback. The heavy Sahi bombard
 * and the lighter field-culverin are loaded into separate runtime batches.
 */
export const ARTILLERY_MODELS = {
  mobile: "models/artillery/field-culverin.glb",
  emplacement: "models/artillery/wall-gun.glb",
  sahiBombard: "models/artillery/sahi-bombard.glb",
} as const;

/**
 * Phase 8e-27 static Meshy world props. These are prepared, ground-pivoted
 * models; ladders and mantlets remain world-prop contracts until their
 * traversal interaction slice is wired.
 */
export const WORLD_ASSET_MODELS = {
  caiqueBoat: "models/ships/meshy/caique-boat.glb",
  campaignTent: "models/props/meshy/campaign-tent.glb",
  dechosHundeEasterEgg: "models/props/meshy/dechos-hunde-easteregg.glb",
  domeChurch: "models/props/meshy/dome-church.glb",
  fieldBanner: "models/props/meshy/field-banner.glb",
  greatBasilica: "models/props/meshy/great-basilica.glb",
  minaret: "models/props/meshy/minaret.glb",
  siegeLadder: "models/props/meshy/siege-ladder.glb",
  siegeMantlet: "models/props/meshy/siege-mantlet.glb",
  sahiBombard: "models/artillery/sahi-bombard.glb",
  supplyCart: "models/props/meshy/supply-cart.glb",
  timberHouse: "models/props/meshy/timber-house.glb",
  warHorse: "models/props/meshy/war-horse.glb",
  warHorseAlternative: "models/props/meshy/war-horse-alternative.glb",
} as const;

// First-person blade viewmodels (Phase 8e-3): Byzantine arming sword,
// Ottoman kilij, and the slot-3 sidearm dagger — CC0 medieval pack, swapped
// into the procedural viewmodel groups once the cached loader resolves.
export const WEAPON_MODELS = {
  sword: "models/weapons/medieval-pack/Sword.glb",
  kilij: "models/weapons/medieval-pack/Sword_2.glb",
  dagger: "models/weapons/medieval-pack/Dagger.glb",
} as const;

/**
 * First-person firearm (Phase 8e-9 Task 1): the Quaternius long rifle
 * replaces the procedural arquebus body (orientation measured via
 * fetch-models --inspect: authored +X, muzzle at +X — the fit bakes a
 * rotateY(π/2), no runtime corrective yaw, per ADR 0032's discipline).
 * `longpistol-quaternius.glb` sits in the same folder as ready inventory:
 * no pistol WeaponDef exists in shared tuning today, so nothing loads it.
 */
export const FIREARM_MODELS = {
  longRifle: "models/weapons/firearms/longrifle-quaternius.glb",
} as const;

/**
 * In-flight projectile mesh (Phase 8e-9 Task 2): the crossbow bolt, restored
 * from the dormant pool (credits row already present). Musket balls and
 * cannon shells stay primitive spheres — a real ball at 0.15 m is a dot
 * either way; the bolt at 0.55 m is a silhouette that benefits from a mesh.
 */
export const PROJECTILE_MODELS = {
  arrow: "models/weapons/arrow-quaternius.glb",
} as const;

/**
 * Phase 8e-12 rigged soldiers: six Meshy-generated faction characters, each a
 * single skinned GLB with the complete merged named clip set (idle/walk/run/
 * run-alt/death/aim/fire/slash/block), produced by tools/prep-characters.mjs from
 * the raw drops in client/models-inbox/ (strip PBR → 1k baseColor, clips
 * retargeted onto one rig by node name, normalized to exactly 1.8 m with the
 * pivot at the feet). The weapons below attach to the RightHand bone per
 * faction/slot and are normalized to real-world length by the same tool.
 * Meshy commercial license (project-owned) — see CREDITS.md.
 */
export const CHARACTER_MODELS = {
  janissaryMusketeer: "models/characters/meshy/janissary-musketeer.glb",
  janissarySwordsman: "models/characters/meshy/janissary-swordsman.glb",
  ottomanAzap: "models/characters/meshy/ottoman-azap.glb",
  ottomanGunner: "models/characters/meshy/ottoman-gunner.glb",
  byzantineGuardsman: "models/characters/meshy/byzantine-guardsman.glb",
  byzantineCrossbowman: "models/characters/meshy/byzantine-crossbowman.glb",
} as const;

/**
 * Owner-generated Meshy horse rig. Nearby horses use pooled skinned clones;
 * the static `WORLD_ASSET_MODELS.warHorse` remains the instanced far/Low/load-
 * failure path. Prepared by tools/prep-horse.mjs from the rigged + walk drops.
 */
export const ANIMATED_HORSE_MODEL = "models/characters/meshy/war-horse-animated.glb";

export const CHARACTER_WEAPON_MODELS = {
  matchlockArquebus: "models/characters/meshy/weapons/matchlock-arquebus.glb",
  matchlockArquebusAlternative: "models/characters/meshy/weapons/matchlock-arquebus-alternative.glb",
  kilijSword: "models/characters/meshy/weapons/kilij-sword.glb",
  kilijSwordAlternative: "models/characters/meshy/weapons/kilij-sword-alternative.glb",
  yatagan: "models/characters/meshy/weapons/yatagan.glb",
  heavyCrossbow: "models/characters/meshy/weapons/heavy-crossbow.glb",
  warMace: "models/characters/meshy/weapons/war-mace.glb",
} as const;

/**
 * Phase 8e-5 living-terrain scatter — all visual-only (no colliders), restored
 * from the dormant pool per ADR 0032's restore path. nature-simple supplies
 * the grass/bush flats layer; nature-ultimate the field rocks (doubling as
 * wall-base rubble at small scale), the riverbank willows, a cluster tree,
 * and the broad low Plant_1 clump standing in for ford reeds/sedge. Ten
 * files, ~480 KB total — the 8 GB machine budget's share for this phase.
 */
export const SCATTER_MODELS = {
  grassA: "models/props/nature-simple/Grass1.glb",
  grassB: "models/props/nature-simple/Grass2.glb",
  bushA: "models/props/nature-simple/Bush1.glb",
  bushB: "models/props/nature-simple/Bush2.glb",
  rockA: "models/props/nature-ultimate/Rock_2.glb",
  rockB: "models/props/nature-ultimate/Rock_Moss_1.glb",
  willowA: "models/props/nature-ultimate/Willow_1.glb",
  willowB: "models/props/nature-ultimate/Willow_2.glb",
  clusterTree: "models/props/nature-ultimate/CommonTree_3.glb",
  reed: "models/props/nature-ultimate/Plant_1.glb",
  // 8e-17 forests: Meshy trees prepped by tools/prep-trees.mjs (PBR stripped,
  // 1k textures, exact real-world heights — cypress 10 m, oak 8 m, olive 5 m,
  // pivot at the trunk base). ~700 KB total.
  cypressTree: "models/scatter/meshy/cypress-tree.glb",
  fieldOak: "models/scatter/meshy/field-oak.glb",
  oliveTree: "models/scatter/meshy/olive-tree.glb",
} as const;

/**
 * Permanent source→shipping→runtime ledger for every GLB in the owner's
 * generated `client/models-inbox/glb/` drop. The inbox itself is intentionally
 * gitignored, so tests pin this 33-row truth table and verify every prepared
 * path is in MODEL_MANIFEST. `runtime` names the honest live contract; it is
 * not a claim that a decorative prop is an interactive entity.
 */
export const GENERATED_MODEL_ASSETS = [
  { sourceId: "byzantine-crossbowman", prepared: [CHARACTER_MODELS.byzantineCrossbowman], runtime: "Guardsman/Wall Gunner rig + crossbow NPC presentation" },
  { sourceId: "byzantine-guardsman", prepared: [CHARACTER_MODELS.byzantineGuardsman], runtime: "Knight/Priest rig" },
  { sourceId: "caique-boat", prepared: [WORLD_ASSET_MODELS.caiqueBoat], runtime: "harbor landmark (active galleys use the replicated Kenney hull)" },
  { sourceId: "campaign-tent", prepared: [WORLD_ASSET_MODELS.campaignTent], runtime: "Ottoman camp landmark" },
  { sourceId: "cypress-tree", prepared: [SCATTER_MODELS.cypressTree], runtime: "instanced forest scatter" },
  { sourceId: "dechos-hunde-easteregg", prepared: [WORLD_ASSET_MODELS.dechosHundeEasterEgg], runtime: "hidden XP discovery landmark" },
  { sourceId: "dome-church", prepared: [WORLD_ASSET_MODELS.domeChurch], runtime: "inner-city landmark" },
  { sourceId: "field-banner", prepared: [WORLD_ASSET_MODELS.fieldBanner], runtime: "Ottoman camp landmark" },
  { sourceId: "field-culverin", prepared: [ARTILLERY_MODELS.mobile], runtime: "replicated light field gun" },
  { sourceId: "field-oak", prepared: [SCATTER_MODELS.fieldOak], runtime: "instanced forest scatter" },
  { sourceId: "great-basilica", prepared: [WORLD_ASSET_MODELS.greatBasilica], runtime: "inner-city landmark" },
  { sourceId: "heavy-crossbow", prepared: [CHARACTER_WEAPON_MODELS.heavyCrossbow], runtime: "Byzantine slot-2 hand/view prop" },
  { sourceId: "janissary-musketeer", prepared: [CHARACTER_MODELS.janissaryMusketeer], runtime: "Janissary rig" },
  { sourceId: "janissary-swordsman", prepared: [CHARACTER_MODELS.janissarySwordsman], runtime: "Sipahi rig + shared slash/block clip source" },
  { sourceId: "kilij-sword", prepared: [CHARACTER_WEAPON_MODELS.kilijSword], runtime: "Ottoman slot-1 hand/view prop" },
  { sourceId: "kilij-sword-alternative", prepared: [CHARACTER_WEAPON_MODELS.kilijSwordAlternative], runtime: "Sipahi/Azap slot-1 hand prop" },
  { sourceId: "limestone-boulders", prepared: [TERRAIN_ROCK_MODELS[3]], runtime: "instanced terrain rock scatter" },
  { sourceId: "matchlock-arquebus", prepared: [CHARACTER_WEAPON_MODELS.matchlockArquebus], runtime: "Ottoman slot-2 hand/view prop" },
  { sourceId: "matchlock-arquebus-alternative", prepared: [CHARACTER_WEAPON_MODELS.matchlockArquebusAlternative], runtime: "Topçu/Azap slot-2 hand prop" },
  { sourceId: "minaret", prepared: [WORLD_ASSET_MODELS.minaret], runtime: "inner-city landmark" },
  { sourceId: "olive-tree", prepared: [SCATTER_MODELS.oliveTree], runtime: "instanced forest scatter" },
  { sourceId: "ottoman-azap", prepared: [CHARACTER_MODELS.ottomanAzap], runtime: "Mehter rig" },
  { sourceId: "ottoman-gunner", prepared: [CHARACTER_MODELS.ottomanGunner], runtime: "Topçu rig" },
  { sourceId: "sahi-bombard", prepared: [ARTILLERY_MODELS.sahiBombard], runtime: "replicated heavy bombard" },
  { sourceId: "siege-ladder", prepared: [WORLD_ASSET_MODELS.siegeLadder], runtime: "authoritative climb anchors + visible ladder props" },
  { sourceId: "siege-mantlet", prepared: [WORLD_ASSET_MODELS.siegeMantlet], runtime: "authoritative cover boxes + visible mantlet props" },
  { sourceId: "supply-cart", prepared: [WORLD_ASSET_MODELS.supplyCart], runtime: "Ottoman camp landmark" },
  { sourceId: "timber-house", prepared: [WORLD_ASSET_MODELS.timberHouse], runtime: "inner-city landmark" },
  { sourceId: "wall-gun", prepared: [ARTILLERY_MODELS.emplacement], runtime: "fixed wall artillery" },
  { sourceId: "war-horse", prepared: [WORLD_ASSET_MODELS.warHorse, ANIMATED_HORSE_MODEL], runtime: "near animated cavalry/riderless horse + static far/Low fallback" },
  { sourceId: "war-horse-alternative", prepared: [WORLD_ASSET_MODELS.warHorseAlternative], runtime: "camp horse landmark" },
  { sourceId: "war-mace", prepared: [CHARACTER_WEAPON_MODELS.warMace], runtime: "Byzantine slot-1 hand/view prop" },
  { sourceId: "yatagan", prepared: [CHARACTER_WEAPON_MODELS.yatagan], runtime: "slot-3 hand/view prop for both factions" },
] as const;

export const MODEL_MANIFEST: readonly string[] = [
  ...TERRAIN_ROCK_MODELS,
  ...TERRAIN_TREE_MODELS,
  GALLEY_MODEL,
  ...Object.values(DRESSING_MODELS),
  ...Object.values(ARTILLERY_MODELS),
  ...Object.values(WORLD_ASSET_MODELS),
  ...Object.values(WEAPON_MODELS),
  ...Object.values(FIREARM_MODELS),
  ...Object.values(PROJECTILE_MODELS),
  ...Object.values(CHARACTER_MODELS),
  ANIMATED_HORSE_MODEL,
  ...Object.values(CHARACTER_WEAPON_MODELS),
  ...Object.values(SCATTER_MODELS),
];
