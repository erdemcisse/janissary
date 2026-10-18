import { MAX_CHAT_BYTES } from "./constants";

/** Small, deliberately explicit seed list. Extend here without touching chat logic. */
export const PROFANITY_WORDS = [
  "asshole",
  "bastard",
  "bitch",
  "cunt",
  "fuck",
  "motherfucker",
  "nigger",
  "shit",
] as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const profanity = new RegExp(`\\b(${PROFANITY_WORDS.join("|")})\\b`, "giu");

export function sanitizeChatText(value: string): string {
  // Control characters are removed, not replaced with spaces (Phase 8e-4b,
  // audit finding MED-4): a space split obfuscated slurs ("f\u0000uck" ->
  // "f uck") past the word-boundary regex instead of masking them.
  const plain = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim();
  const bytes = encoder.encode(plain);
  if (bytes.byteLength <= MAX_CHAT_BYTES) return decoder.decode(bytes).trim();
  // Truncating mid-codepoint substitutes U+FFFD (3 bytes) for the partial
  // sequence, so decoding a MAX_CHAT_BYTES slice can yield up to 2 bytes over
  // the cap (audit finding LOW-1). Slice 2 bytes short so the worst-case
  // replacement keeps the result within MAX_CHAT_BYTES.
  return decoder.decode(bytes.slice(0, MAX_CHAT_BYTES - 2)).trim();
}

export function filterChatText(value: string): string {
  return sanitizeChatText(value).replace(profanity, (word) => "*".repeat(Array.from(word as string).length));
}
