import type { FormEvent } from "react";
import { CLAN_TAG_MAX } from "@janissary/shared";

/**
 * Clan tab — restyled to the new chrome; zero functional changes from
 * Phase 7 (same props, same handlers, same flows).
 */

interface ClanMemberRow {
  playerId: number;
  name: string;
  isFounder: boolean;
}

export interface ClanInviteRow {
  clanId: number;
  name: string;
  tag: string;
  invitedBy: number;
  createdAt: number;
}

export interface ClanView {
  clanId: number;
  name: string;
  tag: string;
  founderPlayerId: number;
  memberCount: number;
  role: string;
  members: readonly ClanMemberRow[];
}

export interface LeaderboardEntry {
  playerId: number;
  name: string;
  xp: number;
}

function blurOnEscape(event: React.KeyboardEvent): void {
  if (event.code === "Escape") {
    event.preventDefault();
    (event.target as HTMLElement).blur();
  }
}

export function ClanTab({ clan, invites, status, createName, createTag, joinTag, inviteName, search, searchResults, window, leaderboard, playerId, onSetCreateName, onSetCreateTag, onSetJoinTag, onSetInviteName, onSetSearch, onCreate, onJoin, onInvite, onAcceptInvite, onLeave, onKick, onSearch, onSelectWindow, claimed }: {
  clan: ClanView | undefined;
  invites: readonly ClanInviteRow[];
  status: string;
  createName: string;
  createTag: string;
  joinTag: string;
  inviteName: string;
  search: string;
  searchResults: readonly { clanId: number; name: string; tag: string; memberCount: number }[];
  window: "daily" | "weekly" | "alltime";
  leaderboard: readonly LeaderboardEntry[];
  playerId: number;
  onSetCreateName: (value: string) => void;
  onSetCreateTag: (value: string) => void;
  onSetJoinTag: (value: string) => void;
  onSetInviteName: (value: string) => void;
  onSetSearch: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
  onInvite: (event: FormEvent) => void;
  onAcceptInvite: (clanId: number) => void;
  onLeave: () => void;
  onKick: (playerId: number) => void;
  onSearch: (event: FormEvent) => void;
  onSelectWindow: (window: "daily" | "weekly" | "alltime") => void;
  claimed: boolean;
}): React.JSX.Element {
  return (
    <>
      <p className="clan-note">Clans persist on this server for any player id. Claimed accounts survive device changes; guests travel only with this browser.</p>
      {status !== "" && <p className="clan-status">{status}</p>}
      {clan === undefined ? (
        <>
          {invites.length > 0 && (
            <section>
              <h3 className="eyebrow">Invitations</h3>
              {invites.map((invite) => (
                <div key={invite.clanId} className="clan-invite">
                  <span>[{invite.tag}] {invite.name}</span>
                  <button type="button" onClick={() => onAcceptInvite(invite.clanId)}>Accept</button>
                </div>
              ))}
            </section>
          )}
          <section>
            <h3 className="eyebrow">Create a clan</h3>
            <form className="clan-form" onSubmit={onCreate}>
              <input maxLength={24} placeholder="Clan name" value={createName} onChange={(event) => onSetCreateName(event.target.value)} onKeyDown={blurOnEscape} />
              <input maxLength={CLAN_TAG_MAX} placeholder="Tag (3-5 letters)" value={createTag} onChange={(event) => onSetCreateTag(event.target.value.toUpperCase())} onKeyDown={blurOnEscape} />
              <button type="submit">Found</button>
            </form>
          </section>
          <section>
            <h3 className="eyebrow">Join by tag</h3>
            <form className="clan-form" onSubmit={onJoin}>
              <input maxLength={CLAN_TAG_MAX} placeholder="TAG" value={joinTag} onChange={(event) => onSetJoinTag(event.target.value.toUpperCase())} onKeyDown={blurOnEscape} />
              <button type="submit">Join</button>
            </form>
          </section>
          <section>
            <h3 className="eyebrow">Find a clan</h3>
            <form className="clan-form" onSubmit={onSearch}>
              <input placeholder="Name or tag" value={search} onChange={(event) => onSetSearch(event.target.value)} onKeyDown={blurOnEscape} />
              <button type="submit">Search</button>
            </form>
            {searchResults.length > 0 && (
              <div className="clan-search-results">
                {searchResults.map((result) => <p key={result.clanId}><span>[{result.tag}] {result.name}</span><small>{result.memberCount}/50 members</small></p>)}
              </div>
            )}
          </section>
          {!claimed && <p className="clan-note">You are playing as a guest — your clan will not follow you to another browser.</p>}
        </>
      ) : (
        <>
          <section>
            <h3 className="eyebrow">[{clan.tag}] {clan.name}</h3>
            <p className="clan-stats">{clan.memberCount}/50 members · founded by {clan.members.find((member) => member.isFounder)?.name ?? `player ${clan.founderPlayerId}`}</p>
            <div className="clan-roster">
              {clan.members.map((member) => (
                <p key={member.playerId} className={member.playerId === playerId ? "self" : ""}>
                  <span>{member.isFounder ? "★ " : ""}{member.name}{member.playerId === playerId ? " (you)" : ""}</span>
                  {clan.role === "founder" && member.playerId !== playerId && <button type="button" onClick={() => onKick(member.playerId)}>Kick</button>}
                </p>
              ))}
            </div>
          </section>
          <section>
            <h3 className="eyebrow">Clan leaderboard</h3>
            <div className="clan-windows">
              {(["daily", "weekly", "alltime"] as const).map((value) => (
                <button key={value} type="button" className={window === value ? "active" : ""} onClick={() => onSelectWindow(value)}>{value}</button>
              ))}
            </div>
            <div className="clan-leaderboard">
              {leaderboard.map((entry, index) => <p key={entry.playerId}><span>#{index + 1} {entry.name}</span><b>{entry.xp} XP</b></p>)}
              {leaderboard.length === 0 && <small>No clan XP earned in this window yet.</small>}
            </div>
          </section>
          <section>
            <h3 className="eyebrow">Invite a soldier</h3>
            <form className="clan-form" onSubmit={onInvite}>
              <input maxLength={24} placeholder="Player name" value={inviteName} onChange={(event) => onSetInviteName(event.target.value)} onKeyDown={blurOnEscape} />
              <button type="submit">Invite</button>
            </form>
          </section>
          {clan.role === "founder" && <p className="clan-note">As founder you can kick members. Leaving transfers the banner to the next-oldest member.</p>}
          <button type="button" className="clan-leave" onClick={onLeave}>Leave clan</button>
        </>
      )}
    </>
  );
}
