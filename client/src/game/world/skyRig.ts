import * as THREE from "three";

/**
 * SkyRig — procedural sky dome, star field and moon billboard.
 *
 * Owned by Atmosphere, which drives it once per frame with the current sky
 * state. The present game uses fixed daylight; stars and moon remain dormant
 * groundwork for a separately approved future cycle. Everything is procedural and every
 * per-frame update writes into pre-allocated objects — zero allocation.
 *
 * Sky dome: an inverted sphere (radius 1400, BackSide) with a two-stop
 * gradient shader (horizon → zenith). The vertex shader forces
 * gl_Position = pos.xyww, pinning the dome to the far plane, so the dome
 * works with ANY camera far plane (the game camera's far is 600, far less
 * than the dome radius — without the xyww trick the dome would be clipped
 * away entirely). depthWrite is off and renderOrder is -1, so it draws
 * first, behind everything, and fog-affected geometry blends into it
 * seamlessly (Atmosphere keeps FogExp2 color == horizon color). The dome
 * follows the camera on x/z so the horizon line stays at eye level.
 *
 * Stars: ~800 deterministic points (fixed-seed mulberry32) scattered over
 * the upper dome at radius 500 (inside the camera far plane). Additive,
 * sizeAttenuation off so they stay crisp 2 px points, opacity driven by
 * the night factor — invisible by day.
 *
 * Moon: a Sprite with a procedural radial-gradient CanvasTexture (soft
 * core + halo falloff), placed along the current moonlight direction at
 * 450 m, opacity also driven by the night factor. depthTest stays on so
 * terrain/mountains can occlude it near the horizon.
 */

const SKY_DOME_RADIUS = 1400;
const STAR_COUNT = 800;
const STAR_RADIUS = 500;
const MOON_DISTANCE = 450;
const MOON_SCALE = 48;
const STAR_SEED = 0x51ed270b;

/** Deterministic PRNG — same mulberry32 pattern used elsewhere in the client. */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const SkyDomeShader = {
  uniforms: {
    uHorizonColor: { value: new THREE.Color(0xd6c0a0) },
    uZenithColor: { value: new THREE.Color(0xa3b4c6) },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      // Object-space direction from dome centre; the dome follows the camera,
      // so this equals the view direction for gradient purposes.
      vDir = position;
      vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      // Pin to the far plane: depth == 1.0 everywhere, so the dome is never
      // clipped regardless of its radius or the camera's far plane.
      gl_Position = pos.xyww;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uHorizonColor;
    uniform vec3 uZenithColor;
    varying vec3 vDir;
    void main() {
      float h = normalize(vDir).y;
      // Horizon → zenith blend over the lower half of the sky; below the
      // horizon hold the horizon color (fog-covered ground hides it anyway).
      float t = smoothstep(0.0, 0.5, max(h, 0.0));
      vec3 color = mix(uHorizonColor, uZenithColor, t);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

function createMoonTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("SkyRig: 2D canvas context unavailable for moon texture");
  }
  // Bright core with a soft halo that fades to fully transparent at the edge.
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.28, "rgba(244, 248, 255, 1.0)");
  gradient.addColorStop(0.45, "rgba(214, 228, 250, 0.55)");
  gradient.addColorStop(0.75, "rgba(160, 185, 230, 0.12)");
  gradient.addColorStop(1.0, "rgba(140, 170, 220, 0.0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SkyRig {
  private readonly dome: THREE.Mesh;
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly starsMaterial: THREE.PointsMaterial;
  private readonly moon: THREE.Sprite;
  private readonly moonMaterial: THREE.SpriteMaterial;
  private readonly moonTexture: THREE.CanvasTexture;
  // Direct references to the dome gradient uniforms (typed record access on
  // ShaderMaterial.uniforms is possibly-undefined under noUncheckedIndexedAccess).
  private readonly domeHorizon: THREE.Color = SkyDomeShader.uniforms.uHorizonColor.value;
  private readonly domeZenith: THREE.Color = SkyDomeShader.uniforms.uZenithColor.value;

  constructor(scene: THREE.Scene) {
    // --- Gradient dome (drawn first, behind everything).
    this.domeMaterial = new THREE.ShaderMaterial({
      uniforms: SkyDomeShader.uniforms,
      vertexShader: SkyDomeShader.vertexShader,
      fragmentShader: SkyDomeShader.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const domeGeometry = new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 16);
    this.dome = new THREE.Mesh(domeGeometry, this.domeMaterial);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // --- Deterministic star field on the upper dome.
    const rng = mulberry32(STAR_SEED);
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const starWhite = new THREE.Color(0xffffff);
    const starBlue = new THREE.Color(0xaac4ff);
    const starColor = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const theta = rng() * Math.PI * 2;
      // Elevation biased to the upper sky: y in [0.06, 1].
      const y = 0.06 + 0.94 * rng();
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      positions[i * 3 + 0] = Math.cos(theta) * ring * STAR_RADIUS;
      positions[i * 3 + 1] = y * STAR_RADIUS;
      positions[i * 3 + 2] = Math.sin(theta) * ring * STAR_RADIUS;
      // Mostly white stars, some blue-shifted; slight brightness variation.
      starColor.lerpColors(starWhite, starBlue, rng());
      const brightness = 0.55 + 0.45 * rng();
      colors[i * 3 + 0] = starColor.r * brightness;
      colors[i * 3 + 1] = starColor.g * brightness;
      colors[i * 3 + 2] = starColor.b * brightness;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.starsMaterial = new THREE.PointsMaterial({
      size: 2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeometry, this.starsMaterial);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // --- Moon billboard with procedural radial texture.
    this.moonTexture = createMoonTexture();
    this.moonMaterial = new THREE.SpriteMaterial({
      map: this.moonTexture,
      color: 0xdfe9ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.scale.set(MOON_SCALE, MOON_SCALE, 1);
    scene.add(this.moon);
  }

  /**
   * Per-frame update. `horizon`/`zenith` are the current sky colors
   * (linear working space); `nightFactor` fades stars + moon in;
   * `moonDirection` is the normalized celestial-light direction used only
   * when the supplied night factor is nonzero. All writes reuse existing objects.
   */
  update(
    cameraPosition: THREE.Vector3,
    horizon: THREE.Color,
    zenith: THREE.Color,
    nightFactor: number,
    moonDirection: THREE.Vector3,
  ): void {
    // Dome and stars follow the camera on x/z (horizon stays at eye level).
    this.dome.position.set(cameraPosition.x, 0, cameraPosition.z);
    this.stars.position.copy(this.dome.position);

    this.domeHorizon.copy(horizon);
    this.domeZenith.copy(zenith);

    this.starsMaterial.opacity = nightFactor;
    this.stars.visible = nightFactor > 0.01;

    this.moonMaterial.opacity = nightFactor;
    this.moon.visible = nightFactor > 0.01;
    if (this.moon.visible) {
      this.moon.position
        .copy(moonDirection)
        .multiplyScalar(MOON_DISTANCE)
        .add(this.dome.position);
    }
  }

  dispose(): void {
    this.dome.removeFromParent();
    this.stars.removeFromParent();
    this.moon.removeFromParent();
    this.dome.geometry.dispose();
    this.domeMaterial.dispose();
    this.stars.geometry.dispose();
    this.starsMaterial.dispose();
    this.moonTexture.dispose();
    this.moonMaterial.dispose();
  }
}
