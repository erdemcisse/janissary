import { INNER_CITY_BOUNDS, Team, WeaponType, inDeepWater, inShallowWater, onDeck, rangedWeaponForClass, type PlayerClass } from "@janissary/shared";
import { AUDIO_MANIFEST_BY_KEY } from "./manifest";
import { distanceToRoads } from "../world/biomes";

export interface AudioListener {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * Dev-only diagnostic view of the engine's live voices (Phase 8e-0 loop-leak
 * diagnosis). Built on demand by `debugSnapshot()` — never per frame.
 */
export interface AudioDebugSnapshot {
  readonly contextState: string;
  readonly oneShotVoices: Record<string, number>;
  readonly oneShotTotal: number;
  readonly voiceGroups: Record<string, number>;
  readonly positionalLoops: readonly { key: string; id: number }[];
  readonly ambientLoops: readonly { key: string; target: number; applied: number }[];
  readonly pendingLoads: number;
  /** Phase 8e-2 Task 2: cumulative plays per gunshot variant — the browser
   * proof that the pool rotates during a live volley. */
  readonly variantPlays: Record<string, number>;
  /** Phase 8e-2 Task 5: live battle-bed intensity (decaying fire-event count)
   * and the gain target it maps to. */
  readonly battleBed: { intensity: number; target: number };
  /** Phase 8e-18: cumulative plays per GROUP key (pool members roll up under
   * their group) — the live-soak proof that the new one-shot keys actually
   * fire in a battle, since a 5 s sampling cadence misses short voices. */
  readonly totalPlays: Record<string, number>;
  /** Phase 8e-16 Task 4: one-shot voices alive past their expected end +
   * grace — stuck-voice tripwire ("loops like stuck or broken"). Empty when
   * healthy. */
  readonly longRunners: readonly { key: string; ageMs: number }[];
}

declare global {
  interface Window {
    __audioDebug?: () => AudioDebugSnapshot;
  }
}

interface PositionalLoop {
  readonly key: string;
  readonly id: number;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: StereoPannerNode;
  rate: number;
  at: { x: number; z: number };
}

interface WindowConfig {
  readonly minOffset: number;
  readonly maxOffset: number;
  readonly duration: number;
  /** Per-window loudness compensation (measured window RMS vs the reference
   * gunshot window, peak-limited — ADR 0030's table). Default 1. */
  readonly gain?: number;
}

// Exported (read-only) so tests can assert pool/window/manifest integrity.
export const SAMPLE_WINDOWS: Readonly<Record<string, WindowConfig>> = {
  // 8e-18: melee-swing's random range narrowed to the dense whoosh region —
  // the old [0.4, 8.2] span landed between whooshes and played silence on a
  // large share of swings (measured with tools/audio-envelope.mjs, ADR 0045).
  "melee-swing": { minOffset: 0.05, maxOffset: 3.0, duration: 0.55 },
  "sword-slash": { minOffset: 0.04, maxOffset: 0.07, duration: 0.42, gain: 0.88 },
  "whoosh": { minOffset: 0.03, maxOffset: 0.05, duration: 0.24, gain: 0.71 },
  // sword-impact's file is now sword-clash.m4a (8e-18 Task 2); punch-hit is
  // the pool's second connect voice (its 0.27 s windup is windowed out).
  "sword-impact": { minOffset: 0.03, maxOffset: 0.06, duration: 0.45, gain: 1.25 },
  "punch-hit": { minOffset: 0.25, maxOffset: 0.28, duration: 0.45, gain: 0.45 },
  "gunshot": { minOffset: 0.055, maxOffset: 0.065, duration: 0.62 },
  "own-gunshot": { minOffset: 0.055, maxOffset: 0.065, duration: 0.62 },
  // Phase 8e-2 Task 2 variant windows — offsets measured per file (onset <
  // 100 ms on each), gains are the measured window-RMS compensation, clamped
  // so a full-scale transient cannot exceed ~1.2 pre-bus (ADR 0030 table).
  "gunshot-b": { minOffset: 0.06, maxOffset: 0.07, duration: 0.62, gain: 1.33 },
  "gunshot-c": { minOffset: 0.01, maxOffset: 0.02, duration: 0.62, gain: 2.11 },
  "gunshot-d": { minOffset: 0.03, maxOffset: 0.045, duration: 0.65, gain: 1.41 },
  "gunshot-e": { minOffset: 0.055, maxOffset: 0.07, duration: 0.62, gain: 1.41 },
  // Phase 8e-18 Task 3: the craigsmith session — one dense event (crack +
  // report + echo), so one variant. Gain comp 3.52 vs the reference window,
  // peak-clamped to 1.73 (0.695 peak).
  "gunshot-f": { minOffset: 0.005, maxOffset: 0.015, duration: 0.8, gain: 1.73 },
  // bombard-impact.mp3 is a 12.12 s recording with a short impact event and
  // a long cinematic tail. Playing the full buffer was the clearest remaining
  // source of delayed/echo-like artillery after 8e-24.
  "bombard-impact": { minOffset: 0, maxOffset: 0.02, duration: 1.6 },
  // Bombard pools (8e-18): the existing mp3s play full-buffer as before; the
  // new members carry measured windows + peak-clamped loudness compensation
  // against their group reference (bombard-fire rms 0.24 / impact 0.47).
  "cannon-fire": { minOffset: 0.08, maxOffset: 0.1, duration: 1.0, gain: 1.85 },
  "fire-crackle": { minOffset: 0.02, maxOffset: 0.04, duration: 0.9, gain: 1.2 },
  "cannon-boom": { minOffset: 0.03, maxOffset: 0.05, duration: 1.2, gain: 1.45 },
  "shovel-dig": { minOffset: 0.015, maxOffset: 0.03, duration: 0.34, gain: 1.53 },
  // shovel-raise keeps the old file; its window narrowed onto the one audible
  // lift (the old [5.4, 8.65] span was mostly silence — measured 8e-18).
  "shovel-raise": { minOffset: 6.08, maxOffset: 6.32, duration: 0.4 },
  "footsteps-grass-walk": { minOffset: 0.3, maxOffset: 2.9, duration: 0.42 },
  "footsteps-grass-run": { minOffset: 5.4, maxOffset: 9.6, duration: 0.34 },
  // The sgossner single step (8e-18 Task 2): quiet take, measured RMS comp
  // 2.78 vs the old file's loud steps (peak after comp 0.35 — safe).
  "footsteps-stone": { minOffset: 0.03, maxOffset: 0.06, duration: 0.42, gain: 2.78 },
  // Wood's window moved onto the dense 16-23 s region (measured 8e-18).
  "footsteps-wood": { minOffset: 16.0, maxOffset: 22.4, duration: 0.45 },
  "footstep-water": { minOffset: 0.09, maxOffset: 0.12, duration: 0.55, gain: 0.8 },
  "footsteps-dirt": { minOffset: 4.5, maxOffset: 4.65, duration: 0.5 },
  "footsteps-dirt-b": { minOffset: 2.2, maxOffset: 2.3, duration: 0.5, gain: 1.1 },
  "splash-big": { minOffset: 0, maxOffset: 0.02, duration: 0.9 },
  "jump-land": { minOffset: 0.04, maxOffset: 0.07, duration: 0.3 },
  "flesh-hit": { minOffset: 0, maxOffset: 0.02, duration: 0.5 },
  "wood-impact": { minOffset: 0, maxOffset: 0.03, duration: 0.7 },
  "thud": { minOffset: 0.005, maxOffset: 0.02, duration: 0.35 },
  "headshot": { minOffset: 0, maxOffset: 0.02, duration: 0.3 },
  "splat-gore": { minOffset: 0, maxOffset: 0.05, duration: 0.8 },
  "horse-neigh": { minOffset: 3.6, maxOffset: 3.75, duration: 1.0 },
  // Ship-creak: the 11.3 s take holds sparse creaks; the [6.4, 6.6]+1.6 s
  // window always lands on the loudest pair (measured onsets 6.765/7.965).
  "ship-creak": { minOffset: 6.4, maxOffset: 6.6, duration: 1.6 },
  "ui-click": { minOffset: 0, maxOffset: 0.25, duration: 0.16 },
  "ui-hover": { minOffset: 0, maxOffset: 0.25, duration: 0.12 },
};

/** Stone footsteps: the wall lane plus the stone-walled inner-city streets. */
const STONE_WALL_Z_HALF = 8;

// Crossbow is synthesized (no asset file); mirror the gunshot manifest entry
// so loudness and falloff match the arquebus. Phase 8e-10 Task 3: the split
// mirrors the gunshot hierarchy — the own channel stays at the own-gunshot
// level, remote bolts sit at the quieter remote-gunshot level.
const CROSSBOW_GAIN_OWN = 0.82;
const CROSSBOW_GAIN_REMOTE = 0.36;
export const CROSSBOW_MAX_DISTANCE = 150;
const CROSSBOW_REF_DISTANCE = 14;
const CROSSBOW_SECONDS = 0.35;

// Phase 8e-1 own-shot layer: a low body "thump" under the own shot so the
// local player's gun is unmistakably theirs (center-panned, sample at higher
// gain, this layer on top). Synthesized once and cached like the crossbow.
const OWN_SHOT_THUMP_SECONDS = 0.3;
const OWN_SHOT_THUMP_GAIN = 0.16;

// Phase 8e-2 Task 2: shot-variant pool and per-play jitter. Remote shots and
// the own-gunshot channel share the pool but keep their own gates/gains
// (ADR 0029 Task 3 untouched). Selection is random without immediate repeats;
// jitter ranges are the owner's tuning surface, named here per ADR 0022.
// 8e-18: pool F joins (the craigsmith session slice), and the same pooling
// now covers melee swings/connects, dirt steps, and the cannon voices.
// The session take contains an audible second report/echo. It remains in the
// manifest for provenance and later offline editing, but it must not be part
// of the live pool until it is replaced by a clean shot window.
export const QUARANTINED_AUDIO_KEYS: readonly string[] = ["gunshot-f"];
const GUNSHOT_VARIANTS: readonly string[] = ["gunshot", "gunshot-b", "gunshot-c", "gunshot-d", "gunshot-e"];
export const VARIANT_POOLS: Readonly<Record<string, readonly string[]>> = {
  gunshot: GUNSHOT_VARIANTS,
  "own-gunshot": GUNSHOT_VARIANTS,
  "melee-swing": ["melee-swing", "sword-slash", "whoosh"],
  "sword-impact": ["sword-impact", "punch-hit"],
  "footsteps-dirt": ["footsteps-dirt", "footsteps-dirt-b"],
  "bombard-fire": ["bombard-fire", "cannon-fire", "fire-crackle"],
  "bombard-impact": ["bombard-impact", "cannon-boom"],
};
const SHOT_PITCH_JITTER = 0.08; // playbackRate 0.92–1.08
const SHOT_GAIN_JITTER = 0.15; // gain ±15%
const SHOT_JITTER_KEYS: ReadonlySet<string> = new Set(["gunshot", "own-gunshot"]);
// Phase 8e-18: pitch-only jitter for single-source one-shots that repeat on a
// cadence (steps, swings, impacts) — the same take at the same rate every
// 300 ms is the "robotic" texture. Gain jitter stays a shots-only feature.
export const PITCH_JITTER: Readonly<Record<string, number>> = {
  gunshot: SHOT_PITCH_JITTER,
  "own-gunshot": SHOT_PITCH_JITTER,
  "melee-swing": 0.06,
  "sword-impact": 0.06,
  "footsteps-stone": 0.07,
  "footsteps-dirt": 0.07,
  "footstep-water": 0.06,
  "jump-land": 0.05,
  "ship-creak": 0.08,
  "horse-neigh": 0.05,
};

// Phase 8e-2 Task 5: the distant-battle bed. Intensity is a decaying count of
// genuinely out-of-range fire events; the bed gain is a clamped linear map of
// it, ducked briefly under the own-shot channel. Formula constants are the
// owner's tuning surface. The bed is deliberately a single low rumble layer:
// direct shots already provide the reports, so a second scheduled boom would
// sound like a delayed echo at the firing line.
const BED_DECAY_SECONDS = 3; // intensity decay time constant
const BED_GAIN_PER_INTENSITY = 0.0025; // linear map before the clamp
const BED_MAX_GAIN = 0.03; // subordinate to direct positional reports
const BED_DUCK_SECONDS = 0.5;
const BED_DUCK_FACTOR = 0.35;
const BED_LOOP_SECONDS = 8;

// A shot inside the remote-shot positional cull is already represented by its
// direct one-shot. Feeding it into the bed as well was a second,
// delayed-sounding layer at the firing line. Keep this boundary aligned with
// the cull so the bed is only fed by reports the direct mix intentionally omits.
export const BATTLE_BED_FAR_CUTOFF_METERS = 150;

export function battleBedContribution(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= BATTLE_BED_NEAR_CUTOFF_METERS) return 0;
  return Math.min(1, (distanceMeters - BATTLE_BED_NEAR_CUTOFF_METERS) / (BATTLE_BED_FAR_CUTOFF_METERS - BATTLE_BED_NEAR_CUTOFF_METERS));
}

// Equal-power crossfade baked into looping buffers to hide the loop seam.
const LOOP_CROSSFADE_SECONDS = 0.1;

// Phase 8e-16 Task 4: slack between a one-shot's expected end (buffer/window
// length, pitch-adjusted) and the long-runner tripwire — covers onended
// dispatch jitter and stop() scheduling. Well under any real sample tail.
const LONG_RUNNER_GRACE_MS = 1_500;

/**
 * Per-key one-shot voice policy (Phase 8c-6). `cap` bounds concurrent voices
 * per key with oldest-voice stealing; `minRetriggerMs` drops plays that land
 * inside the same key's retrigger window. Together they collapse the
 * "sounds stuck on repeat" smear: rapid fire or a crowd of nearby shooters
 * can no longer stack unbounded copies of the same sample, and plays that
 * were requested while the buffer was still loading all race through the
 * gate when the load resolves — the first wins, the rest drop instead of
 * bursting together.
 */
export interface VoicePolicyEntry {
  readonly cap: number;
  readonly minRetriggerMs: number;
}

const DEFAULT_VOICE_POLICY: VoicePolicyEntry = { cap: 4, minRetriggerMs: 25 };

export const VOICE_POLICY: Readonly<Record<string, VoicePolicyEntry>> = {
  // Phase 8e-10 Task 3: cap 6 → 4. The pre-change soak showed this gate
  // pinned at 6 stacked voices for entire battles ("everything loud"); four
  // still sells a volley. minRetriggerMs stays 60 — audioSurface.test.ts
  // pins it, and it is the owner's tuning surface (ADR 0022).
  // Phase 8e-19 Task 6: cap 4 → 6 again. The distance cull and group budget
  // prevent far shots from stacking loud; this per-key cap remains a safety
  // net without stealing a live report in normal play.
  gunshot: { cap: 6, minRetriggerMs: 60 },
  crossbow: { cap: 4, minRetriggerMs: 70 },
  // Own shot (Phase 8e-1): no retrigger window — the local player's shot must
  // never be dropped because a remote shot just played. Fire cooldown (0.8 s)
  // is the natural rate limit.
  "own-gunshot": { cap: 2, minRetriggerMs: 0 },
  "own-crossbow": { cap: 1, minRetriggerMs: 0 },
  "bombard-fire": { cap: 4, minRetriggerMs: 80 },
  "bombard-impact": { cap: 4, minRetriggerMs: 60 },
  "melee-swing": { cap: 3, minRetriggerMs: 60 },
  "sword-impact": { cap: 3, minRetriggerMs: 50 },
  "shovel-dig": { cap: 2, minRetriggerMs: 120 },
  "shovel-raise": { cap: 2, minRetriggerMs: 120 },
  "reload-start": { cap: 2, minRetriggerMs: 80 },
  "reload-click": { cap: 2, minRetriggerMs: 80 },
  "reload-finish": { cap: 2, minRetriggerMs: 80 },
  "footsteps-grass-walk": { cap: 2, minRetriggerMs: 30 },
  "footsteps-grass-run": { cap: 2, minRetriggerMs: 30 },
  "footsteps-stone": { cap: 2, minRetriggerMs: 30 },
  "footsteps-wood": { cap: 2, minRetriggerMs: 30 },
  "footsteps-dirt": { cap: 2, minRetriggerMs: 30 },
  "footstep-water": { cap: 2, minRetriggerMs: 30 },
  // Phase 8e-18: the new one-shot keys. Own-channel keys (jump-land,
  // flesh-hit, headshot, horse-neigh, splash-big) cap low — they are rare by
  // construction; the world-impact keys stack like their particle twins.
  "jump-land": { cap: 1, minRetriggerMs: 200 },
  "flesh-hit": { cap: 2, minRetriggerMs: 80 },
  "headshot": { cap: 2, minRetriggerMs: 40 },
  "horse-neigh": { cap: 1, minRetriggerMs: 500 },
  "splash-big": { cap: 1, minRetriggerMs: 300 },
  "wood-impact": { cap: 3, minRetriggerMs: 40 },
  "splat-gore": { cap: 3, minRetriggerMs: 50 },
  "thud": { cap: 3, minRetriggerMs: 60 },
  "ship-creak": { cap: 1, minRetriggerMs: 1500 },
  "hit-confirm": { cap: 3, minRetriggerMs: 40 },
  "kill-confirm": { cap: 3, minRetriggerMs: 40 },
  death: { cap: 4, minRetriggerMs: 30 },
  "chat-pop": { cap: 2, minRetriggerMs: 50 },
  "ui-click": { cap: 2, minRetriggerMs: 20 },
  "ui-hover": { cap: 2, minRetriggerMs: 20 },
};

/**
 * Per-key gates stop one sample from taking over, but they still allow a
 * gunshot gate plus a crossbow gate to fill the same SFX bus. These small
 * groups are the actual mix budget for a crowded battlefield.
 */
export const VOICE_GROUP_BY_KEY: Readonly<Record<string, string>> = {
  gunshot: "remote-shot",
  crossbow: "remote-shot",
  "bombard-fire": "artillery",
  "bombard-impact": "artillery",
};

export const VOICE_GROUP_CAPS: Readonly<Record<string, number>> = {
  // Three simultaneous remote reports leave headroom for the own shot and
  // remove the dense wall that was being perceived as echo near a firing line.
  "remote-shot": 3,
  artillery: 2,
};

/**
 * Phase 8e-19 Task 6: hard distance cull per group key — voices beyond the
 * cutoff skip the voice gate entirely (no begin, no load, no faint wash).
 * The manifest maxDistance (the inverse-law zero) is the falloff END; these
 * cutoffs sit under it so the far tail stops occupying gates: with 100+
 * shooters the 90-150 m band was hundreds of silent-but-gated voices per
 * volley, and gate stealing was cutting audible shots mid-sample into the
 * "looping/echoing" stutter. The 8e-10 inverse-distance law is untouched for
 * everything inside the cutoff.
 */
export const DISTANCE_CULL_METERS: Readonly<Partial<Record<string, number>>> = {
  gunshot: 90, // manifest maxDistance 150
  crossbow: 90, // synthesized remote bolts share the gunshot mix budget
  "bombard-fire": 150, // 220
  "bombard-impact": 150, // 220
  "melee-swing": 30, // 60
  "sword-impact": 30, // 60
  "footsteps-grass-walk": 25, // 45
  "footsteps-grass-run": 25, // 55
  "footsteps-stone": 25, // 45
  "footsteps-wood": 25, // 45
  "footsteps-dirt": 25, // 45
  "footstep-water": 25, // 45
  "wood-impact": 30, // 60
  "splat-gore": 30, // 45
  thud: 80, // 120
  death: 40, // 55
};

// The distant battle bed starts exactly where direct remote musket reports
// are culled. Keep the value exported near the cull table so tests can pin
// that the two mix boundaries cannot drift apart.
export const BATTLE_BED_NEAR_CUTOFF_METERS = DISTANCE_CULL_METERS.gunshot ?? 90;

/** Distance low-pass (Task 6c): far shots go muffled instead of thin-loud.
 *  The filter cutoff slides 20 kHz → LOWPASS_MIN_HZ between LOWPASS_START_M
 *  and the group's cull distance, so mid-range shots lose sparkle and the
 *  far tail reads as a rumble, not a hiss of stacked reports. */
export const LOWPASS_START_METERS = 25;
export const LOWPASS_MIN_HZ = 900;
export const LOWPASS_MAX_HZ = 20_000;

/** Low-pass cutoff at a given distance, exponential slide (20 kHz → 900 Hz). */
export function lowpassFrequencyFor(distanceMeters: number, cullMeters: number): number {
  const t = Math.min(1, Math.max(0, (distanceMeters - LOWPASS_START_METERS) / Math.max(1, cullMeters - LOWPASS_START_METERS)));
  return LOWPASS_MAX_HZ * (LOWPASS_MIN_HZ / LOWPASS_MAX_HZ) ** t;
}

/**
 * Engine-agnostic voice gate for one-shot samples: per-key cap with
 * oldest-voice stealing and a per-key retrigger minimum. Pure logic — the
 * engine supplies the source factory and release callbacks. Unit-tested in
 * node without an AudioContext.
 */
interface VoiceRecord {
  readonly key: string;
  readonly source: AudioBufferSourceNode;
  readonly startedAt: number;
  readonly expectedEndMs: number;
  readonly group: string | undefined;
}

export class VoiceGate {
  readonly #voices = new Map<string, VoiceRecord[]>();
  readonly #groupVoices = new Map<string, VoiceRecord[]>();
  readonly #lastStart = new Map<string, number>();

  #remove(record: VoiceRecord): void {
    const voices = this.#voices.get(record.key);
    if (voices !== undefined) {
      const index = voices.indexOf(record);
      if (index >= 0) voices.splice(index, 1);
      if (voices.length === 0) this.#voices.delete(record.key);
    }
    if (record.group !== undefined) {
      const grouped = this.#groupVoices.get(record.group);
      if (grouped !== undefined) {
        const index = grouped.indexOf(record);
        if (index >= 0) grouped.splice(index, 1);
        if (grouped.length === 0) this.#groupVoices.delete(record.group);
      }
    }
  }

  /**
   * Claims a voice for `key` at `nowMs`. Returns undefined when the play is
   * inside the retrigger window (dropped, not queued). Otherwise steals the
   * oldest voice at cap and starts `create()`. `expectedDurationMs` (buffer or
   * window length, pitch-adjusted) feeds the dev-only long-runner detector —
   * pass Infinity (default) only where a voice has no meaningful bound.
   */
  begin(key: string, nowMs: number, create: () => AudioBufferSourceNode, expectedDurationMs = Number.POSITIVE_INFINITY): AudioBufferSourceNode | undefined {
    const policy = VOICE_POLICY[key] ?? DEFAULT_VOICE_POLICY;
    if (nowMs - (this.#lastStart.get(key) ?? -Infinity) < policy.minRetriggerMs) return undefined;
    const group = VOICE_GROUP_BY_KEY[key];
    const groupCap = group === undefined ? undefined : VOICE_GROUP_CAPS[group];
    if (group !== undefined && groupCap !== undefined) {
      const grouped = this.#groupVoices.get(group) ?? [];
      // Never stop an audible report halfway through. The old group-level
      // steal was heard as a clipped repeat/echo when the front filled up.
      if (grouped.length >= groupCap) return undefined;
    }
    let voices = this.#voices.get(key);
    if (voices === undefined) {
      voices = [];
      this.#voices.set(key, voices);
    }
    while (voices.length >= policy.cap) {
      const oldest = voices.shift();
      if (oldest !== undefined) {
        if (oldest.group !== undefined) {
          const grouped = this.#groupVoices.get(oldest.group);
          const groupIndex = grouped?.indexOf(oldest) ?? -1;
          if (grouped !== undefined && groupIndex >= 0) grouped.splice(groupIndex, 1);
          if (grouped !== undefined && grouped.length === 0) this.#groupVoices.delete(oldest.group);
        }
        try {
          oldest.source.stop();
        } catch {
          // already stopped — the ended handler cleans the array
        }
      }
    }
    const source = create();
    this.#lastStart.set(key, nowMs);
    const record: VoiceRecord = { key, source, startedAt: nowMs, expectedEndMs: nowMs + expectedDurationMs, group };
    voices.push(record);
    if (group !== undefined) this.#groupVoices.set(group, [...(this.#groupVoices.get(group) ?? []), record]);
    return source;
  }

  /** Called from the source's `onended` so finished voices free their slot. */
  release(key: string, source: AudioBufferSourceNode): void {
    const voices = this.#voices.get(key);
    if (voices === undefined) return;
    const record = voices.find((voice) => voice.source === source);
    if (record !== undefined) this.#remove(record);
  }

  activeCount(key: string): number {
    return this.#voices.get(key)?.length ?? 0;
  }

  /** Per-key live voice counts, for the dev-only debug snapshot (Phase 8e-0). */
  countsByKey(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [key, voices] of this.#voices) counts[key] = voices.length;
    return counts;
  }

  countsByGroup(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [group, voices] of this.#groupVoices) counts[group] = voices.length;
    return counts;
  }

  totalCount(): number {
    let total = 0;
    for (const voices of this.#voices.values()) total += voices.length;
    return total;
  }

  /**
   * Dev-only long-runner detector (Phase 8e-16 Task 4): voices still alive
   * `graceMs` past the moment their buffer/window should have ended. The gate
   * only ever holds one-shots (loops live outside it), so an over-age voice
   * is stuck — its onended never fired — not a long legitimate tail. This is
   * the "loops like stuck or broken" tripwire: a flat "> 4 s" rule would
   * false-positive on the 12 s bombard-impact tail, so each voice carries its
   * own expected end instead.
   */
  longRunners(nowMs: number, graceMs: number): readonly { key: string; ageMs: number }[] {
    const stuck: { key: string; ageMs: number }[] = [];
    for (const [key, voices] of this.#voices) {
      for (const voice of voices) {
        if (nowMs > voice.expectedEndMs + graceMs) stuck.push({ key, ageMs: Math.round(nowMs - voice.startedAt) });
      }
    }
    return stuck;
  }
}

export class AudioEngine {
  #context: AudioContext | undefined;
  #masterGain?: GainNode;
  #sfxGain?: GainNode;
  #uiGain?: GainNode;
  #musicGain?: GainNode;
  #volumes = { master: 1, sfx: 1, music: 1 };
  #buffers = new Map<string, AudioBuffer>();
  #pending = new Map<string, Promise<AudioBuffer | undefined>>();
  #crossbowBuffer?: AudioBuffer;
  #thumpBuffer?: AudioBuffer;
  #pourBuffer?: AudioBuffer;
  #ramBuffer?: AudioBuffer;
  #drawBladeBuffer?: AudioBuffer;
  #drawGunBuffer?: AudioBuffer;
  #loops = new Map<string, { gain: GainNode; target: number; applied: number }>();
  #positionalLoops = new Map<string, PositionalLoop>();
  #loopGenerations = new Map<string, number>();
  readonly #voiceGate = new VoiceGate();
  readonly #lastVariant = new Map<string, number>();
  readonly #variantPlays = new Map<string, number>();
  readonly #totalPlays = new Map<string, number>();
  #bedIntensity = 0;
  #bedTarget = 0;
  #bedDuckUntil = 0;
  #bedLoop: { source: AudioBufferSourceNode; gain: GainNode } | undefined;
  #bedBuffer?: AudioBuffer;
  #lastBedUpdateMs = 0;
  #ambientActive = false;
  /** Phase 8e-25: last proximity fraction (0..1) so the shore bed can be
   * re-applied when the ambient layer re-activates. */
  #shoreProximity = 0;
  #chantActive = false;
  #drone: { oscillators: readonly OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | undefined;
  #nextBellAt = 0;
  #lastUiClickMs = -Infinity;
  #lastUiHoverMs = -Infinity;
  #baseUrl: string;
  #disposed = false;
  #listener: () => AudioListener;

  constructor(listener: () => AudioListener) {
    this.#listener = listener;
    // Manifest files carry their own `audio/` prefix (the audit:assets gate
    // requires it), so the base is the app root — NOT `${BASE_URL}audio/`.
    // The old double prefix fetched `/audio/audio/x.mp3`, which the dev
    // server and the SPA fallback both answer with index.html: every sample
    // silently failed decodeAudioData and only synthesized audio ever played.
    this.#baseUrl = import.meta.env.BASE_URL;
  }

  get ready(): boolean {
    return this.#context !== undefined && this.#context.state === "running";
  }

  ensure(): void {
    if (this.#disposed) return;
    if (this.#context === undefined) {
      const context = new AudioContext();
      const master = context.createGain();
      // Keep summed battlefield transients below clipping. This is a gentle
      // headroom stage, not a substitute for the per-source voice budgets.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 18;
      limiter.ratio.value = 4;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(limiter).connect(context.destination);
      const sfx = context.createGain();
      sfx.connect(master);
      const ui = context.createGain();
      ui.connect(master);
      const music = context.createGain();
      music.connect(master);
      this.#context = context;
      this.#masterGain = master;
      this.#sfxGain = sfx;
      this.#uiGain = ui;
      this.#musicGain = music;
      this.#applyVolumes();
      if (this.#ambientActive) {
        this.#restartAmbientLoops();
        this.#startBattleBed();
      }
    }
    void this.#context.resume();
  }

  setVolumes(volumes: { master: number; sfx: number; music: number }): void {
    this.#volumes = { ...volumes };
    this.#applyVolumes();
  }

  #applyVolumes(): void {
    const context = this.#context;
    if (context === undefined) return;
    const master = this.#masterGain;
    const sfx = this.#sfxGain;
    const ui = this.#uiGain;
    const music = this.#musicGain;
    if (master !== undefined) master.gain.setTargetAtTime(this.#volumes.master, context.currentTime, 0.05);
    if (sfx !== undefined) sfx.gain.setTargetAtTime(this.#volumes.sfx, context.currentTime, 0.05);
    if (ui !== undefined) ui.gain.setTargetAtTime(this.#volumes.sfx * 0.72, context.currentTime, 0.05);
    if (music !== undefined) music.gain.setTargetAtTime(this.#volumes.music, context.currentTime, 0.05);
  }

  setAmbientActive(active: boolean): void {
    if (this.#ambientActive === active) return;
    this.#ambientActive = active;
    if (!active) {
      this.setLoopLevel("mehter-drums", 0);
      this.setLoopLevel("shore-ambience", 0);
      this.#stopBattleBed();
      return;
    }
    if (this.#context !== undefined) {
      this.#restartAmbientLoops();
      this.#startBattleBed();
    }
  }

  setChantActive(active: boolean): void {
    if (this.#chantActive === active) return;
    this.#chantActive = active;
    if (!active) {
      this.#stopDrone();
      return;
    }
    if (this.#context !== undefined) this.#startDrone();
  }

  /** Quiet near-water bed (ADR 0045): level follows proximity to river/sea
   *  shorelines, computed in GameClient (0 = far, 1 = at the water's edge). */
  setShoreProximity(fraction: number): void {
    const base = AUDIO_MANIFEST_BY_KEY.get("shore-ambience")?.gain ?? 0;
    this.#shoreProximity = Math.min(1, Math.max(0, fraction));
    // Phase 8e-25: the caller streams a proximity fraction every frame even
    // outside active rounds, so the ambient gate must live here — during
    // Victory/Intermission the near-shore bed goes silent with the rest of
    // the ambient layer instead of re-arming itself (mehter-drums parity).
    this.setLoopLevel("shore-ambience", shoreLevelFor(this.#ambientActive, this.#shoreProximity, base));
  }

  setLoopLevel(key: string, level: number): void {
    const loop = this.#loops.get(key);
    if (loop === undefined || loop.target === level) return;
    loop.target = level;
  }

  #restartAmbientLoops(): void {
    this.#startLoop("mehter-drums");
    this.#startLoop("shore-ambience");
  }

  async #startLoop(key: string): Promise<void> {
    const context = this.#context;
    if (context === undefined || this.#loops.has(key) || this.#disposed) return;
    const buffer = await this.#load(key);
    if (buffer === undefined || this.#disposed) return;
    if (this.#context === undefined || this.#loops.has(key)) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    // Route by the manifest row's bus (ADR 0045: shore-ambience is sfx —
    // muting music must not silence the world).
    source.connect(gain).connect(this.#destFor(key) ?? context.destination);
    source.start();
    this.#loops.set(key, { gain, target: 0, applied: 0 });
  }

  update(nowMs: number): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    for (const loop of this.#loops.values()) {
      if (loop.applied === loop.target) continue;
      loop.gain.gain.setTargetAtTime(loop.target, context.currentTime, 0.4);
      loop.applied = loop.target;
    }
    const def = AUDIO_MANIFEST_BY_KEY.get("mehter-drums");
    if (def !== undefined) this.setLoopLevel("mehter-drums", this.#ambientActive ? def.gain : 0);
    this.#updateBattleBed(nowMs);
    if (this.#chantActive && nowMs >= this.#nextBellAt) {
      this.#nextBellAt = nowMs + 3_800 + Math.random() * 2_400;
      this.#bellStrike();
    }
  }

  // -------------------------------------------------------------------------
  // Phase 8e-2 Task 5: distant-battle bed. A synthesized low rumble loop on
  // the SFX bus (diegetic ambience — muting music must not silence the war)
  // whose gain tracks a decaying count of the fire events the client already
  // sees. It never schedules a second report; direct one-shots own the shot
  // transient. All per-frame work is O(1); the bed buffer is synthesized once.
  // -------------------------------------------------------------------------

  /** A distant fire event reached the client; close fire is already positional. */
  noteFireEvent(at?: { x: number; z: number }): void {
    if (at === undefined) return;
    const listener = this.#listener();
    this.#bedIntensity += battleBedContribution(Math.hypot(at.x - listener.x, at.z - listener.z));
  }

  #updateBattleBed(nowMs: number): void {
    const context = this.#context;
    if (context === undefined) return;
    const dtMs = this.#lastBedUpdateMs === 0 ? 16 : Math.min(250, nowMs - this.#lastBedUpdateMs);
    this.#lastBedUpdateMs = nowMs;
    this.#bedIntensity *= Math.exp(-dtMs / (BED_DECAY_SECONDS * 1_000));
    let target = Math.min(BED_MAX_GAIN, this.#bedIntensity * BED_GAIN_PER_INTENSITY);
    if (!this.#ambientActive) target = 0;
    if (nowMs < this.#bedDuckUntil) target *= BED_DUCK_FACTOR;
    this.#bedTarget = target;
    const loop = this.#bedLoop;
    if (loop !== undefined) loop.gain.gain.setTargetAtTime(target, context.currentTime, 0.6);
  }

  #startBattleBed(): void {
    const context = this.#context;
    if (context === undefined || this.#bedLoop !== undefined || this.#disposed) return;
    this.#bedBuffer ??= bakeLoopCrossfade(context, this.#synthesizeBedLoop(context));
    const source = context.createBufferSource();
    source.buffer = this.#bedBuffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.#sfxGain ?? context.destination);
    source.start();
    this.#bedLoop = { source, gain };
  }

  #stopBattleBed(): void {
    const loop = this.#bedLoop;
    if (loop === undefined) return;
    this.#bedLoop = undefined;
    this.#bedIntensity = 0;
    try {
      loop.source.stop();
    } catch {
      // already stopped
    }
    loop.gain.disconnect();
  }

  /** The bed loop: slow brown-noise rumble, band-limited 40–140 Hz with a
   * 0.1 Hz amplitude wander — distant musketry as weather, not as events. */
  #synthesizeBedLoop(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * BED_LOOP_SECONDS), sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    let brown = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      const noise = Math.random() * 2 - 1;
      brown = (brown + 0.02 * noise) / 1.02;
      const cutoff = 90 + 50 * Math.sin(t * 0.7);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (brown * 3.2 - low);
      const wander = 0.75 + 0.25 * Math.sin(t * (2 * Math.PI * 0.11) + 1.3);
      const sample = low * wander;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.8 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  #destFor(key: string): AudioNode | undefined {
    const asset = AUDIO_MANIFEST_BY_KEY.get(key);
    if (asset === undefined) return undefined;
    if (asset.bus === "music") return this.#musicGain ?? this.#masterGain;
    return this.#sfxGain ?? this.#masterGain;
  }

  async #load(key: string): Promise<AudioBuffer | undefined> {
    const context = this.#context;
    if (context === undefined) return undefined;
    const cached = this.#buffers.get(key);
    if (cached !== undefined) return cached;
    const pending = this.#pending.get(key);
    if (pending !== undefined) return pending;
    const asset = AUDIO_MANIFEST_BY_KEY.get(key);
    if (asset === undefined) return undefined;
    const url = `${this.#baseUrl}${asset.file}`;
    const promise = fetch(url)
      .then((response) => {
        // Phase 8e-2: dev-only loud failure. The 8e-0 404 class (every sample
        // silently failing for three phases) survived because a bad status
        // fell through to `undefined` with no trace. Prod stays silent.
        if (!response.ok && import.meta.env.DEV) {
          console.warn(`[audio] sample fetch failed: key="${key}" url="${url}" status=${response.status}`);
        }
        return response.ok ? response.arrayBuffer() : undefined;
      })
      .then((bytes) => (bytes === undefined ? undefined : context.decodeAudioData(bytes)))
      .then((buffer) => (buffer !== undefined && asset.loop === true ? bakeLoopCrossfade(context, buffer) : buffer))
      .catch((error: unknown) => {
        // Decode failures land here — including the SPA-fallback class (a 200
        // text/html body that decodeAudioData rejects). Dev-only by the same
        // discipline as the status warn above.
        if (import.meta.env.DEV) {
          console.warn(`[audio] sample decode failed: key="${key}" url="${url}"`, error);
        }
        return undefined;
      })
      .then((buffer) => {
        this.#pending.delete(key);
        if (buffer !== undefined) this.#buffers.set(key, buffer);
        return buffer;
      });
    this.#pending.set(key, promise);
    return promise;
  }

  play(key: string, options: { at?: { x: number; z: number }; volume?: number; pitch?: number; durationSeconds?: number } = {}): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    void this.#playBuffered(key, context, options.at, options.volume ?? 1, options.pitch ?? 1, options.durationSeconds);
  }

  /** Short, restrained medieval UI cues: wood/bronze-like tones, no long file
   * tails and no browser hover burst. The old futuristic samples remain in
   * the manifest for provenance but are no longer used by menu navigation. */
  uiClick(): void {
    const now = performance.now();
    if (now - this.#lastUiClickMs < 55) return;
    this.#lastUiClickMs = now;
    this.#playUiTone("click");
  }

  uiHover(): void {
    const now = performance.now();
    if (now - this.#lastUiHoverMs < 110) return;
    this.#lastUiHoverMs = now;
    this.#playUiTone("hover");
  }

  #playUiTone(kind: "click" | "hover"): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const now = context.currentTime;
    const duration = kind === "click" ? 0.085 : 0.055;
    const peak = kind === "click" ? 0.12 : 0.045;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const low = context.createOscillator();
    low.type = "triangle";
    low.frequency.setValueAtTime(kind === "click" ? 180 : 430, now);
    low.frequency.exponentialRampToValueAtTime(kind === "click" ? 110 : 300, now + duration);
    low.connect(gain);
    low.start(now);
    low.stop(now + duration);
    if (kind === "click") {
      const tick = context.createOscillator();
      tick.type = "sine";
      tick.frequency.setValueAtTime(1_250, now);
      tick.frequency.exponentialRampToValueAtTime(680, now + 0.035);
      const tickGain = context.createGain();
      tickGain.gain.setValueAtTime(0.0001, now);
      tickGain.gain.exponentialRampToValueAtTime(0.035, now + 0.002);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      tick.connect(tickGain).connect(this.#uiGain ?? this.#sfxGain ?? context.destination);
      tick.start(now);
      tick.stop(now + 0.04);
      tick.onended = () => {
        tick.disconnect();
        tickGain.disconnect();
      };
    }
    gain.connect(this.#uiGain ?? this.#sfxGain ?? context.destination);
    low.onended = () => {
      low.disconnect();
      gain.disconnect();
    };
  }

  async #playBuffered(
    key: string,
    context: AudioContext,
    at: { x: number; z: number } | undefined,
    volume: number,
    pitch: number,
    durationSeconds?: number,
  ): Promise<void> {
    // Cull before loading: a distant event should not enqueue or decode a
    // sample that cannot be heard by this listener.
    const cull = DISTANCE_CULL_METERS[key];
    if (cull !== undefined && at !== undefined) {
      const listener = this.#listener();
      if (Math.hypot(at.x - listener.x, at.z - listener.z) > cull) return;
    }
    // Phase 8e-2 Task 2: pooled keys load a per-play variant buffer but keep
    // the GROUP key for the gate, windowless routing, gain, and maxDistance —
    // the channel identity (and its VOICE_POLICY) never forks.
    const pool = VARIANT_POOLS[key];
    const variantKey = pool === undefined ? key : this.#pickVariant(key, pool);
    const buffer = await this.#load(variantKey);
    if (buffer === undefined || this.#disposed) return;
    // Phase 8e-19 Task 6a: hard distance cull BEFORE the gate claim — far
    // voices never occupy a slot or a gate. Re-check after async decoding as
    // well: a source can move out of range while its sample is loading, and
    // starting that stale voice would still create a faint delayed tail.
    if (cull !== undefined && at !== undefined) {
      const listener = this.#listener();
      if (Math.hypot(at.x - listener.x, at.z - listener.z) > cull) return;
    }
    // The manifest maxDistance already made these voices inaudible; this
    // stops them from churning the gate (the mid-sample steals that read as a
    // broken loop).
    // Jitter and the play window resolve BEFORE the gate claim so the voice
    // carries its real expected end (8e-16 long-runner detector); the window
    // duration otherwise defaults to the whole buffer (e.g. the 12 s
    // bombard-impact tail — legitimate, never flagged).
    const measuredWindow = SAMPLE_WINDOWS[variantKey] ?? SAMPLE_WINDOWS[key];
    const window = durationSeconds === undefined
      ? measuredWindow
      : {
        minOffset: measuredWindow?.minOffset ?? 0,
        maxOffset: measuredWindow?.maxOffset ?? measuredWindow?.minOffset ?? 0,
        duration: Math.max(0.05, durationSeconds),
        gain: measuredWindow?.gain,
      };
    let effectivePitch = pitch;
    let effectiveVolume = volume;
    const pitchJitter = PITCH_JITTER[key] ?? 0;
    if (pitchJitter > 0) effectivePitch *= 1 - pitchJitter + Math.random() * pitchJitter * 2;
    if (SHOT_JITTER_KEYS.has(key)) {
      effectiveVolume *= 1 - SHOT_GAIN_JITTER + Math.random() * SHOT_GAIN_JITTER * 2;
    }
    const expectedDurationMs = ((window?.duration ?? buffer.duration) / effectivePitch) * 1_000;
    // The voice gate runs AFTER the load resolves: plays that were requested
    // while the buffer was still loading all resolve at the same moment, and
    // the first one through the retrigger window starts while the rest drop —
    // this is what collapses an async-load burst into a single audible shot.
    const source = this.#voiceGate.begin(key, performance.now(), () => context.createBufferSource(), expectedDurationMs);
    if (source === undefined) return;
    this.#variantPlays.set(variantKey, (this.#variantPlays.get(variantKey) ?? 0) + 1);
    this.#totalPlays.set(key, (this.#totalPlays.get(key) ?? 0) + 1);
    source.buffer = buffer;
    if (effectivePitch !== 1) source.playbackRate.value = effectivePitch;
    if (window !== undefined) {
      effectiveVolume *= window.gain ?? 1;
      const offset = window.minOffset + Math.random() * Math.max(0, window.maxOffset - window.minOffset);
      source.start(context.currentTime, offset, window.duration);
    } else {
      source.start();
    }
    const destination = this.#destFor(key);
    if (destination === undefined) {
      // Unknown manifest key: release the gate slot for the started source
      // (same leak shape as the out-of-range path in #routeSpatial).
      try {
        source.stop();
      } catch {
        // already stopped
      }
      this.#voiceGate.release(key, source);
      return;
    }
    this.#routeSpatial(context, source, at, (AUDIO_MANIFEST_BY_KEY.get(key)?.gain ?? 1) * effectiveVolume, AUDIO_MANIFEST_BY_KEY.get(key)?.maxDistance ?? 100, destination, key, AUDIO_MANIFEST_BY_KEY.get(key)?.refDistance ?? SPATIAL_REF_DEFAULT_METERS);
  }

  /** Random variant without immediate repeats — a repeated report is exactly
   * the "robotic volley" texture this pool exists to kill. O(1) per play. */
  #pickVariant(group: string, pool: readonly string[]): string {
    if (pool.length === 1) return pool[0] ?? group;
    const last = this.#lastVariant.get(group) ?? -1;
    let index = Math.floor(Math.random() * pool.length);
    if (index === last) index = (index + 1) % pool.length;
    this.#lastVariant.set(group, index);
    return pool[index] ?? group;
  }

  #routeSpatial(
    context: AudioContext,
    source: AudioBufferSourceNode,
    at: { x: number; z: number } | undefined,
    baseGain: number,
    maxDistance: number,
    destination: AudioNode,
    voiceKey: string,
    refDistance: number = SPATIAL_REF_DEFAULT_METERS,
    distanceKey: string = voiceKey,
  ): void {
    let gain = baseGain;
    let tail: AudioNode = source;
    if (at !== undefined) {
      const spatial = this.#spatial(at, gain, maxDistance, refDistance);
      if (spatial === undefined) {
        // Out of range: the source was already started by the caller, so it
        // will end silently — but without this release its VoiceGate slot is
        // leaked forever (Phase 8e-0: remote shots beyond maxDistance pinned
        // the gunshot gate at its cap of 6 for the whole session).
        try {
          source.stop();
        } catch {
          // already stopped
        }
        this.#voiceGate.release(voiceKey, source);
        return;
      }
      gain = spatial.gain;
      // Phase 8e-19 Task 6c: distance low-pass — the far tail goes muffled
      // instead of thin-loud. Cutoff slides exponentially between
      // LOWPASS_MAX_HZ and LOWPASS_MIN_HZ from LOWPASS_START_METERS to the
      // group's cull distance (maxDistance when unlisted).
      const listener = this.#listener();
      const distance = Math.hypot(at.x - listener.x, at.z - listener.z);
      const cull = DISTANCE_CULL_METERS[distanceKey] ?? maxDistance;
      if (distance > LOWPASS_START_METERS) {
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 0.7;
        filter.frequency.value = lowpassFrequencyFor(distance, cull);
        source.connect(filter);
        tail = filter;
      }
      const panner = context.createStereoPanner();
      panner.pan.value = spatial.pan;
      tail.connect(panner);
      tail = panner;
    }
    const gainNode = context.createGain();
    gainNode.gain.value = Math.max(0, gain);
    tail.connect(gainNode).connect(destination);
    source.onended = () => {
      gainNode.disconnect();
      this.#voiceGate.release(voiceKey, source);
    };
  }

  playCrossbow(at?: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    this.#crossbowBuffer ??= this.#synthesizeCrossbow(context);
    const source = context.createBufferSource();
    source.buffer = this.#crossbowBuffer;
    // Phase 8e-2 Task 2: same pitch jitter as the gunshot pool, so Byzantine
    // volleys stop phasing too (the buffer itself stays shared and cached).
    source.playbackRate.value = 1 - SHOT_PITCH_JITTER + Math.random() * SHOT_PITCH_JITTER * 2;
    const destination = this.#sfxGain ?? this.#masterGain ?? context.destination;
    // Phase 8e-10 Task 3: a non-positional call IS the own-shot channel (the
    // only such caller is ownShot), so it keeps the own-gunshot gain; remote
    // bolts sit at the remote-gunshot level with the same reference distance.
    const own = at === undefined;
    const gateKey = own ? "own-crossbow" : "crossbow";
    const playbackRate = source.playbackRate.value;
    const gated = this.#voiceGate.begin(gateKey, performance.now(), () => source, (CROSSBOW_SECONDS / playbackRate) * 1_000);
    if (gated === undefined) return;
    this.#routeSpatial(context, gated, at, own ? CROSSBOW_GAIN_OWN : CROSSBOW_GAIN_REMOTE, CROSSBOW_MAX_DISTANCE, destination, gateKey, CROSSBOW_REF_DISTANCE, "crossbow");
    gated.start();
  }

  /**
   * The local player's own shot (Phase 8e-1): unmistakably *theirs* —
   * center-panned (no `at`), the sample on the dedicated own-gunshot channel
   * at higher gain than any remote shot, plus a low synthesized body thump
   * under it. Remote shots stay positional on the shared "gunshot" gate.
   */
  ownShot(crossbow: boolean): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    // Task 5: the battle bed ducks under the own shot — the player's gun must
    // punch through the rumble it contributes to.
    this.#bedDuckUntil = performance.now() + BED_DUCK_SECONDS * 1_000;
    if (crossbow) {
      this.playCrossbow();
    } else {
      this.play("own-gunshot");
    }
    this.#thumpBuffer ??= this.#synthesizeThump(context);
    const source = context.createBufferSource();
    source.buffer = this.#thumpBuffer;
    const gain = context.createGain();
    gain.gain.value = OWN_SHOT_THUMP_GAIN;
    source.connect(gain).connect(this.#sfxGain ?? context.destination);
    source.onended = () => gain.disconnect();
    source.start();
  }

  /**
   * Distinct kill sting (Phase 8e-1): the hit-ding sample louder than the
   * hit confirm, layered with a low confirmation thump and a short rising
   * two-note chime. Louder and longer than `hit-confirm` so a kill can never
   * be mistaken for a hit.
   */
  killSting(): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    this.play("kill-confirm", { volume: 1.2, pitch: 0.92 });
    const startedAt = context.currentTime;
    const destination = this.#sfxGain ?? context.destination;
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.frequency.setValueAtTime(150, startedAt);
    thump.frequency.exponentialRampToValueAtTime(58, startedAt + 0.28);
    thumpGain.gain.setValueAtTime(0.16, startedAt);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.34);
    thump.connect(thumpGain).connect(destination);
    thump.start(startedAt);
    thump.stop(startedAt + 0.36);
    const notes: readonly (readonly [number, number])[] = [[392, 0], [587.33, 0.09]];
    for (const [frequency, delay] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.1, startedAt + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + delay + 0.3);
      oscillator.connect(gain).connect(destination);
      oscillator.start(startedAt + delay);
      oscillator.stop(startedAt + delay + 0.32);
    }
  }

  /** Pan-primed "READY" cue at reload completion (Phase 8e-1): a short bright tick. */
  readyCue(): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const startedAt = context.currentTime;
    this.synthTone(1174.66, startedAt, 0.07, 0.09, "triangle");
    this.synthTone(1760, startedAt + 0.06, 0.09, 0.07, "triangle");
  }

  /**
   * Phase 8e-2 Task 4 mid-reload foley, synthesized per the established
   * discipline (no asset files — measured Freesound powder/ramrod candidates
   * were all NC or cinematic). Pour: a 0.45 s granular powder-stream hiss.
   * Ram: a 0.4 s wooden thud with a short draw-scrape. Both cached buffers,
   * own-player only (non-positional), fired on reloadTicks fraction crossings
   * so they track the reticle radial exactly.
   */
  reloadPour(): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    this.#pourBuffer ??= this.#synthesizeReloadPour(context);
    const source = context.createBufferSource();
    source.buffer = this.#pourBuffer;
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    const gain = context.createGain();
    gain.gain.value = 0.3;
    source.connect(gain).connect(this.#sfxGain ?? context.destination);
    source.onended = () => gain.disconnect();
    source.start();
  }

  reloadRam(): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    this.#ramBuffer ??= this.#synthesizeReloadRam(context);
    const source = context.createBufferSource();
    source.buffer = this.#ramBuffer;
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    const gain = context.createGain();
    gain.gain.value = 0.32;
    source.connect(gain).connect(this.#sfxGain ?? context.destination);
    source.onended = () => gain.disconnect();
    source.start();
  }

  #synthesizeReloadPour(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const duration = 0.45;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const channel = buffer.getChannelData(0);
    let high = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      const noise = Math.random() * 2 - 1;
      // Granular stream: band-limited hiss whose density swells then thins.
      const cutoff = 3200 + 1600 * Math.sin(t * 21);
      high += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - high);
      const grains = 0.6 + 0.4 * Math.sin(t * 87 + Math.sin(t * 13));
      const envelope = Math.min(1, t * 25) * Math.max(0, 1 - t / duration);
      const sample = (noise - high) * 0.7 * grains * envelope;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.75 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  #synthesizeReloadRam(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const duration = 0.4;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    let phase = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      // Draw-scrape for the first 0.15 s, then the seating thud.
      const noise = Math.random() * 2 - 1;
      const cutoff = 900 - 500 * Math.min(1, t / 0.15);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - low);
      const scrape = low * Math.max(0, 1 - t / 0.15) * 0.5;
      const thudT = Math.max(0, t - 0.15);
      phase += (2 * Math.PI * (150 - 80 * Math.min(1, thudT / 0.1))) / sampleRate * (thudT > 0 ? 1 : 0);
      const thud = thudT > 0 ? Math.sin(phase) * Math.exp(-thudT / 0.07) : 0;
      const sample = scrape + thud * 1.1;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.8 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  // -------------------------------------------------------------------------
  // Slot-switch foley (Phase 8e-3): the draw/holster cue for the local
  // player's 1/2/3 switch — a blade "shing" (band-swept noise plus a short
  // metallic ring) or a quiet gun-handling rustle. Same synthesis discipline
  // as the reload foley: cached buffers, per-play rate jitter, own-player
  // only, non-positional, well under the own-shot channel.
  // -------------------------------------------------------------------------

  weaponDraw(kind: "blade" | "gun"): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const buffer = kind === "blade"
      ? (this.#drawBladeBuffer ??= this.#synthesizeDrawBlade(context))
      : (this.#drawGunBuffer ??= this.#synthesizeDrawGun(context));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.95 + Math.random() * 0.1;
    const gain = context.createGain();
    gain.gain.value = kind === "blade" ? 0.22 : 0.16;
    source.connect(gain).connect(this.#sfxGain ?? context.destination);
    source.onended = () => gain.disconnect();
    source.start();
  }

  #synthesizeDrawBlade(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const duration = 0.18;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const channel = buffer.getChannelData(0);
    let band = 0;
    let ringPhase = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      const noise = Math.random() * 2 - 1;
      // Rising band sweep 1.8k→5.5k over the draw, plus a decaying ring.
      const cutoff = 1800 + 3700 * Math.min(1, t / duration);
      band += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - band);
      const sweep = (band - (channel[Math.max(0, index - 1)] ?? 0) * 0.2) * 0.35;
      ringPhase += (2 * Math.PI * 6200) / sampleRate;
      const ring = Math.sin(ringPhase) * Math.exp(-t / 0.05) * 0.25;
      const envelope = Math.min(1, t * 60) * Math.max(0, 1 - t / duration);
      const sample = (sweep + ring) * envelope;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.7 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  #synthesizeDrawGun(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const duration = 0.12;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      const noise = Math.random() * 2 - 1;
      // Wood-and-cloth rustle: low-passed noise with a soft swell.
      const cutoff = 700 + 300 * Math.sin(t * 40);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - low);
      const envelope = Math.min(1, t * 30) * Math.max(0, 1 - t / duration);
      const sample = low * 0.8 * envelope;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.6 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  // -------------------------------------------------------------------------
  // Positional loops (Phase 8c-6): gallop hooves and torch crackle. One loop
  // per tracked entity, spatialised like footsteps (gain by distance, panned
  // by bearing) and fade in/out to avoid clicks. The caller decides which
  // entities get loops (local + nearest N remotes) and drives
  // updatePositionalLoop every frame with the entity's position and speed.
  // -------------------------------------------------------------------------

  /**
   * Starts (or re-targets) a looping, spatialised sound for an entity.
   * `baseGain`/`maxDistance` come from the manifest via the key. Fades in
   * over 0.15 s. Safe to call when already running (updates the target).
   */
  startPositionalLoop(key: string, id: number, at: { x: number; z: number }, rate: number): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const loopKey = `${key}:${id}`;
    const existing = this.#positionalLoops.get(loopKey);
    if (existing !== undefined) {
      existing.rate = rate;
      existing.at = { x: at.x, z: at.z };
      return;
    }
    // Generation guard: a stop between now and the load resolving must not
    // let the stale continuation re-create the loop (an orphan at full gain).
    const generation = (this.#loopGenerations.get(loopKey) ?? 0) + 1;
    this.#loopGenerations.set(loopKey, generation);
    void this.#load(key).then((buffer) => {
      if (buffer === undefined || this.#disposed || this.#context === undefined) return;
      if (this.#positionalLoops.has(loopKey)) return;
      if ((this.#loopGenerations.get(loopKey) ?? 0) !== generation) return;
      const asset = AUDIO_MANIFEST_BY_KEY.get(key);
      if (asset === undefined) return;
      const baseGain = asset.gain;
      const maxDistance = asset.maxDistance ?? 50;
      const spatial = this.#spatial(at, baseGain, maxDistance, asset.refDistance ?? SPATIAL_REF_DEFAULT_METERS);
      // Do not fade a newly-created source to full gain before its first
      // listener-position update. That one-frame window made remote loops
      // briefly sound local and could be perceived as a repeat/echo on churn.
      if (spatial === undefined) return;
      const source = this.#context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = rate;
      const panner = this.#context.createStereoPanner();
      panner.pan.value = spatial.pan;
      const gain = this.#context.createGain();
      gain.gain.value = 0;
      source.connect(panner).connect(gain).connect(this.#sfxGain ?? this.#context.destination);
      source.start();
      gain.gain.setTargetAtTime(spatial.gain, this.#context.currentTime, 0.08);
      this.#positionalLoops.set(loopKey, { key, id, source, gain, panner, rate, at: { x: at.x, z: at.z } });
    });
  }

  /** Repositions and re-rates a positional loop; also refines its spatial gain. */
  updatePositionalLoop(key: string, id: number, at: { x: number; z: number }, rate: number): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running") return;
    const loop = this.#positionalLoops.get(`${key}:${id}`);
    if (loop === undefined) return;
    loop.at = { x: at.x, z: at.z };
    const asset = AUDIO_MANIFEST_BY_KEY.get(key);
    const baseGain = asset?.gain ?? 0.5;
    const maxDistance = asset?.maxDistance ?? 50;
    const spatial = this.#spatial(at, baseGain, maxDistance, asset?.refDistance ?? SPATIAL_REF_DEFAULT_METERS);
    const targetGain = spatial === undefined ? 0 : spatial.gain;
    const now = context.currentTime;
    if (spatial !== undefined) loop.panner.pan.setTargetAtTime(spatial.pan, now, 0.08);
    loop.gain.gain.setTargetAtTime(targetGain, now, 0.08);
    if (loop.rate !== rate) {
      loop.rate = rate;
      loop.source.playbackRate.setTargetAtTime(rate, now, 0.08);
    }
  }

  /** Fades out and stops a positional loop; returns true when one was running. */
  stopPositionalLoop(key: string, id: number): boolean {
    const context = this.#context;
    const loopKey = `${key}:${id}`;
    const loop = this.#positionalLoops.get(loopKey);
    // Invalidate any in-flight start for this slot.
    this.#loopGenerations.set(loopKey, (this.#loopGenerations.get(loopKey) ?? 0) + 1);
    if (loop === undefined) return false;
    this.#positionalLoops.delete(`${key}:${id}`);
    if (context !== undefined && context.state === "running") {
      const now = context.currentTime;
      loop.gain.gain.setTargetAtTime(0, now, 0.06);
      const source = loop.source;
      window.setTimeout(() => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        loop.gain.disconnect();
        loop.panner.disconnect();
      }, 120);
    } else {
      try {
        loop.source.stop();
      } catch {
        // already stopped
      }
      loop.gain.disconnect();
      loop.panner.disconnect();
    }
    return true;
  }

  /** Stops every positional loop (dispose / round reset). */
  stopAllPositionalLoops(): void {
    for (const loop of this.#positionalLoops.values()) {
      this.stopPositionalLoop(loop.key, loop.id);
    }
    this.#positionalLoops.clear();
  }

  /**
   * Dev-only (Phase 8e-0): a point-in-time count of every live voice family —
   * one-shots by key, positional loops by key+entity id, ambient loops with
   * their gain targets, and in-flight sample loads. Allocates only when
   * called; wired to `window.__audioDebug` by GameClient in dev builds.
   */
  debugSnapshot(): AudioDebugSnapshot {
    const positionalLoops: { key: string; id: number }[] = [];
    for (const loop of this.#positionalLoops.values()) positionalLoops.push({ key: loop.key, id: loop.id });
    const ambientLoops: { key: string; target: number; applied: number }[] = [];
    for (const [key, loop] of this.#loops) ambientLoops.push({ key, target: loop.target, applied: loop.applied });
    return {
      contextState: this.#context?.state ?? "none",
      oneShotVoices: this.#voiceGate.countsByKey(),
      oneShotTotal: this.#voiceGate.totalCount(),
      voiceGroups: this.#voiceGate.countsByGroup(),
      positionalLoops,
      ambientLoops,
      pendingLoads: this.#pending.size,
      variantPlays: Object.fromEntries(this.#variantPlays),
      totalPlays: Object.fromEntries(this.#totalPlays),
      battleBed: { intensity: Math.round(this.#bedIntensity * 10) / 10, target: Math.round(this.#bedTarget * 1000) / 1000 },
      longRunners: this.#voiceGate.longRunners(performance.now(), LONG_RUNNER_GRACE_MS),
    };
  }

  // -------------------------------------------------------------------------
  // Phase 8c-6 synthesized transients (no asset files — same discipline as
  // the crossbow, bell, galley creak and stings).
  // -------------------------------------------------------------------------

  /** Torch lighting: a short lowpass noise swell with a sparkle — a flame whoosh. */
  torchIgnite(at?: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const duration = 0.28;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / context.sampleRate;
      const noise = Math.random() * 2 - 1;
      const cutoff = 400 + 1600 * Math.min(1, t / 0.12);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / context.sampleRate)) * (noise - low);
      const envelope = Math.min(1, t * 30) * Math.max(0, 1 - t / duration);
      const sparkle = (Math.random() * 2 - 1) * Math.max(0, 1 - Math.abs(t - 0.16) * 9) * 0.35;
      channel[index] = (low * 0.7 + sparkle) * envelope;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    this.#routeSpatial(context, source, at, 0.3, 30, this.#sfxGain ?? context.destination, "torch-ignite");
    source.start();
  }

  /** Torch blowing out: a quick downward lowpass noise puff. */
  torchExtinguish(at?: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const duration = 0.18;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / context.sampleRate;
      const noise = Math.random() * 2 - 1;
      const cutoff = 700 - 550 * Math.min(1, t / duration);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / context.sampleRate)) * (noise - low);
      const envelope = Math.min(1, t * 40) * Math.max(0, 1 - t / duration);
      channel[index] = low * 0.8 * envelope;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    this.#routeSpatial(context, source, at, 0.25, 30, this.#sfxGain ?? context.destination, "torch-extinguish");
    source.start();
  }

  /** Rejected earthwork placement: a dull thud against packed earth. */
  placementDenied(at?: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const startedAt = context.currentTime;
    const destination = this.#sfxGain ?? context.destination;
    let tail: AudioNode;
    let gain = 0.22;
    if (at !== undefined) {
      const spatial = this.#spatial(at, gain, 45);
      if (spatial === undefined) return;
      gain = spatial.gain;
      const panner = context.createStereoPanner();
      panner.pan.value = spatial.pan;
      tail = panner;
    } else {
      tail = destination;
    }
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(95, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(55, startedAt + 0.12);
    gainNode.gain.setValueAtTime(gain, startedAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.16);
    oscillator.connect(gainNode).connect(tail);
    if (tail !== destination) (tail as StereoPannerNode).connect(destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.2);
  }

  // Layered crossbow shot (~0.35s), synthesized once and cached:
  // (a) string snap — noise through a ~2.8kHz state-variable bandpass, ~40ms decay;
  // (b) low thunk — sine sliding 170Hz -> 120Hz, ~120ms decay;
  // (c) bolt whoosh — noise through a one-pole lowpass swept 2kHz -> 600Hz, ~150ms, quieter.
  #synthesizeCrossbow(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * CROSSBOW_SECONDS), sampleRate);
    const channel = buffer.getChannelData(0);
    const bandF = 2 * Math.sin((Math.PI * 2800) / sampleRate);
    let bandLow = 0;
    let band = 0;
    let whooshLow = 0;
    let phase = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      const noise = Math.random() * 2 - 1;
      bandLow += bandF * band;
      band += bandF * (noise - bandLow - band * 0.6);
      const snap = band * Math.exp(-t / 0.012);
      phase += (2 * Math.PI * (170 - 50 * Math.min(1, t / 0.12))) / sampleRate;
      const thunk = Math.sin(phase) * Math.exp(-t / 0.035);
      const cutoff = 2000 - 1400 * Math.min(1, t / 0.15);
      whooshLow += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - whooshLow);
      const whoosh = whooshLow * Math.min(1, t / 0.005) * Math.exp(-t / 0.05);
      const sample = snap * 1.1 + thunk * 0.7 + whoosh * 1.6;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.9 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  // Own-shot body thump (Phase 8e-1), synthesized once and cached: a low
  // sine sliding 110 Hz → 42 Hz with a short filtered-noise burst on top —
  // the "felt" low end that separates the player's own gun from remote ones.
  #synthesizeThump(context: AudioContext): AudioBuffer {
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.floor(sampleRate * OWN_SHOT_THUMP_SECONDS), sampleRate);
    const channel = buffer.getChannelData(0);
    let low = 0;
    let phase = 0;
    let peak = 0;
    for (let index = 0; index < channel.length; index += 1) {
      const t = index / sampleRate;
      phase += (2 * Math.PI * (110 - 68 * Math.min(1, t / 0.2))) / sampleRate;
      const body = Math.sin(phase) * Math.exp(-t / 0.09);
      const noise = Math.random() * 2 - 1;
      const cutoff = 500 - 380 * Math.min(1, t / 0.1);
      low += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (noise - low);
      const burst = low * Math.exp(-t / 0.03);
      const sample = body * 1.2 + burst * 0.5;
      channel[index] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    if (peak > 0.0001) {
      const scale = 0.85 / peak;
      for (let index = 0; index < channel.length; index += 1) channel[index] = (channel[index] ?? 0) * scale;
    }
    return buffer;
  }

  synthNow(frequency: number, duration: number, volume: number, type: OscillatorType = "sine"): void {
    this.synthTone(frequency, this.#context?.currentTime ?? 0, duration, volume, type);
  }

  synthTone(frequency: number, at: number, duration: number, volume: number, type: OscillatorType = "sine"): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain).connect(this.#sfxGain ?? context.destination);
    oscillator.start(at);
    oscillator.stop(at + duration);
  }

  promotionSting(): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const startedAt = context.currentTime;
    const destination = this.#sfxGain ?? context.destination;
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.frequency.setValueAtTime(120, startedAt);
    thump.frequency.exponentialRampToValueAtTime(55, startedAt + 0.35);
    thumpGain.gain.setValueAtTime(0.16, startedAt);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.45);
    thump.connect(thumpGain).connect(destination);
    thump.start(startedAt);
    thump.stop(startedAt + 0.5);
    const shimmer = context.createOscillator();
    const shimmerGain = context.createGain();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(880, startedAt + 0.12);
    shimmer.frequency.setValueAtTime(1320, startedAt + 0.28);
    shimmerGain.gain.setValueAtTime(0.05, startedAt + 0.12);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.62);
    shimmer.connect(shimmerGain).connect(destination);
    shimmer.start(startedAt + 0.12);
    shimmer.stop(startedAt + 0.65);
  }

  medalSting(tier: number): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const startedAt = context.currentTime + 0.02;
    const notes = tier >= 3 ? [523.25, 659.25, 783.99] : tier === 2 ? [523.25, 659.25] : [523.25];
    const destination = this.#sfxGain ?? context.destination;
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      if (note === undefined) continue;
      const at = startedAt + index * 0.14;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = note;
      gain.gain.setValueAtTime(0.09, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      oscillator.connect(gain).connect(destination);
      oscillator.start(at);
      oscillator.stop(at + 0.55);
    }
    const thump = context.createOscillator();
    const thumpGain = context.createGain();
    thump.frequency.setValueAtTime(110, startedAt);
    thump.frequency.exponentialRampToValueAtTime(50, startedAt + 0.3);
    thumpGain.gain.setValueAtTime(0.1, startedAt);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.4);
    thump.connect(thumpGain).connect(destination);
    thump.start(startedAt);
    thump.stop(startedAt + 0.45);
  }

  #spatial(at: { x: number; z: number }, baseGain: number, range: number, refDistance: number = SPATIAL_REF_DEFAULT_METERS): { gain: number; pan: number } | undefined {
    const listener = this.#listener();
    const dx = at.x - listener.x;
    const dz = at.z - listener.z;
    const distance = Math.hypot(dx, dz);
    const factor = spatialGainFactor(distance, refDistance, range);
    if (factor <= 0) return undefined;
    return {
      gain: baseGain * factor,
      pan: Math.max(-1, Math.min(1, (Math.cos(listener.yaw) * dx - Math.sin(listener.yaw) * dz) / Math.max(0.001, distance))),
    };
  }

  captureTick(at: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const spatial = this.#spatial(at, 0.05, 60);
    if (spatial === undefined) return;
    const startedAt = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(760, startedAt);
    oscillator.frequency.setValueAtTime(880, startedAt + 0.04);
    gain.gain.setValueAtTime(spatial.gain, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.09);
    panner.pan.value = spatial.pan;
    oscillator.connect(gain).connect(panner).connect(this.#sfxGain ?? context.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.1);
  }

  captureTaken(at: { x: number; z: number }): void {
    const context = this.#context;
    if (context === undefined || context.state !== "running" || this.#disposed) return;
    const spatial = this.#spatial(at, 0.12, 80);
    if (spatial === undefined) return;
    const startedAt = context.currentTime;
    const destination = this.#sfxGain ?? context.destination;
    const panner = context.createStereoPanner();
    panner.pan.value = spatial.pan;
    const notes: readonly number[] = [660, 990];
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      if (note === undefined) continue;
      const atTime = startedAt + index * 0.11;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = note;
      gain.gain.setValueAtTime(spatial.gain, atTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.22);
      oscillator.connect(gain).connect(panner);
      oscillator.start(atTime);
      oscillator.stop(atTime + 0.25);
    }
    panner.connect(destination);
  }

  /** Galley ambience (ADR 0045): real creak sample replaced the 8e-0 synth. */
  galleyCreak(at?: { x: number; z: number }): void {
    this.play("ship-creak", at === undefined ? {} : { at });
  }

  /** Short diegetic ship actions; all are spatial and bounded to avoid long tails. */
  galleyBoard(at: { x: number; z: number }): void {
    this.play("ship-creak", { at, volume: 0.45, durationSeconds: 0.7 });
    this.play("cloth-rustle", { at, volume: 0.25, durationSeconds: 0.55 });
  }

  galleyLeave(at: { x: number; z: number }): void {
    this.play("drop-thud", { at, volume: 0.35, durationSeconds: 0.65 });
  }

  #bellStrike(): void {
    const context = this.#context;
    if (context === undefined) return;
    const startedAt = context.currentTime;
    const destination = this.#musicGain ?? this.#masterGain ?? context.destination;
    const partials: readonly (readonly [number, number])[] = [
      [130.81, 1],
      [261.63, 0.5],
      [361.63, 0.28],
      [523.25, 0.12],
    ];
    for (const [frequency, weight] of partials) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.045 * weight, startedAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 3.2);
      oscillator.connect(gain).connect(destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + 3.4);
    }
  }

  #startDrone(): void {
    const context = this.#context;
    if (context === undefined || this.#drone !== undefined) return;
    const destination = this.#musicGain ?? this.#masterGain ?? context.destination;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    const gain = context.createGain();
    gain.gain.value = 0.024;
    const oscillators: OscillatorNode[] = [];
    for (const frequency of [98, 98.7, 196]) {
      const oscillator = context.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      oscillator.connect(filter);
      oscillator.start();
      oscillators.push(oscillator);
    }
    filter.connect(gain).connect(destination);
    this.#drone = { oscillators, filter, gain };
  }

  #stopDrone(): void {
    if (this.#drone === undefined) return;
    for (const oscillator of this.#drone.oscillators) oscillator.stop();
    this.#drone.filter.disconnect();
    this.#drone.gain.disconnect();
    this.#drone = undefined;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopDrone();
    this.#stopBattleBed();
    for (const loop of this.#loops.values()) {
      loop.gain.disconnect();
    }
    this.#loops.clear();
    this.stopAllPositionalLoops();
    void this.#context?.close();
    this.#context = undefined;
  }
}

// ---------------------------------------------------------------------------
// Phase 8e-10 Task 3: distance gain curve. The old curve — baseGain ×
// (1 - d/maxDistance)² — kept the whole mid-band loud (a 40 m shot still
// played at 54% of base), which stacked into the "everything loud" wall the
// owner reported. The replacement is the classic inverse-distance law with a
// reference distance: full gain inside refDistance, baseGain × ref/d beyond
// it, and a smooth quadratic fade over the last 15% of maxDistance so the
// hard cutoff stays inaudible (a voice pops in at ~1% of base, not ~9%).
// Pure and allocation-free; unit-tested in audioSurface.test.ts.
// ---------------------------------------------------------------------------

/** Default full-gain radius for positional voices without a manifest ref. */
export const SPATIAL_REF_DEFAULT_METERS = 10;
/** Fraction of maxDistance where the boundary fade-out starts. */
export const SPATIAL_EDGE_FADE_FRACTION = 0.85;

/** Gain factor 0..1 for a positional voice at `distanceMeters`. */
export function spatialGainFactor(distanceMeters: number, refDistanceMeters: number, maxDistanceMeters: number): number {
  if (distanceMeters >= maxDistanceMeters || maxDistanceMeters <= 0) return 0;
  const inverse = distanceMeters <= refDistanceMeters ? 1 : refDistanceMeters / distanceMeters;
  const fadeStart = maxDistanceMeters * SPATIAL_EDGE_FADE_FRACTION;
  if (distanceMeters <= fadeStart) return inverse;
  const t = (distanceMeters - fadeStart) / (maxDistanceMeters - fadeStart);
  return inverse * (1 - t) * (1 - t);
}

/**
 * Phase 8e-25: the near-shore ambience level. The caller streams a proximity
 * fraction every frame (0..1) even outside active rounds, so the ambient
 * layer gate lives in this shared function: during Victory/Intermission the
 * bed is silent with the rest of the ambience, and reactivation re-applies
 * the last stored proximity.
 */
export function shoreLevelFor(ambientActive: boolean, proximityFraction: number, baseGain: number): number {
  const fraction = Math.min(1, Math.max(0, proximityFraction));
  return (ambientActive ? fraction : 0) * baseGain;
}

// ---------------------------------------------------------------------------
// Phase 8e-10 Task 3: footstep cadence + the dirt surface. Steps are spaced
// by STRIDE/speed (walked meters per step), clamped so a top-speed walk never
// machine-guns and a slow wade never goes silent. "dirt" is the worn-road
// surface: ROAD_PATHS centerlines from biomes (the same data the 8e-5 dirt
// decals render), checked only when the ground is otherwise grass — stone
// streets, decks, and water keep their own sounds.
// ---------------------------------------------------------------------------

export const FOOTSTEP_STRIDE_METERS = 1.9;
export const FOOTSTEP_MIN_INTERVAL_SECONDS = 0.3;
export const FOOTSTEP_MAX_INTERVAL_SECONDS = 0.7;
/**
 * Phase 8e-19 Task 2: walk-only movement — the run sample never plays. No
 * infantry speed reaches a threshold any more (MAX_SPEED 6.8 IS the walk
 * speed), so grass always uses the walk sample and the cadence math below
 * spaces steps by the walk stride at every speed.
 */
export const FOOTSTEP_RUN_MIN_SPEED = Number.POSITIVE_INFINITY;
/** Road centerline half-width that counts as walking on dirt (roads are 3.5–5 m wide). */
const ROAD_DIRT_HALF_WIDTH_METERS = 2.2;

export function footstepIntervalSeconds(speedMetersPerSecond: number): number {
  if (speedMetersPerSecond <= 0.1) return FOOTSTEP_MAX_INTERVAL_SECONDS;
  return Math.min(
    FOOTSTEP_MAX_INTERVAL_SECONDS,
    Math.max(FOOTSTEP_MIN_INTERVAL_SECONDS, FOOTSTEP_STRIDE_METERS / speedMetersPerSecond),
  );
}

export type FootstepSurface = "water" | "stone" | "wood" | "grass" | "dirt";

export function footstepSurfaceAt(x: number, z: number): FootstepSurface {
  const surface = surfaceAt(x, z);
  if (surface === "grass" && distanceToRoads(x, z) <= ROAD_DIRT_HALF_WIDTH_METERS) return "dirt";
  return surface;
}

/**
 * Footstep surface from the shared map geometry (Phase 8c-6). The previous
 * version duplicated world facts as hardcoded coordinate bands that
 * predated the 8c-4 expansion and the 8c-4b river: piers and bridge decks
 * played water/grass, the river channel played grass, and the stone-walled
 * inner city played grass. Now it consumes `shared/src/map.ts` directly —
 * deck before water (piers sit inside the water band), shallow/deep water
 * via the shared tests, stone for the wall lane and the inner-city streets,
 * grass everywhere else. Pure and O(1)-ish per footstep.
 */
export function surfaceAt(x: number, z: number): "water" | "stone" | "wood" | "grass" {
  if (onDeck(x, z)) return "wood";
  if (inShallowWater(x, z) || inDeepWater(x, z)) return "water";
  if (Math.abs(z) <= STONE_WALL_Z_HALF) return "stone";
  if (z >= INNER_CITY_BOUNDS.minZ && z <= INNER_CITY_BOUNDS.maxZ && Math.abs(x) <= INNER_CITY_BOUNDS.halfX) return "stone";
  return "grass";
}

export function shotSoundForClass(playerClass: PlayerClass): "arquebus" | "crossbow" {
  return rangedWeaponForClass(playerClass, Team.None).id === WeaponType.Crossbow ? "crossbow" : "arquebus";
}

// Bakes an equal-power crossfade into the loop seam: the tail beyond the new
// loop length fades out (cos) while the head fades in (sin), and the blend is
// written over the first `fade` samples. The result is `fade` samples shorter
// and loops with plain `loop = true` without a click.
function bakeLoopCrossfade(context: AudioContext, source: AudioBuffer): AudioBuffer {
  const fade = Math.min(Math.floor(source.sampleRate * LOOP_CROSSFADE_SECONDS), Math.floor(source.length / 2));
  if (fade < 1) return source;
  const length = source.length - fade;
  const output = context.createBuffer(source.numberOfChannels, length, source.sampleRate);
  for (let channelIndex = 0; channelIndex < source.numberOfChannels; channelIndex += 1) {
    const input = source.getChannelData(channelIndex);
    const out = output.getChannelData(channelIndex);
    for (let index = 0; index < length; index += 1) out[index] = input[index] ?? 0;
    for (let k = 0; k < fade; k += 1) {
      const t = k / fade;
      out[k] = (input[length + k] ?? 0) * Math.cos((t * Math.PI) / 2) + (input[k] ?? 0) * Math.sin((t * Math.PI) / 2);
    }
  }
  return output;
}
