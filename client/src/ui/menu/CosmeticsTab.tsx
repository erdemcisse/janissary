import { useEffect, useState } from "react";
import { PlayerClass } from "@janissary/shared";
import { httpServerUrl } from "../../net/serverUrl";

/**
 * Cosmetics tab — real locked/unlocked skin slots from the /skins API
 * (Phase 8c-0 data), with the unlock condition shown on locked slots. Slot
 * art tiles stand in until Phase 8c-2 ships the actual skin art.
 */

const COSMETIC_SLOTS: readonly string[] = ["Helmet", "Cuirass", "Banner", "Medal mount", "Weapon skin", "Horse caparison"];

interface SkinView {
  id: string;
  class: number;
  name: string;
  description: string;
  art: string;
  unlockLabel: string;
  unlocked: boolean;
}

function className(playerClass: PlayerClass): string {
  return ({
    [PlayerClass.Janissary]: "Janissary", [PlayerClass.Sipahi]: "Sipahi", [PlayerClass.Topcu]: "Topçu",
    [PlayerClass.Mehter]: "Mehter", [PlayerClass.Guardsman]: "Guardsman", [PlayerClass.Knight]: "Knight",
    [PlayerClass.WallGunner]: "Wall Gunner", [PlayerClass.Priest]: "Priest",
  } as Partial<Record<PlayerClass, string>>)[playerClass] ?? "Unassigned";
}

function LockGlyph(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="currentColor" />
      <path d="M5.5 7 L5.5 5.2 A2.5 2.5 0 0 1 10.5 5.2 L10.5 7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function CosmeticsTab({ claimed }: { claimed: boolean }): React.JSX.Element {
  const [skins, setSkins] = useState<readonly SkinView[]>([]);
  const [equips, setEquips] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [equipPending, setEquipPending] = useState(false);

  const skinApi = async (path: string, body?: unknown): Promise<{ skins: SkinView[]; equips: Record<string, string> }> => {
    const response = await fetch(`${httpServerUrl()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("janissary-token") ?? ""}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json() as { skins?: SkinView[]; equips?: Record<string, string>; error?: string };
    if (!response.ok) throw new Error(value.error ?? "Skin request failed");
    if (value.skins === undefined || value.equips === undefined) throw new Error("Skin request failed");
    return { skins: value.skins, equips: value.equips };
  };

  useEffect(() => {
    void skinApi("/skins")
      .then((state) => { setSkins(state.skins); setEquips(state.equips); })
      .catch((reason: unknown) => setStatus(reason instanceof Error ? reason.message : "Could not load skins"));
  }, []);

  const equip = (skinId: string): void => {
    setEquipPending(true);
    setStatus("");
    void skinApi("/skins/equip", { skinId })
      .then((state) => { setSkins(state.skins); setEquips(state.equips); })
      .catch((reason: unknown) => setStatus(reason instanceof Error ? reason.message : "Could not equip skin"))
      .finally(() => setEquipPending(false));
  };

  const grouped = new Map<number, readonly SkinView[]>();
  for (const skin of skins) {
    const group = grouped.get(skin.class) ?? [];
    grouped.set(skin.class, [...group, skin]);
  }

  return (
    <>
      <p className="clan-note">Unlockable costume variants per class. Progress-based only — no purchases, matching the reserved monetization plan.</p>
      {status !== "" && <p className="clan-status">{status}</p>}
      {!claimed && <p className="clan-note">Skins persist per account — save your progress so they follow you across devices.</p>}
      {skins.length === 0 && (
        <div className="cosmetic-grid">
          {COSMETIC_SLOTS.map((slot) => (
            <div key={slot} className="cosmetic-slot">
              <span className="skin-art"><LockGlyph /></span>
              <b>{slot}</b>
              <small>Coming soon</small>
            </div>
          ))}
        </div>
      )}
      {skins.length > 0 && [...grouped.entries()].map(([playerClass, classSkins]) => (
        <section key={playerClass}>
          <h3 className="eyebrow">{className(playerClass as PlayerClass)}</h3>
          <div className="cosmetic-grid">
            {classSkins.map((skin) => {
              const equipped = equips[String(skin.class)] === skin.id;
              return (
                <div key={skin.id} className={`cosmetic-slot ${skin.unlocked ? "available" : ""} ${equipped ? "equipped" : ""}`}>
                  <span className="skin-art">{skin.unlocked ? skin.name.slice(0, 1) : <LockGlyph />}</span>
                  <b>{skin.name}</b>
                  <small>{skin.description}</small>
                  <small className="skin-unlock">{skin.unlockLabel}</small>
                  {skin.unlocked
                    ? equipped
                      ? <small className="skin-equipped">EQUIPPED</small>
                      : <button type="button" disabled={equipPending} onClick={() => equip(skin.id)}>Equip</button>
                    : <small className="skin-locked">LOCKED</small>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
