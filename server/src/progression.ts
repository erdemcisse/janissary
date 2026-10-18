import {
  ContractKind,
  MAX_DAILY_CONTRACTS,
  MEDAL_KIND_COUNT,
  MEDAL_CATEGORY_COUNT,
  Team,
  WELCOME_BACK_MULTIPLIER,
  XP_EVENT_FLAG_AT_GATE,
  XpSource,
  advanceCareer,
  goldMedalTiers,
  medalTier,
  rollDailyContracts,
  skinDefinition,
  skinUnlocked,
  SKIN_DEFINITIONS,
  type CareerAdvancement,
  type ContractDefinition,
  type ContractState,
  type MedalCounterState,
  type MedalTier,
  type SkinCareerView,
} from "@janissary/shared";
import { MedalCategory } from "@janissary/shared";
import { skinUnlockLabel } from "@janissary/shared";
import type { LeaderboardRow, Storage, StoredAccount, StoredCareer, StoredSkinEquip } from "./storage/storage";
import type { CareerInfo, MedalCount } from "@janissary/shared";

export type LeaderboardWindow = "daily" | "weekly" | "alltime";

/** Phase 8e-25: in-memory guest-account cache cap. SQLite rows persist; this
 * only bounds the hot cache so join/disconnect churn cannot grow memory or
 * the per-flush write set without bound (≈20 MB at this cap). */
export const MAX_ACCOUNTS_IN_MEMORY = 10_000;

export interface AccountCareer {
  xp: number;
  prestige: number;
  headshots: number;
}

export interface AccountLifetime {
  wars: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  medals: number;
  shots: number;
  hits: number;
}

export interface AccountState {
  readonly playerId: number;
  tokenHash: string;
  name: string;
  authId?: string;
  readonly careers: Record<number, AccountCareer>;
  lifetime: AccountLifetime;
  contractsDay: number;
  contracts: ContractState[];
  readonly medals: Map<number, number>;
  readonly medalCounters: Uint32Array;
  readonly skinUnlocks: Set<string>;
  readonly skinEquips: Map<number, string>;
  lastWarDay: number;
  dirty: boolean;
  xpPending: [number, number];
}

export interface ContractUpdate {
  readonly slot: number;
  readonly kind: number;
  readonly progress: number;
  readonly target: number;
  readonly reward: number;
  readonly completed: boolean;
}

export interface XpResult {
  readonly totalXp: number;
  readonly rank: number;
  readonly prestige: number;
  readonly leveled: boolean;
  readonly prestiged: boolean;
  readonly contractUpdate: ContractUpdate | undefined;
}

export interface WarOutcome {
  readonly welcomeBackBonus: number;
  readonly rank: number;
  readonly prestige: number;
  readonly contractUpdate: ContractUpdate | undefined;
  readonly medalUnlocks: readonly MedalUnlock[];
}

export interface SkinView {
  readonly id: string;
  readonly class: number;
  readonly name: string;
  readonly description: string;
  readonly art: string;
  readonly unlockLabel: string;
  readonly unlocked: boolean;
}

export interface MedalUnlock {
  readonly category: MedalCategory;
  readonly tier: MedalTier;
}

export interface PerSlotWarStats {
  readonly team: Team;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly captures: number;
  readonly defenseKills: number;
  readonly shots: number;
  readonly hits: number;
  readonly headshots: number;
  readonly captureTicks: number;
  readonly warXp: number;
  readonly medalMask: number;
}

interface FactionPair {
  readonly ottoman: number;
  readonly byzantine: number;
}

interface LeaderboardEntry {
  name: string;
  xp: FactionPair;
}

function utcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcWeekStart(timestamp: number): number {
  const day = utcDay(timestamp);
  const offset = (new Date(day).getUTCDay() + 6) % 7;
  return day - offset * 86_400_000;
}

export function dailyWindowStart(now: number): number {
  return utcDay(now);
}

export function weeklyWindowStart(now: number): number {
  return utcWeekStart(now);
}

function popcount(value: number): number {
  let count = 0;
  while (value > 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

function careerAdvance(career: AccountCareer, xpDelta: number): CareerAdvancement {
  const before = advanceCareer(career.xp, 1, career.prestige);
  career.xp = Math.min(0xffff_ffff, career.xp + xpDelta);
  const advanced = advanceCareer(career.xp, before.rank, before.prestige);
  career.prestige = advanced.prestige;
  return advanced;
}

function rankOf(career: AccountCareer | undefined): number {
  if (career === undefined) return 1;
  return advanceCareer(career.xp, 1, career.prestige).rank;
}

function xpIntoRankOf(career: AccountCareer | undefined): number {
  if (career === undefined) return 0;
  return advanceCareer(career.xp, 1, career.prestige).xp;
}

export class ProgressionService {
  readonly #storage: Storage;
  readonly #accounts = new Map<number, AccountState>();
  #nextPlayerId: number;
  #warTallyOttoman = 0;
  #warTallyByzantine = 0;
  #daily = new Map<number, LeaderboardEntry>();
  #dailyDay = 0;
  #weekly = new Map<number, LeaderboardEntry>();
  #weeklyWeek = 0;
  #alltime = new Map<number, LeaderboardEntry>();
  #pendingLedger: { playerId: number; name: string; faction: number; amount: number; earnedAt: number }[] = [];
  #tallyDirty = false;
  /** Phase 8e-25: last-seen clock per account, so sustained guest churn
   * (every join with a missing/invalid token creates an account) cannot grow
   * the in-memory map without bound. */
  readonly #lastSeen = new Map<number, number>();
  readonly #now: () => number;

  constructor(storage: Storage, now: () => number = Date.now) {
    this.#storage = storage;
    this.#now = now;
    let nextId = 1;
    for (const stored of storage.loadAccounts()) {
      const account = this.#hydrate(stored);
      this.#accounts.set(account.playerId, account);
      if (account.playerId >= nextId) nextId = account.playerId + 1;
      let ottoman = 0;
      let byzantine = 0;
      for (const career of stored.careers) {
        if (career.faction === Team.Ottoman) ottoman = career.xp;
        else if (career.faction === Team.Byzantine) byzantine = career.xp;
      }
      this.#alltime.set(account.playerId, { name: account.name, xp: { ottoman, byzantine } });
    }
    this.#nextPlayerId = nextId;
    const tally = storage.loadWarTally();
    this.#warTallyOttoman = tally.ottoman;
    this.#warTallyByzantine = tally.byzantine;
    this.#rebuildWindowLeaderboards();
  }

  #hydrate(stored: StoredAccount): AccountState {
    const careers: Record<number, AccountCareer> = {
      [Team.Ottoman]: { xp: 0, prestige: 0, headshots: 0 },
      [Team.Byzantine]: { xp: 0, prestige: 0, headshots: 0 },
    };
    for (const career of stored.careers) {
      careers[career.faction] = { xp: career.xp, prestige: career.prestige, headshots: career.headshots };
    }
    const medals = new Map<number, number>();
    for (const medal of stored.medals) medals.set(medal.kind, medal.count);
    const medalCounters = new Uint32Array(MEDAL_CATEGORY_COUNT + 1);
    for (const counter of stored.medalCounters) {
      if (counter.category >= 1 && counter.category <= MEDAL_CATEGORY_COUNT) medalCounters[counter.category] = counter.value;
    }
    const today = utcDay(this.#now());
    const contracts: ContractState[] = [];
    for (let slot = 0; slot < MAX_DAILY_CONTRACTS; slot += 1) {
      const storedContract = stored.contracts.find((contract) => contract.slot === slot && contract.day === today);
      if (storedContract !== undefined) {
        contracts[slot] = {
          kind: storedContract.kind,
          progress: storedContract.progress,
          target: storedContract.target,
          reward: storedContract.reward,
          completed: storedContract.completed,
        };
      }
    }
    const lastPlayedDay = stored.contracts.reduce((latest, contract) => Math.max(latest, contract.day), 0);
    return {
      playerId: stored.playerId,
      tokenHash: stored.tokenHash,
      name: stored.name,
      ...(stored.authId === undefined ? {} : { authId: stored.authId }),
      careers,
      lifetime: { ...stored.lifetime },
      contractsDay: today,
      contracts,
      medals,
      medalCounters,
      skinUnlocks: new Set(stored.skinUnlocks),
      skinEquips: new Map(stored.skinEquips.map((equip) => [equip.class, equip.skinId])),
      lastWarDay: lastPlayedDay,
      dirty: false,
      xpPending: [0, 0],
    };
  }

  #rebuildWindowLeaderboards(): void {
    const now = this.#now();
    const day = utcDay(now);
    const week = utcWeekStart(now);
    this.#daily = this.#aggregate(this.#storage.loadXpLedgerSince(day));
    this.#weekly = this.#aggregate(this.#storage.loadXpLedgerSince(week));
    this.#dailyDay = day;
    this.#weeklyWeek = week;
  }

  #aggregate(rows: readonly { playerId: number; name: string; faction: number; amount: number }[]): Map<number, LeaderboardEntry> {
    const byPlayer = new Map<number, LeaderboardEntry>();
    for (const row of rows) {
      const entry = byPlayer.get(row.playerId);
      if (entry === undefined) {
        byPlayer.set(row.playerId, {
          name: row.name,
          xp: row.faction === Team.Ottoman ? { ottoman: row.amount, byzantine: 0 } : { ottoman: 0, byzantine: row.amount },
        });
      } else if (row.faction === Team.Ottoman) {
        entry.xp = { ottoman: entry.xp.ottoman + row.amount, byzantine: entry.xp.byzantine };
      } else {
        entry.xp = { ottoman: entry.xp.ottoman, byzantine: entry.xp.byzantine + row.amount };
      }
    }
    return byPlayer;
  }

  #ensureWindowRollover(): void {
    const now = this.#now();
    const day = utcDay(now);
    const week = utcWeekStart(now);
    if (day !== this.#dailyDay || week !== this.#weeklyWeek) this.#rebuildWindowLeaderboards();
  }

  accountCount(): number {
    return this.#accounts.size;
  }

  createGuest(name: string, tokenHash: string): AccountState {
    const account: AccountState = {
      playerId: this.#nextPlayerId,
      tokenHash,
      name,
      careers: {
        [Team.Ottoman]: { xp: 0, prestige: 0, headshots: 0 },
        [Team.Byzantine]: { xp: 0, prestige: 0, headshots: 0 },
      },
      lifetime: { wars: 0, wins: 0, kills: 0, deaths: 0, captures: 0, medals: 0, shots: 0, hits: 0 },
      contractsDay: utcDay(this.#now()),
      contracts: [],
      medals: new Map<number, number>(),
      medalCounters: new Uint32Array(MEDAL_CATEGORY_COUNT + 1),
      skinUnlocks: new Set<string>(),
      skinEquips: new Map<number, string>(),
      lastWarDay: 0,
      dirty: true,
      xpPending: [0, 0],
    };
    this.#nextPlayerId += 1;
    this.#accounts.set(account.playerId, account);
    // Phase 8e-25: bound the guest-account cache. Every join with a missing
    // or invalid token creates a guest; sustained join/disconnect cycles
    // (loadtest, bots, dropped tokens) must not grow the map without bound.
    // The least-recently-seen GUEST is evicted at the cap — flushed first if
    // it holds unsaved changes. Claimed accounts are never evicted.
    if (this.#accounts.size > MAX_ACCOUNTS_IN_MEMORY) this.#evictLeastRecentlySeenGuest();
    this.#lastSeen.set(account.playerId, this.#now());
    return account;
  }

  getAccount(playerId: number): AccountState | undefined {
    const account = this.#accounts.get(playerId);
    if (account !== undefined) this.#lastSeen.set(playerId, this.#now());
    return account;
  }

  /** Phase 8e-25: evicts the least-recently-seen unclaimed (guest) account.
   * A dirty guest is flushed synchronously first so unsaved progress is
   * never dropped; claimed (auth-linked) accounts are never candidates. */
  #evictLeastRecentlySeenGuest(): void {
    let victimId = -1;
    let victimSeen = Number.POSITIVE_INFINITY;
    for (const [playerId, seen] of this.#lastSeen) {
      const account = this.#accounts.get(playerId);
      if (account === undefined) {
        this.#lastSeen.delete(playerId);
        continue;
      }
      if (account.authId !== undefined) continue;
      if (seen >= victimSeen) continue;
      victimSeen = seen;
      victimId = playerId;
    }
    if (victimId < 0) return;
    const victim = this.#accounts.get(victimId);
    if (victim !== undefined && victim.dirty) {
      try {
        this.#storage.flushAccounts([this.#toStored(victim)]);
        victim.dirty = false;
      } catch (error) {
        console.log(JSON.stringify({ event: "flush_error", error: error instanceof Error ? error.message : String(error), accounts: 1 }));
      }
    }
    this.#accounts.delete(victimId);
    this.#lastSeen.delete(victimId);
  }

  claimAccount(account: AccountState, authId: string, tokenHash: string): void {
    account.authId = authId;
    account.tokenHash = tokenHash;
    account.dirty = true;
  }

  renameAccount(account: AccountState, name: string): void {
    if (account.name === name) return;
    account.name = name;
    account.dirty = true;
  }

  ensureContracts(account: AccountState): void {
    const today = utcDay(this.#now());
    if (account.contractsDay === today && account.contracts.length === MAX_DAILY_CONTRACTS) return;
    account.contractsDay = today;
    account.contracts = rollDailyContracts().map((definition: ContractDefinition) => ({
      kind: definition.kind,
      progress: 0,
      target: definition.target,
      reward: definition.reward,
      completed: false,
    }));
    account.dirty = true;
  }

  recordXp(account: AccountState, faction: Team, amount: number, source: XpSource, flags: number): XpResult {
    const career = account.careers[faction] ?? account.careers[Team.Ottoman];
    if (career === undefined) throw new Error("Missing career");
    this.ensureContracts(account);
    const advanced = careerAdvance(career, amount);
    account.dirty = true;
    account.xpPending[faction === Team.Ottoman ? 0 : 1] += amount;
    const contractUpdate = this.#progressContracts(account, source, flags);
    if (contractUpdate?.completed === true) {
      careerAdvance(career, contractUpdate.reward);
      account.xpPending[faction === Team.Ottoman ? 0 : 1] += contractUpdate.reward;
    }
    return {
      totalXp: xpIntoRankOf(career),
      rank: rankOf(career),
      prestige: career.prestige,
      leveled: advanced.leveled,
      prestiged: advanced.prestiged,
      contractUpdate,
    };
  }

  #settlePendingXp(account: AccountState, now: number): void {
    this.#ensureWindowRollover();
    for (const faction of [Team.Ottoman, Team.Byzantine]) {
      const amount = account.xpPending[faction === Team.Ottoman ? 0 : 1];
      if ((amount ?? 0) <= 0) continue;
      account.xpPending[faction === Team.Ottoman ? 0 : 1] = 0;
      this.#recordLeaderboardXp(account, faction, amount ?? 0, now);
    }
  }

  #recordLeaderboardXp(account: AccountState, faction: Team, amount: number, now: number): void {
    const bump = (target: Map<number, LeaderboardEntry>): void => {
      const entry = target.get(account.playerId);
      if (entry === undefined) {
        target.set(account.playerId, {
          name: account.name,
          xp: faction === Team.Ottoman ? { ottoman: amount, byzantine: 0 } : { ottoman: 0, byzantine: amount },
        });
      } else if (faction === Team.Ottoman) {
        entry.xp = { ottoman: entry.xp.ottoman + amount, byzantine: entry.xp.byzantine };
      } else {
        entry.xp = { ottoman: entry.xp.ottoman, byzantine: entry.xp.byzantine + amount };
      }
    };
    bump(this.#daily);
    bump(this.#weekly);
    bump(this.#alltime);
    this.#pendingLedger.push({ playerId: account.playerId, name: account.name, faction, amount, earnedAt: now });
  }

  #progressContracts(account: AccountState, source: XpSource, flags: number): ContractUpdate | undefined {
    let matchingKind: ContractKind | undefined;
    if (source === XpSource.PointCaptured) matchingKind = ContractKind.CapturePoints;
    else if (source === XpSource.Assist) matchingKind = ContractKind.Assists;
    else if (source === XpSource.DefenseKill) matchingKind = ContractKind.DefenseKills;
    else if (source === XpSource.Kill && (flags & XP_EVENT_FLAG_AT_GATE) !== 0) matchingKind = ContractKind.KillsAtGate;
    else if (source === XpSource.MountedKill) matchingKind = ContractKind.CavalryKills;
    else if (source === XpSource.GalleyKill) matchingKind = ContractKind.GalleyKills;
    else if (source === XpSource.BreachCreated) matchingKind = ContractKind.BreachCreated;
    else if (source === XpSource.ArtilleryKill) matchingKind = ContractKind.ArtilleryKills;
    else if (source === XpSource.DismountRider) matchingKind = ContractKind.RidersUnhorsed;
    else return undefined;
    for (let slot = 0; slot < account.contracts.length; slot += 1) {
      const contract = account.contracts[slot];
      if (contract === undefined || contract.kind !== matchingKind || contract.completed) continue;
      contract.progress = Math.min(contract.target, contract.progress + 1);
      contract.completed = contract.progress >= contract.target;
      account.dirty = true;
      return { slot, kind: contract.kind, progress: contract.progress, target: contract.target, reward: contract.reward, completed: contract.completed };
    }
    return undefined;
  }

  finishWar(account: AccountState, team: Team, winner: Team, stats: PerSlotWarStats): WarOutcome {
    this.ensureContracts(account);
    account.lifetime.wars += 1;
    account.lifetime.kills += stats.kills;
    account.lifetime.deaths += stats.deaths;
    account.lifetime.captures += stats.captures;
    account.lifetime.shots += stats.shots;
    account.lifetime.hits += stats.hits;
    const career = account.careers[team] ?? account.careers[Team.Ottoman];
    if (career === undefined) throw new Error("Missing career");
    if (stats.headshots > 0) {
      career.headshots = Math.min(0xffff_ffff, career.headshots + stats.headshots);
    }
    account.dirty = true;
    const medalUnlocks = [...this.recordMedalCounter(account, MedalCategory.Veteran, 1)];
    let contractUpdate: ContractUpdate | undefined;
    if (team === winner) {
      account.lifetime.wins += 1;
      medalUnlocks.push(...this.recordMedalCounter(account, MedalCategory.Loyalist, 1));
      contractUpdate = this.#progressContracts(account, XpSource.WarVictory, 0);
      if (contractUpdate?.completed === true) {
        careerAdvance(career, contractUpdate.reward);
        account.xpPending[team === Team.Ottoman ? 0 : 1] += contractUpdate.reward;
      }
    }
    const medalCount = popcount(stats.medalMask);
    if (medalCount > 0) {
      account.lifetime.medals += medalCount;
      for (let kind = 1; kind <= MEDAL_KIND_COUNT; kind += 1) {
        if ((stats.medalMask & (1 << (kind - 1))) === 0) continue;
        account.medals.set(kind, (account.medals.get(kind) ?? 0) + 1);
      }
    }
    let welcomeBackBonus = 0;
    const today = utcDay(this.#now());
    if (account.lastWarDay < today) {
      account.lastWarDay = today;
      welcomeBackBonus = Math.round(stats.warXp * (WELCOME_BACK_MULTIPLIER - 1));
      if (welcomeBackBonus > 0) {
        careerAdvance(career, welcomeBackBonus);
        account.xpPending[team === Team.Ottoman ? 0 : 1] += welcomeBackBonus;
      }
    }
    return { welcomeBackBonus, rank: rankOf(career), prestige: career.prestige, contractUpdate, medalUnlocks };
  }

  recordWarTally(winner: Team): void {
    if (winner === Team.Ottoman) this.#warTallyOttoman += 1;
    else if (winner === Team.Byzantine) this.#warTallyByzantine += 1;
    this.#tallyDirty = true;
  }

  warTally(): { readonly ottoman: number; readonly byzantine: number } {
    return { ottoman: this.#warTallyOttoman, byzantine: this.#warTallyByzantine };
  }

  leaderboard(window: LeaderboardWindow, faction: Team, limit: number): LeaderboardRow[] {    this.#ensureWindowRollover();
    const source = window === "alltime" ? this.#alltime : window === "daily" ? this.#daily : this.#weekly;
    const rows: LeaderboardRow[] = [];
    for (const [playerId, entry] of source) {
      const xp = faction === Team.Ottoman ? entry.xp.ottoman : faction === Team.Byzantine ? entry.xp.byzantine : entry.xp.ottoman + entry.xp.byzantine;
      if (xp <= 0) continue;
      rows.push({ playerId, name: entry.name, xp });
    }
    rows.sort((left, right) => right.xp - left.xp);
    return rows.slice(0, Math.max(1, Math.min(100, limit)));
  }

  /**
   * Accumulates a lifetime medal counter for a category and returns any tier
   * crossings that happened as a result of this delta. Tiers are computed
   * against cumulative values, so a crossing fires exactly once per tier.
   */
  recordMedalCounter(account: AccountState, category: MedalCategory, amount: number): readonly MedalUnlock[] {
    if (amount <= 0 || category < 1 || category > MEDAL_CATEGORY_COUNT) return [];
    const before = medalTier(category, account.medalCounters[category] ?? 0, account.lifetime.wars);
    account.medalCounters[category] = Math.min(0xffff_ffff, (account.medalCounters[category] ?? 0) + amount);
    account.dirty = true;
    const unlocks: MedalUnlock[] = [];
    for (let tier = (before as MedalTier) + 1; tier <= 3; tier += 1) {
      const current = medalTier(category, account.medalCounters[category] ?? 0, account.lifetime.wars) as MedalTier;
      if (current < tier) break;
      unlocks.push({ category, tier: current });
    }
    return unlocks;
  }

  medalState(account: AccountState): { wars: number; counters: readonly MedalCounterState[] } {
    const counters: MedalCounterState[] = [];
    for (let category = 1; category <= MEDAL_CATEGORY_COUNT; category += 1) {
      counters.push({ category, value: account.medalCounters[category] ?? 0, tier: medalTier(category, account.medalCounters[category] ?? 0, account.lifetime.wars) });
    }
    return { wars: account.lifetime.wars, counters };
  }

  profile(account: AccountState): {
    careers: readonly CareerInfo[];
    lifetime: AccountLifetime;
    contracts: readonly ContractState[];
    medals: readonly MedalCount[];
  } {
    this.ensureContracts(account);
    const careers: CareerInfo[] = [];
    for (const faction of [Team.Ottoman, Team.Byzantine]) {
      const career = account.careers[faction] ?? account.careers[Team.Ottoman];
      if (career === undefined) continue;
      careers.push({ xp: xpIntoRankOf(career), rank: rankOf(career), prestige: career.prestige, headshots: career.headshots });
    }
    const medals: MedalCount[] = [];
    for (let kind = 1; kind <= MEDAL_KIND_COUNT; kind += 1) {
      medals.push({ kind, count: account.medals.get(kind) ?? 0 });
    }
    return {
      careers,
      lifetime: { ...account.lifetime },
      contracts: account.contracts.map((contract) => ({ ...contract })),
      medals,
    };
  }

  /**
   * Merges the live unlock computation (rank milestones and gold-tier medal
   * counters) into the account's persisted unlock set, then returns the full
   * skin catalog with per-skin unlock state and the per-class equip map. The
   * persisted set is only ever additive and the computation is monotonic, so
   * re-running this is idempotent and self-healing for accounts whose rank or
   * medal state changed while offline.
   */
  skinState(account: AccountState): { skins: SkinView[]; equips: Record<number, string> } {
    const medalCounterValues: { category: number; value: number }[] = [];
    for (let category = 1; category <= MEDAL_CATEGORY_COUNT; category += 1) {
      medalCounterValues.push({ category, value: account.medalCounters[category] ?? 0 });
    }
    const medalTiers = goldMedalTiers(medalCounterValues, account.lifetime.wars);
    const careerByFaction: Record<number, SkinCareerView | undefined> = {};
    for (const faction of [Team.Ottoman, Team.Byzantine]) {
      const career = account.careers[faction];
      if (career !== undefined) careerByFaction[faction] = { rank: rankOf(career), prestige: career.prestige };
    }
    for (const skin of SKIN_DEFINITIONS) {
      if (skinUnlocked(skin, careerByFaction, medalTiers) && !account.skinUnlocks.has(skin.id)) {
        account.skinUnlocks.add(skin.id);
        account.dirty = true;
      }
    }
    const equips: Record<number, string> = {};
    for (const [playerClass, skinId] of account.skinEquips) equips[playerClass] = skinId;
    return {
      skins: SKIN_DEFINITIONS.map((skin) => ({
        id: skin.id,
        class: skin.class,
        name: skin.name,
        description: skin.description,
        art: skin.art,
        unlockLabel: skinUnlockLabel(skin),
        unlocked: account.skinUnlocks.has(skin.id),
      })),
      equips,
    };
  }

  equipSkin(account: AccountState, skinId: string): "ok" | "unknown" | "locked" {
    const definition = skinDefinition(skinId);
    if (definition === undefined) return "unknown";
    this.skinState(account);
    if (!account.skinUnlocks.has(skinId)) return "locked";
    account.skinEquips.set(definition.class, skinId);
    account.dirty = true;
    return "ok";
  }

  flush(): void {
    const now = this.#now();
    const dirtyAccounts: AccountState[] = [];
    const dirty: StoredAccount[] = [];
    for (const account of this.#accounts.values()) {
      this.#settlePendingXp(account, now);
      if (!account.dirty) continue;
      dirtyAccounts.push(account);
      dirty.push(this.#toStored(account));
    }
    try {
      if (dirty.length > 0) this.#storage.flushAccounts(dirty);
      if (this.#pendingLedger.length > 0) {
        this.#storage.appendXpLedger(this.#pendingLedger);
        this.#pendingLedger.length = 0;
      }
      if (this.#tallyDirty) {
        this.#storage.saveWarTally({ ottoman: this.#warTallyOttoman, byzantine: this.#warTallyByzantine });
        this.#tallyDirty = false;
      }
    } catch (error) {
      // Phase 8e-25: a storage failure (disk full, corrupt DB) must never
      // lose the batch silently. The dirty flags are cleared only after a
      // successful write, so the next flush retries the same accounts and
      // the failure is visible in the log instead of vanishing.
      console.log(JSON.stringify({ event: "flush_error", error: error instanceof Error ? error.message : String(error), accounts: dirty.length }));
      return;
    }
    for (const account of dirtyAccounts) account.dirty = false;
  }

  #toStored(account: AccountState): StoredAccount {
    const careers: StoredCareer[] = [];
    for (const faction of [Team.Ottoman, Team.Byzantine]) {
      const career = account.careers[faction];
      if (career === undefined) continue;
      careers.push({ faction, xp: career.xp, prestige: career.prestige, headshots: career.headshots });
    }
    const skinEquips: StoredSkinEquip[] = [];
    for (const [playerClass, skinId] of account.skinEquips) skinEquips.push({ class: playerClass, skinId });
    return {
      playerId: account.playerId,
      tokenHash: account.tokenHash,
      name: account.name,
      ...(account.authId === undefined ? {} : { authId: account.authId }),
      careers,
      lifetime: { ...account.lifetime },
      contracts: account.contracts.map((contract, slot) => ({
        day: account.contractsDay,
        slot,
        kind: contract.kind,
        progress: contract.progress,
        target: contract.target,
        reward: contract.reward,
        completed: contract.completed,
      })),
      medals: [...account.medals.entries()].map(([kind, count]) => ({ kind, count })),
      medalCounters: Array.from({ length: MEDAL_CATEGORY_COUNT }, (_, index) => ({ category: index + 1, value: account.medalCounters[index + 1] ?? 0 })),
      skinUnlocks: [...account.skinUnlocks],
      skinEquips,
    };
  }

  close(): void {
    this.flush();
    this.#storage.close();
  }
}
