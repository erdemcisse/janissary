/**
 * Camera feedback for Phase 8c-2 (game feel). Adds subtle, fast-decaying
 * angular offsets on top of the input-driven base rotation: a recoil kick on
 * fire, a trauma-style shake on damage, a quiet confirmatory dip on kill, and
 * a slow eased rise + sway during the victory phase. All magnitudes follow the
 * restraint demanded by docs/design/visual-feel-bible.md — nothing here should
 * ever read as screen-shake abuse.
 *
 * Usage: call the event methods from snapshot event handling, call update(dt)
 * once per frame, then call apply(camera) immediately AFTER the input-driven
 * camera.rotation.set(...) so offsets compose with player look instead of
 * fighting it. Deterministic: fire jitter comes from a fixed-seed mulberry32,
 * damage shake from fixed-frequency sines — no Math.random anywhere.
 */
import { explosionTraumaForDistance } from "./combatFeel";

/** Minimal structural camera shape; THREE.PerspectiveCamera satisfies it. */
export interface CameraFeelTarget {
  rotation: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
}

// Recoil spring: omega = 45 rad/s, zeta = 0.9 (slight underdamp for snap, no
// visible overshoot). Envelope decays e^(-40.5 t) -> back at rest in ~120 ms.
const RECOIL_STIFFNESS = 2025;
const RECOIL_DAMPING = 81;
const RECOIL_OMEGA = 45;
const RECOIL_PITCH_IMPULSE = 3.2; // rad/s kick, peaks at ~0.019 rad pitch-up
const RECOIL_YAW_IMPULSE = 0.6; // tiny deterministic side jitter (~0.001 rad)

// Kill confirm: same spring family, omega = 50 rad/s, zeta = 0.95, much
// quieter than fire — a small downward dip that settles in ~80 ms.
const KILL_STIFFNESS = 2500;
const KILL_DAMPING = 95;
const KILL_OMEGA = 50;
const KILL_PITCH_IMPULSE = 0.6; // peaks at ~0.0045 rad downward

// Damage trauma: each hit adds trauma (clamped to 1) which decays linearly
// over ~250 ms; shake amplitude follows trauma^2 so single hits stay subtle
// (~0.0036 rad) and only overlapping hits approach the 0.012 rad cap.
const TRAUMA_PER_HIT = 0.55;
const TRAUMA_DECAY_PER_SECOND = 4;
const SHAKE_AMPLITUDE_RAD = 0.012;
const SHAKE_PITCH_BIAS_RAD = 0.005; // slight downward settle while hurt
// Incommensurate angular frequencies (rad/s) so the shake feels organic and
// never visibly loops within its 250 ms life.
const SHAKE_FREQ_PITCH_A = 71.6;
const SHAKE_FREQ_PITCH_B = 113.4;
const SHAKE_FREQ_YAW_A = 83.1;
const SHAKE_FREQ_YAW_B = 127.9;
const SHAKE_FREQ_ROLL_A = 97.7;
const SHAKE_FREQ_ROLL_B = 149.3;

// Wall breach (siege loop §2.6): a nearby collapse adds distance-scaled
// trauma — full strength inside BREACH_FULL_SHAKE_M, fading linearly to
// nothing at BREACH_SHAKE_RANGE_M. Reuses the damage shake machinery, so a
// breach reads as a heavier, longer version of being hit.
const BREACH_FULL_SHAKE_M = 15;
const BREACH_SHAKE_RANGE_M = 40;

// Victory moment: offsets blend in/out over 1.5 s; while active the camera
// rises 2.5 m over 3 s (eased) with a gentle survey tilt-down and a bounded
// yaw sway peaking at ~0.042 rad/s — bounded (not a monotonic drift) so the
// offset can return cleanly to exactly zero when the phase ends.
const VICTORY_BLEND_SECONDS = 1.5;
const VICTORY_RISE_SECONDS = 3;
const VICTORY_RISE_METERS = 2.5;
const VICTORY_PITCH_RAD = -0.04;
const VICTORY_SWAY_RAD = 0.08;
const VICTORY_SWAY_PERIOD_SECONDS = 12;

// Springs snap to exact rest once the oscillation amplitude estimate
// (|x| + |v|/omega) falls below this; 1e-5 rad is two orders of magnitude
// below any perceptible offset.
const REST_AMPLITUDE = 1e-5;

// Fixed integration sub-step for every camera spring. Must stay below
// 2/max(damping) — the stiffest spring here is the kill dip (c = 95, limit
// 21 ms). 1/240 s leaves ~5x headroom and costs at most a handful of
// iterations per frame.
const SPRING_SUB_STEP = 1 / 240;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export class CameraFeel {
  #recoilPitch = 0;
  #recoilPitchVelocity = 0;
  #recoilYaw = 0;
  #recoilYawVelocity = 0;
  #killDip = 0;
  #killDipVelocity = 0;
  #trauma = 0;
  #elapsed = 0;
  #victoryActive = false;
  #victoryBlend = 0;
  #victoryTime = 0;
  readonly #jitter = mulberry32(0x9e3779b9);

  /** Weapon fired: quick pitch kick (~0.02 rad) + tiny yaw jitter, spring return ~120ms. */
  onFire(): void {
    this.#recoilPitchVelocity += RECOIL_PITCH_IMPULSE;
    this.#recoilYawVelocity += RECOIL_YAW_IMPULSE * (this.#jitter() * 2 - 1);
  }

  /** Local player took damage: brief low-intensity shake (~0.012 rad peak, ~250ms decay), slight downward pitch bias. */
  onDamage(): void {
    this.#trauma = Math.min(1, this.#trauma + TRAUMA_PER_HIT);
  }

  /** Local player got a kill: very subtle confirmatory dip/settle (~80ms), quieter than fire. */
  onKill(): void {
    this.#killDipVelocity -= KILL_PITCH_IMPULSE;
  }

  /** A wall segment breached near the local player: distance-scaled shake (full ≤15 m, silent ≥40 m). */
  onBreach(distanceMeters: number): void {
    const scale = 1 - (distanceMeters - BREACH_FULL_SHAKE_M) / (BREACH_SHAKE_RANGE_M - BREACH_FULL_SHAKE_M);
    if (scale > 0) this.#trauma = Math.min(1, this.#trauma + Math.min(1, scale));
  }

  /**
   * Phase 8e-9 Task 3: an artillery shell impacted at a distance. Reuses the
   * damage-trauma machinery with its own falloff curve (combatFeel's
   * explosionTraumaForDistance — unit-tested there). The trauma clamp to 1
   * IS the simultaneous-shake cap: a bombardment re-fills trauma faster than
   * it decays, so the shake saturates instead of stacking without bound.
   */
  onExplosion(distanceMeters: number): void {
    const trauma = explosionTraumaForDistance(distanceMeters);
    if (trauma > 0) this.#trauma = Math.min(1, this.#trauma + trauma);
  }

  /** War ended: smooth slow camera rise + gentle orbit drift while active (blend in/out over ~1.5s); hard-off resets cleanly. */
  setVictory(active: boolean): void {
    if (this.#victoryActive === active) return;
    this.#victoryActive = active;
    if (active) this.#victoryTime = 0;
  }

  update(dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
    this.#elapsed += dt;

    // Springs integrated with semi-implicit Euler at a FIXED sub-step.
    //
    // Semi-implicit Euler is only conditionally stable: the explicit damping
    // term multiplies velocity by (1 - c*dt) each step, so it diverges once
    // dt > 2/c. With RECOIL_DAMPING 81 that threshold is 24.7 ms — i.e. any
    // frame rate below ~41 fps — and KILL_DAMPING 95 diverges below ~47 fps.
    // Integrating with the raw frame delta therefore made a single shot blow
    // the camera up on slower machines (measured in playtest at 25 fps, where
    // the velocity multiplier is -2.24 per step: sign-flipping, exponentially
    // growing — the "camera spinning up and down" report).
    //
    // Sub-stepping at a fixed 1/240 s keeps every spring far inside its
    // stability limit regardless of frame rate, and makes the settle time
    // frame-rate independent as a side effect.
    let remaining = dt;
    while (remaining > 0) {
      const step = Math.min(SPRING_SUB_STEP, remaining);
      remaining -= step;
      this.#recoilPitchVelocity += (-RECOIL_STIFFNESS * this.#recoilPitch - RECOIL_DAMPING * this.#recoilPitchVelocity) * step;
      this.#recoilPitch += this.#recoilPitchVelocity * step;
      this.#recoilYawVelocity += (-RECOIL_STIFFNESS * this.#recoilYaw - RECOIL_DAMPING * this.#recoilYawVelocity) * step;
      this.#recoilYaw += this.#recoilYawVelocity * step;
      this.#killDipVelocity += (-KILL_STIFFNESS * this.#killDip - KILL_DAMPING * this.#killDipVelocity) * step;
      this.#killDip += this.#killDipVelocity * step;
    }
    if (Math.abs(this.#recoilPitch) + Math.abs(this.#recoilPitchVelocity) / RECOIL_OMEGA < REST_AMPLITUDE) {
      this.#recoilPitch = 0;
      this.#recoilPitchVelocity = 0;
    }
    if (Math.abs(this.#recoilYaw) + Math.abs(this.#recoilYawVelocity) / RECOIL_OMEGA < REST_AMPLITUDE) {
      this.#recoilYaw = 0;
      this.#recoilYawVelocity = 0;
    }
    if (Math.abs(this.#killDip) + Math.abs(this.#killDipVelocity) / KILL_OMEGA < REST_AMPLITUDE) {
      this.#killDip = 0;
      this.#killDipVelocity = 0;
    }

    if (this.#trauma > 0) this.#trauma = Math.max(0, this.#trauma - TRAUMA_DECAY_PER_SECOND * dt);

    if (this.#victoryActive) {
      this.#victoryTime += dt;
      this.#victoryBlend = Math.min(1, this.#victoryBlend + dt / VICTORY_BLEND_SECONDS);
    } else {
      this.#victoryBlend = Math.max(0, this.#victoryBlend - dt / VICTORY_BLEND_SECONDS);
      if (this.#victoryBlend === 0) this.#victoryTime = 0;
    }
  }

  /** Adds current offsets to camera.rotation (and a small victory height offset). Call AFTER the input-driven camera.rotation.set each frame. */
  apply(camera: CameraFeelTarget): void {
    let pitchOffset = this.#recoilPitch + this.#killDip;
    let yawOffset = this.#recoilYaw;
    let rollOffset = 0;
    let heightOffset = 0;

    if (this.#trauma > 0) {
      const shape = this.#trauma * this.#trauma;
      const amplitude = SHAKE_AMPLITUDE_RAD * shape;
      const t = this.#elapsed;
      pitchOffset += amplitude * (0.6 * Math.sin(t * SHAKE_FREQ_PITCH_A) + 0.4 * Math.sin(t * SHAKE_FREQ_PITCH_B + 1.7)) - SHAKE_PITCH_BIAS_RAD * shape;
      yawOffset += amplitude * (0.6 * Math.sin(t * SHAKE_FREQ_YAW_A + 4.2) + 0.4 * Math.sin(t * SHAKE_FREQ_YAW_B + 2.3));
      rollOffset += amplitude * 0.6 * (0.6 * Math.sin(t * SHAKE_FREQ_ROLL_A + 0.9) + 0.4 * Math.sin(t * SHAKE_FREQ_ROLL_B + 5.1));
    }

    if (this.#victoryBlend > 0) {
      const blend = smoothstep(this.#victoryBlend);
      const rise = smoothstep(Math.min(this.#victoryTime / VICTORY_RISE_SECONDS, 1));
      heightOffset += VICTORY_RISE_METERS * rise * blend;
      pitchOffset += VICTORY_PITCH_RAD * rise * blend;
      yawOffset += VICTORY_SWAY_RAD * Math.sin((Math.PI * 2 * this.#victoryTime) / VICTORY_SWAY_PERIOD_SECONDS) * blend;
    }

    camera.rotation.x += pitchOffset;
    camera.rotation.y += yawOffset;
    camera.rotation.z += rollOffset;
    camera.position.y += heightOffset;
  }

  dispose(): void {
    this.#recoilPitch = 0;
    this.#recoilPitchVelocity = 0;
    this.#recoilYaw = 0;
    this.#recoilYawVelocity = 0;
    this.#killDip = 0;
    this.#killDipVelocity = 0;
    this.#trauma = 0;
    this.#elapsed = 0;
    this.#victoryActive = false;
    this.#victoryBlend = 0;
    this.#victoryTime = 0;
  }
}
