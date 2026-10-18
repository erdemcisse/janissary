import { Team } from "@janissary/shared";
import type { KillFeedEntry, KillFeedKind } from "../game/GameClient";

/**
 * Kill feed — one row per kill: faction-colored killer name, the weapon icon
 * (authoritative KillCause from the Death event — Phase 8c-7 replaced the
 * guessed category icons with per-weapon ones), the victim, and a HEADSHOT
 * chip when the XpEvent stream confirmed one. Layout is
 * killer → icon → victim, per the Battlefield-style reference. Rows enter
 * with a short slide-and-settle rather than the old generic fade.
 */

function teamClass(team: Team | undefined): string {
  return team === Team.Ottoman ? "ot" : team === Team.Byzantine ? "bz" : "";
}

function KillIcon({ kind }: { kind: KillFeedKind }): React.JSX.Element {
  switch (kind) {
    case "arquebus":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <circle cx="4" cy="7.5" r="2.3" fill="currentColor" />
          <line x1="8" y1="7.5" x2="14" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="8" y1="4.8" x2="12.5" y2="4.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
          <line x1="8" y1="10.2" x2="12.5" y2="10.8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case "crossbow":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M1 9 L14 9 L11.5 7 L13 5.5 L14 6 L15 5.4 L14 4.8 L12.4 6 L13.5 7.4 L12 9 Z" fill="currentColor" transform="translate(-1 0)" />
          <line x1="4.5" y1="5.2" x2="10.5" y2="12.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
    case "melee":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M3 12 L10.5 4.5 L12.5 2.5 L11 4 L4.5 11.5 Z" fill="currentColor" />
          <line x1="4.2" y1="8.6" x2="6.4" y2="10.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="2.6" y1="12.4" x2="4" y2="13.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "sword":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M3 12 L10.5 4.5 L12.5 2.5 L11 4 L4.5 11.5 Z" fill="currentColor" />
          <line x1="4.2" y1="8.6" x2="6.4" y2="10.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <line x1="2.6" y1="12.4" x2="4" y2="13.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case "dagger":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M5 10.5 L9.5 6 L11 4.5 L9.9 5.8 L6.4 10 Z" fill="currentColor" />
          <line x1="6.2" y1="9.4" x2="7.6" y2="10.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.6" y1="11.2" x2="5.6" y2="11.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "artillery":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <circle cx="6" cy="9" r="3.4" fill="currentColor" />
          <rect x="8" y="4.6" width="6" height="2.6" rx="1" transform="rotate(-24 8 4.6)" fill="currentColor" />
        </svg>
      );
    case "galleygun":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M1.5 9.5 L13.5 9.5 L11.5 12.5 L4 12.5 Z" fill="currentColor" />
          <line x1="7.5" y1="2.5" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="7.5" cy="9" r="2.2" fill="currentColor" opacity="0.75" />
          <path d="M8.2 3 L12 6.5 L8.2 6.5 Z" fill="currentColor" opacity="0.75" />
        </svg>
      );
    case "drowning":
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <path d="M1 6 Q3.5 4.5 6 6 Q8.5 7.5 11 6 Q13.5 4.5 14 6 L14 9 Q11.5 7.5 9 9 Q6.5 10.5 4 9 Q1.5 7.5 1 9 Z" fill="currentColor" opacity="0.85" />
          <path d="M1 10.5 Q3.5 9 6 10.5 Q8.5 12 11 10.5 Q13.5 9 14 10.5 L14 13 L1 13 Z" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case "unknown":
    default:
      return (
        <svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">
          <circle cx="7.5" cy="6" r="2" fill="currentColor" />
          <path d="M7.5 8.5 C7.5 10 7 11 10.5 11.5 C8.5 13.5 5.5 13.5 4.5 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
  }
}

function KillFeedLine({ item }: { item: KillFeedEntry }): React.JSX.Element {
  const structured = item.killerName !== undefined && item.victimName !== undefined;
  return (
    <p className={`kill-line ${item.kind}${item.involvesLocal === true ? " own" : ""}${item.deemphasized === true ? " blocked" : ""}`}>
      {structured ? (
        // Killer name → weapon icon → victim name (Phase 8c-7 layout).
        <>
          <span className="kf-class">{item.killerClassLabel}</span>
          <span className={`kf-name ${teamClass(item.killerTeam)}`}>{item.killerName}</span>
          <span className="kf-icon"><KillIcon kind={item.kind} /></span>
          <span className="kf-class">{item.victimClassLabel}</span>
          <span className={`kf-name ${teamClass(item.victimTeam)}`}>{item.victimName}</span>
          {item.headshot === true && <span className="kf-hs">HEADSHOT</span>}
        </>
      ) : (
        <>
          <span className="kf-icon"><KillIcon kind={item.kind} /></span>
          <span className="kf-world">{item.text}</span>
        </>
      )}
    </p>
  );
}

export function KillFeed({ feed }: { feed: readonly KillFeedEntry[] }): React.JSX.Element {
  return <aside className="kill-feed">{feed.map((item) => <KillFeedLine key={item.id} item={item} />)}</aside>;
}
