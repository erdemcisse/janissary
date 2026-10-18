import { POSITION_SCALE, distance3, simulateMovement, type MovementState } from "@janissary/shared";

export interface PendingInput {
  seq: number;
  buttons: number;
  yaw: number;
  pitch: number;
  dtSeconds: number;
}

export interface ReconciliationResult {
  state: MovementState;
  pending: PendingInput[];
  errorDistance: number;
  corrected: boolean;
}

export type PredictionSimulator = (
  state: Readonly<MovementState>,
  input: Readonly<PendingInput>,
  dtSeconds: number,
) => MovementState;

interface Position3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Wire positions are quantized to 1/POSITION_SCALE meters (decimeters at the
 * current scale of 10), so any authoritative position is at most half a cell
 * from the server's true value per axis — a 3D radius of sqrt(3)/2 cells
 * (≈8.66 cm). An acknowledged prediction inside this radius carries NO
 * information: rewinding to the quantized base and replaying would only
 * inject wire noise (plus the velocity-inference noise that comes with it)
 * into the local mirror. That was the Phase 8e-6 walking/jumping "glitch":
 * at 10 snapshots/s every reconcile fired a 2 cm-threshold correction on
 * 3–9 cm of pure quantization error, and airborne reconciles added the
 * inferred-velocityY error (Δy/Δt over the 100 ms gap, biased g·Δt/2)
 * amplified through the pending-input replay.
 */
export const POSITION_NOISE_FLOOR_METERS = Math.hypot(0.5 / POSITION_SCALE, 0.5 / POSITION_SCALE, 0.5 / POSITION_SCALE);

/** True when the predicted state at the acknowledged input matches the
 * authoritative snapshot within the wire quantization cell — the client
 * keeps its exact prediction instead of adopting the quantized rewind.
 * The 1e-9 slack makes the cell boundary inclusive against float rounding
 * (e.g. (0.9 + 0.05) − 0.9 ≠ 0.05) while staying seven orders of magnitude
 * below the floor itself. */
export function withinQuantizationNoise(
  predicted: Readonly<Position3>,
  authoritative: Readonly<Position3>,
  floor = POSITION_NOISE_FLOOR_METERS,
): boolean {
  return distance3(predicted, authoritative) <= floor + 1e-9;
}

/** Replays pending inputs from an authoritative base, returning each per-seq
 * intermediate so the caller can re-seed its prediction history after a
 * rewind (history entries from the pre-rewind lineage are stale). */
export function replayPendingBySeq(
  authoritative: Readonly<MovementState>,
  pending: readonly PendingInput[],
  simulator: PredictionSimulator = simulateMovement,
): [number, MovementState][] {
  const replayed: [number, MovementState][] = [];
  let state: MovementState = { ...authoritative };
  for (const input of pending) {
    state = simulator(state, input, input.dtSeconds);
    replayed.push([input.seq, state]);
  }
  return replayed;
}


/** Reject velocity inference across respawns, round resets, and teleports. */
export function isAuthoritativeDiscontinuity(
  previous: Readonly<Position3>,
  current: Readonly<Position3>,
  elapsedSeconds: number,
  maximumExpectedSpeed: number,
): boolean {
  if (elapsedSeconds <= 0) return true;
  const displacement = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
  // Quantized snapshots need a small fixed allowance; the speed envelope then
  // scales for packet gaps without misclassifying legitimate cavalry travel.
  return displacement > maximumExpectedSpeed * elapsedSeconds * 1.5 + 0.75;
}

export function reconcilePrediction(
  predicted: Readonly<MovementState>,
  authoritative: Readonly<MovementState>,
  acknowledgedInputSeq: number,
  pendingInputs: readonly PendingInput[],
  correctionThreshold = 0.02,
  simulator: PredictionSimulator = simulateMovement,
): ReconciliationResult {
  const pending = pendingInputs.filter((input) => input.seq > acknowledgedInputSeq);
  let replayed: MovementState = { ...authoritative };
  for (const input of pending) replayed = simulator(replayed, input, input.dtSeconds);
  const errorDistance = distance3(predicted, replayed);
  return {
    state: replayed,
    pending,
    errorDistance,
    corrected: errorDistance > correctionThreshold,
  };
}
