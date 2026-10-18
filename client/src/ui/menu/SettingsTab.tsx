import type { GraphicsQuality, StoredSettings } from "../settings";

/**
 * Settings — Phase 8c-1 adds the graphics-quality preset (renderer pixel
 * ratio, client-only), the FOV slider, and the colorblind-safe team palette
 * toggle alongside the Phase 7 sliders. All values persist via StoredSettings.
 */
export function SettingsTab({ settings, onChange, chatVisible, onToggleChat, latencyEnabled, onToggleLatency }: {
  settings: StoredSettings;
  onChange: (settings: StoredSettings) => void;
  chatVisible: boolean;
  onToggleChat: (visible: boolean) => void;
  latencyEnabled: boolean;
  onToggleLatency: (enabled: boolean) => void;
}): React.JSX.Element {
  return (
    <>
      <section>
        <h3 className="eyebrow">Mouse</h3>
        <label className="settings-row">
          <span>Sensitivity <b>{settings.sensitivityScale.toFixed(2)}×</b></span>
          <input type="range" min={0.5} max={2} step={0.05} value={settings.sensitivityScale} onChange={(event) => onChange({ ...settings, sensitivityScale: Number(event.target.value) })} />
        </label>
      </section>
      <section>
        <h3 className="eyebrow">Graphics</h3>
        <div className="settings-row">
          <span>Quality preset <b>{settings.quality.toUpperCase()}</b></span>
          <div className="settings-segment" role="radiogroup" aria-label="Graphics quality">
            {(["low", "medium", "high"] as const).map((quality: GraphicsQuality) => (
              <button key={quality} type="button" role="radio" aria-checked={settings.quality === quality} className={settings.quality === quality ? "active" : ""} onClick={() => onChange({ ...settings, quality })}>{quality}</button>
            ))}
          </div>
          <small className="settings-hint">Low removes grass, shadows, and animated distant rigs. Medium keeps the battle readable with reduced detail. High restores full-resolution terrain, sharper distant fog, and anti-aliasing.</small>
        </div>
        <label className="settings-row">
          <span>Field of view <b>{Math.round(settings.fov)}°</b></span>
          <input type="range" min={60} max={110} step={1} value={settings.fov} onChange={(event) => onChange({ ...settings, fov: Number(event.target.value) })} />
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={settings.colorblindPalette} onChange={(event) => onChange({ ...settings, colorblindPalette: event.target.checked })} />
          Colorblind-safe team colors (vermillion vs sky blue)
        </label>
      </section>
      <section>
        <h3 className="eyebrow">Audio</h3>
        <label className="settings-row">
          <span>Master volume <b>{Math.round(settings.master * 100)}%</b></span>
          <input type="range" min={0} max={1} step={0.01} value={settings.master} onChange={(event) => onChange({ ...settings, master: Number(event.target.value) })} />
        </label>
        <label className="settings-row">
          <span>Sound effects <b>{Math.round(settings.sfx * 100)}%</b></span>
          <input type="range" min={0} max={1} step={0.01} value={settings.sfx} onChange={(event) => onChange({ ...settings, sfx: Number(event.target.value) })} />
        </label>
        <label className="settings-row">
          <span>Music <b>{Math.round(settings.music * 100)}%</b></span>
          <input type="range" min={0} max={1} step={0.01} value={settings.music} onChange={(event) => onChange({ ...settings, music: Number(event.target.value) })} />
        </label>
        <small className="settings-hint">The music bus carries the war ambience — Mehter war drums and the Priest's bells during an active round, plus the victory fanfare.</small>
      </section>
      <section>
        <h3 className="eyebrow">Display</h3>
        <label className="settings-check">
          <input type="checkbox" checked={settings.nameplateMedals} onChange={(event) => onChange({ ...settings, nameplateMedals: event.target.checked })} />
          Show my highest medal on the nameplate
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={chatVisible} onChange={(event) => onToggleChat(event.target.checked)} />
          Show chat (H toggles in game)
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={latencyEnabled} onChange={(event) => onToggleLatency(event.target.checked)} />
          Simulate +100 ms RTT (diagnostics)
        </label>
      </section>
    </>
  );
}
