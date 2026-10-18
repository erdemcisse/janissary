import { MedalTier, Team, type MedalCategory } from "@janissary/shared";
import type { FxEvent } from "../game/GameClient";
import { Medallion } from "./Medallion";

export interface UiToast {
  id: number;
  text: string;
  sub: string;
  tone: "info" | "success" | "error";
  at: number;
}

/**
 * The toast shell stays the single mechanism (Phase 7's architecture decision
 * stands) — this layer only owns presentation. XP/contract/world fx toasts,
 * auth/ui toasts, the promotion fanfare, and the medal ceremony all render
 * here off the same fxEvents/uiToasts streams.
 */
export function ToastLayer({ uiToasts, fxToasts }: { uiToasts: readonly UiToast[]; fxToasts: readonly FxEvent[] }): React.JSX.Element {
  return (
    <aside className="toast-layer">
      {fxToasts.map((event) => <p key={event.id} className="toast"><b>{event.text}</b>{event.sub !== "" && <small>{event.sub}</small>}</p>)}
      {uiToasts.map((toast) => <p key={toast.id} className={`toast ui ${toast.tone}`}><b>{toast.text}</b>{toast.sub !== "" && <small>{toast.sub}</small>}</p>)}
    </aside>
  );
}

export function displayFaceClass(team: Team): string {
  return team === Team.Byzantine ? "display-bz" : "display-ot";
}

/** Rank promotion — chevron insignia, faction display face, gold vignette. */
export function Fanfare({ event, team }: { event: FxEvent; team: Team }): React.JSX.Element {
  return (
    <div className="fanfare" key={event.id}>
      <div className="fanfare-vignette" />
      <div className="fanfare-insignia">▲▲▲</div>
      <h2 className={displayFaceClass(team)}>{event.text}</h2>
      {event.sub !== "" && <p>{event.sub}</p>}
    </div>
  );
}

function MedalRays(): React.JSX.Element {
  return (
    <svg className="mc-rays" viewBox="0 0 260 260" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => {
        const angle = (index * Math.PI) / 6;
        return (
          <line
            key={index}
            x1={130 + 66 * Math.cos(angle)}
            y1={130 + 66 * Math.sin(angle)}
            x2={130 + (index % 2 === 0 ? 122 : 100) * Math.cos(angle)}
            y2={130 + (index % 2 === 0 ? 122 : 100) * Math.sin(angle)}
            stroke="#f4d58d"
            strokeWidth={index % 2 === 0 ? 2 : 1.2}
            opacity={index % 2 === 0 ? 0.7 : 0.4}
          />
        );
      })}
    </svg>
  );
}

/**
 * Medal unlock — the BF1-bar ceremony: a beat of pause (vignette only),
 * then the cast/enamelled medallion itself reveals in step with the
 * escalating sting, then the honor's name and citation. Bronze/Silver/Gold
 * escalate size, glow, and (gold only) sunburst rays.
 */
export function MedalCeremony({ event, team }: { event: FxEvent; team: Team }): React.JSX.Element | null {
  const medal = event.medal;
  if (medal === undefined) return null;
  const tier = medal.tier as MedalTier;
  const faction = team === Team.Byzantine ? Team.Byzantine : Team.Ottoman;
  const size = tier === MedalTier.Gold ? 120 : tier === MedalTier.Silver ? 104 : 88;
  return (
    <div className={`medal-ceremony tier-${tier}`} key={event.id}>
      <div className="mc-vignette" />
      <div className="mc-medal">
        {tier === MedalTier.Gold && <MedalRays />}
        <Medallion category={medal.category as MedalCategory} tier={tier} faction={faction} size={size} />
      </div>
      <h2 className={`mc-name ${displayFaceClass(faction)}`}>{event.text}</h2>
      {event.sub !== "" && <p className="mc-sub">{event.sub}</p>}
    </div>
  );
}
