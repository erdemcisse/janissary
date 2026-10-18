import { ChatChannel, filterChatText, type ChatMessage } from "@janissary/shared";
import type { Storage } from "./storage/storage";

interface Bucket { tokens: number; updatedAt: number }

export type ChatResult =
  | { readonly ok: true; readonly message: ChatMessage }
  | { readonly ok: false; readonly reason: "claimed" | "muted" | "rate" | "invalid" };

export class ChatService {
  readonly #buckets = new Map<number, Bucket>();
  readonly #reportBuckets = new Map<number, Bucket>();
  readonly #recent = new Map<number, ChatMessage>();
  readonly #storage: Storage;
  readonly #now: () => number;
  #nextMessageId = 1;
  constructor(storage: Storage, now: () => number = Date.now) { this.#storage = storage; this.#now = now; }

  accept(playerId: number, claimed: boolean, name: string, channel: ChatChannel, rawText: string): ChatResult {
    if (!claimed) return { ok: false, reason: "claimed" };
    if (this.#storage.isPlayerMuted(playerId)) return { ok: false, reason: "muted" };
    const text = filterChatText(rawText);
    if (text === "" || (channel !== ChatChannel.Team && channel !== ChatChannel.All)) return { ok: false, reason: "invalid" };
    const now = this.#now();
    if (!this.#takeToken(playerId, now)) return { ok: false, reason: "rate" };
    const message: ChatMessage = { messageId: this.#nextMessageId++, playerId, channel, name, text, createdAt: now };
    this.#recent.set(message.messageId, message);
    if (this.#recent.size > 256) this.#recent.delete(this.#recent.keys().next().value as number);
    return { ok: true, message };
  }

  mute(playerId: number, muted = true): void { this.#storage.setPlayerMuted(playerId, muted); }

  report(reporterPlayerId: number, messageId: number): boolean {
    const message = this.#recent.get(messageId);
    if (message === undefined) return false;
    if (!this.#takeReportToken(reporterPlayerId, this.#now())) return false;
    this.#storage.appendChatReport({ reporterPlayerId, messageId, senderPlayerId: message.playerId, channel: message.channel, text: message.text, createdAt: this.#now() });
    return true;
  }

  #takeToken(playerId: number, now: number): boolean {
    // Phase 8e-25: evict buckets whose whole window has elapsed — a chat
    // token bucket for a player who stopped chatting must not live forever.
    if (this.#buckets.size > 512) this.#evictStaleBuckets(this.#buckets, now, 60_000);
    const bucket = this.#buckets.get(playerId) ?? { tokens: 2, updatedAt: now };
    bucket.tokens = Math.min(2, bucket.tokens + (now - bucket.updatedAt) / 2_000);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) { this.#buckets.set(playerId, bucket); return false; }
    bucket.tokens -= 1;
    this.#buckets.set(playerId, bucket);
    return true;
  }

  #takeReportToken(playerId: number, now: number): boolean {
    if (this.#reportBuckets.size > 512) this.#evictStaleBuckets(this.#reportBuckets, now, 60_000);
    const bucket = this.#reportBuckets.get(playerId) ?? { tokens: 2, updatedAt: now };
    bucket.tokens = Math.min(2, bucket.tokens + (now - bucket.updatedAt) / 10_000);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) { this.#reportBuckets.set(playerId, bucket); return false; }
    bucket.tokens -= 1;
    this.#reportBuckets.set(playerId, bucket);
    return true;
  }

  /** Drops buckets idle for at least `staleMs` — bounded by the 512-entry
   * trigger so the sweep itself cannot become a per-message scan. */
  #evictStaleBuckets(buckets: Map<number, Bucket>, now: number, staleMs: number): void {
    for (const [playerId, bucket] of buckets) {
      if (now - bucket.updatedAt < staleMs) continue;
      buckets.delete(playerId);
    }
  }
}
