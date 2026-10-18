export interface PhaseDurations {
  input: number;
  movement: number;
  combat: number;
  capture: number;
  artillery: number;
  naval: number;
  progression: number;
  replication: number;
  total: number;
}

export interface ReplicationDurations {
  capture: number;
  selection: number;
  interest: number;
  templateLookup: number;
  encode: number;
  ackPatch: number;
  send: number;
  history: number;
  total: number;
}

interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  readonly players: number;
  readonly connections: number;
  readonly pendingJoins: number;
  readonly tick: number;
  readonly samples: number;
  readonly phases: Readonly<Record<keyof PhaseDurations, Percentiles>>;
  readonly sustainedPhases: Readonly<Record<keyof PhaseDurations, Percentiles>>;
  readonly replicationSubphases: Readonly<Record<keyof ReplicationDurations, Percentiles>>;
  readonly sustainedReplicationSubphases: Readonly<Record<keyof ReplicationDurations, Percentiles>>;
  readonly totalOutboundKBps: number;
  readonly outboundKBpsPerClient: number;
  readonly serverErrors: number;
  readonly protocolRejects: number;
  readonly heapUsedMB: number;
  readonly generatedAt: string;
}

const PHASES: readonly (keyof PhaseDurations)[] = ["input", "movement", "combat", "capture", "artillery", "naval", "progression", "replication", "total"];
const REPLICATION_PHASES: readonly (keyof ReplicationDurations)[] = ["capture", "selection", "interest", "templateLookup", "encode", "ackPatch", "send", "history", "total"];
const SUSTAINED_SAMPLE_COUNT = 3_600;

function emptyPercentiles(): Percentiles {
  return { p50: 0, p95: 0, p99: 0 };
}

function emptyMetrics(): MetricsSnapshot {
  const emptyReplication = (): Record<keyof ReplicationDurations, Percentiles> => ({
    capture: emptyPercentiles(), selection: emptyPercentiles(), interest: emptyPercentiles(),
    templateLookup: emptyPercentiles(), encode: emptyPercentiles(), ackPatch: emptyPercentiles(),
    send: emptyPercentiles(), history: emptyPercentiles(), total: emptyPercentiles(),
  });
  return {
    players: 0,
    connections: 0,
    pendingJoins: 0,
    tick: 0,
    samples: 0,
    phases: {
      input: emptyPercentiles(), movement: emptyPercentiles(), combat: emptyPercentiles(), artillery: emptyPercentiles(), naval: emptyPercentiles(),
      capture: emptyPercentiles(), progression: emptyPercentiles(), replication: emptyPercentiles(), total: emptyPercentiles(),
    },
    sustainedPhases: {
      input: emptyPercentiles(), movement: emptyPercentiles(), combat: emptyPercentiles(), artillery: emptyPercentiles(), naval: emptyPercentiles(),
      capture: emptyPercentiles(), progression: emptyPercentiles(), replication: emptyPercentiles(), total: emptyPercentiles(),
    },
    replicationSubphases: emptyReplication(),
    sustainedReplicationSubphases: emptyReplication(),
    totalOutboundKBps: 0,
    outboundKBpsPerClient: 0,
    serverErrors: 0,
    protocolRejects: 0,
    heapUsedMB: 0,
    generatedAt: new Date(0).toISOString(),
  };
}

function percentiles(values: readonly number[]): Percentiles {
  if (values.length === 0) return emptyPercentiles();
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return {
    p50: Number(at(0.5).toFixed(3)),
    p95: Number(at(0.95).toFixed(3)),
    p99: Number(at(0.99).toFixed(3)),
  };
}

export class TickStats {
  readonly #durations: Record<keyof PhaseDurations, number[]> = {
    input: [], movement: [], combat: [], capture: [], artillery: [], naval: [], progression: [], replication: [], total: [],
  };
  readonly #sustained: Record<keyof PhaseDurations, Float64Array> = {
    input: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    movement: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    combat: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    capture: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    artillery: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    naval: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    progression: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    replication: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    total: new Float64Array(SUSTAINED_SAMPLE_COUNT),
  };
  readonly #replicationDurations: Record<keyof ReplicationDurations, number[]> = {
    capture: [], selection: [], interest: [], templateLookup: [], encode: [], ackPatch: [], send: [], history: [], total: [],
  };
  readonly #sustainedReplication: Record<keyof ReplicationDurations, Float64Array> = {
    capture: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    selection: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    interest: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    templateLookup: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    encode: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    ackPatch: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    send: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    history: new Float64Array(SUSTAINED_SAMPLE_COUNT),
    total: new Float64Array(SUSTAINED_SAMPLE_COUNT),
  };
  #sustainedIndex = 0;
  #sustainedCount = 0;
  #lastReportAt = performance.now();
  #latest = emptyMetrics();

  record(durations: Readonly<PhaseDurations>, replication: Readonly<ReplicationDurations>): void {
    for (const phase of PHASES) {
      this.#durations[phase].push(durations[phase]);
      this.#sustained[phase][this.#sustainedIndex] = durations[phase];
    }
    for (const phase of REPLICATION_PHASES) {
      this.#replicationDurations[phase].push(replication[phase]);
      this.#sustainedReplication[phase][this.#sustainedIndex] = replication[phase];
    }
    this.#sustainedIndex = (this.#sustainedIndex + 1) % SUSTAINED_SAMPLE_COUNT;
    this.#sustainedCount = Math.min(SUSTAINED_SAMPLE_COUNT, this.#sustainedCount + 1);
  }

  latest(): MetricsSnapshot {
    return this.#latest;
  }

  reportIfDue(
    playerCount: number,
    connectionCount: number,
    pendingJoins: number,
    tick: number,
    bytesSent: number,
    serverErrors: number,
    protocolRejects: number,
  ): boolean {
    const now = performance.now();
    if (now - this.#lastReportAt < 10_000) return false;
    const seconds = Math.max(0.001, (now - this.#lastReportAt) / 1_000);
    const totalOutboundKBps = bytesSent / seconds / 1_024;
    const phaseMetrics = {
      input: percentiles(this.#durations.input),
      movement: percentiles(this.#durations.movement),
      combat: percentiles(this.#durations.combat),
      capture: percentiles(this.#durations.capture),
      artillery: percentiles(this.#durations.artillery),
      naval: percentiles(this.#durations.naval),
      progression: percentiles(this.#durations.progression),
      replication: percentiles(this.#durations.replication),
      total: percentiles(this.#durations.total),
    };
    const sustainedMetrics = {
      input: percentiles(Array.from(this.#sustained.input.subarray(0, this.#sustainedCount))),
      movement: percentiles(Array.from(this.#sustained.movement.subarray(0, this.#sustainedCount))),
      combat: percentiles(Array.from(this.#sustained.combat.subarray(0, this.#sustainedCount))),
      capture: percentiles(Array.from(this.#sustained.capture.subarray(0, this.#sustainedCount))),
      artillery: percentiles(Array.from(this.#sustained.artillery.subarray(0, this.#sustainedCount))),
      naval: percentiles(Array.from(this.#sustained.naval.subarray(0, this.#sustainedCount))),
      progression: percentiles(Array.from(this.#sustained.progression.subarray(0, this.#sustainedCount))),
      replication: percentiles(Array.from(this.#sustained.replication.subarray(0, this.#sustainedCount))),
      total: percentiles(Array.from(this.#sustained.total.subarray(0, this.#sustainedCount))),
    };
    const replicationSubphases = Object.fromEntries(REPLICATION_PHASES.map((phase) => [phase, percentiles(this.#replicationDurations[phase])])) as Record<keyof ReplicationDurations, Percentiles>;
    const sustainedReplicationSubphases = Object.fromEntries(REPLICATION_PHASES.map((phase) => [
      phase,
      percentiles(Array.from(this.#sustainedReplication[phase].subarray(0, this.#sustainedCount))),
    ])) as Record<keyof ReplicationDurations, Percentiles>;
    this.#latest = {
      players: playerCount,
      connections: connectionCount,
      pendingJoins,
      tick,
      samples: this.#durations.total.length,
      phases: phaseMetrics,
      sustainedPhases: sustainedMetrics,
      replicationSubphases,
      sustainedReplicationSubphases,
      totalOutboundKBps: Number(totalOutboundKBps.toFixed(2)),
      outboundKBpsPerClient: Number((totalOutboundKBps / Math.max(1, playerCount)).toFixed(2)),
      serverErrors,
      protocolRejects,
      heapUsedMB: Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2)),
      generatedAt: new Date().toISOString(),
    };
    console.log(JSON.stringify({ event: "tick_stats", ...this.#latest }));
    for (const phase of PHASES) this.#durations[phase].length = 0;
    for (const phase of REPLICATION_PHASES) this.#replicationDurations[phase].length = 0;
    this.#lastReportAt = now;
    return true;
  }
}
