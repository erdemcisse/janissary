import * as THREE from "three";

/**
 * Pooled CPU particle system: smoke, dust, sparks, splinters, projectile
 * trails, torch flames and hit flashes only (no blood/gore by design, per
 * the visual bible).
 *
 * Renders everything in exactly two draw calls: one THREE.Points cloud with
 * NormalBlending (smoke / dust / splinters) and one with AdditiveBlending
 * (sparks / ambient motes). Each cloud is backed by fixed-size ring-buffer
 * typed arrays; after construction, update()/burst() perform zero allocation.
 *
 * Deterministic-ish: all randomness comes from a module-level mulberry32 PRNG
 * (never Math.random), consistent with the project's sim determinism habit.
 */

export type ParticleKind =
  | "muzzleSmoke"
  | "impactDust"
  | "spark"
  | "splinter"
  | "driftSmoke"
  | "ambientDust"
  | "ballTrail"
  | "cannonTrail"
  | "torchFlame"
  | "hitMark"
  | "muzzleHaze"
  | "muzzleFlash"
  | "splash"
  | "debris"
  | "smokeColumn"
  | "muzzleLinger"
  | "dirtChunk"
  | "stoneChip"
  | "killPuff";

export type ParticleQuality = "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32)
// ---------------------------------------------------------------------------

let rngState = 0x9e3779b9;

function rand(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randRange(min: number, max: number): number {
  return min + (max - min) * rand();
}

// ---------------------------------------------------------------------------
// Per-kind tuning
// ---------------------------------------------------------------------------

const POOL_NORMAL = 0;
const POOL_ADDITIVE = 1;

/** Default alpha fade-in fraction (first 15% of life); kinds may override. */
const FADE_IN = 0.15;

interface KindSpec {
  readonly pool: 0 | 1;
  readonly maxLive: number;
  readonly lifeMin: number;
  readonly lifeMax: number;
  readonly speedMin: number;
  readonly speedMax: number;
  /** 0 = velocity purely along `dir`, 1 = purely random sphere. */
  readonly spread: number;
  /** Added to velocity.y each second (negative = falls, positive = rises). */
  readonly gravity: number;
  /** Exponential-ish velocity damping per second. */
  readonly drag: number;
  readonly sizeMin: number;
  readonly sizeMax: number;
  /** Linear size growth in world units per second of age. */
  readonly growth: number;
  /** Peak alpha at mid-life. */
  readonly alpha: number;
  /** Fraction of life spent fading in (FADE_IN for most kinds). */
  readonly fadeIn: number;
  readonly colorR: number;
  readonly colorG: number;
  readonly colorB: number;
  /** Random per-particle brightness jitter, 0..1. */
  readonly colorJitter: number;
  /** Lateral sine-drift amplitude (m/s). 0 disables drift. */
  readonly driftAmp: number;
  readonly driftFreqMin: number;
  readonly driftFreqMax: number;
}

const KIND_ORDER: readonly ParticleKind[] = [
  "muzzleSmoke",
  "impactDust",
  "spark",
  "splinter",
  "driftSmoke",
  "ambientDust",
  "ballTrail",
  "cannonTrail",
  "torchFlame",
  "hitMark",
  "muzzleHaze",
  "muzzleFlash",
  "splash",
  "debris",
  "smokeColumn",
  "muzzleLinger",
  "dirtChunk",
  "stoneChip",
  "killPuff",
];

const KIND_SPECS: Record<ParticleKind, KindSpec> = {
  // Black-powder smoke (Phase 8e-10b re-grade): powder grey-BROWN, dark.
  // Over the bright dawn sky a normal-blended puff renders as
  // (alpha × color + (1-alpha) × sky ≈ 0.75), so 8e-10's 0.30-grey at α 0.55
  // still photographed pale (~0.5). At 0.20 grey-brown and α 0.75 the core
  // lands ≈ 0.34 over sky and ≈ 0.31 over wall stone — clearly dark against
  // both — while edges keep the soft alpha falloff. Multiply blending was
  // tried and rejected (ADR 0039 §8e-10b): it collapses the cloud to a hard
  // black knot and stacks smoke-over-smoke toward black.
  muzzleSmoke: {
    pool: POOL_NORMAL, maxLive: 160,
    lifeMin: 1.4, lifeMax: 2.2,
    speedMin: 0.7, speedMax: 1.6,
    spread: 0.4,
    gravity: 0.35, drag: 2.6,
    sizeMin: 0.14, sizeMax: 0.25, growth: 0.2,
    alpha: 0.75, fadeIn: FADE_IN,
    colorR: 0.2, colorG: 0.175, colorB: 0.145, colorJitter: 0.2,
    driftAmp: 0.15, driftFreqMin: 0.8, driftFreqMax: 1.6,
  },
  // Tan/brown dust burst, falls and settles, ~0.7 s. 8e-10b: darkened into
  // the biome mud/scorch family (biomes.ts wet mud ≈ 0.42/0.38/0.31, scorch
  // ≈ 0.42-0.45) — the 0.62 tan at α 0.5 rendered near-invisible pale over
  // sky and trampled dirt. Second pass (probe pixel samples): 0.34 still
  // landed at sRGB ~150 over the dark trample lane (~90), so down to 0.22.
  impactDust: {
    pool: POOL_NORMAL, maxLive: 200,
    lifeMin: 0.45, lifeMax: 0.8,
    speedMin: 1.2, speedMax: 3.0,
    spread: 0.5,
    gravity: -5.5, drag: 2.2,
    sizeMin: 0.14, sizeMax: 0.3, growth: 0.18,
    alpha: 0.7, fadeIn: FADE_IN,
    colorR: 0.22, colorG: 0.175, colorB: 0.12, colorJitter: 0.25,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Tiny bright #f4d58d fleck, fast with gravity, ~0.35 s.
  spark: {
    pool: POOL_ADDITIVE, maxLive: 240,
    lifeMin: 0.22, lifeMax: 0.4,
    speedMin: 4, speedMax: 8,
    spread: 0.65,
    gravity: -12, drag: 0.6,
    sizeMin: 0.03, sizeMax: 0.06, growth: 0,
    alpha: 1, fadeIn: FADE_IN,
    colorR: 0.957, colorG: 0.835, colorB: 0.553, colorJitter: 0.2,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Small wood-chip brown, gravity, ~0.5 s.
  splinter: {
    pool: POOL_NORMAL, maxLive: 100,
    lifeMin: 0.35, lifeMax: 0.6,
    speedMin: 2, speedMax: 4.5,
    spread: 0.7,
    gravity: -10, drag: 1.1,
    sizeMin: 0.035, sizeMax: 0.075, growth: 0,
    alpha: 0.9, fadeIn: FADE_IN,
    colorR: 0.42, colorG: 0.3, colorB: 0.18, colorJitter: 0.3,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Large soft dark-grey smoke, slow rise + drift, 4-8 s. 8e-10b: nudged
  // darker/firmer so the battlefield smog reads as a haze veil, not glare.
  driftSmoke: {
    pool: POOL_NORMAL, maxLive: 100,
    lifeMin: 4, lifeMax: 8,
    speedMin: 0.15, speedMax: 0.45,
    spread: 1,
    gravity: 0.28, drag: 0.35,
    sizeMin: 1.2, sizeMax: 2.2, growth: 0.45,
    alpha: 0.2, fadeIn: FADE_IN,
    colorR: 0.21, colorG: 0.2, colorB: 0.18, colorJitter: 0.2,
    driftAmp: 0.3, driftFreqMin: 0.3, driftFreqMax: 0.8,
  },
  // Near-invisible warm dust motes drifting in sunbeams, 6-10 s.
  ambientDust: {
    pool: POOL_ADDITIVE, maxLive: 120,
    lifeMin: 6, lifeMax: 10,
    speedMin: 0.04, speedMax: 0.14,
    spread: 1,
    gravity: 0.015, drag: 0.1,
    sizeMin: 0.02, sizeMax: 0.05, growth: 0,
    alpha: 0.12, fadeIn: FADE_IN,
    colorR: 0.9, colorG: 0.8, colorB: 0.6, colorJitter: 0.2,
    driftAmp: 0.25, driftFreqMin: 0.4, driftFreqMax: 1,
  },
  // Small warm-grey dust puff tracing a musket ball's path, ~0.2 s. Phase
  // 8e-10: darker and fainter — the dark ball is the read, this is the wisp.
  // 8e-10b: darker still with a touch more alpha — at 0.3/α0.2 the wisp
  // rendered at ~0.66 over the sky, indistinguishable from haze.
  ballTrail: {
    pool: POOL_NORMAL, maxLive: 80,
    lifeMin: 0.15, lifeMax: 0.3,
    speedMin: 0.05, speedMax: 0.2,
    spread: 1,
    gravity: 0.1, drag: 1.5,
    sizeMin: 0.05, sizeMax: 0.1, growth: 0.25,
    alpha: 0.3, fadeIn: FADE_IN,
    colorR: 0.2, colorG: 0.18, colorB: 0.15, colorJitter: 0.2,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Larger dirty tan-grey puff trailing a cannon shell, ~0.7 s. 8e-10b:
  // same re-grade as ballTrail — the 0.5 tan read pale against the sky.
  cannonTrail: {
    pool: POOL_NORMAL, maxLive: 80,
    lifeMin: 0.5, lifeMax: 0.9,
    speedMin: 0.1, speedMax: 0.3,
    spread: 1,
    gravity: 0.15, drag: 1.2,
    sizeMin: 0.18, sizeMax: 0.32, growth: 0.3,
    alpha: 0.4, fadeIn: 0.2,
    colorR: 0.26, colorG: 0.23, colorB: 0.19, colorJitter: 0.2,
    driftAmp: 0.1, driftFreqMin: 0.8, driftFreqMax: 1.5,
  },
  // Additive orange flame tongue for torches: rises, shrinks, ~0.4 s.
  torchFlame: {
    pool: POOL_ADDITIVE, maxLive: 80,
    lifeMin: 0.3, lifeMax: 0.5,
    speedMin: 0.1, speedMax: 0.3,
    spread: 1,
    gravity: 0.9, drag: 1.0,
    sizeMin: 0.07, sizeMax: 0.13, growth: -0.08,
    alpha: 0.85, fadeIn: 0.1,
    colorR: 1.0, colorG: 0.55, colorB: 0.15, colorJitter: 0.15,
    driftAmp: 0.15, driftFreqMin: 4, driftFreqMax: 7,
  },
  // Additive crimson hit-confirmation flash on the struck point, ~0.3 s.
  hitMark: {
    pool: POOL_ADDITIVE, maxLive: 80,
    lifeMin: 0.25, lifeMax: 0.4,
    speedMin: 0.3, speedMax: 0.9,
    spread: 0.6,
    gravity: 0, drag: 3.0,
    sizeMin: 0.06, sizeMax: 0.12, growth: 0.1,
    alpha: 0.9, fadeIn: 0.05,
    colorR: 0.9, colorG: 0.12, colorB: 0.08, colorJitter: 0.15,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Very long-lived, faint, large powder haze that builds over a firing
  // line during sustained fire, 6-10 s. Phase 8e-10b: same grey-brown powder
  // family as the restyled muzzle smoke, a touch more present (α 0.12) so it
  // veils rather than vanishes against the sky.
  muzzleHaze: {
    pool: POOL_NORMAL, maxLive: 50,
    lifeMin: 6, lifeMax: 10,
    speedMin: 0.05, speedMax: 0.15,
    spread: 1,
    gravity: 0.12, drag: 0.3,
    sizeMin: 0.8, sizeMax: 1.4, growth: 0.35,
    alpha: 0.12, fadeIn: 0.3,
    colorR: 0.22, colorG: 0.2, colorB: 0.17, colorJitter: 0.15,
    driftAmp: 0.25, driftFreqMin: 0.2, driftFreqMax: 0.5,
  },
  // The first 100 ms of a black-powder shot (Phase 8e-1): a big, hot,
  // fast-expanding additive flash at the muzzle — the bright pop that makes
  // a shot readable day or night. Smoke (muzzleSmoke) is the after-story;
  // this is the event. Nearly stationary, so only growth + fade sell it.
  muzzleFlash: {
    pool: POOL_ADDITIVE, maxLive: 48,
    lifeMin: 0.07, lifeMax: 0.1,
    speedMin: 0.4, speedMax: 1.2,
    spread: 1,
    gravity: 0, drag: 4,
    sizeMin: 0.55, sizeMax: 0.85, growth: 2.4,
    alpha: 0.95, fadeIn: 0.02,
    colorR: 1.0, colorG: 0.72, colorB: 0.32, colorJitter: 0.15,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Phase 8e-9 Task 2: water splash — pale spray thrown up, fast fall, ~0.5 s.
  splash: {
    pool: POOL_NORMAL, maxLive: 64,
    lifeMin: 0.35, lifeMax: 0.6,
    speedMin: 2.2, speedMax: 4.2,
    spread: 0.45,
    gravity: -9, drag: 1.4,
    sizeMin: 0.06, sizeMax: 0.13, growth: 0.1,
    alpha: 0.65, fadeIn: FADE_IN,
    colorR: 0.78, colorG: 0.84, colorB: 0.86, colorJitter: 0.15,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Phase 8e-9 Task 3: explosion debris — small dark dirt/stone chunks
  // thrown hard with real gravity, ~0.7 s. Reads as the solid part of the
  // burst that smoke alone never sells.
  debris: {
    pool: POOL_NORMAL, maxLive: 80,
    lifeMin: 0.5, lifeMax: 0.9,
    speedMin: 5, speedMax: 10,
    spread: 0.75,
    gravity: -20, drag: 0.7,
    sizeMin: 0.05, sizeMax: 0.11, growth: 0,
    alpha: 0.9, fadeIn: FADE_IN,
    colorR: 0.17, colorG: 0.14, colorB: 0.11, colorJitter: 0.3,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Phase 8e-9 Task 3: the explosion's rising column — denser and
  // shorter-lived than driftSmoke (2.2-3.2 s), climbing on its own thermal.
  // 8e-10b: darker + firmer so the column silhouettes against the sky.
  smokeColumn: {
    pool: POOL_NORMAL, maxLive: 40,
    lifeMin: 2.2, lifeMax: 3.2,
    speedMin: 1.1, speedMax: 2.0,
    spread: 0.35,
    gravity: 0.55, drag: 1.1,
    sizeMin: 0.5, sizeMax: 0.9, growth: 0.55,
    alpha: 0.55, fadeIn: FADE_IN,
    colorR: 0.19, colorG: 0.175, colorB: 0.15, colorJitter: 0.2,
    driftAmp: 0.12, driftFreqMin: 0.5, driftFreqMax: 1.1,
  },
  // Phase 8e-9 Task 4: the puff that STAYS at the muzzle after the plume
  // (muzzleSmoke) has blown downrange — nearly still, hangs 1.5-2.5 s, drifts
  // off. This is what builds the black-powder battlefield smog over a fire
  // fight. Spawned per tier via MUZZLE_LINGER_COUNT (off on low). Phase
  // 8e-10b: darker grey-brown with firmer alpha, matching the muzzleSmoke
  // re-grade — at 0.28/α0.4 the lingering smog still photographed pale.
  muzzleLinger: {
    pool: POOL_NORMAL, maxLive: 104,
    lifeMin: 1.5, lifeMax: 2.5,
    speedMin: 0.08, speedMax: 0.25,
    spread: 1,
    gravity: 0.22, drag: 1.6,
    sizeMin: 0.14, sizeMax: 0.26, growth: 0.22,
    alpha: 0.6, fadeIn: 0.12,
    colorR: 0.19, colorG: 0.165, colorB: 0.135, colorJitter: 0.2,
    driftAmp: 0.2, driftFreqMin: 0.5, driftFreqMax: 1.1,
  },
  // Phase 8e-10 Task 2: musket-ball ground hit — the solid brown spray the
  // old single dust puff never sold. Soil chunks thrown up-fast with real
  // gravity, ~0.55 s. Pairs with an impactDust puff at the same point.
  // 8e-10b: matched to the biome wet-mud/scorch browns (biomes.ts) so the
  // spray reads as thrown soil, darker than the trampled-dirt ground.
  dirtChunk: {
    pool: POOL_NORMAL, maxLive: 120,
    lifeMin: 0.4, lifeMax: 0.7,
    speedMin: 2.5, speedMax: 5,
    spread: 0.6,
    gravity: -14, drag: 0.9,
    sizeMin: 0.05, sizeMax: 0.12, growth: 0,
    alpha: 0.95, fadeIn: FADE_IN,
    colorR: 0.27, colorG: 0.21, colorB: 0.14, colorJitter: 0.3,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Phase 8e-10 Task 2: ball-vs-wall stone chips — small grey shards off
  // the ashlar, gravity, ~0.4 s. Pairs with a little dust (and one spark).
  // 8e-10b: darker than the 0.52 pale-grey (which read white over sky) but
  // kept lighter than the powder smoke — chips are stone, not soot.
  stoneChip: {
    pool: POOL_NORMAL, maxLive: 100,
    lifeMin: 0.3, lifeMax: 0.55,
    speedMin: 2, speedMax: 4.5,
    spread: 0.7,
    gravity: -12, drag: 1.0,
    sizeMin: 0.03, sizeMax: 0.07, growth: 0,
    alpha: 0.9, fadeIn: FADE_IN,
    colorR: 0.42, colorG: 0.4, colorB: 0.36, colorJitter: 0.25,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
  // Phase 8e-10 Task 2: the kill read at distance — a brief dark burst at
  // the victim (no gore, per the visual bible). Slow sphere puff, ~0.65 s.
  // 8e-10b: dark red-brown (cloth/dust off a falling soldier), not the
  // grey-white the 0.24 neutral grey rendered over bright ground. Second
  // pass: 0.30 still read cream against the sky in the probe stills, so
  // down to 0.24 with firmer alpha.
  killPuff: {
    pool: POOL_NORMAL, maxLive: 80,
    lifeMin: 0.5, lifeMax: 0.8,
    speedMin: 0.6, speedMax: 1.5,
    spread: 1,
    gravity: 0.05, drag: 2.4,
    sizeMin: 0.16, sizeMax: 0.3, growth: 0.3,
    alpha: 0.8, fadeIn: FADE_IN,
    colorR: 0.24, colorG: 0.115, colorB: 0.085, colorJitter: 0.25,
    driftAmp: 0, driftFreqMin: 0, driftFreqMax: 0,
  },
};

// 8e-9: +splash/debris/smokeColumn/muzzleLinger. 8e-10: +dirtChunk/stoneChip/
// killPuff. Capacity is the worst-case live cap (memory + fill-rate bound),
// not the typical live count — typical load is set by spawn rates and tier
// scaling, measured in ADRs 0038/0039.
const NORMAL_CAPACITY = 160 + 200 + 100 + 100 + 80 + 80 + 50 + 64 + 80 + 40 + 104 + 120 + 100 + 80; // 1358
const ADDITIVE_CAPACITY = 240 + 120 + 80 + 80 + 48; // 568

const QUALITY_SCALE: Record<ParticleQuality, number> = {
  low: 0.4,
  medium: 0.7,
  high: 1,
};

/** Park dead particles far offscreen so they never rasterize. */
const PARKED_Y = -10000;
/** Alpha envelope: fade out over the last 40% of life. */
const FADE_OUT_START = 0.6;
/** Max particles a single emitter may spawn in one update (tab-away clamp). */
const EMITTER_CATCHUP_CAP = 4;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform float uViewportHeight;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Perspective point-size attenuation using the projection's vertical scale.
    gl_PointSize = aSize * (projectionMatrix[1][1] * uViewportHeight * 0.5) / max(0.1, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uMap;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float mask = texture2D(uMap, gl_PointCoord).a;
    float alpha = vAlpha * mask;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function createSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("ParticleSystem: 2D canvas context unavailable");
  }
  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------
// Pool (one per blend mode)
// ---------------------------------------------------------------------------

class ParticlePool {
  readonly points: THREE.Points;
  readonly capacity: number;

  readonly #positions: Float32Array;
  readonly #velX: Float32Array;
  readonly #velY: Float32Array;
  readonly #velZ: Float32Array;
  readonly #life: Float32Array;
  readonly #maxLife: Float32Array;
  readonly #size0: Float32Array;
  readonly #growth: Float32Array;
  readonly #gravity: Float32Array;
  readonly #drag: Float32Array;
  readonly #alpha0: Float32Array;
  readonly #fadeIn: Float32Array;
  readonly #driftAmp: Float32Array;
  readonly #driftFreq: Float32Array;
  readonly #driftPhase: Float32Array;
  readonly #kindIndex: Uint8Array;

  readonly #attrPosition: THREE.BufferAttribute;
  readonly #attrSize: THREE.BufferAttribute;
  readonly #attrColor: THREE.BufferAttribute;
  readonly #attrAlpha: THREE.BufferAttribute;

  #head = 0;
  #activeCapacity: number;

  constructor(capacity: number, blending: THREE.Blending, texture: THREE.Texture) {
    this.capacity = capacity;
    this.#activeCapacity = capacity;
    this.#positions = new Float32Array(capacity * 3);
    this.#velX = new Float32Array(capacity);
    this.#velY = new Float32Array(capacity);
    this.#velZ = new Float32Array(capacity);
    this.#life = new Float32Array(capacity);
    this.#maxLife = new Float32Array(capacity);
    this.#size0 = new Float32Array(capacity);
    this.#growth = new Float32Array(capacity);
    this.#gravity = new Float32Array(capacity);
    this.#drag = new Float32Array(capacity);
    this.#alpha0 = new Float32Array(capacity);
    this.#fadeIn = new Float32Array(capacity);
    this.#driftAmp = new Float32Array(capacity);
    this.#driftFreq = new Float32Array(capacity);
    this.#driftPhase = new Float32Array(capacity);
    this.#kindIndex = new Uint8Array(capacity);

    const sizes = new Float32Array(capacity);
    const colors = new Float32Array(capacity * 3);
    const alphas = new Float32Array(capacity);

    // Park every slot dead + offscreen up front.
    for (let i = 0; i < capacity; i++) {
      this.#positions[i * 3 + 1] = PARKED_Y;
    }

    const geometry = new THREE.BufferGeometry();
    this.#attrPosition = new THREE.BufferAttribute(this.#positions, 3);
    this.#attrSize = new THREE.BufferAttribute(sizes, 1);
    this.#attrColor = new THREE.BufferAttribute(colors, 3);
    this.#attrAlpha = new THREE.BufferAttribute(alphas, 1);
    for (const attr of [this.#attrPosition, this.#attrSize, this.#attrColor, this.#attrAlpha]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    geometry.setAttribute("position", this.#attrPosition);
    geometry.setAttribute("aSize", this.#attrSize);
    geometry.setAttribute("aColor", this.#attrColor);
    geometry.setAttribute("aAlpha", this.#attrAlpha);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uViewportHeight: { value: 1080 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      blending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /**
   * Claims the next ring-buffer slot (possibly still holding a live particle
   * of another kind — the caller must check `isLive`/`kindAt` first and fix
   * its per-kind counts). Returns -1 when the kind is at its live cap.
   */
  claim(liveCount: number, maxLive: number): number {
    if (liveCount >= maxLive) return -1;
    const slot = this.#head;
    this.#head = (this.#head + 1) % this.#activeCapacity;
    return slot;
  }

  kindAt(slot: number): number {
    return this.#kindIndex[slot]!;
  }

  isLive(slot: number): boolean {
    return this.#life[slot]! > 0;
  }

  write(
    slot: number,
    spec: KindSpec,
    kindIdx: number,
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
  ): void {
    const life = randRange(spec.lifeMin, spec.lifeMax);
    this.#life[slot] = life;
    this.#maxLife[slot] = life;
    this.#positions[slot * 3] = x;
    this.#positions[slot * 3 + 1] = y;
    this.#positions[slot * 3 + 2] = z;
    this.#velX[slot] = vx;
    this.#velY[slot] = vy;
    this.#velZ[slot] = vz;
    this.#size0[slot] = randRange(spec.sizeMin, spec.sizeMax);
    this.#growth[slot] = spec.growth;
    this.#gravity[slot] = spec.gravity;
    this.#drag[slot] = spec.drag;
    this.#alpha0[slot] = spec.alpha;
    this.#fadeIn[slot] = spec.fadeIn;
    this.#driftAmp[slot] = spec.driftAmp;
    this.#driftFreq[slot] = randRange(spec.driftFreqMin, spec.driftFreqMax);
    this.#driftPhase[slot] = rand() * Math.PI * 2;
    this.#kindIndex[slot] = kindIdx;

    const shade = 1 - spec.colorJitter * 0.5 + spec.colorJitter * rand();
    this.#attrColor.array[slot * 3] = spec.colorR * shade;
    this.#attrColor.array[slot * 3 + 1] = spec.colorG * shade;
    this.#attrColor.array[slot * 3 + 2] = spec.colorB * shade;
    this.#attrColor.needsUpdate = true;
  }

  /**
   * Integrates all live particles. Returns via `deadKinds` (a reusable array)
   * how many particles of each kind died this step, so the caller can keep
   * per-kind live counts without allocating.
   */
  integrate(dt: number, deadKinds: Int32Array): void {
    const positions = this.#positions;
    const sizes = this.#attrSize.array as Float32Array;
    const alphas = this.#attrAlpha.array as Float32Array;
    const cap = this.#activeCapacity;

    for (let i = 0; i < cap; i++) {
      let life = this.#life[i]!;
      if (life <= 0) continue;

      life -= dt;
      if (life <= 0) {
        this.#life[i] = 0;
        positions[i * 3 + 1] = PARKED_Y;
        alphas[i] = 0;
        deadKinds[this.#kindIndex[i]!] = deadKinds[this.#kindIndex[i]!]! + 1;
        continue;
      }
      this.#life[i] = life;

      const maxLife = this.#maxLife[i]!;
      const age = maxLife - life;
      const ageFrac = age / maxLife;

      // Velocity: drag, gravity/buoyancy, optional lateral sine drift.
      // Phase 8c-5b: exponential drag (exp(-drag*dt)) instead of the
      // (1 - drag*dt) approximation — the linear form left trajectories
      // frame-rate dependent (different per-step damping at 25 vs 60 fps).
      const damping = Math.exp(-this.#drag[i]! * dt);
      let vx = this.#velX[i]! * damping;
      let vy = this.#velY[i]! * damping + this.#gravity[i]! * dt;
      let vz = this.#velZ[i]! * damping;
      const driftAmp = this.#driftAmp[i]!;
      if (driftAmp > 0) {
        const drift = Math.sin(age * this.#driftFreq[i]! + this.#driftPhase[i]!) * driftAmp * dt;
        vx += drift;
        vz += drift * 0.7;
      }
      this.#velX[i] = vx;
      this.#velY[i] = vy;
      this.#velZ[i] = vz;

      positions[i * 3] = positions[i * 3]! + vx * dt;
      positions[i * 3 + 1] = positions[i * 3 + 1]! + vy * dt;
      positions[i * 3 + 2] = positions[i * 3 + 2]! + vz * dt;

      // Alpha envelope: in over the kind's fade-in fraction, hold, out over
      // the last 40%.
      const fadeIn = this.#fadeIn[i]!;
      let envelope = 1;
      if (ageFrac < fadeIn) {
        envelope = ageFrac / fadeIn;
      } else if (ageFrac > FADE_OUT_START) {
        envelope = 1 - (ageFrac - FADE_OUT_START) / (1 - FADE_OUT_START);
      }
      alphas[i] = this.#alpha0[i]! * envelope;
      sizes[i] = this.#size0[i]! + this.#growth[i]! * age;
    }

    this.#attrPosition.needsUpdate = true;
    this.#attrSize.needsUpdate = true;
    this.#attrAlpha.needsUpdate = true;
  }

  /** Shrinks/expands the CPU integration ring for a graphics tier. */
  setActiveCapacity(capacity: number, deadKinds: Int32Array): void {
    const next = Math.max(1, Math.min(this.capacity, Math.floor(capacity)));
    if (next < this.#activeCapacity) {
      for (let slot = next; slot < this.#activeCapacity; slot += 1) {
        if (this.#life[slot]! <= 0) continue;
        this.#life[slot] = 0;
        this.#positions[slot * 3 + 1] = PARKED_Y;
        this.#attrAlpha.array[slot] = 0;
        deadKinds[this.#kindIndex[slot]!] = deadKinds[this.#kindIndex[slot]!]! + 1;
      }
      this.#attrAlpha.needsUpdate = true;
    }
    this.#activeCapacity = next;
    this.#head %= next;
  }

  setViewportHeight(height: number): void {
    const material = this.points.material as THREE.ShaderMaterial;
    material.uniforms["uViewportHeight"]!.value = height;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------
// Public system
// ---------------------------------------------------------------------------

interface Emitter {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  rate: number;
  radius: number;
  accumulator: number;
}

export class ParticleSystem {
  readonly #pools: [ParticlePool, ParticlePool];
  readonly #spriteTexture: THREE.CanvasTexture;
  readonly #emitters = new Map<string, Emitter>();
  readonly #liveCounts = new Int32Array(KIND_ORDER.length);
  readonly #deadScratch = new Int32Array(KIND_ORDER.length);
  #quality: ParticleQuality = "high";

  constructor(scene: THREE.Scene) {
    this.#spriteTexture = createSpriteTexture();
    this.#pools = [
      new ParticlePool(NORMAL_CAPACITY, THREE.NormalBlending, this.#spriteTexture),
      new ParticlePool(ADDITIVE_CAPACITY, THREE.AdditiveBlending, this.#spriteTexture),
    ];
    scene.add(this.#pools[POOL_NORMAL].points, this.#pools[POOL_ADDITIVE].points);
  }

  /**
   * One-shot spawn of `count` particles at a world position. When `dirX/Y/Z`
   * is given it biases initial velocity (shot direction for muzzle smoke, hit
   * normal for impact dust); per-kind `spread` controls how conical it is.
   */
  burst(
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    count: number,
    dirX = 0,
    dirY = 0,
    dirZ = 0,
  ): void {
    const spec = KIND_SPECS[kind];
    const scale = QUALITY_SCALE[this.#quality];
    const scaled = Math.max(1, Math.round(count * scale));

    let dx = 0;
    let dy = 0;
    let dz = 0;
    const dirLen = Math.hypot(dirX, dirY, dirZ);
    const hasDir = dirLen > 1e-5;
    if (hasDir) {
      dx = dirX / dirLen;
      dy = dirY / dirLen;
      dz = dirZ / dirLen;
    }

    for (let n = 0; n < scaled; n++) {
      this.#spawnOne(kind, spec, x, y, z, hasDir, dx, dy, dz);
    }
  }

  /** Continuous spawner at `particlesPerSecond` (quality-scaled). */
  addEmitter(
    id: string,
    kind: ParticleKind,
    x: number,
    y: number,
    z: number,
    particlesPerSecond: number,
    radius = 0.5,
  ): void {
    this.#emitters.set(id, {
      kind,
      x,
      y,
      z,
      rate: particlesPerSecond,
      radius,
      accumulator: 0,
    });
  }

  removeEmitter(id: string): void {
    this.#emitters.delete(id);
  }

  /**
   * Moves an existing emitter WITHOUT touching its spawn accumulator —
   * re-calling addEmitter with the same id would reset the accumulator and
   * starve low-rate emitters (torch flames). Returns false when the id is
   * unknown so the caller can fall back to addEmitter.
   */
  setEmitterPosition(id: string, x: number, y: number, z: number): boolean {
    const emitter = this.#emitters.get(id);
    if (emitter === undefined) return false;
    emitter.x = x;
    emitter.y = y;
    emitter.z = z;
    return true;
  }

  update(dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    // Guard against huge steps (tab-away) even for direct burst callers.
    const dt = Math.min(dtSeconds, 0.1);

    // Emitters: accumulator-based, catch-up clamped per update.
    const scale = QUALITY_SCALE[this.#quality];
    for (const emitter of this.#emitters.values()) {
      emitter.accumulator += emitter.rate * scale * dt;
      let toSpawn = Math.floor(emitter.accumulator);
      if (toSpawn <= 0) continue;
      emitter.accumulator -= toSpawn;
      if (toSpawn > EMITTER_CATCHUP_CAP) {
        toSpawn = EMITTER_CATCHUP_CAP;
        emitter.accumulator = 0;
      }
      const spec = KIND_SPECS[emitter.kind];
      for (let n = 0; n < toSpawn; n++) {
        const angle = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * emitter.radius;
        this.#spawnOne(
          emitter.kind,
          spec,
          emitter.x + Math.cos(angle) * r,
          emitter.y + randRange(-0.2, 0.2) * emitter.radius,
          emitter.z + Math.sin(angle) * r,
          false, 0, 0, 0,
        );
      }
    }

    // CPU integration for both pools; per-kind live counts stay exact.
    this.#deadScratch.fill(0);
    this.#pools[POOL_NORMAL].integrate(dt, this.#deadScratch);
    this.#pools[POOL_ADDITIVE].integrate(dt, this.#deadScratch);
    for (let k = 0; k < KIND_ORDER.length; k++) {
      this.#liveCounts[k] = this.#liveCounts[k]! - this.#deadScratch[k]!;
    }

    // Keep point-size attenuation correct if the canvas was resized.
    const viewportHeight =
      typeof window === "undefined" ? 1080 : window.innerHeight * (window.devicePixelRatio || 1);
    this.#pools[POOL_NORMAL].setViewportHeight(viewportHeight);
    this.#pools[POOL_ADDITIVE].setViewportHeight(viewportHeight);
  }

  setQuality(quality: ParticleQuality): void {
    if (quality === this.#quality) return;
    this.#quality = quality;
    const scale = QUALITY_SCALE[quality];
    this.#deadScratch.fill(0);
    this.#pools[POOL_NORMAL].setActiveCapacity(NORMAL_CAPACITY * scale, this.#deadScratch);
    this.#pools[POOL_ADDITIVE].setActiveCapacity(ADDITIVE_CAPACITY * scale, this.#deadScratch);
    for (let kind = 0; kind < KIND_ORDER.length; kind += 1) {
      this.#liveCounts[kind] = Math.max(0, this.#liveCounts[kind]! - this.#deadScratch[kind]!);
    }
  }

  dispose(): void {
    this.#emitters.clear();
    this.#pools[POOL_NORMAL].dispose();
    this.#pools[POOL_ADDITIVE].dispose();
    this.#spriteTexture.dispose();
  }

  // -------------------------------------------------------------------------

  #spawnOne(
    kind: ParticleKind,
    spec: KindSpec,
    x: number,
    y: number,
    z: number,
    hasDir: boolean,
    dx: number,
    dy: number,
    dz: number,
  ): void {
    const kindIdx = KIND_ORDER.indexOf(kind);
    const pool = this.#pools[spec.pool];
    const liveCount = this.#liveCounts[kindIdx]!;

    const maxLive = Math.max(1, Math.round(spec.maxLive * QUALITY_SCALE[this.#quality]));
    const slot = pool.claim(liveCount, maxLive);
    if (slot < 0) return;
    // A claimed ring slot may still hold a live particle of another kind;
    // steal it and keep that kind's live count exact.
    if (pool.isLive(slot)) {
      const previousKind = pool.kindAt(slot);
      this.#liveCounts[previousKind] = this.#liveCounts[previousKind]! - 1;
    }

    // Random unit vector (uniform on sphere).
    const rz = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - rz * rz));
    const rx = rr * Math.cos(theta);
    const ry = rz;
    const rzv = rr * Math.sin(theta);

    // Blend direction bias with random spread.
    const spread = spec.spread;
    let vx: number;
    let vy: number;
    let vz: number;
    if (hasDir) {
      vx = dx * (1 - spread) + rx * spread;
      vy = dy * (1 - spread) + ry * spread;
      vz = dz * (1 - spread) + rzv * spread;
      const len = Math.hypot(vx, vy, vz);
      if (len > 1e-5) {
        vx /= len;
        vy /= len;
        vz /= len;
      }
    } else {
      vx = rx;
      vy = ry;
      vz = rzv;
    }
    const speed = randRange(spec.speedMin, spec.speedMax);

    pool.write(slot, spec, kindIdx, x, y, z, vx * speed, vy * speed, vz * speed);
    this.#liveCounts[kindIdx] = liveCount + 1;
  }
}
