import { useEffect, useMemo, useState } from "react";
import { BASE_SPAWN_POINT_INDEX } from "@janissary/shared";
import type { DeathRecap, DebugStats } from "../game/GameClient";
import { Minimap, worldToMapFor } from "./Minimap";
import { ClassPicker } from "./ClassPicker";
import { classPickAppliesTo, deathPhase, deployArmed, reconcileSpawnSelection, spawnMarkers } from "./deathFlow";

/**
 * Phase 8e-13 death screen. Replaces the old respawn countdown + side panels:
 * no seconds anywhere — death opens this screen immediately, the deploy floor
 * (server DEPLOY_MIN_SECONDS) shows only as a disarmed button, and the player
 * deploys when ready. The live minimap (the same Minimap component as the HUD,
 * rendered larger) carries clickable spawn markers for home base and every
 * owned capture point; the class picker is the shared ClassPicker.
 *
 * Keyboard while the screen is up (inputEnabled): digits 1–8 pick a class
 * (ClassPicker), 0 / 9 / Home pick home base, Enter or Space deploy once armed.
 * Enter-to-open-chat is suppressed by App for as long as this screen shows.
 */

const FLAVOR_LINES: readonly string[] = [
  "Sultan Mehmed II was only 21 when he besieged Constantinople in April 1453.",
  "Orban's great bombard 'Basilica' threw ~500 kg stone balls and took hours to reload.",
  "On April 22, 1453, the Ottomans hauled ~70 ships overland into the Golden Horn.",
  "Janissaries were elite Kapıkulu infantry, armed with tüfek matchlocks and bows.",
  "The Mehter band — kös drums and zurna — is the world's oldest military band tradition.",
  "A great chain across the Golden Horn blocked the Ottoman fleet from the harbor.",
  "Constantine XI defended with only ~7,000–8,000 men against roughly 60,000–80,000.",
  "The 5th-century Theodosian Walls had repelled sieges for a thousand years.",
  "Giustiniani's 700 Genoese professionals were the backbone of the wall defense.",
  "Defenders rarely fired large guns from the walls — the recoil shook the old stone.",
];

const KIND_LABEL: Readonly<Record<DeathRecap["kind"], string>> = {
  arquebus: "arquebus fire", crossbow: "a crossbow bolt", melee: "cold steel", sword: "cold steel", dagger: "a dagger", artillery: "a bombard", galleygun: "a galley gun", drowning: "the Golden Horn", unknown: "the siege",
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Map edge length: generous on desktop, trimmed so 1280×720 keeps the picker on screen. */
function mapSizeForViewport(): number {
  return window.innerHeight < 800 ? 360 : 520;
}

export function DeathScreen({ stats, inputEnabled, onSelectSpawn, onSelectClass, onDeploy }: {
  readonly stats: DebugStats;
  readonly inputEnabled: boolean;
  readonly onSelectSpawn: (pointIndex: number) => void;
  readonly onSelectClass: (playerClass: DebugStats["queuedClass"]) => void;
  readonly onDeploy: () => void;
}): React.JSX.Element {
  const phase = deathPhase(stats.health, stats.respawnTicks);
  const armed = deployArmed(phase);
  const [selected, setSelected] = useState<number>(BASE_SPAWN_POINT_INDEX);
  const size = mapSizeForViewport();
  const toMap = useMemo(() => worldToMapFor(size), [size]);
  const markers = spawnMarkers(stats.points, stats.team);

  // A selected point that changed hands drops back to home base (server would
  // revalidate at deploy anyway — this keeps the UI honest about it).
  useEffect(() => {
    const reconciled = reconcileSpawnSelection(selected, stats.points, stats.team);
    if (reconciled === selected) return;
    setSelected(reconciled);
    onSelectSpawn(reconciled);
  }, [onSelectSpawn, selected, stats.points, stats.team]);

  const chooseSpawn = (pointIndex: number): void => {
    setSelected(pointIndex);
    onSelectSpawn(pointIndex);
  };

  useEffect(() => {
    if (!inputEnabled) return;
    const onKey = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Digit0" || event.code === "Numpad0" || event.code === "Digit9" || event.code === "Numpad9" || event.code === "Home") {
        event.preventDefault();
        chooseSpawn(BASE_SPAWN_POINT_INDEX);
      } else if (event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
        if (armed) onDeploy();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const flavor = FLAVOR_LINES[stats.deaths % FLAVOR_LINES.length] ?? FLAVOR_LINES[0];
  const lastDeath = stats.lastDeath;
  return (
    <div className="death-screen">
      <div className="death-head">
        {lastDeath !== undefined && (
          <p className="death-recap">
            Struck down by <b>{lastDeath.byClassLabel} {lastDeath.byName}</b> — {KIND_LABEL[lastDeath.kind]}
            {lastDeath.direction !== "" && <> — <span className="dir">{lastDeath.direction}</span></>}
          </p>
        )}
        <p className="flavor">{flavor}</p>
      </div>
      <div className="death-body">
        <div className="death-map" style={{ width: size, height: size }}>
          <Minimap
            points={stats.points}
            occupancy={stats.pointOccupancy}
            walls={stats.walls}
            wallHp={stats.wallHp}
            hotspot={stats.hotspot}
            blips={stats.blips}
            selfX={stats.selfX}
            selfZ={stats.selfZ}
            selfYaw={stats.selfYaw}
            team={stats.team}
            squadEntityIds={stats.squadEntityIds}
            size={size}
            chrome={false}
          />
          {markers.map((marker) => {
            const [mx, my] = toMap(marker.x, marker.z);
            return (
              <button
                key={marker.pointIndex}
                type="button"
                className={`spawn-marker${marker.home ? " home" : ""}${selected === marker.pointIndex ? " selected" : ""}`}
                style={{ left: mx, top: my }}
                title={marker.label}
                aria-label={`Spawn at ${marker.label}`}
                onClick={() => chooseSpawn(marker.pointIndex)}
              />
            );
          })}
          <span className="death-map-caption">Choose a foothold — ownership and enemy presence are checked again when you deploy.</span>
        </div>
        <div className="death-side">
          <ClassPicker
            team={stats.team}
            queuedClass={stats.queuedClass}
            classStatus={stats.classStatus}
            inputEnabled={inputEnabled}
            onSelect={onSelectClass}
            hint={classPickAppliesTo(phase) === "this-deploy" ? "Applies to this deploy." : "Applies to your next life."}
          />
          <button type="button" className="deploy-button" disabled={!armed} onClick={onDeploy}>
            {armed ? "Deploy" : "Mustering…"}
            <kbd>⏎</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
