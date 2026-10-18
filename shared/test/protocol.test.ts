import { describe, expect, it } from "vitest";
import type { SnapshotMeta } from "../src/protocol";
import { ProtocolError, snapshotDeltaBytes } from "../src/protocol";
import {
  ContractKind,
  EntityKind,
  InputButton,
  ShipEventType,
  VALID_INPUT_BUTTON_MASK,
  decodeAccount,
  decodeChatMessage,
  decodeChatNotice,
  decodeChatReport,
  decodeChatSend,
  decodeShipEvent,
  decodeContractEvent,
  decodeEntityJoin,
  decodeEntityLeave,
  decodeInput,
  decodeJoin,
  decodeSnapshot,
  decodeSpawnSelect,
  decodeDeploy,
  decodeWarSummary,
  decodeWelcome,
  decodeClassSelect,
  decodeClassStatus,
  decodeWallEvent,
  decodeXpEvent,
  encodeAccount,
  encodeChatMessage,
  encodeChatNotice,
  encodeChatReport,
  encodeChatSend,
  encodeContractEvent,
  encodeEntityJoin,
  encodeEntityLeave,
  encodeShipEvent,
  encodeInput,
  encodeInterestSnapshotInto,
  encodeJoin,
  encodeSnapshot,
  encodeSpawnSelect,
  encodeDeploy,
  encodeSnapshotInto,
  encodeWarSummary,
  encodeWelcome,
  encodeClassSelect,
  encodeClassStatus,
  encodeWallEvent,
  encodeXpEvent,
  MedalKind,
  PlayerFlag,
  RoundPhase,
  Team,
  PlayerClass,
  WallState,
  XpSource,
  SERVER_SNAPSHOT_RATE,
  ChatChannel,
  ChatNoticeCode,
  decodeClanState,
  decodeMedalState,
  decodeMedalUnlock,
  decodeBlockedIds,
  decodeSquadState,
  decodeSquadCommand,
  encodeClanState,
  encodeMedalState,
  encodeMedalUnlock,
  encodeBlockedIds,
  encodeSquadState,
  encodeSquadCommand,
  SquadOp,
  filterChatText,
  type EntityState,
  decodeHitEventDamage,
  encodeHitEventValue,
  hitEventIsHeadshot,
} from "../src";

describe("binary protocol", () => {
  it("round-trips control messages", () => {
    expect(decodeJoin(encodeJoin({ name: "Mehmed", preferredTeam: Team.Ottoman }))).toEqual({ name: "Mehmed", preferredTeam: Team.Ottoman, token: "" });
    expect(decodeJoin(encodeJoin({ name: "Mehmed", preferredTeam: Team.Ottoman, token: "abc.def" }))).toEqual({ name: "Mehmed", preferredTeam: Team.Ottoman, token: "abc.def" });
    expect(decodeEntityJoin(encodeEntityJoin({ entityId: 42, name: "Giovanni", team: Team.Byzantine, rank: 4, prestige: 2 }))).toEqual({
      entityId: 42,
      name: "Giovanni",
      team: Team.Byzantine,
      rank: 4,
      prestige: 2,
    });
    expect(decodeEntityJoin(encodeEntityJoin({ entityId: 43, name: "Mehmed", team: Team.Ottoman, tag: "SIPH", bot: true }))).toEqual({
      entityId: 43,
      name: "Mehmed",
      team: Team.Ottoman,
      rank: 1,
      prestige: 0,
      tag: "SIPH",
      bot: true,
    });
    expect(decodeEntityJoin(encodeEntityJoin({ entityId: 44, name: "Low tag", team: Team.Ottoman, tag: "ab3" }))).toEqual({
      entityId: 44,
      name: "Low tag",
      team: Team.Ottoman,
      rank: 1,
      prestige: 0,
      tag: "AB3",
    });
    expect(decodeEntityJoin(encodeEntityJoin({ entityId: 10042, name: "Ottoman Galley", team: Team.Ottoman, kind: EntityKind.Galley }))).toEqual({
      entityId: 10042,
      name: "Ottoman Galley",
      team: Team.Ottoman,
      rank: 1,
      prestige: 0,
      kind: EntityKind.Galley,
    });
    expect(decodeShipEvent(encodeShipEvent({ vehicleEntityId: 10042, eventType: ShipEventType.Sunk, occupantEntityId: 0 }))).toEqual({
      vehicleEntityId: 10042,
      eventType: ShipEventType.Sunk,
      occupantEntityId: 0,
    });
    expect(decodeEntityLeave(encodeEntityLeave(42))).toBe(42);
    const welcome = { entityId: 12, serverTick: 99, tickRate: 20, x: 1.5, y: 0.9, z: -3.25, team: Team.Ottoman, playerClass: PlayerClass.Sipahi, wallStateBits: 0x0000_0006 };
    const decodedWelcome = decodeWelcome(encodeWelcome(welcome));
    expect(decodedWelcome.entityId).toBe(welcome.entityId);
    expect(decodedWelcome.serverTick).toBe(welcome.serverTick);
    expect(decodedWelcome.tickRate).toBe(welcome.tickRate);
    expect(decodedWelcome.x).toBeCloseTo(welcome.x, 5);
    expect(decodedWelcome.y).toBeCloseTo(welcome.y, 5);
    expect(decodedWelcome.z).toBeCloseTo(welcome.z, 5);
    expect(decodedWelcome.team).toBe(welcome.team);
    expect(decodedWelcome.playerClass).toBe(PlayerClass.Sipahi);
    expect(decodedWelcome.wallStateBits).toBe(0x0000_0006);
    expect(decodeClassSelect(encodeClassSelect(PlayerClass.Sipahi))).toBe(PlayerClass.Sipahi);
    expect(decodeClassStatus(encodeClassStatus({ playerClass: PlayerClass.Topcu, accepted: false, reason: 1 }))).toEqual({ playerClass: PlayerClass.Topcu, accepted: false, reason: 1 });
    expect(decodeWallEvent(encodeWallEvent({ segmentId: 3, state: WallState.Breached, attackerEntityId: 8, hpFrac: 0 }))).toEqual({ segmentId: 3, state: WallState.Breached, attackerEntityId: 8, hpFrac: 0 });
  });

  it("rejects an oversized join token", () => {
    expect(() => decodeJoin(encodeJoin({ name: "N", token: "x".repeat(70) }))).not.toThrow();
    const token = "x".repeat(70);
    expect(() => encodeJoin({ name: "N", token })).not.toThrow();
    const encoded = encodeJoin({ name: "N", token: "t".repeat(64) });
    expect(decodeJoin(encoded).token).toBe("t".repeat(64));
  });

  it("round-trips the account message", () => {
    const account = {
      playerId: 77,
      token: "guest.abcd1234",
      name: "Mehmed",
      careers: [
        { xp: 1234, rank: 4, prestige: 1, headshots: 7 },
        { xp: 456, rank: 2, prestige: 0, headshots: 2 },
      ],
      warTallyOttoman: 12,
      warTallyByzantine: 9,
      lifetime: { wars: 5, wins: 2, kills: 40, deaths: 30, captures: 3, medals: 4 },
      contracts: [
        { kind: ContractKind.KillsAtGate, progress: 3, target: 5, reward: 200, completed: false },
        { kind: ContractKind.WarWin, progress: 0, target: 1, reward: 250, completed: false },
        { kind: ContractKind.DefenseKills, progress: 2, target: 2, reward: 200, completed: true },
      ],
      medals: [
        { kind: MedalKind.MostCaptures, count: 2 },
        { kind: MedalKind.BestMarksman, count: 1 },
        { kind: MedalKind.GateKeeper, count: 0 },
        { kind: MedalKind.VeteranPresence, count: 1 },
      ],
      claimed: true,
    };
    const decoded = decodeAccount(encodeAccount(account));
    expect(decoded).toEqual(account);
  });

  it("round-trips reliable chat and filters unsafe text", () => {
    expect(decodeChatSend(encodeChatSend({ channel: ChatChannel.Team, text: "Hold the gate" }))).toEqual({ channel: ChatChannel.Team, text: "Hold the gate" });
    const chat = { messageId: 9, playerId: 77, channel: ChatChannel.All, name: "Mehmed", text: "Advance", createdAt: 1_700_000_000_000 };
    expect(decodeChatMessage(encodeChatMessage(chat))).toEqual(chat);
    expect(decodeChatNotice(encodeChatNotice({ code: ChatNoticeCode.RateLimited, text: "Slow down" }))).toEqual({ code: ChatNoticeCode.RateLimited, text: "Slow down" });
    expect(decodeChatReport(encodeChatReport(9))).toBe(9);
    expect(filterChatText("<script>alert(1)</script> shit")).toBe("<script>alert(1)</script> ****");
  });

  it("round-trips progression event messages", () => {
    const xpEvent = {
      amount: 40,
      totalXp: 640,
      faction: Team.Ottoman,
      rank: 3,
      prestige: 0,
      leveled: true,
      prestiged: false,
      source: XpSource.Kill,
      headshot: true,
    };
    expect(decodeXpEvent(encodeXpEvent(xpEvent))).toEqual(xpEvent);
    const contractEvent = {
      slot: 1,
      kind: ContractKind.Assists,
      progress: 3,
      target: 3,
      reward: 150,
      completed: true,
    };
    expect(decodeContractEvent(encodeContractEvent(contractEvent))).toEqual(contractEvent);
    const warSummary = {
      winner: Team.Ottoman,
      warTallyOttoman: 13,
      warTallyByzantine: 9,
      kills: 5,
      deaths: 3,
      assists: 2,
      captures: 1,
      shots: 24,
      hits: 12,
      defenseKills: 2,
      captureSeconds: 44,
      warXpEarned: 875,
      welcomeBackBonus: 437,
      medalMask: (1 << (MedalKind.GateKeeper - 1)) | (1 << (MedalKind.VeteranPresence - 1)),
    };
    expect(decodeWarSummary(encodeWarSummary(warSummary))).toEqual(warSummary);
  });

  it("round-trips medal unlock, medal state, and clan state messages", () => {
    const unlock = { category: 1, tier: 2, name: "Nişancıbaşı" };
    expect(decodeMedalUnlock(encodeMedalUnlock(unlock))).toEqual(unlock);
    const medalState = {
      wars: 12,
      counters: Array.from({ length: 8 }, (_, index) => ({ category: index + 1, value: index * 37, tier: index % 4 })),
    };
    expect(decodeMedalState(encodeMedalState(medalState))).toEqual(medalState);
    const clanState = { clanId: 3, name: "Sipahi Hand", tag: "SIPH", founderPlayerId: 7, memberCount: 12, role: 1 };
    expect(decodeClanState(encodeClanState(clanState))).toEqual(clanState);
    // Phase 8c-7 social messages: blocked ids, squad state, squad commands.
    expect(decodeBlockedIds(encodeBlockedIds({ blockedIds: [3, 7, 12] }))).toEqual({ blockedIds: [3, 7, 12] });
    expect(decodeBlockedIds(encodeBlockedIds({ blockedIds: [] }))).toEqual({ blockedIds: [] });
    const squadState = { squadId: 9, memberEntityIds: [11, 22, 33] };
    expect(decodeSquadState(encodeSquadState(squadState))).toEqual(squadState);
    expect(decodeSquadCommand(encodeSquadCommand({ op: SquadOp.Invite, targetPlayerId: 44 }))).toEqual({ op: SquadOp.Invite, targetPlayerId: 44 });
  });

  it("round-trips quantized input", () => {
    const decoded = decodeInput(encodeInput({
      seq: 123,
      lastSnapshotTick: 98,
      buttons: InputButton.Forward | InputButton.Jump,
      yaw: 1.2,
      pitch: -0.3,
      dtMs: 50,
    }));
    expect(decoded.seq).toBe(123);
    expect(decoded.lastSnapshotTick).toBe(98);
    expect(decoded.buttons).toBe(InputButton.Forward | InputButton.Jump);
    expect(decoded.yaw).toBeCloseTo(1.2, 3);
    expect(decoded.pitch).toBeCloseTo(-0.3, 3);
    expect(decoded.dtMs).toBe(50);
  });

  it("rejects trailing bytes on every fixed-size client message", () => {
    const withTrailingByte = (buffer: ArrayBuffer): ArrayBuffer => {
      const expanded = new Uint8Array(buffer.byteLength + 1);
      expanded.set(new Uint8Array(buffer));
      return expanded.buffer;
    };
    expect(() => decodeInput(withTrailingByte(encodeInput({ seq: 1, lastSnapshotTick: 0, buttons: 0, yaw: 0, pitch: 0, dtMs: 50 })))).toThrow(/trailing/);
    expect(() => decodeJoin(withTrailingByte(encodeJoin({ name: "N" })))).toThrow(/trailing/);
    expect(() => decodeClassSelect(withTrailingByte(encodeClassSelect(PlayerClass.Janissary)))).toThrow(/trailing/);
    expect(() => decodeChatReport(withTrailingByte(encodeChatReport(1)))).toThrow(/trailing/);
    // Phase 8e-4b: SquadCommand is fixed-size (7 payload bytes); overlong
    // frames must be rejected like every other fixed-size client message
    // (audit finding MED-2 — the decoder previously used a minimum-length
    // check and silently accepted trailing garbage).
    expect(() => decodeSquadCommand(withTrailingByte(encodeSquadCommand({ op: SquadOp.Invite, targetPlayerId: 44 })))).toThrow(/trailing/);
  });

  it("round-trips the ship snapshot field", () => {
    const entities = new Map<number, EntityState>([
      [10042, { entityId: 10042, x: 12, y: 0, z: -8, yaw: 0.5, pitch: 0, shipKind: EntityKind.Galley, shipHullHp: 930, shipState: 0x26 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    const ship = decoded.entities.get(10042);
    expect(ship?.shipKind).toBe(EntityKind.Galley);
    expect(ship?.shipHullHp).toBe(930);
    expect(ship?.shipState).toBe(0x26);
    const baseline = decodeSnapshot(encodeSnapshot(11, 5, entities, 0));
    const second = new Map<number, EntityState>([
      [10042, { entityId: 10042, x: 12, y: 0, z: -8, yaw: 0.5, pitch: 0, shipKind: EntityKind.Galley, shipHullHp: 900, shipState: 0x22 }],
    ]);
    const delta = decodeSnapshot(encodeSnapshot(12, 6, second, 11, baseline.entities), baseline);
    expect(delta.entities.get(10042)?.shipHullHp).toBe(900);
    expect(delta.entities.get(10042)?.shipState).toBe(0x22);
  });

  it("round-trips traversed cannon aim without widening ordinary ship records", () => {
    const entities = new Map<number, EntityState>([
      [30000, { entityId: 30000, x: 2, y: 0, z: 3, yaw: 0.2, pitch: 0, shipKind: EntityKind.SiegeCannon, shipHullHp: 400, shipState: 0x0a, cannonGunYaw: 0.72, cannonGunPitch: 0.48 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 0, entities, 0));
    expect(decoded.entities.get(30000)?.cannonGunYaw).toBeCloseTo(0.72, 3);
    expect(decoded.entities.get(30000)?.cannonGunPitch).toBeCloseTo(0.48, 3);
  });

  it("round-trips both authoritative galley gun bearings through full and AOI snapshots", () => {
    const entities = new Map<number, {
      entityId: number;
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      shipKind: EntityKind;
      shipHullHp: number;
      shipState: number;
      shipGun1Yaw: number;
      shipGun2Yaw: number;
    }>([
      [10042, {
        entityId: 10042,
        x: 12,
        y: 0,
        z: -8,
        yaw: 0.5,
        pitch: 0,
        shipKind: EntityKind.Galley,
        shipHullHp: 930,
        shipState: 0x26,
        shipGun1Yaw: 0.72,
        shipGun2Yaw: -0.48,
      }],
    ]);
    const full = decodeSnapshot(encodeSnapshot(13, 5, entities, 0));
    expect(full.entities.get(10042)?.shipGun1Yaw).toBeCloseTo(0.72, 3);
    expect(full.entities.get(10042)?.shipGun2Yaw).toBeCloseTo(-0.48, 3);

    const buffer = new ArrayBuffer(16 * 1024);
    const byteLength = encodeInterestSnapshotInto(buffer, 14, 6, entities, new Set([10042]), 0, undefined, undefined);
    const aoi = decodeSnapshot(buffer.slice(0, byteLength));
    expect(aoi.entities.get(10042)?.shipGun1Yaw).toBeCloseTo(0.72, 3);
    expect(aoi.entities.get(10042)?.shipGun2Yaw).toBeCloseTo(-0.48, 3);
  });

  it("reconstructs a delta snapshot against its acknowledged baseline", () => {
    const first = new Map<number, EntityState>([
      [1, { entityId: 1, x: 1, y: 0.9, z: 2, yaw: 0, pitch: 0 }],
      [2, { entityId: 2, x: 5, y: 0.9, z: 6, yaw: 0.2, pitch: 0.1 }],
    ]);
    const decodedFirst = decodeSnapshot(encodeSnapshot(10, 5, first, 0));
    const second = new Map<number, EntityState>([
      [1, { entityId: 1, x: 1.25, y: 0.9, z: 2, yaw: 0.4, pitch: 0 }],
      [3, { entityId: 3, x: -2, y: 0.9, z: 8, yaw: -0.5, pitch: 0.25 }],
    ]);
    const decodedSecond = decodeSnapshot(encodeSnapshot(11, 6, second, 10, first), decodedFirst);
    expect(decodedSecond.baseTick).toBe(10);
    expect(decodedSecond.entities.has(2)).toBe(false);
    expect(decodedSecond.entities.get(1)?.x).toBeCloseTo(1.3, 1);
    expect(decodedSecond.entities.get(1)?.z).toBe(2);
    expect(decodedSecond.entities.get(3)?.pitch).toBeCloseTo(0.25, 3);
  });

  it("keeps a 100-player full moving snapshot within the bandwidth budget", () => {
    const entities = new Map<number, EntityState>();
    for (let id = 1; id <= 100; id += 1) {
      entities.set(id, { entityId: id, x: id, y: 0.9, z: -id, yaw: id / 100, pitch: 0 });
    }
    const bytes = encodeSnapshot(1, 0, entities, 0).byteLength;
    // Protocol v12 widened the Gameplay flags field to u16 (+1 byte per full
    // record), so the synthetic worst-case ceiling moves up with it; the
    // production budget (<30 KB/s/client, ADR 0005) is unchanged.
    expect(bytes * SERVER_SNAPSHOT_RATE).toBeLessThan(32 * 1024);
  });

  it("writes snapshots into a reusable transport buffer", () => {
    const entities = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1 }],
    ]);
    const transportBuffer = new ArrayBuffer(16 * 1024);
    const byteLength = encodeSnapshotInto(transportBuffer, 44, 9, entities, 0);
    const decoded = decodeSnapshot(transportBuffer.slice(0, byteLength));
    expect(decoded.tick).toBe(44);
    expect(decoded.ackInputSeq).toBe(9);
    expect(decoded.entities.get(7)?.x).toBe(12);
  });

  it("encodes AOI enter and leave deltas from shared world-state maps", () => {
    const baselineStates = new Map<number, EntityState>([
      [1, { entityId: 1, x: 0, y: 0.9, z: 0, yaw: 0, pitch: 0 }],
      [2, { entityId: 2, x: 2, y: 0.9, z: 0, yaw: 0, pitch: 0 }],
    ]);
    const baseline = decodeSnapshot(encodeSnapshot(10, 0, baselineStates, 0));
    const currentStates = new Map<number, EntityState>([
      [1, { entityId: 1, x: 1, y: 0.9, z: 0, yaw: 0, pitch: 0 }],
      [3, { entityId: 3, x: 3, y: 0.9, z: 0, yaw: 0, pitch: 0 }],
    ]);
    const buffer = new ArrayBuffer(16 * 1024);
    const byteLength = encodeInterestSnapshotInto(
      buffer,
      12,
      5,
      currentStates,
      new Set([1, 3]),
      10,
      baselineStates,
      new Set([1, 2]),
    );
    const decoded = decodeSnapshot(buffer.slice(0, byteLength), baseline);
    expect(decoded.entities.get(1)?.x).toBe(1);
    expect(decoded.entities.has(2)).toBe(false);
    expect(decoded.entities.get(3)?.x).toBe(3);
  });
});

describe("Phase 8c-4 wire additions", () => {
  it("round-trips the torch bit and the earthwork subkind in the portable field", () => {
    const entities = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, torch: 1 }],
      [20042, { entityId: 20042, x: 30, y: 0.75, z: 40, yaw: 0, pitch: 0, earthworkKind: 1 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    expect(decoded.entities.get(7)?.torch).toBe(1);
    expect(decoded.entities.get(20042)?.earthworkKind).toBe(1);
    // Torch-off players stay on the old record size: no portable byte emitted.
    const plain = new Map<number, EntityState>([
      [1, { entityId: 1, x: 1, y: 0.9, z: 2, yaw: 0.4, pitch: 0 }],
    ]);
    const plainDecoded = decodeSnapshot(encodeSnapshot(11, 0, plain, 0));
    expect(plainDecoded.entities.get(1)?.torch).toBe(0);
  });

  it("round-trips the torch toggle across a delta baseline", () => {
    const entities = new Map<number, EntityState>([
      [3, { entityId: 3, x: 1, y: 0.9, z: 1, yaw: 0, pitch: 0, torch: 1 }],
    ]);
    const baseline = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    const off = new Map<number, EntityState>([
      [3, { entityId: 3, x: 1, y: 0.9, z: 1, yaw: 0, pitch: 0, torch: 0 }],
    ]);
    const delta = decodeSnapshot(encodeSnapshot(11, 6, off, 10, baseline.entities), baseline);
    expect(delta.entities.get(3)?.torch).toBe(0);
  });

  it("round-trips seven capture points in the snapshot metadata", () => {
    const entities = new Map<number, EntityState>();
    const points = Array.from({ length: 7 }, (_, index) => ({ owner: (index % 3) as Team, progress: index * 10 }));
    const meta: SnapshotMeta = {
      captureOwner: Team.None,
      captureProgress: 0,
      ottomanTickets: 2400,
      byzantineTickets: 2400,
      roundPhase: RoundPhase.Active,
      phaseRemainingTicks: 100,
      events: [],
      points,
    };
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0, undefined, meta));
    expect(decoded.meta.points).toHaveLength(7);
    expect(decoded.meta.points?.[5]?.owner).toBe(Team.Byzantine);
    expect(decoded.meta.points?.[5]?.progress).toBe(50);
  });

  it("round-trips the torch bit and earthwork subkind through the interest (AOI) encoder", () => {
    // Regression: encodeInterestSnapshotInto used to drop SnapshotField.Torch entirely,
    // so remote torch state and earthwork subkinds never reached AOI-scoped clients.
    const currentStates = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, torch: 1 }],
      [20042, { entityId: 20042, x: 30, y: 0.75, z: 40, yaw: 0, pitch: 0, earthworkKind: 1 }],
      [8, { entityId: 8, x: 1, y: 0.9, z: 1, yaw: 0, pitch: 0 }],
    ]);
    const buffer = new ArrayBuffer(16 * 1024);
    const byteLength = encodeInterestSnapshotInto(
      buffer,
      12,
      5,
      currentStates,
      new Set([7, 20042, 8]),
      0,
      undefined,
      undefined,
    );
    const decoded = decodeSnapshot(buffer.slice(0, byteLength));
    expect(decoded.entities.get(7)?.torch).toBe(1);
    expect(decoded.entities.get(20042)?.earthworkKind).toBe(1);
    expect(decoded.entities.get(8)?.torch).toBe(0);
  });
});

describe("Phase 8c-4c spawn selection", () => {
  it("round-trips only the authoritative spawn point index", () => {
    expect(decodeSpawnSelect(encodeSpawnSelect(6))).toBe(6);
    expect(decodeSpawnSelect(encodeSpawnSelect(0xff))).toBe(0xff);
    const withTrailingByte = new Uint8Array(encodeSpawnSelect(2).byteLength + 1);
    withTrailingByte.set(new Uint8Array(encodeSpawnSelect(2)));
    expect(() => decodeSpawnSelect(withTrailingByte.buffer)).toThrow("Message has trailing bytes");
  });
});

describe("Phase 8e-13 deploy request (protocol v15)", () => {
  it("round-trips an empty payload and rejects trailing/garbage bytes", () => {
    expect(() => decodeDeploy(encodeDeploy())).not.toThrow();
    const withTrailingByte = new Uint8Array(encodeDeploy().byteLength + 1);
    withTrailingByte.set(new Uint8Array(encodeDeploy()));
    expect(() => decodeDeploy(withTrailingByte.buffer)).toThrow("Message has trailing bytes");
    expect(() => decodeDeploy(new ArrayBuffer(1))).toThrow("Message is truncated");
    const wrongType = new Uint8Array(encodeDeploy());
    wrongType[1] = 24; // MessageType.SpawnSelect — const enums are not imported into tests
    expect(() => decodeDeploy(wrongType.buffer)).toThrow("Unexpected message type");
  });
});

describe("Siege-loop wire additions (protocol v12)", () => {
  it("round-trips gameplay flags wider than one byte through the snapshot encoder", () => {
    const flags = PlayerFlag.Alive | PlayerFlag.PushingCannon;
    expect(flags).toBeGreaterThan(255);
    const entities = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, flags, team: Team.Ottoman, health: 100 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    expect(decoded.entities.get(7)?.flags).toBe(flags);
    // And across a delta baseline once the flag clears again.
    const pushing = decodeSnapshot(encodeSnapshot(11, 5, entities, 0));
    const walking = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, flags: PlayerFlag.Alive, team: Team.Ottoman, health: 100 }],
    ]);
    const delta = decodeSnapshot(encodeSnapshot(12, 6, walking, 11, pushing.entities), pushing);
    expect(delta.entities.get(7)?.flags).toBe(PlayerFlag.Alive);
  });

  it("round-trips gameplay flags wider than one byte through the interest (AOI) encoder", () => {
    const flags = PlayerFlag.Alive | PlayerFlag.PushingCannon;
    const currentStates = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, flags, team: Team.Ottoman, health: 100 }],
    ]);
    const buffer = new ArrayBuffer(16 * 1024);
    const byteLength = encodeInterestSnapshotInto(
      buffer,
      12,
      5,
      currentStates,
      new Set([7]),
      0,
      undefined,
      undefined,
    );
    const decoded = decodeSnapshot(buffer.slice(0, byteLength));
    expect(decoded.entities.get(7)?.flags).toBe(flags);
  });

  it("round-trips the WallEvent hpFrac byte", () => {
    const damaged = { segmentId: 5, state: WallState.Damaged, attackerEntityId: 42, hpFrac: 9 };
    expect(decodeWallEvent(encodeWallEvent(damaged))).toEqual(damaged);
    const full = { segmentId: 0, state: WallState.Intact, attackerEntityId: 0, hpFrac: 16 };
    expect(decodeWallEvent(encodeWallEvent(full))).toEqual(full);
  });

  it("round-trips the Welcome per-segment hpFrac tail", () => {
    const wallHpFrac = [16, 15, 12, 8, 4, 0, 16, 16, 11, 7, 3, 16];
    const welcome = {
      entityId: 12,
      serverTick: 99,
      tickRate: 20,
      x: 1.5,
      y: 0.9,
      z: -3.25,
      team: Team.Ottoman,
      playerClass: PlayerClass.Sipahi,
      wallStateBits: 0x0000_0006,
      wallHpFrac,
    };
    const decoded = decodeWelcome(encodeWelcome(welcome));
    expect(decoded.wallStateBits).toBe(0x0000_0006);
    expect(decoded.wallHpFrac).toEqual(wallHpFrac);
    // Without the field every segment decodes as full HP (16/16).
    const defaulted = decodeWelcome(encodeWelcome({ entityId: 1, serverTick: 0, tickRate: 20, x: 0, y: 0, z: 0 }));
    expect(defaulted.wallHpFrac).toEqual(Array.from({ length: 12 }, () => 16));
  });
});

describe("Phase 8e-3 weapon slots (protocol v13)", () => {
  it("round-trips slot buttons in the input message's high u16", () => {
    const decoded = decodeInput(encodeInput({
      seq: 7,
      lastSnapshotTick: 3,
      buttons: InputButton.Fire | InputButton.Slot1 | InputButton.Slot3,
      yaw: 0,
      pitch: 0,
      dtMs: 50,
    }));
    expect(decoded.buttons & InputButton.Fire).toBe(InputButton.Fire);
    expect(decoded.buttons & InputButton.Slot1).toBe(InputButton.Slot1);
    expect(decoded.buttons & InputButton.Slot3).toBe(InputButton.Slot3);
    expect(decoded.buttons).toBe(InputButton.Fire | InputButton.Slot1 | InputButton.Slot3);
  });

  it("round-trips the weapon-slot byte in the gameplay block", () => {
    const entities = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, weaponSlot: 3, weaponSwitchTicks: 12 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    expect(decoded.entities.get(7)?.weaponSlot).toBe(3);
    expect(decoded.entities.get(7)?.weaponSwitchTicks).toBe(12);
  });

  it("forces a full record when the weapon slot changes across a delta baseline", () => {
    const before = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, weaponSlot: 2, weaponSwitchTicks: 0 }],
    ]);
    const baseline = decodeSnapshot(encodeSnapshot(10, 5, before, 0));
    const after = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1, weaponSlot: 1, weaponSwitchTicks: 0 }],
    ]);
    const delta = decodeSnapshot(encodeSnapshot(11, 6, after, 10, baseline.entities), baseline);
    expect(delta.entities.get(7)?.weaponSlot).toBe(1);
  });

  it("decodes a missing weapon-slot byte as the default slot with no draw timer", () => {
    const entities = new Map<number, EntityState>([
      [7, { entityId: 7, x: 12, y: 0.9, z: -8, yaw: 0.5, pitch: -0.1 }],
    ]);
    const decoded = decodeSnapshot(encodeSnapshot(10, 5, entities, 0));
    expect(decoded.entities.get(7)?.weaponSlot).toBe(2);
    expect(decoded.entities.get(7)?.weaponSwitchTicks).toBe(0);
  });
});

describe("Phase 8e-7 aim down sights (protocol v14)", () => {
  it("round-trips the Aim bit in the input message's low u16", () => {
    const decoded = decodeInput(encodeInput({
      seq: 9,
      lastSnapshotTick: 4,
      buttons: InputButton.Aim | InputButton.Fire,
      yaw: 0,
      pitch: 0,
      dtMs: 50,
    }));
    expect(decoded.buttons).toBe(InputButton.Aim | InputButton.Fire);
  });

  it("round-trips Aim combined with the high-word slot bits across both u16 halves", () => {
    const buttons = InputButton.Aim | InputButton.Forward | InputButton.Slot2 | InputButton.Slot3;
    const decoded = decodeInput(encodeInput({ seq: 10, lastSnapshotTick: 4, buttons, yaw: 0, pitch: 0, dtMs: 50 }));
    expect(decoded.buttons).toBe(buttons);
  });

  it("the Aim bit sits inside the accepted input mask", () => {
    expect(InputButton.Aim & VALID_INPUT_BUTTON_MASK).toBe(InputButton.Aim);
  });
});

describe("Phase 8e-22 combat marker encoding", () => {
  it("keeps hit damage readable while reserving the high bit for headshots", () => {
    const body = encodeHitEventValue(60, false);
    const head = encodeHitEventValue(99, true);
    expect(body).toBe(60);
    expect(hitEventIsHeadshot(body)).toBe(false);
    expect(decodeHitEventDamage(body)).toBe(60);
    expect(hitEventIsHeadshot(head)).toBe(true);
    expect(decodeHitEventDamage(head)).toBe(99);
  });
});

describe("Phase 8e-25 hostile framing and snapshot capacity", () => {
  it("rejects a join whose token-length byte exceeds the frame instead of throwing RangeError", () => {
    // A 4-byte frame with a length byte of 5 used to construct an
    // out-of-bounds Uint8Array view → RangeError (misclassified as a server
    // error and echoed to the client) rather than the contract ProtocolError.
    const frame = new ArrayBuffer(4);
    const view = new Uint8Array(frame);
    view[0] = 16; // PROTOCOL_VERSION — const enum members are erased, tests use literals
    view[1] = 1; // MessageType.Join
    view[2] = 5; // claims a 5-byte token in a 1-byte token field
    expect(() => decodeJoin(frame)).toThrow(ProtocolError);
  });

  it("fits the worst-case near-capacity snapshot delta in the server's template buffer", () => {
    // The server's SNAPSHOT_BUFFER_BYTES (48 KiB) must cover the theoretical
    // maximum interest set: 150 AOI players + 4 galleys + 68 siege cannons +
    // 64 horses + 60 earthworks, doubled for the acked baseline, plus the
    // 32-event meta cap. The old 16 KiB buffer threw ProtocolError inside
    // the tick loop at this size — an uncaught process crash.
    const worstCaseEntities = 150 + 4 + 68 + 64 + 60;
    const worstCaseBytes = snapshotDeltaBytes(worstCaseEntities, worstCaseEntities, 32);
    expect(worstCaseBytes).toBeLessThanOrEqual(48 * 1_024);

    const buffer = new ArrayBuffer(48 * 1_024);
    const current = new Map<number, EntityState>();
    for (let id = 1; id <= worstCaseEntities; id += 1) {
      current.set(id, { entityId: id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
    }
    const baseline = new Map<number, EntityState>(current);
    const meta: SnapshotMeta = {
      captureOwner: 0,
      captureProgress: 0,
      ottomanTickets: 1000,
      byzantineTickets: 1000,
      roundPhase: 1,
      phaseRemainingTicks: 0,
      events: Array.from({ length: 32 }, (_, index) => ({ id: index, type: 1, sourceEntityId: 1, targetEntityId: 2, value: 0 })),
    };
    expect(() => encodeInterestSnapshotInto(buffer, 1, 0, current, new Set(current.keys()), 0, baseline, new Set(baseline.keys()), meta)).not.toThrow();
  });
});
