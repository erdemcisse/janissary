import { MedalCategory, MedalTier, Team, medalDisplayName, medalProgress } from "@janissary/shared";
import type { ClanDisplay, DebugStats, MedalChestEntry } from "../../game/GameClient";
import { Medallion } from "../Medallion";
import { displayFaceClass } from "../ToastLayer";

/**
 * Profile/career tab — the "page players should want to screenshot": faction
 * hero with the display-face rank title, lifetime stat grid, per-faction
 * career split (independent ladders), the medal chest with real medallion
 * art, contracts, and account actions.
 */

function medalChestEntries(stats: DebugStats): MedalChestEntry[] {
  const entries: MedalChestEntry[] = [];
  for (const counter of stats.medalState.counters) {
    const progress = medalProgress(counter.category as MedalCategory, counter.value, stats.medalState.wars);
    entries.push({
      category: counter.category,
      value: counter.value,
      tier: counter.tier,
      nextThreshold: progress.nextThreshold,
      intoTier: progress.intoTier,
    });
  }
  return entries;
}

function highestMedal(entries: readonly MedalChestEntry[]): { category: number; tier: number } | undefined {
  let best: { category: number; tier: number } | undefined;
  for (const entry of entries) {
    if (entry.tier <= 0) continue;
    if (best === undefined || entry.tier > best.tier) best = { category: entry.category, tier: entry.tier };
  }
  return best;
}

function MedalCard({ entry, team }: { entry: MedalChestEntry; team: Team }): React.JSX.Element {
  const category = entry.category as MedalCategory;
  const faction = team === Team.Byzantine ? Team.Byzantine : Team.Ottoman;
  const tierLabel = entry.tier === MedalTier.Bronze ? "Bronze" : entry.tier === MedalTier.Silver ? "Silver" : entry.tier === MedalTier.Gold ? "Gold" : "Locked";
  const nextTierLabel = entry.tier === 0 ? "Bronze" : entry.tier === MedalTier.Bronze ? "Silver" : "Gold";
  const fraction = Math.max(0, Math.min(1, entry.intoTier / Math.max(1, entry.nextThreshold)));
  return (
    <div className={`medal-card ${entry.tier === 0 ? "locked" : `tier-${entry.tier}`}`}>
      <Medallion category={category} tier={entry.tier === 0 ? MedalTier.Bronze : (entry.tier as MedalTier)} faction={faction} locked={entry.tier === 0} size={42} />
      <div className="medal-card-info">
        <b>{medalDisplayName(category, entry.tier === 0 ? MedalTier.Bronze : (entry.tier as MedalTier), faction)}</b>
        <small>{entry.tier === 0 ? "Locked" : `${tierLabel} honor`}</small>
        <div className="medal-progress">
          <div className="medal-progress-bar"><span style={{ width: `${fraction * 100}%` }} /></div>
          <small>{entry.tier === MedalTier.Gold ? "Complete" : `${nextTierLabel} ${entry.intoTier}/${entry.nextThreshold}`}</small>
        </div>
      </div>
    </div>
  );
}

export function ProfileTab({ stats, clan, onSwitchTeam, onSaveProgress }: {
  stats: DebugStats;
  clan: ClanDisplay | undefined;
  onSwitchTeam: () => void;
  onSaveProgress: () => void;
}): React.JSX.Element {
  const chest = medalChestEntries(stats);
  const highest = highestMedal(chest);
  const activeCareer = stats.careers[stats.team === Team.Byzantine ? 1 : 0] ?? stats.careers[0];
  const faction = stats.team === Team.Byzantine ? Team.Byzantine : Team.Ottoman;
  const headshots = stats.careers.reduce((sum, career) => sum + career.headshots, 0);
  const xpFraction = activeCareer === undefined || activeCareer.xpNext <= 0 ? 0 : Math.max(0, Math.min(1, activeCareer.xp / activeCareer.xpNext));
  return (
    <>
      <section>
        <div className="profile-hero hud-panel">
          <div>
            <div className={`ph-title ${displayFaceClass(faction)} ${faction === Team.Ottoman ? "ot" : "bz"}`}>
              {activeCareer?.title ?? "Recruit"}
              {activeCareer !== undefined && activeCareer.prestige > 0 && <span className="ph-prestige"> ★{activeCareer.prestige}</span>}
            </div>
            <div className="ph-sub">{faction === Team.Ottoman ? "OTTOMAN CAREER" : "BYZANTINE CAREER"} · RANK {activeCareer?.rank ?? 1}</div>
          </div>
          <div className="ph-xp">
            <div className="xp-bar"><span style={{ width: `${xpFraction * 100}%` }} /></div>
            <div className="ph-sub">{activeCareer?.xp ?? 0} / {activeCareer?.xpNext ?? 0} XP</div>
          </div>
        </div>
      </section>
      <section>
        <h3 className="eyebrow">Lifetime</h3>
        <div className="stat-grid">
          <div className="stat-cell"><b>{stats.lifetime.kills}</b><small>Kills</small></div>
          <div className="stat-cell"><b>{stats.lifetime.deaths}</b><small>Deaths</small></div>
          <div className="stat-cell"><b>{headshots}</b><small>Headshots</small></div>
          <div className="stat-cell"><b>{stats.lifetime.captures}</b><small>Captures</small></div>
          <div className="stat-cell"><b>{stats.lifetime.wars}</b><small>Wars</small></div>
          <div className="stat-cell"><b>{stats.lifetime.wins}</b><small>Victories</small></div>
        </div>
      </section>
      <section>
        <h3 className="eyebrow">Careers — per-faction ladders</h3>
        <div className="careers">
          {stats.careers.map((career, index) => {
            const side = index === 0 ? Team.Ottoman : Team.Byzantine;
            const fraction = career.xpNext <= 0 ? 0 : Math.max(0, Math.min(1, career.xp / career.xpNext));
            return (
              <div key={index} className={`career ${index === 0 ? "ot" : "bz"}`}>
                <span className="career-faction">{index === 0 ? "Ottoman" : "Byzantine"}</span>
                <span className={`career-title ${displayFaceClass(side)}`}>
                  {career.title}
                  {career.prestige > 0 && <span className="prestige"> ★{career.prestige}</span>}
                </span>
                <div className="xp-bar"><span style={{ width: `${fraction * 100}%` }} /></div>
                <span className="career-xp">{career.xp} / {career.xpNext} XP · rank {career.rank} · {career.headshots} headshots</span>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="eyebrow">Medal chest</h3>
        <div className="medal-chest">
          {chest.map((entry) => <MedalCard key={entry.category} entry={entry} team={stats.team} />)}
        </div>
      </section>
      <section>
        <h3 className="eyebrow">Daily contracts</h3>
        {stats.contracts.map((contract, index) => (
          <div key={index} className={`contract ${contract.completed ? "done" : ""}`}>
            <div className="contract-head"><span>{contract.description}</span><b>{contract.completed ? `+${contract.reward} XP` : `${contract.progress}/${contract.target}`}</b></div>
            <div className="contract-bar"><span style={{ width: `${Math.min(100, (contract.progress / Math.max(1, contract.target)) * 100)}%` }} /></div>
          </div>
        ))}
      </section>
      <section>
        <h3 className="eyebrow">Record</h3>
        <p className="lifetime-line">
          {stats.lifetime.wars} wars · {stats.lifetime.wins} wins · {stats.lifetime.kills} kills · {stats.lifetime.deaths} deaths · {stats.lifetime.captures} captures · {stats.lifetime.medals} war medals
        </p>
        {highest !== undefined && <p className="medal-line">Highest honor — {medalDisplayName(highest.category as MedalCategory, highest.tier as MedalTier, faction)}</p>}
        {clan !== undefined && <p className="medal-line">Clan — [{clan.tag}] {clan.name}</p>}
      </section>
      <section className="profile-actions">
        <button type="button" onClick={onSwitchTeam}>Switch to {stats.team === Team.Byzantine ? "Ottoman" : "Byzantine"} side</button>
        {!stats.claimed && <button type="button" onClick={onSaveProgress}>Save your progress</button>}
      </section>
      <p className="tally-line">All-time wars — Ottoman {stats.warTally.ottoman} · Byzantine {stats.warTally.byzantine}</p>
    </>
  );
}
