import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

export function clientIp(directAddress: string, forwardedFor: string, trustProxy: boolean): string {
  if (!trustProxy) return directAddress || "unknown";
  const candidate = (forwardedFor.split(",", 1)[0] ?? "").trim();
  return isIP(candidate) === 0 ? (directAddress || "unknown") : candidate;
}

export function bearerMatches(header: string, expected: string | undefined): boolean {
  if (expected === undefined || expected === "") return false;
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (match === null) return false;
  const actualDigest = createHash("sha256").update(match[1] ?? "", "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function allowedCorsOrigin(origin: string, configuredOrigins: ReadonlySet<string>): string | undefined {
  if (origin === "") return undefined;
  return configuredOrigins.has(origin) ? origin : undefined;
}

/** Accept any loopback port for the development Vite client only. */
export function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

/** Allow a development Vite client on a different port of the API host. */
export function isSameHostHttpOrigin(origin: string, requestHost: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") return false;
    if (parsedOrigin.username !== "" || parsedOrigin.password !== "" || parsedOrigin.pathname !== "/" || parsedOrigin.search !== "" || parsedOrigin.hash !== "") return false;
    const parsedHost = new URL(`http://${requestHost}`);
    return parsedOrigin.hostname.toLowerCase() === parsedHost.hostname.toLowerCase();
  } catch {
    return false;
  }
}

export function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, label: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

export function assertSecureMetricsToken(environment: string | undefined, configuredToken: string | undefined): void {
  if (environment !== "production" || configuredToken === undefined || configuredToken.trim() === "") return;
  const value = configuredToken.trim();
  if (value.length < 32 || /(?:change[-_ ]?me|replace[-_ ]?with|example|development|default)/i.test(value)) {
    throw new Error("METRICS_TOKEN must be at least 32 characters and non-default when configured in production");
  }
}

interface RateBucket { windowStartedAt: number; count: number }

export class BoundedRateLimiter {
  readonly #buckets = new Map<string, RateBucket>();
  constructor(readonly maxBuckets = 20_000) {}

  allow(key: string, now: number, windowMs: number, limit: number): boolean {
    let bucket = this.#buckets.get(key);
    if (bucket === undefined || now - bucket.windowStartedAt >= windowMs) {
      if (bucket === undefined && this.#buckets.size >= this.maxBuckets) {
        const oldest = this.#buckets.keys().next().value;
        if (typeof oldest === "string") this.#buckets.delete(oldest);
      }
      bucket = { windowStartedAt: now, count: 0 };
      this.#buckets.set(key, bucket);
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }
}
