import { describe, expect, it, vi } from "vitest";
import {
  FIXED_DT_MS,
  InputButton,
  MedalCategory,
  MedalTier,
  PlayerClass,
  PlayerFlag,
  Team,
  XpSource,
  xpForNextRank,
} from "@janissary/shared";
import { addPlayer, createWorldState, drainMedalCounters, enqueueInput, requestDeploy, stepWorld, type WorldState } from "../src/sim/world";
import { MAX_ACCOUNTS_IN_MEMORY, ProgressionService, type AccountState } from "../src/progression";
import { issueGuestToken, verifyGuestToken } from "../src/token";
import type { AuthLink, PendingAuthUpgrade, Storage, StoredAccount, StoredChatReport, StoredClan, StoredClanInvite, XpLedgerRow } from "../src/storage/storage";

class FakeStorage implements Storage {
  readonly accounts = new Map<number, StoredAccount>();
  readonly ledger: XpLedgerRow[] = [];
  tally = { ottoman: 0, byzantine: 0 };
  readonly clans = new Map<number, StoredClan>();
  readonly clanMembers = new Map<number, number[]>();
  readonly clanInvites = new Map<number, StoredClanInvite[]>();
  loadAccounts(): readonly StoredAccount[] { return [...this.accounts.values()]; }
  flushAccounts(rows: readonly StoredAccount[]): void { for (const row of rows) this.accounts.set(row.playerId, row); }
  loadWarTally(): { readonly ottoman: number; readonly byzantine: number } { return this.tally; }
  saveWarTally(tally: { readonly ottoman: number; readonly byzantine: number }): void { this.tally = tally; }
  appendXpLedger(rows: readonly XpLedgerRow[]): void { this.ledger.push(...rows); }
  loadXpLedgerSince(since: number): readonly XpLedgerRow[] { return this.ledger.filter((row) => row.earnedAt >= since); }
  getAuthLinkByAuthId(_authId: string): AuthLink | undefined { return undefined; }
  getAuthLinkByEmail(_email: string): AuthLink | undefined { return undefined; }
  saveAuthLink(_link: AuthLink): "linked" { return "linked"; }
  createPendingAuthUpgrade(_upgrade: PendingAuthUpgrade): void {}
  consumePendingAuthUpgrade(_stateHash: string, _now: number): PendingAuthUpgrade | undefined { return undefined; }
  consumeRateLimit(_keyHash: string, _now: number, _windowMs: number, _limit: number): boolean { return true; }
  isPlayerMuted(_playerId: number): boolean { return false; }
  setPlayerMuted(_playerId: number, _muted: boolean): void {}
  appendChatReport(_report: StoredChatReport): void {}
  createClan(name: string, tag: string, founderPlayerId: number, createdAt: number): number | undefined {
    if ([...this.clans.values()].some((clan) => clan.name.toLowerCase() === name.toLowerCase() || clan.tag.toLowerCase() === tag.toLowerCase())) return undefined;
    const clanId = this.clans.size + 1;
    this.clans.set(clanId, { clanId, name, tag, founderPlayerId, createdAt });
    this.clanMembers.set(clanId, [founderPlayerId]);
    return clanId;
  }
  loadClanById(clanId: number): StoredClan | undefined { return this.clans.get(clanId); }
  loadClanByTag(tag: string): StoredClan | undefined { return [...this.clans.values()].find((clan) => clan.tag.toLowerCase() === tag.toLowerCase()); }
  loadClanByName(name: string): StoredClan | undefined { return [...this.clans.values()].find((clan) => clan.name.toLowerCase() === name.toLowerCase()); }
  loadAllClans(): readonly StoredClan[] { return [...this.clans.values()]; }
  playerClan(playerId: number): StoredClan | undefined { return [...this.clans.values()].find((clan) => this.clanMembers.get(clan.clanId)?.includes(playerId)); }
  findPlayerIdByName(name: string): number | undefined {
    const matches = [...this.accounts.values()].filter((account) => account.name.toLowerCase() === name.toLowerCase());
    return matches.length === 1 ? matches[0]?.playerId : undefined;
  }
  clanMemberIds(clanId: number): readonly number[] { return this.clanMembers.get(clanId) ?? []; }
  clanMemberCount(clanId: number): number { return this.clanMembers.get(clanId)?.length ?? 0; }
  addClanMember(clanId: number, playerId: number, _joinedAt: number): boolean {
    if (this.clanMemberCount(clanId) >= 50) return false;
    const members = this.clanMembers.get(clanId) ?? [];
    if (members.includes(playerId)) return false;
    members.push(playerId);
    this.clanMembers.set(clanId, members);
    return true;
  }
  removeClanMember(clanId: number, playerId: number): boolean {
    const members = this.clanMembers.get(clanId) ?? [];
    const index = members.indexOf(playerId);
    if (index < 0) return false;
    members.splice(index, 1);
    this.clanMembers.set(clanId, members);
    return true;
  }
  updateClanFounder(clanId: number, playerId: number): void {
    const clan = this.clans.get(clanId);
    if (clan !== undefined) this.clans.set(clanId, { ...clan, founderPlayerId: playerId });
  }
  deleteClan(clanId: number): void {
    this.clans.delete(clanId);
    this.clanMembers.delete(clanId);
    for (const [playerId, invites] of this.clanInvites) this.clanInvites.set(playerId, invites.filter((invite) => invite.clanId !== clanId));
  }
  createClanInvite(clanId: number, playerId: number, invitedBy: number, createdAt: number): void {
    const invites = this.clanInvites.get(playerId) ?? [];
    if (!invites.some((invite) => invite.clanId === clanId)) invites.push({ clanId, invitedBy, createdAt });
    this.clanInvites.set(playerId, invites);
  }
  loadClanInvites(playerId: number): readonly StoredClanInvite[] { return this.clanInvites.get(playerId) ?? []; }
  consumeClanInvite(clanId: number, playerId: number): boolean {
    const invites = this.clanInvites.get(playerId) ?? [];
    const index = invites.findIndex((invite) => invite.clanId === clanId);
    if (index < 0) return false;
    invites.splice(index, 1);
    this.clanInvites.set(playerId, invites);
    return true;
  }
  searchClans(query: string, limit: number): readonly StoredClan[] {
    return [...this.clans.values()].filter((clan) => clan.name.toLowerCase().includes(query.toLowerCase()) || clan.tag.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  }
  loadClanLeaderboard(clanId: number, since: number, limit: number): readonly { playerId: number; name: string; xp: number }[] {
    const members = new Set(this.clanMembers.get(clanId) ?? []);
    const earned = new Map<number, { name: string; xp: number }>();
    for (const row of this.ledger) {
      if (!members.has(row.playerId) || row.earnedAt < since) continue;
      const current = earned.get(row.playerId) ?? { name: row.name, xp: 0 };
      current.xp += row.amount;
      earned.set(row.playerId, current);
    }
    return [...earned].map(([playerId, row]) => ({ playerId, ...row })).sort((left, right) => right.xp - left.xp).slice(0, limit);
  }
  // Phase 8c-7 social stubs — in-memory mirrors of the SQLite methods.
  readonly blocks = new Map<number, Set<number>>();
  readonly friendRequests = new Map<number, { fromId: number; createdAt: number }[]>();
  readonly friendPairs = new Set<string>();
  blockPlayer(playerId: number, blockedPlayerId: number): void {
    const set = this.blocks.get(playerId) ?? new Set();
    set.add(blockedPlayerId);
    this.blocks.set(playerId, set);
  }
  unblockPlayer(playerId: number, blockedPlayerId: number): boolean {
    const set = this.blocks.get(playerId);
    if (set === undefined || !set.delete(blockedPlayerId)) return false;
    if (set.size === 0) this.blocks.delete(playerId);
    return true;
  }
  isBlocked(playerId: number, blockedPlayerId: number): boolean {
    return this.blocks.get(playerId)?.has(blockedPlayerId) ?? false;
  }
  loadBlockedIds(playerId: number): readonly number[] {
    return [...(this.blocks.get(playerId) ?? [])];
  }
  createFriendRequest(fromId: number, toId: number, createdAt: number): void {
    const list = this.friendRequests.get(toId) ?? [];
    if (list.some((request) => request.fromId === fromId)) return;
    list.push({ fromId, createdAt });
    this.friendRequests.set(toId, list);
  }
  loadFriendRequests(toId: number): readonly { fromId: number; toId: number; createdAt: number }[] {
    return (this.friendRequests.get(toId) ?? []).map((request) => ({ ...request, toId }));
  }
  consumeFriendRequest(fromId: number, toId: number): boolean {
    const list = this.friendRequests.get(toId) ?? [];
    const index = list.findIndex((request) => request.fromId === fromId);
    if (index < 0) return false;
    list.splice(index, 1);
    return true;
  }
  addFriendPair(firstId: number, secondId: number): void {
    const [low, high] = firstId < secondId ? [firstId, secondId] : [secondId, firstId];
    this.friendPairs.add(`${low}:${high}`);
  }
  removeFriendPair(firstId: number, secondId: number): boolean {
    const [low, high] = firstId < secondId ? [firstId, secondId] : [secondId, firstId];
    return this.friendPairs.delete(`${low}:${high}`);
  }
  loadFriendIds(playerId: number): readonly number[] {
    const ids: number[] = [];
    for (const pair of this.friendPairs) {
      const [a, b] = pair.split(":").map(Number);
      if (a === playerId && b !== undefined) ids.push(b);
      else if (b === playerId && a !== undefined) ids.push(a);
    }
    return ids.sort((left, right) => left - right);
  }
  close(): void {}
}

function drainXp(world: WorldState, service: ProgressionService, account: AccountState, slot: number): void {
  const capacity = world.xpQueueSlots.length;
  while (world.xpQueueHead !== world.xpQueueTail) {
    const queuedSlot = world.xpQueueSlots[world.xpQueueHead];
    const source = world.xpQueueSources[world.xpQueueHead];
    const amount = world.xpQueueAmounts[world.xpQueueHead];
    const flags = world.xpQueueFlags[world.xpQueueHead];
    world.xpQueueHead = (world.xpQueueHead + 1) % capacity;
    if (queuedSlot !== slot) continue;
    if (source === undefined || amount === undefined || flags === undefined) continue;
    service.recordXp(account, world.team[queuedSlot] as Team, amount, source, flags);
  }
}

function tick(world: WorldState, inputs: { entityId: number; buttons: number }[], ticks: number): void {
  let seq = 1;
  for (let index = 0; index < ticks; index += 1) {
    for (const input of inputs) {
      enqueueInput(world, input.entityId, { seq, lastSnapshotTick: world.tick, buttons: input.buttons, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
      seq += 1;
    }
    stepWorld(world);
  }
}

function objectiveSession(service: ProgressionService): { account: AccountState; xp: number; rank: number } {
  const world = createWorldState();
  const account = service.createGuest("objective", "hash-objective");
  const player = addPlayer(world, account.name, Team.Ottoman);
  expect(player).toBeDefined();
  if (player === undefined) throw new Error("Player slot unavailable");
  world.x[player.slot] = 0;
  world.z[player.slot] = 0;
  world.captureOwner = Team.Ottoman;
  world.captureProgress = 100;
  tick(world, [{ entityId: player.entityId, buttons: 0 }], 6_100);
  drainXp(world, service, account, player.slot);
  const career = account.careers[Team.Ottoman];
  if (career === undefined) throw new Error("Missing career");
  return { account, xp: career.xp, rank: service.profile(account).careers[0]?.rank ?? 1 };
}

function fraggerSession(service: ProgressionService, account: AccountState, seed: string): { kills: number; xp: number; killXp: number[] } {
  const world = createWorldState();
  const attacker = addPlayer(world, `${seed}-fragger`, Team.Ottoman);
  const victim = addPlayer(world, `${seed}-victim`, Team.Byzantine);
  expect(attacker).toBeDefined();
  expect(victim).toBeDefined();
  if (attacker === undefined || victim === undefined) throw new Error("Player slot unavailable");
  world.x[attacker.slot] = 0;
  world.z[attacker.slot] = -90.5;
  world.yaw[attacker.slot] = 0;
  world.x[victim.slot] = 0;
  world.z[victim.slot] = -92;
  world.flags[victim.slot] = (world.flags[victim.slot] ?? 0) & ~(1 << 2);
  const killXp: number[] = [];
  let lastKills = 0;
  let victimDiedAt = -1;
  for (let tickIndex = 0; tickIndex < 1_200; tickIndex += 1) {
    enqueueInput(world, attacker.entityId, { seq: tickIndex + 1, lastSnapshotTick: world.tick, buttons: InputButton.Melee, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    enqueueInput(world, victim.entityId, { seq: tickIndex + 1, lastSnapshotTick: world.tick, buttons: 0, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
    stepWorld(world);
    // 8e-13: humans no longer auto-respawn — redeploy the victim on the old
    // 3 s cadence so the farming economy measured here is unchanged, clearing
    // spawn protection as the setup does above.
    if (((world.flags[victim.slot] ?? 0) & PlayerFlag.Alive) === 0) {
      if (victimDiedAt < 0) victimDiedAt = world.tick;
      if (world.tick - victimDiedAt >= 60 && requestDeploy(world, victim.entityId)) {
        world.flags[victim.slot] = (world.flags[victim.slot] ?? 0) & ~PlayerFlag.SpawnProtected;
        victimDiedAt = -1;
      }
    }
    if ((world.kills[attacker.slot] ?? 0) > lastKills) {
      lastKills = world.kills[attacker.slot] ?? 0;
    }
    const capacity = world.xpQueueSlots.length;
    while (world.xpQueueHead !== world.xpQueueTail) {
      const queuedSlot = world.xpQueueSlots[world.xpQueueHead];
      const source = world.xpQueueSources[world.xpQueueHead];
      const amount = world.xpQueueAmounts[world.xpQueueHead];
      const flags = world.xpQueueFlags[world.xpQueueHead];
      world.xpQueueHead = (world.xpQueueHead + 1) % capacity;
      if (queuedSlot !== attacker.slot) continue;
      if (source === undefined || amount === undefined || flags === undefined) continue;
      if (source === XpSource.Kill) killXp.push(amount);
      service.recordXp(account, Team.Ottoman, amount, source, flags);
    }
  }
  const career = account.careers[Team.Ottoman];
  return { kills: world.kills[attacker.slot] ?? 0, xp: career?.xp ?? 0, killXp };
}

describe("progression economy", () => {
  it("reaches rank 2 within one average war through objective play", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const result = objectiveSession(service);
    expect(result.xp).toBeGreaterThanOrEqual(150);
    expect(result.rank).toBeGreaterThanOrEqual(2);
    expect(result.rank).toBeLessThanOrEqual(4);
  });

  it("objective play out-earns pure fragging", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const objective = objectiveSession(service);
    const fragger = service.createGuest("fragger", "hash-fragger");
    const session = fraggerSession(service, fragger, "fragger-a");
    expect(session.kills).toBeGreaterThanOrEqual(4);
    expect(session.xp).toBeLessThan(objective.xp);
    expect(session.xp).toBeLessThan(400);
  });

  it("decays kill XP after three kills of the same victim within a minute", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const account = service.createGuest("farmer", "hash-farmer");
    const session = fraggerSession(service, account, "farmer-b");
    expect(session.killXp.length).toBeGreaterThanOrEqual(4);
    const firstThree = session.killXp.slice(0, 3);
    const afterThree = session.killXp.slice(3);
    for (const amount of firstThree) expect(amount).toBe(40);
    for (const amount of afterThree) expect(amount).toBe(10);
  });

  it("rolls fresh contracts at the UTC day boundary", () => {
    let now = Date.UTC(2026, 7, 2, 12, 0, 0);
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      const storage = new FakeStorage();
      const service = new ProgressionService(storage, () => now);
      const account = service.createGuest("contractor", "hash-contractor");
      service.ensureContracts(account);
      expect(account.contracts.length).toBe(3);
      service.recordXp(account, Team.Ottoman, 150, XpSource.PointCaptured, 0);
      const dayOneProgress = account.contracts.map((contract) => contract.progress);
      expect(dayOneProgress.some((progress) => progress > 0)).toBe(true);
      now = Date.UTC(2026, 7, 3, 0, 0, 0);
      service.recordXp(account, Team.Ottoman, 40, XpSource.CapturePresence, 0);
      expect(account.contractsDay).toBe(Date.UTC(2026, 7, 3, 0, 0, 0));
      expect(account.contracts.every((contract) => contract.progress === 0)).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("grants the welcome-back bonus only for the first war of the day", () => {
    let now = Date.UTC(2026, 7, 2, 8, 0, 0);
    const storage = new FakeStorage();
    const service = new ProgressionService(storage, () => now);
    const account = service.createGuest("veteran", "hash-veteran");
    const stats = { team: Team.Ottoman, kills: 1, deaths: 0, assists: 0, captures: 0, defenseKills: 0, shots: 2, hits: 1, headshots: 0, captureTicks: 120, warXp: 100, medalMask: 0 };
    const first = service.finishWar(account, Team.Ottoman, Team.Ottoman, stats);
    expect(first.welcomeBackBonus).toBe(50);
    const second = service.finishWar(account, Team.Ottoman, Team.Ottoman, stats);
    expect(second.welcomeBackBonus).toBe(0);
    now = Date.UTC(2026, 7, 3, 8, 0, 0);
    const nextDay = service.finishWar(account, Team.Ottoman, Team.Ottoman, stats);
    expect(nextDay.welcomeBackBonus).toBe(50);
  });
});

describe("guest token authentication", () => {
  it("round-trips a signed token and rejects tampering", () => {
    const token = issueGuestToken(42);
    expect(verifyGuestToken(token)).toBe(42);
    const forged = `${token.slice(0, -1)}A`;
    expect(verifyGuestToken(forged)).toBeUndefined();
    expect(verifyGuestToken("garbage")).toBeUndefined();
    expect(verifyGuestToken("")).toBeUndefined();
  });

  it("rejects tokens signed with a different secret", () => {
    const previous = process.env.TOKEN_SECRET;
    try {
      process.env.TOKEN_SECRET = "test-secret-a";
      const token = issueGuestToken(7);
      process.env.TOKEN_SECRET = "test-secret-b";
      expect(verifyGuestToken(token)).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.TOKEN_SECRET;
      else process.env.TOKEN_SECRET = previous;
    }
  });
});

describe("medal tier thresholds", () => {
  it("unlocks bronze exactly once at the bronze threshold", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const account = service.createGuest("sharpshooter", "hash-sharpshooter");
    let unlocks = 0;
    for (let hit = 1; hit <= 40; hit += 1) {
      unlocks += service.recordMedalCounter(account, MedalCategory.Marksman, 1).length;
    }
    expect(unlocks).toBe(1);
    expect(service.medalState(account).counters[MedalCategory.Marksman - 1]).toEqual({ category: MedalCategory.Marksman, value: 40, tier: MedalTier.Bronze });
  });

  it("crosses bronze then silver then gold, each exactly once", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const account = service.createGuest("wallbreaker", "hash-wallbreaker");
    let unlocks = 0;
    const tiers: number[] = [];
    for (let damage = 120; damage <= 24_000; damage += 120) {
      const crossed = service.recordMedalCounter(account, MedalCategory.WallBreaker, 120);
      unlocks += crossed.length;
      for (const unlock of crossed) tiers.push(unlock.tier);
    }
    expect(unlocks).toBe(3);
    expect(tiers).toEqual([MedalTier.Bronze, MedalTier.Silver, MedalTier.Gold]);
    expect(service.medalState(account).counters[MedalCategory.WallBreaker - 1]?.tier).toBe(MedalTier.Gold);
  });

  it("gates Loyalist wins behind a wars-played floor", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const account = service.createGuest("loyalist", "hash-loyalist");
    const win = { team: Team.Ottoman, kills: 1, deaths: 0, assists: 0, captures: 0, defenseKills: 0, shots: 1, hits: 1, headshots: 0, captureTicks: 120, warXp: 100, medalMask: 0 };
    const loss = { ...win, team: Team.Byzantine };
    service.finishWar(account, Team.Ottoman, Team.Byzantine, loss);
    expect(service.medalState(account).counters[MedalCategory.Loyalist - 1]?.tier).toBe(0);
    service.finishWar(account, Team.Ottoman, Team.Ottoman, win);
    service.finishWar(account, Team.Ottoman, Team.Byzantine, loss);
    service.finishWar(account, Team.Ottoman, Team.Ottoman, win);
    service.finishWar(account, Team.Ottoman, Team.Byzantine, loss);
    service.finishWar(account, Team.Ottoman, Team.Ottoman, win);
    const state = service.medalState(account);
    expect(state.counters[MedalCategory.Loyalist - 1]).toEqual({ category: MedalCategory.Loyalist, value: 3, tier: MedalTier.Bronze });
    expect(state.counters[MedalCategory.Veteran - 1]?.value).toBe(6);
  });

  it("persists medal counters across a flush and reload", () => {
    const storage = new FakeStorage();
    const service = new ProgressionService(storage);
    const account = service.createGuest("persistent", "hash-persistent");
    service.recordMedalCounter(account, MedalCategory.GateKeeper, 10);
    service.flush();
    const reloaded = new ProgressionService(storage);
    const restored = reloaded.getAccount(account.playerId);
    expect(restored).toBeDefined();
    expect(reloaded.medalState(restored ?? account).counters[MedalCategory.GateKeeper - 1]).toEqual({ category: MedalCategory.GateKeeper, value: 10, tier: MedalTier.Bronze });
  });

  it("queues accurate-hit counters from the sim and drains them by category", () => {
    const world = createWorldState();
    const attacker = addPlayer(world, "Sim Marksman", Team.Ottoman);
    const victim = addPlayer(world, "Sim Target", Team.Byzantine);
    expect(attacker).toBeDefined();
    expect(victim).toBeDefined();
    if (attacker === undefined || victim === undefined) throw new Error("Player slot unavailable");
    world.x[attacker.slot] = 0;
    world.z[attacker.slot] = -90.5;
    world.yaw[attacker.slot] = 0;
    world.x[victim.slot] = 0;
    world.z[victim.slot] = -92;
    world.flags[victim.slot] = (world.flags[victim.slot] ?? 0) & ~(1 << 2);
    let seq = 1;
    const step = (buttons: number): void => {
      enqueueInput(world, attacker.entityId, { seq, lastSnapshotTick: world.tick, buttons, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
      seq += 1;
      enqueueInput(world, victim.entityId, { seq, lastSnapshotTick: world.tick, buttons: 0, yaw: 0, pitch: 0, dtMs: FIXED_DT_MS });
      seq += 1;
      stepWorld(world);
    };
    for (let warm = 0; warm < 40; warm += 1) step(0);
    let hits = 0;
    for (let tickIndex = 0; tickIndex < 240; tickIndex += 1) {
      step(InputButton.Fire);
      const drained = drainMedalCounters(world);
      for (const entry of drained) {
        if (entry.slot === attacker.slot && entry.category === MedalCategory.Marksman) hits += entry.amount;
      }
    }
    expect(hits).toBeGreaterThanOrEqual(1);
    expect(world.warHits[attacker.slot] ?? 0).toBe(hits);
  });
});

describe("skin unlocks", () => {
  function createService(): { progression: ProgressionService; storage: FakeStorage } {
    const storage = new FakeStorage();
    return { progression: new ProgressionService(storage), storage };
  }

  it("unlocks rank skins at the faction milestone and gold-medal skins at any gold tier", () => {
    const { progression } = createService();
    const account = progression.createGuest("skin-tester", "hash");
    let state = progression.skinState(account);
    expect(state.skins.find((skin) => skin.id === "janissary-veteran")?.unlocked).toBe(false);
    expect(state.skins.find((skin) => skin.id === "guardsman-elite")?.unlocked).toBe(false);
    expect(account.skinUnlocks.has("janissary-veteran")).toBe(false);

    let xp = 0;
    for (let rank = 1; rank < 6; rank += 1) xp += xpForNextRank(rank);
    progression.recordXp(account, Team.Ottoman, xp, XpSource.Kill, 0);
    state = progression.skinState(account);
    expect(state.skins.find((skin) => skin.id === "janissary-veteran")?.unlocked).toBe(true);
    expect(account.skinUnlocks.has("janissary-veteran")).toBe(true);
    expect(state.skins.find((skin) => skin.id === "guardsman-elite")?.unlocked).toBe(false);
    expect(state.skins.find((skin) => skin.id === "janissary-banneret")?.unlocked).toBe(false);

    account.medalCounters[MedalCategory.Marksman] = 1_000;
    state = progression.skinState(account);
    expect(state.skins.find((skin) => skin.id === "janissary-banneret")?.unlocked).toBe(true);
    expect(state.skins.find((skin) => skin.id === "guardsman-archon")?.unlocked).toBe(true);
  });

  it("unlocks the Byzantine rank skin only on the Byzantine career", () => {
    const { progression } = createService();
    const account = progression.createGuest("defender", "hash");
    let xp = 0;
    for (let rank = 1; rank < 6; rank += 1) xp += xpForNextRank(rank);
    progression.recordXp(account, Team.Byzantine, xp, XpSource.Kill, 0);
    const state = progression.skinState(account);
    expect(state.skins.find((skin) => skin.id === "guardsman-elite")?.unlocked).toBe(true);
    expect(state.skins.find((skin) => skin.id === "janissary-veteran")?.unlocked).toBe(false);
  });

  it("equips only unlocked skins and persists unlock + equip state across a storage reopen", () => {
    const { progression, storage } = createService();
    const account = progression.createGuest("collector", "hash");
    account.medalCounters[MedalCategory.Marksman] = 1_000;
    progression.skinState(account);
    expect(progression.equipSkin(account, "janissary-banneret")).toBe("ok");
    expect(progression.equipSkin(account, "guardsman-elite")).toBe("locked");
    expect(progression.equipSkin(account, "not-a-skin")).toBe("unknown");
    expect(account.skinEquips.get(PlayerClass.Janissary)).toBe("janissary-banneret");

    progression.flush();
    const reopened = new ProgressionService(storage);
    const reloaded = reopened.getAccount(account.playerId);
    expect(reloaded).toBeDefined();
    if (reloaded === undefined) return;
    expect(reloaded.skinUnlocks.has("janissary-banneret")).toBe(true);
    expect(reloaded.skinEquips.get(PlayerClass.Janissary)).toBe("janissary-banneret");
    const state = reopened.skinState(reloaded);
    expect(state.skins.find((skin) => skin.id === "janissary-banneret")?.unlocked).toBe(true);
  });

  it("keeps an equip consistent when the equipped skin remains unlocked after reopen", () => {
    const { progression, storage } = createService();
    const account = progression.createGuest("veteran", "hash");
    let xp = 0;
    for (let rank = 1; rank < 6; rank += 1) xp += xpForNextRank(rank);
    progression.recordXp(account, Team.Ottoman, xp, XpSource.Kill, 0);
    progression.skinState(account);
    expect(progression.equipSkin(account, "janissary-veteran")).toBe("ok");
    progression.flush();
    const reopened = new ProgressionService(storage);
    const reloaded = reopened.getAccount(account.playerId);
    expect(reloaded?.skinEquips.get(PlayerClass.Janissary)).toBe("janissary-veteran");
  });
});

function freshService(): { progression: ProgressionService; storage: FakeStorage } {
  const storage = new FakeStorage();
  return { progression: new ProgressionService(storage), storage };
}

describe("guest-account cache bound (Phase 8e-25)", () => {
  it("caps the in-memory guest cache by evicting the least-recently-seen guest", () => {
    const { progression, storage } = freshService();
    // Overrun the cap by a wide margin.
    for (let index = 0; index < MAX_ACCOUNTS_IN_MEMORY + 50; index += 1) {
      progression.createGuest(`guest-${index}`, "hash");
    }
    expect(progression.accountCount()).toBeLessThanOrEqual(MAX_ACCOUNTS_IN_MEMORY);
    // The evicted guests were never seen again after creation, so the oldest
    // ones dropped first — a fresh join still works.
    const newcomer = progression.createGuest("newcomer", "hash");
    expect(progression.getAccount(newcomer.playerId)).toBeDefined();
    expect(progression.accountCount()).toBeLessThanOrEqual(MAX_ACCOUNTS_IN_MEMORY);
    void storage;
  });

  it("never evicts a claimed (auth-linked) account", () => {
    const { progression } = freshService();
    const claimed = progression.createGuest("claimed", "hash");
    progression.claimAccount(claimed, "auth-1", "hash-new");
    for (let index = 0; index < MAX_ACCOUNTS_IN_MEMORY + 10; index += 1) {
      progression.createGuest(`guest-${index}`, "hash");
    }
    expect(progression.getAccount(claimed.playerId)).toBeDefined();
    expect(progression.accountCount()).toBeLessThanOrEqual(MAX_ACCOUNTS_IN_MEMORY);
  });

  it("flushes a dirty evicted guest before dropping it", () => {
    const { progression, storage } = freshService();
    const victim = progression.createGuest("victim", "hash");
    progression.recordXp(victim, Team.Ottoman, 100, XpSource.Kill, 0);
    for (let index = 0; index < MAX_ACCOUNTS_IN_MEMORY; index += 1) {
      progression.createGuest(`guest-${index}`, "hash");
    }
    expect(progression.getAccount(victim.playerId)).toBeUndefined();
    // The victim's XP was persisted before eviction.
    expect(storage.accounts.get(victim.playerId)?.careers.some((career) => career.xp >= 100)).toBe(true);
  });
});

describe("flush failure retry (Phase 8e-25)", () => {
  it("keeps dirty flags set after a storage failure so the next flush retries", () => {
    const { progression, storage } = freshService();
    const account = progression.createGuest("persistent", "hash");
    progression.recordXp(account, Team.Ottoman, 50, XpSource.Kill, 0);
    const originalFlush = storage.flushAccounts.bind(storage);
    let failures = 1;
    storage.flushAccounts = (rows) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("disk full");
      }
      originalFlush(rows);
    };
    // First flush throws: the account must still be dirty…
    progression.flush();
    expect(failures).toBe(0);
    // …so a second flush (storage healthy again) persists the XP.
    storage.flushAccounts = originalFlush;
    progression.flush();
    expect(storage.accounts.get(account.playerId)?.careers.some((career) => career.xp >= 50)).toBe(true);
  });
});
