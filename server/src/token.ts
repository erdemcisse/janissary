import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_DEV_SECRET = "janissary-dev-secret-change-me";
export const EXAMPLE_TOKEN_SECRET = "replace-with-at-least-32-random-bytes";
const GUEST_TOKEN_VERSION = 1;
const CLAIMED_TOKEN_VERSION = 2;

export type GameToken =
  | { readonly kind: "guest"; readonly playerId: number }
  | { readonly kind: "claimed"; readonly playerId: number; readonly authId: string };

function secret(): string {
  const configured = process.env.TOKEN_SECRET;
  return configured !== undefined && configured.trim() !== "" ? configured : DEFAULT_DEV_SECRET;
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  try {
    return new Uint8Array(Buffer.from(value, "base64url"));
  } catch {
    return undefined;
  }
}

function signPayload(payload: Uint8Array, signingSecret: string = secret()): Uint8Array {
  return createHmac("sha256", signingSecret).update(payload).digest();
}

export function issueGuestToken(playerId: number): string {
  const version = Uint8Array.of(GUEST_TOKEN_VERSION);
  const idBytes = new Uint8Array(4);
  new DataView(idBytes.buffer).setUint32(0, playerId >>> 0, true);
  const payload = new Uint8Array(5);
  payload.set(version, 0);
  payload.set(idBytes, 1);
  const signature = signPayload(payload);
  return `${encodeBase64Url(payload)}.${encodeBase64Url(signature)}`;
}

export function verifyGuestToken(token: string): number | undefined {
  const verified = verifyGameToken(token);
  return verified?.kind === "guest" ? verified.playerId : undefined;
}

function uuidBytes(authId: string): Uint8Array | undefined {
  const hex = authId.toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return undefined;
  return new Uint8Array(Buffer.from(hex, "hex"));
}

function bytesUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function issueClaimedToken(playerId: number, authId: string): string {
  const authBytes = uuidBytes(authId);
  if (authBytes === undefined) throw new Error("Invalid auth id");
  const payload = new Uint8Array(21);
  payload[0] = CLAIMED_TOKEN_VERSION;
  new DataView(payload.buffer).setUint32(1, playerId >>> 0, true);
  payload.set(authBytes, 5);
  return `${encodeBase64Url(payload)}.${encodeBase64Url(signPayload(payload))}`;
}

export function verifyGameToken(token: string): GameToken | undefined {
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const payload = decodeBase64Url(parts[0] ?? "");
  const signature = decodeBase64Url(parts[1] ?? "");
  if (payload === undefined || signature === undefined) return undefined;
  const version = payload[0] ?? 0;
  if ((version === GUEST_TOKEN_VERSION && payload.byteLength !== 5) || (version === CLAIMED_TOKEN_VERSION && payload.byteLength !== 21)) return undefined;
  if (version !== GUEST_TOKEN_VERSION && version !== CLAIMED_TOKEN_VERSION) return undefined;
  const expected = signPayload(payload);
  if (expected.byteLength !== signature.byteLength) return undefined;
  if (!timingSafeEqual(expected, signature)) return undefined;
  const playerId = new DataView(payload.buffer, payload.byteOffset + 1, 4).getUint32(0, true);
  if (version === GUEST_TOKEN_VERSION) return { kind: "guest", playerId };
  return { kind: "claimed", playerId, authId: bytesUuid(payload.slice(5)) };
}

export function isDefaultDevSecret(): boolean {
  return secret() === DEFAULT_DEV_SECRET;
}

export function assertSecureTokenSecret(environment: string | undefined = process.env.NODE_ENV, configuredSecret: string | undefined = process.env.TOKEN_SECRET): void {
  if (environment !== "production") return;
  const value = configuredSecret?.trim() ?? "";
  const looksLikePlaceholder = /(?:change[-_ ]?me|replace[-_ ]?with|example|development|default)/i.test(value);
  if (value.length < 32 || value === DEFAULT_DEV_SECRET || value === EXAMPLE_TOKEN_SECRET || looksLikePlaceholder) {
    throw new Error("TOKEN_SECRET must be at least 32 characters and non-default in production");
  }
}
