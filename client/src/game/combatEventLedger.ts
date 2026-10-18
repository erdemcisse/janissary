/**
 * Snapshots retain recent combat events for packet-loss tolerance. Consume an
 * event id once even when it appears in several consecutive snapshots.
 */
export class CombatEventLedger {
  readonly #seen = new Set<number>();
  readonly #order: number[] = [];

  constructor(readonly capacity = 256) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Combat event ledger capacity must be positive");
  }

  accept(eventId: number): boolean {
    const id = eventId & 0xffff;
    if (this.#seen.has(id)) return false;
    this.#seen.add(id);
    this.#order.push(id);
    while (this.#order.length > this.capacity) {
      const oldest = this.#order.shift();
      if (oldest !== undefined) this.#seen.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.#seen.clear();
    this.#order.length = 0;
  }
}
