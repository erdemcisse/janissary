import type { BotBehaviorMode } from "@janissary/shared";

/**
 * Phase 8e-19 Task 1: request parsing for the dev playtest-control endpoints
 * (/dev/bots*). Pure and unit-tested — the uWS route handlers in index.ts are
 * thin pass-throughs. Clamps match the admin panel's slider range (0-150).
 */

export const BOT_COUNT_MIN = 0;
export const BOT_COUNT_MAX = 150;

/** Bot-count body: { count: number } → truncated int, clamped 0-150; undefined if not a finite number. */
export function parseBotCount(value: unknown): number | undefined {
  const raw = typeof value === "object" && value !== null && "count" in value ? (value as { count?: unknown }).count : undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.max(BOT_COUNT_MIN, Math.min(BOT_COUNT_MAX, Math.trunc(raw)));
}

/** Mode body: { mode: "standing" | "walking" | "battle" }; undefined if anything else. */
export function parseBotMode(value: unknown): BotBehaviorMode | undefined {
  const raw = typeof value === "object" && value !== null && "mode" in value ? (value as { mode?: unknown }).mode : undefined;
  if (raw === "standing" || raw === "walking" || raw === "battle") return raw;
  return undefined;
}

/** Freeze body: { frozen: boolean }; undefined if not a boolean. */
export function parseBotFreeze(value: unknown): boolean | undefined {
  const raw = typeof value === "object" && value !== null && "frozen" in value ? (value as { frozen?: unknown }).frozen : undefined;
  return typeof raw === "boolean" ? raw : undefined;
}

/** Battle reset requires an explicit confirmation payload. */
export function parsePlaytestReset(value: unknown): true | undefined {
  const raw = typeof value === "object" && value !== null && "confirm" in value ? (value as { confirm?: unknown }).confirm : undefined;
  return raw === true ? true : undefined;
}
