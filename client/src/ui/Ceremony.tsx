import { MedalCategory, MedalTier, Team } from "@janissary/shared";
import type { WarSummaryDisplay } from "../game/GameClient";
import { Medallion } from "./Medallion";
import { displayFaceClass } from "./ToastLayer";

/**
 * End-of-war ceremony — the same medallion-ceremony visual language as an
 * individual medal unlock, scaled up for the war's decisive moment: the
 * victor's display face, a gilt medallion of the winning side, the war
 * honors, and the XP line.
 */
export function WarCeremony({ summary, remainingTicks }: {
  summary: WarSummaryDisplay;
  remainingTicks: number;
}): React.JSX.Element {
  const winner = summary.winner === Team.Byzantine ? Team.Byzantine : Team.Ottoman;
  const winnerText = summary.winner === Team.Ottoman ? "The Ottomans Take the Gate" : summary.winner === Team.Byzantine ? "The City Holds" : "War Decided";
  return (
    <div className="ceremony">
      <div className="c-medal">
        <Medallion category={MedalCategory.Veteran} tier={MedalTier.Gold} faction={winner} size={110} />
      </div>
      <h2 className={`${displayFaceClass(winner)} ${winner === Team.Ottoman ? "ot" : "bz"}`}>{winnerText}</h2>
      <p className="tally">Ottomans {summary.warTallyOttoman} – {summary.warTallyByzantine} Byzantium</p>
      {summary.medals.length > 0 && (
        <ul className="medal-list">
          {summary.medals.map((medal) => (
            <li key={medal.kind}>
              <Medallion category={MedalCategory.Veteran} tier={MedalTier.Bronze} faction={winner} size={26} />
              {medal.title}
            </li>
          ))}
        </ul>
      )}
      <p className="war-xp">War XP {summary.warXpEarned}{summary.welcomeBackBonus > 0 ? ` · Welcome back +${summary.welcomeBackBonus}` : ""}</p>
      <small>New round in {(remainingTicks / 20).toFixed(1)} s</small>
    </div>
  );
}
