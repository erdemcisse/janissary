import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PlayerClass } from "@janissary/shared";
import { CLASS_ICON_FILES, MOUNT_ICON, classIcon } from "../src/ui/classIcons";
import { SELECTABLE_CLASSES } from "../src/ui/ClassPicker";

/**
 * Phase 8e-14 UI skin regression cover: the owner-approved medieval class
 * tiles ship from client/public/ui/ and the class picker must show one per
 * selectable class. Pins the mapping ↔ disk relationship so a re-run of
 * tools/prep-ui.mjs (or a rename) can't silently drop a tile:
 *
 *   (a) every selectable class resolves a tile with a canonical path;
 *   (b) each tile file actually exists under public/ui/;
 *   (c) no two classes share a tile (the mount indicator MAY reuse one);
 *   (d) CLASS_ICON_FILES exactly covers the class-icon-* files on disk —
 *       an orphaned or missing tile fails here, not in a player's browser.
 */

const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "ui");

describe("Phase 8e-14 class icon mapping", () => {
  it("resolves a canonical tile for every selectable class", () => {
    for (const playerClass of SELECTABLE_CLASSES) {
      const icon = classIcon(playerClass);
      expect(icon, `class ${playerClass} has no icon`).toBeDefined();
      expect(icon?.src).toMatch(/^\/ui\/class-icon-[a-z]+\.webp$/);
      expect(icon?.alt.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("every mapped tile exists on disk", () => {
    for (const playerClass of SELECTABLE_CLASSES) {
      const icon = classIcon(playerClass);
      expect(icon).toBeDefined();
      const file = join(UI_DIR, icon?.src.replace("/ui/", "") ?? "");
      expect(existsSync(file), `missing ${icon?.src}`).toBe(true);
    }
    expect(existsSync(join(UI_DIR, MOUNT_ICON.src.replace("/ui/", "")))).toBe(true);
  });

  it("no two classes share a tile", () => {
    const seen = new Map<string, PlayerClass>();
    for (const playerClass of SELECTABLE_CLASSES) {
      const icon = classIcon(playerClass);
      expect(icon).toBeDefined();
      const src = icon?.src ?? "";
      expect(seen.has(src), `${src} shared by classes ${seen.get(src)} and ${playerClass}`).toBe(false);
      seen.set(src, playerClass);
    }
  });

  it("covers exactly the class-icon-* files on disk", () => {
    const onDisk = readdirSync(UI_DIR).filter((name) => name.startsWith("class-icon-")).map((name) => `/ui/${name}`);
    expect([...CLASS_ICON_FILES].sort()).toEqual(onDisk.sort());
  });

  it("the mount indicator is the Sipahi tile", () => {
    expect(classIcon(PlayerClass.Sipahi)?.src).toBe(MOUNT_ICON.src);
  });
});
