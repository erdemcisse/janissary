import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultServerUrl, httpServerUrl } from "../src/net/serverUrl";

/**
 * serverUrl.ts is the entire connection surface and has already shipped two
 * real regressions (a hardcoded 5173 in dev that broke any non-default Vite
 * port, and a scheme-slice bug in httpServerUrl). These tests pin the four
 * env/state combinations the module actually branches on.
 */

const originalWindow = globalThis.window;
const originalEnv = { ...import.meta.env };

function stubLocation(protocol: string, host: string, hostname: string): void {
  globalThis.window = { location: { protocol, host, hostname } } as unknown as Window & typeof globalThis;
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalWindow === undefined) delete (globalThis as Record<string, unknown>).window;
  else globalThis.window = originalWindow;
  for (const [key, value] of Object.entries(originalEnv)) {
    (import.meta.env as Record<string, unknown>)[key] = value;
  }
});

describe("defaultServerUrl", () => {
  it("prefers the configured VITE_GAME_URL verbatim", () => {
    vi.stubEnv("VITE_GAME_URL", "wss://game.example.com/ws");
    stubLocation("http:", "localhost:5173", "localhost");
    expect(defaultServerUrl()).toBe("wss://game.example.com/ws");
  });

  it("routes dev sessions to the server port on the current hostname, never a hardcoded Vite port", () => {
    vi.stubEnv("VITE_GAME_URL", undefined);
    vi.stubEnv("DEV", true);
    stubLocation("http:", "localhost:5174", "localhost");
    expect(defaultServerUrl()).toBe("ws://localhost:9001");
  });

  it("derives wss from an https page in production", () => {
    vi.stubEnv("VITE_GAME_URL", undefined);
    vi.stubEnv("DEV", false);
    stubLocation("https:", "game.example.com", "game.example.com");
    expect(defaultServerUrl()).toBe("wss://game.example.com");
  });

  it("derives ws from an http page in production", () => {
    vi.stubEnv("VITE_GAME_URL", undefined);
    vi.stubEnv("DEV", false);
    stubLocation("http:", "game.example.com", "game.example.com");
    expect(defaultServerUrl()).toBe("ws://game.example.com");
  });
});

describe("httpServerUrl", () => {
  it("strips exactly the scheme length so wss never drops a slash", () => {
    vi.stubEnv("VITE_GAME_URL", "wss://game.example.com/ws");
    expect(httpServerUrl()).toBe("https://game.example.com/ws");
  });

  it("maps a plain ws URL to http without corrupting the authority", () => {
    vi.stubEnv("VITE_GAME_URL", "ws://localhost:9001");
    expect(httpServerUrl()).toBe("http://localhost:9001");
  });
});
