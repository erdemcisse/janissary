import WebSocket, { type RawData } from "ws";
import {
  FIXED_DT_MS,
  InputButton,
  MessageType,
  SNAPSHOT_HISTORY_SIZE,
  decodeSnapshot,
  decodeWelcome,
  encodeInput,
  encodeJoin,
  readMessageType,
  type Snapshot,
} from "@janissary/shared";

interface Options {
  count: number;
  url: string;
}

function parseOptions(arguments_: readonly string[]): Options {
  let count = 1;
  let url = "ws://localhost:9001";
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--count") count = Number.parseInt(arguments_[index + 1] ?? "1", 10);
    if (argument === "--url") url = arguments_[index + 1] ?? url;
  }
  if (!Number.isFinite(count) || count < 1 || count > 1_000) throw new Error("--count must be between 1 and 1000");
  return { count, url };
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
  readonly #snapshotHistory = new Map<number, Snapshot>();
  #entityId = 0;
  #sequence = 0;
  #lastSnapshotTick = 0;
  #buttons = InputButton.Forward;
  #yaw = Math.random() * Math.PI * 2 - Math.PI;
  #nextTurnAt = performance.now();
  #inputTimer?: NodeJS.Timeout;
  bytesIn = 0;
  bytesOut = 0;
  connected = false;

  constructor(url: string, index: number) {
    this.#socket = new WebSocket(url);
    this.#socket.binaryType = "arraybuffer";
    this.#socket.on("open", () => {
      this.connected = true;
      this.#send(encodeJoin({ name: `Bot ${String(index + 1).padStart(3, "0")}` }));
      this.#inputTimer = setInterval(() => this.#sendInput(), FIXED_DT_MS);
    });
    this.#socket.on("message", (data, isBinary) => {
      if (!isBinary) return;
      const buffer = toArrayBuffer(data);
      this.bytesIn += buffer.byteLength;
      this.#processMessage(buffer);
    });
    this.#socket.on("close", () => {
      this.connected = false;
      if (this.#inputTimer !== undefined) clearInterval(this.#inputTimer);
    });
    this.#socket.on("error", (error) => {
      console.error(`Bot ${index + 1}: ${error.message}`);
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
    const now = performance.now();
    if (now >= this.#nextTurnAt) {
      this.#yaw += (Math.random() - 0.5) * 1.8;
      const strafe = Math.random();
      this.#buttons = InputButton.Forward
        | (strafe < 0.25 ? InputButton.Left : strafe > 0.75 ? InputButton.Right : 0);
      this.#nextTurnAt = now + 1_000 + Math.random() * 2_500;
    }
    this.#sequence = (this.#sequence + 1) >>> 0;
    this.#send(encodeInput({
      seq: this.#sequence,
      lastSnapshotTick: this.#lastSnapshotTick,
      buttons: this.#buttons,
      yaw: this.#yaw,
      pitch: 0,
      dtMs: FIXED_DT_MS,
    }));
  }

  #processMessage(buffer: ArrayBuffer): void {
    try {
      const type = readMessageType(buffer);
      if (type === MessageType.Welcome) {
        this.#entityId = decodeWelcome(buffer).entityId;
      } else if (type === MessageType.Snapshot) {
        const baseTick = new DataView(buffer).getUint32(10, true);
        const baseline = baseTick === 0 ? undefined : this.#snapshotHistory.get(baseTick);
        const snapshot = decodeSnapshot(buffer, baseline);
        this.#snapshotHistory.set(snapshot.tick, snapshot);
        this.#lastSnapshotTick = snapshot.tick;
        while (this.#snapshotHistory.size > SNAPSHOT_HISTORY_SIZE) {
          const oldest = this.#snapshotHistory.keys().next().value as number | undefined;
          if (oldest === undefined) break;
          this.#snapshotHistory.delete(oldest);
        }
      }
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "unknown protocol error";
      console.error(`Bot protocol error: ${reason}`);
    }
  }
}

const options = parseOptions(process.argv.slice(2));
const bots: Bot[] = [];
for (let index = 0; index < options.count; index += 1) {
  setTimeout(() => bots.push(new Bot(options.url, index)), index * 5);
}

let previousIn = 0;
let previousOut = 0;
setInterval(() => {
  const totalIn = bots.reduce((sum, bot) => sum + bot.bytesIn, 0);
  const totalOut = bots.reduce((sum, bot) => sum + bot.bytesOut, 0);
  const connected = bots.filter((bot) => bot.connected).length;
  console.log(JSON.stringify({
    event: "bot_stats",
    connected,
    target: options.count,
    averageInboundKBps: Number(((totalIn - previousIn) / 10 / 1_024 / Math.max(1, connected)).toFixed(2)),
    averageOutboundKBps: Number(((totalOut - previousOut) / 10 / 1_024 / Math.max(1, connected)).toFixed(2)),
  }));
  previousIn = totalIn;
  previousOut = totalOut;
}, 10_000);

function shutdown(): void {
  for (const bot of bots) bot.close();
  setTimeout(() => process.exit(0), 100);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Starting ${options.count} bots against ${options.url}`);
