import { fork, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
interface Percentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
}

interface MetricsSnapshot {
  readonly players: number;
  readonly connections: number;
  readonly pendingJoins: number;
  readonly tick: number;
  readonly samples: number;
  readonly phases: Readonly<Record<"input" | "movement" | "combat" | "capture" | "artillery" | "naval" | "progression" | "replication" | "total", Percentiles>>;
  readonly sustainedPhases?: Readonly<Record<"input" | "movement" | "combat" | "capture" | "artillery" | "naval" | "progression" | "replication" | "total", Percentiles>>;
  readonly replicationSubphases?: Readonly<Record<ReplicationSubphase, Percentiles>>;
  readonly sustainedReplicationSubphases?: Readonly<Record<ReplicationSubphase, Percentiles>>;
  readonly totalOutboundKBps: number;
  readonly outboundKBpsPerClient: number;
  readonly serverErrors: number;
  readonly protocolRejects?: number;
  readonly heapUsedMB: number;
  readonly generatedAt: string;
}

type ReplicationSubphase = "capture" | "selection" | "interest" | "templateLookup" | "encode" | "ackPatch" | "send" | "history" | "total";

const REPLICATION_SUBPHASES: readonly ReplicationSubphase[] = ["capture", "selection", "interest", "templateLookup", "encode", "ackPatch", "send", "history", "total"];
const REPLICATION_BASELINE_P99: Readonly<Record<ReplicationSubphase, number>> = {
  capture: 0.298,
  selection: 0.784,
  interest: 12.287,
  templateLookup: 3.457,
  encode: 2.208,
  ackPatch: 0.086,
  send: 5.758,
  history: 0.112,
  total: 29.980,
};

interface Options {
  readonly url: string;
  readonly metricsUrl: string;
  readonly metricsToken: string;
  readonly durationSeconds: number;
  readonly count: number;
  readonly smoke: boolean;
}

function parseOptions(arguments_: readonly string[]): Options {
  let url = "ws://localhost:9001";
  let metricsUrl = "";
  let metricsToken = process.env.METRICS_TOKEN ?? "";
  let durationSeconds = 300;
  let count = 1_000;
  let smoke = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--url") url = arguments_[index + 1] ?? url;
    if (argument === "--metrics-url") metricsUrl = arguments_[index + 1] ?? metricsUrl;
    if (argument === "--metrics-token") metricsToken = arguments_[index + 1] ?? metricsToken;
    if (argument === "--duration") durationSeconds = Number.parseInt(arguments_[index + 1] ?? "300", 10);
    if (argument === "--count") count = Number.parseInt(arguments_[index + 1] ?? "1000", 10);
    if (argument === "--smoke") smoke = true;
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 15) throw new Error("--duration must be at least 15 seconds");
  if (!Number.isFinite(count) || count < 4 || count > 1_200) throw new Error("--count must be between 4 and 1200");
  if (metricsUrl === "") {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/metrics";
    metricsUrl = parsed.toString();
  }
  return { url, metricsUrl, metricsToken, durationSeconds, count, smoke };
}

function timestampName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function renderReport(
  options: Options,
  samples: readonly MetricsSnapshot[],
  startedAt: Date,
  finishedAt: Date,
): { markdown: string; passed: boolean } {
  const peakPlayers = samples.reduce((maximum, sample) => Math.max(maximum, sample.players), 0);
  const atScale = samples.filter((sample) => sample.players >= Math.floor(options.count * 0.95));
  const finalAtScale = atScale.at(-1);
  const sustainedSeconds = atScale.length * 10;
  const sustainedPhases = finalAtScale?.sustainedPhases ?? finalAtScale?.phases;
  const tickP99 = sustainedPhases?.total.p99 ?? 0;
  const replicationP99 = sustainedPhases?.replication.p99 ?? 0;
  const replicationSubphases = finalAtScale?.sustainedReplicationSubphases ?? finalAtScale?.replicationSubphases;
  const bandwidth = atScale.reduce((maximum, sample) => Math.max(maximum, sample.outboundKBpsPerClient), 0);
  const errors = samples.reduce((maximum, sample) => Math.max(maximum, sample.serverErrors), 0);
  const peakHeap = atScale.reduce((maximum, sample) => Math.max(maximum, sample.heapUsedMB), 0);
  const connectionPass = peakPlayers >= options.count;
  const sustainedPass = options.smoke || sustainedSeconds >= 180;
  const tickPass = atScale.length > 0 && tickP99 <= 34;
  const replicationPass = atScale.length > 0 && replicationP99 <= 24;
  const progressionP99 = sustainedPhases?.progression.p99 ?? 0;
  const progressionPass = atScale.length > 0 && progressionP99 < 1;
  const artilleryP99 = sustainedPhases?.artillery.p99 ?? 0;
  const artilleryPass = atScale.length > 0 && artilleryP99 < 3;
  const navalP99 = sustainedPhases?.naval.p99 ?? 0;
  const navalPass = atScale.length > 0 && navalP99 < 4;
  const bandwidthPass = atScale.length > 0 && bandwidth < 30;
  const errorsPass = errors === 0;
  const passed = connectionPass && sustainedPass && tickPass && replicationPass && progressionPass && artilleryPass && navalPass && bandwidthPass && errorsPass;
  const rows = (["input", "movement", "combat", "capture", "artillery", "naval", "progression", "replication", "total"] as const)
    .map((phase) => `| ${phase} | ${(sustainedPhases?.[phase].p99 ?? 0).toFixed(3)} |`)
    .join("\n");
  const replicationRows = REPLICATION_SUBPHASES.map((phase) => {
    const before = REPLICATION_BASELINE_P99[phase];
    const after = replicationSubphases?.[phase].p99 ?? 0;
    const change = ((after - before) / before) * 100;
    return `| ${phase} | ${before.toFixed(3)} | ${after.toFixed(3)} | ${change.toFixed(1)}% |`;
  }).join("\n");
  const markdown = `# Production-scale load test — ${startedAt.toISOString()}\n\n`+
    `- Target: ${options.count} bots, ramped in three cohorts over ${options.durationSeconds} seconds\n`+
    `- Server: ${options.url}\n`+
    `- Server host: ${process.env.LOADTEST_SERVER_DESCRIPTION ?? "not supplied"}\n`+
    `- Load generator: ${process.env.LOADTEST_GENERATOR_DESCRIPTION ?? "not supplied"}\n`+
    `- Network path: ${process.env.LOADTEST_NETWORK_PATH ?? "not supplied"}\n`+
    `- Started: ${startedAt.toISOString()}\n`+
    `- Finished: ${finishedAt.toISOString()}\n`+
    `- Peak connected players: ${peakPlayers}\n`+
    `- Time sampled at ≥95% target: ${sustainedSeconds} seconds\n`+
    `- Peak per-client downstream: ${bandwidth.toFixed(2)} KB/s\n`+
    `- Peak observed heap at scale: ${peakHeap.toFixed(2)} MB\n`+
    `- Server errors: ${errors}\n\n`+
    `## P99 phase timings at scale\n\nThe final values are calculated over the server's rolling 3,600-tick window (three minutes at 20 Hz), not the worst individual ten-second window.\n\n| Phase | Sustained p99 (ms) |\n|---|---:|\n${rows}\n\n`+
    `## Replication before/after\n\nThe before total is the Phase 4 acceptance result; before sub-phases are from the instrumentation-only 1,000-bot profile recorded in ADR 0006. Percentiles are independent and do not add arithmetically.\n\n| Replication sub-phase | Before p99 (ms) | After p99 (ms) | Change |\n|---|---:|---:|---:|\n${replicationRows}\n\n`+
    `## Budgets\n\n`+
    `| Budget | Result | Status |\n|---|---:|---|\n`+
    `| ${options.count} connected | ${peakPlayers} | ${connectionPass ? "PASS" : "FAIL"} |\n`+
    `| Sustained ≥180 s | ${sustainedSeconds} s | ${sustainedPass ? "PASS" : "FAIL"} |\n`+
    `| Tick p99 ≤34 ms | ${tickP99.toFixed(3)} ms | ${tickPass ? "PASS" : "FAIL"} |\n`+
    `| Replication p99 ≤24 ms | ${replicationP99.toFixed(3)} ms | ${replicationPass ? "PASS" : "FAIL"} |\n`+
    `| Naval p99 <4 ms | ${navalP99.toFixed(3)} ms | ${navalPass ? "PASS" : "FAIL"} |\n`+
    `| Progression p99 <1 ms | ${progressionP99.toFixed(3)} ms | ${progressionPass ? "PASS" : "FAIL"} |\n`+
    `| Artillery + wall phase p99 <3 ms | ${artilleryP99.toFixed(3)} ms | ${artilleryPass ? "PASS" : "FAIL"} |\n`+
    `| Downstream <30 KB/s/client | ${bandwidth.toFixed(2)} KB/s | ${bandwidthPass ? "PASS" : "FAIL"} |\n`+
    `| Zero server errors | ${errors} | ${errorsPass ? "PASS" : "FAIL"} |\n\n`+
    `**Overall: ${passed ? "PASS" : "FAIL"}.**\n`;
  return { markdown, passed };
}

async function scrapeMetrics(url: string, token: string): Promise<MetricsSnapshot> {
  const response = await fetch(url, token === "" ? undefined : { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Metrics returned HTTP ${response.status}`);
  return await response.json() as MetricsSnapshot;
}

const options = parseOptions(process.argv.slice(2));
const cohorts = [Math.floor(options.count / 4), Math.floor(options.count / 4), options.count - Math.floor(options.count / 2)];
const rampTimes = options.smoke
  ? [0, Math.floor(options.durationSeconds / 4), Math.floor(options.durationSeconds / 2)]
  : [0, 60, 120];
const children: ChildProcess[] = [];
const samplesByTimestamp = new Map<string, MetricsSnapshot>();
const startedAt = new Date();
const botPath = fileURLToPath(new URL("./bot.ts", import.meta.url));

function startCohort(count: number, offset: number): void {
  const processes = Math.max(1, Math.ceil(count / 150));
  const child = fork(botPath, [
    "--count", String(count), "--procs", String(processes), "--url", options.url, "--offset", String(offset),
  ], { execArgv: process.execArgv, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  children.push(child);
}

function stopChildren(): void {
  for (const child of children) child.kill("SIGTERM");
}

for (let index = 0, offset = 0; index < cohorts.length; index += 1) {
  const count = cohorts[index] ?? 0;
  const delayMs = (rampTimes[index] ?? 0) * 1_000;
  const cohortOffset = offset;
  setTimeout(() => startCohort(count, cohortOffset), delayMs);
  offset += count;
}

const scrapeTimer = setInterval(() => {
  void scrapeMetrics(options.metricsUrl, options.metricsToken).then((sample) => {
    if (sample.generatedAt !== new Date(0).toISOString()) samplesByTimestamp.set(sample.generatedAt, sample);
    console.log(JSON.stringify({ event: "loadtest_sample", players: sample.players, replicationP99: sample.phases.replication.p99, totalP99: sample.phases.total.p99, bandwidth: sample.outboundKBpsPerClient }));
  }).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "metrics scrape failed";
    console.error(reason);
  });
}, 10_000);

const shutdown = (): void => {
  clearInterval(scrapeTimer);
  stopChildren();
};
process.on("SIGINT", () => { shutdown(); process.exit(130); });
process.on("SIGTERM", () => { shutdown(); process.exit(143); });

await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, options.durationSeconds * 1_000));
clearInterval(scrapeTimer);
try {
  const finalSample = await scrapeMetrics(options.metricsUrl, options.metricsToken);
  samplesByTimestamp.set(finalSample.generatedAt, finalSample);
} catch {
  // The periodic samples still produce a useful failure report.
}
stopChildren();
const finishedAt = new Date();
const result = renderReport(options, [...samplesByTimestamp.values()], startedAt, finishedAt);
const reportPath = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/loadtests", `${timestampName(startedAt)}.md`);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, result.markdown, "utf8");
console.log(JSON.stringify({ event: "loadtest_complete", reportPath, passed: result.passed }));
if (!result.passed) process.exitCode = 1;
