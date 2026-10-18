import { describe, expect, it } from "vitest";
import { BoundedRateLimiter, allowedCorsOrigin, assertSecureMetricsToken, bearerMatches, boundedInteger, clientIp, isLoopbackHttpOrigin, isSameHostHttpOrigin } from "../src/security";

describe("internet-edge security helpers", () => {
  it("trusts forwarding headers only behind the configured proxy boundary", () => {
    expect(clientIp("172.18.0.2", "198.51.100.20, 172.18.0.1", true)).toBe("198.51.100.20");
    expect(clientIp("203.0.113.5", "198.51.100.20", false)).toBe("203.0.113.5");
    expect(clientIp("172.18.0.2", "spoofed", true)).toBe("172.18.0.2");
  });

  it("compares operational bearer tokens without a length oracle", () => {
    expect(bearerMatches("Bearer metrics-secret", "metrics-secret")).toBe(true);
    expect(bearerMatches("Bearer wrong", "metrics-secret")).toBe(false);
    expect(bearerMatches("", "metrics-secret")).toBe(false);
  });

  it("allows only configured browser origins", () => {
    const origins = new Set(["https://game.example.com"]);
    expect(allowedCorsOrigin("https://game.example.com", origins)).toBe("https://game.example.com");
    expect(allowedCorsOrigin("https://evil.example", origins)).toBeUndefined();
  });

  it("recognizes loopback development origins on any Vite port", () => {
    expect(isLoopbackHttpOrigin("http://localhost:5174")).toBe(true);
    expect(isLoopbackHttpOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopbackHttpOrigin("https://[::1]:5173")).toBe(true);
    expect(isLoopbackHttpOrigin("https://game.example.com")).toBe(false);
    expect(isLoopbackHttpOrigin("http://localhost:5173/game")).toBe(false);
  });

  it("allows a development Vite origin on the API host while rejecting other LAN hosts", () => {
    expect(isSameHostHttpOrigin("http://192.168.1.42:5173", "192.168.1.42:9001")).toBe(true);
    expect(isSameHostHttpOrigin("https://battlebox.local:5173", "battlebox.local:9001")).toBe(true);
    expect(isSameHostHttpOrigin("http://192.168.1.99:5173", "192.168.1.42:9001")).toBe(false);
    expect(isSameHostHttpOrigin("http://192.168.1.42:5173/path", "192.168.1.42:9001")).toBe(false);
    expect(isSameHostHttpOrigin("file:///tmp/game", "192.168.1.42:9001")).toBe(false);
  });

  it("bounds rate-limit memory and resets windows", () => {
    const limiter = new BoundedRateLimiter(2);
    expect(limiter.allow("a", 0, 1_000, 1)).toBe(true);
    expect(limiter.allow("a", 1, 1_000, 1)).toBe(false);
    expect(limiter.allow("b", 1, 1_000, 1)).toBe(true);
    expect(limiter.allow("c", 1, 1_000, 1)).toBe(true);
    expect(limiter.allow("a", 1_001, 1_000, 1)).toBe(true);
  });

  it("fails closed on malformed or out-of-range numeric configuration", () => {
    expect(boundedInteger(undefined, 80, 1, 100, "LIMIT")).toBe(80);
    expect(boundedInteger("81", 80, 1, 100, "LIMIT")).toBe(81);
    expect(() => boundedInteger("oops", 80, 1, 100, "LIMIT")).toThrow("LIMIT must be an integer");
    expect(() => boundedInteger("101", 80, 1, 100, "LIMIT")).toThrow("LIMIT must be an integer");
  });

  it("rejects a configured production metrics placeholder", () => {
    expect(() => assertSecureMetricsToken("production", "replace-with-an-independent-32-byte-secret")).toThrow("METRICS_TOKEN");
    expect(() => assertSecureMetricsToken("production", "short")).toThrow("METRICS_TOKEN");
    expect(() => assertSecureMetricsToken("production", undefined)).not.toThrow();
    expect(() => assertSecureMetricsToken("development", "short")).not.toThrow();
  });
});
