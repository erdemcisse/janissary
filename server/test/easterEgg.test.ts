import { describe, expect, it } from "vitest";
import { DECHOS_HUNDE_EASTER_EGG, FIXED_DT_MS, Team, XP_EASTER_EGG, XpSource } from "@janissary/shared";
import { addPlayer, createWorldState, enqueueInput, stepWorld } from "../src/sim/world";

describe("Dechos Hunde Easter egg", () => {
  it("queues the one-time XP reward when an active player reaches the hound", () => {
    const world = createWorldState();
    const player = addPlayer(world, "hound-finder", Team.Ottoman);
    expect(player).toBeDefined();
    if (player === undefined) return;

    world.x[player.slot] = DECHOS_HUNDE_EASTER_EGG.x;
    world.z[player.slot] = DECHOS_HUNDE_EASTER_EGG.z;
    enqueueInput(world, player.entityId, {
      seq: 1,
      lastSnapshotTick: world.tick,
      buttons: 0,
      yaw: 0,
      pitch: 0,
      dtMs: FIXED_DT_MS,
    });
    stepWorld(world);

    expect(world.easterEggFound[player.slot]).toBe(1);
    expect(world.warXp[player.slot]).toBe(XP_EASTER_EGG);
    expect(world.xpQueueTail - world.xpQueueHead).toBe(1);
    expect(world.xpQueueSlots[world.xpQueueHead]).toBe(player.slot);
    expect(world.xpQueueSources[world.xpQueueHead]).toBe(XpSource.EasterEgg);
    expect(world.xpQueueAmounts[world.xpQueueHead]).toBe(XP_EASTER_EGG);

    enqueueInput(world, player.entityId, {
      seq: 2,
      lastSnapshotTick: world.tick,
      buttons: 0,
      yaw: 0,
      pitch: 0,
      dtMs: FIXED_DT_MS,
    });
    stepWorld(world);
    expect(world.warXp[player.slot]).toBe(XP_EASTER_EGG);
    expect(world.xpQueueTail - world.xpQueueHead).toBe(1);
  });
});
