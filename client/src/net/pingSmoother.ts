/**
 * Rolling-median ping display (Phase 8e-4b, audit INFO-4). The F3 Ping is a
 * single main-thread-inclusive sample: one stall (e.g. the join-time snapshot
 * burst) inflates one reading for one second. The median of the last N samples
 * keeps the display honest without hiding real latency trends.
 */
export class PingSmoother {
  readonly #samples: number[] = [];

  constructor(readonly windowSize = 5) {}

  push(ms: number): number {
    this.#samples.push(ms);
    if (this.#samples.length > this.windowSize) this.#samples.shift();
    const sorted = [...this.#samples].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)] ?? ms;
  }

  reset(): void {
    this.#samples.length = 0;
  }
}
