#!/usr/bin/env node
// Fetches the Google Fonts families used by the HUD/UI overhaul as self-hosted
// woff2 subsets (latin + latin-ext), so the client ships its own font files
// with a named OFL license per family. One-off tooling, not part of the build.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "client/public/fonts");
mkdirSync(outDir, { recursive: true });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

const FAMILIES = [
  { slug: "alegreya-sans", query: "Alegreya+Sans:wght@400;500;700;800" },
  { slug: "ibm-plex-mono", query: "IBM+Plex+Mono:wght@400;500;600;700" },
  { slug: "reem-kufi", query: "Reem+Kufi:wght@400..700" },
  { slug: "uncial-antiqua", query: "Uncial+Antiqua" },
];

const KEEP_SUBSETS = new Set(["latin", "latin-ext"]);

let cssOut = "";
for (const family of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${family.query}&display=swap`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) throw new Error(`fetch failed ${response.status} for ${family.slug}`);
  const css = await response.text();
  const blocks = css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g);
  for (const block of blocks) {
    const subset = block[1];
    if (!KEEP_SUBSETS.has(subset)) continue;
    const body = block[2];
    const weight = /font-weight:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? "400";
    const src = /url\((https:[^)]+)\)/.exec(body)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim() ?? "";
    if (src === undefined) continue;
    const weightSlug = weight.replace(/[^\d]/g, "");
    const file = `${family.slug}-${weightSlug}-${subset}.woff2`;
    const fontResponse = await fetch(src, { headers: { "User-Agent": UA } });
    if (!fontResponse.ok) throw new Error(`font fetch failed ${fontResponse.status} for ${file}`);
    writeFileSync(join(outDir, file), Buffer.from(await fontResponse.arrayBuffer()));
    const familyName = /font-family:\s*'([^']+)'/.exec(body)?.[1] ?? family.slug;
    cssOut += `@font-face {\n  font-family: '${familyName}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: FONTDISPLAY;\n  src: url('/fonts/${file}') format('woff2');\n  unicode-range: ${range};\n}\n`;
    console.log(`ok ${file}`);
  }
}
writeFileSync(join(root, "client/public/fonts/fonts.css.snippet"), cssOut);
console.log("snippet written");
