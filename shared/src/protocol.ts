import {
  CombatEventType,
  EARTHWORK_ENTITY_BASE,
  EARTHWORK_MAX,
  MAX_CAPTURE_POINTS,
  MAX_DAILY_CONTRACTS,
  MAX_CHAT_BYTES,
  MAX_ENTITY_ID,
  MAX_NAME_BYTES,
  MAX_POSITION,
  MAX_TOKEN_BYTES,
  MEDAL_KIND_COUNT,
  POSITION_SCALE,
  PROTOCOL_VERSION,
  PlayerClass,
  RoundPhase,
  Team,
  WALL_SEGMENT_COUNT,
  WallState,
} from "./constants";
import { MEDAL_CATEGORY_COUNT, type MedalTier } from "./medals";
import { CLAN_NAME_MAX, CLAN_TAG_MAX } from "./clans";
import { DEFAULT_WEAPON_SLOT } from "./tuning";
import { clamp } from "./math";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const HEADER_BYTES = 2;

export const enum MessageType {
  Join = 1,
  Welcome = 2,
  Input = 3,
  EntityJoin = 4,
  EntityLeave = 5,
  Snapshot = 6,
  Ping = 7,
  Pong = 8,
  Account = 9,
  XpEvent = 10,
  ContractEvent = 11,
  WarSummary = 12,
  ClassSelect = 13,
  ClassStatus = 14,
  WallEvent = 15,
  ShipEvent = 16,
  ChatSend = 17,
  ChatMessage = 18,
  ChatNotice = 19,
  ChatReport = 20,
  MedalUnlock = 21,
  MedalState = 22,
  ClanState = 23,
  SpawnSelect = 24,
  BlockedIds = 25,
  SquadState = 26,
  SquadCommand = 27,
  Deploy = 28,
}

export const enum ChatChannel {
  Team = 1,
  All = 2,
}

export const enum ChatNoticeCode {
  ClaimedAccountRequired = 1,
  RateLimited = 2,
  Muted = 3,
  InvalidMessage = 4,
  ReportAccepted = 5,
}

export interface ChatSendMessage { channel: ChatChannel; text: string }
export interface ChatMessage { messageId: number; playerId: number; channel: ChatChannel; name: string; text: string; createdAt: number }
export interface ChatNoticeMessage { code: ChatNoticeCode; text: string }

export const enum ShipEventType {
  HelmClaimed = 1,
  HelmReleased = 2,
  Gun1Claimed = 3,
  Gun1Released = 4,
  Gun2Claimed = 5,
  Gun2Released = 6,
  PassengerBoarded = 7,
  PassengerLeft = 8,
  Sunk = 9,
  Respawned = 10,
}

export const enum EntityKind {
  Player = 0,
  Galley = 1,
  Earthwork = 2,
  SiegeCannon = 3,
  Horse = 4,
}

export const enum SnapshotField {
  Position = 1 << 0,
  Yaw = 1 << 1,
  Pitch = 1 << 2,
  Gameplay = 1 << 3,
  Vehicle = 1 << 4,
  Ship = 1 << 5,
  Torch = 1 << 6,
  Removed = 1 << 7,
}

export const SHIP_STATE_SUNK = 1 << 0;
export const SHIP_STATE_HELM = 1 << 1;
export const SHIP_STATE_GUN1 = 1 << 2;
export const SHIP_STATE_GUN2 = 1 << 3;
export const SHIP_STATE_PASSENGER_SHIFT = 4;

export interface JoinMessage {
  name: string;
  preferredTeam?: Team;
  token?: string;
  preferredClass?: PlayerClass;
}

export interface WelcomeMessage {
  entityId: number;
  serverTick: number;
  tickRate: number;
  x: number;
  y: number;
  z: number;
  team?: Team;
  playerClass?: PlayerClass;
  wallStateBits?: number;
  /** Per-segment HP ÷ WALL_SEGMENT_HEALTH quantized to 1/16 steps (0–16); defaults to full HP. */
  wallHpFrac?: number[];
}

export interface InputMessage {
  seq: number;
  lastSnapshotTick: number;
  buttons: number;
  yaw: number;
  pitch: number;
  dtMs: number;
}

export interface EntityJoinMessage {
  entityId: number;
  name: string;
  team?: Team;
  rank?: number;
  prestige?: number;
  playerClass?: PlayerClass;
  kind?: EntityKind;
  tag?: string;
  bot?: boolean;
}

export interface ShipEventMessage {
  vehicleEntityId: number;
  eventType: ShipEventType;
  occupantEntityId: number;
}

export interface MedalUnlockMessage {
  category: number;
  tier: MedalTier;
  name: string;
}

export interface MedalCounterState {
  category: number;
  value: number;
  tier: number;
}

export interface MedalStateMessage {
  wars: number;
  counters: readonly MedalCounterState[];
}

export interface ClanStateMessage {
  clanId: number;
  name: string;
  tag: string;
  founderPlayerId: number;
  memberCount: number;
  role: number;
}

export interface BlockedIdsMessage {
  readonly blockedIds: readonly number[];
}

/** Current squad membership as entity ids (empty = no squad). */
export interface SquadStateMessage {
  readonly squadId: number;
  readonly memberEntityIds: readonly number[];
}

export const enum SquadOp {
  Invite = 1,
  Leave = 2,
  Disband = 3,
}

export interface SquadCommandMessage {
  readonly op: SquadOp;
  readonly targetPlayerId: number;
}

/** Squad membership cap (Phase 8c-7 decision; state in ADR 0023). */
export const SQUAD_CAP = 6;

export interface ClassStatusMessage {
  playerClass: PlayerClass;
  accepted: boolean;
  reason: number;
}

export interface WallEventMessage {
  segmentId: number;
  state: WallState;
  attackerEntityId: number;
  /** Segment HP ÷ WALL_SEGMENT_HEALTH quantized to 1/16 steps (0–16). */
  hpFrac: number;
}

export interface CareerInfo {
  xp: number;
  rank: number;
  prestige: number;
  headshots: number;
}

export interface LifetimeInfo {
  wars: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  medals: number;
}

export interface ContractState {
  kind: number;
  progress: number;
  target: number;
  reward: number;
  completed: boolean;
}

export interface MedalCount {
  kind: number;
  count: number;
}

export interface AccountMessage {
  playerId: number;
  token: string;
  name: string;
  careers: readonly CareerInfo[];
  warTallyOttoman: number;
  warTallyByzantine: number;
  lifetime: LifetimeInfo;
  contracts: readonly ContractState[];
  medals: readonly MedalCount[];
  claimed: boolean;
}

export interface XpEventMessage {
  amount: number;
  totalXp: number;
  faction: Team;
  rank: number;
  prestige: number;
  leveled: boolean;
  prestiged: boolean;
  source: number;
  headshot: boolean;
}

export interface ContractEventMessage {
  slot: number;
  kind: number;
  progress: number;
  target: number;
  reward: number;
  completed: boolean;
}

export interface WarSummaryMessage {
  winner: Team;
  warTallyOttoman: number;
  warTallyByzantine: number;
  kills: number;
  deaths: number;
  assists: number;
  captures: number;
  shots: number;
  hits: number;
  defenseKills: number;
  captureSeconds: number;
  warXpEarned: number;
  welcomeBackBonus: number;
  medalMask: number;
}

export interface EntityState {
  entityId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  team?: Team;
  health?: number;
  flags?: number;
  ammo?: number;
  reloadTicks?: number;
  /** Active 1-based weapon slot (protocol v13); defaults to DEFAULT_WEAPON_SLOT. */
  weaponSlot?: number;
  /** Draw/holster ticks left before a slot switch lands, 0-63 on the wire. */
  weaponSwitchTicks?: number;
  respawnTicks?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  captureSeconds?: number;
  playerClass?: PlayerClass;
  mounted?: boolean;
  horseHp?: number;
  shipKind?: EntityKind;
  shipHullHp?: number;
  shipState?: number;
  /** Authoritative traversed aim for siege-cannon entities; absent on other ships. */
  cannonGunYaw?: number;
  cannonGunPitch?: number;
  /** Last authoritative bearing of each galley gun; absent on other ships. */
  shipGun1Yaw?: number;
  shipGun2Yaw?: number;
  /** Player-carried torch on/off (0/1); 8c-5 renders the light. */
  torch?: number;
  /** Earthwork subkind (EarthworkKind) — carried once on the entity record. */
  earthworkKind?: number;
}

export interface CombatEvent {
  id: number;
  type: CombatEventType;
  sourceEntityId: number;
  targetEntityId: number;
  value: number;
}

export interface SnapshotMeta {
  captureOwner: Team;
  captureProgress: number;
  ottomanTickets: number;
  byzantineTickets: number;
  roundPhase: RoundPhase;
  phaseRemainingTicks: number;
  events: readonly CombatEvent[];
  points?: readonly CapturePointMeta[];
}

export interface CapturePointMeta {
  owner: Team;
  progress: number;
}

export interface Snapshot {
  tick: number;
  ackInputSeq: number;
  baseTick: number;
  entities: Map<number, EntityState>;
  meta: SnapshotMeta;
}

export class ProtocolError extends Error {}

export const EMPTY_SNAPSHOT_META: SnapshotMeta = {
  captureOwner: Team.None,
  captureProgress: 0,
  ottomanTickets: 0,
  byzantineTickets: 0,
  roundPhase: RoundPhase.Active,
  phaseRemainingTicks: 0,
  events: [],
  points: [],
};

function createMessage(type: MessageType, payloadBytes: number): { buffer: ArrayBuffer; view: DataView } {
  const buffer = new ArrayBuffer(HEADER_BYTES + payloadBytes);
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, type);
  return { buffer, view };
}

function expectMessage(buffer: ArrayBuffer, type: MessageType, minimumBytes: number): DataView {
  if (buffer.byteLength < HEADER_BYTES + minimumBytes) throw new ProtocolError("Message is truncated");
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) throw new ProtocolError("Unsupported protocol version");
  if (view.getUint8(1) !== type) throw new ProtocolError("Unexpected message type");
  return view;
}

function expectExactMessage(buffer: ArrayBuffer, type: MessageType, payloadBytes: number): DataView {
  const view = expectMessage(buffer, type, payloadBytes);
  if (view.byteLength !== HEADER_BYTES + payloadBytes) throw new ProtocolError("Message has trailing bytes");
  return view;
}

function encodeAngle(radians: number): number {
  const wrapped = Math.atan2(Math.sin(radians), Math.cos(radians));
  return Math.round((wrapped / Math.PI) * 32_767);
}

function decodeAngle(value: number): number {
  return (value / 32_767) * Math.PI;
}

function encodePosition(value: number): number {
  return Math.round(clamp(value, -MAX_POSITION, MAX_POSITION) * POSITION_SCALE);
}

function decodePosition(value: number): number {
  return value / POSITION_SCALE;
}

function boundedName(name: string): Uint8Array {
  const sanitized = name.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_NAME_BYTES);
  const encoded = textEncoder.encode(sanitized || "Player");
  return encoded.byteLength <= MAX_NAME_BYTES ? encoded : encoded.slice(0, MAX_NAME_BYTES);
}

function boundedToken(token: string | undefined): Uint8Array {
  const sanitized = (token ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, MAX_TOKEN_BYTES);
  const encoded = textEncoder.encode(sanitized);
  return encoded.byteLength <= MAX_TOKEN_BYTES ? encoded : encoded.slice(0, MAX_TOKEN_BYTES);
}

function writeName(view: DataView, offset: number, name: string): number {
  const bytes = boundedName(name);
  view.setUint8(offset, bytes.byteLength);
  new Uint8Array(view.buffer, offset + 1, bytes.byteLength).set(bytes);
  return offset + 1 + bytes.byteLength;
}

function readName(view: DataView, offset: number): string {
  const length = view.getUint8(offset);
  if (length > MAX_NAME_BYTES || offset + 1 + length > view.byteLength) throw new ProtocolError("Invalid name");
  return textDecoder.decode(new Uint8Array(view.buffer, offset + 1, length));
}

export function readMessageType(buffer: ArrayBuffer): MessageType {
  if (buffer.byteLength < HEADER_BYTES) throw new ProtocolError("Missing header");
  const view = new DataView(buffer);
  if (view.getUint8(0) !== PROTOCOL_VERSION) throw new ProtocolError("Unsupported protocol version");
  return view.getUint8(1) as MessageType;
}

export function encodeJoin(message: JoinMessage): ArrayBuffer {
  const token = boundedToken(message.token);
  const name = boundedName(message.name);
  const { buffer, view } = createMessage(MessageType.Join, 4 + token.byteLength + name.byteLength);
  view.setUint8(2, token.byteLength);
  new Uint8Array(buffer, 3).set(token);
  const nameOffset = 3 + token.byteLength;
  view.setUint8(nameOffset, name.byteLength);
  new Uint8Array(buffer, nameOffset + 1).set(name);
  view.setUint8(nameOffset + 1 + name.byteLength, message.preferredTeam ?? Team.None);
  view.setUint8(nameOffset + 2 + name.byteLength, message.preferredClass ?? PlayerClass.None);
  return buffer;
}

export function decodeJoin(buffer: ArrayBuffer): JoinMessage {
  const view = expectMessage(buffer, MessageType.Join, 1);
  const tokenLength = view.getUint8(2);
  // Phase 8e-25: the token view must be bounds-checked BEFORE construction —
  // a hostile length byte beyond the frame previously threw RangeError
  // (classified as a server error and echoed to the client) instead of the
  // expected ProtocolError.
  if (tokenLength > MAX_TOKEN_BYTES || 3 + tokenLength > view.byteLength) throw new ProtocolError("Token is truncated");
  const token = textDecoder.decode(new Uint8Array(view.buffer, 3, tokenLength));
  const nameOffset = 3 + tokenLength;
  if (nameOffset >= view.byteLength) throw new ProtocolError("Missing name");
  const name = readName(view, nameOffset);
  const teamOffset = nameOffset + 1 + view.getUint8(nameOffset);
  if (teamOffset + 1 >= view.byteLength) throw new ProtocolError("Missing preferred team or class");
  if (teamOffset + 2 !== view.byteLength) throw new ProtocolError("Join has trailing bytes");
  const preferredClass = view.getUint8(teamOffset + 1) as PlayerClass;
  return preferredClass === PlayerClass.None ? { name, preferredTeam: view.getUint8(teamOffset) as Team, token } : { name, preferredTeam: view.getUint8(teamOffset) as Team, preferredClass, token };
}

export function encodeWelcome(message: WelcomeMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.Welcome, 25 + WALL_SEGMENT_COUNT);
  view.setUint16(2, message.entityId, true);
  view.setUint32(4, message.serverTick, true);
  view.setUint8(8, message.tickRate);
  view.setFloat32(9, message.x, true);
  view.setFloat32(13, message.y, true);
  view.setFloat32(17, message.z, true);
  view.setUint8(21, message.team ?? Team.None);
  view.setUint8(22, message.playerClass ?? PlayerClass.None);
  view.setUint32(23, message.wallStateBits ?? 0, true);
  for (let segment = 0; segment < WALL_SEGMENT_COUNT; segment += 1) {
    view.setUint8(27 + segment, message.wallHpFrac?.[segment] ?? 16);
  }
  return buffer;
}

export function decodeWelcome(buffer: ArrayBuffer): WelcomeMessage {
  const view = expectMessage(buffer, MessageType.Welcome, 25 + WALL_SEGMENT_COUNT);
  const wallHpFrac: number[] = [];
  for (let segment = 0; segment < WALL_SEGMENT_COUNT; segment += 1) {
    wallHpFrac.push(view.getUint8(27 + segment));
  }
  return {
    entityId: view.getUint16(2, true),
    serverTick: view.getUint32(4, true),
    tickRate: view.getUint8(8),
    x: view.getFloat32(9, true),
    y: view.getFloat32(13, true),
    z: view.getFloat32(17, true),
    team: view.getUint8(21) as Team,
    playerClass: view.getUint8(22) as PlayerClass,
    wallStateBits: view.getUint32(23, true),
    wallHpFrac,
  };
}

export function encodeInput(message: InputMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.Input, 18);
  view.setUint32(2, message.seq, true);
  view.setUint32(6, message.lastSnapshotTick, true);
  view.setUint16(10, message.buttons & 0xffff, true);
  view.setInt16(12, encodeAngle(message.yaw), true);
  view.setInt16(14, encodeAngle(message.pitch), true);
  view.setUint16(16, clamp(Math.round(message.dtMs), 0, 100), true);
  // Protocol v13: the formerly reserved u16 carries the high button bits
  // (weapon slots live at 1 << 16 .. 1 << 18).
  view.setUint16(18, (message.buttons >>> 16) & 0xffff, true);
  return buffer;
}

export function decodeInput(buffer: ArrayBuffer): InputMessage {
  const view = expectExactMessage(buffer, MessageType.Input, 18);
  return {
    seq: view.getUint32(2, true),
    lastSnapshotTick: view.getUint32(6, true),
    buttons: view.getUint16(10, true) | (view.getUint16(18, true) << 16),
    yaw: decodeAngle(view.getInt16(12, true)),
    pitch: decodeAngle(view.getInt16(14, true)),
    dtMs: view.getUint16(16, true),
  };
}

export function encodeEntityJoin(message: EntityJoinMessage): ArrayBuffer {
  const name = boundedName(message.name);
  const tag = boundedTag(message.tag);
  const { buffer, view } = createMessage(MessageType.EntityJoin, 10 + name.byteLength + tag.byteLength);
  view.setUint16(2, message.entityId, true);
  writeName(view, 4, message.name);
  view.setUint8(5 + name.byteLength, message.team ?? Team.None);
  view.setUint8(6 + name.byteLength, message.rank ?? 1);
  view.setUint8(7 + name.byteLength, message.prestige ?? 0);
  view.setUint8(8 + name.byteLength, message.playerClass ?? PlayerClass.None);
  view.setUint8(9 + name.byteLength, message.kind ?? EntityKind.Player);
  view.setUint8(10 + name.byteLength, tag.byteLength);
  new Uint8Array(buffer, 11 + name.byteLength, tag.byteLength).set(tag);
  view.setUint8(11 + name.byteLength + tag.byteLength, message.bot ? 1 : 0);
  return buffer;
}

function boundedTag(tag: string | undefined): Uint8Array {
  const sanitized = (tag ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, CLAN_TAG_MAX);
  return textEncoder.encode(sanitized);
}

export function decodeEntityJoin(buffer: ArrayBuffer): EntityJoinMessage {
  const view = expectMessage(buffer, MessageType.EntityJoin, 3);
  const name = readName(view, 4);
  const teamOffset = 5 + view.getUint8(4);
  if (teamOffset + 6 > view.byteLength) throw new ProtocolError("Missing entity metadata");
  const playerClass = view.getUint8(teamOffset + 3) as PlayerClass;
  const kind = view.getUint8(teamOffset + 4) as EntityKind;
  const tagLength = view.getUint8(teamOffset + 5);
  if (tagLength > CLAN_TAG_MAX || teamOffset + 6 + tagLength > view.byteLength) throw new ProtocolError("Invalid entity tag");
  const tag = tagLength > 0 ? textDecoder.decode(new Uint8Array(view.buffer, teamOffset + 6, tagLength)) : undefined;
  const bot = view.getUint8(teamOffset + 6 + tagLength) !== 0;
  return {
    entityId: view.getUint16(2, true),
    name,
    team: view.getUint8(teamOffset) as Team,
    rank: view.getUint8(teamOffset + 1),
    prestige: view.getUint8(teamOffset + 2),
    ...(playerClass === PlayerClass.None ? {} : { playerClass }),
    ...(kind === EntityKind.Player ? {} : { kind }),
    ...(tag === undefined || tag === "" ? {} : { tag }),
    ...(bot ? { bot: true } : {}),
  };
}

export function encodeShipEvent(message: ShipEventMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.ShipEvent, 5);
  view.setUint16(2, message.vehicleEntityId, true);
  view.setUint8(4, message.eventType);
  view.setUint16(5, message.occupantEntityId, true);
  return buffer;
}

export function decodeShipEvent(buffer: ArrayBuffer): ShipEventMessage {
  const view = expectMessage(buffer, MessageType.ShipEvent, 5);
  return {
    vehicleEntityId: view.getUint16(2, true),
    eventType: view.getUint8(4) as ShipEventType,
    occupantEntityId: view.getUint16(5, true),
  };
}

export function encodeClassSelect(playerClass: PlayerClass): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.ClassSelect, 1);
  view.setUint8(2, playerClass);
  return buffer;
}

export function decodeClassSelect(buffer: ArrayBuffer): PlayerClass {
  return expectExactMessage(buffer, MessageType.ClassSelect, 1).getUint8(2) as PlayerClass;
}

export function encodeSpawnSelect(pointIndex: number): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.SpawnSelect, 1);
  view.setUint8(2, pointIndex);
  return buffer;
}

export function decodeSpawnSelect(buffer: ArrayBuffer): number {
  return expectExactMessage(buffer, MessageType.SpawnSelect, 1).getUint8(2);
}

/**
 * Phase 8e-13 (ADR 0041): the player asks to redeploy. No payload — the
 * server spawns the connection's own entity at its already-requested spawn
 * point with its already-selected class, provided it is dead and the
 * DEPLOY_MIN_SECONDS floor has elapsed. While alive it is a no-op.
 */
export function encodeDeploy(): ArrayBuffer {
  return createMessage(MessageType.Deploy, 0).buffer;
}

export function decodeDeploy(buffer: ArrayBuffer): void {
  expectExactMessage(buffer, MessageType.Deploy, 0);
}

export function encodeClassStatus(message: ClassStatusMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.ClassStatus, 3);
  view.setUint8(2, message.playerClass);
  view.setUint8(3, message.accepted ? 1 : 0);
  view.setUint8(4, message.reason);
  return buffer;
}

export function decodeClassStatus(buffer: ArrayBuffer): ClassStatusMessage {
  const view = expectMessage(buffer, MessageType.ClassStatus, 3);
  return { playerClass: view.getUint8(2) as PlayerClass, accepted: view.getUint8(3) !== 0, reason: view.getUint8(4) };
}

export function encodeWallEvent(message: WallEventMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.WallEvent, 5);
  view.setUint8(2, message.segmentId);
  view.setUint8(3, message.state);
  view.setUint16(4, message.attackerEntityId, true);
  view.setUint8(6, message.hpFrac);
  return buffer;
}

export function decodeWallEvent(buffer: ArrayBuffer): WallEventMessage {
  const view = expectMessage(buffer, MessageType.WallEvent, 5);
  return { segmentId: view.getUint8(2), state: view.getUint8(3) as WallState, attackerEntityId: view.getUint16(4, true), hpFrac: view.getUint8(6) };
}

export function encodeEntityLeave(entityId: number): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.EntityLeave, 2);
  view.setUint16(2, entityId, true);
  return buffer;
}

export function decodeEntityLeave(buffer: ArrayBuffer): number {
  return expectMessage(buffer, MessageType.EntityLeave, 2).getUint16(2, true);
}

export function encodePing(type: MessageType.Ping | MessageType.Pong, nonce: number): ArrayBuffer {
  const { buffer, view } = createMessage(type, 4);
  view.setUint32(2, nonce, true);
  return buffer;
}

export function decodePing(buffer: ArrayBuffer, type: MessageType.Ping | MessageType.Pong): number {
  return expectExactMessage(buffer, type, 4).getUint32(2, true);
}

const ACCOUNT_FIXED_BYTES = 85;

export function encodeAccount(message: AccountMessage): ArrayBuffer {
  const token = boundedToken(message.token);
  const name = boundedName(message.name);
  const { buffer, view } = createMessage(
    MessageType.Account,
    ACCOUNT_FIXED_BYTES + token.byteLength + name.byteLength,
  );
  let offset = 2;
  view.setUint32(offset, message.playerId, true); offset += 4;
  view.setUint8(offset, token.byteLength); offset += 1;
  new Uint8Array(buffer, offset, token.byteLength).set(token); offset += token.byteLength;
  view.setUint8(offset, name.byteLength); offset += 1;
  new Uint8Array(buffer, offset, name.byteLength).set(name); offset += name.byteLength;
  for (let index = 0; index < 2; index += 1) {
    const career = message.careers[index];
    if (career === undefined) throw new ProtocolError("Account careers are missing");
    view.setUint32(offset, career.xp, true); offset += 4;
    view.setUint8(offset, career.rank); offset += 1;
    view.setUint8(offset, career.prestige); offset += 1;
    view.setUint32(offset, career.headshots, true); offset += 4;
  }
  view.setUint16(offset, message.warTallyOttoman, true); offset += 2;
  view.setUint16(offset, message.warTallyByzantine, true); offset += 2;
  const lifetime = message.lifetime;
  view.setUint16(offset, lifetime.wars, true); offset += 2;
  view.setUint16(offset, lifetime.wins, true); offset += 2;
  view.setUint32(offset, lifetime.kills, true); offset += 4;
  view.setUint32(offset, lifetime.deaths, true); offset += 4;
  view.setUint32(offset, lifetime.captures, true); offset += 4;
  view.setUint16(offset, lifetime.medals, true); offset += 2;
  for (let index = 0; index < MAX_DAILY_CONTRACTS; index += 1) {
    const contract = message.contracts[index];
    if (contract === undefined) throw new ProtocolError("Account contracts are missing");
    view.setUint8(offset, contract.kind); offset += 1;
    view.setUint16(offset, contract.progress, true); offset += 2;
    view.setUint16(offset, contract.target, true); offset += 2;
    view.setUint16(offset, contract.reward, true); offset += 2;
    view.setUint8(offset, contract.completed ? 1 : 0); offset += 1;
  }
  for (let index = 0; index < MEDAL_KIND_COUNT; index += 1) {
    const medal = message.medals[index];
    if (medal === undefined) throw new ProtocolError("Account medals are missing");
    view.setUint8(offset, medal.kind); offset += 1;
    view.setUint16(offset, medal.count, true); offset += 2;
  }
  view.setUint8(offset, message.claimed ? 1 : 0); offset += 1;
  return buffer;
}

export function decodeAccount(buffer: ArrayBuffer): AccountMessage {
  const view = expectMessage(buffer, MessageType.Account, ACCOUNT_FIXED_BYTES);
  let offset = 2;
  const playerId = view.getUint32(offset, true); offset += 4;
  const tokenLength = view.getUint8(offset); offset += 1;
  if (tokenLength > MAX_TOKEN_BYTES || offset + tokenLength + 1 > view.byteLength) throw new ProtocolError("Account token is truncated");
  const token = textDecoder.decode(new Uint8Array(view.buffer, offset, tokenLength)); offset += tokenLength;
  const nameLength = view.getUint8(offset); offset += 1;
  if (nameLength > MAX_NAME_BYTES || offset + nameLength > view.byteLength) throw new ProtocolError("Account name is truncated");
  const name = textDecoder.decode(new Uint8Array(view.buffer, offset, nameLength)); offset += nameLength;
  const careers: CareerInfo[] = [];
  for (let index = 0; index < 2; index += 1) {
    const xp = view.getUint32(offset, true); offset += 4;
    const rank = view.getUint8(offset); offset += 1;
    const prestige = view.getUint8(offset); offset += 1;
    const headshots = view.getUint32(offset, true); offset += 4;
    careers.push({ xp, rank, prestige, headshots });
  }
  const warTallyOttoman = view.getUint16(offset, true); offset += 2;
  const warTallyByzantine = view.getUint16(offset, true); offset += 2;
  const wars = view.getUint16(offset, true); offset += 2;
  const wins = view.getUint16(offset, true); offset += 2;
  const kills = view.getUint32(offset, true); offset += 4;
  const deaths = view.getUint32(offset, true); offset += 4;
  const captures = view.getUint32(offset, true); offset += 4;
  const medals = view.getUint16(offset, true); offset += 2;
  const contracts: ContractState[] = [];
  for (let index = 0; index < MAX_DAILY_CONTRACTS; index += 1) {
    const kind = view.getUint8(offset); offset += 1;
    const progress = view.getUint16(offset, true); offset += 2;
    const target = view.getUint16(offset, true); offset += 2;
    const reward = view.getUint16(offset, true); offset += 2;
    const completed = view.getUint8(offset) !== 0; offset += 1;
    contracts.push({ kind, progress, target, reward, completed });
  }
  const medalCounts: MedalCount[] = [];
  for (let index = 0; index < MEDAL_KIND_COUNT; index += 1) {
    const kind = view.getUint8(offset); offset += 1;
    const count = view.getUint16(offset, true); offset += 2;
    medalCounts.push({ kind, count });
  }
  const claimed = view.getUint8(offset) !== 0; offset += 1;
  if (offset !== view.byteLength) throw new ProtocolError("Account has trailing bytes");
  return {
    playerId,
    token,
    name,
    careers,
    warTallyOttoman,
    warTallyByzantine,
    lifetime: { wars, wins, kills, deaths, captures, medals },
    contracts,
    medals: medalCounts,
    claimed,
  };
}

function boundedChat(text: string): Uint8Array {
  const encoded = textEncoder.encode(text);
  return encoded.byteLength <= MAX_CHAT_BYTES ? encoded : encoded.slice(0, MAX_CHAT_BYTES);
}

export function encodeChatSend(message: ChatSendMessage): ArrayBuffer {
  const text = boundedChat(message.text);
  const { buffer, view } = createMessage(MessageType.ChatSend, 3 + text.byteLength);
  view.setUint8(2, message.channel);
  view.setUint16(3, text.byteLength, true);
  new Uint8Array(buffer, 5, text.byteLength).set(text);
  return buffer;
}

export function decodeChatSend(buffer: ArrayBuffer): ChatSendMessage {
  const view = expectMessage(buffer, MessageType.ChatSend, 3);
  const channel = view.getUint8(2) as ChatChannel;
  const length = view.getUint16(3, true);
  if ((channel !== ChatChannel.Team && channel !== ChatChannel.All) || length > MAX_CHAT_BYTES || 5 + length !== view.byteLength) throw new ProtocolError("Invalid chat message");
  return { channel, text: textDecoder.decode(new Uint8Array(buffer, 5, length)) };
}

export function encodeChatMessage(message: ChatMessage): ArrayBuffer {
  const name = boundedName(message.name);
  const chat = boundedChat(message.text);
  const { buffer, view } = createMessage(MessageType.ChatMessage, 16 + name.byteLength + chat.byteLength);
  let offset = 2;
  view.setUint32(offset, message.messageId, true); offset += 4;
  view.setUint32(offset, message.playerId, true); offset += 4;
  view.setUint8(offset, message.channel); offset += 1;
  view.setUint32(offset, Math.floor(message.createdAt / 1000), true); offset += 4;
  view.setUint8(offset, name.byteLength); offset += 1;
  new Uint8Array(buffer, offset, name.byteLength).set(name); offset += name.byteLength;
  view.setUint16(offset, chat.byteLength, true); offset += 2;
  new Uint8Array(buffer, offset, chat.byteLength).set(chat);
  return buffer;
}

export function decodeChatMessage(buffer: ArrayBuffer): ChatMessage {
  const view = expectMessage(buffer, MessageType.ChatMessage, 16);
  let offset = 2;
  const messageId = view.getUint32(offset, true); offset += 4;
  const playerId = view.getUint32(offset, true); offset += 4;
  const channel = view.getUint8(offset) as ChatChannel; offset += 1;
  const createdAt = view.getUint32(offset, true) * 1000; offset += 4;
  const nameLength = view.getUint8(offset); offset += 1;
  if (nameLength > MAX_NAME_BYTES || offset + nameLength + 2 > view.byteLength) throw new ProtocolError("Invalid chat sender");
  const name = textDecoder.decode(new Uint8Array(buffer, offset, nameLength)); offset += nameLength;
  const textLength = view.getUint16(offset, true); offset += 2;
  if (textLength > MAX_CHAT_BYTES || offset + textLength !== view.byteLength) throw new ProtocolError("Invalid chat text");
  return { messageId, playerId, channel, name, text: textDecoder.decode(new Uint8Array(buffer, offset, textLength)), createdAt };
}

export function encodeChatNotice(message: ChatNoticeMessage): ArrayBuffer {
  const chat = boundedChat(message.text);
  const { buffer, view } = createMessage(MessageType.ChatNotice, 3 + chat.byteLength);
  view.setUint8(2, message.code);
  view.setUint16(3, chat.byteLength, true);
  new Uint8Array(buffer, 5, chat.byteLength).set(chat);
  return buffer;
}

export function decodeChatNotice(buffer: ArrayBuffer): ChatNoticeMessage {
  const view = expectMessage(buffer, MessageType.ChatNotice, 3);
  const length = view.getUint16(3, true);
  if (length > MAX_CHAT_BYTES || 5 + length !== view.byteLength) throw new ProtocolError("Invalid chat notice");
  return { code: view.getUint8(2) as ChatNoticeCode, text: textDecoder.decode(new Uint8Array(buffer, 5, length)) };
}

export function encodeChatReport(messageId: number): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.ChatReport, 4);
  view.setUint32(2, messageId, true);
  return buffer;
}

export function decodeChatReport(buffer: ArrayBuffer): number {
  return expectExactMessage(buffer, MessageType.ChatReport, 4).getUint32(2, true);
}

export function encodeXpEvent(message: XpEventMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.XpEvent, 15);
  view.setUint16(2, message.amount, true);
  view.setUint32(4, message.totalXp, true);
  view.setUint8(8, message.faction);
  view.setUint8(9, message.rank);
  view.setUint8(10, message.prestige);
  view.setUint8(11, message.leveled ? 1 : 0);
  view.setUint8(12, message.prestiged ? 1 : 0);
  view.setUint8(13, message.source);
  view.setUint8(14, message.headshot ? 1 : 0);
  return buffer;
}

export function decodeXpEvent(buffer: ArrayBuffer): XpEventMessage {
  const view = expectMessage(buffer, MessageType.XpEvent, 15);
  return {
    amount: view.getUint16(2, true),
    totalXp: view.getUint32(4, true),
    faction: view.getUint8(8) as Team,
    rank: view.getUint8(9),
    prestige: view.getUint8(10),
    leveled: view.getUint8(11) !== 0,
    prestiged: view.getUint8(12) !== 0,
    source: view.getUint8(13),
    headshot: view.getUint8(14) !== 0,
  };
}

export function encodeContractEvent(message: ContractEventMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.ContractEvent, 9);
  view.setUint8(2, message.slot);
  view.setUint8(3, message.kind);
  view.setUint16(4, message.progress, true);
  view.setUint16(6, message.target, true);
  view.setUint16(8, message.reward, true);
  view.setUint8(10, message.completed ? 1 : 0);
  return buffer;
}

export function decodeContractEvent(buffer: ArrayBuffer): ContractEventMessage {
  const view = expectMessage(buffer, MessageType.ContractEvent, 9);
  return {
    slot: view.getUint8(2),
    kind: view.getUint8(3),
    progress: view.getUint16(4, true),
    target: view.getUint16(6, true),
    reward: view.getUint16(8, true),
    completed: view.getUint8(10) !== 0,
  };
}

export function encodeWarSummary(message: WarSummaryMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.WarSummary, 26);
  view.setUint8(2, message.winner);
  view.setUint16(3, message.warTallyOttoman, true);
  view.setUint16(5, message.warTallyByzantine, true);
  view.setUint16(7, message.kills, true);
  view.setUint16(9, message.deaths, true);
  view.setUint16(11, message.assists, true);
  view.setUint16(13, message.captures, true);
  view.setUint16(15, message.shots, true);
  view.setUint16(17, message.hits, true);
  view.setUint16(19, message.defenseKills, true);
  view.setUint16(21, message.captureSeconds, true);
  view.setUint16(23, message.warXpEarned, true);
  view.setUint16(25, message.welcomeBackBonus, true);
  view.setUint8(27, message.medalMask);
  return buffer;
}

export function decodeWarSummary(buffer: ArrayBuffer): WarSummaryMessage {
  const view = expectMessage(buffer, MessageType.WarSummary, 26);
  return {
    winner: view.getUint8(2) as Team,
    warTallyOttoman: view.getUint16(3, true),
    warTallyByzantine: view.getUint16(5, true),
    kills: view.getUint16(7, true),
    deaths: view.getUint16(9, true),
    assists: view.getUint16(11, true),
    captures: view.getUint16(13, true),
    shots: view.getUint16(15, true),
    hits: view.getUint16(17, true),
    defenseKills: view.getUint16(19, true),
    captureSeconds: view.getUint16(21, true),
    warXpEarned: view.getUint16(23, true),
    welcomeBackBonus: view.getUint16(25, true),
    medalMask: view.getUint8(27),
  };
}

export function encodeMedalUnlock(message: MedalUnlockMessage): ArrayBuffer {
  const name = boundedName(message.name);
  const { buffer, view } = createMessage(MessageType.MedalUnlock, 4 + name.byteLength);
  view.setUint8(2, message.category);
  view.setUint8(3, message.tier);
  writeName(view, 4, message.name);
  return buffer;
}

export function decodeMedalUnlock(buffer: ArrayBuffer): MedalUnlockMessage {
  const view = expectMessage(buffer, MessageType.MedalUnlock, 4);
  const category = view.getUint8(2);
  const tier = view.getUint8(3) as MedalTier;
  const name = readName(view, 4);
  return { category, tier, name };
}

export function encodeMedalState(message: MedalStateMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.MedalState, 4 + MEDAL_CATEGORY_COUNT * 6);
  view.setUint32(2, message.wars, true);
  let offset = 6;
  for (let index = 0; index < MEDAL_CATEGORY_COUNT; index += 1) {
    const counter = message.counters[index];
    if (counter === undefined) throw new ProtocolError("Medal counters are missing");
    view.setUint8(offset, counter.category); offset += 1;
    view.setUint32(offset, counter.value, true); offset += 4;
    view.setUint8(offset, counter.tier); offset += 1;
  }
  return buffer;
}

export function decodeMedalState(buffer: ArrayBuffer): MedalStateMessage {
  const view = expectMessage(buffer, MessageType.MedalState, 4 + MEDAL_CATEGORY_COUNT * 6);
  const wars = view.getUint32(2, true);
  const counters: MedalCounterState[] = [];
  let offset = 6;
  for (let index = 0; index < MEDAL_CATEGORY_COUNT; index += 1) {
    const category = view.getUint8(offset); offset += 1;
    const value = view.getUint32(offset, true); offset += 4;
    const tier = view.getUint8(offset); offset += 1;
    counters.push({ category, value, tier });
  }
  if (offset !== view.byteLength) throw new ProtocolError("Medal state has trailing bytes");
  return { wars, counters };
}

function boundedClanName(name: string): Uint8Array {
  const sanitized = name.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, CLAN_NAME_MAX);
  return textEncoder.encode(sanitized || "Clan");
}

export function encodeClanState(message: ClanStateMessage): ArrayBuffer {
  const name = boundedClanName(message.name);
  const tag = boundedTag(message.tag);
  const { buffer, view } = createMessage(MessageType.ClanState, 13 + name.byteLength + tag.byteLength);
  let offset = 2;
  view.setUint32(offset, message.clanId, true); offset += 4;
  view.setUint8(offset, name.byteLength); offset += 1;
  new Uint8Array(buffer, offset, name.byteLength).set(name); offset += name.byteLength;
  view.setUint8(offset, tag.byteLength); offset += 1;
  new Uint8Array(buffer, offset, tag.byteLength).set(tag); offset += tag.byteLength;
  view.setUint32(offset, message.founderPlayerId, true); offset += 4;
  view.setUint16(offset, message.memberCount, true); offset += 2;
  view.setUint8(offset, message.role); offset += 1;
  return buffer;
}

export function decodeClanState(buffer: ArrayBuffer): ClanStateMessage {
  const view = expectMessage(buffer, MessageType.ClanState, 13);
  let offset = 2;
  const clanId = view.getUint32(offset, true); offset += 4;
  const nameLength = view.getUint8(offset); offset += 1;
  if (nameLength > CLAN_NAME_MAX || offset + nameLength > view.byteLength) throw new ProtocolError("Invalid clan name");
  const name = textDecoder.decode(new Uint8Array(view.buffer, offset, nameLength)); offset += nameLength;
  const tagLength = view.getUint8(offset); offset += 1;
  if (tagLength > CLAN_TAG_MAX || offset + tagLength + 7 > view.byteLength) throw new ProtocolError("Invalid clan tag");
  const tag = textDecoder.decode(new Uint8Array(view.buffer, offset, tagLength)); offset += tagLength;
  const founderPlayerId = view.getUint32(offset, true); offset += 4;
  const memberCount = view.getUint16(offset, true); offset += 2;
  const role = view.getUint8(offset); offset += 1;
  if (offset !== view.byteLength) throw new ProtocolError("Clan state has trailing bytes");
  return { clanId, name, tag, founderPlayerId, memberCount, role };
}

export function encodeBlockedIds(message: BlockedIdsMessage): ArrayBuffer {
  const count = Math.min(message.blockedIds.length, 0xff);
  const { buffer, view } = createMessage(MessageType.BlockedIds, 3 + count * 2);
  view.setUint8(2, count);
  for (let index = 0; index < count; index += 1) view.setUint16(3 + index * 2, message.blockedIds[index] ?? 0, true);
  return buffer;
}

export function decodeBlockedIds(buffer: ArrayBuffer): BlockedIdsMessage {
  const view = expectMessage(buffer, MessageType.BlockedIds, 3);
  const count = view.getUint8(2);
  if (3 + count * 2 > view.byteLength) throw new ProtocolError("Blocked ids truncated");
  const blockedIds: number[] = [];
  for (let index = 0; index < count; index += 1) blockedIds.push(view.getUint16(3 + index * 2, true));
  return { blockedIds };
}

export function encodeSquadState(message: SquadStateMessage): ArrayBuffer {
  const count = Math.min(message.memberEntityIds.length, 0xff);
  const { buffer, view } = createMessage(MessageType.SquadState, 7 + count * 2);
  view.setUint32(2, message.squadId, true);
  view.setUint8(6, count);
  for (let index = 0; index < count; index += 1) view.setUint16(7 + index * 2, message.memberEntityIds[index] ?? 0, true);
  return buffer;
}

export function decodeSquadState(buffer: ArrayBuffer): SquadStateMessage {
  const view = expectMessage(buffer, MessageType.SquadState, 7);
  const squadId = view.getUint32(2, true);
  const count = view.getUint8(6);
  if (7 + count * 2 > view.byteLength) throw new ProtocolError("Squad state truncated");
  const memberEntityIds: number[] = [];
  for (let index = 0; index < count; index += 1) memberEntityIds.push(view.getUint16(7 + index * 2, true));
  return { squadId, memberEntityIds };
}

export function encodeSquadCommand(message: SquadCommandMessage): ArrayBuffer {
  const { buffer, view } = createMessage(MessageType.SquadCommand, 7);
  view.setUint8(2, message.op);
  view.setUint32(3, message.targetPlayerId, true);
  return buffer;
}

export function decodeSquadCommand(buffer: ArrayBuffer): SquadCommandMessage {
  // Fixed-size client message: exact framing per SEC-006 (Phase 8e-4b closed
  // the audit finding MED-2 — previously expectMessage let trailing bytes
  // through). Payload is 7 bytes: op + targetPlayerId + 2 reserved bytes.
  const view = expectExactMessage(buffer, MessageType.SquadCommand, 7);
  return { op: view.getUint8(2) as SquadOp, targetPlayerId: view.getUint32(3, true) };
}

function equalGameplay(a: EntityState, b: EntityState): boolean {
  return (a.team ?? Team.None) === (b.team ?? Team.None) && (a.health ?? 0) === (b.health ?? 0)
    && (a.flags ?? 0) === (b.flags ?? 0) && (a.ammo ?? 0) === (b.ammo ?? 0)
    && (a.reloadTicks ?? 0) === (b.reloadTicks ?? 0) && (a.respawnTicks ?? 0) === (b.respawnTicks ?? 0)
    && (a.kills ?? 0) === (b.kills ?? 0) && (a.deaths ?? 0) === (b.deaths ?? 0)
    && (a.assists ?? 0) === (b.assists ?? 0) && (a.captureSeconds ?? 0) === (b.captureSeconds ?? 0)
    && (a.weaponSlot ?? DEFAULT_WEAPON_SLOT) === (b.weaponSlot ?? DEFAULT_WEAPON_SLOT)
    && (a.weaponSwitchTicks ?? 0) === (b.weaponSwitchTicks ?? 0);
}

function equalVehicle(a: EntityState, b: EntityState): boolean {
  return (a.playerClass ?? PlayerClass.None) === (b.playerClass ?? PlayerClass.None)
    && Boolean(a.mounted) === Boolean(b.mounted)
    && (a.horseHp ?? 0) === (b.horseHp ?? 0);
}

function equalShip(a: EntityState, b: EntityState): boolean {
  return (a.shipKind ?? EntityKind.Player) === (b.shipKind ?? EntityKind.Player)
    && (a.shipHullHp ?? 0) === (b.shipHullHp ?? 0)
    && (a.shipState ?? 0) === (b.shipState ?? 0)
    && ((a.shipKind ?? EntityKind.Player) !== EntityKind.SiegeCannon
      || ((a.cannonGunYaw ?? 0) === (b.cannonGunYaw ?? 0) && (a.cannonGunPitch ?? 0) === (b.cannonGunPitch ?? 0)))
    && ((a.shipKind ?? EntityKind.Player) !== EntityKind.Galley
      || ((a.shipGun1Yaw ?? 0) === (b.shipGun1Yaw ?? 0) && (a.shipGun2Yaw ?? 0) === (b.shipGun2Yaw ?? 0)));
}

function portableValues(state: EntityState): { torch: number; earthwork: number } {
  return { torch: (state.torch ?? 0) !== 0 ? 1 : 0, earthwork: state.earthworkKind ?? 0 };
}

function writeStateRecord(
  view: DataView,
  initialOffset: number,
  entityId: number,
  state: EntityState,
  previous: EntityState | undefined,
): number {
  if (entityId < 0 || entityId > MAX_ENTITY_ID) throw new ProtocolError("Entity id out of range");
  const positionX = encodePosition(state.x);
  const positionY = encodePosition(state.y);
  const positionZ = encodePosition(state.z);
  const yaw = encodeAngle(state.yaw);
  const pitch = encodeAngle(state.pitch);
  let fields = 0;
  if (previous === undefined || state.x !== previous.x || state.y !== previous.y || state.z !== previous.z) fields |= SnapshotField.Position;
  if (previous === undefined || state.yaw !== previous.yaw) fields |= SnapshotField.Yaw;
  if (previous === undefined || state.pitch !== previous.pitch) fields |= SnapshotField.Pitch;
  if (previous === undefined || !equalGameplay(state, previous)) fields |= SnapshotField.Gameplay;
  if (previous === undefined || !equalVehicle(state, previous)) fields |= SnapshotField.Vehicle;
  if (previous === undefined || !equalShip(state, previous)) fields |= SnapshotField.Ship;
  const portable = portableValues(state);
  if (previous === undefined
    ? portable.torch !== 0 || portable.earthwork !== 0
    : (previous.torch ?? 0) !== portable.torch || (previous.earthworkKind ?? 0) !== portable.earthwork) fields |= SnapshotField.Torch;
  if (fields === 0) return initialOffset;

  let offset = initialOffset;
  view.setUint16(offset, entityId, true);
  view.setUint8(offset + 2, fields);
  offset += 3;
  if ((fields & SnapshotField.Position) !== 0) {
    view.setInt16(offset, positionX, true);
    view.setInt16(offset + 2, positionY, true);
    view.setInt16(offset + 4, positionZ, true);
    offset += 6;
  }
  if ((fields & SnapshotField.Yaw) !== 0) {
    view.setInt16(offset, yaw, true);
    offset += 2;
  }
  if ((fields & SnapshotField.Pitch) !== 0) {
    view.setInt16(offset, pitch, true);
    offset += 2;
  }
  if ((fields & SnapshotField.Gameplay) !== 0) {
    view.setUint8(offset, state.team ?? Team.None);
    view.setUint8(offset + 1, state.health ?? 0);
    view.setUint16(offset + 2, state.flags ?? 0, true);
    view.setUint8(offset + 4, state.ammo ?? 0);
    view.setUint8(offset + 5, state.reloadTicks ?? 0);
    view.setUint8(offset + 6, state.respawnTicks ?? 0);
    view.setUint8(offset + 7, state.kills ?? 0);
    view.setUint8(offset + 8, state.deaths ?? 0);
    view.setUint8(offset + 9, state.assists ?? 0);
    view.setUint16(offset + 10, state.captureSeconds ?? 0, true);
    // v13: weapon slot (2 bits) + switch ticks remaining (6 bits).
    view.setUint8(offset + 12, ((state.weaponSlot ?? DEFAULT_WEAPON_SLOT) & 0x3) | ((Math.min(63, state.weaponSwitchTicks ?? 0) & 0x3f) << 2));
    offset += 13;
  }
  if ((fields & SnapshotField.Vehicle) !== 0) {
    view.setUint8(offset, state.playerClass ?? PlayerClass.None);
    view.setUint8(offset + 1, state.mounted ? 1 : 0);
    view.setUint8(offset + 2, state.horseHp ?? 0);
    offset += 3;
  }
  if ((fields & SnapshotField.Ship) !== 0) {
    view.setUint8(offset, state.shipKind ?? EntityKind.Player);
    view.setUint8(offset + 1, Math.min(255, Math.round((state.shipHullHp ?? 0) / 10)));
    view.setUint8(offset + 2, state.shipState ?? 0);
    if (state.shipKind === EntityKind.SiegeCannon) {
      view.setInt16(offset + 3, encodeAngle(state.cannonGunYaw ?? 0), true);
      view.setInt16(offset + 5, encodeAngle(state.cannonGunPitch ?? 0), true);
      offset += 7;
    } else if (state.shipKind === EntityKind.Galley) {
      view.setInt16(offset + 3, encodeAngle(state.shipGun1Yaw ?? 0), true);
      view.setInt16(offset + 5, encodeAngle(state.shipGun2Yaw ?? 0), true);
      offset += 7;
    } else offset += 3;
  }
  if ((fields & SnapshotField.Torch) !== 0) {
    // Torch on/off for players; the earthwork subkind for earthwork entities.
    view.setUint8(offset, portable.earthwork !== 0 ? portable.earthwork : portable.torch);
    offset += 1;
  }
  return offset;
}

function writeSnapshotSelection(
  buffer: ArrayBuffer,
  tick: number,
  ackInputSeq: number,
  currentStates: ReadonlyMap<number, EntityState>,
  currentIds: ReadonlySet<number> | undefined,
  baseTick: number,
  baselineStates: ReadonlyMap<number, EntityState> | undefined,
  baselineIds: ReadonlySet<number> | undefined,
  meta: SnapshotMeta = EMPTY_SNAPSHOT_META,
): number {
  if (meta.events.length > 32) throw new ProtocolError("Too many snapshot events");
  const currentSize = currentIds?.size ?? currentStates.size;
  const baselineSize = baselineStates === undefined ? 0 : baselineIds?.size ?? baselineStates.size;
  const requiredBytes = 31 + (currentSize + baselineSize) * 38 + meta.events.length * 8 + (meta.points?.length ?? 0) * 3;
  if (buffer.byteLength < requiredBytes) throw new ProtocolError("Snapshot buffer is too small");
  const view = new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MessageType.Snapshot);
  view.setUint32(2, tick, true);
  view.setUint32(6, ackInputSeq, true);
  view.setUint32(10, baselineStates === undefined ? 0 : baseTick, true);
  let offset = 16;
  let count = 0;

  if (currentIds === undefined) {
    for (const [entityId, state] of currentStates) {
      const nextOffset = writeStateRecord(view, offset, entityId, state, baselineStates?.get(entityId));
      if (nextOffset !== offset) count += 1;
      offset = nextOffset;
    }
  } else {
    for (const entityId of currentIds) {
      const state = currentStates.get(entityId);
      if (state === undefined) continue;
      const previous = baselineIds === undefined || baselineIds.has(entityId) ? baselineStates?.get(entityId) : undefined;
      const nextOffset = writeStateRecord(view, offset, entityId, state, previous);
      if (nextOffset !== offset) count += 1;
      offset = nextOffset;
    }
  }

  if (baselineStates !== undefined) {
    const removedCandidates = baselineIds ?? baselineStates.keys();
    for (const entityId of removedCandidates) {
      if (currentIds?.has(entityId) ?? currentStates.has(entityId)) continue;
      view.setUint16(offset, entityId, true);
      view.setUint8(offset + 2, SnapshotField.Removed);
      offset += 3;
      count += 1;
    }
  }
  view.setUint16(14, count, true);
  const points = meta.points !== undefined && meta.points.length > 0 ? meta.points : [{ owner: meta.captureOwner, progress: meta.captureProgress }];
  view.setUint8(offset, points.length);
  offset += 1;
  for (const point of points) {
    view.setUint8(offset, point.owner);
    view.setInt16(offset + 1, point.progress, true);
    offset += 3;
  }
  view.setUint16(offset, meta.ottomanTickets, true);
  view.setUint16(offset + 2, meta.byzantineTickets, true);
  view.setUint8(offset + 4, meta.roundPhase);
  view.setUint16(offset + 5, meta.phaseRemainingTicks, true);
  view.setUint8(offset + 7, meta.events.length);
  offset += 8;
  for (const event of meta.events) {
    view.setUint16(offset, event.id, true);
    view.setUint8(offset + 2, event.type);
    view.setUint16(offset + 3, event.sourceEntityId, true);
    view.setUint16(offset + 5, event.targetEntityId, true);
    view.setUint8(offset + 7, event.value);
    offset += 8;
  }
  return offset;
}

export function encodeSnapshot(
  tick: number,
  ackInputSeq: number,
  current: ReadonlyMap<number, EntityState>,
  baseTick: number,
  baseline?: ReadonlyMap<number, EntityState>,
  meta: SnapshotMeta = EMPTY_SNAPSHOT_META,
): ArrayBuffer {
  const buffer = new ArrayBuffer(31 + (current.size + (baseline?.size ?? 0)) * 38 + meta.events.length * 8 + (meta.points?.length ?? 0) * 3);
  const byteLength = writeSnapshotSelection(buffer, tick, ackInputSeq, current, undefined, baseTick, baseline, undefined, meta);
  return buffer.slice(0, byteLength);
}

export function encodeSnapshotInto(
  buffer: ArrayBuffer,
  tick: number,
  ackInputSeq: number,
  current: ReadonlyMap<number, EntityState>,
  baseTick: number,
  baseline?: ReadonlyMap<number, EntityState>,
  meta: SnapshotMeta = EMPTY_SNAPSHOT_META,
): number {
  return writeSnapshotSelection(buffer, tick, ackInputSeq, current, undefined, baseTick, baseline, undefined, meta);
}

/**
 * Phase 8e-25: exact bytes needed for a snapshot delta — fixed header +
 * 38 bytes per current entity + 38 per baseline entity + 8 per event. The
 * server sizes its template buffer from this so capacity math lives beside
 * the encoder (the old 16 KiB template threw inside the tick loop at the
 * near-capacity worst case).
 */
export function snapshotDeltaBytes(currentEntities: number, baselineEntities: number, events: number): number {
  return 31 + (currentEntities + baselineEntities) * 38 + events * 8;
}

export function encodeInterestSnapshotInto(
  buffer: ArrayBuffer,
  tick: number,
  ackInputSeq: number,
  currentStates: ReadonlyMap<number, EntityState>,
  currentIds: ReadonlySet<number>,
  baseTick: number,
  baselineStates: ReadonlyMap<number, EntityState> | undefined,
  baselineIds: ReadonlySet<number> | undefined,
  meta: SnapshotMeta = EMPTY_SNAPSHOT_META,
  reuseView?: DataView,
): number {
  if (meta.events.length > 32) throw new ProtocolError("Too many snapshot events");
  const baselineSize = baselineStates === undefined ? 0 : baselineIds?.size ?? baselineStates.size;
  if (buffer.byteLength < snapshotDeltaBytes(currentIds.size, baselineSize, meta.events.length)) {
    throw new ProtocolError("Snapshot buffer is too small");
  }
  const view = reuseView ?? new DataView(buffer);
  view.setUint8(0, PROTOCOL_VERSION);
  view.setUint8(1, MessageType.Snapshot);
  view.setUint32(2, tick, true);
  view.setUint32(6, ackInputSeq, true);
  view.setUint32(10, baselineStates === undefined ? 0 : baseTick, true);
  let offset = 16;
  let count = 0;

  for (const entityId of currentIds) {
    const state = currentStates.get(entityId);
    if (state === undefined) continue;
    const previous = baselineIds === undefined || baselineIds.has(entityId) ? baselineStates?.get(entityId) : undefined;
    const positionX = encodePosition(state.x);
    const positionY = encodePosition(state.y);
    const positionZ = encodePosition(state.z);
    const yaw = encodeAngle(state.yaw);
    const pitch = encodeAngle(state.pitch);
    let fields = 0;
    if (previous === undefined || state.x !== previous.x || state.y !== previous.y || state.z !== previous.z) fields |= SnapshotField.Position;
    if (previous === undefined || state.yaw !== previous.yaw) fields |= SnapshotField.Yaw;
    if (previous === undefined || state.pitch !== previous.pitch) fields |= SnapshotField.Pitch;
    if (previous === undefined || !equalGameplay(state, previous)) fields |= SnapshotField.Gameplay;
    if (previous === undefined || !equalVehicle(state, previous)) fields |= SnapshotField.Vehicle;
    if (previous === undefined || !equalShip(state, previous)) fields |= SnapshotField.Ship;
    const portable = portableValues(state);
    if (previous === undefined
      ? portable.torch !== 0 || portable.earthwork !== 0
      : (previous.torch ?? 0) !== portable.torch || (previous.earthworkKind ?? 0) !== portable.earthwork) fields |= SnapshotField.Torch;
    if (fields === 0) continue;
    view.setUint16(offset, entityId, true);
    view.setUint8(offset + 2, fields);
    offset += 3;
    if ((fields & SnapshotField.Position) !== 0) {
      view.setInt16(offset, positionX, true);
      view.setInt16(offset + 2, positionY, true);
      view.setInt16(offset + 4, positionZ, true);
      offset += 6;
    }
    if ((fields & SnapshotField.Yaw) !== 0) {
      view.setInt16(offset, yaw, true);
      offset += 2;
    }
    if ((fields & SnapshotField.Pitch) !== 0) {
      view.setInt16(offset, pitch, true);
      offset += 2;
    }
    if ((fields & SnapshotField.Gameplay) !== 0) {
      view.setUint8(offset, state.team ?? Team.None);
      view.setUint8(offset + 1, state.health ?? 0);
      view.setUint16(offset + 2, state.flags ?? 0, true);
      view.setUint8(offset + 4, state.ammo ?? 0);
      view.setUint8(offset + 5, state.reloadTicks ?? 0);
      view.setUint8(offset + 6, state.respawnTicks ?? 0);
      view.setUint8(offset + 7, state.kills ?? 0);
      view.setUint8(offset + 8, state.deaths ?? 0);
      view.setUint8(offset + 9, state.assists ?? 0);
      view.setUint16(offset + 10, state.captureSeconds ?? 0, true);
      // v13: weapon slot (2 bits) + switch ticks remaining (6 bits).
      view.setUint8(offset + 12, ((state.weaponSlot ?? DEFAULT_WEAPON_SLOT) & 0x3) | ((Math.min(63, state.weaponSwitchTicks ?? 0) & 0x3f) << 2));
      offset += 13;
    }
    if ((fields & SnapshotField.Vehicle) !== 0) {
      view.setUint8(offset, state.playerClass ?? PlayerClass.None);
      view.setUint8(offset + 1, state.mounted ? 1 : 0);
      view.setUint8(offset + 2, state.horseHp ?? 0);
      offset += 3;
    }
    if ((fields & SnapshotField.Ship) !== 0) {
      view.setUint8(offset, state.shipKind ?? EntityKind.Player);
      view.setUint8(offset + 1, Math.min(255, Math.round((state.shipHullHp ?? 0) / 10)));
      view.setUint8(offset + 2, state.shipState ?? 0);
      if (state.shipKind === EntityKind.SiegeCannon) {
        view.setInt16(offset + 3, encodeAngle(state.cannonGunYaw ?? 0), true);
        view.setInt16(offset + 5, encodeAngle(state.cannonGunPitch ?? 0), true);
        offset += 7;
      } else if (state.shipKind === EntityKind.Galley) {
        view.setInt16(offset + 3, encodeAngle(state.shipGun1Yaw ?? 0), true);
        view.setInt16(offset + 5, encodeAngle(state.shipGun2Yaw ?? 0), true);
        offset += 7;
      } else offset += 3;
    }
    if ((fields & SnapshotField.Torch) !== 0) {
      // Torch on/off for players; the earthwork subkind for earthwork entities.
      view.setUint8(offset, portable.earthwork !== 0 ? portable.earthwork : portable.torch);
      offset += 1;
    }
    count += 1;
  }
  if (baselineStates !== undefined) {
    for (const entityId of baselineIds ?? baselineStates.keys()) {
      if (currentIds.has(entityId)) continue;
      view.setUint16(offset, entityId, true);
      view.setUint8(offset + 2, SnapshotField.Removed);
      offset += 3;
      count += 1;
    }
  }
  view.setUint16(14, count, true);
  const points = meta.points !== undefined && meta.points.length > 0 ? meta.points : [{ owner: meta.captureOwner, progress: meta.captureProgress }];
  view.setUint8(offset, points.length);
  offset += 1;
  for (const point of points) {
    view.setUint8(offset, point.owner);
    view.setInt16(offset + 1, point.progress, true);
    offset += 3;
  }
  view.setUint16(offset, meta.ottomanTickets, true);
  view.setUint16(offset + 2, meta.byzantineTickets, true);
  view.setUint8(offset + 4, meta.roundPhase);
  view.setUint16(offset + 5, meta.phaseRemainingTicks, true);
  view.setUint8(offset + 7, meta.events.length);
  offset += 8;
  for (const event of meta.events) {
    view.setUint16(offset, event.id, true);
    view.setUint8(offset + 2, event.type);
    view.setUint16(offset + 3, event.sourceEntityId, true);
    view.setUint16(offset + 5, event.targetEntityId, true);
    view.setUint8(offset + 7, event.value);
    offset += 8;
  }
  return offset;
}

export function decodeSnapshot(buffer: ArrayBuffer, baseline?: Snapshot): Snapshot {
  const view = expectMessage(buffer, MessageType.Snapshot, 14);
  const tick = view.getUint32(2, true);
  const ackInputSeq = view.getUint32(6, true);
  const baseTick = view.getUint32(10, true);
  const recordCount = view.getUint16(14, true);
  if (baseTick !== 0 && baseline?.tick !== baseTick) throw new ProtocolError("Snapshot baseline unavailable");
  const entities = new Map<number, EntityState>();
  if (baseline !== undefined && baseTick !== 0) {
    for (const [id, state] of baseline.entities) entities.set(id, { ...state });
  }
  let offset = 16;

  for (let index = 0; index < recordCount; index += 1) {
    if (offset + 3 > view.byteLength) throw new ProtocolError("Snapshot record is truncated");
    const entityId = view.getUint16(offset, true);
    const fields = view.getUint8(offset + 2);
    offset += 3;
    if ((fields & SnapshotField.Removed) !== 0) {
      entities.delete(entityId);
      continue;
    }
    const previous = entities.get(entityId);
    const state: EntityState = previous === undefined
      ? { entityId, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, team: Team.None, health: 0, flags: 0, ammo: 0, reloadTicks: 0, weaponSlot: DEFAULT_WEAPON_SLOT, weaponSwitchTicks: 0, respawnTicks: 0, kills: 0, deaths: 0, assists: 0, captureSeconds: 0, playerClass: PlayerClass.None, mounted: false, horseHp: 0, shipKind: EntityKind.Player, shipHullHp: 0, shipState: 0, cannonGunYaw: 0, cannonGunPitch: 0, shipGun1Yaw: 0, shipGun2Yaw: 0, torch: 0, earthworkKind: 0 }
      : { ...previous };
    if ((fields & SnapshotField.Position) !== 0) {
      if (offset + 6 > view.byteLength) throw new ProtocolError("Position is truncated");
      state.x = decodePosition(view.getInt16(offset, true));
      state.y = decodePosition(view.getInt16(offset + 2, true));
      state.z = decodePosition(view.getInt16(offset + 4, true));
      offset += 6;
    }
    if ((fields & SnapshotField.Yaw) !== 0) {
      if (offset + 2 > view.byteLength) throw new ProtocolError("Yaw is truncated");
      state.yaw = decodeAngle(view.getInt16(offset, true));
      offset += 2;
    }
    if ((fields & SnapshotField.Pitch) !== 0) {
      if (offset + 2 > view.byteLength) throw new ProtocolError("Pitch is truncated");
      state.pitch = decodeAngle(view.getInt16(offset, true));
      offset += 2;
    }
    if ((fields & SnapshotField.Gameplay) !== 0) {
      if (offset + 13 > view.byteLength) throw new ProtocolError("Gameplay state is truncated");
      state.team = view.getUint8(offset) as Team;
      state.health = view.getUint8(offset + 1);
      state.flags = view.getUint16(offset + 2, true);
      state.ammo = view.getUint8(offset + 4);
      state.reloadTicks = view.getUint8(offset + 5);
      state.respawnTicks = view.getUint8(offset + 6);
      state.kills = view.getUint8(offset + 7);
      state.deaths = view.getUint8(offset + 8);
      state.assists = view.getUint8(offset + 9);
      state.captureSeconds = view.getUint16(offset + 10, true);
      const weaponState = view.getUint8(offset + 12);
      state.weaponSlot = weaponState & 0x3;
      state.weaponSwitchTicks = (weaponState >> 2) & 0x3f;
      offset += 13;
    }
    if ((fields & SnapshotField.Vehicle) !== 0) {
      if (offset + 3 > view.byteLength) throw new ProtocolError("Vehicle state is truncated");
      state.playerClass = view.getUint8(offset) as PlayerClass;
      state.mounted = view.getUint8(offset + 1) !== 0;
      state.horseHp = view.getUint8(offset + 2);
      offset += 3;
    }
    if ((fields & SnapshotField.Ship) !== 0) {
      if (offset + 3 > view.byteLength) throw new ProtocolError("Ship state is truncated");
      state.shipKind = view.getUint8(offset) as EntityKind;
      state.shipHullHp = view.getUint8(offset + 1) * 10;
      state.shipState = view.getUint8(offset + 2);
      if (state.shipKind === EntityKind.SiegeCannon) {
        if (offset + 7 > view.byteLength) throw new ProtocolError("Cannon aim state is truncated");
        state.cannonGunYaw = decodeAngle(view.getInt16(offset + 3, true));
        state.cannonGunPitch = decodeAngle(view.getInt16(offset + 5, true));
        state.shipGun1Yaw = 0;
        state.shipGun2Yaw = 0;
        offset += 7;
      } else if (state.shipKind === EntityKind.Galley) {
        if (offset + 7 > view.byteLength) throw new ProtocolError("Galley gun state is truncated");
        state.shipGun1Yaw = decodeAngle(view.getInt16(offset + 3, true));
        state.shipGun2Yaw = decodeAngle(view.getInt16(offset + 5, true));
        state.cannonGunYaw = 0;
        state.cannonGunPitch = 0;
        offset += 7;
      } else {
        state.cannonGunYaw = 0;
        state.cannonGunPitch = 0;
        state.shipGun1Yaw = 0;
        state.shipGun2Yaw = 0;
        offset += 3;
      }
    }
    if ((fields & SnapshotField.Torch) !== 0) {
      if (offset + 1 > view.byteLength) throw new ProtocolError("Torch state is truncated");
      const portable = view.getUint8(offset);
      if (entityId >= EARTHWORK_ENTITY_BASE && entityId < EARTHWORK_ENTITY_BASE + EARTHWORK_MAX) state.earthworkKind = portable;
      else state.torch = portable;
      offset += 1;
    }
    entities.set(entityId, state);
  }
  if (offset + 1 > view.byteLength) throw new ProtocolError("Snapshot points are truncated");
  const pointCount = view.getUint8(offset);
  if (pointCount < 1 || pointCount > MAX_CAPTURE_POINTS || offset + 1 + pointCount * 3 + 8 > view.byteLength) throw new ProtocolError("Snapshot point metadata is invalid");
  offset += 1;
  const points: CapturePointMeta[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    points.push({ owner: view.getUint8(offset) as Team, progress: view.getInt16(offset + 1, true) });
    offset += 3;
  }
  const eventCount = view.getUint8(offset + 7);
  const meta: SnapshotMeta = {
    captureOwner: points[0]?.owner ?? Team.None,
    captureProgress: points[0]?.progress ?? 0,
    ottomanTickets: view.getUint16(offset, true),
    byzantineTickets: view.getUint16(offset + 2, true),
    roundPhase: view.getUint8(offset + 4) as RoundPhase,
    phaseRemainingTicks: view.getUint16(offset + 5, true),
    events: [],
    points,
  };
  offset += 8;
  const events: CombatEvent[] = [];
  for (let index = 0; index < eventCount; index += 1) {
    if (offset + 8 > view.byteLength) throw new ProtocolError("Combat event is truncated");
    events.push({ id: view.getUint16(offset, true), type: view.getUint8(offset + 2) as CombatEventType, sourceEntityId: view.getUint16(offset + 3, true), targetEntityId: view.getUint16(offset + 5, true), value: view.getUint8(offset + 7) });
    offset += 8;
  }
  if (offset !== view.byteLength) throw new ProtocolError("Snapshot has trailing bytes");
  return { tick, ackInputSeq, baseTick, entities, meta: { ...meta, events } };
}
