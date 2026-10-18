export const NAMEPLATE_MAX_LABELS = 12;
export const NAMEPLATE_MIN_SCREEN_GAP_PX = 38;
export const NAMEPLATE_FADE_START_METERS = 18;
export const NAMEPLATE_FADE_END_METERS = 60;

/** Distance fade used by the canvas pass; zero at the render cutoff. */
export function nameplateOpacity(distanceMeters: number): number {
  if (distanceMeters <= NAMEPLATE_FADE_START_METERS) return 1;
  if (distanceMeters >= NAMEPLATE_FADE_END_METERS) return 0;
  const linear = (NAMEPLATE_FADE_END_METERS - distanceMeters)
    / (NAMEPLATE_FADE_END_METERS - NAMEPLATE_FADE_START_METERS);
  // Smoothstep removes the visible fade knee at 18 m without extra state.
  return linear * linear * (3 - 2 * linear);
}

/**
 * Fixed-capacity nearest-label collector and screen-space suppressor. All
 * storage is allocated once; reset/consider/accept allocate nothing per frame.
 */
export class NameplateLayout {
  readonly entityIds: Uint32Array;
  readonly distanceSquared: Float32Array;
  readonly screenX: Float32Array;
  readonly screenY: Float32Array;
  readonly #acceptedX: Float32Array;
  readonly #acceptedY: Float32Array;
  #count = 0;
  #acceptedCount = 0;

  constructor(readonly capacity = NAMEPLATE_MAX_LABELS, readonly minimumGapPx = NAMEPLATE_MIN_SCREEN_GAP_PX) {
    this.entityIds = new Uint32Array(capacity);
    this.distanceSquared = new Float32Array(capacity);
    this.screenX = new Float32Array(capacity);
    this.screenY = new Float32Array(capacity);
    this.#acceptedX = new Float32Array(capacity);
    this.#acceptedY = new Float32Array(capacity);
  }

  get count(): number { return this.#count; }

  reset(): void {
    this.#count = 0;
    this.#acceptedCount = 0;
  }

  /** Keep only the nearest `capacity` candidates, in nearest-first order. */
  consider(entityId: number, distanceSquared: number, screenX: number, screenY: number): void {
    let insertion = this.#count;
    while (insertion > 0 && distanceSquared < (this.distanceSquared[insertion - 1] ?? Infinity)) insertion -= 1;
    if (insertion >= this.capacity) return;
    const newCount = Math.min(this.capacity, this.#count + 1);
    for (let index = newCount - 1; index > insertion; index -= 1) {
      this.entityIds[index] = this.entityIds[index - 1] ?? 0;
      this.distanceSquared[index] = this.distanceSquared[index - 1] ?? 0;
      this.screenX[index] = this.screenX[index - 1] ?? 0;
      this.screenY[index] = this.screenY[index - 1] ?? 0;
    }
    this.entityIds[insertion] = entityId;
    this.distanceSquared[insertion] = distanceSquared;
    this.screenX[insertion] = screenX;
    this.screenY[insertion] = screenY;
    this.#count = newCount;
  }

  /** Nearest labels win; later labels inside the screen-space gap are hidden. */
  accept(index: number): boolean {
    if (index < 0 || index >= this.#count) return false;
    const x = this.screenX[index] ?? 0;
    const y = this.screenY[index] ?? 0;
    const gapSquared = this.minimumGapPx * this.minimumGapPx;
    for (let accepted = 0; accepted < this.#acceptedCount; accepted += 1) {
      const dx = x - (this.#acceptedX[accepted] ?? 0);
      const dy = y - (this.#acceptedY[accepted] ?? 0);
      if (dx * dx + dy * dy < gapSquared) return false;
    }
    this.#acceptedX[this.#acceptedCount] = x;
    this.#acceptedY[this.#acceptedCount] = y;
    this.#acceptedCount += 1;
    return true;
  }
}
