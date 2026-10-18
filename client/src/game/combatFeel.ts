import { Team, rangedWeaponForClass, type PlayerClass } from "@janissary/shared";

/**
 * Phase 8e-1 combat-feel presentation math — pure, unit-tested, no three.js.
 *
 * BALL_POOL_SIZE sizing: a ball is in flight for at most range/speed seconds
 * (arquebus 100 m / 160 m/s = 0.625 s; crossbow 90 m / 55 m/s ≈ 1.64 s), and
 * each shooter's fire cooldown (arquebus 0.8 s, crossbow 1 s) is longer than
 * or comparable to their own ball's flight time, so a single shooter has at
 * most one ball in flight at a time. The pool therefore has to cover the
 * largest simultaneous volley, not shots-per-second: the design brief calls
 * out a 20-shooter volley, and a full firing line at the wall can be twice
 * that. 48 covers a 40-shooter volley with 20% headroom; each slot is seven
 * Float32s plus one instance transform — negligible memory.
 */
export const BALL_POOL_SIZE = 48;

/**
 * Tracer streak behind a ball (m) and its ribbon width (m). Phase 8e-10
 * Task 1 restyle: the bright white-hot 3 m additive ribbon read as a laser,
 * not a musket — the readable element is the dark ball itself (8e-9), and
 * the streak is now a short, dim, warm-grey dust wisp behind it: shorter,
 * thinner, normal-blended (dust does not glow), low opacity. Phase 8e-10b:
 * the 0x6e6355 wisp still averaged toward the sky's brightness — darkened to
 * the powder-smoke family (0x453d32) with a touch more opacity so the streak
 * reads as a dust disturbance, not a light trail.
 */
export const TRACER_LENGTH_METERS = 1.1;
export const TRACER_WIDTH_METERS = 0.025;
export const TRACER_COLOR = 0x453d32;
export const TRACER_OPACITY = 0.18;

/** Remote small-arms visuals are local battlefield detail, not global UI. */
export const PROJECTILE_VISIBILITY_RADIUS_METERS = 55;
export const PROJECTILE_TRACER_RADIUS_METERS = 24;
export const PROJECTILE_REMOTE_CAP: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 6,
  medium: 12,
  high: 18,
};

/** Interval between the faint smoke puffs a ball leaves along its path. */
export const BALL_TRAIL_PUFF_SECONDS: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0.35,
  medium: 0.22,
  high: 0.16,
};

/** Damage-floater lifetime and rise (Task 6), and the pooled floater cap. */
export const DAMAGE_FLOATER_SECONDS = 0.6;
export const DAMAGE_FLOATER_RISE_METERS = 0.5;
export const DAMAGE_FLOATER_POOL = 12;

/**
 * Phase 8e-2 Task 4: reload foley stages as fractions of the weapon's reload
 * — bite plays on the start edge, finish on the completion edge (both
 * pre-existing), and the three mid stages below cross as `reloadTicks` counts
 * down. Fractions, never seconds, so the stages share the radial indicator's
 * source value and cannot desync from it.
 */
export type ReloadStageKey = "reload-pour" | "reload-ram" | "reload-click";
export const RELOAD_STAGE_FRACTIONS: readonly { key: ReloadStageKey; at: number }[] = [
  { key: "reload-pour", at: 0.3 }, // powder down the barrel
  { key: "reload-ram", at: 0.6 }, // ball + wad rammed home
  { key: "reload-click", at: 0.85 }, // pan primed
];

/** The single stage crossed between two progress samples, if any. Pure,
 * allocation-free; steps at snapshot rate (≤ ~0.04/tick) cross at most one. */
export function reloadStageCrossed(prevFraction: number, fraction: number): ReloadStageKey | undefined {
  for (const stage of RELOAD_STAGE_FRACTIONS) {
    if (prevFraction < stage.at && fraction >= stage.at) return stage.key;
  }
  return undefined;
}

export type ReloadCue = "start" | "finish" | "pour" | "ram" | "click" | "none";

function stageCue(stage: ReloadStageKey | undefined): ReloadCue {
  if (stage === "reload-pour") return "pour";
  if (stage === "reload-ram") return "ram";
  if (stage === "reload-click") return "click";
  return "none";
}

/**
 * Reload presentation cue for one snapshot transition (Phase 8e-8, ADR 0037
 * Task 1). Holstered reloads progress server-side, so a reload can start,
 * cross foley stages, or complete while the ranged weapon is NOT in hand —
 * those transitions must not play misleading sounds or animations. The READY
 * ring / loaded dot on draw is the only presentation a holstered completion
 * gets (it renders from ammo/reload state, not from this cue).
 *
 * `rangedActive` is whether the equipped weapon is the ranged slot when the
 * snapshot lands. A reload can only *start* with the ranged weapon active
 * (server rule), so the start cue is gated on it too — the snapshot can land
 * up to 100 ms after the switch, and the viewmodel must not play the ramrod
 * animation while the blade is out.
 */
export function reloadCueFor(
  prevReloadTicks: number,
  reloadTicks: number,
  ammo: number,
  rangedActive: boolean,
  prevFraction: number,
  fraction: number,
): ReloadCue {
  if (!rangedActive) return "none";
  if (prevReloadTicks === 0 && reloadTicks > 0) return "start";
  if (prevReloadTicks > 0 && reloadTicks === 0 && ammo > 0) return "finish";
  if (reloadTicks > 0) return stageCue(reloadStageCrossed(prevFraction, fraction));
  return "none";
}

/**
 * Reload progress 0→1 for the reticle radial (Task 4), from the snapshot's
 * remaining reloadTicks (20 Hz server ticks) against the weapon's total
 * reload from shared tuning — never hardcoded. Returns 1 when not reloading.
 * Reload only exists on the slot-2 ranged weapon (8e-3), so that def's
 * reloadSeconds is the total.
 */
export function reloadProgressFraction(playerClass: PlayerClass, reloadTicks: number): number {
  if (reloadTicks <= 0) return 1;
  const totalTicks = (rangedWeaponForClass(playerClass, Team.None).reloadSeconds ?? 0) * 20;
  if (totalTicks <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - reloadTicks / totalTicks));
}

/**
 * Melee swing readiness 0→1 for the reticle ring (Phase 8e-3): 1 means the
 * blade can swing. Mirrors reloadProgressFraction's shape, driven from the
 * predicted swing timestamp and the equipped def's cooldown. Frame-rate
 * independent (wall-clock), allocation-free.
 */
export function meleeCooldownFraction(readyAtMs: number, nowMs: number, cooldownSeconds: number): number {
  if (cooldownSeconds <= 0 || nowMs >= readyAtMs) return 1;
  return Math.max(0, Math.min(1, 1 - (readyAtMs - nowMs) / (cooldownSeconds * 1000)));
}

// ---------------------------------------------------------------------------
// Phase 8e-9 — projectile & explosion feel. Pure math/constants only; the
// three.js side lives in GameClient.ts / particles.ts. All tier-scaled and
// allocation-free on the frame path per ADR 0028.
// ---------------------------------------------------------------------------

/**
 * In-flight crossbow bolt length (m) for the arrow glb restored in 8e-9.
 * Raw model is 1.456 m (Quaternius stylized); a real quarrel is ~0.35 m —
 * 0.55 keeps the mesh readable at 30-60 m without looking like a spear.
 */
export const BOLT_GLB_METERS = 0.55;

/**
 * Cannonball smoke/dust tail (Redcoats' cannonBallTails equivalent): a
 * stretched billboard ribbon behind each shell, sized so it reads at 60+ m
 * without swallowing the 0.52 m shell. Plus an intermittent puff interval
 * (was one cannonTrail burst per frame — 60/s/shell — before 8e-9).
 */
export const SHELL_TAIL_LENGTH_METERS = 5;
export const SHELL_TAIL_WIDTH_METERS = 0.4;
export const SHELL_TRAIL_PUFF_SECONDS: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0.16,
  medium: 0.1,
  high: 0.07,
};

/** Lingering muzzle puffs per shot by tier (Task 4) — off on low by design. */
export const MUZZLE_LINGER_COUNT: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** What a ball's terminal puff looks like, from shared map facts at (x, z). */
export type BallImpactSurface = "wood" | "water" | "dirt";
export function ballImpactSurface(onWood: boolean, inWater: boolean): BallImpactSurface {
  if (onWood) return "wood";
  if (inWater) return "water";
  return "dirt";
}

// --- explosion (Task 3): one pooled world light + shake + scorch ----------

/** One-frame light flash: peak per tier, linear decay over FLASH_SECONDS. */
export const EXPLOSION_FLASH_SECONDS = 0.14;
export const EXPLOSION_FLASH_PEAK: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0, // off on low — same discipline as the 8e-1 muzzle light
  medium: 70,
  high: 120,
};

/** Flash intensity 1→0 over the flash life. Linear matches the muzzle light. */
export function explosionFlashScale(ageSeconds: number): number {
  if (ageSeconds <= 0) return 1;
  if (ageSeconds >= EXPLOSION_FLASH_SECONDS) return 0;
  return 1 - ageSeconds / EXPLOSION_FLASH_SECONDS;
}

/**
 * Camera-shake trauma added by an artillery impact at a distance: full
 * strength under EXPLOSION_SHAKE_FULL_METERS, silent past
 * EXPLOSION_SHAKE_ZERO_METERS, smooth (quadratic) falloff between. Capped
 * below CameraFeel's trauma ceiling so a bombardment rattles but never
 * white-outs aim; the trauma clamp itself caps simultaneous shakes.
 */
export const EXPLOSION_SHAKE_FULL_METERS = 14;
export const EXPLOSION_SHAKE_ZERO_METERS = 60;
export const EXPLOSION_SHAKE_MAX_TRAUMA = 0.55;
export function explosionTraumaForDistance(distanceMeters: number): number {
  if (distanceMeters <= EXPLOSION_SHAKE_FULL_METERS) return EXPLOSION_SHAKE_MAX_TRAUMA;
  if (distanceMeters >= EXPLOSION_SHAKE_ZERO_METERS) return 0;
  const t = (distanceMeters - EXPLOSION_SHAKE_FULL_METERS) / (EXPLOSION_SHAKE_ZERO_METERS - EXPLOSION_SHAKE_FULL_METERS);
  return EXPLOSION_SHAKE_MAX_TRAUMA * (1 - t) * (1 - t);
}

/**
 * Ground scorch pool (Task 3): dark decals at cannonball impact points.
 * Fixed ring of flat circles; each holds full strength, then fades over the
 * last SCORCH_FADE_SECONDS of its life. Presentation-only — the 8e-5 biome
 * bake is NOT re-run; this is the same dark look applied dynamically.
 */
export const SCORCH_POOL = 12;
export const SCORCH_SECONDS = 60;
export const SCORCH_FADE_SECONDS = 12;
export const SCORCH_RADIUS_METERS = 1.7;
export const SCORCH_PEAK_ALPHA = 0.55;

/** Scorch opacity factor 1→0: hold, then linear fade over the tail. */
export function scorchAlpha(ageSeconds: number): number {
  if (ageSeconds < 0) return 0;
  const holdEnd = SCORCH_SECONDS - SCORCH_FADE_SECONDS;
  if (ageSeconds <= holdEnd) return 1;
  if (ageSeconds >= SCORCH_SECONDS) return 0;
  return 1 - (ageSeconds - holdEnd) / SCORCH_FADE_SECONDS;
}
