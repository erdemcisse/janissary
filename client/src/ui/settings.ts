export type GraphicsQuality = "low" | "medium" | "high";

export interface StoredSettings {
  sensitivityScale: number;
  master: number;
  sfx: number;
  music: number;
  nameplateMedals: boolean;
  fov: number;
  quality: GraphicsQuality;
  colorblindPalette: boolean;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  sensitivityScale: 1,
  master: 1,
  sfx: 1,
  music: 1,
  nameplateMedals: false,
  fov: 72,
  quality: "high",
  colorblindPalette: false,
};

function clampSetting(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem("janissary-settings");
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return {
      sensitivityScale: clampSetting(parsed.sensitivityScale, 0.5, 2, DEFAULT_SETTINGS.sensitivityScale),
      master: clampSetting(parsed.master, 0, 1, DEFAULT_SETTINGS.master),
      sfx: clampSetting(parsed.sfx, 0, 1, DEFAULT_SETTINGS.sfx),
      music: clampSetting(parsed.music, 0, 1, DEFAULT_SETTINGS.music),
      nameplateMedals: typeof parsed.nameplateMedals === "boolean" ? parsed.nameplateMedals : DEFAULT_SETTINGS.nameplateMedals,
      fov: clampSetting(parsed.fov, 60, 110, DEFAULT_SETTINGS.fov),
      quality: parsed.quality === "low" || parsed.quality === "medium" || parsed.quality === "high" ? parsed.quality : DEFAULT_SETTINGS.quality,
      colorblindPalette: typeof parsed.colorblindPalette === "boolean" ? parsed.colorblindPalette : DEFAULT_SETTINGS.colorblindPalette,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
