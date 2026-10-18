#!/usr/bin/env node
// Phase 7 asset audit: every shipped audio asset must be declared in the
// client manifest and carry a license entry in CREDITS.md.
// Phase 8c-3 extends the audit to glb models: every model referenced in the
// models manifest must exist under client/public/ and be covered by a credits
// entry (exact file or pack-level prefix). Shipped-but-unreferenced glbs are
// allowed on purpose (future phases draw from the same drop) — that check
// stays audio-only. CC0/CC-BY for audio/models/textures; OFL allowed for
// self-hosted fonts (Phase 8c-1). NC/SA assets must never ship. Fails the
// client build.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "client/src/game/audio/manifest.ts");
const modelManifestPath = join(root, "client/src/game/models/manifest.ts");
const creditsPath = join(root, "CREDITS.md");
const audioDir = join(root, "client/public/audio");
const publicDir = join(root, "client/public");
const audioEnginePath = join(root, "client/src/game/audio/audioEngine.ts");
const textureDir = join(publicDir, "textures");
const preparedModelPrefixes = [
  "models/artillery/",
  "models/characters/meshy/",
  "models/props/meshy/",
  "models/scatter/meshy/",
  "models/ships/meshy/",
];

let failed = false;

function fail(message) {
  failed = true;
  console.error(`audit:assets: ${message}`);
}

// GLB stores its glTF document in a JSON chunk before the binary payload.
// Reading only that chunk keeps this audit dependency-free and cheap enough to
// remain part of every build.
function readGlbJson(path) {
  const bytes = readFileSync(path);
  if (
    bytes.length < 20
    || bytes.readUInt32LE(0) !== 0x46546c67
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.length
  ) {
    throw new Error("not a valid GLB 2 container");
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > bytes.length) throw new Error("GLB chunk exceeds file length");
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(chunkStart, chunkEnd).toString("utf8").trim());
    }
    offset = chunkEnd;
  }

  throw new Error("GLB has no JSON chunk");
}

if (!existsSync(manifestPath)) {
  console.error("audit:assets: client manifest not found at", manifestPath);
  process.exit(1);
}
if (!existsSync(creditsPath)) {
  console.error("audit:assets: CREDITS.md not found");
  process.exit(1);
}

const manifest = readFileSync(manifestPath, "utf8");
const credits = readFileSync(creditsPath, "utf8");
const referenced = [...manifest.matchAll(/file:\s*"([^"]+)"/g)].map((match) => match[1]);

if (referenced.length === 0) fail("no audio files referenced in the manifest");
for (const file of referenced) {
  if (!/^audio\/[A-Za-z0-9._-]+$/.test(file)) {
    fail(`manifest entry "${file}" must live under audio/`);
    continue;
  }
  const path = join(audioDir, file.slice("audio/".length));
  if (!existsSync(path)) fail(`manifest references "${file}" but the file is missing`);
  if (!credits.includes(`\`${file}\``)) fail(`"${file}" is used but has no entry in CREDITS.md`);
}

if (existsSync(audioDir)) {
  // ADR 0045 (LOW-3): every shipped audio file is audited, not just mp3 —
  // the 8e-18 library is AAC (.m4a), which decodeAudioData handles natively.
  const shipped = readdirSync(audioDir).filter((name) => /\.(mp3|m4a|wav|flac|aiff?|ogg)$/i.test(name));
  for (const name of shipped) {
    const file = `audio/${name}`;
    if (!referenced.includes(file)) fail(`"${file}" ships on disk but is not referenced in the client manifest`);
    if (!credits.includes(`\`${file}\``)) fail(`"${file}" ships on disk but has no entry in CREDITS.md`);
  }
}

// Font gate (ADR 0045, LOW-3): every self-hosted woff2 under public/fonts/
// must be covered by a credits token. Tokens may use `*` as a glob segment
// (e.g. `fonts/alegreya-sans-*.woff2` covers every weight/subset file).
const fontsDir = join(publicDir, "fonts");
if (existsSync(fontsDir)) {
  const creditsFontTokens = [...credits.matchAll(/`(fonts\/[^`]+)`/g)].map((match) => match[1]);
  const tokenToRegex = (token) =>
    new RegExp(`^${token.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
  for (const name of readdirSync(fontsDir).filter((entry) => entry.endsWith(".woff2"))) {
    const file = `fonts/${name}`;
    if (!creditsFontTokens.some((token) => tokenToRegex(token).test(file))) {
      fail(`"${file}" ships on disk but has no entry in CREDITS.md (glob tokens like fonts/<family>-*.woff2 are fine)`);
    }
  }
}

// Ground-detail gate (Phase 8e-15): every external terrain map must be small,
// credited, and referenced by the runtime texture loader. The phase budget is
// 8 MiB for the whole terrain family so potato-PC downloads do not quietly
// grow with every new biome.
let textureBytes = 0;
let textureCount = 0;
if (existsSync(textureDir)) {
  const textureTokens = [...credits.matchAll(/`(textures\/[^`]+)`/g)].map((match) => match[1]);
  const textureSource = readFileSync(join(root, "client/src/game/textures.ts"), "utf8");
  const shippedTextures = readdirSync(textureDir).filter((entry) => /\.(jpe?g|png|webp|avif)$/i.test(entry));
  for (const name of shippedTextures) {
    const file = `textures/${name}`;
    textureCount += 1;
    textureBytes += statSync(join(textureDir, name)).size;
    if (!textureTokens.includes(file)) fail(`"${file}" ships on disk but has no CC0/CC-BY credit row`);
    if (!textureSource.includes(`/textures/${name}`)) fail(`"${file}" ships on disk but is not referenced by client/src/game/textures.ts`);
  }
  if (textureBytes > 8 * 1024 * 1024) fail(`terrain textures weigh ${(textureBytes / (1024 * 1024)).toFixed(2)} MiB; the Phase 8e-15 budget is 8 MiB`);
}

// Runtime URL-join gate (Phase 8e-2, closes the ADR 0027 residual row): the
// audit above proves manifest↔disk, but the 8e-0 outage was a bad JOIN — the
// engine prepended `${BASE_URL}audio/` to files that already carry `audio/`,
// and every sample 404'd while this audit stayed green. Static check, three
// pins on the real join in AudioEngine:
//   1. the fetch URL is built as `${this.#baseUrl}${asset.file}` (so this
//      check is tied to the actual runtime expression, not a copy of it);
//   2. the base expression contributes no path segment of its own (the
//      doubled-segment class);
//   3. joining base "/" with every manifest file yields exactly `/audio/<name>`
//      — one `audio/` segment, one filename, no leading slash on the file.
if (existsSync(audioEnginePath)) {
  const engine = readFileSync(audioEnginePath, "utf8");
  if (!/\$\{this\.#baseUrl\}\$\{asset\.file\}/.test(engine)) {
    fail("audioEngine no longer fetches `${this.#baseUrl}${asset.file}` — re-point the URL-join audit at the new expression");
  }
  const baseMatch = engine.match(/#baseUrl\s*=\s*([^;]+);/);
  if (baseMatch === null) {
    fail("could not find the `#baseUrl = ...` assignment in audioEngine.ts");
  } else {
    const baseExpression = baseMatch[1];
    if (/["'`]/.test(baseExpression) || /audio/i.test(baseExpression)) {
      fail(`#baseUrl expression "${baseExpression}" must not add a literal path segment — manifest files already carry their audio/ prefix (the 8e-0 double-prefix class)`);
    }
    for (const file of referenced) {
      const joined = `/${file}`; // BASE_URL is "/" in dev; file must supply the whole path.
      if (!/^\/audio\/[A-Za-z0-9._-]+$/.test(joined)) {
        fail(`runtime join BASE_URL+file produces "${joined}" — expected exactly one audio/ segment and one filename`);
      }
    }
  }
}

// UI skin gate (Phase 8e-14): every image shipped under public/ui/ must be
// referenced by the client source (styles.css, a tsx module, or index.html)
// and carry a credits row. Owner-generated artwork has no third-party
// license, but the audit still pins provenance + usage like every other
// asset class — a dropped frame or tile fails the build, not the review.
const uiDir = join(publicDir, "ui");
if (existsSync(uiDir)) {
  const creditsUiTokens = [...credits.matchAll(/`(ui\/[^`]+)`/g)].map((match) => match[1]);
  const sourceTexts = [];
  const walkSources = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walkSources(full);
      else if (/\.(ts|tsx|css)$/.test(entry.name)) sourceTexts.push(readFileSync(full, "utf8"));
    }
  };
  walkSources(join(root, "client/src"));
  sourceTexts.push(readFileSync(join(root, "client/index.html"), "utf8"));
  const haystack = sourceTexts.join("\n");
  const shippedUi = readdirSync(uiDir).filter((entry) => /\.(webp|png|svg|jpe?g|avif)$/i.test(entry));
  for (const name of shippedUi) {
    const file = `ui/${name}`;
    if (!creditsUiTokens.includes(file)) fail(`"${file}" ships on disk but has no entry in CREDITS.md`);
    if (!haystack.includes(`/ui/${name}`)) fail(`"${file}" ships on disk but is referenced nowhere in client/src or client/index.html`);
  }
}

// Model gate (Phase 8c-3): every glb referenced by the models manifest must
// exist under client/public/ and be covered by a credits entry. Coverage is
// prefix-based so a pack-level row like `models/props/nature-ultimate/` covers
// every file in the pack. Shipped-but-unreferenced glbs are intentionally NOT
// gated this phase — the drop is a pool future phases draw from. If the models
// manifest does not exist yet, the gate is skipped silently.
const referencedModels = [];
let auditedPreparedMaterials = 0;
if (existsSync(modelManifestPath)) {
  const modelManifest = readFileSync(modelManifestPath, "utf8");
  for (const match of modelManifest.matchAll(/"(models\/[^"]+\.glb)"/g)) {
    if (!referencedModels.includes(match[1])) referencedModels.push(match[1]);
  }
  // Backtick-quoted models/... tokens from the credits file: exact file paths
  // (`models/weapons/giant-crossbow.glb`) and pack prefixes ending in `/`.
  const creditsModelTokens = [...credits.matchAll(/`(models\/[^`]+)`/g)].map((match) => match[1]);
  for (const file of referencedModels) {
    const modelPath = join(publicDir, file);
    if (!existsSync(modelPath)) {
      fail(`model manifest references "${file}" but the file is missing`);
      continue;
    }
    if (!creditsModelTokens.some((token) => file.startsWith(token))) {
      fail(`"${file}" is used but has no entry in CREDITS.md (exact file or pack prefix)`);
    }

    // The preparation pipeline intentionally removes metallic-roughness maps
    // to keep generated GLBs small. glTF's default metallicFactor is 1, so
    // leaving that default behind makes diffuse-only characters, cannons, and
    // props render almost black when no environment map is present. Pin the
    // material contract here so a future asset regeneration cannot silently
    // reintroduce that failure across the battlefield.
    if (preparedModelPrefixes.some((prefix) => file.startsWith(prefix))) {
      try {
        const document = readGlbJson(modelPath);
        const materials = document.materials ?? [];
        if (materials.length === 0) {
          fail(`prepared model "${file}" has no material to audit`);
        }
        for (const [index, material] of materials.entries()) {
          const pbr = material.pbrMetallicRoughness ?? {};
          const metallic = pbr.metallicFactor ?? 1;
          auditedPreparedMaterials += 1;
          if (pbr.metallicRoughnessTexture === undefined && metallic > 0.35) {
            fail(`"${file}" material ${index} has metallicFactor ${metallic} without a metallic-roughness texture; prepared diffuse-only assets must stay at or below 0.35`);
          }
        }
      } catch (error) {
        fail(`could not inspect prepared model "${file}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

// Credits are a markdown table: | Asset | Source | Author | License | Used for |
// Match rows whose first cell is a backtick-quoted asset path and read the License column
// (index 3) directly, rather than a "License:" prefix that never appears in table cells.
const tableRows = [...credits.matchAll(/^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/gm)];
if (tableRows.length === 0) fail("no asset rows found in CREDITS.md (table format may have changed)");
for (const [, assetPath, rest] of tableRows) {
  const cells = rest.split("|").map((cell) => cell.trim());
  const license = cells[2] ?? "";
  // Anchored at both ends: "^CC0|^CC-BY" alone (no trailing $) would also accept
  // "CC-BY-NC 4.0" or "CC-BY-SA 4.0" since both start with an allowed prefix.
  // Only bare CC0/CC-BY/OFL with an optional bare version number are acceptable,
  // plus the Meshy commercial license (Phase 8e-12): the characters/weapons are
  // generated from the project's own prompts and owned outright — no third-party
  // attribution, NC, or SA exposure — which is strictly safer than CC-BY.
  // Owner-generated (owned) (Phase 8e-14) covers the owner's own artwork (the
  // medieval UI frame + class icon sheet) under the same ownership argument.
  if (!/^(CC0|CC-BY|OFL)([\s-]\d\.\d)?$/.test(license) && license !== "Meshy commercial (owned)" && license !== "Owner-generated (owned)") {
    fail(`forbidden or unrecognized license "${license}" for "${assetPath}" in CREDITS.md (CC0/CC-BY/OFL, Meshy commercial (owned), or Owner-generated (owned))`);
  }
}

if (failed) {
  console.error("audit:assets: failed — every asset needs a manifest reference and a CC0/CC-BY/OFL credits entry.");
  process.exit(1);
}
const uiCount = existsSync(uiDir) ? readdirSync(uiDir).filter((entry) => /\.(webp|png|svg|jpe?g|avif)$/i.test(entry)).length : 0;
console.log(`audit:assets: ok — ${referenced.length} audio + ${referencedModels.length} model referenced assets (${auditedPreparedMaterials} prepared materials checked) + ${uiCount} ui skin images + ${textureCount} terrain textures (${(textureBytes / (1024 * 1024)).toFixed(2)} MiB), all credited under CC0/CC-BY/OFL or owner-generated.`);
