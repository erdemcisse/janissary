import { describe, expect, it } from "vitest";
import { ChatChannel } from "@janissary/shared";
import { ChatService } from "../src/chat";
import { SqliteStorage } from "../src/storage/sqlite";

describe("claimed-account chat", () => {
  it("gates guests, filters profanity, and applies a burst-two rate limit", () => {
    const storage = new SqliteStorage(":memory:");
    const now = { value: 1_000 };
    const chat = new ChatService(storage, () => now.value);
    expect(chat.accept(1, false, "Guest", ChatChannel.All, "hello")).toEqual({ ok: false, reason: "claimed" });
    const first = chat.accept(1, true, "Mehmed", ChatChannel.Team, "this is shit");
    expect(first.ok && first.message.text).toBe("this is ****");
    expect(chat.accept(1, true, "Mehmed", ChatChannel.All, "second").ok).toBe(true);
    expect(chat.accept(1, true, "Mehmed", ChatChannel.All, "third")).toEqual({ ok: false, reason: "rate" });
    now.value += 2_000;
    expect(chat.accept(1, true, "Mehmed", ChatChannel.All, "third").ok).toBe(true);
  });

  it("enforces the moderation primitive", () => {
    const storage = new SqliteStorage(":memory:");
    const chat = new ChatService(storage);
    chat.mute(7);
    expect(chat.accept(7, true, "Muted", ChatChannel.All, "hello")).toEqual({ ok: false, reason: "muted" });
  });

  it("rate-limits report writes independently of socket message rate", () => {
    const storage = new SqliteStorage(":memory:");
    const now = { value: 1_000 };
    const chat = new ChatService(storage, () => now.value);
    const first = chat.accept(1, true, "Mehmed", ChatChannel.All, "one");
    const second = chat.accept(1, true, "Mehmed", ChatChannel.All, "two");
    expect(first.ok && chat.report(7, first.message.messageId)).toBe(true);
    expect(second.ok && chat.report(7, second.message.messageId)).toBe(true);
    expect(first.ok && chat.report(7, first.message.messageId)).toBe(false);
    now.value += 10_000;
    expect(first.ok && chat.report(7, first.message.messageId)).toBe(true);
  });
});
