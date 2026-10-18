import { createHash } from "node:crypto";
import uWS, { type HttpRequest, type HttpResponse, type WebSocket } from "uWebSockets.js";
import {
  AOI_ENTER_RADIUS,
  AOI_EXIT_RADIUS,
  AOI_MAX_ENTITIES,
  DEFAULT_SERVER_PORT,
  EARTHWORK_MAX,
  EntityKind,
  FIXED_DT_MS,
  MAX_CONNECTIONS_PER_IP,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS,
  MAX_SIEGE_CANNONS,
  MAX_HORSES,
  MAX_VEHICLES,
  RoundPhase,
  SERVER_TICK_RATE,
  SNAPSHOT_TICK_DIVISOR,
  Team,
  VALID_INPUT_BUTTON_MASK,
  PlayerClass,
  XpSource,
  advanceCareer,
  medalDisplayName,
  MessageType,
  ProtocolError,
  ChatChannel,
  ChatNoticeCode,
  decodeChatReport,
  decodeChatSend,
  decodeInput,
  decodeJoin,
  decodePing,
  decodeClassSelect,
  decodeSpawnSelect,
  decodeDeploy,
  decodeSquadCommand,
  encodeAccount,
  encodeBlockedIds,
  encodeChatMessage,
  encodeChatNotice,
  encodeClanState,
  encodeContractEvent,
  encodeEntityJoin,
  encodeEntityLeave,
  encodeClassStatus,
  encodeMedalState,
  encodeMedalUnlock,
  encodeShipEvent,
  encodeSquadState,
  encodeWallEvent,
  encodePing,
  encodeInterestSnapshotInto,
  encodeWarSummary,
  encodeWelcome,
  encodeXpEvent,
  readMessageType,
  XP_EVENT_FLAG_HEADSHOT,
  getBotBehaviorMode,
  isBotCombatFrozen,
  setBotBehaviorMode,
  setBotCombatFrozen,
  type EntityState,
  type WarSummaryMessage,
  type MedalTier,
} from "@janissary/shared";
import { TickStats, type ReplicationDurations } from "./stats";
import {
  addPlayer,
  createWorldState,
  drainMedalCounters,
  drainShipEvents,
  enqueueInput,
  removePlayer,
  snapshotMeta,
  stepWorld,
  wallHpFractions,
  writeCannonEntityStateAt,
  writeHorseEntityStateAt,
  writeEarthworkEntityStateAt,
  writeEntityStateAt,
  writeVehicleEntityStateAt,
  drainWallEvents,
  packedWallStates,
  requestClass,
  requestSpawnPoint,
  requestDeploy,
  resetRoundForPlaytest,
} from "./sim/world";
import { isVehicleEntityId, vehicleEntityId, vehicleIndexForEntityId } from "./sim/vehicle";
import { cannonEntityId, cannonIndexForEntityId, isCannonEntityId } from "./sim/cannon";
import { horseEntityId, horseIndexForEntityId, isHorseEntityId } from "./sim/horse";
import { earthworkEntityId, earthworkIndexForEntityId, isEarthworkEntityId } from "./sim/earthwork";
import { querySpatialHashInto } from "./sim/spatialHash";
import { assertSecureTokenSecret, issueGuestToken, isDefaultDevSecret, verifyGameToken } from "./token";
import { ProgressionService, type AccountState, type PerSlotWarStats } from "./progression";
import { ClanService, clanRoleCode } from "./clans";
import { SocialService, type FriendView } from "./social";
import { SquadManager } from "./squads";
import { SquadOp } from "@janissary/shared";
import { BotBackfill, defaultBackfillConfig } from "./bots/backfill";
import { parseBotCount, parseBotFreeze, parseBotMode, parsePlaytestReset } from "./bots/admin";
import { SqliteStorage } from "./storage/sqlite";
import { AuthError, AuthService, SupabaseAuthProvider } from "./auth";
import { ChatService } from "./chat";
import { BoundedRateLimiter, allowedCorsOrigin, assertSecureMetricsToken, bearerMatches, boundedInteger, clientIp, isLoopbackHttpOrigin, isSameHostHttpOrigin } from "./security";

const SERVER_BASELINE_HISTORY = 6;
// Phase 8e-25: worst-case interest = 150 AOI players + 4 galleys + 68 siege
// cannons + 64 horses + 60 earthworks; a full delta (current + baseline, 38
// bytes/entity, 32 events) is 31 + 692*38 + 256 = 26.6 KB. 48 KB keeps the
// near-capacity world inside the buffer and leaves headroom for future
// entity kinds (the old 16 KB buffer threw ProtocolError inside the tick
// loop — an uncaught crash at ~1,000 CCU).
const SNAPSHOT_BUFFER_BYTES = 48 * 1_024;
const DEFAULT_JOIN_BATCH_PER_TICK = 60;
const DEFAULT_MAX_PENDING_JOINS = MAX_PLAYERS;
const DEFAULT_MAX_CONNECTIONS = MAX_PLAYERS + 200;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const LEADERBOARD_REQUESTS_PER_MINUTE = 30;
const MAX_XP_EVENTS_PER_TICK = 128;
const TEMPLATE_LOOKUP_CAPACITY = 256;

interface ClientData {
  ip: string;
  connected: boolean;
  joined: boolean;
  joinQueued: boolean;
  entityId: number;
  playerId: number;
  messageWindowStartedAt: number;
  messageCount: number;
  ackedSnapshotTick: number;
  interestHistoryTick: Uint32Array;
  interestHistorySet: (ReadonlySet<number> | undefined)[];
  interestHistoryHash: Uint32Array;
  interestHistoryHash2: Uint32Array;
  interestGroup: number;
  interestHash: number;
  interestHash2: number;
  interestShard: number;
  interest: Set<number>;
  nextInterest: Set<number>;
  interestRemovals: Set<number>;
  interestCandidates: number[];
}

interface QueuedJoin {
  readonly socket: ClientSocket;
  readonly buffer: ArrayBuffer;
}

interface SnapshotTemplate {
  interestGroup: number;
  currentHash: number;
  currentHash2: number;
  baselineHash: number;
  baselineHash2: number;
  currentIds: ReadonlySet<number>;
  baselineIds: ReadonlySet<number> | undefined;
  baseTick: number;
  readonly buffer: ArrayBuffer;
  readonly dataView: DataView;
  readonly views: Map<number, Uint8Array>;
  view: Uint8Array;
}

interface WarEndSlot {
  readonly entityId: number;
  readonly team: Team;
  readonly kills: number;
  readonly deaths: number;
  readonly headshots: number;
  readonly assists: number;
  readonly captures: number;
  readonly defenseKills: number;
  readonly shots: number;
  readonly hits: number;
  readonly captureTicks: number;
  readonly warXp: number;
  readonly medalMask: number;
}

interface WarEndData {
  readonly winner: Team;
  readonly slots: readonly WarEndSlot[];
}

type ClientSocket = WebSocket<ClientData>;

const port = boundedInteger(process.env.PORT, DEFAULT_SERVER_PORT, 1, 65_535, "PORT");
const configuredConnectionLimit = boundedInteger(process.env.MAX_CONNECTIONS_PER_IP, MAX_CONNECTIONS_PER_IP, 1, 10_000, "MAX_CONNECTIONS_PER_IP");
const loopbackConnectionLimit = boundedInteger(process.env.MAX_LOOPBACK_CONNECTIONS_PER_IP, 2_000, 1, 10_000, "MAX_LOOPBACK_CONNECTIONS_PER_IP");
const configuredMessageLimit = boundedInteger(process.env.MAX_MESSAGES_PER_SECOND, MAX_MESSAGES_PER_SECOND, 1, 10_000, "MAX_MESSAGES_PER_SECOND");
const maxConnections = boundedInteger(process.env.MAX_CONNECTIONS, DEFAULT_MAX_CONNECTIONS, 1, 10_000, "MAX_CONNECTIONS");
const joinBatchPerTick = boundedInteger(process.env.JOIN_BATCH_PER_TICK, DEFAULT_JOIN_BATCH_PER_TICK, 1, MAX_PLAYERS, "JOIN_BATCH_PER_TICK");
const maxPendingJoins = boundedInteger(process.env.MAX_PENDING_JOINS, DEFAULT_MAX_PENDING_JOINS, 1, MAX_PLAYERS, "MAX_PENDING_JOINS");
const flushIntervalMs = boundedInteger(process.env.FLUSH_INTERVAL_MS, DEFAULT_FLUSH_INTERVAL_MS, 100, 60_000, "FLUSH_INTERVAL_MS");
const databasePath = process.env.DB_PATH ?? "./data/janissary.db";
const trustProxy = process.env.TRUST_PROXY === "1";
const metricsToken = process.env.METRICS_TOKEN?.trim() || undefined;
const configuredCorsOrigins = new Set(
  (process.env.PUBLIC_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin !== ""),
);
// Phase 8e-19 Task 1: dev playtest-control (/dev/bots*). The brief demands a
// hard 404 in production unless explicitly enabled — the same stance as the
// /metrics secret gate (ADR 0011): an operator can force it on a staging box
// with DEV_BOT_ADMIN=1, and it is otherwise dev-only.
const devAdminEnabled = process.env.NODE_ENV !== "production" || process.env.DEV_BOT_ADMIN === "1";
if (devAdminEnabled && process.env.NODE_ENV === "production") {
  // Phase 8e-25: explicit staging opt-in must be loud — with the flag on,
  // /dev/bots* (round reset, freeze, bot count) is unauthenticated except for
  // CORS + rate limits, and a plain HTTP client skips CORS entirely.
  console.log(JSON.stringify({ event: "warning", message: "DEV_BOT_ADMIN=1 on a production build — /dev/bots* endpoints are unauthenticated writes; remove the flag after staging" }));
}

function requireDevAdmin(response: HttpResponse): boolean {
  if (devAdminEnabled) return true;
  response.writeStatus("404 Not Found").end();
  return false;
}

assertSecureTokenSecret();
assertSecureMetricsToken(process.env.NODE_ENV, metricsToken);
if (isDefaultDevSecret()) {
  console.log(JSON.stringify({ event: "warning", message: "TOKEN_SECRET is unset; guest tokens are signed with the development secret" }));
}

const world = createWorldState();
const clients = new Set<ClientSocket>();
const socketByEntityId = new Map<number, ClientSocket>();
const socketByPlayerId = new Map<number, ClientSocket>();
const connectionCountByIp = new Map<string, number>();
const pendingJoins: QueuedJoin[] = [];
const rankBySlot = new Uint8Array(MAX_PLAYERS).fill(1);
const prestigeBySlot = new Uint8Array(MAX_PLAYERS);
const stats = new TickStats();
const storage = new SqliteStorage(databasePath);
const progression = new ProgressionService(storage);
const chat = new ChatService(storage);
const clans = new ClanService(storage, (playerId) => progression.getAccount(playerId)?.name);
const social = new SocialService(storage, (playerId) => progression.getAccount(playerId)?.name);
const squads = new SquadManager(
  (firstId, secondId) => social.areFriends(firstId, secondId),
  (playerId) => {
    const socket = socketByPlayerId.get(playerId);
    return socket !== undefined && socket.getUserData().joined;
  },
);
const backfill = new BotBackfill(world, defaultBackfillConfig());
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") || undefined;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim() || undefined;
const auth = supabaseUrl === undefined || supabaseAnonKey === undefined
  ? undefined
  : new AuthService(storage, progression, new SupabaseAuthProvider(supabaseUrl, supabaseAnonKey), process.env.AUTH_REDIRECT_URL?.trim() || "http://localhost:5173/");
const globalStateRing = Array.from({ length: SERVER_BASELINE_HISTORY }, () => new Map<number, EntityState>());
const globalStateRingTick = new Uint32Array(SERVER_BASELINE_HISTORY);
const emptyInterest = new Set<number>();
function createSnapshotTemplate(): SnapshotTemplate {
  const buffer = new ArrayBuffer(SNAPSHOT_BUFFER_BYTES);
  return {
    interestGroup: -1,
    currentHash: 0,
    currentHash2: 0,
    baselineHash: 0,
    baselineHash2: 0,
    currentIds: emptyInterest,
    baselineIds: undefined,
    baseTick: 0,
    buffer,
    dataView: new DataView(buffer),
    views: new Map<number, Uint8Array>(),
    view: new Uint8Array(buffer, 0, 0),
  };
}
const snapshotTemplatePool: SnapshotTemplate[] = Array.from({ length: 256 }, () => createSnapshotTemplate());
/**
 * Scratch template for clients whose (interest set, baseline, baseTick) combo
 * does not fit the 256-entry cache in one tick. Encoding is identical — only
 * the sharing is lost — so a full cache must never kill the tick loop (Phase
 * 8c-9: a 1,000-bot join burst crashed the server here; see ADR 0026).
 */
const overflowTemplate: SnapshotTemplate = createSnapshotTemplate();
/** Sentinel from findTemplate when every lookup bucket is occupied this tick. */
const TEMPLATE_LOOKUP_FULL = -2_000_000_000;
const templateLookupEpochs = new Uint32Array(TEMPLATE_LOOKUP_CAPACITY);
const templateLookupIndices = new Uint16Array(TEMPLATE_LOOKUP_CAPACITY);
let templateLookupEpoch = 1;
const httpRateLimits = new BoundedRateLimiter();
let pendingJoinHead = 0;
let bytesSentSinceReport = 0;
let serverErrors = 0;
let protocolRejects = 0;
let replicationTemplateCount = 0;
let replicationOverflowCount = 0;
let lastRoundPhase = RoundPhase.Active;
let progressionDrainScheduled = false;

const INTEREST_RETENTION_SHARDS = 4;

function entityInterestHash(entityId: number): number {
  let value = Math.imul(entityId ^ (entityId >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function entityInterestHash2(entityId: number): number {
  let value = Math.imul(entityId ^ 0x9e3779b9, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function hashInterest(ids: ReadonlySet<number>): number {
  let hash = 0;
  for (const entityId of ids) hash ^= entityInterestHash(entityId);
  return hash >>> 0;
}

function hashInterest2(ids: ReadonlySet<number>): number {
  let hash = 0;
  for (const entityId of ids) hash ^= entityInterestHash2(entityId);
  return hash >>> 0;
}

function templateLookupBucket(interestGroup: number, currentHash: number, currentHash2: number, baselineHash: number, baselineHash2: number, baseTick: number): number {
  let hash = currentHash ^ Math.imul(currentHash2, 0x27d4eb2d) ^ Math.imul(baselineHash, 0x9e3779b1)
    ^ Math.imul(baselineHash2, 0x165667b1) ^ Math.imul(baseTick, 0x85ebca6b) ^ interestGroup;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  return (hash ^ (hash >>> 15)) & (TEMPLATE_LOOKUP_CAPACITY - 1);
}

function findTemplate(
  interestGroup: number,
  currentHash: number,
  currentHash2: number,
  baselineHash: number,
  baselineHash2: number,
  baseTick: number,
  currentIds: ReadonlySet<number>,
  baselineIds: ReadonlySet<number> | undefined,
): number {
  let bucket = templateLookupBucket(interestGroup, currentHash, currentHash2, baselineHash, baselineHash2, baseTick);
  for (let probes = 0; probes < TEMPLATE_LOOKUP_CAPACITY; probes += 1) {
    if (templateLookupEpochs[bucket] !== templateLookupEpoch) return ~bucket;
    const templateIndex = templateLookupIndices[bucket] ?? 0;
    const candidate = snapshotTemplatePool[templateIndex];
    if (candidate !== undefined
      && candidate.interestGroup === interestGroup
      && candidate.currentHash === currentHash
      && candidate.currentHash2 === currentHash2
      && candidate.baselineHash === baselineHash
      && candidate.baselineHash2 === baselineHash2
      && candidate.baseTick === baseTick
      && candidate.currentIds.size === currentIds.size
      && (candidate.baselineIds?.size ?? 0) === (baselineIds?.size ?? 0)) return templateIndex;
    bucket = (bucket + 1) & (TEMPLATE_LOOKUP_CAPACITY - 1);
  }
  return TEMPLATE_LOOKUP_FULL;
}

function insertTemplate(bucket: number, templateIndex: number): void {
  templateLookupEpochs[bucket] = templateLookupEpoch;
  templateLookupIndices[bucket] = templateIndex;
}

function addressText(address: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(address)) || "unknown";
}

function requestClientIp(request: HttpRequest, directAddress: ArrayBuffer): string {
  return clientIp(addressText(directAddress), request.getHeader("x-forwarded-for"), trustProxy);
}

function createClientData(ip: string): ClientData {
  return {
    ip,
    connected: false,
    joined: false,
    joinQueued: false,
    entityId: 0,
    playerId: 0,
    messageWindowStartedAt: performance.now(),
    messageCount: 0,
    ackedSnapshotTick: 0,
    interestHistoryTick: new Uint32Array(SERVER_BASELINE_HISTORY),
    interestHistorySet: new Array<ReadonlySet<number> | undefined>(SERVER_BASELINE_HISTORY),
    interestHistoryHash: new Uint32Array(SERVER_BASELINE_HISTORY),
    interestHistoryHash2: new Uint32Array(SERVER_BASELINE_HISTORY),
    interestGroup: 0,
    interestHash: 0,
    interestHash2: 0,
    interestShard: 0,
    interest: new Set<number>(),
    nextInterest: new Set<number>(),
    interestRemovals: new Set<number>(),
    interestCandidates: [],
  };
}

function isLoopback(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  const mapped = /^(?:::ffff:|0000:0000:0000:0000:0000:ffff:)(.+)$/.exec(ip);
  if (mapped === null) return false;
  const tail = mapped[1] ?? "";
  return tail === "127.0.0.1" || tail === "7f00:0001";
}

function send(socket: ClientSocket, buffer: ArrayBuffer | Uint8Array): void {
  const result = socket.send(buffer, true, false);
  if (result === 1) bytesSentSinceReport += buffer.byteLength;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function accountForJoin(token: string, name: string): { account: AccountState; token: string } {
  if (token !== "") {
    const verified = verifyGameToken(token);
    const account = verified === undefined ? undefined : progression.getAccount(verified.playerId);
    const validGuest = verified?.kind === "guest" && account !== undefined && account.authId === undefined && account.tokenHash === hashToken(token);
    const link = verified?.kind === "claimed" ? storage.getAuthLinkByAuthId(verified.authId) : undefined;
    const validClaimed = verified?.kind === "claimed" && account !== undefined && account.authId === verified.authId && link?.playerId === account.playerId && account.tokenHash === hashToken(token);
    if (account !== undefined && (validGuest || validClaimed)) {
      progression.renameAccount(account, name);
      return { account, token };
    }
  }
  const account = progression.createGuest(name, "");
  const issued = issueGuestToken(account.playerId);
  account.tokenHash = hashToken(issued);
  return { account, token: issued };
}

function disconnect(socket: ClientSocket): void {
  const data = socket.getUserData();
  if (!data.connected) return;
  data.connected = false;
  clients.delete(socket);
  const remainingConnections = Math.max(0, (connectionCountByIp.get(data.ip) ?? 1) - 1);
  if (remainingConnections === 0) connectionCountByIp.delete(data.ip);
  else connectionCountByIp.set(data.ip, remainingConnections);
  if (!data.joined) return;
  data.joined = false;
  if (data.playerId !== 0) progression.flush();
  const squadLeavers = data.playerId !== 0 ? squads.leave(data.playerId) : [];
  socketByEntityId.delete(data.entityId);
  socketByPlayerId.delete(data.playerId);
  removePlayer(world, data.entityId);
  const leave = encodeEntityLeave(data.entityId);
  for (const peer of clients) {
    const peerData = peer.getUserData();
    if (!peerData.joined || !peerData.interest.delete(data.entityId)) continue;
    peerData.interestHash = (peerData.interestHash ^ entityInterestHash(data.entityId)) >>> 0;
    peerData.interestHash2 = (peerData.interestHash2 ^ entityInterestHash2(data.entityId)) >>> 0;
    peerData.nextInterest.delete(data.entityId);
    send(peer, leave);
  }
  if (squadLeavers.length > 0) refreshSquadState(squadLeavers);
  if (world.count < 10 || world.count % 100 === 0) console.log(JSON.stringify({ event: "leave", entityId: data.entityId, players: world.count }));
}

/**
 * Sends the current SquadState to every listed online player (an empty list
 * of members = not in a squad). Event-driven only — squads never touch the
 * tick path.
 */
function refreshSquadState(playerIds: readonly number[]): void {
  for (const playerId of playerIds) {
    const socket = socketByPlayerId.get(playerId);
    if (socket === undefined || !socket.getUserData().joined) continue;
    const entityId = socket.getUserData().entityId;
    const memberEntityIds = squads.memberEntityIds(playerId, (memberPlayerId) => {
      const memberSocket = socketByPlayerId.get(memberPlayerId);
      return memberSocket?.getUserData().entityId ?? 0;
    });
    const squadId = memberEntityIds.includes(entityId) ? 1 : 0;
    send(socket, encodeSquadState({ squadId, memberEntityIds }));
  }
}

function handleSquadCommand(socket: ClientSocket, rawBuffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (data.playerId === 0) throw new ProtocolError("Squad requires an account");
  const message = decodeSquadCommand(rawBuffer);
  if (message.op !== SquadOp.Invite && message.op !== SquadOp.Leave && message.op !== SquadOp.Disband) throw new ProtocolError("Invalid squad op");
  let affected: readonly number[] = [];
  if (message.op === SquadOp.Invite) {
    const result = squads.invite(data.playerId, message.targetPlayerId);
    // Expected user errors (not a friend, squad full, target offline) are
    // silent: the SquadState broadcast is the truth, and killing the socket
    // over a UI-level rejection would be absurd.
    if (typeof result === "string") return;
    affected = result.affected;
  } else if (message.op === SquadOp.Leave) {
    affected = squads.leave(data.playerId);
  } else if (message.op === SquadOp.Disband) {
    const result = squads.disband(data.playerId);
    if (typeof result === "string") return;
    affected = result.affected;
  }
  refreshSquadState(affected);
}

function isRateLimited(data: ClientData): boolean {
  const now = performance.now();
  if (now - data.messageWindowStartedAt >= 1_000) {
    data.messageWindowStartedAt = now;
    data.messageCount = 0;
  }
  data.messageCount += 1;
  return data.messageCount > configuredMessageLimit;
}

function teamCounts(): readonly [number, number] {
  let ottoman = 0;
  let byzantine = 0;
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    if (world.team[slot] === Team.Ottoman) ottoman += 1;
    else if (world.team[slot] === Team.Byzantine) byzantine += 1;
  }
  return [ottoman, byzantine];
}

function handleJoin(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.connected || data.joined) return;
  const message = decodeJoin(buffer);
  if (message.preferredTeam !== undefined
    && message.preferredTeam !== Team.None
    && message.preferredTeam !== Team.Ottoman
    && message.preferredTeam !== Team.Byzantine) throw new ProtocolError("Invalid preferred team");
  if (message.preferredClass !== undefined
    && (message.preferredClass < PlayerClass.None || message.preferredClass > PlayerClass.Priest)) throw new ProtocolError("Invalid preferred class");
  const [ottomanCount, byzantineCount] = teamCounts();
  const balancedTeam = ottomanCount <= byzantineCount ? Team.Ottoman : Team.Byzantine;
  const requestedTeam = message.preferredTeam;
  const canChoose = requestedTeam !== undefined && requestedTeam !== Team.None && Math.abs(ottomanCount - byzantineCount) <= 2;
  const { account, token } = accountForJoin(message.token ?? "", message.name);
  const assignedTeam = canChoose ? requestedTeam : balancedTeam;
  const preferredClass = message.preferredClass ?? PlayerClass.None;
  backfill.evictLowestTenureOnTeam(assignedTeam);
  const player = addPlayer(world, account.name, assignedTeam, preferredClass);
  if (player === undefined) {
    socket.end(1013, "Battle full");
    return;
  }
  data.joined = true;
  data.entityId = player.entityId;
  data.playerId = account.playerId;
  socketByEntityId.set(player.entityId, socket);
  socketByPlayerId.set(account.playerId, socket);
  const team = world.team[player.slot] as Team;
  const selectedClass = world.playerClass[player.slot] as PlayerClass;
  if (preferredClass !== PlayerClass.None && preferredClass !== selectedClass) requestClass(world, player.entityId, selectedClass);
  const career = account.careers[team];
  rankBySlot[player.slot] = career === undefined ? 1 : advanceCareer(career.xp, 1, career.prestige).rank;
  prestigeBySlot[player.slot] = career?.prestige ?? 0;
  send(socket, encodeWelcome({
    entityId: player.entityId,
    serverTick: world.tick,
    tickRate: SERVER_TICK_RATE,
    x: world.x[player.slot] ?? 0,
    y: world.y[player.slot] ?? 0,
    z: world.z[player.slot] ?? 0,
    team,
    playerClass: selectedClass,
    wallStateBits: packedWallStates(world),
    wallHpFrac: wallHpFractions(world),
  }));
  if (preferredClass !== PlayerClass.None && preferredClass !== selectedClass) {
    send(socket, encodeClassStatus({ playerClass: selectedClass, accepted: false, reason: 1 }));
  }
  const tally = progression.warTally();
  const profile = progression.profile(account);
  send(socket, encodeAccount({
    playerId: account.playerId,
    token,
    name: account.name,
    careers: profile.careers,
    warTallyOttoman: tally.ottoman,
    warTallyByzantine: tally.byzantine,
    lifetime: profile.lifetime,
    contracts: profile.contracts,
    medals: profile.medals,
    claimed: account.authId !== undefined,
  }));
  send(socket, encodeMedalState(progression.medalState(account)));
  const clanView = clans.roster(account.playerId);
  if (clanView.ok) {
    send(socket, encodeClanState({
      clanId: clanView.value.clanId,
      name: clanView.value.name,
      tag: clanView.value.tag,
      founderPlayerId: clanView.value.founderPlayerId,
      memberCount: clanView.value.memberCount,
      role: clanRoleCode(clanView.value.role),
    }));
  }
  if (world.count <= 10 || world.count % 100 === 0) console.log(JSON.stringify({ event: "join", entityId: player.entityId, playerId: account.playerId, players: world.count, serverBots: backfill.count }));
}

function queueJoin(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (data.joined || data.joinQueued) throw new ProtocolError("Duplicate join");
  if (pendingJoins.length - pendingJoinHead >= maxPendingJoins) {
    socket.end(1013, "Join queue full");
    return;
  }
  data.joinQueued = true;
  pendingJoins.push({ socket, buffer });
}

function processPendingJoins(): void {
  let processed = 0;
  while (pendingJoinHead < pendingJoins.length && processed < joinBatchPerTick) {
    const queued = pendingJoins[pendingJoinHead];
    pendingJoinHead += 1;
    if (queued === undefined) continue;
    const data = queued.socket.getUserData();
    data.joinQueued = false;
    if (!data.connected) continue;
    try {
      handleJoin(queued.socket, queued.buffer);
    } catch (error: unknown) {
      if (error instanceof ProtocolError) protocolRejects += 1;
      else serverErrors += 1;
      const reason = error instanceof Error ? error.message : "Join error";
      queued.socket.end(1002, reason.slice(0, 100));
    }
    processed += 1;
  }
  if (pendingJoinHead === pendingJoins.length) {
    pendingJoins.length = 0;
    pendingJoinHead = 0;
  } else if (pendingJoinHead > 512) {
    pendingJoins.splice(0, pendingJoinHead);
    pendingJoinHead = 0;
  }
}

function handleInput(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Input before join");
  const input = decodeInput(buffer);
  if ((input.buttons & ~VALID_INPUT_BUTTON_MASK) !== 0 || input.dtMs > 100 || Math.abs(input.pitch) > Math.PI * 0.5) throw new ProtocolError("Invalid input");
  enqueueInput(world, data.entityId, input);
  if (input.lastSnapshotTick > data.ackedSnapshotTick
    && globalStateForTick(input.lastSnapshotTick) !== undefined
    && interestForTick(data, input.lastSnapshotTick) !== undefined) {
    data.ackedSnapshotTick = input.lastSnapshotTick;
  }
}

function handleClassSelect(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Class selection before join");
  const playerClass = decodeClassSelect(buffer);
  if (playerClass < PlayerClass.Janissary || playerClass > PlayerClass.Priest) throw new ProtocolError("Invalid player class");
  const accepted = requestClass(world, data.entityId, playerClass);
  const slot = world.slotByEntityId.get(data.entityId);
  const selected = accepted ? playerClass : (slot === undefined ? PlayerClass.None : world.desiredClass[slot] as PlayerClass);
  send(socket, encodeClassStatus({ playerClass: selected, accepted, reason: accepted ? 0 : 1 }));
}

function handleSpawnSelect(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Spawn selection before join");
  requestSpawnPoint(world, data.entityId, decodeSpawnSelect(buffer));
}

function handleDeploy(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Deploy before join");
  decodeDeploy(buffer);
  requestDeploy(world, data.entityId);
}

function chatNotice(reason: "claimed" | "muted" | "rate" | "invalid"): ReturnType<typeof encodeChatNotice> {
  if (reason === "claimed") return encodeChatNotice({ code: ChatNoticeCode.ClaimedAccountRequired, text: "Save your progress to send chat messages." });
  if (reason === "muted") return encodeChatNotice({ code: ChatNoticeCode.Muted, text: "Your chat is muted." });
  if (reason === "rate") return encodeChatNotice({ code: ChatNoticeCode.RateLimited, text: "Slow down before sending another message." });
  return encodeChatNotice({ code: ChatNoticeCode.InvalidMessage, text: "Message is empty or invalid." });
}

function handleChat(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Chat before join");
  const account = progression.getAccount(data.playerId);
  if (account === undefined) throw new ProtocolError("Missing account");
  const request = decodeChatSend(buffer);
  const result = chat.accept(account.playerId, account.authId !== undefined, account.name, request.channel, request.text);
  if (!result.ok) { send(socket, chatNotice(result.reason)); return; }
  const encoded = encodeChatMessage(result.message);
  const senderSlot = world.slotByEntityId.get(data.entityId);
  const senderTeam = senderSlot === undefined ? Team.None : world.team[senderSlot] as Team;
  for (const peer of clients) {
    const peerData = peer.getUserData();
    if (!peerData.joined) continue;
    if (result.message.channel === ChatChannel.Team) {
      const peerSlot = world.slotByEntityId.get(peerData.entityId);
      if (peerSlot === undefined || world.team[peerSlot] !== senderTeam) continue;
    }
    send(peer, encoded);
  }
}

function handleChatReport(socket: ClientSocket, buffer: ArrayBuffer): void {
  const data = socket.getUserData();
  if (!data.joined) throw new ProtocolError("Report before join");
  const accepted = chat.report(data.playerId, decodeChatReport(buffer));
  send(socket, encodeChatNotice({ code: accepted ? ChatNoticeCode.ReportAccepted : ChatNoticeCode.InvalidMessage, text: accepted ? "Message reported for review." : "Message is no longer available to report." }));
}

function prepareCors(request: HttpRequest, response: HttpResponse): boolean {
  const origin = request.getHeader("origin").replace(/\/$/, "");
  if (origin === "") return true;
  const allowed = process.env.NODE_ENV !== "production" && (isLoopbackHttpOrigin(origin) || isSameHostHttpOrigin(origin, request.getHeader("host")))
    ? origin
    : allowedCorsOrigin(origin, configuredCorsOrigins);
  if (allowed === undefined) {
    response.writeStatus("403 Forbidden").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "origin-not-allowed" }));
    return false;
  }
  response.writeHeader("Access-Control-Allow-Origin", allowed).writeHeader("Vary", "Origin");
  return true;
}

function readJsonBody(
  request: HttpRequest,
  response: HttpResponse,
  onValue: (value: unknown) => Promise<void>,
  corsAlreadyPrepared = false,
): void {
  if (!corsAlreadyPrepared && !prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "json-write", 60)) {
    response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" }));
    return;
  }
  let body = "";
  let aborted = false;
  response.onAborted(() => { aborted = true; });
  response.onData((chunk, last) => {
    if (aborted) return;
    body += Buffer.from(chunk).toString("utf8");
    if (body.length > 16_384) { response.writeStatus("413 Payload Too Large").end(); aborted = true; return; }
    if (!last) return;
    let value: unknown;
    try { value = JSON.parse(body); } catch { response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "invalid request" })); return; }
    void onValue(value).catch((error: unknown) => {
      if (aborted) return;
      if (!(error instanceof AuthError)) console.error(JSON.stringify({ event: "http_error", error: error instanceof Error ? error.message : String(error) }));
      const status = error instanceof AuthError ? error.status : 500;
      const message = error instanceof AuthError ? error.message : "Authentication service unavailable";
      response.cork(() => response.writeStatus(`${status} ${status === 400 ? "Bad Request" : status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 404 ? "Not Found" : status === 409 ? "Conflict" : status === 410 ? "Gone" : status === 429 ? "Too Many Requests" : "Internal Server Error"}`).writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: message })));
    });
  });
}

function readDevAdminJsonBody(request: HttpRequest, response: HttpResponse, onValue: (value: unknown) => Promise<void>): void {
  // Dev routes must authorize before reading the body so production keeps its
  // hard 404. Tell the shared reader that CORS is already written: uWS appends
  // repeated headers, and browsers reject two Access-Control-Allow-Origin
  // values even when those values are identical.
  if (!prepareCors(request, response)) return;
  if (!requireDevAdmin(response)) return;
  readJsonBody(request, response, onValue, true);
}

const app = uWS.App();
app.options("/auth/*", (response, request) => {
  if (!prepareCors(request, response)) return;
  response.writeHeader("Access-Control-Allow-Headers", "Content-Type").writeHeader("Access-Control-Allow-Methods", "POST, OPTIONS").end();
});
const devBotPreflight = (response: HttpResponse, request: HttpRequest): void => {
  if (!prepareCors(request, response)) return;
  response
    .writeHeader("Access-Control-Allow-Headers", "Content-Type")
    .writeHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .writeHeader("Access-Control-Max-Age", "60")
    .end();
};
// JSON POSTs trigger a browser preflight. Without this, F8 reports the
// otherwise healthy mutation endpoints as the opaque "Failed to fetch".
app.options("/dev/bots", devBotPreflight);
app.options("/dev/bots/*", devBotPreflight);
app.get("/health", (response) => {
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, players: world.count, bots: backfill.count, tick: world.tick }));
});
app.get("/metrics", (response, request) => {
  if (process.env.NODE_ENV === "production" && !bearerMatches(request.getHeader("authorization"), metricsToken)) {
    response.writeStatus("401 Unauthorized").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "metrics-auth-required" }));
    return;
  }
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ...stats.latest(), replicationTemplateCount, replicationOverflowCount, bots: backfill.count }));
});
// Phase 8e-19 Task 1: dev playtest-control. Dev-only (404 otherwise, see
// requireDevAdmin); the F8 admin panel in the client reads/writes these.
app.get("/dev/bots/state", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!requireDevAdmin(response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "dev-admin-read")) {
    response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" }));
    return;
  }
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({
    enabled: devAdminEnabled,
    target: backfill.floorTarget,
    count: backfill.count,
    mode: getBotBehaviorMode(),
    freeze: isBotCombatFrozen(),
    tick: world.tick,
  }));
});
app.post("/dev/bots", (response, request) => {
  readDevAdminJsonBody(request, response, async (value) => {
    const count = parseBotCount(value);
    if (count === undefined) {
      response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "count must be a number 0-150" }));
      return;
    }
    backfill.setFloorTarget(count);
    response.cork(() => response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, target: backfill.floorTarget })));
  });
});
app.post("/dev/bots/mode", (response, request) => {
  readDevAdminJsonBody(request, response, async (value) => {
    const mode = parseBotMode(value);
    if (mode === undefined) {
      response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "mode must be standing, walking, or battle" }));
      return;
    }
    setBotBehaviorMode(mode);
    response.cork(() => response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, mode })));
  });
});
app.post("/dev/bots/freeze", (response, request) => {
  readDevAdminJsonBody(request, response, async (value) => {
    const frozen = parseBotFreeze(value);
    if (frozen === undefined) {
      response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "frozen must be a boolean" }));
      return;
    }
    setBotCombatFrozen(frozen);
    response.cork(() => response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, frozen })));
  });
});
app.post("/dev/bots/reset", (response, request) => {
  readDevAdminJsonBody(request, response, async (value) => {
    if (parsePlaytestReset(value) === undefined) {
      response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "confirm must be true" }));
      return;
    }
    resetRoundForPlaytest(world);
    response.cork(() => response.writeStatus("200 OK").writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, tick: world.tick })));
  });
});
app.get("/leaderboard", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "public-read")) {
    response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" }));
    return;
  }
  const query = request.getQuery() ?? "";
  const params = new URLSearchParams(query);
  const scope = params.get("scope") === "clan" ? "clan" : "player";
  if (scope === "clan") {
    const clanId = Number(params.get("clan") ?? "0");
    if (!Number.isSafeInteger(clanId) || clanId <= 0) {
      response.writeStatus("400 Bad Request").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "clan id is required" }));
      return;
    }
    const windowValue = params.get("window") ?? "daily";
    const window = windowValue === "weekly" ? "weekly" : windowValue === "alltime" ? "alltime" : "daily";
    const requestedLimit = Number(params.get("limit") ?? "50");
    const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
    const entries = clans.leaderboard(window, clanId, limit);
    response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ scope, window, clanId, entries }));
    return;
  }
  const windowValue = params.get("window") ?? "daily";
  const window = windowValue === "weekly" ? "weekly" : windowValue === "alltime" ? "alltime" : "daily";
  const factionValue = Number(params.get("faction") ?? "0");
  const faction = factionValue === Team.Ottoman || factionValue === Team.Byzantine ? factionValue as Team : Team.None;
  const requestedLimit = Number(params.get("limit") ?? "50");
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 50;
  const entries = progression.leaderboard(window, faction, limit);
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ window, faction, entries }));
});
app.get("/war-history", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "public-read")) {
    response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" }));
    return;
  }
  const tally = progression.warTally();
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify(tally));
});
app.post("/auth/request-link", (response, request) => {
  const ip = requestClientIp(request, response.getRemoteAddressAsText());
  readJsonBody(request, response, async (value) => {
    if (auth === undefined) throw new AuthError(503, "Account saving is not configured on this server");
    if (typeof value !== "object" || value === null) throw new AuthError(400, "Invalid request");
    const email = (value as { email?: unknown }).email;
    const token = (value as { token?: unknown }).token;
    if (typeof email !== "string" || typeof token !== "string") throw new AuthError(400, "Invalid request");
    const verified = verifyGameToken(token);
    const account = verified?.kind === "guest" ? progression.getAccount(verified.playerId) : undefined;
    if (account === undefined || account.authId !== undefined || account.tokenHash !== hashToken(token)) throw new AuthError(401, "Guest session is invalid");
    await auth.requestUpgrade(account.playerId, email, ip);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, message: "If the address can be used, a sign-in link is on its way." })));
  });
});
app.post("/auth/complete", (response, request) => {
  readJsonBody(request, response, async (value) => {
    if (auth === undefined) throw new AuthError(503, "Account saving is not configured on this server");
    if (typeof value !== "object" || value === null) throw new AuthError(400, "Invalid request");
    const accessToken = (value as { accessToken?: unknown }).accessToken;
    const state = (value as { state?: unknown }).state;
    if (typeof accessToken !== "string" || (state !== undefined && typeof state !== "string")) throw new AuthError(400, "Invalid request");
    const completed = await auth.complete(accessToken, state);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, ...completed })));
  });
});
app.post("/auth/request-login", (response, request) => {
  const ip = requestClientIp(request, response.getRemoteAddressAsText());
  readJsonBody(request, response, async (value) => {
    if (auth === undefined) throw new AuthError(503, "Account saving is not configured on this server");
    if (typeof value !== "object" || value === null || typeof (value as { email?: unknown }).email !== "string") throw new AuthError(400, "Invalid request");
    await auth.requestLogin((value as { email: string }).email, ip);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, message: "If a saved soldier exists, a sign-in link is on its way." })));
  });
});

function bearerAccountFromHeader(header: string): AccountState | undefined {
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (match === null) return undefined;
  const verified = verifyGameToken(match[1] ?? "");
  if (verified === undefined) return undefined;
  const account = progression.getAccount(verified.playerId);
  if (account === undefined || account.tokenHash !== hashToken(match[1] ?? "")) return undefined;
  if (verified.kind === "guest" && account.authId !== undefined) return undefined;
  if (verified.kind === "claimed") {
    const link = storage.getAuthLinkByAuthId(verified.authId);
    if (account.authId !== verified.authId || link?.playerId !== account.playerId) return undefined;
  }
  return account;
}

function bearerAccount(request: Parameters<Parameters<typeof app.get>[1]>[1]): AccountState | undefined {
  return bearerAccountFromHeader(request.getHeader("authorization"));
}

function clanErrorStatus(code: string): number {
  if (code === "auth-required") return 401;
  if (code === "rate-limited") return 429;
  if (code === "not-the-founder") return 403;
  if (code === "exists" || code === "already-in-clan" || code === "clan-full" || code === "target-in-clan") return 409;
  if (code === "player-not-found" || code === "not-found" || code === "invite-missing") return 404;
  return 400;
}

function replyClanError(response: HttpResponse, code: string): void {
  response.writeStatus(`${clanErrorStatus(code)} ${clanErrorStatus(code) === 401 ? "Unauthorized" : clanErrorStatus(code) === 403 ? "Forbidden" : clanErrorStatus(code) === 409 ? "Conflict" : clanErrorStatus(code) === 404 ? "Not Found" : clanErrorStatus(code) === 429 ? "Too Many Requests" : "Bad Request"}`)
    .writeHeader("Content-Type", "application/json")
    .end(JSON.stringify({ error: code }));
}

app.options("/clans/*", (response, request) => {
  if (!prepareCors(request, response)) return;
  response.writeHeader("Access-Control-Allow-Headers", "Content-Type, Authorization").writeHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS").end();
});
app.options("/social/*", (response, request) => {
  if (!prepareCors(request, response)) return;
  response.writeHeader("Access-Control-Allow-Headers", "Content-Type, Authorization").writeHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS").end();
});

app.options("/skins/*", (response, request) => {
  if (!prepareCors(request, response)) return;
  response.writeHeader("Access-Control-Allow-Headers", "Content-Type, Authorization").writeHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS").end();
});

app.options("/skins", (response, request) => {
  if (!prepareCors(request, response)) return;
  response.writeHeader("Access-Control-Allow-Headers", "Content-Type, Authorization").writeHeader("Access-Control-Allow-Methods", "GET, OPTIONS").end();
});

function replySkinState(response: HttpResponse, playerId: number): void {
  const account = progression.getAccount(playerId);
  if (account === undefined) { response.writeStatus("401 Unauthorized").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "auth-required" })); return; }
  const state = progression.skinState(account);
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, ...state }));
}

app.get("/skins", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "skin-read")) { response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" })); return; }
  const account = bearerAccount(request);
  if (account === undefined) { response.writeStatus("401 Unauthorized").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "auth-required" })); return; }
  replySkinState(response, account.playerId);
});

app.post("/skins/equip", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const skinId = typeof value === "object" && value !== null ? (value as { skinId?: unknown }).skinId : undefined;
    if (typeof skinId !== "string" || skinId.length === 0 || skinId.length > 64 || !/^[a-z0-9-]+$/.test(skinId)) throw new AuthError(400, "invalid-request");
    const result = progression.equipSkin(account, skinId);
    if (result !== "ok") {
      const status = result === "unknown" ? 404 : 403;
      throw new AuthError(status, result);
    }
    replySkinState(response, account.playerId);
  });
});

function requireBearerAccountFromHeader(header: string): AccountState {
  const account = bearerAccountFromHeader(header);
  if (account === undefined) throw new AuthError(401, "auth-required");
  return account;
}

function refreshClanState(playerId: number): void {
  const socket = socketByPlayerId.get(playerId);
  if (socket === undefined || !socket.getUserData().joined) return;
  const view = clans.roster(playerId);
  if (view.ok) {
    send(socket, encodeClanState({
      clanId: view.value.clanId,
      name: view.value.name,
      tag: view.value.tag,
      founderPlayerId: view.value.founderPlayerId,
      memberCount: view.value.memberCount,
      role: clanRoleCode(view.value.role),
    }));
  } else {
    send(socket, encodeClanState({ clanId: 0, name: "", tag: "", founderPlayerId: 0, memberCount: 0, role: 0 }));
  }
}

app.post("/clans/create", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    if (typeof value !== "object" || value === null || typeof (value as { name?: unknown }).name !== "string" || typeof (value as { tag?: unknown }).tag !== "string") throw new AuthError(400, "invalid-request");
    const result = clans.create(account.playerId, (value as { name: string }).name, (value as { tag: string }).tag);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    refreshClanState(account.playerId);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clan: result.value })));
  });
});
app.post("/clans/join", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    if (typeof value !== "object" || value === null || typeof (value as { tag?: unknown }).tag !== "string") throw new AuthError(400, "invalid-request");
    const result = clans.join(account.playerId, (value as { tag: string }).tag);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    refreshClanState(account.playerId);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clan: result.value })));
  });
});
app.post("/clans/invite", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    if (typeof value !== "object" || value === null || typeof (value as { name?: unknown }).name !== "string") throw new AuthError(400, "invalid-request");
    const result = clans.invite(account.playerId, (value as { name: string }).name);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, ...result.value })));
  });
});
app.post("/clans/accept-invite", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const clanId = typeof value === "object" && value !== null ? (value as { clanId?: unknown }).clanId : undefined;
    if (typeof clanId !== "number" || !Number.isSafeInteger(clanId) || clanId <= 0) throw new AuthError(400, "invalid-request");
    const result = clans.acceptInvite(account.playerId, clanId);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    refreshClanState(account.playerId);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clan: result.value })));
  });
});
app.post("/clans/leave", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async () => {
    const account = requireBearerAccountFromHeader(authorization);
    const result = clans.leave(account.playerId);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    refreshClanState(account.playerId);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, ...result.value })));
  });
});
app.post("/clans/kick", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const targetPlayerId = typeof value === "object" && value !== null ? (value as { playerId?: unknown }).playerId : undefined;
    if (typeof targetPlayerId !== "number" || !Number.isSafeInteger(targetPlayerId) || targetPlayerId <= 0) throw new AuthError(400, "invalid-request");
    const result = clans.kick(account.playerId, targetPlayerId);
    if (!result.ok) throw new AuthError(clanErrorStatus(result.error), result.error);
    refreshClanState(targetPlayerId);
    refreshClanState(account.playerId);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, ...result.value })));
  });
});
app.get("/clans/my", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "clan-read")) { replyClanError(response, "rate-limited"); return; }
  const account = bearerAccount(request);
  if (account === undefined) { replyClanError(response, "auth-required"); return; }
  const result = clans.roster(account.playerId);
  if (!result.ok) { replyClanError(response, result.error); return; }
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clan: result.value, invites: clans.invites(account.playerId) }));
});
app.get("/clans/roster", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "clan-read")) { replyClanError(response, "rate-limited"); return; }
  const params = new URLSearchParams(request.getQuery() ?? "");
  const tag = params.get("tag");
  if (tag === null || tag.length < 3 || tag.length > 5) { replyClanError(response, "invalid-request"); return; }
  const result = clans.rosterForTag(tag);
  if (!result.ok) { replyClanError(response, result.error); return; }
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clan: result.value }));
});
app.get("/clans/search", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "clan-read")) { replyClanError(response, "rate-limited"); return; }
  const params = new URLSearchParams(request.getQuery() ?? "");
  const query = params.get("q") ?? "";
  if (query === "" || query.length > 32) { replyClanError(response, "invalid-request"); return; }
  const requestedLimit = Number(params.get("limit") ?? "10");
  const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(20, requestedLimit)) : 10;
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, clans: clans.search(query, limit) }));
});
app.get("/social/friends", (response, request) => {
  if (!prepareCors(request, response)) return;
  if (!allowHttpRequest(requestClientIp(request, response.getRemoteAddressAsText()), "clan-read")) { response.writeStatus("429 Too Many Requests").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "rate limited" })); return; }
  const account = bearerAccount(request);
  if (account === undefined) { response.writeStatus("401 Unauthorized").writeHeader("Content-Type", "application/json").end(JSON.stringify({ error: "auth-required" })); return; }
  const friends: FriendView[] = [...social.friends(account.playerId, (playerId) => {
    const socket = socketByPlayerId.get(playerId);
    if (socket === undefined || !socket.getUserData().joined) return undefined;
    const slot = world.slotByEntityId.get(socket.getUserData().entityId);
    return { online: true, team: slot === undefined ? Team.None : (world.team[slot] as Team) };
  })];
  const blocked = social.blockedIds(account.playerId).map((playerId) => ({ playerId, name: progression.getAccount(playerId)?.name ?? `Player ${playerId}` }));
  const requests = social.incomingRequests(account.playerId);
  response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, friends, blocked, requests }));
});
app.post("/social/request", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const name = typeof value === "object" && value !== null ? (value as { name?: unknown }).name : undefined;
    if (typeof name !== "string" || name.length === 0 || name.length > 24) throw new AuthError(400, "invalid-request");
    const result = social.sendRequest(account.playerId, name);
    if (!result.ok) throw new AuthError(result.error === "not-found" ? 404 : 409, result.error);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, targetPlayerId: result.value.targetPlayerId })));
  });
});
app.post("/social/accept", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const fromId = typeof value === "object" && value !== null ? (value as { fromId?: unknown }).fromId : undefined;
    if (typeof fromId !== "number" || !Number.isSafeInteger(fromId) || fromId <= 0) throw new AuthError(400, "invalid-request");
    const result = social.acceptRequest(account.playerId, fromId);
    if (!result.ok) throw new AuthError(result.error === "request-missing" ? 404 : 409, result.error);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, friendPlayerId: result.value.friendPlayerId })));
  });
});
app.post("/social/decline", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const fromId = typeof value === "object" && value !== null ? (value as { fromId?: unknown }).fromId : undefined;
    if (typeof fromId !== "number" || !Number.isSafeInteger(fromId) || fromId <= 0) throw new AuthError(400, "invalid-request");
    const result = social.declineRequest(account.playerId, fromId);
    if (!result.ok) throw new AuthError(result.error === "request-missing" ? 404 : 409, result.error);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true })));
  });
});
app.post("/social/remove", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const friendId = typeof value === "object" && value !== null ? (value as { friendId?: unknown }).friendId : undefined;
    if (typeof friendId !== "number" || !Number.isSafeInteger(friendId) || friendId <= 0) throw new AuthError(400, "invalid-request");
    const result = social.removeFriend(account.playerId, friendId);
    if (!result.ok) throw new AuthError(result.error === "not-found" ? 404 : 409, result.error);
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true })));
  });
});
app.post("/social/block", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const name = typeof value === "object" && value !== null ? (value as { name?: unknown }).name : undefined;
    if (typeof name !== "string" || name.length === 0 || name.length > 24) throw new AuthError(400, "invalid-request");
    const result = social.block(account.playerId, name);
    if (!result.ok) throw new AuthError(result.error === "not-found" ? 404 : 409, result.error);
    // Blocked-ids ride to the client on the next join; an in-match block
    // refreshes immediately over the socket.
    const socket = socketByPlayerId.get(account.playerId);
    if (socket !== undefined && socket.getUserData().joined) {
      send(socket, encodeBlockedIds({ blockedIds: social.blockedIds(account.playerId) }));
    }
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true, targetPlayerId: result.value.targetPlayerId })));
  });
});
app.post("/social/unblock", (response, request) => {
  const authorization = request.getHeader("authorization");
  readJsonBody(request, response, async (value) => {
    const account = requireBearerAccountFromHeader(authorization);
    const playerId = typeof value === "object" && value !== null ? (value as { playerId?: unknown }).playerId : undefined;
    if (typeof playerId !== "number" || !Number.isSafeInteger(playerId) || playerId <= 0) throw new AuthError(400, "invalid-request");
    const result = social.unblock(account.playerId, playerId);
    if (!result.ok) throw new AuthError(result.error === "not-found" ? 404 : 409, result.error);
    const socket = socketByPlayerId.get(account.playerId);
    if (socket !== undefined && socket.getUserData().joined) {
      send(socket, encodeBlockedIds({ blockedIds: social.blockedIds(account.playerId) }));
    }
    response.cork(() => response.writeHeader("Content-Type", "application/json").end(JSON.stringify({ ok: true })));
  });
});
app.ws<ClientData>("/*", {
  compression: uWS.DISABLED,
  maxPayloadLength: 256,
  idleTimeout: 30,
  sendPingsAutomatically: true,
  maxBackpressure: 256 * 1_024,
  closeOnBackpressureLimit: true,
  upgrade: (response, request, context) => {
    if (clients.size >= maxConnections) {
      response.writeStatus("503 Service Unavailable").end("Connection capacity reached");
      return;
    }
    const ip = requestClientIp(request, response.getRemoteAddressAsText());
    response.upgrade(
      createClientData(ip),
      request.getHeader("sec-websocket-key"),
      request.getHeader("sec-websocket-protocol"),
      request.getHeader("sec-websocket-extensions"),
      context,
    );
  },
  open: (socket) => {
    const data = socket.getUserData();
    data.connected = true;
    data.messageWindowStartedAt = performance.now();
    const count = (connectionCountByIp.get(data.ip) ?? 0) + 1;
    connectionCountByIp.set(data.ip, count);
    clients.add(socket);
    const limit = isLoopback(data.ip) ? loopbackConnectionLimit : configuredConnectionLimit;
    if (count > limit) socket.end(1013, "Too many connections");
  },
  message: (socket, rawBuffer, isBinary) => {
    if (!isBinary) {
      socket.end(1003, "Binary only");
      return;
    }
    const data = socket.getUserData();
    if (isRateLimited(data)) {
      socket.end(1008, "Rate limit");
      return;
    }
    try {
      const type = readMessageType(rawBuffer);
      if (type === MessageType.Join) queueJoin(socket, rawBuffer.slice(0));
      else if (type === MessageType.Input) handleInput(socket, rawBuffer);
      else if (type === MessageType.ClassSelect) handleClassSelect(socket, rawBuffer);
      else if (type === MessageType.SpawnSelect) handleSpawnSelect(socket, rawBuffer);
      else if (type === MessageType.Deploy) handleDeploy(socket, rawBuffer);
      else if (type === MessageType.ChatSend) handleChat(socket, rawBuffer);
      else if (type === MessageType.ChatReport) handleChatReport(socket, rawBuffer);
      else if (type === MessageType.SquadCommand) handleSquadCommand(socket, rawBuffer);
      else if (type === MessageType.Ping) send(socket, encodePing(MessageType.Pong, decodePing(rawBuffer, MessageType.Ping)));
      else throw new ProtocolError("Unsupported client message");
    } catch (error: unknown) {
      if (error instanceof ProtocolError) protocolRejects += 1;
      else serverErrors += 1;
      const reason = error instanceof Error ? error.message : "Protocol error";
      socket.end(1002, reason.slice(0, 100));
    }
  },
  close: (socket) => disconnect(socket),
});

function updateInterest(socket: ClientSocket, observerSlot: number): void {
  const data = socket.getUserData();
  const centerX = world.x[observerSlot] ?? 0;
  const centerZ = world.z[observerSlot] ?? 0;
  const next = data.nextInterest;
  const removals = data.interestRemovals;
  const interestGroup = Math.floor(observerSlot / AOI_MAX_ENTITIES);
  data.interestGroup = interestGroup;
  removals.clear();
  const exitRadiusSquared = AOI_EXIT_RADIUS * AOI_EXIT_RADIUS;
  const enterRadiusSquared = AOI_ENTER_RADIUS * AOI_ENTER_RADIUS;
  for (const entityId of data.interest) {
    if (entityId === data.entityId || isVehicleEntityId(entityId) || isCannonEntityId(entityId)) continue;
    if (isHorseEntityId(entityId)) {
      if (world.horses.active[horseIndexForEntityId(entityId)] === 0) removals.add(entityId);
      continue;
    }
    if (isEarthworkEntityId(entityId)) {
      const earthworkIndex = earthworkIndexForEntityId(entityId);
      if ((world.earthworkKind[earthworkIndex] ?? 0) === 0) {
        removals.add(entityId);
        continue;
      }
      if ((entityId + data.interestShard) % INTEREST_RETENTION_SHARDS !== 0) continue;
      const dx = (world.earthworkX[earthworkIndex] ?? 0) - centerX;
      const dz = (world.earthworkZ[earthworkIndex] ?? 0) - centerZ;
      if (dx * dx + dz * dz > exitRadiusSquared) removals.add(entityId);
      continue;
    }
    const slot = world.slotByEntityId.get(entityId);
    if (slot === undefined) {
      removals.add(entityId);
      continue;
    }
    const dx = (world.x[slot] ?? 0) - centerX;
    const dz = (world.z[slot] ?? 0) - centerZ;
    if (dx * dx + dz * dz > exitRadiusSquared) removals.add(entityId);
  }
  data.interestShard = (data.interestShard + 1) % INTEREST_RETENTION_SHARDS;
  if (removals.size === 0 && data.interest.size >= AOI_MAX_ENTITIES) return;

  next.clear();
  for (const entityId of data.interest) if (!removals.has(entityId)) next.add(entityId);
  next.add(data.entityId);
  if (next.size < AOI_MAX_ENTITIES) {
    querySpatialHashInto(
      world.spatialHash,
      world,
      centerX,
      centerZ,
      AOI_ENTER_RADIUS,
      data.interestCandidates,
    );
    for (const candidateSlot of data.interestCandidates) {
      if (Math.floor(candidateSlot / AOI_MAX_ENTITIES) !== interestGroup) continue;
      const entityId = world.entityId[candidateSlot] ?? 0;
      if (entityId === 0 || entityId === data.entityId) continue;
      next.add(entityId);
      if (next.size >= AOI_MAX_ENTITIES) break;
    }
  }
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    if (world.vehicles.active[vehicleIndex] === 0) continue;
    next.add(vehicleEntityId(vehicleIndex));
  }
  // All four siege cannons are unconditionally replicated to every client,
  // exactly like galleys — wrecks stay visible via the destroyed state bit.
  for (let cannonIndex = 0; cannonIndex < MAX_SIEGE_CANNONS; cannonIndex += 1) {
    if (world.cannons.active[cannonIndex] === 0) continue;
    next.add(cannonEntityId(cannonIndex));
  }
  for (let horseIndex = 0; horseIndex < MAX_HORSES; horseIndex += 1) {
    if (world.horses.active[horseIndex] !== 0) next.add(horseEntityId(horseIndex));
  }
  for (let earthworkIndex = 0; earthworkIndex < EARTHWORK_MAX; earthworkIndex += 1) {
    if ((world.earthworkKind[earthworkIndex] ?? 0) === 0) continue;
    const dx = (world.earthworkX[earthworkIndex] ?? 0) - centerX;
    const dz = (world.earthworkZ[earthworkIndex] ?? 0) - centerZ;
    if (dx * dx + dz * dz > enterRadiusSquared) continue;
    next.add(earthworkEntityId(earthworkIndex));
  }

  if (setsEqual(data.interest, next)) return;
  for (const entityId of next) {
    if (data.interest.has(entityId)) continue;
    if (isEarthworkEntityId(entityId)) {
      const earthworkIndex = earthworkIndexForEntityId(entityId);
      const kind = world.earthworkKind[earthworkIndex] ?? 0;
      if (kind === 0) continue;
      send(socket, encodeEntityJoin({ entityId, name: "", team: Team.None, kind: EntityKind.Earthwork, playerClass: kind as PlayerClass }));
      continue;
    }
    if (isVehicleEntityId(entityId)) {
      const vehicleIndex = vehicleIndexForEntityId(entityId);
      if (vehicleIndex < 0 || world.vehicles.active[vehicleIndex] === 0) continue;
      const team = world.vehicles.team[vehicleIndex] as Team;
      send(socket, encodeEntityJoin({ entityId, name: team === Team.Ottoman ? "Ottoman Galley" : "Byzantine Galley", team, kind: EntityKind.Galley }));
      continue;
    }
    if (isCannonEntityId(entityId)) {
      const cannonIndex = cannonIndexForEntityId(entityId);
      if (cannonIndex < 0 || cannonIndex >= MAX_SIEGE_CANNONS || world.cannons.active[cannonIndex] === 0) continue;
      const team = world.cannons.team[cannonIndex] as Team;
      const name = world.cannons.personal[cannonIndex] !== 0
        ? `${team === Team.Ottoman ? "Ottoman" : "Byzantine"} Field Gun`
        : team === Team.Ottoman ? "Ottoman Bombard" : "Byzantine Bombard";
      send(socket, encodeEntityJoin({ entityId, name, team, kind: EntityKind.SiegeCannon }));
      continue;
    }
    if (isHorseEntityId(entityId)) {
      const horseIndex = horseIndexForEntityId(entityId);
      if (horseIndex < 0 || horseIndex >= MAX_HORSES || world.horses.active[horseIndex] === 0) continue;
      send(socket, encodeEntityJoin({ entityId, name: "Riderless horse", team: world.horses.team[horseIndex] as Team, kind: EntityKind.Horse }));
      continue;
    }
    const slot = world.slotByEntityId.get(entityId);
    if (slot === undefined) continue;
    const entityPlayerId = socketByEntityId.get(entityId)?.getUserData().playerId;
    const tag = entityPlayerId === undefined ? undefined : clans.tagForPlayer(entityPlayerId);
    send(socket, encodeEntityJoin({ entityId, name: world.name[slot] ?? "Player", team: world.team[slot] as Team, rank: rankBySlot[slot] ?? 1, prestige: prestigeBySlot[slot] ?? 0, playerClass: world.playerClass[slot] as PlayerClass, ...(tag === undefined ? {} : { tag }), ...(backfill.isServerBot(entityId) ? { bot: true } : {}) }));
  }
  for (const entityId of data.interest) {
    if (!next.has(entityId)) {
      send(socket, encodeEntityLeave(entityId));
    }
  }
  data.nextInterest = data.interest;
  data.interest = next;
  data.interestHash = hashInterest(next);
  data.interestHash2 = hashInterest2(next);
}

function captureGlobalState(): Map<number, EntityState> {
  const ringIndex = world.tick % SERVER_BASELINE_HISTORY;
  const current = globalStateRing[ringIndex];
  if (current === undefined) throw new Error("Missing global state ring");
  for (const entityId of current.keys()) {
    if (world.slotByEntityId.has(entityId) || isVehicleEntityId(entityId) || isCannonEntityId(entityId) || isHorseEntityId(entityId)) continue;
    if (isEarthworkEntityId(entityId)) {
      if ((world.earthworkKind[earthworkIndexForEntityId(entityId)] ?? 0) !== 0) continue;
    }
    current.delete(entityId);
  }
  for (const [entityId, slot] of world.slotByEntityId) {
    let state = current.get(entityId);
    if (state === undefined) {
      state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      current.set(entityId, state);
    }
    writeEntityStateAt(world, slot, state);
  }
  for (let vehicleIndex = 0; vehicleIndex < MAX_VEHICLES; vehicleIndex += 1) {
    if (world.vehicles.active[vehicleIndex] === 0) continue;
    const entityId = vehicleEntityId(vehicleIndex);
    let state = current.get(entityId);
    if (state === undefined) {
      state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      current.set(entityId, state);
    }
    writeVehicleEntityStateAt(world, vehicleIndex, state);
  }
  for (let cannonIndex = 0; cannonIndex < MAX_SIEGE_CANNONS; cannonIndex += 1) {
    if (world.cannons.active[cannonIndex] === 0) continue;
    const entityId = cannonEntityId(cannonIndex);
    let state = current.get(entityId);
    if (state === undefined) {
      state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      current.set(entityId, state);
    }
    writeCannonEntityStateAt(world, cannonIndex, state);
  }
  for (let horseIndex = 0; horseIndex < MAX_HORSES; horseIndex += 1) {
    if (world.horses.active[horseIndex] === 0) continue;
    const entityId = horseEntityId(horseIndex);
    let state = current.get(entityId);
    if (state === undefined) {
      state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      current.set(entityId, state);
    }
    writeHorseEntityStateAt(world, horseIndex, state);
  }
  for (let earthworkIndex = 0; earthworkIndex < EARTHWORK_MAX; earthworkIndex += 1) {
    if ((world.earthworkKind[earthworkIndex] ?? 0) === 0) continue;
    const entityId = earthworkEntityId(earthworkIndex);
    let state = current.get(entityId);
    if (state === undefined) {
      state = { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
      current.set(entityId, state);
    }
    writeEarthworkEntityStateAt(world, earthworkIndex, state);
  }
  globalStateRingTick[ringIndex] = world.tick;
  return current;
}

function globalStateForTick(tick: number): ReadonlyMap<number, EntityState> | undefined {
  const index = tick % SERVER_BASELINE_HISTORY;
  return globalStateRingTick[index] === tick ? globalStateRing[index] : undefined;
}

function interestForTick(data: ClientData, tick: number): ReadonlySet<number> | undefined {
  const index = tick % SERVER_BASELINE_HISTORY;
  return data.interestHistoryTick[index] === tick ? data.interestHistorySet[index] : undefined;
}

function interestHashForTick(data: ClientData, tick: number): number | undefined {
  const index = tick % SERVER_BASELINE_HISTORY;
  return data.interestHistoryTick[index] === tick ? data.interestHistoryHash[index] : undefined;
}

function interestHash2ForTick(data: ClientData, tick: number): number | undefined {
  const index = tick % SERVER_BASELINE_HISTORY;
  return data.interestHistoryTick[index] === tick ? data.interestHistoryHash2[index] : undefined;
}

function setsEqual(left: ReadonlySet<number> | undefined, right: ReadonlySet<number> | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function broadcastSnapshots(): ReplicationDurations {
  const startedAt = performance.now();
  let capture = 0;
  let selection = 0;
  let interest = 0;
  let templateLookup = 0;
  let encode = 0;
  let ackPatch = 0;
  let sendDuration = 0;
  let history = 0;
  const captureStartedAt = performance.now();
  const meta = snapshotMeta(world);
  const currentStates = captureGlobalState();
  capture = performance.now() - captureStartedAt;
  let templateCount = 0;
  let overflowCount = 0;
  templateLookupEpoch = (templateLookupEpoch + 1) >>> 0;
  if (templateLookupEpoch === 0) {
    templateLookupEpochs.fill(0);
    templateLookupEpoch = 1;
  }
  for (const socket of clients) {
    const selectionStartedAt = performance.now();
    const data = socket.getUserData();
    if (!data.joined || socket.getBufferedAmount() > 256 * 1_024) {
      selection += performance.now() - selectionStartedAt;
      continue;
    }
    if ((world.tick + data.entityId) % SNAPSHOT_TICK_DIVISOR !== 0) {
      selection += performance.now() - selectionStartedAt;
      continue;
    }
    const slot = world.slotByEntityId.get(data.entityId);
    if (slot === undefined) {
      selection += performance.now() - selectionStartedAt;
      continue;
    }
    selection += performance.now() - selectionStartedAt;
    if (data.interest.size === 0 || (world.tick + data.entityId) % 10 === 0) {
      const interestStartedAt = performance.now();
      updateInterest(socket, slot);
      interest += performance.now() - interestStartedAt;
    }
    const baselineStartedAt = performance.now();
    const baselineStates = globalStateForTick(data.ackedSnapshotTick);
    const baselineIds = interestForTick(data, data.ackedSnapshotTick);
    const baselineHash = interestHashForTick(data, data.ackedSnapshotTick);
    const baselineHash2 = interestHash2ForTick(data, data.ackedSnapshotTick);
    const hasBaseline = baselineStates !== undefined && baselineIds !== undefined && baselineHash !== undefined && baselineHash2 !== undefined;
    const baseTick = hasBaseline ? data.ackedSnapshotTick : 0;
    const effectiveBaselineIds = hasBaseline ? baselineIds : undefined;
    selection += performance.now() - baselineStartedAt;
    const lookupStartedAt = performance.now();
    const lookupResult = findTemplate(data.interestGroup, data.interestHash, data.interestHash2, baselineHash ?? 0, baselineHash2 ?? 0, baseTick, data.interest, effectiveBaselineIds);
    templateLookup += performance.now() - lookupStartedAt;
    const cacheFull = lookupResult === TEMPLATE_LOOKUP_FULL;
    let template = lookupResult >= 0 ? snapshotTemplatePool[lookupResult] : undefined;
    if (lookupResult < 0) {
      // A full cache is not an error: encode uncached into the shared overflow
      // scratch template. Bytes are identical; only the sharing is lost.
      const templateIndex = templateCount;
      template = cacheFull ? overflowTemplate : snapshotTemplatePool[templateIndex];
      if (template === undefined) template = overflowTemplate;
      if (template === overflowTemplate) overflowCount += 1;
      else templateCount += 1;
      const encodeStartedAt = performance.now();
      const byteLength = encodeInterestSnapshotInto(
        template.buffer,
        world.tick,
        0,
        currentStates,
        data.interest,
        baseTick,
        hasBaseline ? baselineStates : undefined,
        effectiveBaselineIds,
        meta,
        template.dataView,
      );
      let view = template.views.get(byteLength);
      if (view === undefined) {
        view = new Uint8Array(template.buffer, 0, byteLength);
        template.views.set(byteLength, view);
      }
      if (template !== overflowTemplate) {
        template.interestGroup = data.interestGroup;
        template.currentHash = data.interestHash;
        template.currentHash2 = data.interestHash2;
        template.baselineHash = baselineHash ?? 0;
        template.baselineHash2 = baselineHash2 ?? 0;
        template.currentIds = data.interest;
        template.baselineIds = effectiveBaselineIds;
        template.baseTick = baseTick;
        insertTemplate(~lookupResult, templateIndex);
      }
      template.view = view;
      encode += performance.now() - encodeStartedAt;
    }
    if (template === undefined) throw new Error("Missing replication template");
    const ackStartedAt = performance.now();
    template.dataView.setUint32(6, world.ackInputSeq[slot] ?? 0, true);
    ackPatch += performance.now() - ackStartedAt;
    const sendStartedAt = performance.now();
    send(socket, template.view);
    sendDuration += performance.now() - sendStartedAt;
    const historyStartedAt = performance.now();
    const historyIndex = world.tick % SERVER_BASELINE_HISTORY;
    data.interestHistoryTick[historyIndex] = world.tick;
    data.interestHistorySet[historyIndex] = data.interest;
    data.interestHistoryHash[historyIndex] = data.interestHash;
    data.interestHistoryHash2[historyIndex] = data.interestHash2;
    history += performance.now() - historyStartedAt;
  }
  replicationTemplateCount = templateCount;
  replicationOverflowCount = overflowCount;
  return { capture, selection, interest, templateLookup, encode, ackPatch, send: sendDuration, history, total: performance.now() - startedAt };
}

function broadcastWallEvents(): void {
  const events = drainWallEvents(world);
  for (const event of events) {
    const buffer = encodeWallEvent(event);
    for (const socket of clients) if (socket.getUserData().joined) send(socket, buffer);
  }
}

function broadcastShipEvents(): void {
  const events = drainShipEvents(world);
  for (const event of events) {
    const buffer = encodeShipEvent({ vehicleEntityId: vehicleEntityId(event.vehicleIndex), eventType: event.eventType, occupantEntityId: event.occupantEntityId });
    for (const socket of clients) if (socket.getUserData().joined) send(socket, buffer);
  }
}

function drainXpQueue(): void {
  const { xpQueueSlots, xpQueueSources, xpQueueAmounts, xpQueueFlags } = world;
  const capacity = xpQueueSlots.length;
  let drained = 0;
  while (world.xpQueueHead !== world.xpQueueTail && drained < MAX_XP_EVENTS_PER_TICK) {
    const slot = xpQueueSlots[world.xpQueueHead];
    const source = xpQueueSources[world.xpQueueHead];
    const amount = xpQueueAmounts[world.xpQueueHead];
    const eventFlags = xpQueueFlags[world.xpQueueHead];
    world.xpQueueHead = (world.xpQueueHead + 1) % capacity;
    if (slot === undefined || source === undefined || amount === undefined || eventFlags === undefined) continue;
    const entityId = world.entityId[slot] ?? 0;
    const socket = socketByEntityId.get(entityId);
    if (socket === undefined || !socket.getUserData().joined) continue;
    const data = socket.getUserData();
    const account = progression.getAccount(data.playerId);
    if (account === undefined) continue;
    const result = progression.recordXp(account, world.team[slot] as Team, amount, source, eventFlags);
    rankBySlot[slot] = result.rank;
    prestigeBySlot[slot] = result.prestige;
    send(socket, encodeXpEvent({
      amount,
      totalXp: result.totalXp,
      faction: world.team[slot] as Team,
      rank: result.rank,
      prestige: result.prestige,
      leveled: result.leveled,
      prestiged: result.prestiged,
      source,
      headshot: (eventFlags & XP_EVENT_FLAG_HEADSHOT) !== 0,
    }));
    if (result.contractUpdate !== undefined) {
      send(socket, encodeContractEvent(result.contractUpdate));
    }
    drained += 1;
  }
}

function drainMedalQueue(): void {
  for (const entry of drainMedalCounters(world)) {
    const entityId = world.entityId[entry.slot] ?? 0;
    const socket = socketByEntityId.get(entityId);
    if (socket === undefined || !socket.getUserData().joined) continue;
    const data = socket.getUserData();
    const account = progression.getAccount(data.playerId);
    if (account === undefined) continue;
    const unlocks = progression.recordMedalCounter(account, entry.category, entry.amount);
    if (unlocks.length === 0) continue;
    const team = world.team[entry.slot] as Team;
    for (const unlock of unlocks) {
      send(socket, encodeMedalUnlock({ category: unlock.category, tier: unlock.tier as MedalTier, name: medalDisplayName(unlock.category, unlock.tier as MedalTier, team) }));
    }
    send(socket, encodeMedalState(progression.medalState(account)));
  }
}

function scheduleProgressionDrain(): void {
  if (progressionDrainScheduled || (world.xpQueueHead === world.xpQueueTail && world.medalQueueHead === world.medalQueueTail)) return;
  progressionDrainScheduled = true;
  setImmediate(() => {
    progressionDrainScheduled = false;
    drainXpQueue();
    drainMedalQueue();
    scheduleProgressionDrain();
  });
}

function collectWarEndData(winner: Team): WarEndData {
  const slots: WarEndSlot[] = [];
  for (let slot = 0; slot < MAX_PLAYERS; slot += 1) {
    if (world.active[slot] === 0) continue;
    slots.push({
      entityId: world.entityId[slot] ?? 0,
      team: world.team[slot] as Team,
      kills: world.kills[slot] ?? 0,
      deaths: world.deaths[slot] ?? 0,
      assists: world.assists[slot] ?? 0,
      captures: world.warCaptures[slot] ?? 0,
      defenseKills: world.warDefenseKills[slot] ?? 0,
      shots: world.warShots[slot] ?? 0,
      hits: world.warHits[slot] ?? 0,
      headshots: world.warHeadshots[slot] ?? 0,
      captureTicks: world.captureTicks[slot] ?? 0,
      warXp: world.warXp[slot] ?? 0,
      medalMask: world.medalBits[slot] ?? 0,
    });
  }
  return { winner, slots };
}

function processWarEnd(data: WarEndData): void {
  progression.recordWarTally(data.winner);
  const tally = progression.warTally();
  for (const entry of data.slots) {
    const socket = socketByEntityId.get(entry.entityId);
    if (socket === undefined || !socket.getUserData().joined) continue;
    const socketData = socket.getUserData();
    const account = progression.getAccount(socketData.playerId);
    if (account === undefined) continue;
    const slot = world.slotByEntityId.get(entry.entityId);
    const statsEntry: PerSlotWarStats = {
      team: entry.team,
      kills: entry.kills,
      deaths: entry.deaths,
      assists: entry.assists,
      captures: entry.captures,
      defenseKills: entry.defenseKills,
      shots: entry.shots,
      hits: entry.hits,
      headshots: entry.headshots,
      captureTicks: entry.captureTicks,
      warXp: entry.warXp,
      medalMask: entry.medalMask,
    };
    const outcome = progression.finishWar(account, entry.team, data.winner, statsEntry);
    if (slot !== undefined) {
      rankBySlot[slot] = outcome.rank;
      prestigeBySlot[slot] = outcome.prestige;
    }
    if (outcome.welcomeBackBonus > 0) {
      send(socket, encodeXpEvent({
        amount: outcome.welcomeBackBonus,
        totalXp: account.careers[entry.team]?.xp ?? 0,
        faction: entry.team,
        rank: outcome.rank,
        prestige: outcome.prestige,
        leveled: false,
        prestiged: false,
        source: XpSource.WelcomeBack,
        headshot: false,
      }));
    }
    if (outcome.contractUpdate !== undefined) {
      send(socket, encodeContractEvent(outcome.contractUpdate));
    }
    for (const unlock of outcome.medalUnlocks) {
      send(socket, encodeMedalUnlock({ category: unlock.category, tier: unlock.tier as MedalTier, name: medalDisplayName(unlock.category, unlock.tier as MedalTier, entry.team) }));
    }
    if (outcome.medalUnlocks.length > 0) {
  send(socket, encodeMedalState(progression.medalState(account)));
  const blockedIds = social.blockedIds(account.playerId);
  if (blockedIds.length > 0) send(socket, encodeBlockedIds({ blockedIds }));
  refreshSquadState([account.playerId]);
    }
    const summary: WarSummaryMessage = {
      winner: data.winner,
      warTallyOttoman: tally.ottoman,
      warTallyByzantine: tally.byzantine,
      kills: entry.kills,
      deaths: entry.deaths,
      assists: entry.assists,
      captures: entry.captures,
      shots: entry.shots,
      hits: entry.hits,
      defenseKills: entry.defenseKills,
      captureSeconds: Math.floor(entry.captureTicks * 0.05),
      warXpEarned: entry.warXp,
      welcomeBackBonus: outcome.welcomeBackBonus,
      medalMask: entry.medalMask,
    };
    send(socket, encodeWarSummary(summary));
  }
  progression.flush();
}

function checkWarEnd(): void {
  if (world.roundPhase === RoundPhase.Victory && lastRoundPhase === RoundPhase.Active) {
    const data = collectWarEndData(world.captureOwner);
    queueMicrotask(() => processWarEnd(data));
  }
  lastRoundPhase = world.roundPhase;
}

function allowHttpRequest(ip: string, scope: string, limit = LEADERBOARD_REQUESTS_PER_MINUTE): boolean {
  return httpRateLimits.allow(`${scope}:${ip}`, performance.now(), 60_000, limit);
}

let nextTickAt = performance.now() + FIXED_DT_MS;
function runTickLoop(): void {
  const now = performance.now();
  let catchUpSteps = 0;
  while (performance.now() >= nextTickAt && catchUpSteps < 4) {
    const startedAt = performance.now();
    processPendingJoins();
    stepWorld(world);
    backfill.step(world.tick);
    broadcastWallEvents();
    broadcastShipEvents();
    const progressionStartedAt = performance.now();
    scheduleProgressionDrain();
    checkWarEnd();
    const progression = performance.now() - progressionStartedAt;
    const replicationSubphases = broadcastSnapshots();
    stats.record({ ...world.phaseTimings, progression, replication: replicationSubphases.total, total: performance.now() - startedAt }, replicationSubphases);
    nextTickAt += FIXED_DT_MS;
    catchUpSteps += 1;
  }
  if (now - nextTickAt > FIXED_DT_MS * 4) nextTickAt = now + FIXED_DT_MS;
  if (stats.reportIfDue(world.count, clients.size, pendingJoins.length - pendingJoinHead, world.tick, bytesSentSinceReport, serverErrors, protocolRejects)) bytesSentSinceReport = 0;
  setTimeout(runTickLoop, Math.max(0, nextTickAt - performance.now()));
}

const flushTimer = setInterval(() => progression.flush(), flushIntervalMs);
flushTimer.unref();

// Phase 8e-25 crash containment: any unexpected throw in the tick loop,
// snapshot broadcast, XP drain, or the synchronous SQLite adapter previously
// escaped as an uncaught exception with no handler — a silent hard exit (or,
// worse, an abrupt Docker restart loop at capacity). Log the failure as a
// structured fatal event, then exit non-zero so the supervisor restarts a
// clean process instead of a half-mutated one.
process.on("uncaughtException", (error) => {
  console.log(JSON.stringify({ event: "fatal", reason: "uncaughtException", error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.log(JSON.stringify({ event: "fatal", reason: "unhandledRejection", error: reason instanceof Error ? reason.message : String(reason) }));
  process.exit(1);
});

function shutdown(): void {
  clearInterval(flushTimer);
  progression.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(port, (token) => {
  if (!token) throw new Error(`Failed to listen on port ${port}`);
  console.log(JSON.stringify({ event: "listening", port, tickRate: SERVER_TICK_RATE, accounts: progression.accountCount() }));
  runTickLoop();
});
