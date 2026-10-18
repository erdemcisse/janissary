import { fork, type ChildProcess } from "node:child_process";
import { setPriority } from "node:os";
import { fileURLToPath } from "node:url";
import WebSocket, { type RawData } from "ws";
import {
  FIXED_DT_MS,
  BotBrain,
  MessageType,
  PlayerClass,
  Team,
  ShipEventType,
  decodeShipEvent,
  decodeSnapshot,
  decodeWelcome,
  encodeInput,
  encodeJoin,
  readMessageType,
  type EntityState,
  type Snapshot,
} from "@janissary/shared";

const BOT_SNAPSHOT_HISTORY_SIZE = 8;
const EMPTY_ENTITIES: ReadonlyMap<number, EntityState> = new Map();

try {
  setPriority(10);
} catch {
  // Scheduling priority is a best-effort load-harness courtesy.
}

interface Options {
  count: number;
  url: string;
  procs: number;
  worker: boolean;
  offset: number;
}

interface WorkerStats {
  event: "worker_stats";
  workerId: number;
  connected: number;
  joined: number;
  target: number;
  snapshotsPerSecond: number;
  inboundBytesPerSecond: number;
  outboundBytesPerSecond: number;
  failures: number;
}

function parseOptions(arguments_: readonly string[]): Options {
  let count = 1;
  let url = "ws://localhost:9001";
  let procs = 1;
  let worker = false;
  let offset = 0;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--count") count = Number.parseInt(arguments_[index + 1] ?? "1", 10);
    if (argument === "--url") url = arguments_[index + 1] ?? url;
    if (argument === "--procs") procs = Number.parseInt(arguments_[index + 1] ?? "1", 10);
    if (argument === "--offset") offset = Number.parseInt(arguments_[index + 1] ?? "0", 10);
    if (argument === "--worker") worker = true;
  }
  if (!Number.isFinite(count) || count < 1 || count > 1_200) throw new Error("--count must be between 1 and 1200");
  if (!Number.isFinite(procs) || procs < 1 || procs > 32) throw new Error("--procs must be between 1 and 32");
  return { count, url, procs: Math.min(procs, count), worker, offset };
}

function toArrayBuffer(data: RawData): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data.slice(0);
  if (Array.isArray(data)) {
    const total = data.reduce((sum, item) => sum + item.byteLength, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const item of data) {
      combined.set(item, offset);
      offset += item.byteLength;
    }
    return combined.buffer;
  }
  const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return Uint8Array.from(view).buffer;
}

class Bot {
  readonly #socket: WebSocket;
  readonly #brain: BotBrain;
  readonly #snapshotHistory = new Map<number, Snapshot>();
  #entityId = 0;
  #sequence = 0;
  #lastSnapshotTick = 0;
  #latestSnapshot?: Snapshot;
  #inputTimer?: NodeJS.Timeout;
  bytesIn = 0;
  bytesOut = 0;
  snapshots = 0;
  connected = false;
  joined = false;
  failed = false;

  constructor(url: string, index: number) {
    const team = index % 2 === 0 ? Team.Ottoman : Team.Byzantine;
    const classRoll = index % 20;
    const playerClass = classRoll === 0 ? (team === Team.Ottoman ? PlayerClass.Janissary : PlayerClass.Guardsman)
      : classRoll === 1 ? (team === Team.Ottoman ? PlayerClass.Mehter : PlayerClass.Priest)
        : classRoll === 2 ? (team === Team.Ottoman ? PlayerClass.Sipahi : PlayerClass.Knight)
          : classRoll === 3 ? (team === Team.Ottoman ? PlayerClass.Topcu : PlayerClass.WallGunner)
            : (team === Team.Ottoman ? PlayerClass.Janissary : PlayerClass.Guardsman);
    this.#brain = new BotBrain(index, team, playerClass, performance.now());
    this.#socket = new WebSocket(url, { perMessageDeflate: false });
    this.#socket.binaryType = "arraybuffer";
    this.#socket.on("open", () => {
      this.connected = true;
      this.#send(encodeJoin({ name: `Bot ${String(index + 1).padStart(4, "0")}`, preferredTeam: team, preferredClass: playerClass, token: "" }));
      this.#inputTimer = setInterval(() => this.#sendInput(), FIXED_DT_MS);
    });
    this.#socket.on("message", (data, isBinary) => {
      if (!isBinary) return;
      const buffer = toArrayBuffer(data);
      this.bytesIn += buffer.byteLength;
      this.#processMessage(buffer);
    });
    this.#socket.on("close", () => {
      if (!this.joined) this.failed = true;
      this.connected = false;
      if (this.#inputTimer !== undefined) clearInterval(this.#inputTimer);
    });
    this.#socket.on("error", () => {
      this.failed = true;
    });
  }

  close(): void {
    if (this.#inputTimer !== undefined) clearInterval(this.#inputTimer);
    this.#socket.close();
  }

  #send(buffer: ArrayBuffer): void {
    if (this.#socket.readyState !== WebSocket.OPEN) return;
    this.#socket.send(buffer);
    this.bytesOut += buffer.byteLength;
  }

  #sendInput(): void {
    if (this.#entityId === 0) return;
    const entities = this.#latestSnapshot?.entities ?? EMPTY_ENTITIES;
    const decision = this.#brain.decide(entities, this.#entityId, performance.now());
    this.#sequence = (this.#sequence + 1) >>> 0;
    this.#send(encodeInput({
      seq: this.#sequence,
      lastSnapshotTick: this.#lastSnapshotTick,
      buttons: decision.buttons,
      yaw: decision.yaw,
      pitch: decision.pitch,
      dtMs: FIXED_DT_MS,
    }));
  }

  #processMessage(buffer: ArrayBuffer): void {
    try {
      const type = readMessageType(buffer);
      if (type === MessageType.Welcome) {
        const welcome = decodeWelcome(buffer);
        this.#entityId = welcome.entityId;
        this.joined = true;
      } else if (type === MessageType.ShipEvent) {
        const event = decodeShipEvent(buffer);
        if (event.occupantEntityId !== this.#entityId) return;
        if (event.eventType === ShipEventType.HelmClaimed) this.#brain.onHelmClaimed();
        else if (event.eventType === ShipEventType.Gun1Claimed) this.#brain.onGunClaimed(0);
        else if (event.eventType === ShipEventType.Gun2Claimed) this.#brain.onGunClaimed(1);
        else if (event.eventType === ShipEventType.PassengerBoarded) this.#brain.onPassengerBoarded();
        else if (event.eventType === ShipEventType.HelmReleased || event.eventType === ShipEventType.Gun1Released
          || event.eventType === ShipEventType.Gun2Released || event.eventType === ShipEventType.PassengerLeft || event.eventType === ShipEventType.Sunk) {
          this.#brain.onStationReleased();
        }
      } else if (type === MessageType.Snapshot) {
        const baseTick = new DataView(buffer).getUint32(10, true);
        const baseline = baseTick === 0 ? undefined : this.#snapshotHistory.get(baseTick);
        const snapshot = decodeSnapshot(buffer, baseline);
        this.#snapshotHistory.set(snapshot.tick, snapshot);
        this.#lastSnapshotTick = snapshot.tick;
        this.#latestSnapshot = snapshot;
        this.snapshots += 1;
        while (this.#snapshotHistory.size > BOT_SNAPSHOT_HISTORY_SIZE) {
          const oldest = this.#snapshotHistory.keys().next().value as number | undefined;
          if (oldest === undefined) break;
          this.#snapshotHistory.delete(oldest);
        }
      }
    } catch {
      this.failed = true;
    }
  }
}

function runWorker(options: Options): void {
  const bots: Bot[] = [];
  for (let index = 0; index < options.count; index += 1) {
    setTimeout(() => bots.push(new Bot(options.url, options.offset + index)), index * 4);
  }
  let previousIn = 0;
  let previousOut = 0;
  let previousSnapshots = 0;
  const report = (): void => {
    const totalIn = bots.reduce((sum, bot) => sum + bot.bytesIn, 0);
    const totalOut = bots.reduce((sum, bot) => sum + bot.bytesOut, 0);
    const totalSnapshots = bots.reduce((sum, bot) => sum + bot.snapshots, 0);
    const stats: WorkerStats = {
      event: "worker_stats",
      workerId: process.pid,
      connected: bots.filter((bot) => bot.connected).length,
      joined: bots.filter((bot) => bot.joined && bot.connected).length,
      target: options.count,
      snapshotsPerSecond: (totalSnapshots - previousSnapshots) / 10,
      inboundBytesPerSecond: (totalIn - previousIn) / 10,
      outboundBytesPerSecond: (totalOut - previousOut) / 10,
      failures: bots.filter((bot) => bot.failed).length,
    };
    if (process.send !== undefined) process.send(stats);
    else printAggregate([stats]);
    previousIn = totalIn;
    previousOut = totalOut;
    previousSnapshots = totalSnapshots;
  };
  setInterval(report, 10_000);
  const shutdown = (): void => {
    for (const bot of bots) bot.close();
    setTimeout(() => process.exit(0), 100);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`Worker ${process.pid} starting ${options.count} bots (${options.offset + 1}-${options.offset + options.count})`);
}

function isWorkerStats(message: unknown): message is WorkerStats {
  return typeof message === "object" && message !== null && "event" in message && message.event === "worker_stats";
}

function printAggregate(stats: readonly WorkerStats[]): void {
  const target = stats.reduce((sum, item) => sum + item.target, 0);
  const connected = stats.reduce((sum, item) => sum + item.connected, 0);
  const joined = stats.reduce((sum, item) => sum + item.joined, 0);
  const inbound = stats.reduce((sum, item) => sum + item.inboundBytesPerSecond, 0);
  const outbound = stats.reduce((sum, item) => sum + item.outboundBytesPerSecond, 0);
  console.log(JSON.stringify({
    event: "bot_stats",
    connected,
    joined,
    target,
    failures: stats.reduce((sum, item) => sum + item.failures, 0),
    averageSnapshotRate: Number((stats.reduce((sum, item) => sum + item.snapshotsPerSecond, 0) / Math.max(1, joined)).toFixed(2)),
    averageInboundKBps: Number((inbound / 1_024 / Math.max(1, connected)).toFixed(2)),
    averageOutboundKBps: Number((outbound / 1_024 / Math.max(1, connected)).toFixed(2)),
  }));
}

function runCoordinator(options: Options): void {
  const children: ChildProcess[] = [];
  const latest = new Map<number, WorkerStats>();
  let offset = options.offset;
  for (let index = 0; index < options.procs; index += 1) {
    const remaining = options.count - (offset - options.offset);
    const processesLeft = options.procs - index;
    const childCount = Math.ceil(remaining / processesLeft);
    const child = fork(fileURLToPath(import.meta.url), [
      "--worker", "--count", String(childCount), "--url", options.url, "--offset", String(offset),
    ], { execArgv: process.execArgv, stdio: ["inherit", "inherit", "inherit", "ipc"] });
    child.on("message", (message: unknown) => {
      if (isWorkerStats(message)) latest.set(message.workerId, message);
    });
    children.push(child);
    offset += childCount;
  }
  setInterval(() => printAggregate([...latest.values()]), 10_000);
  const shutdown = (): void => {
    for (const child of children) child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 200);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`Starting ${options.count} bots in ${options.procs} processes against ${options.url}`);
}

const options = parseOptions(process.argv.slice(2));
if (options.worker || options.procs === 1) runWorker(options);
else runCoordinator(options);
