import * as THREE from "three";

const TEXTURE_SIZE = 256;

function createCanvas(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas 2D is unavailable");
  return { canvas, context };
}

function speckle(context: CanvasRenderingContext2D, count: number, alpha: number, colors: readonly [string, string]): void {
  for (let index = 0; index < count; index += 1) {
    const color = colors[Math.random() < 0.5 ? 0 : 1];
    if (color === undefined) continue;
    context.fillStyle = color;
    context.globalAlpha = alpha * (0.5 + Math.random() * 0.5);
    context.fillRect(Math.random() * TEXTURE_SIZE, Math.random() * TEXTURE_SIZE, 1, 1);
  }
  context.globalAlpha = 1;
}

function colorTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Bump maps are height data, not color — deliberately left in the default
// (linear) color space so MeshStandardMaterial.bumpMap reads raw luminance.
function bumpTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const GROUND_DETAIL_REPEAT = 144;

export interface GroundDetailTextures {
  readonly grass: { readonly map: THREE.Texture; readonly normal: THREE.Texture; readonly roughness: THREE.Texture };
}

/**
 * Owner-approved battlefield palette: photographic grain remains, but the
 * brown-dominant sparse-grass albedo is remapped to a clear spring meadow.
 * The normal map supplies fine detail while the stronger flat color block is
 * what gives the terrain its lightly cartooned, Redcoats-like readability.
 */
export const GROUND_ART_PROFILE = Object.freeze({
  grassTint: 0x5f963f,
  grassStylization: 0.92,
  grassValueFloor: 0.78,
  grassValueScale: 0.5,
  normalStrength: 0.14,
  dirtTint: 0x9b704c,
  rockTint: 0x8f9182,
});

const GROUND_ANISOTROPY_TARGET = Object.freeze({ low: 1, medium: 4, high: 8 });

export function groundAnisotropyForQuality(
  quality: "low" | "medium" | "high",
  maximum: number,
): number {
  return Math.max(1, Math.min(GROUND_ANISOTROPY_TARGET[quality], Math.floor(maximum)));
}

/** Rare settings-time update; high keeps hills sharp at grazing angles while
 * Low stays at one sample for the potato-PC contract. */
export function configureGroundDetailQuality(
  details: GroundDetailTextures,
  renderer: THREE.WebGLRenderer,
  quality: "low" | "medium" | "high",
): void {
  const anisotropy = groundAnisotropyForQuality(quality, renderer.capabilities.getMaxAnisotropy());
  for (const family of [details.grass]) {
    for (const texture of [family.map, family.normal, family.roughness]) {
      if (texture.anisotropy === anisotropy) continue;
      texture.anisotropy = anisotropy;
      // TextureLoader sets needsUpdate when the image arrives. Raising the
      // version before that point makes WebGLRenderer warn about missing data.
      const image = texture.source.data as { width?: number; height?: number } | null;
      if ((image?.width ?? 0) > 0 && (image?.height ?? 0) > 0) texture.needsUpdate = true;
    }
  }
}

/**
 * Phase 8e-15: the generated 256px canvas maps remain useful for props and
 * decals, but the battlefield ground needs real tiled surface detail. These
 * are the small, local CC0 Poly Haven maps shipped under public/textures.
 * The runtime samples one grass albedo/normal/roughness family and derives
 * stylized dirt/rock color from the same luma plus the baked biome weights.
 * That is three ground samples instead of nine at every covered pixel.
 * Color maps are sRGB; normal and roughness maps intentionally stay linear.
 */
const GROUND_DETAIL_PATHS = {
  grass: {
    map: "/textures/sparse-grass-diff-1k.jpg",
    normal: "/textures/sparse-grass-normal-1k.jpg",
    roughness: "/textures/sparse-grass-rough-1k.jpg",
  },
} as const;

type GroundDetailPath = { readonly map: string; readonly normal: string; readonly roughness: string };

function loadGroundDetailTexture(path: string, colorSpace: THREE.ColorSpace): THREE.Texture {
  const texture = new THREE.TextureLoader().load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(GROUND_DETAIL_REPEAT, GROUND_DETAIL_REPEAT);
  texture.colorSpace = colorSpace;
  return texture;
}

let cachedGroundDetailTextures: GroundDetailTextures | undefined;

export function groundDetailTextures(): GroundDetailTextures {
  if (cachedGroundDetailTextures === undefined) {
    const maps = (paths: GroundDetailPath) => ({
      map: loadGroundDetailTexture(paths.map, THREE.SRGBColorSpace),
      normal: loadGroundDetailTexture(paths.normal, THREE.NoColorSpace),
      roughness: loadGroundDetailTexture(paths.roughness, THREE.NoColorSpace),
    });
    cachedGroundDetailTextures = {
      grass: maps(GROUND_DETAIL_PATHS.grass),
    };
  }
  return cachedGroundDetailTextures;
}

/**
 * MeshStandardMaterial with one ground draw and three total texture samples.
 * `groundBlend` is baked per vertex by biomes.ts as grass/dirt/rock weights;
 * the single CC0 grass albedo's luma drives three stylized color blocks. The
 * existing vertex color still multiplies the result, so named biome wear and
 * variation remain authoritative without nine full-screen samples.
 */
export function groundDetailMaterial(details: GroundDetailTextures): THREE.MeshStandardMaterial {
  const grassTint = new THREE.Color(GROUND_ART_PROFILE.grassTint);
  const dirtTint = new THREE.Color(GROUND_ART_PROFILE.dirtTint);
  const rockTint = new THREE.Color(GROUND_ART_PROFILE.rockTint);
  const material = new THREE.MeshStandardMaterial({
    map: details.grass.map,
    normalMap: details.grass.normal,
    roughnessMap: details.grass.roughness,
    normalScale: new THREE.Vector2(GROUND_ART_PROFILE.normalStrength, GROUND_ART_PROFILE.normalStrength),
    color: 0xffffff,
    roughness: 1,
    vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundGrassTint = { value: grassTint };
    shader.uniforms.uGroundDirtTint = { value: dirtTint };
    shader.uniforms.uGroundRockTint = { value: rockTint };
    shader.uniforms.uGroundGrassStylization = { value: GROUND_ART_PROFILE.grassStylization };
    shader.uniforms.uGroundGrassValueFloor = { value: GROUND_ART_PROFILE.grassValueFloor };
    shader.uniforms.uGroundGrassValueScale = { value: GROUND_ART_PROFILE.grassValueScale };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 groundBlend;\nvarying vec3 vGroundBlend;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n    vGroundBlend = groundBlend;");
    // `onBeforeCompile` runs before Three expands ShaderChunk includes. The
    // earlier implementation tried to replace lines *inside* those chunks,
    // so the albedo blend silently never reached the GPU. Expand the one
    // chunk we customize, then replace its stable source line. Tests feed the
    // real include form to guard this ordering.
    const mapChunk = THREE.ShaderChunk.map_fragment.replace(
      "vec4 sampledDiffuseColor = texture2D( map, vMapUv );",
      "vec4 grassDiffuse = texture2D( map, vMapUv );\n\tfloat grassValue = dot( grassDiffuse.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );\n\tfloat surfaceValue = 0.72 + grassValue * 0.62;\n\tvec3 meadowAlbedo = min( uGroundGrassTint * ( uGroundGrassValueFloor + grassValue * uGroundGrassValueScale ), vec3( 1.0 ) );\n\tmeadowAlbedo = mix( grassDiffuse.rgb, meadowAlbedo, uGroundGrassStylization );\n\tvec3 dirtAlbedo = min( uGroundDirtTint * surfaceValue, vec3( 1.0 ) );\n\tvec3 rockAlbedo = min( uGroundRockTint * (0.82 + grassValue * 0.48), vec3( 1.0 ) );\n\tvec4 sampledDiffuseColor = vec4( meadowAlbedo * vGroundBlend.x + dirtAlbedo * vGroundBlend.y + rockAlbedo * vGroundBlend.z, grassDiffuse.a );",
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uGroundGrassTint;\nuniform vec3 uGroundDirtTint;\nuniform vec3 uGroundRockTint;\nuniform float uGroundGrassStylization;\nuniform float uGroundGrassValueFloor;\nuniform float uGroundGrassValueScale;\nvarying vec3 vGroundBlend;",
      )
      .replace("#include <map_fragment>", mapChunk);
    material.userData.groundArtCompiled = shader.fragmentShader.includes("meadowAlbedo");
  };
  material.customProgramCacheKey = () => "bright-stylized-ground-v4";
  return material;
}

interface TexturePair {
  readonly map: THREE.CanvasTexture;
  readonly bump: THREE.CanvasTexture;
}

function buildStoneTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  context.fillStyle = "#8a867c";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#808080";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const block = 32;
  for (let row = 0; row < TEXTURE_SIZE / block; row += 1) {
    const offset = (row % 2) * (block / 2);
    for (let column = -1; column < TEXTURE_SIZE / block + 1; column += 1) {
      const x = column * block + offset + 1;
      const y = row * block + 1;
      const shade = 1 + (Math.random() - 0.5) * 0.09;
      const value = Math.max(0, Math.min(255, Math.round(138 * shade)));
      context.fillStyle = `rgb(${value} ${value - 4} ${value - 9})`;
      context.fillRect(x, y, block - 2, block - 2);
      // Per-block height variance so individual stones catch light differently.
      const relief = Math.max(0, Math.min(255, Math.round(128 + (shade - 1) * 900)));
      height.context.fillStyle = `rgb(${relief} ${relief} ${relief})`;
      height.context.fillRect(x, y, block - 2, block - 2);
    }
  }
  speckle(context, 900, 0.25, ["#7a766c", "#9a968c"]);
  speckle(height.context, 900, 0.3, ["#6a6a6a", "#969696"]);
  context.strokeStyle = "#75716a";
  context.lineWidth = 1;
  height.context.strokeStyle = "#4a4a4a";
  height.context.lineWidth = 2;
  for (let row = 0; row <= TEXTURE_SIZE / block; row += 1) {
    context.beginPath();
    context.moveTo(0, row * block);
    context.lineTo(TEXTURE_SIZE, row * block);
    context.stroke();
    height.context.beginPath();
    height.context.moveTo(0, row * block);
    height.context.lineTo(TEXTURE_SIZE, row * block);
    height.context.stroke();
  }
  for (let column = 0; column <= TEXTURE_SIZE / block; column += 1) {
    context.beginPath();
    context.moveTo(column * block, 0);
    context.lineTo(column * block, TEXTURE_SIZE);
    context.stroke();
    height.context.beginPath();
    height.context.moveTo(column * block, 0);
    height.context.lineTo(column * block, TEXTURE_SIZE);
    height.context.stroke();
  }
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

function buildWoodTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  context.fillStyle = "#5f4a35";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#808080";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const boards = 5;
  const boardWidth = TEXTURE_SIZE / boards;
  for (let board = 0; board < boards; board += 1) {
    const x = board * boardWidth;
    const shade = 1 + (Math.random() - 0.5) * 0.16;
    const red = Math.max(0, Math.min(255, Math.round(95 * shade)));
    const green = Math.max(0, Math.min(255, Math.round(74 * shade)));
    const blue = Math.max(0, Math.min(255, Math.round(53 * shade)));
    context.fillStyle = `rgb(${red} ${green} ${blue})`;
    context.fillRect(x + 1, 0, boardWidth - 2, TEXTURE_SIZE);
    const relief = Math.max(0, Math.min(255, Math.round(128 + (shade - 1) * 500)));
    height.context.fillStyle = `rgb(${relief} ${relief} ${relief})`;
    height.context.fillRect(x + 1, 0, boardWidth - 2, TEXTURE_SIZE);
    context.strokeStyle = "#4a3826";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, TEXTURE_SIZE);
    context.stroke();
    height.context.strokeStyle = "#3a3a3a";
    height.context.lineWidth = 3;
    height.context.beginPath();
    height.context.moveTo(x + 0.5, 0);
    height.context.lineTo(x + 0.5, TEXTURE_SIZE);
    height.context.stroke();
    context.strokeStyle = "rgba(255, 228, 190, 0.16)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + boardWidth - 1.5, 0);
    context.lineTo(x + boardWidth - 1.5, TEXTURE_SIZE);
    context.stroke();
    for (let grain = 0; grain < 26; grain += 1) {
      const grainY = Math.random() * TEXTURE_SIZE;
      const wobble = (Math.random() - 0.5) * 14;
      const endY = grainY + (Math.random() - 0.5) * 10;
      context.strokeStyle = `rgba(${Math.random() < 0.5 ? "30 22 14" : "180 148 104"}, 0.10)`;
      context.beginPath();
      context.moveTo(x + 2 + Math.random() * 4, grainY);
      context.quadraticCurveTo(x + boardWidth * 0.5 + wobble, grainY + (Math.random() - 0.5) * 6, x + boardWidth - 3, endY);
      context.stroke();
      height.context.strokeStyle = Math.random() < 0.5 ? "rgba(90, 90, 90, 0.35)" : "rgba(170, 170, 170, 0.3)";
      height.context.lineWidth = 1;
      height.context.beginPath();
      height.context.moveTo(x + 2 + Math.random() * 4, grainY);
      height.context.quadraticCurveTo(x + boardWidth * 0.5 + wobble, grainY, x + boardWidth - 3, endY);
      height.context.stroke();
    }
  }
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

function buildGrassTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  // 8e-17 redcoats grade: a confident saturated green, not olive drab.
  context.fillStyle = "#5f8f3e";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#808080";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let patch = 0; patch < 26; patch += 1) {
    const shade = 1 + (Math.random() - 0.5) * 0.18;
    const green = Math.max(0, Math.min(255, Math.round(144 * shade)));
    context.fillStyle = `rgba(${Math.round(green * 0.78)} ${green} ${Math.round(green * 0.58)}, 0.35)`;
    const px = Math.random() * TEXTURE_SIZE;
    const py = Math.random() * TEXTURE_SIZE;
    const rx = 12 + Math.random() * 26;
    const ry = 8 + Math.random() * 18;
    const rotation = Math.random() * Math.PI;
    context.beginPath();
    context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    context.fill();
    const relief = Math.max(0, Math.min(255, Math.round(128 + (shade - 1) * 300)));
    height.context.fillStyle = `rgba(${relief} ${relief} ${relief}, 0.4)`;
    height.context.beginPath();
    height.context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    height.context.fill();
  }
  for (let blade = 0; blade < 1_300; blade += 1) {
    const x = Math.random() * TEXTURE_SIZE;
    const y = Math.random() * TEXTURE_SIZE;
    const length = 2 + Math.random() * 2;
    const light = Math.random() < 0.5;
    context.fillStyle = light ? "rgba(190, 210, 120, 0.4)" : "rgba(45, 70, 30, 0.35)";
    context.fillRect(x, y, 1, length);
    height.context.fillStyle = light ? "rgba(200, 200, 200, 0.4)" : "rgba(80, 80, 80, 0.35)";
    height.context.fillRect(x, y, 1, length);
  }
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

function buildDirtTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  context.fillStyle = "#7a6248";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#808080";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let patch = 0; patch < 22; patch += 1) {
    const shade = 1 + (Math.random() - 0.5) * 0.14;
    const red = Math.max(0, Math.min(255, Math.round(122 * shade)));
    context.fillStyle = `rgba(${red} ${Math.round(red * 0.78)} ${Math.round(red * 0.58)}, 0.4)`;
    const px = Math.random() * TEXTURE_SIZE;
    const py = Math.random() * TEXTURE_SIZE;
    const rx = 14 + Math.random() * 30;
    const ry = 10 + Math.random() * 22;
    const rotation = Math.random() * Math.PI;
    context.beginPath();
    context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    context.fill();
    const relief = Math.max(0, Math.min(255, Math.round(128 + (shade - 1) * 350)));
    height.context.fillStyle = `rgba(${relief} ${relief} ${relief}, 0.45)`;
    height.context.beginPath();
    height.context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    height.context.fill();
  }
  speckle(context, 1_100, 0.3, ["#5c4834", "#93805f"]);
  speckle(height.context, 1_100, 0.35, ["#5a5a5a", "#a8a8a8"]);
  for (let stone = 0; stone < 14; stone += 1) {
    const px = Math.random() * TEXTURE_SIZE;
    const py = Math.random() * TEXTURE_SIZE;
    const rx = 1.5 + Math.random() * 2.5;
    const ry = 1 + Math.random() * 1.8;
    const rotation = Math.random() * Math.PI;
    context.fillStyle = `rgba(${Math.random() < 0.5 ? "96 86 70" : "110 100 84"}, 0.5)`;
    context.beginPath();
    context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    context.fill();
    height.context.fillStyle = "rgba(190, 190, 190, 0.6)";
    height.context.beginPath();
    height.context.ellipse(px, py, rx, ry, rotation, 0, Math.PI * 2);
    height.context.fill();
  }
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

function buildWaterTexture(): THREE.CanvasTexture {
  const { canvas, context } = createCanvas();
  context.fillStyle = "#27496b";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let band = 0; band < 90; band += 1) {
    const y = Math.random() * TEXTURE_SIZE;
    const x = Math.random() * TEXTURE_SIZE;
    const length = 20 + Math.random() * 60;
    context.strokeStyle = Math.random() < 0.6 ? "rgba(90, 150, 200, 0.22)" : "rgba(200, 228, 245, 0.14)";
    context.lineWidth = 1 + Math.random() * 1.6;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + length * 0.4, y + (Math.random() - 0.5) * 8, x + length, y + (Math.random() - 0.5) * 10);
    context.stroke();
  }
  return colorTexture(canvas);
}

/**
 * Phase 8e-5 Task 2: Theodosian ashlar for the main wall and city walls.
 * Large limestone courses with the era's signature thin red-brick band every
 * second course, per-block tonal jitter, recessed mortar, a weathering
 * gradient darkening toward the base (ground damp + moss), and a darker top
 * band that reads as the merlon shadow line from below. BoxGeometry maps the
 * whole 256² canvas to each 11.5×8 m wall face, so the five courses read as
 * ~1.6 m stones. The bump canvas carries course relief and mortar depth.
 */
function buildAshlarTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  context.fillStyle = "#8d887c";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#808080";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const course = 51; // five courses per face
  const brickBand = 9;
  for (let row = 0; row < TEXTURE_SIZE / course; row += 1) {
    const y = row * course;
    const isBrick = row % 2 === 1;
    if (isBrick) {
      // Thin red-brick band: small bricks, tight vertical joints.
      context.fillStyle = "#7d4a3c";
      context.fillRect(0, y, TEXTURE_SIZE, brickBand);
      height.context.fillStyle = "#6e6e6e";
      height.context.fillRect(0, y, TEXTURE_SIZE, brickBand);
      for (let bx = 0; bx < TEXTURE_SIZE; bx += 16) {
        const shade = 1 + (Math.random() - 0.5) * 0.14;
        const red = Math.max(0, Math.min(255, Math.round(133 * shade)));
        context.fillStyle = `rgb(${red} ${Math.round(red * 0.58)} ${Math.round(red * 0.47)})`;
        context.fillRect(bx + 1, y + 1, 14, brickBand - 2);
      }
    }
    const stoneTop = isBrick ? y + brickBand : y;
    const stoneHeight = isBrick ? course - brickBand : course;
    const offset = (row % 2) * 32;
    for (let column = -1; column < TEXTURE_SIZE / 64 + 1; column += 1) {
      const x = column * 64 + offset;
      const shade = 1 + (Math.random() - 0.5) * 0.12;
      const value = Math.max(0, Math.min(255, Math.round(141 * shade)));
      context.fillStyle = `rgb(${value} ${value - 4} ${value - 10})`;
      context.fillRect(x + 1.5, stoneTop + 1.5, 61, stoneHeight - 3);
      const relief = Math.max(0, Math.min(255, Math.round(128 + (shade - 1) * 700)));
      height.context.fillStyle = `rgb(${relief} ${relief} ${relief})`;
      height.context.fillRect(x + 1.5, stoneTop + 1.5, 61, stoneHeight - 3);
      // Mortar: vertical joints.
      context.strokeStyle = "#6f6a60";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, stoneTop);
      context.lineTo(x, stoneTop + stoneHeight);
      context.stroke();
      height.context.strokeStyle = "#3f3f3f";
      height.context.lineWidth = 3;
      height.context.beginPath();
      height.context.moveTo(x, stoneTop);
      height.context.lineTo(x, stoneTop + stoneHeight);
      height.context.stroke();
    }
    // Mortar: horizontal course line.
    context.strokeStyle = "#6f6a60";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(TEXTURE_SIZE, y);
    context.stroke();
    height.context.strokeStyle = "#3f3f3f";
    height.context.lineWidth = 3;
    height.context.beginPath();
    height.context.moveTo(0, y);
    height.context.lineTo(TEXTURE_SIZE, y);
    height.context.stroke();
  }
  speckle(context, 700, 0.22, ["#7a766c", "#9a968c"]);
  // Weathering gradient: v = canvas y runs top->bottom on the wall face, so
  // the damp/moss stain darkens toward the BOTTOM of the canvas.
  const gradient = context.createLinearGradient(0, TEXTURE_SIZE * 0.55, 0, TEXTURE_SIZE);
  gradient.addColorStop(0, "rgba(74, 78, 62, 0)");
  gradient.addColorStop(1, "rgba(74, 78, 62, 0.42)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const heightGradient = height.context.createLinearGradient(0, TEXTURE_SIZE * 0.6, 0, TEXTURE_SIZE);
  heightGradient.addColorStop(0, "rgba(60, 60, 60, 0)");
  heightGradient.addColorStop(1, "rgba(60, 60, 60, 0.25)");
  height.context.fillStyle = heightGradient;
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  // Merlon shadow line: a darker cap band along the top edge.
  context.fillStyle = "rgba(38, 36, 32, 0.38)";
  context.fillRect(0, 0, TEXTURE_SIZE, 14);
  height.context.fillStyle = "rgba(70, 70, 70, 0.4)";
  height.context.fillRect(0, 0, TEXTURE_SIZE, 14);
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

/**
 * Phase 8e-5 Task 2: breach rubble. Irregular jumbled chunks on dark dust —
 * no courses, no order, higher contrast than the ashlar — so a breached
 * segment reads as broken masonry, not a tinted wall box. The bump map
 * carries the chunk relief.
 */
function buildRubbleTexture(): TexturePair {
  const { canvas, context } = createCanvas();
  const height = createCanvas();
  context.fillStyle = "#4e4a44";
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  height.context.fillStyle = "#585858";
  height.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const cell = 36;
  for (let gy = 0; gy < TEXTURE_SIZE / cell + 1; gy += 1) {
    for (let gx = 0; gx < TEXTURE_SIZE / cell + 1; gx += 1) {
      // Jittered irregular chunk: a rotated quad-ish blob per grid cell.
      const cx = gx * cell + (Math.random() - 0.5) * 14;
      const cy = gy * cell + (Math.random() - 0.5) * 14;
      const radius = 12 + Math.random() * 12;
      const shade = 0.75 + Math.random() * 0.55;
      const value = Math.max(0, Math.min(255, Math.round(122 * shade)));
      context.fillStyle = `rgb(${value} ${value - 4} ${value - 9})`;
      context.beginPath();
      const corners = 5 + Math.floor(Math.random() * 3);
      for (let corner = 0; corner <= corners; corner += 1) {
        const angle = (corner / corners) * Math.PI * 2 + Math.random() * 0.5;
        const r = radius * (0.72 + Math.random() * 0.4);
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r * 0.8;
        if (corner === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      const relief = Math.max(0, Math.min(255, Math.round(96 + shade * 90)));
      height.context.fillStyle = `rgb(${relief} ${relief} ${relief})`;
      height.context.beginPath();
      height.context.ellipse(cx, cy, radius * 0.85, radius * 0.65, Math.random() * Math.PI, 0, Math.PI * 2);
      height.context.fill();
    }
  }
  speckle(context, 1_200, 0.3, ["#3a362f", "#8a857a"]);
  speckle(height.context, 900, 0.3, ["#3a3a3a", "#a0a0a0"]);
  return { map: colorTexture(canvas), bump: bumpTexture(height.canvas) };
}

export interface GameTextures {
  readonly stone: THREE.CanvasTexture;
  readonly wood: THREE.CanvasTexture;
  readonly grass: THREE.CanvasTexture;
  readonly dirt: THREE.CanvasTexture;
  readonly water: THREE.CanvasTexture;
  readonly stoneBump: THREE.CanvasTexture;
  readonly woodBump: THREE.CanvasTexture;
  readonly grassBump: THREE.CanvasTexture;
  readonly dirtBump: THREE.CanvasTexture;
  readonly ashlar: THREE.CanvasTexture;
  readonly ashlarBump: THREE.CanvasTexture;
  readonly rubble: THREE.CanvasTexture;
  readonly rubbleBump: THREE.CanvasTexture;
}

let cachedTextures: GameTextures | undefined;

export function gameTextures(): GameTextures {
  if (cachedTextures === undefined) {
    const stone = buildStoneTexture();
    const wood = buildWoodTexture();
    const grass = buildGrassTexture();
    const dirt = buildDirtTexture();
    const ashlar = buildAshlarTexture();
    const rubble = buildRubbleTexture();
    cachedTextures = {
      stone: stone.map,
      wood: wood.map,
      grass: grass.map,
      dirt: dirt.map,
      water: buildWaterTexture(),
      stoneBump: stone.bump,
      woodBump: wood.bump,
      grassBump: grass.bump,
      dirtBump: dirt.bump,
      ashlar: ashlar.map,
      ashlarBump: ashlar.bump,
      rubble: rubble.map,
      rubbleBump: rubble.bump,
    };
  }
  return cachedTextures;
}
