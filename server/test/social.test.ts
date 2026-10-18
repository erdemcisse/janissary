import { describe, expect, it } from "vitest";
import { ProgressionService } from "../src/progression";
import { SqliteStorage } from "../src/storage/sqlite";
import { SocialService } from "../src/social";

function setup(): { social: SocialService; storage: SqliteStorage } {
  const storage = new SqliteStorage(":memory:");
  const progression = new ProgressionService(storage);
  // Name resolution goes through the accounts table (findPlayerIdByName), so
  // real guest accounts must exist — the same setup clans.test.ts uses.
  for (const name of ["Ali", "Boran", "Kostas"]) progression.createGuest(name, `hash-${name}`);
  progression.flush();
  const social = new SocialService(storage, (playerId) => progression.getAccount(playerId)?.name);
  return { social, storage };
}

describe("social blocks (Phase 8c-7)", () => {
  it("blocks, lists, and unblocks a player for the blocking account only", () => {
    const { social } = setup();
    expect(social.block(1, "Boran")).toEqual({ ok: true, value: { targetPlayerId: 2 } });
    expect(social.isBlocked(1, 2)).toBe(true);
    expect(social.isBlocked(2, 1)).toBe(false); // one-way, not mutual
    expect(social.blockedIds(1)).toEqual([2]);
    expect(social.block(1, "Ali")).toEqual({ ok: false, error: "cannot-block-self" });
    expect(social.block(1, "Noone")).toEqual({ ok: false, error: "not-found" });
    expect(social.unblock(1, 2)).toEqual({ ok: true, value: { targetPlayerId: 2 } });
    expect(social.blockedIds(1)).toEqual([]);
  });
});

describe("social friends (Phase 8c-7)", () => {
  it("runs the request/accept lifecycle mirroring clan invites", () => {
    const { social } = setup();
    expect(social.sendRequest(1, "Boran")).toEqual({ ok: true, value: { targetPlayerId: 2 } });
    expect(social.incomingRequests(2)).toEqual([{ fromId: 1, name: "Ali" }]);
    expect(social.acceptRequest(2, 1)).toEqual({ ok: true, value: { friendPlayerId: 1 } });
    expect(social.friendIds(1)).toEqual([2]);
    expect(social.friendIds(2)).toEqual([1]); // symmetric pair, one stored row
    expect(social.areFriends(1, 2)).toBe(true);
    expect(social.sendRequest(1, "Boran")).toEqual({ ok: false, error: "already-friends" });
    expect(social.removeFriend(1, 2)).toEqual({ ok: true, value: { friendPlayerId: 2 } });
    expect(social.friendIds(1)).toEqual([]);
  });

  it("declines a request without creating the friendship", () => {
    const { social } = setup();
    social.sendRequest(1, "Kostas");
    expect(social.declineRequest(3, 1)).toEqual({ ok: true, value: { fromId: 1 } });
    expect(social.friendIds(3)).toEqual([]);
    expect(social.acceptRequest(3, 1)).toEqual({ ok: false, error: "request-missing" });
  });

  it("refuses requests from a player you have blocked", () => {
    const { social } = setup();
    social.block(3, "Ali");
    expect(social.sendRequest(1, "Kostas")).toEqual({ ok: false, error: "target-blocked-you" });
  });

  it("reports friend presence with team from the connection callback", () => {
    const { social } = setup();
    social.sendRequest(1, "Boran");
    social.acceptRequest(2, 1);
    const friends = social.friends(1, (playerId) => playerId === 2 ? { online: true, team: 1 } : undefined);
    expect(friends).toEqual([{ playerId: 2, name: "Boran", online: true, team: 1 }]);
    const offline = social.friends(1, () => undefined);
    expect(offline[0]?.online).toBe(false);
  });
});
