/**
 * Inline-SVG weapon/tool icon set for HUD chrome, in the spirit of the
 * KillFeed KillIcon glyphs: 15×15 viewBox, single currentColor, silhouette
 * first. Exported per-icon so a future kill-feed phase can reuse them.
 */

interface IconProps {
  readonly size?: number;
}

function iconProps(size: number): { viewBox: string; width: number; height: number; "aria-hidden": true } {
  return { viewBox: "0 0 15 15", width: size, height: size, "aria-hidden": true };
}

export function ArquebusIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="2" y1="13" x2="6.5" y2="8.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <line x1="5.5" y1="9.5" x2="13.5" y2="1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7.2 8.6 Q8.4 7.4 7.6 6.2" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function CrossbowIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="7.5" y1="3.5" x2="7.5" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2.5 4.5 Q7.5 8.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2.8" y1="4.7" x2="12.2" y2="4.7" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
    </svg>
  );
}

export function LanceIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="1.5" y1="13.5" x2="12.5" y2="2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.8 1.2 L11.3 2.3 L12.7 3.7 Z" fill="currentColor" />
      <path d="M10.6 4.4 L8.3 3.6 L10.1 2.4 Z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

export function SaberIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <path d="M3 12.5 Q9.5 9 12.8 2.2 Q8 6.8 4.4 11.2 Z" fill="currentColor" />
      <line x1="3.4" y1="10.2" x2="5.6" y2="12.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SwordIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <path d="M3 12 L10.5 4.5 L12.5 2.5 L11 4 L4.5 11.5 Z" fill="currentColor" />
      <line x1="4.2" y1="8.6" x2="6.4" y2="10.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2.6" y1="12.4" x2="4" y2="13.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DaggerIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <path d="M6 9.5 L11.8 3.7 L12.8 2.7 L12.2 4.2 L7.5 10.5 Z" fill="currentColor" />
      <line x1="6.2" y1="8.4" x2="8" y2="10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.4" y1="11.4" x2="6.6" y2="12.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function DrumIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <ellipse cx="7.5" cy="6" rx="4.2" ry="1.8" fill="currentColor" />
      <path d="M3.3 6 L3.3 11 C3.3 12 5.2 12.8 7.5 12.8 C9.8 12.8 11.7 12 11.7 11 L11.7 6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4.6" y1="1.6" x2="6.2" y2="4.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="10.4" y1="1.6" x2="8.8" y2="4.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function StandardIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="3.5" y1="1.5" x2="3.5" y2="13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="3.5" y1="2.8" x2="12" y2="2.8" stroke="currentColor" strokeWidth="1" />
      <path d="M4.5 3.4 L11.5 3.4 L11.5 8.2 L8 6.6 L4.5 8.2 Z" fill="currentColor" />
    </svg>
  );
}

export function TorchIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="7.5" y1="8" x2="7.5" y2="13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 1.2 Q10.2 4.8 7.5 7.6 Q4.8 4.8 7.5 1.2 Z" fill="currentColor" />
    </svg>
  );
}

export function ShovelUpIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="7.5" y1="3.5" x2="7.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 9.5 L9 9.5 L8.5 13.5 L6.5 13.5 Z" fill="currentColor" />
      <path d="M5.6 2.6 L7.5 1 L9.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShovelDownIcon({ size = 15 }: IconProps): React.JSX.Element {
  return (
    <svg {...iconProps(size)}>
      <line x1="7.5" y1="3.5" x2="7.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6 9.5 L9 9.5 L8.5 13.5 L6.5 13.5 Z" fill="currentColor" />
      <path d="M5.6 1.2 L7.5 2.8 L9.4 1.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
