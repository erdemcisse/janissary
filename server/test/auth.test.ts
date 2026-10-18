import { describe, expect, it } from "vitest";
import { AuthError, AuthService, type AuthProvider, type VerifiedAuthUser } from "../src/auth";
import { ProgressionService } from "../src/progression";
import { SqliteStorage } from "../src/storage/sqlite";

class FakeProvider implements AuthProvider {
  redirect = "";
  createUser = false;
  user: VerifiedAuthUser = { authId: "123e4567-e89b-12d3-a456-426614174000", email: "soldier@example.com" };
  async sendMagicLink(_email: string, redirectTo: string, createUser: boolean): Promise<void> { this.redirect = redirectTo; this.createUser = createUser; }
  async getUser(_accessToken: string): Promise<VerifiedAuthUser> { return this.user; }
}

function setup(now: { value: number }): { auth: AuthService; progression: ProgressionService; provider: FakeProvider } {
  const storage = new SqliteStorage(":memory:");
  const progression = new ProgressionService(storage, () => now.value);
  progression.createGuest("Mehmed", "guest-hash");
  progression.flush();
  const provider = new FakeProvider();
  return { auth: new AuthService(storage, progression, provider, "http://localhost:5173/", () => now.value), progression, provider };
}

describe("magic-link account upgrade", () => {
  it("preserves the guest player and rejects replay", async () => {
    const now = { value: 1_700_000_000_000 };
    const { auth, progression, provider } = setup(now);
    await auth.requestUpgrade(1, "Soldier@example.com", "127.0.0.1");
    const state = new URL(provider.redirect).searchParams.get("upgrade_state");
    expect(state).not.toBeNull();
    const result = await auth.complete("valid-access-token-123", state ?? undefined);
    expect(result.playerId).toBe(1);
    expect(progression.getAccount(1)?.authId).toBe(provider.user.authId);
    await expect(auth.complete("valid-access-token-123", state ?? undefined)).rejects.toMatchObject({ status: 410 } satisfies Partial<AuthError>);
    await auth.requestLogin("soldier@example.com", "127.0.0.2");
    expect(provider.createUser).toBe(false);
    await expect(auth.complete("new-browser-access-token", undefined)).resolves.toMatchObject({ playerId: 1 });
  });

  it("expires one-time upgrade state after fifteen minutes", async () => {
    const now = { value: 1_700_000_000_000 };
    const { auth, provider } = setup(now);
    await auth.requestUpgrade(1, "soldier@example.com", "127.0.0.1");
    const state = new URL(provider.redirect).searchParams.get("upgrade_state") ?? undefined;
    now.value += 15 * 60_000 + 1;
    await expect(auth.complete("valid-access-token-123", state)).rejects.toMatchObject({ status: 410 } satisfies Partial<AuthError>);
  });

  it("persists the three-per-hour IP and email rate limit in SQLite", async () => {
    const now = { value: 1_700_000_000_000 };
    const storage = new SqliteStorage(":memory:");
    const progression = new ProgressionService(storage, () => now.value);
    const provider = new FakeProvider();
    const first = new AuthService(storage, progression, provider, "http://localhost:5173/", () => now.value);
    for (let attempt = 0; attempt < 3; attempt += 1) await first.requestLogin("soldier@example.com", "198.51.100.10");
    const afterRestart = new AuthService(storage, progression, provider, "http://localhost:5173/", () => now.value);
    await expect(afterRestart.requestLogin("soldier@example.com", "198.51.100.10")).rejects.toMatchObject({ status: 429 } satisfies Partial<AuthError>);
    now.value += 60 * 60_000;
    await expect(afterRestart.requestLogin("soldier@example.com", "198.51.100.10")).resolves.toBeUndefined();
  });
});
