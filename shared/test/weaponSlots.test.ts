import { describe, expect, it } from "vitest";
import { InputButton, WEAPON_SWITCH_TICKS, createWeaponSlotState, stepWeaponSlots } from "../src/index";

/**
 * Weapon-slot state machine rules (Phase 8e-3). The same pure implementation
 * is stepped by the authoritative server and the client's fixed-step
 * prediction; the server-side parity test lives in server/test/weaponSlots.
 */
describe("weapon slot machine", () => {
  it("starts a draw timer on a rising slot edge and flips when it elapses", () => {
    const state = createWeaponSlotState();
    expect(state.activeSlot).toBe(2);
    expect(stepWeaponSlots(state, InputButton.Slot1, 0)).toBe(1);
    expect(state.targetSlot).toBe(1);
    expect(state.ticksRemaining).toBe(WEAPON_SWITCH_TICKS);
    expect(state.activeSlot).toBe(2);
    for (let index = 0; index < WEAPON_SWITCH_TICKS - 1; index += 1) {
      expect(stepWeaponSlots(state, 0, InputButton.Slot1)).toBe(0);
      expect(state.activeSlot).toBe(2);
    }
    expect(stepWeaponSlots(state, 0, InputButton.Slot1)).toBe(0);
    expect(state.activeSlot).toBe(1);
    expect(state.ticksRemaining).toBe(0);
  });

  it("ignores further slot presses while a draw is in flight", () => {
    const state = createWeaponSlotState();
    stepWeaponSlots(state, InputButton.Slot1, 0);
    expect(stepWeaponSlots(state, InputButton.Slot3, InputButton.Slot1)).toBe(0);
    expect(state.targetSlot).toBe(1);
    expect(state.ticksRemaining).toBe(WEAPON_SWITCH_TICKS - 1);
  });

  it("does not retrigger while a slot button is held", () => {
    const state = createWeaponSlotState();
    stepWeaponSlots(state, InputButton.Slot3, 0);
    let previous = InputButton.Slot3;
    for (let index = 0; index < WEAPON_SWITCH_TICKS; index += 1) {
      expect(stepWeaponSlots(state, InputButton.Slot3, previous)).toBe(0);
      previous = InputButton.Slot3;
    }
    expect(state.activeSlot).toBe(3);
    expect(state.ticksRemaining).toBe(0);
    // Still held: no new switch starts once the timer has elapsed.
    expect(stepWeaponSlots(state, InputButton.Slot3, previous)).toBe(0);
    expect(state.ticksRemaining).toBe(0);
  });

  it("resolves a same-tick tie to the lowest slot", () => {
    const state = createWeaponSlotState();
    expect(stepWeaponSlots(state, InputButton.Slot1 | InputButton.Slot3, 0)).toBe(1);
    expect(state.targetSlot).toBe(1);
  });

  it("treats pressing the active slot as a no-op", () => {
    const state = createWeaponSlotState();
    expect(stepWeaponSlots(state, InputButton.Slot2, 0)).toBe(0);
    expect(state.activeSlot).toBe(2);
    expect(state.ticksRemaining).toBe(0);
  });
});
