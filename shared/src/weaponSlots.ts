import { InputButton, WEAPON_SWITCH_TICKS } from "./constants";
import { DEFAULT_WEAPON_SLOT } from "./tuning";

/**
 * Weapon-slot state machine (Phase 8e-3). A single pure implementation shared
 * by the authoritative server, the client's fixed-step prediction, and the
 * parity tests — all three step the same code with the same button stream, so
 * a slot switch can never rubber-band by construction.
 *
 * Rules:
 *  - A rising edge on Slot1/2/3 (lowest slot wins on a same-tick tie) starts a
 *    WEAPON_SWITCH_TICKS draw timer toward that slot, unless it is already the
 *    active slot.
 *  - While the timer runs, further slot presses are ignored and the active
 *    slot is unchanged; Fire/Melee/Reload gating reads `ticksRemaining > 0`.
 *  - The active slot flips to the target when the timer reaches zero.
 *  - Holding a slot button does not retrigger (edge vs. previous buttons).
 */
export interface WeaponSlotState {
  activeSlot: number;
  targetSlot: number;
  ticksRemaining: number;
}

export function createWeaponSlotState(): WeaponSlotState {
  return { activeSlot: DEFAULT_WEAPON_SLOT, targetSlot: DEFAULT_WEAPON_SLOT, ticksRemaining: 0 };
}

/**
 * Advances the machine one tick, mutating `state` in place (no allocation;
 * the server drives it from typed-array scratch). Returns the newly targeted
 * slot when a switch started this tick, otherwise 0.
 */
export function stepWeaponSlots(state: WeaponSlotState, buttons: number, prevButtons: number): number {
  if (state.ticksRemaining > 0) {
    state.ticksRemaining -= 1;
    if (state.ticksRemaining === 0) state.activeSlot = state.targetSlot;
    return 0;
  }
  const pressed = buttons & ~prevButtons;
  let slot = 0;
  if ((pressed & InputButton.Slot1) !== 0) slot = 1;
  else if ((pressed & InputButton.Slot2) !== 0) slot = 2;
  else if ((pressed & InputButton.Slot3) !== 0) slot = 3;
  if (slot !== 0 && slot !== state.activeSlot) {
    state.targetSlot = slot;
    state.ticksRemaining = WEAPON_SWITCH_TICKS;
    return slot;
  }
  return 0;
}
