#!/usr/bin/env node
/**
 * Fetches the sourced 3D model packs the game still lacks, the same way
 * `tools/fetch-fonts.mjs` fetches the HUD typefaces: one-off owner-run tooling,
 * not part of the build. Files land under `client/public/models/` and are then
 * referenced from `client/src/game/models/manifest.ts`.
 *
 *   node tools/fetch-models.mjs            # download everything not on disk
 *   node tools/fetch-models.mjs --only horse
 *   node tools/fetch-models.mjs --verify   # no network: re-check disk vs lock
 *   node tools/fetch-models.mjs --inspect client/public/models/weapons/x.glb
 *
 * Three things this does that a plain curl does not:
 *
 *  1. Locks what it fetched. Every download is hashed into
 *     `tools/model-sources.lock.json`, so a re-run is reproducible and a
 *     changed upstream file is loud rather than silent.
 *  2. Refuses to write rubbish. Archives and glbs are validated before they
 *     are unpacked — a 403 HTML error page saved as `.glb` is the classic way
 *     an asset drop goes wrong, and it fails the audit much later.
 *  3. Measures geometry instead of guessing it. `--inspect` prints the bounding
 *     box, mesh/material counts and a Z-axis profile of any glb. ADR 0018
 *     declined to swap weapon models specifically because it could not verify
 *     an origin/scale/orientation change by eye; the profile answers the one
 *     question that actually matters — which end is the muzzle — from vertex
 *     data. `--inspect` is worth running on every new file BEFORE wiring it in.
 *
 * On sources: entries carry a real, resolvable `url` where the upstream host
 * publishes stable direct links. Where a pack is only reachable through a
 * browser step (an itch.io "download" button, a Google Drive interstitial), the
 * entry is marked `manual` and the script prints exactly what to place where
 * instead of guessing a URL that would rot. Fill in `url` once you have it and
 * the script takes over hashing and verification from there.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(root, "client/public/models");
const lockPath = join(root, "tools/model-sources.lock.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

/**
 * The gap list, in the order the game feels their absence.
 *
 * `target` is relative to client/public/models/. `pick` selects members out of
 * an archive: a function from the archive's entry name to an output filename,
 * or null to keep the whole tree.
 */
const SOURCES = [
  {
    id: "arquebus",
    what: "Matchlock arquebus / handgonne — the Ottoman primary weapon",
    why:
      "The single most-visible missing model. Janissary, Sipahi and Topçu all carry the arquebus " +
      "in slot 2, so it is on screen in first person for most of an Ottoman player's session, and " +
      "it is currently procedural geometry. Nothing in the existing 263-file drop is a firearm: " +
      "the medieval pack is pre-gunpowder melee and the Kenney pirate kit has cannons, not handguns.",
    target: "weapons/firearms",
    license: "CC0 1.0",
    url: null,
    manual: [
      "No CC0 matchlock exists in the packs already sorted into this repo.",
      "Search poly.pizza for 'musket' / 'arquebus' / 'blunderbuss' (filter: CC0), or",
      "Quaternius' Ultimate Guns pack for a flintlock that can be re-skinned dark.",
      "Save the glb as client/public/models/weapons/firearms/arquebus.glb, then run",
      "  node tools/fetch-models.mjs --inspect client/public/models/weapons/firearms/arquebus.glb",
      "and confirm the barrel runs along one axis before touching viewmodel.ts.",
    ],
  },
  {
    id: "horse",
    what: "Horse — mounted cavalry",
    why:
      "Cavalry is explicitly non-cuttable in the roadmap ('cavalry and artillery cannot be cut, " +
      "they're the spectacle') and the horse is still a procedural low-poly stand-in rendered " +
      "through an InstancedMesh. Zero matches for *horse* across the whole existing drop. " +
      "A static (unrigged) horse glb is enough: the batch never poses it per-instance.",
    target: "characters/horses",
    license: "CC0 1.0",
    url: null,
    manual: [
      "Quaternius' Animated Horse pack, or poly.pizza 'horse' filtered to CC0.",
      "An unrigged mesh is sufficient and preferable — the renderer batches horses",
      "into one InstancedMesh and never poses them individually, so a SkinnedMesh",
      "would cost draw calls for motion the game does not currently drive.",
      "Save as client/public/models/characters/horses/horse.glb.",
    ],
  },
  {
    id: "architecture",
    what: "Ottoman / Byzantine architecture — walls, gate, towers, domes",
    why:
      "The 1453 siege is currently dressed in Kenney's PIRATE kit: castle-wall, castle-door, " +
      "tower-complete-small and flag-pennant all come from a pirate pack, which reads as generic " +
      "fantasy rather than the Theodosian walls. This is the largest single gap between the world " +
      "on screen and the world in docs/design/visual-feel-bible.md.",
    target: "props/architecture",
    license: "CC0 1.0",
    url: null,
    manual: [
      "Kenney's Castle Kit and Tower Defense Kit are the closest CC0 fits and share",
      "the flat-colour register the loader already bakes to vertex colours.",
      "Prefer: a straight curtain-wall module, a square tower, a gatehouse, and a dome.",
      "Save under client/public/models/props/architecture/ preserving the pack's names.",
      "Note: this is a DRESSING swap only. SIEGE_BLOCKOUT owns every collider and must",
      "not change — the wall geometry is authoritative and shared with the server.",
    ],
  },
  {
    id: "crossbow",
    what: "Handheld crossbow — Byzantine primary (optional)",
    why:
      "Lower priority than it looks. The existing procedural crossbow in viewmodel.ts is good: " +
      "tiller, cheek comb, bolt groove, an animated back-swept prod, string, nut, trigger lever, " +
      "stirrup and a resting bolt. The sourced weapons/giant-crossbow.glb is NOT an upgrade — it " +
      "merges to one geometry (so the prod-snap animation dies), is authored at roughly 3.9x " +
      "scale, and carries a saturated pure-red material that fights the desaturated siege-dawn " +
      "grade. Only replace the procedural build with something that keeps a separable prod.",
    target: "weapons/firearms",
    license: "CC0 1.0",
    url: null,
    manual: [
      "Skip unless a candidate has the prod as its own node (check with --inspect).",
      "If it does not, the procedural crossbow is the better model — leave it alone.",
    ],
  },
];

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

// ---------------------------------------------------------------- glb inspect

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(buffer) {
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a glb (bad magic — a saved HTML error page looks exactly like this)");
  }
  let offset = 12;
  let json;
  let bin;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(chunk.toString("utf8"));
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (json === undefined) throw new Error("glb has no JSON chunk");
  return { json, bin };
}

/** Column-major TRS/matrix for a node, as a flat 16-length array (row-major math below). */
function nodeMatrix(node) {
  if (node.matrix !== undefined) {
    const m = node.matrix; // glTF is column-major
    return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
  }
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r = [
    1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw),
    2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw),
    2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy),
  ];
  return [
    r[0] * sx, r[1] * sy, r[2] * sz, tx,
    r[3] * sx, r[4] * sy, r[5] * sz, ty,
    r[6] * sx, r[7] * sy, r[8] * sz, tz,
    0, 0, 0, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[row * 4 + k] * b[k * 4 + col];
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const [Ctor, size] = COMPONENT[accessor.componentType];
  const count = COMPONENTS_PER[accessor.type];
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? size * count;
  const out = new Float64Array(accessor.count * count);
  for (let i = 0; i < accessor.count; i += 1) {
    const slice = new Ctor(bin.buffer, bin.byteOffset + base + i * stride, count);
    for (let c = 0; c < count; c += 1) out[i * count + c] = slice[c];
  }
  return { data: out, count: accessor.count, itemSize: count };
}

/** Every POSITION in scene space, plus per-node bounds. */
function worldPositions(json, bin) {
  const points = [];
  const nodes = [];
  const walk = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const matrix = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const start = points.length;
      for (const primitive of json.meshes[node.mesh].primitives) {
        const { data, count } = readAccessor(json, bin, primitive.attributes.POSITION);
        for (let i = 0; i < count; i += 1) {
          const x = data[i * 3];
          const y = data[i * 3 + 1];
          const z = data[i * 3 + 2];
          points.push([
            matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
            matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
            matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
          ]);
        }
      }
      nodes.push({ name: node.name ?? `node${nodeIndex}`, from: start, to: points.length });
    }
    for (const child of node.children ?? []) walk(child, matrix);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const nodeIndex of scene?.nodes ?? []) walk(nodeIndex, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return { points, nodes };
}

function bounds(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i += 1) {
      if (p[i] < min[i]) min[i] = p[i];
      if (p[i] > max[i]) max[i] = p[i];
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

const round = (values, places = 3) => values.map((v) => Number(v.toFixed(places)));

/**
 * Prints a glb's shape. The Z-profile is the useful part for anything that has
 * to point somewhere: slice the model along Z and print how wide and how high
 * each slice is. A gun barrel, a crossbow bolt or a lance tip shows up as a
 * narrow, centred, raised run of vertices at one end and nothing like it at the
 * other — which tells you the forward axis without opening a 3D viewer.
 *
 * The engine convention to match: local -Z is forward. `rotation.y = yaw` maps
 * local -Z onto the movement forward vector (-sin yaw, -cos yaw) and onto the
 * server's artillery muzzle velocity. If the narrow end is at +Z, the geometry
 * needs a `rotateY(Math.PI)` before it goes into a batch.
 */
function inspect(path) {
  const buffer = readFileSync(path);
  const { json, bin } = parseGlb(buffer);
  console.log(`\n${relative(root, path)}  —  ${(buffer.length / 1024).toFixed(1)} KB`);
  console.log(`  meshes ${json.meshes?.length ?? 0}  materials ${json.materials?.length ?? 0}  ` +
    `images ${json.images?.length ?? 0}  nodes ${json.nodes?.length ?? 0}  ` +
    `skins ${json.skins?.length ?? 0}  animations ${json.animations?.length ?? 0}`);

  for (const [index, material] of (json.materials ?? []).entries()) {
    const pbr = material.pbrMetallicRoughness ?? {};
    const colour = pbr.baseColorFactor ? round(pbr.baseColorFactor.slice(0, 3), 2).join(", ") : "—";
    console.log(`  material ${index} ${material.name ?? ""} baseColor [${colour}] textured=${pbr.baseColorTexture !== undefined}`);
  }
  if ((json.images?.length ?? 0) === 0 && (json.materials?.length ?? 0) > 0) {
    console.log("  → colour-only kit: the loader bakes these into vertex colours and merges to one material.");
  } else if ((json.images?.length ?? 0) > 0) {
    console.log("  → textured kit: the loader merges as-is and keeps the atlas material.");
  }
  if ((json.skins?.length ?? 0) > 0) {
    console.log("  ⚠ rigged. three.js does not batch independently-posed SkinnedMeshes — one draw");
    console.log("    call per instance. Read ADR 0018 §'Skinned characters' before using in a crowd.");
  }

  if (bin === undefined) {
    console.log("  (no BIN chunk — cannot profile geometry)");
    return;
  }
  const { points, nodes } = worldPositions(json, bin);
  if (points.length === 0) {
    console.log("  (no positions)");
    return;
  }
  const whole = bounds(points);
  console.log(`  vertices ${points.length}`);
  console.log(`  bbox min [${round(whole.min).join(", ")}]  max [${round(whole.max).join(", ")}]`);
  console.log(`  size     [${round(whole.size).join(", ")}]  (metres, if the pack is authored to scale)`);

  if (nodes.length > 1) {
    console.log("  parts:");
    for (const node of nodes.slice(0, 12)) {
      const part = bounds(points.slice(node.from, node.to));
      console.log(`    ${node.name.padEnd(28)} n=${String(node.to - node.from).padStart(5)}  size [${round(part.size).join(", ")}]`);
    }
    if (nodes.length > 12) console.log(`    … ${nodes.length - 12} more`);
  }

  // Profile along `--axis x|y|z` (default: the longest bbox axis — a gun
  // authored along X profits nothing from a Z profile). Per slice: vertex
  // count, the centroid on the two cross axes, and their spread. A barrel
  // shows up as a narrow, consistent-centroid run at one end; the end-slice
  // centroids are the bore/grip axis positions a viewmodel fit needs.
  const axisName = valueOf("--axis") ?? ["x", "y", "z"][whole.size.indexOf(Math.max(...whole.size))];
  const axis = { x: 0, y: 1, z: 2 }[axisName] ?? 2;
  const cross = [0, 1, 2].filter((a) => a !== axis);
  const [aMin, aMax] = [whole.min[axis], whole.max[axis]];
  const crossName = ["x", "y", "z"];
  console.log(`  ${crossName[axis].toUpperCase()} profile — a narrow, steady-centroid run at one end is the muzzle/tip:`);
  console.log(`    slice              n   ${crossName[cross[0]]} centre±spread   ${crossName[cross[1]]} centre±spread`);
  const slices = 12;
  const endCentroids = [];
  for (let i = 0; i < slices; i += 1) {
    const lo = aMin + ((aMax - aMin) * i) / slices;
    const hi = aMin + ((aMax - aMin) * (i + 1)) / slices;
    const inSlice = points.filter((p) => p[axis] >= lo && (i === slices - 1 ? p[axis] <= hi : p[axis] < hi));
    const label = `[${lo >= 0 ? "+" : ""}${lo.toFixed(2)},${hi >= 0 ? "+" : ""}${hi.toFixed(2)}]`;
    if (inSlice.length === 0) {
      console.log(`    ${label.padEnd(16)} —`);
      continue;
    }
    const cols = [];
    const centroid = [];
    for (const c of cross) {
      let cLo = Infinity, cHi = -Infinity, sum = 0;
      for (const p of inSlice) { if (p[c] < cLo) cLo = p[c]; if (p[c] > cHi) cHi = p[c]; sum += p[c]; }
      const mean = sum / inSlice.length;
      centroid.push(mean);
      cols.push(`${mean >= 0 ? "+" : ""}${mean.toFixed(3)}±${((cHi - cLo) / 2).toFixed(3)}`);
    }
    if (i === 0 || i === slices - 1) endCentroids.push({ slice: label, centroid });
    console.log(`    ${label.padEnd(16)} ${String(inSlice.length).padStart(5)}  ${cols[0].padStart(17)}  ${cols[1].padStart(17)}`);
  }
  for (const end of endCentroids) {
    console.log(`    end ${end.slice} centroid ${crossName[cross[0]]}=${end.centroid[0].toFixed(3)} ${crossName[cross[1]]}=${end.centroid[1].toFixed(3)}`);
  }
}

// ------------------------------------------------------------------ archives

/** Minimal store/deflate zip reader — enough for asset packs, no dependencies. */
function unzip(buffer) {
  const endSignature = 0x06054b50;
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== endSignature) end -= 1;
  if (end < 0) throw new Error("not a zip (no end-of-central-directory record)");
  const entryCount = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    if (!name.endsWith("/")) {
      entries.push({ name, data: () => (method === 0 ? raw : inflateRawSync(raw)) });
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// ---------------------------------------------------------------------- main

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function readLock() {
  if (!existsSync(lockPath)) return {};
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch {
    return {};
  }
}

function listGlbs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listGlbs(full));
    else if (entry.name.endsWith(".glb") || entry.name.endsWith(".gltf")) out.push(full);
  }
  return out;
}

async function download(source, lock) {
  const outDir = join(modelsDir, source.target);
  if (source.url === null) {
    console.log(`\n■ ${source.id} — ${source.what}`);
    console.log(`  ${source.why.replace(/\s+/g, " ")}`);
    console.log(`  license: ${source.license}   →  client/public/models/${source.target}/`);
    console.log("  MANUAL — no stable direct link; do this once, then re-run with --verify:");
    for (const line of source.manual) console.log(`    ${line}`);
    return { id: source.id, status: "manual" };
  }
  console.log(`\n■ ${source.id} — fetching ${source.url}`);
  const response = await fetch(source.url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256(buffer);
  const expected = lock[source.id]?.sha256;
  if (expected !== undefined && expected !== digest) {
    throw new Error(
      `${source.id}: upstream file changed.\n` +
      `  locked   ${expected}\n  received ${digest}\n` +
      "  Inspect it, then delete the lock entry to accept the new version.",
    );
  }
  mkdirSync(outDir, { recursive: true });
  let written = 0;
  if (source.url.endsWith(".zip")) {
    for (const entry of unzip(buffer)) {
      const name = source.pick ? source.pick(entry.name) : entry.name.split("/").pop();
      if (name === undefined || name === null) continue;
      const data = entry.data();
      if (name.endsWith(".glb")) parseGlb(data); // validate before writing
      writeFileSync(join(outDir, name), data);
      written += 1;
    }
  } else {
    parseGlb(buffer);
    writeFileSync(join(outDir, source.url.split("/").pop()), buffer);
    written = 1;
  }
  console.log(`  ok — ${written} file(s), sha256 ${digest.slice(0, 16)}…`);
  return { id: source.id, status: "fetched", sha256: digest, bytes: buffer.length, files: written };
}

async function main() {
  const inspectPath = valueOf("--inspect");
  if (inspectPath !== undefined) {
    inspect(join(process.cwd(), inspectPath));
    return;
  }

  if (has("--verify")) {
    console.log("Verifying models on disk (no network).\n");
    let bad = 0;
    for (const path of listGlbs(modelsDir)) {
      try {
        parseGlb(readFileSync(path));
      } catch (error) {
        console.error(`  BAD ${relative(root, path)} — ${error.message}`);
        bad += 1;
      }
    }
    const total = listGlbs(modelsDir).length;
    console.log(`\n${total - bad}/${total} glb files parse cleanly.`);
    for (const source of SOURCES) {
      const dir = join(modelsDir, source.target);
      const found = listGlbs(dir).length;
      console.log(`  ${found > 0 ? "✓" : "·"} ${source.id.padEnd(14)} ${found} file(s) in models/${source.target}/`);
    }
    process.exitCode = bad > 0 ? 1 : 0;
    return;
  }

  const only = valueOf("--only");
  const wanted = only === undefined ? SOURCES : SOURCES.filter((s) => s.id === only);
  if (wanted.length === 0) {
    console.error(`unknown --only '${only}'. Known: ${SOURCES.map((s) => s.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const lock = readLock();
  const results = [];
  for (const source of wanted) results.push(await download(source, lock));

  for (const result of results) {
    if (result.status === "fetched") {
      lock[result.id] = { sha256: result.sha256, bytes: result.bytes, files: result.files, fetchedAt: new Date().toISOString() };
    }
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const manual = results.filter((r) => r.status === "manual");
  console.log("\n———");
  console.log(`${results.length - manual.length} fetched, ${manual.length} awaiting a manual download.`);
  console.log("Next, for anything new on disk:");
  console.log("  1. node tools/fetch-models.mjs --inspect <path>   # measure scale + forward axis");
  console.log("  2. add the path to client/src/game/models/manifest.ts");
  console.log("  3. add a pack row to CREDITS.md (source, author, license)");
  console.log("  4. pnpm audit:assets                              # gates 2 and 3");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
