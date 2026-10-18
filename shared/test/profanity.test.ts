import { describe, expect, it } from "vitest";
import { MAX_CHAT_BYTES } from "../src/constants";
import { filterChatText, sanitizeChatText } from "../src/profanity";

/**
 * profanity.ts is the entire chat-ingestion surface shared by server and
 * clients. It normalizes, byte-caps, and masks hostile text before it reaches
 * storage or rendering; these tests pin the exact boundaries the ADR 0011
 * chat findings rest on (SEC-016: no script path, byte-bounded, normalized).
 */

describe("sanitizeChatText", () => {
  it("trims surrounding whitespace and collapses interior runs", () => {
    expect(sanitizeChatText("   hello \t  world \n ")).toBe("hello world");
  });

  it("removes every C0/C1 control character (Phase 8e-4b: no space split)", () => {
    // Control characters are removed outright so they cannot split a word
    // past the profanity matcher. Behavior change from the audit baseline
    // (MED-4): previously controls became spaces ("a b c d e").
    expect(sanitizeChatText("a\u0000b\u001fc\u007fd\u009fe")).toBe("abcde");
  });

  it("normalizes unicode forms before filtering", () => {
    const composed = "\u00e9"; // é precomposed
    const decomposed = "\u0065\u0301"; // e + combining acute
    expect(sanitizeChatText(decomposed)).toBe(composed);
  });

  it("caps the byte length at MAX_CHAT_BYTES even across a mid-codepoint truncation", () => {
    // Phase 8e-4b (LOW-1): the decoder substitutes U+FFFD (3 bytes) for a
    // partial codepoint, so the slice is capped 2 bytes short of MAX_CHAT_BYTES
    // and the result never exceeds the documented maximum. The old pin
    // allowed a 2-byte overshoot.
    const long = "\u4e16".repeat(200); // 3 bytes per codepoint, 600 bytes total
    const result = sanitizeChatText(long);
    const bytes = new TextEncoder().encode(result).byteLength;
    expect(bytes).toBeLessThanOrEqual(MAX_CHAT_BYTES);
    expect(result).not.toMatch(/[\uD800-\uDFFF]/);
    // 52 codepoints fill 156 bytes; the next codepoint is cut at byte 158 of
    // 159, decoding to one replacement character: 156 + 3 = 159 bytes.
    expect(result).toBe("\u4e16".repeat(52) + "\uFFFD");
  });

  it("passes short plain text through unchanged", () => {
    expect(sanitizeChatText("charge the gate")).toBe("charge the gate");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(sanitizeChatText("   ")).toBe("");
  });
});

describe("filterChatText", () => {
  it("masks each banned word with equal-length asterisks, case-insensitively", () => {
    expect(filterChatText("fuck this")).toBe("**** this");
    expect(filterChatText("FUCK THIS")).toBe("**** THIS");
    expect(filterChatText("you bastard")).toBe("you *******");
    expect(filterChatText("motherfucker")).toBe("************");
  });

  it("only masks whole words, not substrings inside longer tokens", () => {
    expect(filterChatText("fucking around")).toBe("fucking around");
    expect(filterChatText("shithole")).toBe("shithole");
  });

  it("masks control-obfuscated slurs (Phase 8e-4b: MED-4 behavior fix)", () => {
    // Controls are now removed before matching, so "f\0u\0ck" rejoins into
    // "fuck" and is masked. The audit baseline pinned the bypass ("f u ck");
    // this pin now guards the fixed behavior.
    expect(filterChatText("  f\u0000u\u001fck  ")).toBe("****");
    expect(filterChatText("s\u0000h\u0000i\u0000t")).toBe("****");
  });

  it("keeps the asterisk count in characters, not bytes, for non-ASCII surroundings", () => {
    expect(filterChatText("shit \u4e16\u4e16")).toBe("**** \u4e16\u4e16");
  });
});
