import { describe, expect, it } from "vitest";
import { BATTLE_BED_FAR_CUTOFF_METERS, BATTLE_BED_NEAR_CUTOFF_METERS, CROSSBOW_MAX_DISTANCE, DISTANCE_CULL_METERS, FOOTSTEP_MAX_INTERVAL_SECONDS, FOOTSTEP_MIN_INTERVAL_SECONDS, FOOTSTEP_STRIDE_METERS, LOWPASS_MAX_HZ, LOWPASS_MIN_HZ, LOWPASS_START_METERS, QUARANTINED_AUDIO_KEYS, VOICE_GROUP_CAPS, battleBedContribution, footstepIntervalSeconds, footstepSurfaceAt, lowpassFrequencyFor, PITCH_JITTER, SAMPLE_WINDOWS, shoreLevelFor, spatialGainFactor, surfaceAt, VARIANT_POOLS, VOICE_POLICY, VoiceGate } from "../src/game/audio/audioEngine";
import { AUDIO_MANIFEST, AUDIO_MANIFEST_BY_KEY } from "../src/game/audio/manifest";

/**
 * Phase 8c-6 regression cover for the footstep-surface fix and the one-shot
 * voice gate.
 *
 * surfaceAt previously duplicated world facts as hardcoded coordinate bands
 * that predated the 8c-4 map expansion and the 8c-4b river: dock piers
 * (z ≈ 236) played water splashes, bridge decks played grass, and wading the
 * river played grass. It now consumes the shared map geometry, so these
 * tests pin the observable results, not the old bands.
 */

function stubSource(): AudioBufferSourceNode {
  return { stop: () => undefined } as unknown as AudioBufferSourceNode;
}

describe("surfaceAt (shared map geometry)", () => {
  it("returns wood on a dock pier even though it sits past the water line", () => {
    // dock-pier-0 at (-284, 236): deep-water z, but deck wins (deck before water).
    expect(surfaceAt(-284, 236)).toBe("wood");
  });

  it("returns wood on every bridge deck, including decks spanning the river", () => {
    expect(surfaceAt(-327, 170)).toBe("wood"); // river-bridge-south, inside the river band
    expect(surfaceAt(-319, 10)).toBe("wood"); // river-bridge-road
    expect(surfaceAt(-330, -130)).toBe("wood"); // river-bridge-north
  });

  it("returns water in the river fords and the deep channel", () => {
    expect(surfaceAt(-327, 110)).toBe("water"); // ford A center
    expect(surfaceAt(-330, -95)).toBe("water"); // ford B center
    expect(surfaceAt(-333, 190)).toBe("water"); // deep channel, north reach
    expect(surfaceAt(-330, -60)).toBe("water"); // deep channel between the bridges
  });

  it("returns water past the sea shore", () => {
    expect(surfaceAt(0, 300)).toBe("water");
    expect(surfaceAt(-240, 240)).toBe("water"); // clear of the pier planking
  });

  it("returns stone on the wall lane and in the stone-walled inner city", () => {
    expect(surfaceAt(0, 0)).toBe("stone");
    expect(surfaceAt(60, 4)).toBe("stone");
    expect(surfaceAt(0, -70)).toBe("stone"); // inner city streets
    expect(surfaceAt(18, -60)).toBe("stone");
  });

  it("returns grass on open ground, the earth defender platform, and outside the city walls", () => {
    expect(surfaceAt(200, 100)).toBe("grass");
    expect(surfaceAt(0, -24)).toBe("grass"); // defender platform is packed earth, not wood
    expect(surfaceAt(-30, -70)).toBe("grass"); // outside the inner-city half-extent
    expect(surfaceAt(0, -95)).toBe("grass"); // south of the district
  });
});

describe("VoiceGate", () => {
  it("drops plays inside the same key's retrigger window instead of stacking", () => {
    const gate = new VoiceGate();
    expect(gate.begin("gunshot", 0, stubSource)).toBeDefined();
    // gunshot policy: min retrigger 60 ms.
    expect(gate.begin("gunshot", 30, stubSource)).toBeUndefined();
    expect(gate.begin("gunshot", 59, stubSource)).toBeUndefined();
    expect(gate.begin("gunshot", 61, stubSource)).toBeDefined();
  });

  it("caps concurrent voices per key and steals the oldest at cap", () => {
    const gate = new VoiceGate();
    // death policy: cap 4, min retrigger 30 ms — pick 4 distinct slots.
    const sources = [stubSource(), stubSource(), stubSource(), stubSource()];
    for (let index = 0; index < 4; index += 1) {
      const source = sources[index];
      if (source === undefined) continue;
      expect(gate.begin("death", index * 100, () => source)).toBe(source);
    }
    expect(gate.activeCount("death")).toBe(4);
    const fifth = stubSource();
    const stolen = gate.begin("death", 400, () => fifth);
    expect(stolen).toBe(fifth);
    expect(gate.activeCount("death")).toBe(4);
  });

  it("keeps independent per-key policies (footsteps never block gunfire)", () => {
    const gate = new VoiceGate();
    expect(gate.begin("footsteps-stone", 0, stubSource)).toBeDefined();
    expect(gate.begin("gunshot", 1, stubSource)).toBeDefined();
    expect(gate.begin("footsteps-stone", 10, stubSource)).toBeUndefined(); // 30 ms window
    expect(gate.begin("gunshot", 10, stubSource)).toBeUndefined(); // 60 ms window
    expect(gate.begin("gunshot", 70, stubSource)).toBeDefined();
  });

  it("frees slots when voices end", () => {
    const gate = new VoiceGate();
    const first = gate.begin("death", 0, stubSource);
    const second = gate.begin("death", 100, stubSource);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(gate.activeCount("death")).toBe(2);
    if (first !== undefined) gate.release("death", first);
    expect(gate.activeCount("death")).toBe(1);
    const third = gate.begin("death", 200, stubSource);
    expect(third).toBeDefined();
    if (second !== undefined) gate.release("death", second);
    if (third !== undefined) gate.release("death", third);
    expect(gate.activeCount("death")).toBe(0);
  });

  it("flags only voices alive past their expected end (8e-16 long-runner tripwire)", () => {
    const gate = new VoiceGate();
    // A stuck 0.75 s gunshot window: at +4 s (grace 1.5 s) it must flag.
    const stuck = gate.begin("gunshot", 0, stubSource, 750);
    expect(stuck).toBeDefined();
    expect(gate.longRunners(2_000, 1_500)).toEqual([]); // inside its tail
    const flagged = gate.longRunners(4_000, 1_500);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.key).toBe("gunshot");
    expect(flagged[0]?.ageMs).toBe(4_000);
    // The long source is now windowed to the short impact event; the old
    // 12.1 s tail was the remaining delayed/echo-like artillery complaint.
    const impactGate = new VoiceGate();
    const bombard = impactGate.begin("bombard-impact", 0, stubSource, 1_600);
    expect(bombard).toBeDefined();
    expect(impactGate.longRunners(2_000, 1_500)).toEqual([]);
    // A voice with no declared bound never flags (Infinity default).
    gate.begin("death", 0, stubSource);
    expect(gate.longRunners(600_000, 1_500).some((runner) => runner.key === "death")).toBe(false);
  });

  it("bounds the combined remote musket and crossbow group", () => {
    const gate = new VoiceGate();
    for (let index = 0; index < (VOICE_GROUP_CAPS["remote-shot"] ?? 0); index += 1) {
      expect(gate.begin("gunshot", index * 100, stubSource)).toBeDefined();
    }
    expect(gate.countsByGroup()["remote-shot"]).toBe(VOICE_GROUP_CAPS["remote-shot"]);
    // A full group drops the newcomer; it must not stop a report already in
    // flight, which was the audible source of clipped volley tails.
    expect(gate.begin("crossbow", 1_000, stubSource)).toBeUndefined();
    expect(gate.countsByGroup()["remote-shot"]).toBe(VOICE_GROUP_CAPS["remote-shot"]);
    expect(gate.totalCount()).toBe(VOICE_GROUP_CAPS["remote-shot"]);
  });
});

describe("distant battle bed", () => {
  it("does not duplicate close positional fire", () => {
    expect(battleBedContribution(0)).toBe(0);
    expect(battleBedContribution(BATTLE_BED_NEAR_CUTOFF_METERS - 15)).toBe(0);
    expect(battleBedContribution(BATTLE_BED_NEAR_CUTOFF_METERS)).toBe(0);
    expect(battleBedContribution(BATTLE_BED_NEAR_CUTOFF_METERS + 1)).toBeGreaterThan(0);
    expect(battleBedContribution(BATTLE_BED_FAR_CUTOFF_METERS)).toBe(1);
    expect(battleBedContribution(BATTLE_BED_FAR_CUTOFF_METERS + 50)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 8e-10 Task 3: the inverse-distance falloff, footstep cadence, and the
// worn-road dirt surface.
// ---------------------------------------------------------------------------

describe("spatialGainFactor (Phase 8e-10)", () => {
  // The gunshot row: ref 14 m, max 150 m.
  it("is full gain inside the reference distance", () => {
    expect(spatialGainFactor(0, 14, 150)).toBe(1);
    expect(spatialGainFactor(5, 14, 150)).toBe(1);
    expect(spatialGainFactor(14, 14, 150)).toBe(1);
  });

  it("falls off as ref/d beyond the reference distance", () => {
    expect(spatialGainFactor(28, 14, 150)).toBeCloseTo(0.5, 5);
    expect(spatialGainFactor(70, 14, 150)).toBeCloseTo(0.2, 5);
  });

  it("keeps mid-range shots clearly quieter than close ones (the 8e-10 report)", () => {
    const at20 = spatialGainFactor(20, 14, 150);
    const at100 = spatialGainFactor(100, 14, 150);
    expect(at100).toBeLessThan(at20 / 4);
  });

  it("is monotone decreasing from ref to the edge fade", () => {
    let previous = Infinity;
    for (const d of [14, 20, 30, 50, 80, 110, 127]) {
      const gain = spatialGainFactor(d, 14, 150);
      expect(gain).toBeLessThan(previous);
      previous = gain;
    }
  });

  it("fades smoothly to an inaudible boundary instead of popping in", () => {
    // Fade starts at 0.85 × max; the curve is continuous there...
    const fadeStart = 150 * 0.85;
    expect(spatialGainFactor(fadeStart, 14, 150)).toBeCloseTo(14 / fadeStart, 5);
    // ...and reaches the cutoff at under 0.2% of base gain.
    expect(spatialGainFactor(149.9, 14, 150)).toBeLessThan(0.002);
    expect(spatialGainFactor(150, 14, 150)).toBe(0);
    expect(spatialGainFactor(200, 14, 150)).toBe(0);
  });

  it("never returns more than 1 or a negative gain", () => {
    expect(spatialGainFactor(0.001, 14, 150)).toBe(1);
    expect(spatialGainFactor(10, 14, 0)).toBe(0);
  });
});

// Phase 8e-19 Task 6: hard distance cull + distance low-pass. The cull
// table must sit UNDER the manifest maxDistance (it trims the faint tail,
// never the audible band), and the low-pass curve must slide exactly
// between the pinned endpoints.
describe("distance cull + low-pass (Phase 8e-19 Task 6)", () => {
  it("every cull entry is stricter than the manifest maxDistance", () => {
    for (const [key, cutoff] of Object.entries(DISTANCE_CULL_METERS)) {
      const max = AUDIO_MANIFEST_BY_KEY.get(key)?.maxDistance ?? (key === "crossbow" ? CROSSBOW_MAX_DISTANCE : undefined);
      expect(max, `${key} has no manifest maxDistance`).toBeDefined();
      expect(cutoff, `${key} cull ${cutoff} must sit under max ${max}`).toBeLessThanOrEqual(max ?? 0);
      expect(cutoff).toBeGreaterThan(0);
    }
  });

  it("culls the keys the battle actually plays", () => {
    for (const expected of ["gunshot", "bombard-fire", "footsteps-stone", "death"]) {
      expect(DISTANCE_CULL_METERS[expected]).toBeDefined();
    }
  });

  it("low-pass slides 20 kHz → 900 Hz across the cull band", () => {
    expect(lowpassFrequencyFor(LOWPASS_START_METERS, 90)).toBeCloseTo(LOWPASS_MAX_HZ, 0);
    expect(lowpassFrequencyFor(90, 90)).toBeCloseTo(LOWPASS_MIN_HZ, 0);
    expect(lowpassFrequencyFor(0, 90)).toBeCloseTo(LOWPASS_MAX_HZ, 0);
    const mid = lowpassFrequencyFor((LOWPASS_START_METERS + 90) / 2, 90);
    expect(mid).toBeLessThan(LOWPASS_MAX_HZ);
    expect(mid).toBeGreaterThan(LOWPASS_MIN_HZ);
  });

  it("keeps a small non-stealing remote group with the cull in place", () => {
    expect(VOICE_POLICY.gunshot?.cap).toBe(6);
    expect(VOICE_POLICY.gunshot?.minRetriggerMs).toBe(60);
    expect(VOICE_POLICY.crossbow?.cap).toBe(4);
    expect(DISTANCE_CULL_METERS.crossbow).toBe(90);
    expect(VOICE_GROUP_CAPS["remote-shot"]).toBe(3);
    expect(BATTLE_BED_NEAR_CUTOFF_METERS).toBe(DISTANCE_CULL_METERS.gunshot);
  });

  it("keeps the echo-bearing session recording out of the live shot pool", () => {
    expect(QUARANTINED_AUDIO_KEYS).toContain("gunshot-f");
    expect(VARIANT_POOLS.gunshot).not.toContain("gunshot-f");
    expect(AUDIO_MANIFEST_BY_KEY.get("gunshot-f")?.file).toBe("audio/musket-shots-session.m4a");
  });
});

// Phase 8e-16 Task 4: the owner hears distant shots as "too loud, no
// proximity". The curve itself is pinned above; this sweep proves every
// positional MANIFEST row gets the cutoff applied — full gain at its
// refDistance, ≤ half at 2× refDistance, hard zero at its maxDistance.
describe("manifest distance cutoffs (Phase 8e-16)", () => {
  const positionalRows = AUDIO_MANIFEST.filter((asset) => asset.maxDistance !== undefined);

  it("covers the keys the battle actually plays", () => {
    const keys = positionalRows.map((asset) => asset.key);
    for (const expected of ["gunshot", "own-gunshot", "bombard-fire", "bombard-impact", "death", "footsteps-grass-walk"]) {
      expect(keys).toContain(expected);
    }
  });

  it("every positional row is full gain at ref, halved by 2× ref, zero at max", () => {
    for (const asset of positionalRows) {
      const ref = asset.refDistance ?? 10; // SPATIAL_REF_DEFAULT_METERS
      const max = asset.maxDistance ?? 0;
      expect(spatialGainFactor(ref, ref, max), `${asset.key} @ ref`).toBe(1);
      expect(spatialGainFactor(ref * 2, ref, max), `${asset.key} @ 2×ref`).toBeLessThanOrEqual(0.5);
      expect(spatialGainFactor(max, ref, max), `${asset.key} @ max`).toBe(0);
      expect(spatialGainFactor(max + 1, ref, max), `${asset.key} @ max+1`).toBe(0);
    }
  });
});

describe("footstepIntervalSeconds (Phase 8e-10)", () => {
  it("spaces steps by stride over ground speed", () => {
    expect(footstepIntervalSeconds(3)).toBeCloseTo(FOOTSTEP_STRIDE_METERS / 3, 5);
  });

  it("clamps a top-speed walk to the minimum interval", () => {
    expect(footstepIntervalSeconds(20)).toBe(FOOTSTEP_MIN_INTERVAL_SECONDS);
  });

  it("clamps a near-standstill to the maximum interval", () => {
    expect(footstepIntervalSeconds(0.05)).toBe(FOOTSTEP_MAX_INTERVAL_SECONDS);
    expect(footstepIntervalSeconds(0)).toBe(FOOTSTEP_MAX_INTERVAL_SECONDS);
  });

  it("a 6.8 m/s top-speed walk steps roughly twice as fast as a 3 m/s stroll", () => {
    const fast = footstepIntervalSeconds(6.8);
    const walk = footstepIntervalSeconds(3);
    expect(fast).toBe(FOOTSTEP_MIN_INTERVAL_SECONDS); // 1.9/6.8 would be 0.279 — clamped
    expect(walk / fast).toBeCloseTo(2.1, 1);
  });
});

describe("footstepSurfaceAt (Phase 8e-10 dirt surface)", () => {
  it("returns dirt on the worn road centerlines", () => {
    expect(footstepSurfaceAt(0, 30)).toBe("dirt"); // Ottoman approach lane
    expect(footstepSurfaceAt(0, -24)).toBe("dirt"); // gate breach corridor (packed earth)
  });

  it("keeps grass off the roads", () => {
    expect(footstepSurfaceAt(200, 100)).toBe("grass");
  });

  it("keeps stone on the wall lane and city streets even over a road", () => {
    expect(footstepSurfaceAt(0, 0)).toBe("stone");
    expect(footstepSurfaceAt(0, -80)).toBe("stone"); // road 3 runs through the district
  });

  it("keeps wood decks and water ahead of dirt", () => {
    expect(footstepSurfaceAt(-319, 10)).toBe("wood"); // river-bridge-road deck
    expect(footstepSurfaceAt(-327, 110)).toBe("water"); // ford A
  });
});

// ---------------------------------------------------------------------------
// ADR 0045 (Phase 8e-18): the new sound library doubled the pool/window
// surface. These pins keep the three lookup tables consistent with the
// manifest so a future row can't silently orphan a variant or a window.
// ---------------------------------------------------------------------------

describe("variant pool / window / policy integrity (ADR 0045)", () => {
  it("every variant-pool member resolves to a manifest row", () => {
    for (const [group, members] of Object.entries(VARIANT_POOLS)) {
      expect(members.length, `pool ${group} non-empty`).toBeGreaterThan(0);
      for (const member of members) {
        expect(AUDIO_MANIFEST_BY_KEY.has(member), `pool member ${member} (group ${group})`).toBe(true);
      }
    }
  });

  it("every variant-pool group has a voice-policy row", () => {
    for (const group of Object.keys(VARIANT_POOLS)) {
      expect(VOICE_POLICY[group], `policy for pool ${group}`).toBeDefined();
    }
  });

  it("every sample-window key resolves to a manifest row", () => {
    for (const key of Object.keys(SAMPLE_WINDOWS)) {
      expect(AUDIO_MANIFEST_BY_KEY.has(key), `window key ${key}`).toBe(true);
    }
  });

  it("windows are well-formed (ordered offsets, positive duration, positive gain)", () => {
    for (const [key, window] of Object.entries(SAMPLE_WINDOWS)) {
      expect(window.minOffset, `${key} minOffset`).toBeGreaterThanOrEqual(0);
      expect(window.maxOffset, `${key} maxOffset >= minOffset`).toBeGreaterThanOrEqual(window.minOffset);
      expect(window.duration, `${key} duration`).toBeGreaterThan(0);
      if (window.gain !== undefined) expect(window.gain, `${key} gain`).toBeGreaterThan(0);
    }
  });

  it("every pitch-jitter key resolves to a manifest row", () => {
    for (const key of Object.keys(PITCH_JITTER)) {
      expect(AUDIO_MANIFEST_BY_KEY.has(key), `jitter key ${key}`).toBe(true);
    }
  });

  it("the live gunshot pool excludes the quarantined session event", () => {
    expect(VARIANT_POOLS["gunshot"]).toEqual(["gunshot", "gunshot-b", "gunshot-c", "gunshot-d", "gunshot-e"]);
    expect(AUDIO_MANIFEST_BY_KEY.get("gunshot-f")?.file).toBe("audio/musket-shots-session.m4a");
  });

  it("windows the long artillery impact recording to its event", () => {
    expect(SAMPLE_WINDOWS["bombard-impact"]?.duration).toBe(1.6);
  });

  it("every footstep surface has a manifest key (the footstepKey mapping targets)", () => {
    for (const key of ["footstep-water", "footsteps-stone", "footsteps-wood", "footsteps-dirt", "footsteps-grass-walk", "footsteps-grass-run"]) {
      expect(AUDIO_MANIFEST_BY_KEY.has(key), key).toBe(true);
    }
  });
});

describe("shore ambience gate (Phase 8e-25)", () => {
  it("silences the near-shore bed while the ambient layer is inactive", () => {
    const base = AUDIO_MANIFEST_BY_KEY.get("shore-ambience")?.gain ?? 0;
    expect(shoreLevelFor(false, 1, base)).toBe(0);
    expect(shoreLevelFor(false, 0, base)).toBe(0);
  });

  it("scales the bed with proximity while active and clamps the fraction", () => {
    const base = AUDIO_MANIFEST_BY_KEY.get("shore-ambience")?.gain ?? 0;
    expect(shoreLevelFor(true, 1, base)).toBeCloseTo(base);
    expect(shoreLevelFor(true, 0.5, base)).toBeCloseTo(base * 0.5);
    expect(shoreLevelFor(true, 0, base)).toBe(0);
    expect(shoreLevelFor(true, 2, base)).toBe(base);
    expect(shoreLevelFor(true, -1, base)).toBe(0);
  });
});
