import { RoundPhase, Team } from "@janissary/shared";
import type { CareerDisplay, DebugStats, FxEvent } from "../game/GameClient";
import { compassBearing, siegeObjective } from "../game/siege";

const RELOAD_RING_RADIUS = 25;
const RELOAD_RING_CIRCUMFERENCE = 2 * Math.PI * RELOAD_RING_RADIUS;
const RETICLE_MIN_SPREAD = 0.0028;
const RETICLE_MAX_SPREAD = 0.075;

/** Maps the authoritative angular cone to the SVG's heraldic spearhead gap. */
export function reticleGapForSpread(spreadRadians: number): number {
  const normalized = Math.max(0, Math.min(1, (spreadRadians - RETICLE_MIN_SPREAD) / (RETICLE_MAX_SPREAD - RETICLE_MIN_SPREAD)));
  return 5 + normalized * 9;
}

/**
 * Center reticle with a heraldic compass silhouette instead of a modern
 * crosshair, plus the
 * Phase 8e-1 ammo state where the eyes already are: a radial sweep around
 * the reticle while ramming (driven by snapshot reloadTicks → shared tuning),
 * a dimmed dot while the pan is empty, and a READY flash on completion.
 * Phase 8e-3: the reload radial only applies to the ranged slot; a melee
 * slot reuses the ring as a swing-readiness sweep that fills as the blade
 * recovers (a blade's dot never dims — it is always "loaded").
 */
export function Reticle({ hit, headshot, kill, reloadFraction, loaded, ready, slotKind, meleeCooldownFraction, spreadRadians }: {
  hit: boolean;
  headshot: boolean;
  kill: boolean;
  reloadFraction: number;
  loaded: boolean;
  ready: boolean;
  slotKind: "melee" | "ranged";
  meleeCooldownFraction: number;
  spreadRadians: number;
}): React.JSX.Element {
  const reloading = slotKind === "ranged" && reloadFraction < 1;
  const swinging = slotKind === "melee" && meleeCooldownFraction < 1;
  const dotLit = slotKind === "melee" ? true : loaded;
  const gap = reticleGapForSpread(spreadRadians);
  return (
    <svg className={`reticle ${hit ? "hit" : ""} ${headshot ? "headshot" : ""} ${kill ? "kill" : ""} ${ready ? "ready" : ""}`} viewBox="0 0 64 64" aria-hidden="true">
      {reloading && (
        <circle
          className="ret-reload"
          cx="32"
          cy="32"
          r={RELOAD_RING_RADIUS}
          style={{ strokeDashoffset: RELOAD_RING_CIRCUMFERENCE * (1 - reloadFraction) }}
        />
      )}
      {swinging && (
        <circle
          className="ret-melee"
          cx="32"
          cy="32"
          r={RELOAD_RING_RADIUS}
          style={{ strokeDashoffset: RELOAD_RING_CIRCUMFERENCE * (1 - meleeCooldownFraction) }}
        />
      )}
      {ready && slotKind === "ranged" && <circle className="ret-ready" cx="32" cy="32" r={RELOAD_RING_RADIUS} />}
      <path className="ret-ornament" d="M25 16 Q32 11 39 16 M48 25 Q53 32 48 39 M39 48 Q32 53 25 48 M16 39 Q11 32 16 25" />
      <g className="ret-spread">
        <path d={`M32 ${32 - gap} L28.8 ${27.5 - gap} L35.2 ${27.5 - gap} Z`} />
        <path d={`M${32 + gap} 32 L${36.5 + gap} 28.8 L${36.5 + gap} 35.2 Z`} />
        <path d={`M32 ${32 + gap} L35.2 ${36.5 + gap} L28.8 ${36.5 + gap} Z`} />
        <path d={`M${32 - gap} 32 L${27.5 - gap} 35.2 L${27.5 - gap} 28.8 Z`} />
      </g>
      <circle className={`ret-dot ${dotLit ? "" : "empty"}`} cx="32" cy="32" r="2.2" />
      <circle className="ret-bore" cx="32" cy="32" r="0.65" />
      <circle className="ret-headshot-ring" cx="32" cy="32" r="7.5" />
      <g className="ret-hit">
        <line x1="11" y1="11" x2="22" y2="22" />
        <line x1="53" y1="11" x2="42" y2="22" />
        <line x1="11" y1="53" x2="22" y2="42" />
        <line x1="53" y1="53" x2="42" y2="42" />
      </g>
      <g className="ret-kill">
        <path d="M32 4 L60 32 L32 60 L4 32 Z" />
        <line x1="11" y1="11" x2="22" y2="22" />
        <line x1="53" y1="11" x2="42" y2="22" />
        <line x1="11" y1="53" x2="22" y2="42" />
        <line x1="53" y1="53" x2="42" y2="42" />
      </g>
    </svg>
  );
}

export function DamageIndicator({ direction }: { direction: number }): React.JSX.Element {
  return <div key={direction} className="damage-indicator" style={{ transform: `translateX(-50%) rotate(${direction}rad)` }}>⌃</div>;
}

/** War score — top center: tickets, the gate capture bar, round state. */
export function WarScore({ stats }: { stats: DebugStats }): React.JSX.Element {
  const ownerClass = stats.captureOwner === Team.Ottoman ? "owner-ot" : stats.captureOwner === Team.Byzantine ? "owner-bz" : "";
  const stateLabel = stats.roundPhase === RoundPhase.Victory
    ? "WAR DECIDED"
    : stats.captureOwner === Team.None ? "CONTEST THE GATE" : stats.captureOwner === Team.Ottoman ? "OTTOMANS HOLD" : "BYZANTINES HOLD";
  // Siege objective (siege loop §2.3): a second line on the same banner
  // surface, computed client-side per team, with a bearing + distance pointer
  // toward the objective (§3.2). undefined = the state label stands alone.
  const objective = stats.roundPhase === RoundPhase.Victory
    ? undefined
    : siegeObjective({
      team: stats.team,
      captureOwner: stats.captureOwner,
      walls: stats.walls,
      wallHp: stats.wallHp,
      cannons: stats.cannons,
      selfX: stats.selfX,
      selfZ: stats.selfZ,
    });
  let objectiveLine: string | undefined;
  if (objective !== undefined) {
    const dx = objective.targetX - stats.selfX;
    const dz = objective.targetZ - stats.selfZ;
    const distance = Math.max(1, Math.round(Math.hypot(dx, dz)));
    objectiveLine = `${objective.text} · ${distance} m ${compassBearing(dx, dz)}`;
  }
  return (
    <section className={`war-score hud-panel ${ownerClass}`}>
      <div className="tickets ot"><b>{stats.ottomanTickets}</b><small>OTTOMAN</small></div>
      <div className="gate">
        <div className="capture">
          <span style={{ width: `${Math.abs(stats.captureProgress) * 50}%`, marginLeft: stats.captureProgress < 0 ? `${50 + stats.captureProgress * 50}%` : "50%" }} />
        </div>
        <small>{stateLabel}</small>
        {objectiveLine !== undefined && <small className="objective">{objectiveLine}</small>}
      </div>
      <div className="tickets bz"><b>{stats.byzantineTickets}</b><small>BYZANTINE</small></div>
    </section>
  );
}

/** Contextual one-line interact prompt (siege loop): push/man/deploy a bombard, repair the wall. */
export function InteractHint({ text }: { text: string }): React.JSX.Element {
  return <p className="interact-hint">{text}</p>;
}

/** Vitals — bottom left: health and ammo, pulsing on change. */
export function Vitals({ health, ammo, reloadTicks, weaponName }: { health: number; ammo: number; reloadTicks: number; weaponName: string }): React.JSX.Element {
  const low = health <= 30;
  const reloading = reloadTicks > 0;
  return (
    <section className="vitals hud-panel">
      <div className="hp-row">
        <b key={health} className={`hp-num pulse ${low ? "low" : ""}`}>{health}</b>
        <small>HEALTH</small>
      </div>
      <div className={`hp-bar ${low ? "low" : ""}`}><span style={{ width: `${Math.max(0, Math.min(100, health))}%` }} /></div>
      <div className="ammo-row">
        <b key={reloading ? "reloading" : ammo} className={`ammo-num pulse ${reloading ? "reloading" : ""}`}>
          {reloading ? "RELOADING" : `${ammo} / 1`}
        </b>
        <small>{reloading ? "RAMMING CHARGE" : weaponName.toUpperCase()}</small>
      </div>
    </section>
  );
}

export function XpHud({ career }: { career: CareerDisplay }): React.JSX.Element {
  const fraction = career.xpNext <= 0 ? 0 : Math.max(0, Math.min(1, career.xp / career.xpNext));
  return (
    <section className="xp-hud">
      <div className="xp-bar"><span style={{ width: `${fraction * 100}%` }} /></div>
      <div className="xp-label">
        <span className="xp-rank">{career.title}{career.prestige > 0 ? ` ★${career.prestige}` : ""}</span>
        <span>{career.xp} / {career.xpNext} XP</span>
      </div>
    </section>
  );
}

export function FloatyLayer({ events }: { events: readonly FxEvent[] }): React.JSX.Element {
  return (
    <div className="floaty-layer">
      {events.map((event) => <span key={event.id} className="xp-floaty">{event.text}</span>)}
    </div>
  );
}

/** The BF1-style own-kill payoff — distinct from the passive kill feed. */
export function OwnKillNotification({ events }: { events: readonly FxEvent[] }): React.JSX.Element | null {
  const latest = [...events].reverse().find((event) => event.kind === "ownkill");
  if (latest === undefined) return null;
  return (
    <div key={latest.id} className={`own-kill ${latest.headshot === true ? "headshot" : ""}`}>
      {latest.headshot === true && <span className="ok-hs">HEADSHOT</span>}
      <span className="ok-text">{latest.text}</span>
      {latest.xp !== undefined && <span className="ok-xp">+{latest.xp} XP</span>}
    </div>
  );
}

/** Unobtrusive pips, bottom right: connection quality, support aura. */
export function HudPips({ pingMs, buffed }: { pingMs: number; buffed: boolean }): React.JSX.Element {
  const quality = pingMs < 80 ? "" : pingMs < 150 ? "warn" : "bad";
  return (
    <div className="hud-pips">
      {buffed && <span className="pip aura" title="Inspired by a nearby Mehter or Priest">◈ INSPIRED</span>}
      <span className={`pip ${quality}`} title="Connection quality"><i />{pingMs} MS</span>
    </div>
  );
}

export function SignedInPill({ email }: { email: string }): React.JSX.Element {
  return (
    <div className="signed-in-pill" title="Progress is saved to this account">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5 L4 8 L8.5 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      SIGNED IN AS {email.toUpperCase()}
    </div>
  );
}
