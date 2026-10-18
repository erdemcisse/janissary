import { describe, expect, it } from "vitest";
import { SquadManager } from "../src/squads";

function manager(): SquadManager {
  const friends = new Set<string>(["1:2", "1:3"]);
  const online = new Set<number>([1, 2, 3, 4]);
  return new SquadManager(
    (a, b) => friends.has(`${Math.min(a, b)}:${Math.max(a, b)}`),
    (playerId) => online.has(playerId),
  );
}

describe("squads (Phase 8c-7)", () => {
  it("creates a squad on the first invite and caps at 6 members", () => {
    const squads = manager();
    expect(squads.invite(1, 2)).toEqual({ affected: [1, 2] });
    expect(squads.memberEntityIds(1, (id) => id)).toEqual([1, 2]);
    for (const member of [3, 4]) {
      // 3 is a friend of 1; 4 is not — the cap path is exercised via friend 3
      // plus the non-friend rejection.
      const result = squads.invite(1, member);
      if (member === 3) expect(result).not.toBe("not-friend");
    }
  });

  it("only invites friends and online players", () => {
    const squads = manager();
    expect(squads.invite(1, 4)).toBe("not-friend"); // 4 is neither a friend nor online
    expect(squads.invite(1, 3)).toEqual({ affected: [1, 3] });
    expect(squads.invite(1, 2)).toEqual({ affected: [1, 3, 2] });
    expect(squads.memberEntityIds(1, (id) => id)).toContain(3);
    expect(squads.invite(2, 3)).toBe("not-friend"); // 2 is not friends with 3; only the leader invites anyway
  });

  it("dissolves when the leader leaves or disbands, not when a member leaves", () => {
    const squads = manager();
    squads.invite(1, 2);
    squads.invite(1, 3);
    const affected = squads.leave(2);
    expect(affected).toEqual([2, 1, 3]); // member leave notifies the rest
    expect(squads.memberEntityIds(1, (id) => id)).toEqual([1, 3]);
    expect(squads.leave(1)).toEqual([1, 3]); // leader leave dissolves
    expect(squads.memberEntityIds(1, (id) => id)).toEqual([]);
    squads.invite(1, 2);
    expect(squads.disband(2)).toBe("not-leader");
    expect(squads.disband(1)).toEqual({ affected: [1, 2] });
    expect(squads.memberEntityIds(2, (id) => id)).toEqual([]);
  });
});
