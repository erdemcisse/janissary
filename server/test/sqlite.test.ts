import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlayerClass, Team } from "@janissary/shared";
import { ProgressionService } from "../src/progression";
import { SqliteStorage } from "../src/storage/sqlite";

/**
 * Phase 8e-25 reality pass: the storage slice's only direct SQLite coverage.
 * The old suite exercised ProgressionService against an in-memory FakeStorage,
 * so the inverted player-id filter in loadAccounts (every account hydrated
 * with EVERY OTHER account's skins — persisted permanently on the next flush)
 * shipped untested. These tests run the real SqliteStorage adapter.
 */

describe("SqliteStorage account hydration (Phase 8e-25)", () => {
  it("hydrates each account with only its own skin unlocks and equips across a reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "janissary-sqlite-"));
    const dbPath = join(dir, "test.db");
    try {
      const first = new SqliteStorage(dbPath);
      const service = new ProgressionService(first, () => 1_000_000);
      const alice = service.createGuest("alice", "hash-a");
      const bob = service.createGuest("bob", "hash-b");
      // High XP on both factions unlocks the rank skins for both accounts.
      alice.careers[Team.Ottoman]!.xp = 1_000_000;
      alice.careers[Team.Byzantine]!.xp = 1_000_000;
      bob.careers[Team.Ottoman]!.xp = 1_000_000;
      bob.careers[Team.Byzantine]!.xp = 1_000_000;
      service.skinState(alice);
      service.skinState(bob);
      // janissary-veteran is Ottoman rank 6; guardsman-veteran is Byzantine
      // rank 6 — both unlock from XP alone.
      expect(service.equipSkin(alice, "janissary-veteran")).toBe("ok");
      expect(service.equipSkin(bob, "guardsman-elite")).toBe("ok");
      service.flush();
      first.close();

      // Second process, same database file: each account must come back with
      // its own equips — the old `!==` filter merged everyone's skins.
      const second = new SqliteStorage(dbPath);
      const reopened = new ProgressionService(second, () => 1_000_000);
      const aliceAgain = reopened.getAccount(alice.playerId);
      const bobAgain = reopened.getAccount(bob.playerId);
      expect(aliceAgain?.skinEquips.get(PlayerClass.Janissary)).toBe("janissary-veteran");
      expect(aliceAgain?.skinEquips.get(PlayerClass.Janissary)).not.toBe("guardsman-elite");
      expect(bobAgain?.skinEquips.get(PlayerClass.Guardsman)).toBe("guardsman-elite");
      expect(aliceAgain?.skinEquips.get(PlayerClass.Guardsman)).toBeUndefined();
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("purges consumed and expired magic-link upgrade requests so hashes are reusable", () => {
    const storage = new SqliteStorage(":memory:");
    const service = new ProgressionService(storage, () => 1_000_000);
    const guest = service.createGuest("guest", "hash");
    service.flush();
    storage.createPendingAuthUpgrade({ stateHash: "expired-hash", playerId: guest.playerId, email: "a@example.com", expiresAt: 900_000_000 });
    storage.createPendingAuthUpgrade({ stateHash: "live-hash", playerId: guest.playerId, email: "b@example.com", expiresAt: 2_000_000_000 });

    // The live request consumes once and is deleted in the same transaction.
    const consumed = storage.consumePendingAuthUpgrade("live-hash", 1_000_000_000);
    expect(consumed?.stateHash).toBe("live-hash");
    expect(storage.consumePendingAuthUpgrade("live-hash", 1_000_000_000)).toBeUndefined();

    // The expired request is purged on the next consume even though it never
    // resolved, so its state hash can be issued again.
    expect(storage.consumePendingAuthUpgrade("expired-hash", 1_000_000_000)).toBeUndefined();
    storage.createPendingAuthUpgrade({ stateHash: "expired-hash", playerId: guest.playerId, email: "c@example.com", expiresAt: 3_000_000_000 });
    expect(storage.consumePendingAuthUpgrade("expired-hash", 2_000_000_000)).toBeDefined();

    // And the consumed live hash is free for a fresh request.
    storage.createPendingAuthUpgrade({ stateHash: "live-hash", playerId: guest.playerId, email: "d@example.com", expiresAt: 3_000_000_000 });
    expect(storage.consumePendingAuthUpgrade("live-hash", 2_000_000_000)).toBeDefined();
    storage.close();
  });
});
