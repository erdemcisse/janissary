export interface RewindPosition {
  x: number;
  y: number;
  z: number;
}

export interface PositionFrame {
  tick: number;
  readonly positions: ReadonlyMap<number, RewindPosition>;
}

export function clampRewindTick(currentTick: number, requestedTick: number, maximumHistoryTicks: number): number {
  return Math.max(currentTick - maximumHistoryTicks, Math.min(currentTick, requestedTick));
}

export function rewoundPosition(
  frames: readonly PositionFrame[],
  entityId: number,
  requestedTick: number,
  currentTick: number,
  maximumHistoryTicks: number,
): RewindPosition | undefined {
  const targetTick = clampRewindTick(currentTick, requestedTick, maximumHistoryTicks);
  let selected: PositionFrame | undefined;
  for (const frame of frames) if (frame.tick <= targetTick && (selected === undefined || frame.tick > selected.tick)) selected = frame;
  return selected?.positions.get(entityId);
}

export function rayHitsSphere(
  origin: Readonly<RewindPosition>,
  direction: Readonly<RewindPosition>,
  center: Readonly<RewindPosition>,
  radius: number,
): number | undefined {
  const toX = center.x - origin.x; const toY = center.y - origin.y; const toZ = center.z - origin.z;
  const projection = toX * direction.x + toY * direction.y + toZ * direction.z;
  if (projection < 0) return undefined;
  const perpendicular = toX * toX + toY * toY + toZ * toZ - projection * projection;
  return perpendicular > radius * radius ? undefined : projection - Math.sqrt(radius * radius - perpendicular);
}
