import { describe, expect, it } from "vitest";
import { CombatEventLedger } from "../src/game/combatEventLedger";

describe("CombatEventLedger", () => {
  it("plays a retained snapshot event exactly once", () => {
    const ledger = new CombatEventLedger();
    expect(ledger.accept(42)).toBe(true);
    expect(ledger.accept(42)).toBe(false);
    expect(ledger.accept(42)).toBe(false);
  });

  it("keeps accepting new events across the uint16 wrap", () => {
    const ledger = new CombatEventLedger(2);
    expect(ledger.accept(65_535)).toBe(true);
    expect(ledger.accept(0)).toBe(true);
    expect(ledger.accept(1)).toBe(true);
    expect(ledger.accept(65_535)).toBe(true);
  });

  it("can be cleared for a fresh connection", () => {
    const ledger = new CombatEventLedger();
    expect(ledger.accept(7)).toBe(true);
    expect(ledger.accept(7)).toBe(false);
    ledger.clear();
    expect(ledger.accept(7)).toBe(true);
  });
});
