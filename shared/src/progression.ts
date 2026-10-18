import {
  ContractKind,
  MAX_DAILY_CONTRACTS,
  MEDAL_KIND_COUNT,
  MedalKind,
  Team,
} from "./constants";

export const XP_CAPTURE_PRESENCE_PER_SECOND = 2;
export const XP_POINT_CAPTURED = 150;
export const XP_KILL = 40;
export const XP_ASSIST = 15;
export const XP_DEFENSE_KILL = 60;
export const XP_WAR_VICTORY = 200;
export const XP_WAR_PARTICIPATION = 75;
export const WAR_PARTICIPATION_MIN_SECONDS = 180;
export const WELCOME_BACK_MULTIPLIER = 1.5;
export const IDLE_XP_CUTOFF_SECONDS = 90;
export const ANTI_FARM_MAX_KILLS_PER_VICTIM = 3;
export const ANTI_FARM_WINDOW_SECONDS = 60;
export const ANTI_FARM_DECAY = 0.25;
export const BEST_MARKSMAN_MIN_SHOTS = 20;
export const MAX_PRESTIGE = 5;
export const GATE_KILL_RADIUS = 8;

export function xpForNextRank(rank: number): number {
  return Math.round(150 * Math.pow(rank, 1.5));
}

export const RANKS: Readonly<Record<number, readonly string[]>> = {
  [Team.Ottoman]: [
    "Acemi Oğlan",
    "Azap",
    "Yaya",
    "Yeniçeri",
    "Odabaşı",
    "Bölükbaşı",
    "Çorbacı",
    "Ağa",
    "Sancakbeyi",
    "Pasha",
  ],
  [Team.Byzantine]: [
    "Militiaman",
    "Stratiotes",
    "Skoutatos",
    "Dekarchos",
    "Pentekontarchos",
    "Kentarchos",
    "Tourmarches",
    "Strategos",
    "Domestikos",
    "Megas Domestikos",
  ],
};

export const PRESTIGE_TITLE: Readonly<Record<number, string>> = {
  [Team.Ottoman]: "Gazi",
  [Team.Byzantine]: "Defender of the City",
};

export function rankTitle(team: Team, rank: number): string {
  const ladder = RANKS[team];
  if (ladder === undefined) return "Recruit";
  const clamped = Math.max(1, Math.min(10, Math.round(rank)));
  return ladder[clamped - 1] ?? "Recruit";
}

export function prestigeTitle(team: Team): string {
  return PRESTIGE_TITLE[team] ?? "Prestige";
}

export function rankTier(rank: number): number {
  if (rank >= 7) return 2;
  if (rank >= 4) return 1;
  return 0;
}

export interface CareerAdvancement {
  readonly rank: number;
  readonly prestige: number;
  readonly xp: number;
  readonly leveled: boolean;
  readonly prestiged: boolean;
}

export function advanceCareer(xp: number, rank: number, prestige: number): CareerAdvancement {
  let currentXp = xp;
  let currentRank = rank;
  let currentPrestige = prestige;
  let leveled = false;
  let prestiged = false;
  for (let guard = 0; guard < 64; guard += 1) {
    const cost = xpForNextRank(currentRank);
    if (currentXp < cost) break;
    if (currentRank < 10) {
      currentXp -= cost;
      currentRank += 1;
      leveled = true;
    } else if (currentPrestige < MAX_PRESTIGE) {
      currentXp -= cost;
      currentPrestige += 1;
      currentRank = 1;
      leveled = true;
      prestiged = true;
    } else {
      currentXp = Math.max(0, cost - 1);
      break;
    }
  }
  return { rank: currentRank, prestige: currentPrestige, xp: currentXp, leveled, prestiged };
}

export interface ContractDefinition {
  readonly kind: ContractKind;
  readonly target: number;
  readonly reward: number;
  readonly description: string;
}

export const CONTRACT_POOL: readonly ContractDefinition[] = [
  { kind: ContractKind.CapturePoints, target: 2, reward: 150, description: "Capture the gate 2 times" },
  { kind: ContractKind.KillsAtGate, target: 5, reward: 200, description: "Get 5 kills at the gate" },
  { kind: ContractKind.WarWin, target: 1, reward: 250, description: "Win 1 war" },
  { kind: ContractKind.Assists, target: 3, reward: 150, description: "Score 3 assists" },
  { kind: ContractKind.DefenseKills, target: 2, reward: 200, description: "Get 2 defense kills" },
  // Phase 8c-7: the pool covered only the gate; these teach the 8c-4/8c-4b
  // content that exists — cavalry, galleys, breaches, bombard crews, and
  // rider-dismount play. Each maps 1:1 to an XpSource the server already emits.
  { kind: ContractKind.CavalryKills, target: 2, reward: 200, description: "Make 2 kills from horseback" },
  { kind: ContractKind.GalleyKills, target: 2, reward: 200, description: "Score 2 kills from a galley gun" },
  { kind: ContractKind.BreachCreated, target: 1, reward: 250, description: "Open a breach in the wall" },
  { kind: ContractKind.ArtilleryKills, target: 2, reward: 200, description: "Score 2 kills with a bombard" },
  { kind: ContractKind.RidersUnhorsed, target: 2, reward: 150, description: "Unhorse 2 enemy riders" },
];

export function contractDefinition(kind: number): ContractDefinition | undefined {
  return CONTRACT_POOL.find((contract) => contract.kind === kind);
}

export function rollDailyContracts(random: () => number = Math.random): ContractDefinition[] {
  const pool = [...CONTRACT_POOL];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(pool.length - 1, Math.floor(random() * (index + 1)));
    const current = pool[index];
    const swap = pool[swapIndex];
    if (current !== undefined && swap !== undefined) {
      pool[index] = swap;
      pool[swapIndex] = current;
    }
  }
  return pool.slice(0, MAX_DAILY_CONTRACTS);
}

export interface MedalDefinition {
  readonly title: string;
  readonly description: string;
}

export const MEDAL_DEFINITIONS: Readonly<Record<MedalKind, MedalDefinition>> = {
  [MedalKind.MostCaptures]: { title: "Most Captures", description: "Captured the gate most often this war" },
  [MedalKind.BestMarksman]: { title: "Best Marksman", description: "Highest accuracy with at least 20 shots" },
  [MedalKind.GateKeeper]: { title: "Gate Keeper", description: "Most defense kills at the gate" },
  [MedalKind.VeteranPresence]: { title: "Veteran Presence", description: "Most time spent on the point" },
};

export function medalDefinition(kind: number): MedalDefinition | undefined {
  return MEDAL_DEFINITIONS[kind as MedalKind];
}

export function medalMaskCount(mask: number): number {
  let count = 0;
  for (let kind = 1; kind <= MEDAL_KIND_COUNT; kind += 1) if ((mask & (1 << (kind - 1))) !== 0) count += 1;
  return count;
}
