import * as THREE from "three";
import { SkyRig } from "./skyRig";

/**
 * Atmosphere — bright stylized daylight, sky dome, fog, and tiered shadows.
 *
 * The full-game audit explicitly defers day/night. The former runtime opened
 * at an 18° dawn and slowly entered night, leaving walls, terrain, artillery
 * and characters nearly black below a bright sky. This module now has one
 * stable, testable daylight profile. The owner direction is a cheerful,
 * lightly cartooned battlefield: high neutral sun, blue-sky/green-ground fill,
 * clear distance fog, and saturated albedo without cinematic shadow crushing.
 *
 * SKY: scene.background is a procedural gradient dome (see skyRig.ts).
 * FogExp2 uses the exact horizon color for a seamless distance blend. Dormant
 * night assets remain invisible (`nightFactor = 0`) until a future approved
 * cycle phase.
 *
 * FOG: the 475 m hill-fort sightline retains roughly 0.86 transmittance on
 * medium at the base density, with high clearer and low modestly denser.
 *
 * OUTPUT: direct WebGLRenderer output with NeutralToneMapping. There is no
 * full-screen grade, vignette, off-screen scene target, or environment map.
 * The measured 5–8 ms post-process round trip is gone.
 *
 * AA: the context is created without MSAA (`antialias: false`). A 4x MSAA
 * default framebuffer — which the old composer path never actually used,
 * because its scene pass targeted a non-MSAA render target — costs ~39 ms
 * per frame at 1200×546 DPR 1 on the M2 Metal probe and scales with the
 * pixel-ratio caps, so it is not potato-PC viable. Edge clarity comes from
 * the per-tier pixel-ratio caps and the stylized palette instead. If the
 * owner later wants smoother edges, a single FXAA pass costs ~5–8 ms of
 * post round trip and is the documented alternative.
 *
 * QUALITY TIERS SHARE THE SAME ART DIRECTION while differing in cost and
 * clarity. Low keeps shadows off and pixel ratio 1; Medium uses a 512 shadow
 * map; High uses 1024. Renderer pixel ratio owns edge clarity (see the AA
 * note above), without an extra FXAA pass or a second full-screen sample.
 *
 * Shadows: PCFShadowMap, sun only. The ortho shadow camera is fitted to
 * the central battle area (x ±145 m, z −130..+150 m around the wall line).
 * mapSize 1024 on high, 512 on medium, fully off on low. Toggling
 * renderer.shadowMap.enabled after the first render changes the shader
 * program hash of every lit material, so we traverse the scene and flag
 * material.needsUpdate to force a one-time recompile — this avoids the
 * classic "shadows never appear / stale program" pitfall when switching
 * quality at runtime. Switching mapSize disposes the old shadow map so three
 * reallocates the depth target at the new resolution.
 *
 * Determinism & allocation: star placement uses a fixed seed in skyRig.ts.
 * render() allocates nothing; fixed colors and sun direction are reused.
 */

export type AtmosphereQuality = "low" | "medium" | "high";

export interface AtmospherePhaseDebug {
  phaseName: string;
  t: number;
  fogDensity: number;
  hemiIntensity: number;
  sunIntensity: number;
}

const FOG_QUALITY_SCALE: Record<"low" | "medium" | "high", number> = { low: 1.12, medium: 1, high: 0.82 };

const SUN_DISTANCE = 200;

export const RENDERING_PROFILE = Object.freeze({
  toneMapping: THREE.NeutralToneMapping,
  environmentReflections: false,
  postProcessingPasses: 0,
  shadowMapSize: Object.freeze({ low: 0, medium: 512, high: 1024 }),
});

export interface DaylightProfile {
  readonly phaseName: "bright-stylized-day";
  sunColor: number;
  sunIntensity: number;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  horizonColor: number;
  zenithColor: number;
  fogDensity: number;
  toneMappingExposure: number;
}

/**
 * Single source of truth for the approved bright-day presentation. Numeric
 * values are exported so tests can guard against accidentally reintroducing
 * a low sun, dim ambient fill, heavy fog, or shadow-crushing grade.
 */
export const DAYLIGHT_PROFILE: Readonly<DaylightProfile> = Object.freeze({
  phaseName: "bright-stylized-day",
  sunColor: 0xffffff,
  sunIntensity: 2,
  sunAzimuthDeg: 115,
  sunElevationDeg: 64,
  hemiSky: 0xd8efff,
  hemiGround: 0x83c97a,
  hemiIntensity: 1.05,
  ambientColor: 0xffffff,
  ambientIntensity: 0.5,
  horizonColor: 0xdceef3,
  zenithColor: 0x68a9dc,
  fogDensity: 0.00068,
  toneMappingExposure: 1.05,
});

export function daylightFogDensity(quality: AtmosphereQuality): number {
  return DAYLIGHT_PROFILE.fogDensity * FOG_QUALITY_SCALE[quality];
}

const DAYLIGHT_SUN_COLOR = new THREE.Color(DAYLIGHT_PROFILE.sunColor);
const DAYLIGHT_HEMI_SKY = new THREE.Color(DAYLIGHT_PROFILE.hemiSky);
const DAYLIGHT_HEMI_GROUND = new THREE.Color(DAYLIGHT_PROFILE.hemiGround);
const DAYLIGHT_HORIZON = new THREE.Color(DAYLIGHT_PROFILE.horizonColor);
const DAYLIGHT_ZENITH = new THREE.Color(DAYLIGHT_PROFILE.zenithColor);

const DEG2RAD = Math.PI / 180;

function markAllMaterialsForUpdate(scene: THREE.Scene): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.needsUpdate = true;
    }
  });
}

export class Atmosphere {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly skyRig: SkyRig;
  private readonly fog: THREE.FogExp2;

  private quality: AtmosphereQuality = "high";

  // Fixed normalized sun direction, also passed to the dormant moon slot in
  // SkyRig (nightFactor stays zero). Reused without per-frame allocation.
  private readonly scratchSunDirection = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // --- Sky + fog. The flat background color is replaced by the gradient
    // sky dome; fog color tracks the dome's horizon color every frame.
    scene.background = null;
    // Deliberate potato-PC contract: no IBL/environment reflection probe.
    // Water uses a cheap analytic Fresnel tint and never re-renders the scene.
    scene.environment = null;
    this.fog = new THREE.FogExp2(DAYLIGHT_PROFILE.horizonColor, daylightFogDensity(this.quality));
    scene.fog = this.fog;
    this.skyRig = new SkyRig(scene);

    // --- Direct neutral output. Unlike ACES + the old grade, Neutral keeps
    // saturated cloth/foliage close to authored colors and does not add a
    // cinematic toe that darkens ordinary midtones.
    renderer.toneMapping = RENDERING_PROFILE.toneMapping;
    renderer.toneMappingExposure = DAYLIGHT_PROFILE.toneMappingExposure;

    // --- Shadows (sun is the only caster; callers mark meshes
    // castShadow/receiveShadow themselves).
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // --- High daylight key. It is the only shadow caster.
    this.sun = new THREE.DirectionalLight(DAYLIGHT_PROFILE.sunColor, DAYLIGHT_PROFILE.sunIntensity);
    this.sun.castShadow = true;
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -145;
    shadowCamera.right = 145;
    shadowCamera.top = 150;
    shadowCamera.bottom = -130;
    shadowCamera.near = 10;
    shadowCamera.far = 450;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.8;
    this.sun.shadow.mapSize.set(RENDERING_PROFILE.shadowMapSize.high, RENDERING_PROFILE.shadowMapSize.high);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sun.target.position.set(0, 0, 0);

    // --- Bright sky/ground fill keeps shaded stone, dirt and characters legible.
    this.hemisphere = new THREE.HemisphereLight(
      DAYLIGHT_PROFILE.hemiSky,
      DAYLIGHT_PROFILE.hemiGround,
      DAYLIGHT_PROFILE.hemiIntensity,
    );
    scene.add(this.hemisphere);

    // --- Uniform daylight bounce. This inexpensive fill is deliberately
    // separate from exposure: it recovers albedo on fully shadowed wall faces,
    // dark wood, and high-metalness props without brightening the sky shader.
    this.ambient = new THREE.AmbientLight(DAYLIGHT_PROFILE.ambientColor, DAYLIGHT_PROFILE.ambientIntensity);
    scene.add(this.ambient);

    // Apply fixed daylight before the first frame.
    this.applyDaylight();
  }

  /**
   * Keeps the sky centred on the camera and renders directly. Lighting does
   * not advance with time: the audit-approved presentation is stable daylight.
   */
  render(): void {
    this.skyRig.update(
      this.camera.position,
      DAYLIGHT_HORIZON,
      DAYLIGHT_ZENITH,
      0,
      this.scratchSunDirection,
    );
    this.renderer.render(this.scene, this.camera);
  }

  /** Snapshot for ADR reporting and debug tooling. */
  getPhaseDebug(): AtmospherePhaseDebug {
    return {
      phaseName: DAYLIGHT_PROFILE.phaseName,
      t: 0,
      fogDensity: this.fog.density,
      hemiIntensity: this.hemisphere.intensity,
      sunIntensity: this.sun.intensity,
    };
  }

  /**
   * Writes the one approved daylight state into live lights, fog, and sky.
   * Called at construction and after a quality change; zero allocation.
   */
  private applyDaylight(): void {
    const azimuth = DAYLIGHT_PROFILE.sunAzimuthDeg * DEG2RAD;
    const elevation = DAYLIGHT_PROFILE.sunElevationDeg * DEG2RAD;
    const cosElevation = Math.cos(elevation);
    this.scratchSunDirection.set(
      cosElevation * Math.cos(azimuth),
      Math.sin(elevation),
      cosElevation * Math.sin(azimuth),
    );

    this.sun.position.copy(this.scratchSunDirection).multiplyScalar(SUN_DISTANCE);
    this.sun.color.copy(DAYLIGHT_SUN_COLOR);
    this.sun.intensity = DAYLIGHT_PROFILE.sunIntensity;

    // --- Hemisphere fill.
    this.hemisphere.color.copy(DAYLIGHT_HEMI_SKY);
    this.hemisphere.groundColor.copy(DAYLIGHT_HEMI_GROUND);
    this.hemisphere.intensity = DAYLIGHT_PROFILE.hemiIntensity;
    this.ambient.intensity = DAYLIGHT_PROFILE.ambientIntensity;

    // --- Sky + fog (fog color == horizon color for a seamless blend).
    this.fog.color.copy(DAYLIGHT_HORIZON);
    this.fog.density = daylightFogDensity(this.quality);
    this.skyRig.update(
      this.camera.position,
      DAYLIGHT_HORIZON,
      DAYLIGHT_ZENITH,
      0,
      this.scratchSunDirection,
    );
  }

  setQuality(quality: AtmosphereQuality): void {
    if (quality === this.quality) return;
    const shadowsWereEnabled = this.renderer.shadowMap.enabled;
    this.quality = quality;

    const shadowsEnabled = quality !== "low";
    this.sun.castShadow = shadowsEnabled;

    if (shadowsEnabled) {
      const mapSize = RENDERING_PROFILE.shadowMapSize[quality];
      if (this.sun.shadow.mapSize.x !== mapSize) {
        this.sun.shadow.mapSize.set(mapSize, mapSize);
        // Force reallocation of the depth target at the new resolution.
        if (this.sun.shadow.map !== null) {
          this.sun.shadow.map.dispose();
          this.sun.shadow.map = null;
        }
      }
    } else if (this.sun.shadow.map !== null) {
      // Low tier should release the depth target, not merely stop sampling it.
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }

    if (shadowsEnabled !== shadowsWereEnabled) {
      // Toggling shadowMap changes every lit material's shader program hash;
      // flag needsUpdate so three recompiles instead of reusing stale programs.
      this.renderer.shadowMap.enabled = shadowsEnabled;
      markAllMaterialsForUpdate(this.scene);
    }
    this.applyDaylight();
  }

  dispose(): void {
    if (this.sun.shadow.map !== null) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.scene.remove(this.sun, this.sun.target, this.hemisphere, this.ambient);
    this.sun.dispose();
    this.skyRig.dispose();
  }
}
