import { CLASS_TUNING, PlayerClass, WEAPON_DEFS, WeaponType, loadoutForClass } from "@janissary/shared";
import {
  ArquebusIcon,
  CrossbowIcon,
  DaggerIcon,
  DrumIcon,
  LanceIcon,
  SaberIcon,
  ShovelDownIcon,
  ShovelUpIcon,
  StandardIcon,
  SwordIcon,
  TorchIcon,
} from "./weaponIcons";
import { MOUNT_ICON, classIcon } from "./classIcons";

/**
 * Loadout strip — glanceable "what am I carrying" status, not an RPG
 * inventory. The three weapon slots (Phase 8e-3) mirror the shared LOADOUTS
 * table: slot 1 is the faction blade, slot 2 the ranged primary, slot 3 the
 * dagger. The active slot is highlighted; while a draw/holster is in flight
 * the incoming slot pulses. A ranged slot carries a loaded/empty pip so the
 * pan state is visible without looking at the reticle. Mounted cavalry
 * fights with the lance, and support classes show their instrument on slot 2
 * (their firearm is inert — the aura is their weapon), matching the
 * first-person viewmodel. Torch and earthwork slots are always present and
 * show their hotkeys; the torch glows while lit.
 */

interface Slot {
  readonly id: string;
  readonly label: string;
  readonly icon: React.JSX.Element;
  readonly hotkey?: string;
  readonly equipped?: boolean;
  readonly active?: boolean;
  readonly drawing?: boolean;
  /** Ranged slots only: pan state (true = loaded, false = empty). */
  readonly loadedPip?: boolean | undefined;
}

function weaponIcon(type: WeaponType): React.JSX.Element {
  switch (type) {
    case WeaponType.Arquebus: return <ArquebusIcon />;
    case WeaponType.Crossbow: return <CrossbowIcon />;
    case WeaponType.Sword:
    case WeaponType.Hanger: return <SwordIcon />;
    case WeaponType.Kilij:
    case WeaponType.Saber: return <SaberIcon />;
    case WeaponType.Dagger: return <DaggerIcon />;
    default: return <SwordIcon />;
  }
}

export function LoadoutHud({ playerClass, queuedClass, mounted, torchOn, activeSlot, switching, switchTarget, loaded }: {
  playerClass: PlayerClass;
  /** 8e-13: class queued for the next spawn — a "Next: X" chip shows when it differs. */
  queuedClass?: PlayerClass;
  mounted: boolean;
  torchOn: boolean;
  /** Active 1-based weapon slot (server-authoritative, predicted). */
  activeSlot: number;
  /** Draw/holster in progress. */
  switching: boolean;
  /** Slot being drawn while `switching`, else 0. */
  switchTarget: number;
  /** Ranged pan state for the slot-2 pip. */
  loaded: boolean;
}): React.JSX.Element {
  const tuning = CLASS_TUNING[playerClass];
  const support = tuning.support === true;
  const lance = mounted && tuning.cavalry === true;
  const loadout = loadoutForClass(playerClass);

  const weaponSlots: readonly Slot[] = loadout.map((type, index) => {
    const slotNumber = index + 1;
    const def = WEAPON_DEFS[type];
    let label = def.name;
    let icon = weaponIcon(type);
    if (lance && slotNumber === 1) {
      label = "Lance";
      icon = <LanceIcon />;
    } else if (support && slotNumber === 2) {
      label = playerClass === PlayerClass.Mehter ? "War drum" : "Standard";
      icon = playerClass === PlayerClass.Mehter ? <DrumIcon /> : <StandardIcon />;
    }
    return {
      id: `w${slotNumber}`,
      label,
      icon,
      hotkey: `${slotNumber}`,
      active: slotNumber === activeSlot,
      drawing: switching && slotNumber === switchTarget,
      loadedPip: !support && def.kind === "ranged" ? loaded : undefined,
    };
  });

  const slots: readonly Slot[] = [
    ...weaponSlots,
    { id: "torch", label: "Torch", icon: <TorchIcon />, hotkey: "G", equipped: true, active: torchOn },
    { id: "raise", label: "Raise earthwork", icon: <ShovelUpIcon />, hotkey: "B" },
    { id: "dig", label: "Dig earthwork", icon: <ShovelDownIcon />, hotkey: "N" },
  ];

  const queuedIcon = queuedClass !== undefined && queuedClass !== playerClass ? classIcon(queuedClass) : undefined;

  return (
    <div className="loadout hud-panel" aria-label="Loadout">
      {slots.map((slot) => (
        <span
          key={slot.id}
          className={`slot${slot.equipped === true ? " equipped" : ""}${slot.active === true ? " active" : ""}${slot.drawing === true ? " drawing" : ""}`}
          title={slot.hotkey !== undefined ? `${slot.label} — ${slot.hotkey}` : slot.label}
        >
          {slot.icon}
          {slot.hotkey !== undefined && <kbd>{slot.hotkey}</kbd>}
          {slot.loadedPip !== undefined && (
            <i className={`pip${slot.loadedPip ? " pip-loaded" : " pip-empty"}`} aria-hidden="true" />
          )}
        </span>
      ))}
      {mounted && (
        <span className="mounted-chip" title="Mounted — fighting from horseback">
          <img className="chip-icon" src={MOUNT_ICON.src} alt="" width={15} height={20} />
          MOUNTED
        </span>
      )}
      {queuedClass !== undefined && queuedClass !== PlayerClass.None && queuedClass !== playerClass && (
        <span className="queued-class" title="Class queued for your next life">
          {queuedIcon !== undefined && <img className="chip-icon" src={queuedIcon.src} alt="" width={15} height={20} />}
          Next: {CLASS_TUNING[queuedClass].title}
        </span>
      )}
    </div>
  );
}
