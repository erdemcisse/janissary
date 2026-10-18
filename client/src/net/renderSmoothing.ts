import type { MovementState } from "@janissary/shared";
import { InputButton } from "@janissary/shared";

/**
 * Render-extrapolation input freeze (Phase 8e-6). The display path previews
 * the current tick by re-simulating it with dt = accumulator, which
 * converges exactly at each fixed step — EXCEPT for rising edges: a Jump
 * press arriving mid-tick fired the full impulse in the preview, lifting the
 * camera up to ~0.3 m before the fixed state took off (and snapping back
 * when a short tap never reached a fixed step at all). Only a jump already
 * latched by the fixed step may read as held here; a fresh press waits for
 * the next fixed step — the same ≤50 ms the authoritative server takes.
 */
export function freezeJumpEdgeForExtrapolation(buttons: number, latchedJumpHeld: boolean): number {
  return latchedJumpHeld ? buttons | InputButton.Jump : buttons & ~InputButton.Jump;
}

/**
 * Residual prediction errors are corrected in simulation immediately, then
 * hidden from the camera with a short-lived render-only offset. The offset is
 * deliberately not fed back into movement, so authoritative replay remains
 * deterministic.
 */
export class PredictionCorrectionSmoother {
  #offsetX = 0;
  #offsetY = 0;
  #offsetZ = 0;

  constructor(
    readonly decayRate = 12,
    readonly maximumSmoothedDistance = 0.75,
    readonly teleportDistance = 2.5,
  ) {}

  get offsetX(): number { return this.#offsetX; }
  get offsetY(): number { return this.#offsetY; }
  get offsetZ(): number { return this.#offsetZ; }

  /** Preserve the old rendered position across a normal reconciliation. */
  preserveBeforeCorrection(before: Readonly<MovementState>, after: Readonly<MovementState>): void {
    const deltaX = before.x - after.x;
    const deltaY = before.y - after.y;
    const deltaZ = before.z - after.z;
    const correctionDistance = Math.hypot(deltaX, deltaY, deltaZ);
    if (correctionDistance >= this.teleportDistance) {
      this.reset();
      return;
    }
    this.#offsetX += deltaX;
    this.#offsetY += deltaY;
    this.#offsetZ += deltaZ;
    const total = Math.hypot(this.#offsetX, this.#offsetY, this.#offsetZ);
    if (total > this.maximumSmoothedDistance) {
      const scale = this.maximumSmoothedDistance / total;
      this.#offsetX *= scale;
      this.#offsetY *= scale;
      this.#offsetZ *= scale;
    }
  }

  /** Frame-rate-independent exponential decay; call after drawing the frame. */
  advance(dtSeconds: number): void {
    const decay = Math.exp(-this.decayRate * Math.max(0, dtSeconds));
    this.#offsetX *= decay;
    this.#offsetY *= decay;
    this.#offsetZ *= decay;
    if (Math.abs(this.#offsetX) < 0.0001) this.#offsetX = 0;
    if (Math.abs(this.#offsetY) < 0.0001) this.#offsetY = 0;
    if (Math.abs(this.#offsetZ) < 0.0001) this.#offsetZ = 0;
  }

  reset(): void {
    this.#offsetX = 0;
    this.#offsetY = 0;
    this.#offsetZ = 0;
  }
}

/** Shared by the live renderer and the deterministic cadence regression. */
export function interpolationAlpha(renderTime: number, fromTime: number, toTime: number): number {
  const duration = Math.max(1, toTime - fromTime);
  return Math.max(0, Math.min(1, (renderTime - fromTime) / duration));
}
