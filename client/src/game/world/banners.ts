import * as THREE from "three";
import { Team } from "@janissary/shared";

/**
 * CapturePointVisuals — diegetic capture-point ownership markers.
 *
 * Each capture point gets a physical banner in the world (visual bible:
 * faction heraldry, not HUD chrome, carries ownership in 3D):
 *
 *  - Wooden pole (~4 m, dark wood) with a horizontal crossbar near the top
 *    and a small finial sphere tinted with the current owner's accent color
 *    (the "banner accent" that setPalette also swaps).
 *  - A cloth pennant (~1.3 × 0.85 m) hung from the crossbar. The cloth face
 *    is a canvas texture generated ONCE per faction at 128×96:
 *      · Ottoman   — gold crescent-and-star on a deep-red field, gold border;
 *      · Byzantine — gold double-headed eagle on an imperial-purple field,
 *                    gold border;
 *      · neutral   — plain desaturated stone grey with a simple gold ring.
 *    Motifs are bold filled silhouettes so they stay readable at 10–20 m.
 *  - One THREE.PointLight per point (3 total, no shadows, distance 20,
 *    decay 2) hovering ~3.5 m above the point as the "ownership glow":
 *    intensity ~0 neutral / ~7 owned / pulsing when contested.
 *  - The pre-existing flat ground disc (passed in by the caller) is retinted
 *    to match: neutral = dim stone #8b877d @ opacity ~0.18, owned = faction
 *    color @ ~0.3. Disc materials are CLONED here so retinting one point
 *    never bleeds into another that shares the source material.
 *
 * Ownership colors match the minimap exactly: Ottoman #e0695c (amber-red
 * family), Byzantine #9a7bd8 (purple-gold family), neutral/contested =
 * desaturated stone #8b877d.
 *
 * Transitions ANIMATE, never snap: an owner change plays a ~0.6 s
 * dip-and-rise scale swap on the pennant (texture flips at the bottom of
 * the dip) while the glow color+intensity, disc color+opacity and finial
 * accent tween over ~0.8 s with ease-out cubic. Contested (owner None but
 * progress ≠ 0) layers a gentle ~1.6 Hz sine pulse on glow intensity and
 * disc opacity.
 *
 * The banner sits at the point's edge — offset (radius*0.55, 0) rotated by
 * point index so multiple banners fan out instead of lining up — and the
 * cloth waves gently with two summed sines (±4° swing + slighter twist).
 *
 * Perf: all geometry is shared across points; textures are generated once
 * (regenerated only by setPalette); every tween lerps into pre-allocated
 * THREE.Color scratch fields — update() performs zero per-frame allocation.
 */

export interface CapturePointState {
  readonly owner: Team;
  /** Capture progress 0–100. */
  readonly progress: number;
}

const POLE_HEIGHT = 4;
const CLOTH_WIDTH = 1.3;
const CLOTH_HEIGHT = 0.85;
const CROSSBAR_Y = 3.7;
const LIGHT_HEIGHT = 3.5;
const EDGE_OFFSET_FACTOR = 0.55;

const NEUTRAL_COLOR = "#8b877d";
const GOLD_COLOR = "#e8c266";
const DEFAULT_OTTOMAN = "#e0695c";
const DEFAULT_BYZANTINE = "#9a7bd8";

const OWNED_INTENSITY = 7;
const NEUTRAL_DISC_OPACITY = 0.18;
const OWNED_DISC_OPACITY = 0.3;

const SWAP_DURATION = 0.6;
const TWEEN_DURATION = 0.8;
const CONTESTED_HZ = 1.6;
const CONTESTED_BASE_INTENSITY = 3.2;
const CONTESTED_PULSE_INTENSITY = 1.6;
const CONTESTED_BASE_OPACITY = 0.24;
const CONTESTED_PULSE_OPACITY = 0.08;
const WAVE_AMPLITUDE = THREE.MathUtils.degToRad(4);
const MAX_DT = 0.1;

const TEXTURE_WIDTH = 128;
const TEXTURE_HEIGHT = 96;

/** Darkens a "#rrggbb" hex string by `factor` — no color-management round-trip. */
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function easeOutCubic(k: number): number {
  const inv = 1 - k;
  return 1 - inv * inv * inv;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Gold crescent-and-star on a deep field derived from the faction accent. */
function drawCrescentAndStar(ctx: CanvasRenderingContext2D, field: string): void {
  ctx.fillStyle = GOLD_COLOR;
  ctx.beginPath();
  ctx.arc(50, 48, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.arc(59, 48, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD_COLOR;
  drawStar(ctx, 88, 48, 13, 5.5);
}

/** Bold gold double-headed eagle silhouette (heads, spread wings, tail fan). */
function drawDoubleEagle(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = GOLD_COLOR;

  // Left wing — broad sweep up and out with a notched trailing edge.
  ctx.beginPath();
  ctx.moveTo(58, 42);
  ctx.quadraticCurveTo(38, 24, 16, 20);
  ctx.quadraticCurveTo(24, 38, 22, 52);
  ctx.quadraticCurveTo(32, 50, 36, 58);
  ctx.quadraticCurveTo(46, 56, 56, 60);
  ctx.closePath();
  ctx.fill();

  // Right wing — mirror.
  ctx.beginPath();
  ctx.moveTo(70, 42);
  ctx.quadraticCurveTo(90, 24, 112, 20);
  ctx.quadraticCurveTo(104, 38, 106, 52);
  ctx.quadraticCurveTo(96, 50, 92, 58);
  ctx.quadraticCurveTo(82, 56, 72, 60);
  ctx.closePath();
  ctx.fill();

  // Body.
  ctx.beginPath();
  ctx.ellipse(64, 52, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Necks + outward-facing heads with beaks.
  for (const side of [-1, 1]) {
    const headX = 64 + side * 11;
    ctx.beginPath();
    ctx.moveTo(64, 46);
    ctx.lineTo(headX, 36);
    ctx.lineTo(headX + side * 4, 40);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(headX, 30, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headX + side * 3, 28);
    ctx.lineTo(headX + side * 10, 31);
    ctx.lineTo(headX + side * 3, 34);
    ctx.closePath();
    ctx.fill();
  }

  // Tail fan.
  ctx.beginPath();
  ctx.moveTo(58, 64);
  ctx.lineTo(50, 86);
  ctx.lineTo(58, 80);
  ctx.lineTo(64, 88);
  ctx.lineTo(70, 80);
  ctx.lineTo(78, 86);
  ctx.lineTo(70, 64);
  ctx.closePath();
  ctx.fill();
}

function makeBannerTexture(team: Team, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("CapturePointVisuals: 2D canvas context unavailable");
  }

  if (team === Team.None) {
    // Neutral: plain desaturated stone with a simple gold ring.
    ctx.fillStyle = NEUTRAL_COLOR;
    ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.strokeStyle = shade(NEUTRAL_COLOR, 0.8);
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, TEXTURE_WIDTH - 6, TEXTURE_HEIGHT - 6);
    ctx.strokeStyle = GOLD_COLOR;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2, 22, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Faction: deep field shaded from the accent, gold border, gold motif.
    const field = shade(accentHex, 0.5);
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    ctx.strokeStyle = GOLD_COLOR;
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, TEXTURE_WIDTH - 10, TEXTURE_HEIGHT - 10);
    if (team === Team.Ottoman) drawCrescentAndStar(ctx, field);
    else drawDoubleEagle(ctx);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface PointRecord {
  readonly group: THREE.Group;
  readonly clothPivot: THREE.Group;
  readonly clothMaterial: THREE.MeshBasicMaterial;
  readonly accentMaterial: THREE.MeshStandardMaterial;
  readonly light: THREE.PointLight;
  readonly discMaterial: THREE.MeshBasicMaterial | null;
  readonly phase: number;
  owner: Team;
  progress: number;
  initialized: boolean;
  /** Faction whose texture is currently on the cloth (lags owner mid-swap). */
  displayedTeam: Team;
  swapT: number;
  swapApplied: boolean;
  tweenT: number;
  readonly fromLightColor: THREE.Color;
  readonly toLightColor: THREE.Color;
  fromIntensity: number;
  toIntensity: number;
  readonly fromDiscColor: THREE.Color;
  readonly toDiscColor: THREE.Color;
  fromDiscOpacity: number;
  toDiscOpacity: number;
  readonly fromAccentColor: THREE.Color;
  readonly toAccentColor: THREE.Color;
}

export class CapturePointVisuals {
  private readonly scene: THREE.Scene;
  private readonly points: PointRecord[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly woodMaterial: THREE.MeshStandardMaterial;
  private ottomanTexture: THREE.CanvasTexture;
  private byzantineTexture: THREE.CanvasTexture;
  private readonly neutralTexture: THREE.CanvasTexture;
  private ottomanHex = DEFAULT_OTTOMAN;
  private byzantineHex = DEFAULT_BYZANTINE;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    points: readonly { x: number; z: number; radius: number }[],
    discs: readonly THREE.Mesh[],
  ) {
    this.scene = scene;
    this.ottomanTexture = makeBannerTexture(Team.Ottoman, this.ottomanHex);
    this.byzantineTexture = makeBannerTexture(Team.Byzantine, this.byzantineHex);
    this.neutralTexture = makeBannerTexture(Team.None, NEUTRAL_COLOR);

    // Shared geometry across all banners.
    const poleGeometry = new THREE.CylinderGeometry(0.045, 0.06, POLE_HEIGHT, 8);
    const crossbarGeometry = new THREE.CylinderGeometry(0.03, 0.03, CLOTH_WIDTH + 0.1, 6);
    const clothGeometry = new THREE.PlaneGeometry(CLOTH_WIDTH, CLOTH_HEIGHT);
    // Origin at the top edge so the pivot rotation swings the cloth like cloth.
    clothGeometry.translate(0, -CLOTH_HEIGHT / 2, 0);
    const finialGeometry = new THREE.SphereGeometry(0.09, 10, 8);
    this.geometries.push(poleGeometry, crossbarGeometry, clothGeometry, finialGeometry);

    this.woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2b1c,
      roughness: 0.9,
      metalness: 0,
    });

    const count = Math.max(points.length, 1);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (point === undefined) continue;

      // Fan the banners out: offset rotated by point index.
      const angle = (i * Math.PI * 2) / count + Math.PI / 6;
      const bannerX = point.x + Math.cos(angle) * point.radius * EDGE_OFFSET_FACTOR;
      const bannerZ = point.z + Math.sin(angle) * point.radius * EDGE_OFFSET_FACTOR;

      const group = new THREE.Group();
      group.position.set(bannerX, 0, bannerZ);
      group.rotation.y = -angle + Math.PI / 2;

      const pole = new THREE.Mesh(poleGeometry, this.woodMaterial);
      pole.position.y = POLE_HEIGHT / 2;
      group.add(pole);

      const crossbar = new THREE.Mesh(crossbarGeometry, this.woodMaterial);
      crossbar.rotation.z = Math.PI / 2;
      crossbar.position.set((CLOTH_WIDTH + 0.1) / 2, CROSSBAR_Y, 0);
      group.add(crossbar);

      const accentMaterial = new THREE.MeshStandardMaterial({
        color: NEUTRAL_COLOR,
        roughness: 0.4,
        metalness: 0.6,
      });
      const finial = new THREE.Mesh(finialGeometry, accentMaterial);
      finial.position.y = POLE_HEIGHT + 0.06;
      group.add(finial);

      const clothMaterial = new THREE.MeshBasicMaterial({
        map: this.neutralTexture,
        side: THREE.DoubleSide,
      });
      const clothPivot = new THREE.Group();
      clothPivot.position.set((CLOTH_WIDTH + 0.1) / 2, CROSSBAR_Y - 0.04, 0);
      clothPivot.add(new THREE.Mesh(clothGeometry, clothMaterial));
      group.add(clothPivot);

      scene.add(group);

      const light = new THREE.PointLight(NEUTRAL_COLOR, 0, 20, 2);
      light.position.set(point.x, LIGHT_HEIGHT, point.z);
      light.castShadow = false;
      scene.add(light);

      // Clone the disc material so per-point retinting never leaks into a
      // material shared with other discs. Cast is safe for the Basic/
      // Standard materials used on the ground discs (both carry color+opacity).
      let discMaterial: THREE.MeshBasicMaterial | null = null;
      const disc = discs[i];
      if (disc !== undefined) {
        const raw = Array.isArray(disc.material) ? disc.material[0] : disc.material;
        if (raw !== undefined) {
          discMaterial = raw.clone() as THREE.MeshBasicMaterial;
          discMaterial.transparent = true;
          disc.material = discMaterial;
        }
      }

      this.points.push({
        group,
        clothPivot,
        clothMaterial,
        accentMaterial,
        light,
        discMaterial,
        phase: i * 2.39,
        owner: Team.None,
        progress: 0,
        initialized: false,
        displayedTeam: Team.None,
        swapT: SWAP_DURATION,
        swapApplied: true,
        tweenT: TWEEN_DURATION,
        fromLightColor: new THREE.Color(NEUTRAL_COLOR),
        toLightColor: new THREE.Color(NEUTRAL_COLOR),
        fromIntensity: 0,
        toIntensity: 0,
        fromDiscColor: new THREE.Color(NEUTRAL_COLOR),
        toDiscColor: new THREE.Color(NEUTRAL_COLOR),
        fromDiscOpacity: NEUTRAL_DISC_OPACITY,
        toDiscOpacity: NEUTRAL_DISC_OPACITY,
        fromAccentColor: new THREE.Color(NEUTRAL_COLOR),
        toAccentColor: new THREE.Color(NEUTRAL_COLOR),
      });
    }
  }

  /** Per-frame update; `states[i]` corresponds to constructor `points[i]`. */
  update(dtSeconds: number, states: readonly CapturePointState[]): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_DT);
    this.time += dt;

    for (let i = 0; i < this.points.length; i += 1) {
      const point = this.points[i];
      if (point === undefined) continue;

      const state = states[i];
      if (state !== undefined) {
        point.progress = state.progress;
        if (!point.initialized) {
          // First snapshot: snap straight to the current owner, no fanfare.
          point.initialized = true;
          point.owner = state.owner;
          point.displayedTeam = state.owner;
          point.clothMaterial.map = this.textureFor(state.owner);
          point.clothMaterial.needsUpdate = true;
          this.retarget(point, true);
        } else if (state.owner !== point.owner) {
          point.owner = state.owner;
          point.swapT = 0;
          point.swapApplied = false;
          this.retarget(point, false);
        }
      }

      this.advanceSwap(point, dt);
      this.advanceTween(point, dt);
      this.applyWave(point);
    }
  }

  /**
   * Colorblind-safe palette swap. Regenerates the two faction cloth canvases
   * once and re-blends glow / disc / finial accent colors toward the new hues.
   */
  setPalette(ottoman: string, byzantine: string): void {
    this.ottomanHex = ottoman;
    this.byzantineHex = byzantine;

    const oldOttoman = this.ottomanTexture;
    const oldByzantine = this.byzantineTexture;
    this.ottomanTexture = makeBannerTexture(Team.Ottoman, ottoman);
    this.byzantineTexture = makeBannerTexture(Team.Byzantine, byzantine);
    oldOttoman.dispose();
    oldByzantine.dispose();

    for (const point of this.points) {
      if (point.displayedTeam === Team.Ottoman) {
        point.clothMaterial.map = this.ottomanTexture;
        point.clothMaterial.needsUpdate = true;
      } else if (point.displayedTeam === Team.Byzantine) {
        point.clothMaterial.map = this.byzantineTexture;
        point.clothMaterial.needsUpdate = true;
      }
      this.retarget(point, false);
    }
  }

  dispose(): void {
    for (const point of this.points) {
      this.scene.remove(point.group, point.light);
      point.clothMaterial.dispose();
      point.accentMaterial.dispose();
      point.light.dispose();
      // We own the cloned disc materials, not the discs themselves.
      if (point.discMaterial !== null) point.discMaterial.dispose();
    }
    this.points.length = 0;
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.length = 0;
    this.woodMaterial.dispose();
    this.ottomanTexture.dispose();
    this.byzantineTexture.dispose();
    this.neutralTexture.dispose();
  }

  private textureFor(team: Team): THREE.CanvasTexture {
    if (team === Team.Ottoman) return this.ottomanTexture;
    if (team === Team.Byzantine) return this.byzantineTexture;
    return this.neutralTexture;
  }

  private colorFor(team: Team): string {
    if (team === Team.Ottoman) return this.ottomanHex;
    if (team === Team.Byzantine) return this.byzantineHex;
    return NEUTRAL_COLOR;
  }

  /**
   * Aims the glow/disc/accent tweens at the targets for the point's current
   * owner. With `snap`, current and target jump together (first snapshot).
   */
  private retarget(point: PointRecord, snap: boolean): void {
    const colorHex = this.colorFor(point.owner);
    const targetIntensity = point.owner === Team.None ? 0 : OWNED_INTENSITY;
    const targetOpacity =
      point.owner === Team.None ? NEUTRAL_DISC_OPACITY : OWNED_DISC_OPACITY;

    if (snap) {
      point.toLightColor.set(colorHex);
      point.fromLightColor.copy(point.toLightColor);
      point.light.color.copy(point.toLightColor);
      point.toIntensity = targetIntensity;
      point.fromIntensity = targetIntensity;
      point.light.intensity = targetIntensity;
      point.toDiscColor.set(colorHex);
      point.fromDiscColor.copy(point.toDiscColor);
      point.toDiscOpacity = targetOpacity;
      point.fromDiscOpacity = targetOpacity;
      point.toAccentColor.set(colorHex);
      point.fromAccentColor.copy(point.toAccentColor);
      point.accentMaterial.color.copy(point.toAccentColor);
      if (point.discMaterial !== null) {
        point.discMaterial.color.copy(point.toDiscColor);
        point.discMaterial.opacity = targetOpacity;
      }
      point.tweenT = TWEEN_DURATION;
      return;
    }

    point.fromLightColor.copy(point.light.color);
    point.toLightColor.set(colorHex);
    point.fromIntensity = point.light.intensity;
    point.toIntensity = targetIntensity;
    point.fromDiscOpacity = point.discMaterial?.opacity ?? targetOpacity;
    point.toDiscOpacity = targetOpacity;
    point.fromAccentColor.copy(point.accentMaterial.color);
    point.toAccentColor.set(colorHex);
    if (point.discMaterial !== null) {
      point.fromDiscColor.copy(point.discMaterial.color);
      point.toDiscColor.set(colorHex);
    }
    point.tweenT = 0;
  }

  /** Dip-and-rise scale swap; the cloth texture flips at the bottom of the dip. */
  private advanceSwap(point: PointRecord, dt: number): void {
    if (point.swapT >= SWAP_DURATION) {
      point.clothPivot.scale.setScalar(1);
      return;
    }
    point.swapT = Math.min(point.swapT + dt, SWAP_DURATION);

    if (!point.swapApplied && point.swapT >= SWAP_DURATION / 2) {
      point.swapApplied = true;
      point.displayedTeam = point.owner;
      point.clothMaterial.map = this.textureFor(point.owner);
      point.clothMaterial.needsUpdate = true;
    }

    const k = point.swapT / SWAP_DURATION;
    // sin(πk) is 0→1→0 across the swap: dip down, rise back with an easy curve.
    const dip = Math.sin(Math.PI * k);
    point.clothPivot.scale.setScalar(1 - 0.85 * dip);
  }

  private advanceTween(point: PointRecord, dt: number): void {
    if (point.tweenT < TWEEN_DURATION) {
      point.tweenT = Math.min(point.tweenT + dt, TWEEN_DURATION);
      const k = easeOutCubic(point.tweenT / TWEEN_DURATION);
      point.light.color.lerpColors(point.fromLightColor, point.toLightColor, k);
      point.light.intensity =
        point.fromIntensity + (point.toIntensity - point.fromIntensity) * k;
      point.accentMaterial.color.lerpColors(point.fromAccentColor, point.toAccentColor, k);
      if (point.discMaterial !== null) {
        point.discMaterial.color.lerpColors(point.fromDiscColor, point.toDiscColor, k);
        point.discMaterial.opacity =
          point.fromDiscOpacity + (point.toDiscOpacity - point.fromDiscOpacity) * k;
      }
    }

    // Contested: owner None but progress ≠ 0 — gentle ~1.6 Hz pulse.
    if (point.owner === Team.None && point.progress > 0) {
      const pulse = Math.sin(this.time * Math.PI * 2 * CONTESTED_HZ + point.phase);
      point.light.intensity = CONTESTED_BASE_INTENSITY + CONTESTED_PULSE_INTENSITY * pulse;
      if (point.discMaterial !== null) {
        point.discMaterial.opacity = CONTESTED_BASE_OPACITY + CONTESTED_PULSE_OPACITY * pulse;
      }
    }
  }

  /** Two summed sines: a ±4° swing plus a slighter twist, per-point phased. */
  private applyWave(point: PointRecord): void {
    const swing =
      Math.sin(this.time * 1.4 + point.phase) * 0.65 +
      Math.sin(this.time * 2.3 + point.phase * 1.7) * 0.35;
    point.clothPivot.rotation.z = swing * WAVE_AMPLITUDE;
    point.clothPivot.rotation.y =
      Math.sin(this.time * 1.1 + point.phase * 2.3) * WAVE_AMPLITUDE * 0.5;
  }
}
