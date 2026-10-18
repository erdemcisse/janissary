import { createHash, randomBytes } from "node:crypto";
import { issueClaimedToken } from "./token";
import type { ProgressionService } from "./progression";
import type { Storage } from "./storage/storage";

const UPGRADE_TTL_MS = 15 * 60_000;
const RATE_WINDOW_MS = 60 * 60_000;
const RATE_LIMIT = 3;

export class AuthError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export interface VerifiedAuthUser { readonly authId: string; readonly email: string }
export interface AuthProvider {
  sendMagicLink(email: string, redirectTo: string, createUser: boolean): Promise<void>;
  getUser(accessToken: string): Promise<VerifiedAuthUser>;
}

export class SupabaseAuthProvider implements AuthProvider {
  constructor(readonly url: string, readonly anonKey: string) {}

  async sendMagicLink(email: string, redirectTo: string, createUser: boolean): Promise<void> {
    const response = await fetch(`${this.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: { apikey: this.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, create_user: createUser }),
    });
    if (!response.ok) throw new AuthError(502, "Identity provider rejected the magic-link request");
  }

  async getUser(accessToken: string): Promise<VerifiedAuthUser> {
    const response = await fetch(`${this.url}/auth/v1/user`, { headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new AuthError(401, "Magic link is invalid or expired");
    const value: unknown = await response.json();
    if (!isAuthUser(value)) throw new AuthError(401, "Verified identity is missing an email address");
    return { authId: value.id, email: normalizeEmail(value.email) };
  }
}

function isAuthUser(value: unknown): value is { id: string; email: string } {
  if (typeof value !== "object" || value === null) return false;
  const id = (value as { id?: unknown }).id;
  const email = (value as { email?: unknown }).email;
  return typeof id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    && typeof email === "string"
    && validEmail(normalizeEmail(email));
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hash(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export class AuthService {
  readonly #storage: Storage;
  readonly #progression: ProgressionService;
  readonly #provider: AuthProvider;
  readonly #redirectUrl: string;
  readonly #now: () => number;
  constructor(
    storage: Storage,
    progression: ProgressionService,
    provider: AuthProvider,
    redirectUrl: string,
    now: () => number = Date.now,
  ) { this.#storage = storage; this.#progression = progression; this.#provider = provider; this.#redirectUrl = redirectUrl; this.#now = now; }

  async requestUpgrade(playerId: number, emailValue: string, ip: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    if (!validEmail(email)) throw new AuthError(400, "Enter a valid email address");
    const account = this.#progression.getAccount(playerId);
    if (account === undefined) throw new AuthError(401, "Guest session is invalid");
    if (account.authId !== undefined) return;
    const now = this.#now();
    const ipAllowed = this.#allow(`ip:${hash(ip)}`, now);
    const emailAllowed = this.#allow(`email:${hash(email)}`, now);
    if (!ipAllowed || !emailAllowed) throw new AuthError(429, "Too many magic-link requests; try again later");
    const state = randomBytes(32).toString("base64url");
    this.#storage.createPendingAuthUpgrade({ stateHash: hash(state), playerId, email, expiresAt: now + UPGRADE_TTL_MS });
    const redirect = new URL(this.#redirectUrl);
    redirect.searchParams.set("upgrade_state", state);
    await this.#sendWithoutEnumeration(email, redirect.toString(), true);
  }

  async requestLogin(emailValue: string, ip: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    if (!validEmail(email)) throw new AuthError(400, "Enter a valid email address");
    const now = this.#now();
    const ipAllowed = this.#allow(`ip:${hash(ip)}`, now);
    const emailAllowed = this.#allow(`email:${hash(email)}`, now);
    if (!ipAllowed || !emailAllowed) throw new AuthError(429, "Too many magic-link requests; try again later");
    await this.#sendWithoutEnumeration(email, this.#redirectUrl, false);
  }

  async complete(accessToken: string, state: string | undefined): Promise<{ readonly playerId: number; readonly token: string }> {
    if (accessToken.length < 16 || accessToken.length > 8_192) throw new AuthError(401, "Magic link is invalid or expired");
    const user = await this.#provider.getUser(accessToken);
    if (state === undefined || state === "") {
      const existing = this.#storage.getAuthLinkByAuthId(user.authId);
      if (existing === undefined) throw new AuthError(409, "This identity is not linked to a soldier");
      const account = this.#progression.getAccount(existing.playerId);
      const token = issueClaimedToken(existing.playerId, user.authId);
      if (account === undefined || account.authId !== user.authId || account.tokenHash !== hash(token)) throw new AuthError(409, "This identity is not linked to a valid soldier");
      return { playerId: existing.playerId, token };
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new AuthError(401, "Magic link is invalid or expired");
    const pending = this.#storage.consumePendingAuthUpgrade(hash(state), this.#now());
    if (pending === undefined) throw new AuthError(410, "This upgrade link has expired or was already used");
    if (normalizeEmail(pending.email) !== normalizeEmail(user.email)) throw new AuthError(403, "Magic link email does not match the upgrade request");
    const account = this.#progression.getAccount(pending.playerId);
    if (account === undefined) throw new AuthError(404, "Guest soldier no longer exists");
    const token = issueClaimedToken(account.playerId, user.authId);
    const result = this.#storage.saveAuthLink({ authId: user.authId, playerId: account.playerId, email: user.email, createdAt: this.#now() });
    if (result !== "linked") throw new AuthError(409, "This email is already linked to another soldier. Accounts remain separate.");
    this.#progression.claimAccount(account, user.authId, hash(token));
    this.#progression.flush();
    return { playerId: account.playerId, token };
  }

  #allow(key: string, now: number): boolean {
    return this.#storage.consumeRateLimit(key, now, RATE_WINDOW_MS, RATE_LIMIT);
  }

  async #sendWithoutEnumeration(email: string, redirectTo: string, createUser: boolean): Promise<void> {
    try { await this.#provider.sendMagicLink(email, redirectTo, createUser); }
    catch { console.error(JSON.stringify({ event: "auth_magic_link_delivery_failed", emailHash: hash(email) })); }
  }
}
