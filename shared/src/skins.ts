import { PlayerClass, Team } from "./constants";
import { MEDAL_CATEGORY_COUNT, medalTier, MedalTier } from "./medals";

export type SkinUnlock =
  | { readonly kind: "rank"; readonly faction: Team; readonly rank: number }
  | { readonly kind: "gold-medal"; readonly faction: Team };

export interface SkinDefinition {
  readonly id: string;
  readonly class: PlayerClass;
  readonly name: string;
  readonly description: string;
  readonly unlock: SkinUnlock;
  readonly art: string;
}

/**
 * Phase 8c-2 skin catalog: two progression skins per class — a rank-6
 * "veteran" variant and a gold-medal "elite" variant. Unlocks are
 * progression-derived only (a rank milestone per faction, or any gold-tier
 * medal per faction) — no currency, no purchase flow. `art` references the
 * Phase 8c-2 model variant, keyed 1:1 with the geometry palettes in
 * client/src/game/characters/soldierModels.ts.
 */
export const SKIN_DEFINITIONS: readonly SkinDefinition[] = [
  {
    id: "janissary-veteran",
    class: PlayerClass.Janissary,
    name: "Veteran Janissary",
    description: "Weathered campaign armor from the Balkan frontier",
    unlock: { kind: "rank", faction: Team.Ottoman, rank: 6 },
    art: "skins/janissary-veteran",
  },
  {
    id: "janissary-banneret",
    class: PlayerClass.Janissary,
    name: "Sancak Banneret",
    description: "Banner-bearer panoply for a gold-medal hero",
    unlock: { kind: "gold-medal", faction: Team.Ottoman },
    art: "skins/janissary-banneret",
  },
  {
    id: "sipahi-veteran",
    class: PlayerClass.Sipahi,
    name: "Frontier Sipahi",
    description: "Timariot horseman seasoned on the Rumelian marches",
    unlock: { kind: "rank", faction: Team.Ottoman, rank: 6 },
    art: "skins/sipahi-veteran",
  },
  {
    id: "sipahi-kapikulu",
    class: PlayerClass.Sipahi,
    name: "Kapıkulu Horseman",
    description: "Gilded panoply of the Porte's household cavalry",
    unlock: { kind: "gold-medal", faction: Team.Ottoman },
    art: "skins/sipahi-kapikulu",
  },
  {
    id: "topcu-veteran",
    class: PlayerClass.Topcu,
    name: "Veteran Topçu",
    description: "Powder-stained apron of a siege-train gunner",
    unlock: { kind: "rank", faction: Team.Ottoman, rank: 6 },
    art: "skins/topcu-veteran",
  },
  {
    id: "topcu-usta",
    class: PlayerClass.Topcu,
    name: "Topçu Usta",
    description: "Master gunner's sash over a gilt-trimmed kaftan",
    unlock: { kind: "gold-medal", faction: Team.Ottoman },
    art: "skins/topcu-usta",
  },
  {
    id: "mehter-veteran",
    class: PlayerClass.Mehter,
    name: "Veteran Mehter",
    description: "Campaign-worn drum and sash of the mehterhane",
    unlock: { kind: "rank", faction: Team.Ottoman, rank: 6 },
    art: "skins/mehter-veteran",
  },
  {
    id: "mehter-basi",
    class: PlayerClass.Mehter,
    name: "Mehterbaşı",
    description: "Crimson-and-gold kaftan of the bandmaster",
    unlock: { kind: "gold-medal", faction: Team.Ottoman },
    art: "skins/mehter-basi",
  },
  {
    id: "guardsman-elite",
    class: PlayerClass.Guardsman,
    name: "Elite Guardsman",
    description: "Gilded scale armor of the palace guard",
    unlock: { kind: "rank", faction: Team.Byzantine, rank: 6 },
    art: "skins/guardsman-elite",
  },
  {
    id: "guardsman-archon",
    class: PlayerClass.Guardsman,
    name: "Imperial Archon",
    description: "Purple-bordered panoply of a decorated defender",
    unlock: { kind: "gold-medal", faction: Team.Byzantine },
    art: "skins/guardsman-archon",
  },
  {
    id: "knight-veteran",
    class: PlayerClass.Knight,
    name: "Veteran Knight",
    description: "Scarred harness of a Latin mercenary in imperial pay",
    unlock: { kind: "rank", faction: Team.Byzantine, rank: 6 },
    art: "skins/knight-veteran",
  },
  {
    id: "knight-tagmata",
    class: PlayerClass.Knight,
    name: "Tagmatic Knight",
    description: "Gilded harness of the tagmata heavy horse",
    unlock: { kind: "gold-medal", faction: Team.Byzantine },
    art: "skins/knight-tagmata",
  },
  {
    id: "wallgunner-veteran",
    class: PlayerClass.WallGunner,
    name: "Veteran Wall Gunner",
    description: "Militia crossbowman of the Theodosian battlements",
    unlock: { kind: "rank", faction: Team.Byzantine, rank: 6 },
    art: "skins/wallgunner-veteran",
  },
  {
    id: "wallgunner-toxotes",
    class: PlayerClass.WallGunner,
    name: "Imperial Toxotes",
    description: "Purple-trimmed mail of the palace crossbow guard",
    unlock: { kind: "gold-medal", faction: Team.Byzantine },
    art: "skins/wallgunner-toxotes",
  },
  {
    id: "priest-veteran",
    class: PlayerClass.Priest,
    name: "Veteran Priest",
    description: "Threadbare rason of a chaplain who marched with the militia",
    unlock: { kind: "rank", faction: Team.Byzantine, rank: 6 },
    art: "skins/priest-veteran",
  },
  {
    id: "priest-patriarchal",
    class: PlayerClass.Priest,
    name: "Patriarchal Priest",
    description: "Gold-embroidered vestments blessed at Hagia Sophia",
    unlock: { kind: "gold-medal", faction: Team.Byzantine },
    art: "skins/priest-patriarchal",
  },
];

export interface SkinCareerView {
  readonly rank: number;
  readonly prestige: number;
}

export function skinDefinition(id: string): SkinDefinition | undefined {
  return SKIN_DEFINITIONS.find((skin) => skin.id === id);
}

/**
 * Pure unlock predicate shared by the server (authority) and the client
 * (display). Rank skins unlock at the faction milestone on that faction's
 * career; gold-medal skins unlock when any medal category reaches gold tier.
 */
export function skinUnlocked(
  skin: SkinDefinition,
  careerByFaction: Readonly<Record<number, SkinCareerView | undefined>>,
  medalTiers: readonly (MedalTier | 0)[],
): boolean {
  if (skin.unlock.kind === "rank") {
    const career = careerByFaction[skin.unlock.faction];
    return career !== undefined && career.rank >= skin.unlock.rank;
  }
  return medalTiers.some((tier) => tier === MedalTier.Gold);
}

export function goldMedalTiers(medalCounters: readonly { category: number; value: number }[], wars: number): readonly (MedalTier | 0)[] {
  const tiers: (MedalTier | 0)[] = [];
  for (let category = 1; category <= MEDAL_CATEGORY_COUNT; category += 1) {
    const counter = medalCounters.find((entry) => entry.category === category);
    tiers.push(medalTier(category as Parameters<typeof medalTier>[0], counter?.value ?? 0, wars));
  }
  return tiers;
}

export function skinUnlockLabel(skin: SkinDefinition): string {
  if (skin.unlock.kind === "rank") {
    const ladder = skin.unlock.faction === Team.Ottoman
      ? "Acemi Oğlan, Azap, Yaya, Yeniçeri, Odabaşı, Bölükbaşı, Çorbacı, Ağa, Sancakbeyi, Pasha"
      : "Militiaman, Stratiotes, Skoutatos, Dekarchos, Pentekontarchos, Kentarchos, Tourmarches, Strategos, Domestikos, Megas Domestikos";
    const title = ladder.split(", ")[skin.unlock.rank - 1] ?? `rank ${skin.unlock.rank}`;
    return `Unlocks at ${title} rank`;
  }
  return "Unlocks with any gold-tier medal";
}
