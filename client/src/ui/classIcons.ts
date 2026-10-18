import { PlayerClass } from "@janissary/shared";

/**
 * Phase 8e-14 class identity tiles — the owner's parchment sprite sheet
 * (client/models-inbox/class-icon-set.png) sliced and downscaled by
 * tools/prep-ui.mjs into client/public/ui/. Mapping follows the phase
 * brief's sprite map; the three approximate picks (no drum or knight glyph
 * exists in the sheet) are documented in ADR 0046 §2.
 */

export interface ClassIcon {
  readonly src: string;
  readonly alt: string;
}

/** Cavalry mount indicator tile — the horse, shown by LoadoutHud while mounted. */
export const MOUNT_ICON: ClassIcon = { src: "/ui/class-icon-horse.webp", alt: "Horse" };

const CLASS_ICONS: Readonly<Partial<Record<PlayerClass, ClassIcon>>> = {
  [PlayerClass.Janissary]: { src: "/ui/class-icon-musket.webp", alt: "Musket" },
  [PlayerClass.Sipahi]: MOUNT_ICON,
  [PlayerClass.Topcu]: { src: "/ui/class-icon-cannon.webp", alt: "Cannon" },
  [PlayerClass.Mehter]: { src: "/ui/class-icon-kilij.webp", alt: "Kilij" },
  [PlayerClass.Guardsman]: { src: "/ui/class-icon-shield.webp", alt: "Shield" },
  [PlayerClass.Knight]: { src: "/ui/class-icon-helm.webp", alt: "Great helm" },
  [PlayerClass.WallGunner]: { src: "/ui/class-icon-crossbow.webp", alt: "Crossbow" },
  [PlayerClass.Priest]: { src: "/ui/class-icon-banner.webp", alt: "Banner" },
};

/** Tile for a playable class; undefined for PlayerClass.None. */
export function classIcon(playerClass: PlayerClass): ClassIcon | undefined {
  return CLASS_ICONS[playerClass];
}

/** Every tile path — used by index.html preloading checks and the asset test. */
export const CLASS_ICON_FILES: readonly string[] = Object.values(CLASS_ICONS).map((icon) => icon.src);
