import { Team } from "@janissary/shared";
import type { ScoreboardRow } from "../game/GameClient";
import { displayFaceClass } from "./ToastLayer";

/**
 * Tab scoreboard — team-grouped, faction display faces on the group headers,
 * tabular numerals throughout. Rows come from the snapshot's entity set
 * (capped by the AOI pool at 150), so a plain scrolling list stays well
 * inside budget — no virtualization needed at the scale the wire supports.
 */

function rankInsignia(rank: number): string {
  if (rank >= 7) return "▲▲▲";
  if (rank >= 4) return "▲▲";
  return "▲";
}

function classShort(playerClass: number): string {
  const names: Readonly<Record<number, string>> = { 1: "JAN", 2: "SIP", 3: "TOP", 4: "MEH", 5: "GRD", 6: "KNT", 7: "WGN", 8: "PRI" };
  return names[playerClass] ?? "—";
}

function TeamSection({ team, rows, selfId, squadEntityIds }: { team: Team; rows: readonly ScoreboardRow[]; selfId: number; squadEntityIds?: ReadonlySet<number> | undefined }): React.JSX.Element {
  const sideClass = team === Team.Ottoman ? "ot" : "bz";
  const sorted = [...rows].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const totalKills = rows.reduce((sum, row) => sum + row.kills, 0);
  return (
    <section className={`sb-team ${sideClass}`}>
      <div className="sb-team-head">
        <b className={displayFaceClass(team)}>{team === Team.Ottoman ? "Ottoman Host" : "Roman Defense"}</b>
        <small>{rows.length} FIELDED · {totalKills} KILLS</small>
      </div>
      <div className="sb-cols"><span>Soldier</span><span>K</span><span>D</span><span>A</span><span>CAP</span></div>
      <div className="sb-rows">
        {sorted.map((row) => (
          <p key={row.entityId} className={`sb-row ${row.entityId === selfId ? "self" : ""}${squadEntityIds !== undefined && squadEntityIds.has(row.entityId) ? " squad" : ""}`}>
            <span className="sb-name">
              <span className="sb-rank" title={`Rank ${row.rank}${row.prestige > 0 ? ` · Prestige ${row.prestige}` : ""}`}>{rankInsignia(row.rank)}{row.prestige > 0 ? `★${row.prestige}` : ""}</span>
              {row.tag !== undefined ? `[${row.tag}] ` : ""}{row.name}
              {row.bot && <span className="sb-bot"> AI</span>}
            </span>
            <span>{row.kills}</span>
            <span>{row.deaths}</span>
            <span>{row.assists}</span>
            <span title={`${classShort(row.playerClass)} · ${row.captureSeconds}s on the point`}>{row.captureSeconds}s</span>
          </p>
        ))}
      </div>
    </section>
  );
}

export function Scoreboard({ rows, selfId, squadEntityIds }: { rows: readonly ScoreboardRow[]; selfId: number; squadEntityIds?: ReadonlySet<number> | undefined }): React.JSX.Element {
  const ottoman = rows.filter((row) => row.team === Team.Ottoman);
  const byzantine = rows.filter((row) => row.team === Team.Byzantine);
  return (
    <aside className="scoreboard">
      <div className="scoreboard-head">
        <h2>Siege roster</h2>
        <small>{rows.length} IN YOUR SECTOR</small>
      </div>
      <div className="scoreboard-teams">
        <TeamSection team={Team.Ottoman} rows={ottoman} selfId={selfId} squadEntityIds={squadEntityIds} />
        <TeamSection team={Team.Byzantine} rows={byzantine} selfId={selfId} squadEntityIds={squadEntityIds} />
      </div>
    </aside>
  );
}
