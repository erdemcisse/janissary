import WebSocket from "ws";
import {
  MessageType,
  PROTOCOL_VERSION,
  PlayerClass,
  encodeChatSend,
  encodeClassSelect,
  encodeDeploy,
  encodeInput,
  encodeJoin,
  encodePing,
  encodeSpawnSelect,
  readMessageType,
  type InputMessage,
} from "@janissary/shared";

/**
 * Hostile-input regression probe (audit Task 4). ADR 0011 SEC-006/SEC-014
 * fixed the input validator; protocol v13 added the high button word (weapon
 * slots), v14 the aim bit, v15 the Deploy request (8e-13). Each case below
 * connects as a guest, sends one crafted frame, and reports whether the
 * server rejected it (close 1002) or tolerated it — the validator's exact
 * contract:
 *
 *   - slot bits 1/2/3 (0x10000..0x40000) must be ACCEPTED;
 *   - the aim bit (0x2000, v14) must be ACCEPTED;
 *   - any bit above the mask (bit 19+) must be REJECTED;
 *   - dtMs > 100 must be REJECTED;
 *   - pitch beyond the ±89.6° horizon must be REJECTED;
 *   - SpawnSelect indexes outside 0..6/255 must be ignored WITHOUT closing;
 *   - a chat text larger than the wire maximum must not crash the peer;
 *   - Deploy while alive must be tolerated (no-op), Deploy with trailing
 *     bytes must be REJECTED (exact framing).
 *
 * Usage: pnpm --filter @janissary/tools exec tsx hostile-input-probe.ts [url]
 */

const TARGET_URL = process.argv[2] ?? "ws://localhost:9001";

function toArrayBuffer(data: WebSocket.RawData): ArrayBuffer {
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
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

interface CaseResult {
  case: string;
  outcome: "rejected" | "accepted" | "closed-unexpectedly" | "no-response";
  detail?: string;
}

function runCase(label: string, frame: (buffer: ArrayBuffer) => ArrayBuffer, expectReject: boolean): Promise<CaseResult> {
  return new Promise((resolve) => {
    const ws = new WebSocket(TARGET_URL, { perMessageDeflate: false });
    let joined = false;
    let closed = false;
    let rejected = false;
    const finish = (outcome: CaseResult["outcome"], detail?: string): void => {
      if (closed) return;
      closed = true;
      ws.close();
      const result: CaseResult = { case: label, outcome, ...(detail === undefined ? {} : { detail }) };
      resolve(result);
    };
    const timer = setTimeout(() => {
      // No close within the window: the frame was tolerated.
      finish(expectReject ? "closed-unexpectedly" : "accepted", "socket stayed open");
    }, 2_500);
    ws.on("open", () => {
      ws.send(encodeJoin({ token: "", name: "HostileProbe", preferredTeam: 0, preferredClass: 0 }));
    });
    ws.on("message", (data) => {
      const buffer = toArrayBuffer(data);
      const type = readMessageType(buffer);
      if (type === MessageType.Welcome) {
        joined = true;
        ws.send(frame(buffer));
      }
    });
    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      if (!joined) {
        finish("closed-unexpectedly", `closed before welcome close=${code} reason=${String(reason).slice(0, 60)}`);
        return;
      }
      rejected = code === 1002;
      finish(rejected ? "rejected" : "closed-unexpectedly", `close=${code} reason=${String(reason).slice(0, 60)}`);
    });
    ws.on("error", () => {
      clearTimeout(timer);
      finish("no-response", "socket error");
    });
  });
}

function inputWith(buttons: number, dtMs = 50, pitch = 0): ArrayBuffer {
  const message: InputMessage = { seq: 1, lastSnapshotTick: 0, buttons, yaw: 0, pitch, dtMs };
  return encodeInput(message);
}

/**
 * Craft a raw Input frame with dtMs=101, bypassing encodeInput's own
 * 0..100 clamp (a hostile client writes bytes, not encoder output).
 */
function rawInputWithDtMs101(): ArrayBuffer {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MessageType.Input);
  view.setUint32(2, 1, true); // seq
  view.setUint32(6, 0, true); // lastSnapshotTick
  view.setUint16(10, 0, true); // buttons low
  view.setInt16(12, 0, true); // yaw
  view.setInt16(14, 0, true); // pitch
  view.setUint16(16, 101, true); // dtMs beyond the cap
  view.setUint16(18, 0, true); // buttonsHigh
  return buffer;
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  // 1. Slot bits (v13, inside the mask) must be accepted.
  results.push(await runCase("slot1-bit-valid", () => inputWith(0x10000), false));
  results.push(await runCase("slot2-bit-valid", () => inputWith(0x20000), false));
  results.push(await runCase("slot3-bit-valid", () => inputWith(0x40000), false));
  // 1b. The aim bit (v14, previously reserved low-word bit 13) must be accepted.
  results.push(await runCase("aim-bit-valid", () => inputWith(0x2000), false));
  // 2. Reserved bit 19 (outside VALID_INPUT_BUTTON_MASK) must be rejected.
  results.push(await runCase("bit19-outside-mask", () => inputWith(0x80000), true));
  // 3. All-ones button word must be rejected.
  results.push(await runCase("all-bits-set", () => inputWith(0xffffffff), true));
  // 4. dtMs beyond the 100 ms cap must be rejected (raw bytes: the encoder
  //    clamps, a hostile peer does not).
  results.push(await runCase("dtMs-101", () => rawInputWithDtMs101(), true));
  // 5. Pitch beyond the ±89.6° horizon must be rejected.
  results.push(await runCase("pitch-past-horizon", () => inputWith(0, 50, Math.PI * 0.51), true));
  // 6. Out-of-range SpawnSelect must be ignored, not fatal.
  results.push(await runCase("spawnselect-index-7", () => encodeSpawnSelect(7), false));
  results.push(await runCase("spawnselect-home-base", () => encodeSpawnSelect(0xff), false));
  // 7. A class select outside the enum must be rejected (SEC-006).
  results.push(await runCase("class-select-9", () => encodeClassSelect(9 as PlayerClass), true));
  // 8. Oversized chat text must not crash the peer.
  results.push(await runCase("chat-oversize", () => encodeChatSend({ channel: 1, text: "x".repeat(500) }), false));
  // 9. Ping/Pong round trip still works after accepted inputs.
  results.push(await runCase("ping-after-inputs", () => encodePing(MessageType.Ping, 42), false));
  // 10. SquadCommand is fixed-size (7 payload bytes, 2 reserved); trailing
  //     bytes after the reserved word must be rejected per SEC-006's exact
  //     framing invariant (currently accepted — see audit report).
  results.push(await runCase("squadcommand-trailing", () => {
    const frame = new Uint8Array(14);
    frame[0] = PROTOCOL_VERSION;
    frame[1] = MessageType.SquadCommand;
    frame[2] = 1; // op Invite
    return frame.buffer;
  }, true));
  // 11. Deploy (v15) while alive is a harmless no-op — never fatal.
  results.push(await runCase("deploy-while-alive", () => encodeDeploy(), false));
  // 12. A Deploy frame with trailing bytes violates the exact-framing
  //     invariant (SEC-006) and must be rejected.
  results.push(await runCase("deploy-trailing", () => {
    const frame = new Uint8Array(3);
    frame[0] = PROTOCOL_VERSION;
    frame[1] = MessageType.Deploy;
    frame[2] = 0; // trailing byte — Deploy carries no payload
    return frame.buffer;
  }, true));

  const rejected = results.filter((result) => result.outcome === "rejected").length;
  const accepted = results.filter((result) => result.outcome === "accepted").length;
  const unexpected = results.filter((result) => result.outcome === "closed-unexpectedly");
  for (const result of results) console.log(JSON.stringify({ event: "case", ...result }));
  console.log(JSON.stringify({
    event: "summary",
    cases: results.length,
    rejected,
    accepted,
    unexpected: unexpected.length,
    unexpectedDetails: unexpected,
    pass: rejected + accepted === results.length,
  }));
  process.exit(rejected + accepted === results.length ? 0 : 1);
}

main().catch((error) => {
  console.log(JSON.stringify({ event: "probe_error", detail: String(error) }));
  process.exit(1);
});
