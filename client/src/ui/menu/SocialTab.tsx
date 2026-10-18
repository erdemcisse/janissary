import { useCallback, useEffect, useState } from "react";
import { SquadOp, Team } from "@janissary/shared";
import type { DebugStats } from "../../game/GameClient";

/**
 * Social tab (Phase 8c-7): friends with online/war presence, friend requests
 * (request/accept lifecycle mirroring clan invites), the squad, blocked
 * players, and the join-their-war action. Self-fetching over the same HTTP
 * endpoints the clan UI uses; squad actions go over the game socket.
 *
 * SCOPE (stated plainly): blocking is a courtesy filter on this client only —
 * it hides the blocked player's chat and de-emphasises their kill-feed rows
 * here. It is not a server-enforced mute.
 */

export interface FriendRow {
  readonly playerId: number;
  readonly name: string;
  readonly online: boolean;
  readonly team: number;
}

export interface RequestRow {
  readonly fromId: number;
  readonly name: string;
}

export interface BlockedRow {
  readonly playerId: number;
  readonly name: string;
}

interface SocialState {
  readonly friends: readonly FriendRow[];
  readonly requests: readonly RequestRow[];
  readonly blocked: readonly BlockedRow[];
}

const EMPTY_STATE: SocialState = { friends: [], requests: [], blocked: [] };

interface Props {
  stats: DebugStats;
  /** Squad command over the game socket (invite/leave/disband). */
  onSquadCommand: (op: SquadOp, targetPlayerId: number) => void;
  /** Re-queue the join on the friend's team (server balances when it can't). */
  onJoinWar: (team: Team) => void;
  /** Local player's entity id, to mark yourself in the squad roster. */
  selfEntityId: number;
}

function teamLabel(team: number): string {
  if (team === Team.Ottoman) return "Ottoman";
  if (team === Team.Byzantine) return "Byzantine";
  return "—";
}

export function SocialTab({ stats, onSquadCommand, onJoinWar, selfEntityId }: Props): React.JSX.Element {
  const [state, setState] = useState<SocialState>(EMPTY_STATE);
  const [status, setStatus] = useState("");
  const [addName, setAddName] = useState("");
  const [blockName, setBlockName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("janissary-token") ?? "";
    try {
      const response = await fetch(`${window.location.origin}/social/friends`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const body = await response.json() as { friends?: FriendRow[]; requests?: RequestRow[]; blocked?: BlockedRow[] };
      setState({
        friends: body.friends ?? [],
        requests: body.requests ?? [],
        blocked: body.blocked ?? [],
      });
    } catch {
      // The social panel is optional; a failed fetch just leaves the last state.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, stats.fxEvents]);

  const post = async (path: string, body: Record<string, unknown>): Promise<string | undefined> => {
    const token = localStorage.getItem("janissary-token") ?? "";
    setBusy(true);
    try {
      const response = await fetch(`${window.location.origin}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const parsed = await response.json() as { error?: string; ok?: boolean };
      if (!response.ok) return parsed.error ?? "request failed";
      await refresh();
      return undefined;
    } catch {
      return "network error";
    } finally {
      setBusy(false);
    }
  };

  const squadIds = stats.squadEntityIds;
  const squadMembers = stats.scoreboard
    .filter((row) => squadIds.has(row.entityId))
    .map((row) => ({ entityId: row.entityId, name: row.name, team: row.team, self: row.entityId === selfEntityId }));
  const inSquad = squadMembers.length > 0;

  const submitFriend = (event: React.FormEvent): void => {
    event.preventDefault();
    if (addName.trim() === "") return;
    void post("/social/request", { name: addName.trim() }).then((error) => setStatus(error ?? `Request sent to ${addName.trim()}`));
    setAddName("");
  };
  const submitBlock = (event: React.FormEvent): void => {
    event.preventDefault();
    if (blockName.trim() === "") return;
    void post("/social/block", { name: blockName.trim() }).then((error) => setStatus(error ?? `Blocked ${blockName.trim()}`));
    setBlockName("");
  };

  return (
    <div className="social-tab">
      <p className="clan-note">
        Blocking is a courtesy filter on your own view: a blocked player's chat is hidden and
        their kill-feed rows are dimmed here. It is not a server-enforced mute.
      </p>

      <h3 className="eyebrow">Squad</h3>
      {inSquad ? (
        <>
          <div className="social-rows">
            {squadMembers.map((member) => (
              <span key={member.entityId} className={`social-row squad ${member.self ? "self" : ""}`}>
                <b>{member.name}</b>
                <small>{member.self ? "you" : teamLabel(member.team)}</small>
              </span>
            ))}
          </div>
          <div className="social-actions">
            <button type="button" className="secondary" onClick={() => onSquadCommand(SquadOp.Leave, 0)}>Leave squad</button>
            <button type="button" className="secondary" onClick={() => onSquadCommand(SquadOp.Disband, 0)}>Disband</button>
          </div>
        </>
      ) : (
        <p className="clan-note">Invite an online friend below to start a squad (cap 6). Squads survive wars while members stay connected.</p>
      )}

      <h3 className="eyebrow">Friends</h3>
      <form className="social-form" onSubmit={submitFriend}>
        <input value={addName} maxLength={24} placeholder="Friend's display name" onChange={(event) => setAddName(event.target.value)} />
        <button type="submit" disabled={busy}>Send request</button>
      </form>
      {state.requests.length > 0 && (
        <div className="social-rows">
          {state.requests.map((request) => (
            <span key={request.fromId} className="social-row">
              <b>{request.name}</b>
              <small>wants to be friends</small>
              <button type="button" disabled={busy} onClick={() => void post("/social/accept", { fromId: request.fromId }).then((error) => setStatus(error ?? ""))}>Accept</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => void post("/social/decline", { fromId: request.fromId })}>Decline</button>
            </span>
          ))}
        </div>
      )}
      <div className="social-rows">
        {state.friends.map((friend) => (
          <span key={friend.playerId} className={`social-row ${friend.online ? "online" : "offline"}`}>
            <b>{friend.name}</b>
            <small>{friend.online ? `in this war · ${teamLabel(friend.team)}` : "offline"}</small>
            {friend.online && (
              <>
                <button type="button" disabled={busy} onClick={() => onSquadCommand(SquadOp.Invite, friend.playerId)}>Invite to squad</button>
                <button type="button" className="secondary" disabled={busy} onClick={() => onJoinWar(friend.team === Team.Byzantine ? Team.Byzantine : Team.Ottoman)}>Join their war</button>
              </>
            )}
            <button type="button" className="danger" disabled={busy} onClick={() => void post("/social/remove", { friendId: friend.playerId })}>Remove</button>
          </span>
        ))}
        {state.friends.length === 0 && <p className="clan-note">No friends yet — add one above. You can only squad up with friends.</p>}
      </div>
      <p className="clan-note">
        Join their war lands you on their team when the balance allows (the server steps in only
        when the sides are more than two apart). Every friend here is already in the same war —
        this server hosts it.
      </p>

      <h3 className="eyebrow">Blocked</h3>
      <form className="social-form" onSubmit={submitBlock}>
        <input value={blockName} maxLength={24} placeholder="Block a player by name" onChange={(event) => setBlockName(event.target.value)} />
        <button type="submit" disabled={busy}>Block</button>
      </form>
      {state.blocked.map((entry) => (
        <span key={entry.playerId} className="social-row">
          <b>{entry.name}</b>
          <button type="button" className="secondary" disabled={busy} onClick={() => void post("/social/unblock", { playerId: entry.playerId })}>Unblock</button>
        </span>
      ))}
      {status !== "" && <p className="clan-note">{status}</p>}
    </div>
  );
}
