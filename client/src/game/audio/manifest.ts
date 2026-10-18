export type AudioBus = "sfx" | "music";

export interface AudioAssetDef {
  readonly key: string;
  readonly file: string;
  readonly bus: AudioBus;
  readonly gain: number;
  readonly loop?: boolean;
  readonly maxDistance?: number;
  /**
   * Phase 8e-10 Task 3: full-gain radius for the inverse-distance falloff
   * (audioEngine.spatialGainFactor). Larger = carries further. Defaults to
   * SPATIAL_REF_DEFAULT_METERS (10 m) when unset.
   */
  readonly refDistance?: number;
}

/**
 * Loudness hierarchy (base gains, pre-falloff): cannon fire > own gunshot
 * 0.82 > remote gunshots 0.36 > footsteps 0.45–0.5. Remote reports are
 * intentionally below the own shot; the grouped cap and aligned cull keep a
 * firing line present without turning it into a loud wall. The variant rows keep
 * the group gain in sync — they are never played by their own keys, the
 * group row's gain is what the engine reads, but the table stays honest.
 *
 * Phase 8e-18: the redcoats-CC0 drop (27 m4a files, provenance in
 * docs/analysis/2026-08-06-redcoats-sounds-cc0.md and ADR 0045's wiring
 * table). Every window/gainComp for these files was measured with
 * tools/audio-envelope.mjs — no guessed offsets.
 */
export const AUDIO_MANIFEST: readonly AudioAssetDef[] = [
  // Remote reports sit clearly under the player's own shot; the grouped cap
  // and aligned 90 m cull keep a firing line present without a loud wall.
  { key: "gunshot", file: "audio/gunshot.mp3", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  // Phase 8e-2 Task 2: the gunshot variant pool — four more period reports
  // (measured envelopes in ADR 0030). Never played by their own keys; the
  // engine's variant picker routes them through the "gunshot"/"own-gunshot"
  // channels, so gates, gains, and distances above stay the single surface.
  { key: "gunshot-b", file: "audio/gunshot-2.mp3", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  { key: "gunshot-c", file: "audio/gunshot-3.mp3", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  { key: "gunshot-d", file: "audio/gunshot-4.mp3", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  { key: "gunshot-e", file: "audio/gunshot-5.wav", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  // Phase 8e-18 Task 3: retained for provenance/offline editing only. The
  // recording contains one dense ~0.9 s event (lock crack + report + echo),
  // not a clean separable shot, so Phase 8e-24 quarantines it from live play.
  { key: "gunshot-f", file: "audio/musket-shots-session.m4a", bus: "sfx", gain: 0.36, maxDistance: 150, refDistance: 10 },
  // Phase 8e-1: the local player's own shot on its own VoiceGate key — the
  // shared "gunshot" gate (minRetriggerMs 60) could drop the own shot when a
  // remote shot landed in the same 60 ms window, which is exactly the "I
  // can't tell I fired" report. Same sample, separate channel, always plays.
  { key: "own-gunshot", file: "audio/gunshot.mp3", bus: "sfx", gain: 0.82, maxDistance: 150, refDistance: 10 },
  { key: "melee-swing", file: "audio/melee-swing.mp3", bus: "sfx", gain: 0.4, maxDistance: 60 },
  // Phase 8e-18: melee-swing pool members (real whoosh/slash one-shots — the
  // old random window over melee-swing.mp3 landed on silence ~40% of plays).
  { key: "sword-slash", file: "audio/sword-slash.m4a", bus: "sfx", gain: 0.4, maxDistance: 60 },
  { key: "whoosh", file: "audio/whoosh.m4a", bus: "sfx", gain: 0.4, maxDistance: 60 },
  // File-shared, never played by its own key: hit-confirm (below) reuses the
  // same sample for the local hit-confirm voice, so this row is provenance
  // plus the audit-visible single file reference (Phase 8e-25 disposition).
  { key: "melee-impact", file: "audio/melee-impact.mp3", bus: "sfx", gain: 0.7, maxDistance: 60 },
  // Phase 8e-18 Task 2: sword-impact's file is now the loudernoises clash
  // (measured window); punch-hit joins as the pool's second connect voice.
  { key: "sword-impact", file: "audio/sword-clash.m4a", bus: "sfx", gain: 0.55, maxDistance: 60 },
  { key: "punch-hit", file: "audio/punch-hit.m4a", bus: "sfx", gain: 0.55, maxDistance: 60 },
  { key: "reload-start", file: "audio/reload-start.mp3", bus: "sfx", gain: 0.5 },
  { key: "reload-click", file: "audio/reload-click.mp3", bus: "sfx", gain: 0.55 },
  { key: "reload-finish", file: "audio/reload-click.mp3", bus: "sfx", gain: 0.7 },
  { key: "footsteps-grass-walk", file: "audio/footsteps-grass-walk.mp3", bus: "sfx", gain: 0.45, maxDistance: 45, refDistance: 5 },
  // Walk-only since Phase 8e-19: the game has no sprint, so the run branch
  // (FOOTSTEP_RUN_MIN_SPEED = Infinity) is unreachable and this row is the
  // audit-visible file reference for the walking surface (Phase 8e-25 note —
  // re-arm the run cadence only with a real sprint mechanic).
  { key: "footsteps-grass-run", file: "audio/footsteps-grass-run.mp3", bus: "sfx", gain: 0.5, maxDistance: 55, refDistance: 5 },
  // Phase 8e-18 Task 2: the old stone file's random window hit silence ~half
  // of plays (measured, ADR 0045 §2) — replaced by the sgossner single step.
  { key: "footsteps-stone", file: "audio/footsteps-stone-new.m4a", bus: "sfx", gain: 0.5, maxDistance: 45, refDistance: 5 },
  { key: "footsteps-wood", file: "audio/footsteps-wood.mp3", bus: "sfx", gain: 0.5, maxDistance: 45, refDistance: 5 },
  { key: "footstep-water", file: "audio/splash.m4a", bus: "sfx", gain: 0.5, maxDistance: 45, refDistance: 5 },
  // Phase 8e-18 Task 4: the worn-road dirt surface gets its real sample
  // (EricsSoundschmiede boots on dirt/gravel) — the 8e-10 synthesized step
  // retires. Two measured windows over the same file, pooled.
  { key: "footsteps-dirt", file: "audio/footsteps-dirt.m4a", bus: "sfx", gain: 0.45, maxDistance: 45, refDistance: 5 },
  { key: "footsteps-dirt-b", file: "audio/footsteps-dirt.m4a", bus: "sfx", gain: 0.45, maxDistance: 45, refDistance: 5 },
  { key: "gallop", file: "audio/gallop.mp3", bus: "sfx", gain: 0.5, maxDistance: 55, refDistance: 8, loop: true },
  // Owner-dropped cavalry/vehicle foley (Phase 8e-16 drop pattern) — wired so
  // the shipped mp3 satisfies audit:assets; no code plays it yet.
  { key: "horse-carriage", file: "audio/388391__maadmacs__horse-and-carriage.mp3", bus: "sfx", gain: 0.5, maxDistance: 80, refDistance: 10 },
  // Phase 8e-18 Task 4: mount flavor — one neigh window from the martian
  // cartoon-horse take, played on the local mount transition only.
  { key: "horse-neigh", file: "audio/horse-neigh.m4a", bus: "sfx", gain: 0.45 },
  { key: "torch-crackle", file: "audio/torch-crackle.mp3", bus: "sfx", gain: 0.22, maxDistance: 30, refDistance: 5, loop: true },
  // Phase 8e-18 Task 2: shovel-dig gets the measured wet-sand dig; the old
  // file stays for shovel-raise only (its raise window is a distinct slice).
  { key: "shovel-dig", file: "audio/digging.m4a", bus: "sfx", gain: 0.5, maxDistance: 45 },
  { key: "shovel-raise", file: "audio/shovel-dig.mp3", bus: "sfx", gain: 0.5, maxDistance: 45 },
  { key: "hit-confirm", file: "audio/melee-impact.mp3", bus: "sfx", gain: 0.3 },
  { key: "kill-confirm", file: "audio/hit-ding.mp3", bus: "sfx", gain: 0.8 },
  // Phase 8e-18 Task 2: the headshot kill sting layer (MadPanCake) — plays
  // only when the XP stream escalates an own kill to a headshot; hit-ding
  // stays the normal-kill voice.
  { key: "headshot", file: "audio/headshot.m4a", bus: "sfx", gain: 0.9 },
  // Phase 8e-18 Task 4: own-damage feedback (the type-2 "you were hit" path).
  { key: "flesh-hit", file: "audio/flesh-hit.m4a", bus: "sfx", gain: 0.6 },
  { key: "jump-land", file: "audio/jump-land.m4a", bus: "sfx", gain: 0.55 },
  { key: "wood-impact", file: "audio/wood-impact.m4a", bus: "sfx", gain: 0.55, maxDistance: 60, refDistance: 8 },
  // Deep-water entry (the rising-edge splash, not a footstep).
  { key: "splash-big", file: "audio/splash-big.m4a", bus: "sfx", gain: 0.7 },
  // Kill-impact flavor under the killPuff (low gain, positional).
  { key: "splat-gore", file: "audio/splat-gore.m4a", bus: "sfx", gain: 0.35, maxDistance: 45, refDistance: 8 },
  // Artillery shell against a wall segment — the masonry thud under the boom.
  { key: "thud", file: "audio/thud.m4a", bus: "sfx", gain: 0.7, maxDistance: 120, refDistance: 25 },
  // Galley ambience: replaces the 8c-6 synthesized creak (same 6.5 s trigger).
  { key: "ship-creak", file: "audio/ship-creak.m4a", bus: "sfx", gain: 0.3 },
  // Very quiet near-water bed, gain driven per-frame by water proximity.
  { key: "shore-ambience", file: "audio/shore-ambience.m4a", bus: "sfx", gain: 0.12, loop: true },
  { key: "death", file: "audio/death-grunt.mp3", bus: "sfx", gain: 0.7, maxDistance: 55 },
  { key: "victory-fanfare", file: "audio/victory-fanfare.mp3", bus: "music", gain: 0.8 },
  { key: "bombard-fire", file: "audio/bombard-fire.mp3", bus: "sfx", gain: 0.78, maxDistance: 220, refDistance: 40 },
  // Phase 8e-18 Task 4: the bombard-fire pool — the howitzer (qubodup) and
  // the contramundum "Fire" take join the existing report. fire-crackle.m4a
  // was the torch-crackle candidate; envelope analysis showed a full-scale
  // transient boom (useless as a crackle loop), so it serves here (ADR 0045).
  { key: "cannon-fire", file: "audio/cannon-fire.m4a", bus: "sfx", gain: 0.78, maxDistance: 220, refDistance: 40 },
  { key: "fire-crackle", file: "audio/fire-crackle.m4a", bus: "sfx", gain: 0.72, maxDistance: 220, refDistance: 40 },
  { key: "bombard-impact", file: "audio/bombard-impact.mp3", bus: "sfx", gain: 0.72, maxDistance: 220, refDistance: 40 },
  { key: "cannon-boom", file: "audio/cannon-boom.m4a", bus: "sfx", gain: 0.72, maxDistance: 220, refDistance: 40 },
  { key: "mehter-drums", file: "audio/mehter-drums.mp3", bus: "music", gain: 0.5, loop: true },
  { key: "chat-pop", file: "audio/chat-pop.mp3", bus: "sfx", gain: 0.4 },
  // Retained and audited for provenance; live menus use short procedural
  // wood/bronze cues so long futuristic samples cannot retrigger on children.
  { key: "ui-click", file: "audio/ui-click.mp3", bus: "sfx", gain: 0.35 },
  { key: "ui-hover", file: "audio/ui-hover.mp3", bus: "sfx", gain: 0.25 },
  // Phase 8e-25 dispositions (were stale in the Phase 8e-18 comment): the
  // galley board/leave path plays cloth-rustle and drop-thud, and the siege
  // ladder interaction plays ladder-climb — the three are live rows. Only
  // drilling and water-drip still have no emitting system yet; they remain
  // wired for the audit and a future repair/ambience pass (ADR 0045 §4).
  { key: "ladder-climb", file: "audio/ladder-climb.m4a", bus: "sfx", gain: 0.5, maxDistance: 45 },
  { key: "drop-thud", file: "audio/drop-thud.m4a", bus: "sfx", gain: 0.5, maxDistance: 45 },
  { key: "drilling", file: "audio/drilling.m4a", bus: "sfx", gain: 0.5, maxDistance: 45 },
  { key: "water-drip", file: "audio/water-drip.m4a", bus: "sfx", gain: 0.4, maxDistance: 30 },
  { key: "cloth-rustle", file: "audio/cloth-rustle.m4a", bus: "sfx", gain: 0.4, maxDistance: 45 },
];

export const AUDIO_MANIFEST_BY_KEY: ReadonlyMap<string, AudioAssetDef> = new Map(
  AUDIO_MANIFEST.map((asset) => [asset.key, asset]),
);

export const AUDIO_ASSET_FILES = new Set(AUDIO_MANIFEST.map((asset) => asset.file));
