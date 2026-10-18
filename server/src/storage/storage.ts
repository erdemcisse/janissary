export interface StoredCareer {
  readonly faction: number;
  readonly xp: number;
  readonly prestige: number;
  readonly headshots: number;
}

export interface StoredLifetime {
  wars: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  medals: number;
  shots: number;
  hits: number;
}

export interface StoredContract {
  readonly day: number;
  readonly slot: number;
  readonly kind: number;
  readonly progress: number;
  readonly target: number;
  readonly reward: number;
  readonly completed: boolean;
}

export interface StoredMedal {
  readonly kind: number;
  readonly count: number;
}

export interface StoredMedalCounter {
  readonly category: number;
  readonly value: number;
}

export interface StoredSkinEquip {
  readonly class: number;
  readonly skinId: string;
}

export interface StoredClan {
  readonly clanId: number;
  readonly name: string;
  readonly tag: string;
  readonly founderPlayerId: number;
  readonly createdAt: number;
}

export interface StoredClanInvite {
  readonly clanId: number;
  readonly invitedBy: number;
  readonly createdAt: number;
}

export interface StoredAccount {
  readonly playerId: number;
  readonly tokenHash: string;
  readonly name: string;
  readonly authId?: string;
  readonly careers: readonly StoredCareer[];
  readonly lifetime: StoredLifetime;
  readonly contracts: readonly StoredContract[];
  readonly medals: readonly StoredMedal[];
  readonly medalCounters: readonly StoredMedalCounter[];
  readonly skinUnlocks: readonly string[];
  readonly skinEquips: readonly StoredSkinEquip[];
}

export interface AuthLink {
  readonly authId: string;
  readonly playerId: number;
  readonly email: string;
  readonly createdAt: number;
}

export interface PendingAuthUpgrade {
  readonly stateHash: string;
  readonly playerId: number;
  readonly email: string;
  readonly expiresAt: number;
}

export interface StoredChatReport {
  readonly reporterPlayerId: number;
  readonly messageId: number;
  readonly senderPlayerId: number;
  readonly channel: number;
  readonly text: string;
  readonly createdAt: number;
}

export interface StoredBlock {
  readonly playerId: number;
  readonly blockedPlayerId: number;
  readonly createdAt: number;
}

export interface StoredFriendPair {
  readonly playerId: number;
  readonly friendId: number;
  readonly createdAt: number;
}

export interface StoredFriendRequest {
  readonly fromId: number;
  readonly toId: number;
  readonly createdAt: number;
}

export interface XpLedgerRow {
  readonly playerId: number;
  readonly name: string;
  readonly faction: number;
  readonly amount: number;
  readonly earnedAt: number;
}

export interface LeaderboardRow {
  readonly playerId: number;
  readonly name: string;
  readonly xp: number;
}

/**
 * Narrow persistence boundary for the progression layer. The in-memory account
 * service is the only consumer; every method is synchronous. Writes are batched
 * and invoked off the simulation tick path (interval flush, disconnect, war end).
 * ADR 0004 records the planned Postgres/Supabase adapter swap.
 */
export interface Storage {
  loadAccounts(): readonly StoredAccount[];
  flushAccounts(accounts: readonly StoredAccount[]): void;
  loadWarTally(): { readonly ottoman: number; readonly byzantine: number };
  saveWarTally(tally: { readonly ottoman: number; readonly byzantine: number }): void;
  appendXpLedger(rows: readonly XpLedgerRow[]): void;
  loadXpLedgerSince(since: number): readonly XpLedgerRow[];
  getAuthLinkByAuthId(authId: string): AuthLink | undefined;
  getAuthLinkByEmail(email: string): AuthLink | undefined;
  saveAuthLink(link: AuthLink): "linked" | "auth-conflict" | "email-conflict" | "player-conflict";
  createPendingAuthUpgrade(upgrade: PendingAuthUpgrade): void;
  consumePendingAuthUpgrade(stateHash: string, now: number): PendingAuthUpgrade | undefined;
  consumeRateLimit(keyHash: string, now: number, windowMs: number, limit: number): boolean;
  isPlayerMuted(playerId: number): boolean;
  setPlayerMuted(playerId: number, muted: boolean): void;
  appendChatReport(report: StoredChatReport): void;
  createClan(name: string, tag: string, founderPlayerId: number, createdAt: number): number | undefined;
  loadClanById(clanId: number): StoredClan | undefined;
  loadClanByTag(tag: string): StoredClan | undefined;
  loadClanByName(name: string): StoredClan | undefined;
  loadAllClans(): readonly StoredClan[];
  playerClan(playerId: number): StoredClan | undefined;
  findPlayerIdByName(name: string): number | undefined;
  clanMemberIds(clanId: number): readonly number[];
  clanMemberCount(clanId: number): number;
  addClanMember(clanId: number, playerId: number, joinedAt: number): boolean;
  removeClanMember(clanId: number, playerId: number): boolean;
  updateClanFounder(clanId: number, playerId: number): void;
  deleteClan(clanId: number): void;
  createClanInvite(clanId: number, playerId: number, invitedBy: number, createdAt: number): void;
  loadClanInvites(playerId: number): readonly StoredClanInvite[];
  consumeClanInvite(clanId: number, playerId: number): boolean;
  searchClans(query: string, limit: number): readonly StoredClan[];
  loadClanLeaderboard(clanId: number, since: number, limit: number): readonly LeaderboardRow[];
  // Phase 8c-7 social: block list (courtesy scoping, blocking player's view
  // only) and friends (request/accept lifecycle mirroring clan invites).
  blockPlayer(playerId: number, blockedPlayerId: number, createdAt: number): void;
  unblockPlayer(playerId: number, blockedPlayerId: number): boolean;
  isBlocked(playerId: number, blockedPlayerId: number): boolean;
  loadBlockedIds(playerId: number): readonly number[];
  createFriendRequest(fromId: number, toId: number, createdAt: number): void;
  loadFriendRequests(toId: number): readonly StoredFriendRequest[];
  consumeFriendRequest(fromId: number, toId: number): boolean;
  addFriendPair(firstId: number, secondId: number, createdAt: number): void;
  removeFriendPair(firstId: number, secondId: number): boolean;
  loadFriendIds(playerId: number): readonly number[];
  close(): void;
}
