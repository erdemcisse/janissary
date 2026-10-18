import { describe, expect, it } from "vitest";
import { PingSmoother } from "../src/net/pingSmoother";

/**
 * F3 Ping display smoothing (Phase 8e-4b, audit INFO-4): one main-thread
 * stall inflates a single sample; the rolling median must keep the display
 * honest without hiding real latency.
 */

describe("PingSmoother", () => {
  it("returns the raw value until the window fills", () => {
    const smoother = new PingSmoother(5);
    expect(smoother.push(2)).toBe(2);
    // Two samples: upper middle of [2,4].
    expect(smoother.push(4)).toBe(4);
  });

  it("returns the median of the filled window", () => {
    const smoother = new PingSmoother(5);
    for (const ping of [2, 40, 4, 3, 5]) smoother.push(ping);
    // Window [2,40,4,3,5] -> median 4.
    expect(smoother.push(2)).toBe(4);
    // The 2 slides out: window [40,4,3,5,2] -> median 4.
    expect(smoother.push(9)).toBe(4);
  });

  it("lets one outlier not dominate the display", () => {
    const smoother = new PingSmoother(5);
    for (const ping of [2, 2, 2, 2, 350]) smoother.push(ping);
    // Median of the 5-sample window: 2, not ~72.
    expect(smoother.push(2)).toBe(2);
  });

  it("slides the window so old outliers age out", () => {
    const smoother = new PingSmoother(3);
    smoother.push(350); // stale outlier
    smoother.push(2);
    smoother.push(2);
    expect(smoother.push(2)).toBe(2); // window now [2,2,2]
    expect(smoother.push(2)).toBe(2); // window now [2,2,2]
    expect(smoother.push(2)).toBe(2); // outlier fully aged out
  });

  it("reset clears the window", () => {
    const smoother = new PingSmoother(5);
    for (const ping of [2, 2, 2, 2, 350]) smoother.push(ping);
    smoother.reset();
    expect(smoother.push(300)).toBe(300);
  });
});
