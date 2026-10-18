import { useId } from "react";
import { MedalTier, Team, medalIdentity, type MedalCategory } from "@janissary/shared";

/**
 * The cast/enamelled medallion — single source of medallion art for the
 * medal-unlock ceremony, the profile chest, and the war ceremony.
 * Ottoman: crescent-and-star in a Kufic-tick frame on a red/gold ribbon.
 * Byzantine: double-eagle in an enamel-bead frame on a purple/gold ribbon.
 * Tiers: bronze / silver / gilt metals; locked renders as cold stone.
 */

const BRONZE_METAL = { light: "#c98d5a", dark: "#6e4526", ring: "#a06a3c" };
const TIER_METAL: Readonly<Record<number, { light: string; dark: string; ring: string }>> = {
  [MedalTier.Bronze]: BRONZE_METAL,
  [MedalTier.Silver]: { light: "#e2e6ea", dark: "#878e96", ring: "#c2c8cf" },
  [MedalTier.Gold]: { light: "#f8e3a4", dark: "#bd9040", ring: "#ecc970" },
};
const LOCKED_METAL = { light: "#565c56", dark: "#32362f", ring: "#4a4f4a" };

const OTTOMAN_RIBBON = { main: "#9e3229", edge: "#e7b45c" };
const RIBBON: Readonly<Record<number, { main: string; edge: string }>> = {
  [Team.Ottoman]: OTTOMAN_RIBBON,
  [Team.Byzantine]: { main: "#4e3286", edge: "#e7b45c" },
};

export function Medallion({ category, tier, faction, locked = false, size = 46 }: {
  category: MedalCategory;
  tier: MedalTier;
  faction: Team;
  locked?: boolean;
  size?: number;
}): React.JSX.Element {
  const uid = useId();
  const identity = medalIdentity(category, tier);
  const style = identity?.styles[faction] ?? identity?.styles[Team.Ottoman];
  const frameKind = style?.frame === "kufic" ? "kufic" : "enamel";
  const emblemKind = style?.emblem === "double-eagle" ? "eagle" : "crescent";
  const metal = locked ? LOCKED_METAL : TIER_METAL[tier] ?? BRONZE_METAL;
  const ribbon = RIBBON[faction] ?? OTTOMAN_RIBBON;
  const ringColor = locked ? LOCKED_METAL.ring : metal.ring;
  const emblemColor = locked ? "#6f756c" : frameKind === "kufic" ? "#f3e3c2" : "#f0e6d2";
  return (
    <svg className={`medallion ${locked ? "locked" : ""}`} width={size} height={size * 1.3125} viewBox="0 0 64 84" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-metal`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={metal.light} />
          <stop offset="100%" stopColor={metal.dark} />
        </radialGradient>
        <linearGradient id={`${uid}-ribbon`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={ribbon.edge} />
          <stop offset="18%" stopColor={ribbon.main} />
          <stop offset="82%" stopColor={ribbon.main} />
          <stop offset="100%" stopColor={ribbon.edge} />
        </linearGradient>
      </defs>
      {/* ribbon drape */}
      <path d="M22 2 L42 2 L46 34 L32 44 L18 34 Z" fill={`url(#${uid}-ribbon)`} opacity={locked ? 0.45 : 0.95} />
      <path d="M22 2 L42 2 L43 8 L21 8 Z" fill="rgba(0,0,0,0.25)" />
      {/* disc */}
      <circle cx="32" cy="52" r="24" fill={`url(#${uid}-metal)`} stroke={ringColor} strokeWidth="2.4" />
      <circle cx="32" cy="52" r="20.5" fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      {/* frame: Kufic ticks vs enamel beads */}
      {frameKind === "kufic" ? (
        <g stroke={ringColor} strokeWidth="2" strokeLinecap="square">
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index * Math.PI) / 6;
            const inner = 15.5;
            const outer = 18.5;
            return (
              <line
                key={index}
                x1={32 + inner * Math.cos(angle)}
                y1={52 + inner * Math.sin(angle)}
                x2={32 + outer * Math.cos(angle)}
                y2={52 + outer * Math.sin(angle)}
              />
            );
          })}
        </g>
      ) : (
        <g fill={ringColor}>
          {Array.from({ length: 10 }, (_, index) => {
            const angle = (index * Math.PI) / 5;
            return <circle key={index} cx={32 + 17 * Math.cos(angle)} cy={52 + 17 * Math.sin(angle)} r="1.6" />;
          })}
        </g>
      )}
      {/* emblem */}
      {locked ? (
        <g transform="translate(32 52)" fill="none" stroke="#7d847a" strokeWidth="2.4" strokeLinecap="round">
          <rect x="-6.5" y="-2" width="13" height="10" rx="1.5" fill="#6f756c" stroke="none" />
          <path d="M-4 -2 L-4 -5.5 A4 4 0 0 1 4 -5.5 L4 -2" />
        </g>
      ) : emblemKind === "crescent" ? (
        <g transform="translate(10.4 27.4) scale(1.16)" fill={emblemColor}>
          <path d="M27 9 A13 13 0 1 0 27 33 A10.5 10.5 0 1 1 27 9 Z" />
          <path d="M20 15 L22.2 20.2 L27.8 20.8 L23.4 24.6 L24.8 30 L20 27 L15.2 30 L16.6 24.6 L12.2 20.8 L17.8 20.2 Z" transform="translate(4.5 -1.5) scale(0.55)" />
        </g>
      ) : (
        <g transform="translate(8.2 26.8) scale(1.16)" fill={emblemColor}>
          <path d="M23 26 L27 20 L25 13 L23 16 L21 13 L19 20 Z" />
          <path d="M14 15 Q11 12 12 18 Q9 15 10 21 L14 22 Z" />
          <path d="M32 15 Q35 12 34 18 Q37 15 36 21 L32 22 Z" />
          <path d="M17 26 Q23 31 29 26 L27 33 L23 30 L19 33 Z" />
        </g>
      )}
    </svg>
  );
}
