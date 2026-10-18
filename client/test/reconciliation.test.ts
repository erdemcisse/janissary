import { describe, expect, it } from "vitest";
import { FIXED_DT_SECONDS, GROUND_CENTER_Y, InputButton, POSITION_SCALE, simulateMovement, type MovementState } from "@janissary/shared";
import {
  isAuthoritativeDiscontinuity,
  POSITION_NOISE_FLOOR_METERS,
  reconcilePrediction,
  replayPendingBySeq,
  withinQuantizationNoise,
  type PendingInput,
} from "../src/net/reconciliation";

const initial: MovementState = {
  x: 0,
  y: GROUND_CENTER_Y,
  z: 0,
  velocityX: 0,
  velocityY: 0,
  velocityZ: 0,
  yaw: 0,
  pitch: 0,
  grounded: true,
  jumpHeld: false,
};

describe("client reconciliation", () => {
  it("drops acknowledged inputs and replays only the remaining commands", () => {
    const inputs: PendingInput[] = [1, 2, 3].map((seq) => ({
      seq,
      buttons: InputButton.Forward,
      yaw: 0,
      pitch: 0,
      dtSeconds: FIXED_DT_SECONDS,
    }));
    let predicted = initial;
    for (const input of inputs) predicted = simulateMovement(predicted, input, input.dtSeconds);
    const authoritative = simulateMovement(initial, inputs[0]!, FIXED_DT_SECONDS);
    const result = reconcilePrediction(predicted, authoritative, 1, inputs);
    expect(result.pending.map((input) => input.seq)).toEqual([2, 3]);
    expect(result.state.z).toBeCloseTo(predicted.z, 5);
    expect(result.corrected).toBe(false);
  });

  it("corrects a divergent prediction and preserves unacknowledged movement", () => {
    const pending: PendingInput[] = [{
      seq: 8,
      buttons: InputButton.Right,
      yaw: 0,
      pitch: 0,
      dtSeconds: FIXED_DT_SECONDS,
    }];
    const predicted = { ...initial, x: 10 };
    const result = reconcilePrediction(predicted, initial, 7, pending);
    expect(result.corrected).toBe(true);
    expect(result.state.x).toBeGreaterThan(0);
    expect(result.state.x).toBeLessThan(1);
  });

  it("uses the collision-aware simulator for every replayed input", () => {
    const pending: PendingInput[] = [8, 9].map((seq) => ({
      seq,
      buttons: InputButton.Forward,
      yaw: 0,
      pitch: 0,
      dtSeconds: FIXED_DT_SECONDS,
    }));
    let calls = 0;
    const result = reconcilePrediction(initial, initial, 7, pending, 0.02, (state, input, dtSeconds) => {
      calls += 1;
      const moved = simulateMovement(state, input, dtSeconds);
      return { ...moved, z: Math.max(-0.05, moved.z) };
    });
    expect(calls).toBe(2);
    expect(result.state.z).toBe(-0.05);
  });

  it("does not turn a respawn teleport into extreme replay velocity", () => {
    const respawn = { ...initial, x: 240, z: 300, velocityX: 0, velocityZ: 0 };
    expect(isAuthoritativeDiscontinuity(initial, respawn, 0.1, 12)).toBe(true);
    const pending: PendingInput[] = [{
      seq: 22,
      buttons: InputButton.Forward,
      yaw: 0,
      pitch: 0,
      dtSeconds: FIXED_DT_SECONDS,
    }];
    const result = reconcilePrediction(initial, respawn, 21, pending);
    expect(Math.hypot(result.state.velocityX, result.state.velocityZ)).toBeLessThanOrEqual(1.5);
    expect(result.state.x).toBeCloseTo(240, 6);
    expect(result.state.z).toBeGreaterThan(299.9);
  });
});

describe("quantization-noise floor (Phase 8e-6)", () => {
  const quantize = (state: MovementState): MovementState => ({
    ...state,
    x: Math.round(state.x * POSITION_SCALE) / POSITION_SCALE,
    y: Math.round(state.y * POSITION_SCALE) / POSITION_SCALE,
    z: Math.round(state.z * POSITION_SCALE) / POSITION_SCALE,
  });

  it("bounds the wire quantization cell: half-cell per axis, sqrt(3)/2 cells in 3D", () => {
    const halfCell = 1 / (2 * POSITION_SCALE);
    expect(POSITION_NOISE_FLOOR_METERS).toBeCloseTo(Math.sqrt(3) * halfCell, 10);
    // Every corner of the quantization cell is inside the floor...
    for (const dx of [-halfCell, halfCell]) {
      for (const dy of [-halfCell, halfCell]) {
        for (const dz of [-halfCell, halfCell]) {
          expect(withinQuantizationNoise({ x: dx, y: initial.y + dy, z: dz }, initial)).toBe(true);
        }
      }
    }
    // ...and anything meaningfully outside it is a real divergence.
    expect(withinQuantizationNoise({ x: 0.3, y: initial.y, z: 0 }, initial)).toBe(false);
    expect(withinQuantizationNoise({ x: halfCell + 0.02, y: initial.y + halfCell + 0.02, z: halfCell + 0.02 }, initial)).toBe(false);
  });

  it("holds the parity bound through a walk+turn+jump sequence: zero corrections, error within the floor", () => {
    // The same input sequence through the server-style tick loop (positions
    // quantized onto the wire grid at 10 Hz) and the client prediction: the
    // acknowledged prediction must agree with the snapshot within the floor
    // at EVERY snapshot — that is the asserted divergence bound.
    const script: { ticks: number; buttons: number; yaw: number }[] = [
      { ticks: 40, buttons: InputButton.Forward, yaw: 0 },
      { ticks: 20, buttons: InputButton.Forward | InputButton.Right, yaw: -0.7 },
      { ticks: 5, buttons: InputButton.Forward | InputButton.Jump, yaw: -0.7 },
      { ticks: 25, buttons: InputButton.Forward, yaw: -0.7 }, // airborne arc
      { ticks: 40, buttons: InputButton.Forward | InputButton.Left, yaw: 0.9 },
      { ticks: 20, buttons: 0, yaw: 0.9 }, // decelerate to a stop
    ];
    const RTT_TICKS = 3;
    let server = initial;
    let client = initial;
    const serverBySeq = new Map<number, MovementState>([[0, server]]);
    const predictedBySeq = new Map<number, MovementState>([[0, client]]);
    let seq = 0;
    let corrections = 0;
    let snapshots = 0;
    for (const phase of script) {
      for (let tick = 0; tick < phase.ticks; tick += 1) {
        seq += 1;
        const input: PendingInput = { seq, buttons: phase.buttons, yaw: phase.yaw, pitch: 0, dtSeconds: FIXED_DT_SECONDS };
        server = simulateMovement(server, input, FIXED_DT_SECONDS);
        client = simulateMovement(client, input, FIXED_DT_SECONDS);
        serverBySeq.set(seq, server);
        predictedBySeq.set(seq, client);
        if (seq % 2 === 0 && seq > RTT_TICKS) {
          // 10 Hz snapshot acking the input the server had RTT_TICKS ago.
          const ackSeq = seq - RTT_TICKS;
          const authoritative = quantize(serverBySeq.get(ackSeq)!);
          const ackedPrediction = predictedBySeq.get(ackSeq)!;
          snapshots += 1;
          const error = Math.hypot(ackedPrediction.x - authoritative.x, ackedPrediction.y - authoritative.y, ackedPrediction.z - authoritative.z);
          expect(error).toBeLessThanOrEqual(POSITION_NOISE_FLOOR_METERS);
          if (!withinQuantizationNoise(ackedPrediction, authoritative)) corrections += 1;
          for (const stale of predictedBySeq.keys()) if (stale <= ackSeq) predictedBySeq.delete(stale);
        }
      }
    }
    expect(snapshots).toBeGreaterThan(60);
    expect(corrections).toBe(0);
    // Client and server never diverge at all on flat ground — the bound is
    // the wire cell, not the sim.
    expect(client.x).toBeCloseTo(server.x, 12);
    expect(client.y).toBeCloseTo(server.y, 12);
    expect(client.z).toBeCloseTo(server.z, 12);
  });

  it("documents the pre-fix airborne error: inferred-velocity replay overshoots the 2 cm threshold", () => {
    // The mechanism this phase removed: a snapshot landing mid-arc had its
    // velocityY inferred from quantized deltas over the 100 ms gap (biased
    // g·Δt/2 and noisy ±1 m/s), then replayed through the pending inputs —
    // measured 15–20 cm errors and a correction on every airborne snapshot.
    let server = { ...initial, grounded: false, velocityY: 3.4, y: GROUND_CENTER_Y + 1.1 };
    const before = server;
    server = simulateMovement(server, { buttons: 0, yaw: 0, pitch: 0 }, FIXED_DT_SECONDS);
    server = simulateMovement(server, { buttons: 0, yaw: 0, pitch: 0 }, FIXED_DT_SECONDS);
    const authoritative = quantize(server);
    const inferredVelocityY = (authoritative.y - Math.round(before.y * POSITION_SCALE) / POSITION_SCALE) / (2 * FIXED_DT_SECONDS);
    // Replay 3 pending ticks from the quantized base with inferred velocity.
    let replayed: MovementState = { ...authoritative, velocityY: inferredVelocityY };
    const pending: PendingInput[] = [1, 2, 3].map((seq) => ({ seq, buttons: 0, yaw: 0, pitch: 0, dtSeconds: FIXED_DT_SECONDS }));
    for (const input of pending) replayed = simulateMovement(replayed, input, input.dtSeconds);
    let truth = server;
    for (const input of pending) truth = simulateMovement(truth, input, input.dtSeconds);
    expect(Math.abs(replayed.y - truth.y)).toBeGreaterThan(0.02);
    // The agreement path instead compares the exact ack-tick prediction,
    // whose velocity never left the sim — within the floor by construction.
    expect(withinQuantizationNoise(quantize(server), authoritative)).toBe(true);
  });

  it("re-seeds history from the rewind lineage via replayPendingBySeq", () => {
    const pending: PendingInput[] = [11, 12, 13].map((seq) => ({
      seq,
      buttons: InputButton.Forward,
      yaw: 0.4,
      pitch: 0,
      dtSeconds: FIXED_DT_SECONDS,
    }));
    const replayed = replayPendingBySeq(initial, pending);
    expect(replayed.map(([seq]) => seq)).toEqual([11, 12, 13]);
    const reference = reconcilePrediction(initial, initial, 10, pending);
    const last = replayed[replayed.length - 1]?.[1];
    expect(last?.x).toBeCloseTo(reference.state.x, 12);
    expect(last?.y).toBeCloseTo(reference.state.y, 12);
    expect(last?.z).toBeCloseTo(reference.state.z, 12);
    // Empty pending replays nothing.
    expect(replayPendingBySeq(initial, [])).toEqual([]);
  });
});
