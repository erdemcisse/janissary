import {
  CLAN_MEMBER_CAP,
  CLAN_NAME_MAX,
  CLAN_TAG_PATTERN,
  normalizeClanTag,
  validClanName,
  validClanTag,
} from "@janissary/shared";
import { dailyWindowStart, weeklyWindowStart } from "./progression";
import type { LeaderboardRow, Storage, StoredClan } from "./storage/storage";

export type ClanErrorCode =
  | "invalid-name"
  | "invalid-tag"
  | "exists"
  | "not-found"
  | "already-in-clan"
  | "not-a-member"
  | "not-the-founder"
  | "clan-full"
  | "player-not-found"
  | "invite-missing"
  | "target-in-clan";

export type ClanResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClanErrorCode };

export interface ClanMemberView {
  readonly playerId: number;
  readonly name: string;
  readonly isFounder: boolean;
}

export interface ClanRosterView {
  readonly clanId: number;
  readonly name: string;
  readonly tag: string;
  readonly founderPlayerId: number;
  readonly memberCount: number;
  readonly members: readonly ClanMemberView[];
  readonly role: "none" | "member" | "founder";
}

export type ClanLeaderboardWindow = "daily" | "weekly" | "alltime";

const CLAN_NAME_ERROR: ClanErrorCode = "invalid-name";
const CLAN_TAG_ERROR: ClanErrorCode = "invalid-tag";

function windowStart(window: ClanLeaderboardWindow, now: number): number {
  if (window === "daily") return dailyWindowStart(now);
  if (window === "weekly") return weeklyWindowStart(now);
  return 0;
}

export class ClanService {
  readonly #storage: Storage;
  readonly #resolveName: (playerId: number) => string | undefined;
  readonly #now: () => number;
  readonly #tagCache = new Map<number, string>();

  constructor(storage: Storage, resolveName: (playerId: number) => string | undefined, now: () => number = Date.now) {
    this.#storage = storage;
    this.#resolveName = resolveName;
    this.#now = now;
    for (const clan of storage.loadAllClans()) {
      for (const memberId of storage.clanMemberIds(clan.clanId)) this.#tagCache.set(memberId, clan.tag);
    }
  }

  /**
   * In-memory playerId → tag lookup used by the EntityJoin broadcast on the
   * snapshot path; never touches storage so the replication path stays cheap.
   */
  tagForPlayer(playerId: number): string | undefined {
    return this.#tagCache.get(playerId);
  }

  create(playerId: number, name: string, tag: string): ClanResult<StoredClan> {
    const cleanName = name.trim().slice(0, CLAN_NAME_MAX);
    if (!validClanName(cleanName)) return { ok: false, error: CLAN_NAME_ERROR };
    const cleanTag = normalizeClanTag(tag);
    if (!validClanTag(cleanTag)) return { ok: false, error: CLAN_TAG_ERROR };
    if (this.#storage.playerClan(playerId) !== undefined) return { ok: false, error: "already-in-clan" };
    const clanId = this.#storage.createClan(cleanName, cleanTag, playerId, this.#now());
    if (clanId === undefined) return { ok: false, error: "exists" };
    const clan = this.#storage.loadClanById(clanId);
    if (clan === undefined) return { ok: false, error: "not-found" };
    this.#tagCache.set(playerId, cleanTag);
    return { ok: true, value: clan };
  }

  join(playerId: number, tag: string): ClanResult<StoredClan> {
    const cleanTag = normalizeClanTag(tag);
    if (!CLAN_TAG_PATTERN.test(cleanTag)) return { ok: false, error: CLAN_TAG_ERROR };
    const clan = this.#storage.loadClanByTag(cleanTag);
    if (clan === undefined) return { ok: false, error: "not-found" };
    return this.#addMember(playerId, clan);
  }

  invite(playerId: number, targetName: string): ClanResult<{ readonly clanId: number; readonly targetPlayerId: number }> {
    const clan = this.#storage.playerClan(playerId);
    if (clan === undefined) return { ok: false, error: "not-a-member" };
    const target = this.#storage.findPlayerIdByName(targetName.trim());
    if (target === undefined) return { ok: false, error: "player-not-found" };
    if (this.#storage.playerClan(target) !== undefined) return { ok: false, error: "target-in-clan" };
    this.#storage.createClanInvite(clan.clanId, target, playerId, this.#now());
    return { ok: true, value: { clanId: clan.clanId, targetPlayerId: target } };
  }

  acceptInvite(playerId: number, clanId: number): ClanResult<StoredClan> {
    const clan = this.#storage.loadClanById(clanId);
    if (clan === undefined) return { ok: false, error: "not-found" };
    if (!this.#storage.consumeClanInvite(clanId, playerId)) return { ok: false, error: "invite-missing" };
    return this.#addMember(playerId, clan);
  }

  invites(playerId: number): readonly { clanId: number; name: string; tag: string; invitedBy: number; createdAt: number }[] {
    return this.#storage.loadClanInvites(playerId).map((invite) => {
      const clan = this.#storage.loadClanById(invite.clanId);
      return {
        clanId: invite.clanId,
        name: clan?.name ?? "",
        tag: clan?.tag ?? "",
        invitedBy: invite.invitedBy,
        createdAt: invite.createdAt,
      };
    });
  }

  leave(playerId: number): ClanResult<{ readonly disbanded: boolean }> {
    const clan = this.#storage.playerClan(playerId);
    if (clan === undefined) return { ok: false, error: "not-a-member" };
    const memberIds = this.#storage.clanMemberIds(clan.clanId);
    if (clan.founderPlayerId === playerId) {
      if (memberIds.length > 1) {
        const successor = memberIds.find((memberId) => memberId !== playerId);
        if (successor !== undefined) this.#transferFounder(clan.clanId, successor);
      } else {
        this.#storage.deleteClan(clan.clanId);
        this.#tagCache.delete(playerId);
        return { ok: true, value: { disbanded: true } };
      }
    }
    this.#storage.removeClanMember(clan.clanId, playerId);
    this.#tagCache.delete(playerId);
    return { ok: true, value: { disbanded: false } };
  }

  kick(founderPlayerId: number, targetPlayerId: number): ClanResult<{ readonly clanId: number }> {
    const clan = this.#storage.playerClan(founderPlayerId);
    if (clan === undefined) return { ok: false, error: "not-a-member" };
    if (clan.founderPlayerId !== founderPlayerId) return { ok: false, error: "not-the-founder" };
    if (targetPlayerId === founderPlayerId) return { ok: false, error: "not-the-founder" };
    if (!this.#storage.removeClanMember(clan.clanId, targetPlayerId)) return { ok: false, error: "player-not-found" };
    this.#tagCache.delete(targetPlayerId);
    return { ok: true, value: { clanId: clan.clanId } };
  }

  roster(playerId: number): ClanResult<ClanRosterView> {
    const clan = this.#storage.playerClan(playerId);
    if (clan === undefined) return { ok: false, error: "not-a-member" };
    const memberIds = this.#storage.clanMemberIds(clan.clanId);
    const members: ClanMemberView[] = memberIds.map((memberId) => ({
      playerId: memberId,
      name: this.#resolveName(memberId) ?? `Player ${memberId}`,
      isFounder: memberId === clan.founderPlayerId,
    }));
    const role = playerId === clan.founderPlayerId ? "founder" : "member";
    return {
      ok: true,
      value: {
        clanId: clan.clanId,
        name: clan.name,
        tag: clan.tag,
        founderPlayerId: clan.founderPlayerId,
        memberCount: members.length,
        members,
        role,
      },
    };
  }

  rosterForTag(tag: string): ClanResult<ClanRosterView> {
    const cleanTag = normalizeClanTag(tag);
    const clan = this.#storage.loadClanByTag(cleanTag);
    if (clan === undefined) return { ok: false, error: "not-found" };
    const members = this.#storage.clanMemberIds(clan.clanId).map((memberId) => ({
      playerId: memberId,
      name: this.#resolveName(memberId) ?? `Player ${memberId}`,
      isFounder: memberId === clan.founderPlayerId,
    }));
    return {
      ok: true,
      value: {
        clanId: clan.clanId,
        name: clan.name,
        tag: clan.tag,
        founderPlayerId: clan.founderPlayerId,
        memberCount: members.length,
        members,
        role: "none",
      },
    };
  }

  search(query: string, limit = 10): readonly { clanId: number; name: string; tag: string; memberCount: number }[] {
    return this.#storage.searchClans(query, limit).map((clan) => ({
      clanId: clan.clanId,
      name: clan.name,
      tag: clan.tag,
      memberCount: this.#storage.clanMemberCount(clan.clanId),
    }));
  }

  leaderboard(window: ClanLeaderboardWindow, clanId: number, limit: number): LeaderboardRow[] {
    const since = windowStart(window, this.#now());
    return [...this.#storage.loadClanLeaderboard(clanId, since, limit)];
  }

  #addMember(playerId: number, clan: StoredClan): ClanResult<StoredClan> {
    if (this.#storage.playerClan(playerId) !== undefined) return { ok: false, error: "already-in-clan" };
    if (this.#storage.clanMemberCount(clan.clanId) >= CLAN_MEMBER_CAP) return { ok: false, error: "clan-full" };
    if (!this.#storage.addClanMember(clan.clanId, playerId, this.#now())) return { ok: false, error: "already-in-clan" };
    this.#tagCache.set(playerId, clan.tag);
    return { ok: true, value: clan };
  }

  #transferFounder(clanId: number, successorPlayerId: number): void {
    this.#storage.updateClanFounder(clanId, successorPlayerId);
  }
}

export function clanRoleCode(role: "none" | "member" | "founder"): number {
  if (role === "founder") return 2;
  if (role === "member") return 1;
  return 0;
}
