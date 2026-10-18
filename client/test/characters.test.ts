import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PlayerClass, Team } from "@janissary/shared";
import {
  baseClipFor,
  characterModelForClass,
  configureDeathAction,
  locomotionClipFor,
  longarmAimForward,
  longarmAxisSign,
  longarmUsesTwoHandPlacement,
  pickStealRig,
  teamForModel,
  weaponForSlot,
} from "../src/game/world/characters";

describe("characterModelForClass", () => {
  it("maps every 1453 class to a faction-appropriate rigged model", () => {
    expect(characterModelForClass(PlayerClass.Janissary)).toBe("janissaryMusketeer");
    expect(characterModelForClass(PlayerClass.Sipahi)).toBe("janissarySwordsman");
    expect(characterModelForClass(PlayerClass.Topcu)).toBe("ottomanGunner");
    expect(characterModelForClass(PlayerClass.Mehter)).toBe("ottomanAzap");
    expect(characterModelForClass(PlayerClass.Guardsman)).toBe("byzantineCrossbowman");
    expect(characterModelForClass(PlayerClass.WallGunner)).toBe("byzantineCrossbowman");
    expect(characterModelForClass(PlayerClass.Knight)).toBe("byzantineGuardsman");
    expect(characterModelForClass(PlayerClass.Priest)).toBe("byzantineGuardsman");
    expect(characterModelForClass(PlayerClass.None)).toBe("janissaryMusketeer");
  });

  it("keeps model teams consistent with class teams", () => {
    for (const playerClass of [PlayerClass.Janissary, PlayerClass.Sipahi, PlayerClass.Topcu, PlayerClass.Mehter] as const) {
      expect(teamForModel(characterModelForClass(playerClass))).toBe(Team.Ottoman);
    }
    for (const playerClass of [PlayerClass.Guardsman, PlayerClass.WallGunner, PlayerClass.Knight, PlayerClass.Priest] as const) {
      expect(teamForModel(characterModelForClass(playerClass))).toBe(Team.Byzantine);
    }
  });
});

describe("weaponForSlot", () => {
  it("gives Ottoman models the kilij/arquebus/yatagan set", () => {
    expect(weaponForSlot("janissaryMusketeer", 1)).toBe("kilijSword");
    expect(weaponForSlot("janissaryMusketeer", 2)).toBe("matchlockArquebus");
    expect(weaponForSlot("janissarySwordsman", 1)).toBe("kilijSwordAlternative");
    expect(weaponForSlot("ottomanGunner", 2)).toBe("matchlockArquebusAlternative");
    expect(weaponForSlot("ottomanAzap", 3)).toBe("yatagan");
  });

  it("gives Byzantine models the mace/crossbow/yatagan set", () => {
    expect(weaponForSlot("byzantineGuardsman", 1)).toBe("warMace");
    expect(weaponForSlot("byzantineCrossbowman", 2)).toBe("heavyCrossbow");
    expect(weaponForSlot("byzantineCrossbowman", 3)).toBe("yatagan");
  });
});

describe("longarm orientation", () => {
  it("points firearm +X and crossbow -X down the soldier's forward line", () => {
    expect(longarmAxisSign("matchlockArquebus")).toBe(1);
    expect(longarmAxisSign("matchlockArquebusAlternative")).toBe(1);
    expect(longarmAxisSign("heavyCrossbow")).toBe(-1);
    expect(longarmAimForward("heavyCrossbow")).toBeLessThan(longarmAimForward("matchlockArquebus"));
  });

  it("only uses the two-hand span for shoulder-ready clips", () => {
    expect(longarmUsesTwoHandPlacement("aim")).toBe(true);
    expect(longarmUsesTwoHandPlacement("fire")).toBe(true);
    expect(longarmUsesTwoHandPlacement("idle")).toBe(false);
    expect(longarmUsesTwoHandPlacement("walk")).toBe(false);
    expect(longarmUsesTwoHandPlacement("death")).toBe(false);
  });
});

describe("locomotionClipFor", () => {
  it("walks above 0.5 m/s and idles below — never runs (walk-only, 8e-19)", () => {
    expect(locomotionClipFor("idle", 0)).toBe("idle");
    expect(locomotionClipFor("idle", 0.4)).toBe("idle");
    expect(locomotionClipFor("idle", 0.6)).toBe("walk");
    expect(locomotionClipFor("idle", 6.8)).toBe("walk");
  });

  it("hysteresis: a moving soldier keeps walking until speed drops below 0.25", () => {
    expect(locomotionClipFor("run", 4.0)).toBe("walk");
    expect(locomotionClipFor("run", 3.7)).toBe("walk");
    expect(locomotionClipFor("run-alt", 4.0)).toBe("walk"); // stale run state resolves to walk
    expect(locomotionClipFor("walk", 0.3)).toBe("walk");
    expect(locomotionClipFor("walk", 0.2)).toBe("idle");
  });
});

describe("baseClipFor", () => {
  const ranged = { ranged: true, previousLocomotion: "idle" as const };

  it("holds the authored two-hand ready pose whenever a ranged soldier is stationary", () => {
    expect(baseClipFor({ ...ranged, speed: 0 })).toBe("aim");
  });

  it("never aims while moving", () => {
    expect(baseClipFor({ ...ranged, speed: 1.2 })).toBe("walk");
  });

  it("never aims while a melee slot is active", () => {
    expect(baseClipFor({ ranged: false, speed: 0, previousLocomotion: "idle" })).toBe("idle");
  });

  it("walks at top speed — no run/run-alt clips are ever selected (8e-19)", () => {
    expect(baseClipFor({ ...ranged, speed: 6.8 })).toBe("walk");
  });
});

describe("pickStealRig", () => {
  it("steals a corpse before any live rig, however close the requester is", () => {
    const candidates = [
      { distanceSq: 10, corpse: false },
      { distanceSq: 5, corpse: true },
    ];
    expect(pickStealRig(candidates, 1)).toBe(1);
  });

  it("steals the farthest live rig when no corpse exists — but only one farther than the requester", () => {
    const candidates = [
      { distanceSq: 100, corpse: false },
      { distanceSq: 900, corpse: false },
      { distanceSq: 400, corpse: false },
    ];
    expect(pickStealRig(candidates, 225)).toBe(1);
    expect(pickStealRig(candidates, 10_000)).toBe(-1); // requester farthest: nobody yields
  });

  it("returns -1 for an empty pool", () => {
    expect(pickStealRig([], 0)).toBe(-1);
  });
});

describe("configureDeathAction (8e-16 corpse policy)", () => {
  function deathAction(): { mixer: THREE.AnimationMixer; action: THREE.AnimationAction } {
    const target = new THREE.Object3D();
    const mixer = new THREE.AnimationMixer(target);
    const track = new THREE.NumberKeyframeTrack(".position[x]", [0, 0.8], [0, 1]);
    const clip = new THREE.AnimationClip("death", 0.8, [track]);
    return { mixer, action: mixer.clipAction(clip) };
  }

  it("snaps to full weight on a fresh rig — no bind-pose fade window", () => {
    const { mixer, action } = deathAction();
    configureDeathAction(action, false);
    // Weight is 1 immediately; the first mixer step already renders the
    // death clip's opening frame, never the bind pose.
    expect(action.getEffectiveWeight()).toBe(1);
    mixer.update(0);
    expect(action.getEffectiveWeight()).toBe(1);
    expect(action.isRunning()).toBe(true);
  });

  it("cross-fades over a running action instead of snapping", () => {
    const { mixer, action } = deathAction();
    configureDeathAction(action, true);
    // fadeIn schedules a ramp FROM 0 — once the mixer evaluates it, the
    // effective weight is mid-ramp, not the instant full weight of the snap.
    mixer.update(0.01);
    expect(action.getEffectiveWeight()).toBeLessThan(1);
  });

  it("clamps on the last frame forever — never loops back to a standing pose", () => {
    const { mixer, action } = deathAction();
    configureDeathAction(action, false);
    mixer.update(2.5); // well past the 0.8 s clip
    expect(action.paused).toBe(true); // clampWhenFinished held the last frame
    expect(action.getEffectiveWeight()).toBe(1); // still fully applied
    expect(action.time).toBeCloseTo(0.8, 3); // pinned at the clip end
    mixer.update(5);
    expect(action.paused).toBe(true);
    expect(action.getEffectiveWeight()).toBe(1);
  });
});
