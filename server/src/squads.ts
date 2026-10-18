import { SQUAD_CAP } from "@janissary/shared";

export type SquadErrorCode = "not-friend" | "already-in-squad" | "squad-full" | "not-in-squad" | "not-leader" | "target-offline";

/**
 * In-session squads (Phase 8c-7). Deliberately NOT persistent: a squad is a
 * lightweight party scoped in server memory (the same layer as the socket
 * maps — it survives war boundaries because it is keyed by playerId, not by
 * war state) and dissolves when the leader disconnects or disbands it, or
 * when a member disconnects (that member leaves; the squad persists for the
 * rest). Invites are restricted to friends (the friends list is the only
 * entry point), capped at SQUAD_CAP. No per-tick work: state changes only on
 * invite/leave/disband/disconnect, all event-driven.
 */
interface Squad {
  readonly id: number;
  readonly leaderPlayerId: number;
  readonly members: Set<number>;
}

export class SquadManager {
  #nextId = 1;
  readonly #squads = new Map<number, Squad>();
  readonly #byPlayer = new Map<number, number>();

  constructor(
    private readonly isFriend: (firstId: number, secondId: number) => boolean,
    private readonly isOnline: (playerId: number) => boolean,
  ) {}

  /** Invite a friend; creates the squad when the leader has none. */
  invite(leaderPlayerId: number, targetPlayerId: number): { readonly affected: readonly number[] } | SquadErrorCode {
    if (!this.isFriend(leaderPlayerId, targetPlayerId)) return "not-friend";
    if (!this.isOnline(targetPlayerId)) return "target-offline";
    const squadId = this.#byPlayer.get(leaderPlayerId);
    if (squadId !== undefined) {
      const squad = this.#squads.get(squadId);
      if (squad === undefined) return "not-in-squad";
      if (squad.leaderPlayerId !== leaderPlayerId) return "not-leader";
      if (this.#byPlayer.has(targetPlayerId)) return "already-in-squad";
      if (squad.members.size >= SQUAD_CAP) return "squad-full";
      squad.members.add(targetPlayerId);
      this.#byPlayer.set(targetPlayerId, squadId);
      return { affected: [...squad.members] };
    }
    const id = this.#nextId++;
    this.#squads.set(id, { id, leaderPlayerId, members: new Set([leaderPlayerId, targetPlayerId]) });
    this.#byPlayer.set(leaderPlayerId, id);
    this.#byPlayer.set(targetPlayerId, id);
    return { affected: [leaderPlayerId, targetPlayerId] };
  }

  /**
   * Member leaves; leader leaving dissolves the squad. Returns the playerIds
   * whose squad state changed (to broadcast), including the leaver.
   */
  leave(playerId: number): readonly number[] {
    const squadId = this.#byPlayer.get(playerId);
    if (squadId === undefined) return [];
    const squad = this.#squads.get(squadId);
    if (squad === undefined) {
      this.#byPlayer.delete(playerId);
      return [playerId];
    }
    if (squad.leaderPlayerId === playerId) {
      const affected = [...squad.members];
      this.#remove(squadId);
      return affected;
    }
    squad.members.delete(playerId);
    this.#byPlayer.delete(playerId);
    if (squad.members.size === 0) this.#remove(squadId);
    return [playerId, ...squad.members];
  }

  /** Leader-disband: dissolves the squad; returns who to notify. */
  disband(leaderPlayerId: number): { readonly affected: readonly number[] } | SquadErrorCode {
    const squadId = this.#byPlayer.get(leaderPlayerId);
    const squad = squadId === undefined ? undefined : this.#squads.get(squadId);
    if (squad === undefined) return "not-in-squad";
    if (squad.leaderPlayerId !== leaderPlayerId) return "not-leader";
    const affected = [...squad.members];
    this.#remove(squad.id);
    return { affected };
  }

  memberEntityIds(playerId: number, resolveEntityId: (playerId: number) => number | undefined): readonly number[] {
    const squadId = this.#byPlayer.get(playerId);
    const squad = squadId === undefined ? undefined : this.#squads.get(squadId);
    if (squad === undefined) return [];
    const ids: number[] = [];
    for (const memberId of squad.members) {
      const entityId = resolveEntityId(memberId);
      if (entityId !== undefined && entityId !== 0) ids.push(entityId);
    }
    return ids;
  }

  #remove(squadId: number): void {
    const squad = this.#squads.get(squadId);
    if (squad === undefined) return;
    this.#squads.delete(squadId);
    for (const memberId of squad.members) this.#byPlayer.delete(memberId);
  }
}
