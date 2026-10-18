import { describe, expect, it } from "vitest";
import { Team, XpSource } from "@janissary/shared";
import { ClanService } from "../src/clans";
import { ProgressionService } from "../src/progression";
import { SqliteStorage } from "../src/storage/sqlite";

function setup(playerCount = 8): { clans: ClanService; progression: ProgressionService; names: Map<number, string>; storage: SqliteStorage } {
  const storage = new SqliteStorage(":memory:");
  const progression = new ProgressionService(storage);
  for (let playerId = 1; playerId <= playerCount; playerId += 1) {
    progression.createGuest(`Soldier ${playerId}`, `hash-soldier-${playerId}`);
  }
  progression.flush();
  const names = new Map<number, string>();
  const clans = new ClanService(storage, (playerId) => names.get(playerId) ?? progression.getAccount(playerId)?.name);
  return { clans, progression, names, storage };
}

describe("clan management", () => {
  it("creates a clan with the founder as its first member", () => {
    const { clans } = setup();
    const created = clans.create(1, "Sipahi Hand", "SIPH");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.clanId).toBeGreaterThan(0);
    const roster = clans.roster(1);
    expect(roster.ok).toBe(true);
    if (!roster.ok) return;
    expect(roster.value.role).toBe("founder");
    expect(roster.value.memberCount).toBe(1);
    expect(roster.value.members[0]?.playerId).toBe(1);
  });

  it("rejects duplicate names and tags case-insensitively", () => {
    const { clans } = setup();
    expect(clans.create(1, "Sipahi Hand", "SIPH").ok).toBe(true);
    expect(clans.create(2, "sipahi hand", "OTHR").ok).toBe(false);
    expect(clans.create(2, "Other Hand", "siph").ok).toBe(false);
  });

  it("rejects invalid names and tags", () => {
    const { clans } = setup();
    expect(clans.create(1, "", "SIPH").ok).toBe(false);
    expect(clans.create(1, "Ok Name", "ab").ok).toBe(false);
    expect(clans.create(1, "Ok Name", "TOOLONG").ok).toBe(false);
  });

  it("joins by tag and fills toward the 50-member cap", () => {
    const { clans, storage } = setup(60);
    const created = clans.create(1, "Sipahi Hand", "SIPH");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const clanId = created.value.clanId;
    for (let member = 2; member <= 50; member += 1) {
      expect(clans.join(member, "SIPH").ok).toBe(true);
    }
    expect(storage.clanMemberCount(clanId)).toBe(50);
    expect(clans.join(51, "SIPH").ok).toBe(false);
    expect(clans.join(51, "SIPH").ok).toBe(false);
  });

  it("prevents joining twice or joining two clans", () => {
    const { clans } = setup();
    expect(clans.create(1, "Alpha", "ALP").ok).toBe(true);
    expect(clans.create(2, "Beta", "BET").ok).toBe(true);
    expect(clans.join(3, "ALP").ok).toBe(true);
    expect(clans.join(3, "BET").ok).toBe(false);
  });

  it("invites by player name and accepts", () => {
    const { clans } = setup();
    expect(clans.create(1, "Alpha", "ALP").ok).toBe(true);
    const invited = clans.invite(1, "nobody");
    expect(invited.ok).toBe(false);
    expect(clans.invite(1, "Soldier 2").ok).toBe(true);
    expect(clans.invites(2).length).toBe(1);
    expect(clans.acceptInvite(2, 1).ok).toBe(true);
    expect(clans.roster(2).ok).toBe(true);
  });

  it("allows only the founder to kick and prevents self-kick", () => {
    const { clans } = setup();
    expect(clans.create(1, "Alpha", "ALP").ok).toBe(true);
    expect(clans.join(2, "ALP").ok).toBe(true);
    expect(clans.join(3, "ALP").ok).toBe(true);
    expect(clans.kick(2, 3).ok).toBe(false);
    expect(clans.kick(1, 1).ok).toBe(false);
    const kicked = clans.kick(1, 3);
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) return;
    expect(clans.roster(3).ok).toBe(false);
    expect(clans.roster(2).ok).toBe(true);
  });

  it("transfers the banner when the founder leaves and disbands on empty", () => {
    const { clans } = setup();
    expect(clans.create(1, "Alpha", "ALP").ok).toBe(true);
    expect(clans.join(2, "ALP").ok).toBe(true);
    const left = clans.leave(1);
    expect(left.ok).toBe(true);
    const roster = clans.roster(2);
    expect(roster.ok).toBe(true);
    if (!roster.ok) return;
    expect(roster.value.role).toBe("founder");
    expect(clans.leave(2).ok).toBe(true);
    expect(clans.search("Alpha").length).toBe(0);
  });

  it("aggregates member XP into the clan leaderboard by window", () => {
    const { clans, progression } = setup();
    expect(clans.create(1, "Alpha", "ALP").ok).toBe(true);
    expect(clans.join(2, "ALP").ok).toBe(true);
    const first = progression.getAccount(1);
    const second = progression.getAccount(2);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;
    progression.recordXp(first, Team.Ottoman, 120, XpSource.Kill, 0);
    progression.recordXp(second, Team.Ottoman, 40, XpSource.Kill, 0);
    progression.flush();
    const rows = clans.leaderboard("alltime", 1, 10);
    expect(rows.length).toBe(2);
    expect(rows[0]?.playerId).toBe(1);
    expect(rows[0]?.xp).toBe(120);
    expect(rows[1]?.xp).toBe(40);
  });

  it("persists clan membership across a storage reopen", () => {
    const { storage, clans } = setup();
    expect(clans.create(1, "Persistent", "PERS").ok).toBe(true);
    expect(clans.join(2, "PERS").ok).toBe(true);
    const reopened = new ClanService(storage, () => undefined);
    expect(reopened.roster(2).ok).toBe(true);
    expect(reopened.tagForPlayer(2)).toBe("PERS");
    storage.close();
  });
});
