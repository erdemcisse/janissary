# Asset credits

Every externally sourced asset ships under CC0 (public domain), CC-BY (attribution
required), or OFL (fonts only) — see `docs/decisions/0003-ai-model-strategy.md` for why
NC/SA assets are never used. The `pnpm audit:assets` check fails the client build if any
asset in `client/public/audio/` is used without an entry here, if any image in
`client/public/ui/` ships unreferenced or uncredited, or if a non-CC0/CC-BY/OFL license
appears.

Synthesized assets (the level-up sting, medal stings, capture tick, bell-and-chant loop,
galley creak, and the ambient drone) are generated procedurally with WebAudio at runtime
and carry no external license obligations.

## Audio — Freesound (CC0 / CC-BY)

| Asset | Source | Author | License | Used for |
|---|---|---|---|---|
| `audio/gunshot.mp3` | https://freesound.org/people/aaronsiler/sounds/128980/ | aaronsiler | CC-BY 4.0 | Arquebus fire (matchlock 1710 report — Phase 8c-6 re-source; windowed 0.055-0.065 s so the click+boom land on the fire event) |
| `audio/gunshot-2.mp3` | https://freesound.org/people/fennelliott/sounds/347647/ | fennelliott | CC0 1.0 | Gunshot variant pool B (Phase 8e-2 — single musket shot, measured onset 70 ms, windowed 0.06-0.07 s) |
| `audio/gunshot-3.mp3` | https://freesound.org/people/craigsmith/sounds/675622/ | craigsmith | CC0 1.0 | Gunshot variant pool C (Phase 8e-2 — single musket shot, measured onset 20 ms, softer body, windowed 0.01-0.02 s) |
| `audio/gunshot-4.mp3` | https://freesound.org/people/breezeark/sounds/258250/ | breezeark | CC-BY 3.0 | Gunshot variant pool D (Phase 8e-2 — flintlock pan-flash + main charge, measured onset 45 ms, windowed 0.03-0.045 s) |
| `audio/gunshot-5.wav` | https://freesound.org/people/Jon285/sounds/34708/ | Jon285 | CC0 1.0 | Gunshot variant pool E (Phase 8e-2 — black-powder boom sliced 4.05-5.35 s from a 22 s session recording, downmixed mono; shot onset ~0.07 s into the trimmed file) |
| `audio/musket-shots-session.m4a` | https://freesound.org/people/craigsmith/sounds/675622/ | craigsmith | CC0 1.0 | Gunshot variant pool F (ADR 0045 — real musket session; envelope analysis showed ONE dense ~0.9 s lock+report+echo event, wired whole at gain 1.73 rather than sliced) |
| `audio/gallop.mp3` | https://freesound.org/people/Podsburgh/sounds/274898/ | Podsburgh | CC0 1.0 | Cavalry gallop hooves loop, local + nearest remote riders |
| `audio/388391__maadmacs__horse-and-carriage.mp3` | https://freesound.org/people/maadmacs/sounds/388391/ | maadmacs | CC0 1.0 | Horse-and-carriage pass-by (owner drop, wired as `horse-carriage` for future cavalry/ambience use — no player yet) |
| `audio/torch-crackle.mp3` | https://freesound.org/people/NickTayloe/sounds/813328/ | NickTayloe | CC0 1.0 | Player torch crackle loop (candle-scale fire, loops seamlessly) |
| `audio/shovel-dig.mp3` | https://freesound.org/people/dr19/sounds/353907/ | dr19 | CC0 1.0 | Earthwork dig/raise impacts (two windows slice distinct digs) |
| `audio/melee-swing.mp3` | https://freesound.org/people/Artninja/sounds/700220/ | Artninja | CC-BY 4.0 | Melee swing whoosh |
| `audio/melee-impact.mp3` | https://freesound.org/people/qubodup/sounds/812592/ | qubodup | CC0 1.0 | Melee impact and hit confirmation |
| `audio/reload-start.mp3` | https://freesound.org/people/SpliceSound/sounds/153560/ | SpliceSound | CC0 1.0 | Reload start (ramrod/cock) |
| `audio/reload-click.mp3` | https://freesound.org/people/+%F0%9D%99%8F%F0%9D%9F%AD%F0%9D%99%82%F0%9D%99%8D%F0%9D%9F%AF+/sounds/847609/ | +T1GR3+ | CC-BY 4.0 | Reload click and reload finish |
| `audio/footsteps-grass-walk.mp3` | https://freesound.org/people/FOSSarts/sounds/740145/ | FOSSarts | CC0 1.0 | Footsteps on grass, walk |
| `audio/footsteps-grass-run.mp3` | https://freesound.org/people/Nox_Sound/sounds/546604/ | Nox_Sound | CC0 1.0 | Footsteps on grass, run cadence |
| `audio/footsteps-stone-new.m4a` | https://freesound.org/people/sgossner/sounds/197781/ | sgossner | CC0 1.0 | Footsteps near the walls (stone) — ADR 0045 re-source; single step windowed 0.03-0.06 s (the old file's random window landed on silence ~50% of the time) |
| `audio/footsteps-wood.mp3` | https://freesound.org/people/AudioRiggs/sounds/232157/ | AudioRiggs | CC-BY 3.0 | Footsteps on wooden surfaces |
| `audio/splash.m4a` | https://freesound.org/people/genel/sounds/482952/ | genel | CC0 1.0 | Wading step (`footstep-water` key, ADR 0045 re-source — windowed 0.09-0.12 s) |
| `audio/hit-ding.mp3` | https://freesound.org/people/flarn2006/sounds/57362/ | flarn2006 | CC-BY 4.0 | Kill-confirmation "ding" layer |
| `audio/death-grunt.mp3` | https://freesound.org/people/MrFossy/sounds/547196/ | MrFossy | CC0 1.0 | Soldier death grunt |
| `audio/victory-fanfare.mp3` | https://freesound.org/people/FunWithSound/sounds/456966/ | FunWithSound | CC0 1.0 | War victory fanfare (music bus) |
| `audio/bombard-fire.mp3` | https://freesound.org/people/qubodup/sounds/168707/ | qubodup | CC0 1.0 | Bombard/wall-gun/cannon fire |
| `audio/bombard-impact.mp3` | https://freesound.org/people/SamsterBirdies/sounds/733120/ | SamsterBirdies | CC0 1.0 | Bombard impact, wall breach, sinking |
| `audio/mehter-drums.mp3` | https://freesound.org/people/pogmothoin/sounds/401297/ | pogmothoin | CC-BY 4.0 | Mehter war-drum ambience loop (music bus) |
| `audio/chat-pop.mp3` | https://freesound.org/people/AleXZavesa/sounds/853891/ | AleXZavesa | CC-BY 4.0 | Chat message received |
| `audio/ui-click.mp3` | https://freesound.org/people/ZenithInfinitiveStudios/sounds/343015/ | ZenithInfinitiveStudios | CC0 1.0 | UI button click |
| `audio/ui-hover.mp3` | https://freesound.org/people/ZenithInfinitiveStudios/sounds/343000/ | ZenithInfinitiveStudios | CC0 1.0 | UI button hover |

### Phase 8e-18 sound library (ADR 0045 — all CC0, converted to m4a from Freesound)

| Asset | Source | Author | License | Used for |
| --- | --- | --- | --- | --- |
| `audio/sword-slash.m4a` | https://freesound.org/people/smokebomb99/sounds/147287/ | smokebomb99 | CC0 1.0 | Melee-swing variant pool member |
| `audio/whoosh.m4a` | https://freesound.org/people/qubodup/sounds/59988/ | qubodup | CC0 1.0 | Melee-swing variant pool member |
| `audio/sword-clash.m4a` | https://freesound.org/people/loudernoises/sounds/334169/ | loudernoises | CC0 1.0 | Bladed melee impact (`sword-impact` key file, replacing the 8c-6 source) |
| `audio/punch-hit.m4a` | https://freesound.org/people/johnfolker/sounds/269230/ | johnfolker | CC0 1.0 | Sword-impact variant pool member (windowed 0.25-0.28 s, skips the windup) |
| `audio/footsteps-dirt.m4a` | https://freesound.org/people/ericssoundschmiede/sounds/454623/ | ericssoundschmiede | CC0 1.0 | Dirt/road footsteps (two windows = `footsteps-dirt` + `-b` variants; replaced the 8e-10 synth) |
| `audio/splash-big.m4a` | https://freesound.org/people/bird_man/sounds/316744/ | bird_man | CC0 1.0 | Deep-water entry splash |
| `audio/digging.m4a` | https://freesound.org/people/f3bbbo/sounds/651292/ | f3bbbo | CC0 1.0 | Earthwork dig (`shovel-dig` key file; the old file stays for `shovel-raise` only) |
| `audio/fire-crackle.m4a` | https://freesound.org/people/contramundum/sounds/388199/ | contramundum | CC0 1.0 | Bombard-fire variant pool — torch-crackle candidate rejected by envelope analysis (full-scale boom, not a loopable crackle) |
| `audio/cannon-fire.m4a` | https://freesound.org/people/qubodup/sounds/161341/ | qubodup | CC0 1.0 | Bombard-fire variant pool member (howitzer report) |
| `audio/cannon-boom.m4a` | https://freesound.org/people/readeonly/sounds/186952/ | readeonly | CC0 1.0 | Bombard-impact variant pool member |
| `audio/headshot.m4a` | https://freesound.org/people/madpancake/sounds/660769/ | madpancake | CC0 1.0 | Headshot-kill sting layer (ordinary kills keep the hit-ding family) |
| `audio/flesh-hit.m4a` | https://freesound.org/people/magnuswaker/sounds/530117/ | magnuswaker | CC0 1.0 | A bullet strikes the local player (center-panned wet thud) |
| `audio/jump-land.m4a` | https://freesound.org/people/kierankeegan/sounds/422749/ | kierankeegan | CC0 1.0 | Landing thud, volume scaled by fall speed |
| `audio/wood-impact.m4a` | https://freesound.org/people/kyles/sounds/452596/ | kyles | CC0 1.0 | Projectile strikes timber (galley decks, siege props) |
| `audio/thud.m4a` | https://freesound.org/people/bmaczero/sounds/96138/ | bmaczero | CC0 1.0 | Artillery shell strikes the curtain wall (deep structural thud) |
| `audio/splat-gore.m4a` | https://freesound.org/people/mozfoo/sounds/506314/ | mozfoo | CC0 1.0 | Kill-impact flavor under the kill puff (low gain) |
| `audio/horse-neigh.m4a` | https://freesound.org/people/martian/sounds/185862/ | martian | CC0 1.0 | Mount flavor on the mounting edge |
| `audio/ship-creak.m4a` | https://freesound.org/people/kyles/sounds/455757/ | kyles | CC0 1.0 | Galley ambience creak (replaced the 8e-0 synth) |
| `audio/shore-ambience.m4a` | https://freesound.org/people/szegvari/sounds/530705/ | szegvari | CC0 1.0 | Near-water ambience bed loop, level follows shoreline proximity |
| `audio/cloth-rustle.m4a` | https://freesound.org/people/brandondelehoy/sounds/494791/ | brandondelehoy | CC0 1.0 | Inventory — manifest row ready, no play site yet |
| `audio/drop-thud.m4a` | https://freesound.org/people/geoff-bremner-audio/sounds/728236/ | geoff-bremner-audio | CC0 1.0 | Inventory — manifest row ready, no play site yet |
| `audio/drilling.m4a` | https://freesound.org/people/sebastiancabrera/sounds/688712/ | sebastiancabrera | CC0 1.0 | Inventory — manifest row ready, no play site yet |
| `audio/ladder-climb.m4a` | https://freesound.org/people/nikerk/sounds/766465/ | nikerk | CC0 1.0 | Inventory — manifest row ready, no play site yet |
| `audio/water-drip.m4a` | https://freesound.org/people/michael_grinnell/sounds/464419/ | michael_grinnell | CC0 1.0 | Inventory — manifest row ready, no play site yet |

## Textures — procedural and CC0 ground detail

Textures are generated at runtime (canvas, tileable, 256×256) by
`client/src/game/textures.ts` and carry no external license: wall stone, wood planks,
grass, packed dirt, and Golden Horn water. Phase 8e-15 adds the following 1K CC0
surface maps from Poly Haven; they are tiled and blended by the ground material's
`groundBlend` attribute while the existing biome vertex colors remain the grade.

| Asset | Source | Author | License | Used for |
|---|---|---|---|---|
| `textures/sparse-grass-diff-1k.jpg` | https://polyhaven.com/a/sparse_grass | Amal Kumar | CC0 1.0 | Ground grass albedo detail |
| `textures/sparse-grass-normal-1k.jpg` | https://polyhaven.com/a/sparse_grass | Amal Kumar | CC0 1.0 | Ground grass normal detail |
| `textures/sparse-grass-rough-1k.jpg` | https://polyhaven.com/a/sparse_grass | Amal Kumar | CC0 1.0 | Ground grass roughness detail |
| `textures/dirt-diff-1k.jpg` | https://polyhaven.com/a/dirt | Charlotte Baglioni | CC0 1.0 | Trampled paths, mud, and river-bank dirt albedo detail |
| `textures/dirt-normal-1k.jpg` | https://polyhaven.com/a/dirt | Charlotte Baglioni | CC0 1.0 | Mud normal detail |
| `textures/dirt-rough-1k.jpg` | https://polyhaven.com/a/dirt | Charlotte Baglioni | CC0 1.0 | Mud roughness detail |
| `textures/rocks-ground-05-diff-1k.jpg` | https://polyhaven.com/a/rocks_ground_05 | Rob Tuytel | CC0 1.0 | Hill scree and exposed rock albedo detail |
| `textures/rocks-ground-05-normal-1k.jpg` | https://polyhaven.com/a/rocks_ground_05 | Rob Tuytel | CC0 1.0 | Hill scree normal detail |
| `textures/rocks-ground-05-rough-1k.jpg` | https://polyhaven.com/a/rocks_ground_05 | Rob Tuytel | CC0 1.0 | Hill scree roughness detail |

## 3D models — Phase 8c-3 (all CC0)

Sourced for the asset-integration pass that follows Phase 8c-2's procedural geometry
(`docs/prompts/phase-8c-3-asset-integration.md`). Wired into the client via
`client/src/game/models/` (loader + manifest). Credited per-pack (not per individual
mesh) given the volume — hundreds of individual glb files across these packs share one
license and one source each. `tools/check-assets.mjs` gates referenced models
(referenced-but-missing and missing-credits are hard failures; unreferenced models are
allowed, unlike audio).

**Phase 8e-4 note on what actually ships.** `client/public/models/` used to hold the
whole 263-file sorted drop while the manifest referenced 19 of them, and Vite copies
`public/` wholesale — so every build shipped 16 MB of models to serve 1.1 MB of them.
The 244 unreferenced files moved to `client/models-dormant/unreferenced/` (gitignored,
same treatment as the rigged character packs) and `public/models/` now contains exactly
what the manifest names. **The rows below still describe the packs as sourced**, because
they document provenance and license for the whole drop, not just the shipped subset —
restoring a file is a move plus a manifest line, and its credit row is already here. The
per-pack rows stay valid either way, since coverage is prefix-matched.

Two OBJ+MTL packs (Medieval Weapons, both Nature packs, the standalone Bow and Giant
Crossbow) were converted to binary glb via `obj2gltf` during sorting — no geometry or
texture changes, format conversion only.

| Asset | Source | Author | License | Used for |
|---|---|---|---|---|
| `models/characters/universal-base/` | https://quaternius.com/packs/universalbasecharacters.html | Quaternius | CC0 1.0 | Base humanoid meshes (Superhero proportions, male+female) to reskin as playable classes |
| `models/characters/outfits-fantasy/` | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html | Quaternius | CC0 1.0 | Modular outfit/armor pieces to dress the base characters |
| `models/animations/universal-animation-library/` | https://quaternius.com/packs/universalanimationlibrary2.html | Quaternius | CC0 1.0 | Retargetable locomotion/combat animation clips for the base characters |
| `models/weapons/medieval-pack/` | https://quaternius.com/packs/medievalweapons.html | Quaternius | CC0 1.0 | Sword/axe/dagger/spear/shield/bow melee and thrown weapon meshes |
| `models/weapons/arrow-quaternius.glb` | https://poly.pizza/m/Rt48KEPDGt | Quaternius | CC0 1.0 | Arrow projectile mesh |
| `models/weapons/cannon-quaternius.glb` | https://poly.pizza/m/J15vlPVvKK | Quaternius | CC0 1.0 | Topçu/Wall Gunner cannon mesh |
| `models/weapons/bow-zsky.glb` | https://poly.pizza/m/XkJVO6cACA | Zsky | CC0 1.0 | Alternate bow mesh |
| `models/weapons/giant-crossbow.glb` | https://poly.pizza/m/5XoZ_5sp13S | Aimé Tribolet | CC0 1.0 | Guardsman crossbow mesh |
| `models/weapons/kenney-pirate/` | https://kenney.nl/assets/pirate-kit | Kenney | CC0 1.0 | `cannon.glb` is the mobile siege-cannon carriage and the three fixed wall-gun emplacements (Phase 8e-4); cannon-mobile/cannon-ball unused |
| `models/ships/kenney-pirate/` | https://kenney.nl/assets/pirate-kit | Kenney | CC0 1.0 | Galley/boat hull meshes (rowboats through pirate ships, wreck); the selected medium galley references a missing original atlas and uses the documented tiny runtime fallback until a verified atlas is restored |
| `models/props/kenney-pirate/` | https://kenney.nl/assets/pirate-kit | Kenney | CC0 1.0 | Fortress walls/gate/towers/dock/platform/crate/flag/rock/palm props; selected atlas-referencing props use the same documented runtime fallback |
| `models/props/nature-simple/` | https://quaternius.com/packs/simplenature.html | Quaternius | CC0 1.0 | `Grass1.glb`/`Grass2.glb`/`Bush1.glb`/`Bush2.glb` are the Phase 8e-5 grass/bush ground-cover scatter; remaining low-detail rocks/trees dormant |
| `models/props/nature-ultimate/` | https://quaternius.com/packs/ultimatenature.html | Quaternius | CC0 1.0 | Terrain rock/tree variants instanced across the battlefield edge bands; Phase 8e-5 adds `Rock_2.glb`/`Rock_Moss_1.glb` (field rocks + wall rubble), `Willow_1.glb`/`Willow_2.glb` (riverbanks), `CommonTree_3.glb` (clusters), `Plant_1.glb` (ford reeds) |
| `models/weapons/firearms/longrifle-quaternius.glb` | https://poly.pizza/m/neEjwx9bBJ | Quaternius | CC0 1.0 | Period long gun (Quaternius Pirate kit "Rifle") — arquebus/musket viewmodel candidate, fetched 2026-08-04; axis-authored +X, needs orientation pass at integration |
| `models/weapons/firearms/longpistol-quaternius.glb` | https://poly.pizza/m/rpMoBgTqhB | Quaternius | CC0 1.0 | Flintlock-style long pistol — slot-3 sidearm viewmodel candidate, fetched 2026-08-04 |
| `models/characters/horses/horse-animated-quaternius.glb` | https://poly.pizza/m/qvTrSG9pZF | Quaternius | CC0 1.0 | Rigged horse, 26 animation clips (Animated Animal Pack) — cavalry/mount candidate, fetched 2026-08-04; overscaled (~4.8 m), needs normalize at integration |
| `models/props/architecture/` | https://opengameart.org/content/kaykit-medieval-builder-pack-10 | Kay Lousberg (KayKit) | CC0 1.0 | Medieval Builder Pack subset (castle, wall_straight/corner/gate/gate_closed, watchtower, house, market, barracks, mill, bridge, well) — Byzantine/Ottoman architecture candidates, fetched 2026-08-04; license text in `KAYKIT-LICENSE.txt` |
| `models/characters/meshy/` | https://meshy.ai (text/image-to-3D + text-to-animation, project-generated from original prompts and reference art) | Meshy AI | Meshy commercial (owned) | Six rigged faction soldiers, each with the complete idle/walk/run/run-alt/death/aim/fire/slash/block contract; seven hand weapons; and the prepared war-horse rig with idle/walk. Processed by `tools/prep-characters.mjs` and `tools/prep-horse.mjs` (PBR strip, 1k textures, scale/pivot normalize, clip merge/retarget) — Phases 8e-12 and full-audit milestone 3 |
| `models/scatter/meshy/` | https://meshy.ai (text-to-3D, project-generated from original prompts) | Meshy AI | Meshy commercial (owned) | Forest scatter trees (cypress-tree, field-oak, olive-tree — exact 10/8/5 m heights), processed by `tools/prep-trees.mjs` (PBR strip, 1k textures, scale/pivot normalize) — Phase 8e-17 |
| `models/artillery/` | https://meshy.ai (text-to-3D, project-generated from original prompts) | Meshy AI | Meshy commercial (owned) | Prepared field culverin and wall gun for mobile/fixed artillery, processed by `tools/prep-artillery.mjs` (PBR strip, 1k atlas, scale/pivot/orientation normalize) — Phase 8e-26 |
| `models/scatter/meshy/limestone-boulders.glb` | https://meshy.ai (text-to-3D, project-generated from original prompts) | Meshy AI | Meshy commercial (owned) | Prepared limestone boulder variant in the instanced terrain rock pool — Phase 8e-26 |
| `models/props/meshy/` | https://meshy.ai (text-to-3D, project-generated from original prompts) | Meshy AI | Meshy commercial (owned) | Prepared world landmarks and siege props (camp, banners, buildings, ladder, mantlet, cart, and the Dechos Hunde Easter egg), processed by `tools/prep-world-props.mjs` (PBR strip, 1k atlas, static-pivot normalize) — Phase 8e-27 |
| `models/ships/meshy/` | https://meshy.ai (text-to-3D, project-generated from original prompts) | Meshy AI | Meshy commercial (owned) | Prepared static caique boat for the river-side landmark layer — Phase 8e-27 |

## Fonts — Google Fonts (OFL 1.1)

Self-hosted subset woff2 files under `client/public/fonts/` (latin + latin-ext subsets),
fetched by `tools/fetch-fonts.mjs` and preloaded from `client/index.html`. All four
families ship under the SIL Open Font License 1.1, which permits embedding and
redistribution in games; no attribution is required in-game, but the license text is
retained via the source links below.

| Asset | Source | Author | License | Used for |
|---|---|---|---|---|
| `fonts/alegreya-sans-*.woff2` | https://fonts.google.com/specimen/Alegreya+Sans | Juan Pablo del Peral / Huerta Tipográfica | OFL 1.1 | Tier 1 — body/functional UI text (menus, toasts, chat, scoreboard); weights 400/500/700/800, latin + latin-ext |
| `fonts/ibm-plex-mono-*.woff2` | https://fonts.google.com/specimen/IBM+Plex+Mono | IBM / Bold Monday | OFL 1.1 | Tier 2 — HUD numerals (HP, ammo, timers, war score, ping); weights 400/500/600/700, latin + latin-ext |
| `fonts/reem-kufi-400700-*.woff2` | https://fonts.google.com/specimen/Reem+Kufi | Khaled Hosny | OFL 1.1 | Tier 3 — Ottoman display face (headings, rank titles, ceremonies); variable 400–700, latin + latin-ext |
| `fonts/uncial-antiqua-400-*.woff2` | https://fonts.google.com/specimen/Uncial+Antiqua | Astigmatic (Brian J. Bonislawsky) | OFL 1.1 | Tier 3 — Byzantine display face (headings, rank titles, ceremonies); latin + latin-ext |

## UI skin — owner-generated (Phase 8e-14)

The medieval HUD skin renders from two artworks the owner generated and dropped into
`client/models-inbox/` (gitignored): a 2560×1440 ornate frame and a 1536×1024 class-icon
sprite sheet (2×4 parchment tiles). `tools/prep-ui.mjs` processes them into
`client/public/ui/` — the frame as one WebP 9-slice `border-image` source (measured slice
insets 320/300/320/300), the sheet as eight 192×256 WebP tiles. Owned outright, no
third-party license obligations; audited by `tools/check-assets.mjs` like every other
asset class (credits row + source reference required per file).

| Asset | Source | Author | License | Used for |
|---|---|---|---|---|
| `ui/frame-ornate.webp` | Owner render (`client/models-inbox/ui-frame.png`), processed by `tools/prep-ui.mjs` | Owner | Owner-generated (owned) | 9-slice ornate frame for modal panels (ESC menu, scoreboard, connect/upgrade cards, ceremony plaque) and the death-screen viewport edge |
| `ui/class-icon-musket.webp` | Owner sprite sheet (`client/models-inbox/class-icon-set.png`, tile 1) | Owner | Owner-generated (owned) | Janissary class tile (class picker card) |
| `ui/class-icon-kilij.webp` | Owner sprite sheet (tile 2) | Owner | Owner-generated (owned) | Mehter class tile — closest match, no war-drum glyph in the sheet (ADR 0046 §2) |
| `ui/class-icon-crossbow.webp` | Owner sprite sheet (tile 3) | Owner | Owner-generated (owned) | Wall Gunner class tile (brief's "militiaman" → Byzantine ranged) |
| `ui/class-icon-shield.webp` | Owner sprite sheet (tile 4) | Owner | Owner-generated (owned) | Guardsman class tile |
| `ui/class-icon-cannon.webp` | Owner sprite sheet (tile 5) | Owner | Owner-generated (owned) | Topçu class tile (cannoneer) |
| `ui/class-icon-horse.webp` | Owner sprite sheet (tile 6) | Owner | Owner-generated (owned) | Sipahi class tile + the LoadoutHud MOUNTED chip (cavalry mount indicator) |
| `ui/class-icon-banner.webp` | Owner sprite sheet (tile 7) | Owner | Owner-generated (owned) | Priest class tile (standard-bearer; doubles as the objective/capture glyph) |
| `ui/class-icon-helm.webp` | Owner sprite sheet (tile 8) | Owner | Owner-generated (owned) | Knight class tile — closest match to the brief's "Byzantine infantry" helm (ADR 0046 §2) |
