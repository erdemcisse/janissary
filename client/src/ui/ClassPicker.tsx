import { useEffect } from "react";
import { CLASS_TUNING, PlayerClass, Team, WEAPON_DEFS, loadoutForClass } from "@janissary/shared";
import { classIcon } from "./classIcons";

/**
 * Phase 8e-13 class picker, shared by the death screen and the ESC menu's
 * Class tab. Picks always queue for a spawn (the server's desiredClass);
 * while alive that means the NEXT life — the live loadout never swaps
 * mid-life. Cross-faction classes render disabled: the server would reject
 * them (classMatchesTeam), so the card says so instead of failing silently.
 *
 * Digits 1–8 pick in card order while `inputEnabled`. That order matches the
 * pre-8e-13 ClassSelect exactly, so existing muscle memory holds.
 */

export const SELECTABLE_CLASSES: readonly PlayerClass[] = [
  PlayerClass.Janissary, PlayerClass.Sipahi, PlayerClass.Topcu, PlayerClass.Mehter,
  PlayerClass.Guardsman, PlayerClass.Knight, PlayerClass.WallGunner, PlayerClass.Priest,
];

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

function roleLine(playerClass: PlayerClass): string {
  const tuning = CLASS_TUNING[playerClass];
  if (tuning.cavalry) return "Mounted cavalry";
  if (tuning.artillery) return "Artillery crew";
  if (playerClass === PlayerClass.Mehter) return "War-drum aura";
  if (playerClass === PlayerClass.Priest) return "Standard-bearer aura";
  return "Line infantry";
}

function weaponsLine(playerClass: PlayerClass): string {
  return loadoutForClass(playerClass).map((type) => WEAPON_DEFS[type].name).join(" · ");
}

/** Role caps enforced by the server (world.ts): cavalry ≤ 20% of team, artillery ≤ 15%. */
function capNoteFor(playerClass: PlayerClass): string | undefined {
  const tuning = CLASS_TUNING[playerClass];
  if (tuning.cavalry) return "cap 20%";
  if (tuning.artillery) return "cap 15%";
  return undefined;
}

export function ClassPicker({ team, queuedClass, classStatus, inputEnabled, onSelect, hint }: {
  readonly team: Team;
  /** The class the server has queued for the next spawn (== live class when nothing queued). */
  readonly queuedClass: PlayerClass;
  readonly classStatus: string;
  readonly inputEnabled: boolean;
  readonly onSelect: (playerClass: PlayerClass) => void;
  /** Context line under the grid ("applies to this deploy" / "applies to your next life"). */
  readonly hint: string;
}): React.JSX.Element {
  useEffect(() => {
    if (!inputEnabled) return;
    const onKey = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const digit = event.code.startsWith("Digit") ? Number(event.code.slice(5)) : event.code.startsWith("Numpad") ? Number(event.code.slice(6)) : 0;
      const playerClass = digit >= 1 && digit <= SELECTABLE_CLASSES.length ? SELECTABLE_CLASSES[digit - 1] : undefined;
      if (playerClass === undefined) return;
      event.preventDefault();
      if (CLASS_TUNING[playerClass].team !== team) return;
      onSelect(playerClass);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const queueFull = classStatus.includes("full");
  return (
    <div className="class-picker">
      <div className="class-grid" role="radiogroup" aria-label="Class">
        {SELECTABLE_CLASSES.map((playerClass, index) => {
          const tuning = CLASS_TUNING[playerClass];
          const foreign = tuning.team !== team;
          const cap = capNoteFor(playerClass);
          const selected = queuedClass === playerClass;
          const icon = classIcon(playerClass);
          return (
            <button
              key={playerClass}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`class-card${selected ? " selected" : ""}${foreign ? " foreign" : ""}`}
              disabled={foreign}
              onClick={() => onSelect(playerClass)}
            >
              <span className="class-card-head">
                {icon !== undefined && <img className="class-icon" src={icon.src} alt="" width={26} height={35} />}
                <kbd>{index + 1}</kbd>
                <strong>{tuning.title}</strong>
                {cap !== undefined && <span className="cap">{cap}</span>}
              </span>
              <span className="class-card-role">{foreign ? "Other faction" : roleLine(playerClass)}</span>
              <span className="class-card-weapons">{weaponsLine(playerClass)}</span>
            </button>
          );
        })}
      </div>
      {queueFull && <small className="warn">{classStatus} — cavalry and artillery are capped per team; pick another class or wait.</small>}
      {classStatus !== "" && !queueFull && <small>{classStatus}</small>}
      <small className="class-picker-hint">{hint} Cavalry ≤ 20% of team · artillery ≤ 15%.</small>
    </div>
  );
}
