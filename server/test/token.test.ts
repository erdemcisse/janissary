import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DEV_SECRET, EXAMPLE_TOKEN_SECRET, assertSecureTokenSecret, issueClaimedToken, issueGuestToken, verifyGameToken, verifyGuestToken } from "../src/token";

describe("versioned game tokens", () => {
  // assertSecureTokenSecret's default parameters read process.env at call
  // time, so an ambient TOKEN_SECRET (CI, an operator shell, a harness that
  // exports one) flips the "production + undefined" assertion below. Pin the
  // env to unset for the duration (audit finding HIGH-1).
  beforeEach(() => {
    vi.stubEnv("TOKEN_SECRET", undefined);
    vi.stubEnv("NODE_ENV", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps v1 guest tokens valid and separates v2 claimed tokens", () => {
    const guest = issueGuestToken(41);
    expect(verifyGuestToken(guest)).toBe(41);
    expect(verifyGameToken(guest)).toEqual({ kind: "guest", playerId: 41 });
    const claimed = issueClaimedToken(41, "123e4567-e89b-12d3-a456-426614174000");
    expect(verifyGuestToken(claimed)).toBeUndefined();
    expect(verifyGameToken(claimed)).toEqual({ kind: "claimed", playerId: 41, authId: "123e4567-e89b-12d3-a456-426614174000" });
    expect(verifyGameToken(`${claimed.slice(0, -1)}x`)).toBeUndefined();
  });

  it("hard-fails unsafe production secrets only", () => {
    expect(() => assertSecureTokenSecret("production", undefined)).toThrow(/TOKEN_SECRET/);
    expect(() => assertSecureTokenSecret("production", DEFAULT_DEV_SECRET)).toThrow(/TOKEN_SECRET/);
    expect(() => assertSecureTokenSecret("production", EXAMPLE_TOKEN_SECRET)).toThrow(/TOKEN_SECRET/);
    expect(() => assertSecureTokenSecret("production", "short-secret")).toThrow(/TOKEN_SECRET/);
    expect(() => assertSecureTokenSecret("production", "R6HVEv2Q4b0jWNjYwK5Pu8nxGc7tMA9NUDQKs01eAFA")).not.toThrow();
    expect(() => assertSecureTokenSecret("development", undefined)).not.toThrow();
  });
});
