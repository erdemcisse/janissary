import { Team } from "./constants";

export const MEDAL_CATEGORY_COUNT = 8;

/**
 * Tiered medal categories. Counters accumulate per category per player and are
 * persisted server-side; the server computes the tier on threshold crossing and
 * emits a reliable unlock event. Thresholds are tuned so bronze is reachable in
 * a few sessions, silver takes real investment, and gold is a long-term goal.
 */
export const enum MedalCategory {
  Marksman = 1,
  WallBreaker = 2,
  GateKeeper = 3,
  SeaWolf = 4,
  StandardBearer = 5,
  Cavalry = 6,
  Veteran = 7,
  Loyalist = 8,
}

export const enum MedalTier {
  Bronze = 1,
  Silver = 2,
  Gold = 3,
}

export interface MedalThresholds {
  readonly bronze: number;
  readonly silver: number;
  readonly gold: number;
}

export const MEDAL_THRESHOLDS: Readonly<Record<MedalCategory, MedalThresholds>> = {
  [MedalCategory.Marksman]: { bronze: 40, silver: 250, gold: 1_000 },
  [MedalCategory.WallBreaker]: { bronze: 1_200, silver: 6_000, gold: 24_000 },
  [MedalCategory.GateKeeper]: { bronze: 10, silver: 60, gold: 250 },
  [MedalCategory.SeaWolf]: { bronze: 8, silver: 40, gold: 150 },
  [MedalCategory.StandardBearer]: { bronze: 15, silver: 100, gold: 400 },
  [MedalCategory.Cavalry]: { bronze: 10, silver: 60, gold: 250 },
  [MedalCategory.Veteran]: { bronze: 5, silver: 25, gold: 100 },
  [MedalCategory.Loyalist]: { bronze: 3, silver: 15, gold: 50 },
};

/**
 * Loyalist honors wins at volume; a minimum wars-played floor (two wars per win)
 * keeps a lucky early win streak from earning a medal.
 */
export const LOYALIST_WARS_PER_WIN_FLOOR = 2;

export function loyalistWarsFloor(wins: number): number {
  return wins * LOYALIST_WARS_PER_WIN_FLOOR;
}

export function loyalistEligible(wins: number, wars: number): boolean {
  return wars >= loyalistWarsFloor(wins);
}

export interface MedalProgress {
  readonly tier: MedalTier | 0;
  readonly nextThreshold: number;
  readonly intoTier: number;
}

/**
 * Computes the current tier for a category. Veteran counts wars and Loyalist
 * counts wins against the wars-played floor; all other categories are pure
 * cumulative counters.
 */
export function medalTier(category: MedalCategory, value: number, wars = 0): MedalTier | 0 {
  const thresholds = MEDAL_THRESHOLDS[category];
  if (thresholds === undefined) return 0;
  const eligible = category === MedalCategory.Loyalist ? loyalistEligible(value, wars) : true;
  if (!eligible || value < thresholds.bronze) return 0;
  if (value >= thresholds.gold) return MedalTier.Gold;
  if (value >= thresholds.silver) return MedalTier.Silver;
  return MedalTier.Bronze;
}

export function medalProgress(category: MedalCategory, value: number, wars = 0): MedalProgress {
  const thresholds = MEDAL_THRESHOLDS[category];
  if (thresholds === undefined) return { tier: 0, nextThreshold: 1, intoTier: value };
  const eligible = category === MedalCategory.Loyalist ? loyalistEligible(value, wars) : true;
  if (!eligible) return { tier: 0, nextThreshold: thresholds.bronze, intoTier: value };
  if (value >= thresholds.gold) return { tier: MedalTier.Gold, nextThreshold: thresholds.gold, intoTier: thresholds.gold };
  if (value >= thresholds.silver) return { tier: MedalTier.Silver, nextThreshold: thresholds.gold, intoTier: value - thresholds.silver };
  if (value >= thresholds.bronze) return { tier: MedalTier.Bronze, nextThreshold: thresholds.silver, intoTier: value - thresholds.bronze };
  return { tier: 0, nextThreshold: thresholds.bronze, intoTier: value };
}

export const MEDAL_CATEGORY_LABELS: Readonly<Record<MedalCategory, string>> = {
  [MedalCategory.Marksman]: "Marksman",
  [MedalCategory.WallBreaker]: "Wall Breaker",
  [MedalCategory.GateKeeper]: "Gate Keeper",
  [MedalCategory.SeaWolf]: "Sea Wolf",
  [MedalCategory.StandardBearer]: "Standard Bearer",
  [MedalCategory.Cavalry]: "Cavalry",
  [MedalCategory.Veteran]: "Veteran",
  [MedalCategory.Loyalist]: "Loyalist",
};

/**
 * Visual identity data (not rendering): Ottoman decorations use a crescent-and-
 * star emblem with Kufic-style border framing; Byzantine decorations use a
 * double-headed eagle with an imperial-purple ribbon. The client renders these
 * as flat 2D medal icons.
 */
export type MedalFrame = "kufic" | "imperial";
export type MedalEmblem = "crescent-star" | "double-eagle";

export interface FactionMedalStyle {
  readonly frame: MedalFrame;
  readonly emblem: MedalEmblem;
  readonly ribbonColor: string;
  readonly accentColor: string;
}

export interface MedalIdentity {
  readonly category: MedalCategory;
  readonly tier: MedalTier;
  readonly displayName: Readonly<Record<Team, string>>;
  readonly description: string;
  readonly styles: Readonly<Record<Team, FactionMedalStyle>>;
}

const OTTOMAN_STYLE_BRONZE: FactionMedalStyle = { frame: "kufic", emblem: "crescent-star", ribbonColor: "#9c6b2f", accentColor: "#f0b35a" };
const OTTOMAN_STYLE_SILVER: FactionMedalStyle = { frame: "kufic", emblem: "crescent-star", ribbonColor: "#aeb4b8", accentColor: "#f0b35a" };
const OTTOMAN_STYLE_GOLD: FactionMedalStyle = { frame: "kufic", emblem: "crescent-star", ribbonColor: "#d4a12f", accentColor: "#f7d977" };
const BYZANTINE_STYLE_BRONZE: FactionMedalStyle = { frame: "imperial", emblem: "double-eagle", ribbonColor: "#7b4a9e", accentColor: "#c9b26a" };
const BYZANTINE_STYLE_SILVER: FactionMedalStyle = { frame: "imperial", emblem: "double-eagle", ribbonColor: "#9a9fa4", accentColor: "#c9b26a" };
const BYZANTINE_STYLE_GOLD: FactionMedalStyle = { frame: "imperial", emblem: "double-eagle", ribbonColor: "#5b2d8e", accentColor: "#e6cf7e" };

function identity(
  category: MedalCategory,
  tier: MedalTier,
  ottoman: string,
  byzantine: string,
  description: string,
): MedalIdentity {
  return {
    category,
    tier,
    displayName: { [Team.None]: ottoman, [Team.Ottoman]: ottoman, [Team.Byzantine]: byzantine },
    description,
    styles: {
      [Team.None]: tier === MedalTier.Bronze ? OTTOMAN_STYLE_BRONZE : tier === MedalTier.Silver ? OTTOMAN_STYLE_SILVER : OTTOMAN_STYLE_GOLD,
      [Team.Ottoman]: tier === MedalTier.Bronze ? OTTOMAN_STYLE_BRONZE : tier === MedalTier.Silver ? OTTOMAN_STYLE_SILVER : OTTOMAN_STYLE_GOLD,
      [Team.Byzantine]: tier === MedalTier.Bronze ? BYZANTINE_STYLE_BRONZE : tier === MedalTier.Silver ? BYZANTINE_STYLE_SILVER : BYZANTINE_STYLE_GOLD,
    },
  };
}

export const MEDAL_IDENTITIES: Readonly<Record<number, Readonly<Record<MedalTier, MedalIdentity>>>> = {
  [MedalCategory.Marksman]: {
    [MedalTier.Bronze]: identity(MedalCategory.Marksman, MedalTier.Bronze, "Nişancı", "Toxotes", "40 accurate hits"),
    [MedalTier.Silver]: identity(MedalCategory.Marksman, MedalTier.Silver, "Nişancıbaşı", "Kleisourarches", "250 accurate hits"),
    [MedalTier.Gold]: identity(MedalCategory.Marksman, MedalTier.Gold, "Usta Nişancı", "Megas Toxotes", "1,000 accurate hits"),
  },
  [MedalCategory.WallBreaker]: {
    [MedalTier.Bronze]: identity(MedalCategory.WallBreaker, MedalTier.Bronze, "Duvar Delen", "Teichokopos", "1,200 wall damage"),
    [MedalTier.Silver]: identity(MedalCategory.WallBreaker, MedalTier.Silver, "Bombardırcı", "Helepolis", "6,000 wall damage"),
    [MedalTier.Gold]: identity(MedalCategory.WallBreaker, MedalTier.Gold, "Surların Yıkıcısı", "Teicholetsis", "24,000 wall damage"),
  },
  [MedalCategory.GateKeeper]: {
    [MedalTier.Bronze]: identity(MedalCategory.GateKeeper, MedalTier.Bronze, "Kapı Bekçisi", "Pyloros", "10 defense kills at a held point"),
    [MedalTier.Silver]: identity(MedalCategory.GateKeeper, MedalTier.Silver, "Surların Muhafızı", "Phylax", "60 defense kills at a held point"),
    [MedalTier.Gold]: identity(MedalCategory.GateKeeper, MedalTier.Gold, "Kale Aslanı", "Akrites", "250 defense kills at a held point"),
  },
  [MedalCategory.SeaWolf]: {
    [MedalTier.Bronze]: identity(MedalCategory.SeaWolf, MedalTier.Bronze, "Deniz Kurdu", "Thalassokrator", "8 naval kills and sinkings"),
    [MedalTier.Silver]: identity(MedalCategory.SeaWolf, MedalTier.Silver, "Kaptan-ı Derya", "Navarchos", "40 naval kills and sinkings"),
    [MedalTier.Gold]: identity(MedalCategory.SeaWolf, MedalTier.Gold, "Boğazların Efendisi", "Archithalassites", "150 naval kills and sinkings"),
  },
  [MedalCategory.StandardBearer]: {
    [MedalTier.Bronze]: identity(MedalCategory.StandardBearer, MedalTier.Bronze, "Sancaktar", "Bandophoros", "15 support aura assist credits"),
    [MedalTier.Silver]: identity(MedalCategory.StandardBearer, MedalTier.Silver, "Alay Sancağı", "Protobandophoros", "100 support aura assist credits"),
    [MedalTier.Gold]: identity(MedalCategory.StandardBearer, MedalTier.Gold, "İmparatorluk Sancağı", "Vexillifer", "400 support aura assist credits"),
  },
  [MedalCategory.Cavalry]: {
    [MedalTier.Bronze]: identity(MedalCategory.Cavalry, MedalTier.Bronze, "Sipahi", "Hippeis", "10 mounted kills"),
    [MedalTier.Silver]: identity(MedalCategory.Cavalry, MedalTier.Silver, "Akıncı", "Kataphraktos", "60 mounted kills"),
    [MedalTier.Gold]: identity(MedalCategory.Cavalry, MedalTier.Gold, "Savaş Lordu", "Megas Domesticos", "250 mounted kills"),
  },
  [MedalCategory.Veteran]: {
    [MedalTier.Bronze]: identity(MedalCategory.Veteran, MedalTier.Bronze, "Gazi", "Stratiotes", "5 wars fought"),
    [MedalTier.Silver]: identity(MedalCategory.Veteran, MedalTier.Silver, "Kıdemli Savaşçı", "Veteranos", "25 wars fought"),
    [MedalTier.Gold]: identity(MedalCategory.Veteran, MedalTier.Gold, "Efsanevi Gazi", "Athanatos", "100 wars fought"),
  },
  [MedalCategory.Loyalist]: {
    [MedalTier.Bronze]: identity(MedalCategory.Loyalist, MedalTier.Bronze, "Sadık Asker", "Pistos", "3 wins with at least 6 wars"),
    [MedalTier.Silver]: identity(MedalCategory.Loyalist, MedalTier.Silver, "Sancak Taşıyan", "Symmachos", "15 wins with at least 30 wars"),
    [MedalTier.Gold]: identity(MedalCategory.Loyalist, MedalTier.Gold, "Devletine Bağlı", "Philos", "50 wins with at least 100 wars"),
  },
};

export function medalIdentity(category: MedalCategory, tier: MedalTier): MedalIdentity | undefined {
  return MEDAL_IDENTITIES[category]?.[tier];
}

export function medalDisplayName(category: MedalCategory, tier: MedalTier, faction: Team): string {
  return medalIdentity(category, tier)?.displayName[faction] ?? MEDAL_CATEGORY_LABELS[category] ?? "Medal";
}
