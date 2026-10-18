import type { Storage } from "./storage/storage";

export type SocialErrorCode =
  | "not-found"
  | "already-blocked"
  | "cannot-block-self"
  | "request-missing"
  | "already-friends"
  | "cannot-friend-self"
  | "target-blocked-you";

export type SocialResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SocialErrorCode };

export interface FriendView {
  readonly playerId: number;
  readonly name: string;
  readonly online: boolean;
  readonly team: number;
}

export interface FriendRequestView {
  readonly fromId: number;
  readonly name: string;
}

/**
 * Phase 8c-7 social service: block list and friends, account-scoped and
 * following the clan storage pattern exactly (one storage table per
 * relationship, request/accept lifecycle mirroring clan invites).
 *
 * SCOPE: blocking is a courtesy feature scoped to the blocking player's own
 * client — it hides the blocked player's chat and de-emphasises their
 * kill-feed entries on that client only. It is NOT a server-enforced mute;
 * a public-broadcast FPS cannot meaningfully prevent someone from being near
 * you, so nothing here changes the server's broadcast or chat routing.
 */
export class SocialService {
  readonly #storage: Storage;
  readonly #resolveName: (playerId: number) => string | undefined;
  readonly #now: () => number;

  constructor(storage: Storage, resolveName: (playerId: number) => string | undefined, now: () => number = Date.now) {
    this.#storage = storage;
    this.#resolveName = resolveName;
    this.#now = now;
  }

  blockedIds(playerId: number): readonly number[] {
    return this.#storage.loadBlockedIds(playerId);
  }

  isBlocked(playerId: number, otherId: number): boolean {
    return this.#storage.isBlocked(playerId, otherId);
  }

  block(playerId: number, targetName: string): SocialResult<{ readonly targetPlayerId: number }> {
    const target = this.#storage.findPlayerIdByName(targetName.trim());
    if (target === undefined) return { ok: false, error: "not-found" };
    if (target === playerId) return { ok: false, error: "cannot-block-self" };
    this.#storage.blockPlayer(playerId, target, this.#now());
    return { ok: true, value: { targetPlayerId: target } };
  }

  unblock(playerId: number, targetPlayerId: number): SocialResult<{ readonly targetPlayerId: number }> {
    if (!this.#storage.unblockPlayer(playerId, targetPlayerId)) return { ok: false, error: "not-found" };
    return { ok: true, value: { targetPlayerId } };
  }

  friendIds(playerId: number): readonly number[] {
    return this.#storage.loadFriendIds(playerId);
  }

  areFriends(firstId: number, secondId: number): boolean {
    return this.#storage.loadFriendIds(firstId).includes(secondId);
  }

  sendRequest(playerId: number, targetName: string): SocialResult<{ readonly targetPlayerId: number }> {
    const target = this.#storage.findPlayerIdByName(targetName.trim());
    if (target === undefined) return { ok: false, error: "not-found" };
    if (target === playerId) return { ok: false, error: "cannot-friend-self" };
    if (this.#storage.loadFriendIds(playerId).includes(target)) return { ok: false, error: "already-friends" };
    if (this.#storage.isBlocked(target, playerId)) return { ok: false, error: "target-blocked-you" };
    this.#storage.createFriendRequest(playerId, target, this.#now());
    return { ok: true, value: { targetPlayerId: target } };
  }

  incomingRequests(playerId: number): readonly FriendRequestView[] {
    return this.#storage.loadFriendRequests(playerId).map((request) => ({
      fromId: request.fromId,
      name: this.#resolveName(request.fromId) ?? `Player ${request.fromId}`,
    }));
  }

  acceptRequest(playerId: number, fromId: number): SocialResult<{ readonly friendPlayerId: number }> {
    if (!this.#storage.consumeFriendRequest(fromId, playerId)) return { ok: false, error: "request-missing" };
    this.#storage.addFriendPair(playerId, fromId, this.#now());
    return { ok: true, value: { friendPlayerId: fromId } };
  }

  declineRequest(playerId: number, fromId: number): SocialResult<{ readonly fromId: number }> {
    if (!this.#storage.consumeFriendRequest(fromId, playerId)) return { ok: false, error: "request-missing" };
    return { ok: true, value: { fromId } };
  }

  removeFriend(playerId: number, friendPlayerId: number): SocialResult<{ readonly friendPlayerId: number }> {
    if (!this.#storage.removeFriendPair(playerId, friendPlayerId)) return { ok: false, error: "not-found" };
    return { ok: true, value: { friendPlayerId } };
  }

  /**
   * Friends with live presence: online (a connected socket) and, if in a war,
   * their current team. The game runs one war per server, so "which war" is
   * the server itself — the join-their-war action is a team preference, not
   * a server hop.
   */
  friends(playerId: number, connection: (playerId: number) => { online: boolean; team: number } | undefined): readonly FriendView[] {
    return this.#storage.loadFriendIds(playerId).map((friendId) => {
      const presence = connection(friendId);
      return {
        playerId: friendId,
        name: this.#resolveName(friendId) ?? `Player ${friendId}`,
        online: presence?.online ?? false,
        team: presence?.team ?? 0,
      };
    });
  }
}
