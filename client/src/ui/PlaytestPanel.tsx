import { useCallback, useEffect, useState } from "react";
import { type BotBehaviorMode } from "@janissary/shared";
import { httpServerUrl } from "../net/serverUrl";
import type { AudioDebugSnapshot } from "../game/audio/audioEngine";

/**
 * Phase 8e-19 Task 1: dev-only playtest-control panel (F8). The owner tunes a
 * quiet battlefield instead of live-battle chaos: bot count, bot behavior
 * mode, and a combat freeze. Non-blocking — the game keeps running while the
 * panel is open so changes are visible immediately.
 *
 * The server refuses every /dev/bots* call with 404 unless it runs in a dev
 * build (or DEV_BOT_ADMIN=1); the panel then shows the unavailable note.
 */

interface PlaytestState {
  readonly enabled: boolean;
  readonly target: number;
  readonly count: number;
  readonly mode: BotBehaviorMode;
  readonly freeze: boolean;
  readonly tick?: number;
}

type ConnectionState = "connecting" | "connected" | "unavailable" | "offline";

const MODE_LABELS: readonly { mode: BotBehaviorMode; label: string; hint: string }[] = [
  { mode: "battle", label: "Battle (normal)", hint: "bots fight as usual" },
  { mode: "walking", label: "Walking (patrol, no shooting)", hint: "steady foot traffic" },
  { mode: "standing", label: "Standing (stand still)", hint: "a quiet field for feel work" },
];

async function fetchPlaytest(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_000);
  try {
    return await fetch(httpServerUrl() + path, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function responseError(path: string, response: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") detail = ": " + body.error;
  } catch {
    // Keep the HTTP status when a proxy returns an empty or non-JSON body.
  }
  return new Error(path + " → " + response.status + detail);
}

function fetchError(reason: unknown): Error {
  const server = httpServerUrl();
  if (reason instanceof DOMException && reason.name === "AbortError") return new Error(`Playtest server timed out at ${server}.`);
  if (reason instanceof TypeError) return new Error(`Cannot reach ${server}. Start the root pnpm dev command and keep port 9001 available.`);
  return reason instanceof Error ? reason : new Error(String(reason));
}

export function PlaytestPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [state, setState] = useState<PlaytestState | null>(null);
  const [audio, setAudio] = useState<AudioDebugSnapshot | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetchPlaytest("/dev/bots/state");
      if (response.status === 404) {
        setState({ enabled: false, target: 0, count: 0, mode: "battle", freeze: false });
        setConnection("unavailable");
        setError("");
        return;
      }
      if (!response.ok) throw await responseError("state", response);
      const value = (await response.json()) as PlaytestState;
      setState(value);
      setConnection("connected");
      setError("");
    } catch (reason) {
      setConnection("offline");
      setError(fetchError(reason).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const refreshAudio = (): void => setAudio(window.__audioDebug?.() ?? null);
    refreshAudio();
    const timer = window.setInterval(refreshAudio, 500);
    return () => window.clearInterval(timer);
  }, []);

  const post = async (path: string, body: unknown, label: string): Promise<void> => {
    setBusy(label);
    try {
      const response = await fetchPlaytest(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw await responseError(path, response);
      await refresh();
    } catch (reason) {
      setConnection("offline");
      setError(fetchError(reason).message);
    } finally {
      setBusy("");
    }
  };

  return (
    <aside className="playtest-panel" aria-label="Playtest controls">
      <header className="playtest-head">
        <strong>Playtest controls</strong>
        <button type="button" className="playtest-close" title="Close (F8)" onClick={onClose}>×</button>
      </header>
      <div className="playtest-status">
        <span className={`playtest-status-dot ${connection}`} />
        <b>{connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting" : connection === "unavailable" ? "Disabled" : "Disconnected"}</b>
        <code>{httpServerUrl()}</code>
        <button type="button" onClick={() => void refresh()} disabled={busy !== ""}>Retry</button>
      </div>
      {state === null && error === "" && <p className="playtest-note">Connecting…</p>}
      {state !== null && !state.enabled && (
        <p className="playtest-note">Dev tools are off in this build (server returned 404).</p>
      )}
      {state !== null && state.enabled && (
        <div className="playtest-body">
          <label className="playtest-row">
            <span>Bots on field: <b>{state.target}</b> (now {state.count})</span>
            <input
              type="range"
              min={0}
              max={150}
              step={5}
              value={state.target}
              onChange={(event) => {
                const target = Number(event.target.value);
                setState({ ...state, target });
                void post("/dev/bots", { count: target }, "bot count");
              }}
            />
          </label>
          <fieldset className="playtest-row">
            <legend>Bot behavior</legend>
            {MODE_LABELS.map((entry) => (
              <label key={entry.mode} className="playtest-radio">
                <input
                  type="radio"
                  name="bot-mode"
                  checked={state.mode === entry.mode}
                  onChange={() => {
                    setState({ ...state, mode: entry.mode });
                    void post("/dev/bots/mode", { mode: entry.mode }, "bot mode");
                  }}
                />
                <span>{entry.label}<small>{entry.hint}</small></span>
              </label>
            ))}
          </fieldset>
          <label className="playtest-row playtest-check">
            <input
              type="checkbox"
              checked={state.freeze}
              onChange={(event) => {
                const frozen = event.target.checked;
                setState({ ...state, freeze: frozen });
                void post("/dev/bots/freeze", { frozen }, "combat freeze");
              }}
            />
            <span>Freeze combat — nobody shoots</span>
          </label>
          <button
            type="button"
            className="playtest-reset"
            disabled={busy !== ""}
            onClick={() => {
              if (window.confirm("Reset the current battle? Players, walls, artillery, ships, and objectives will return to their starting state.")) {
                void post("/dev/bots/reset", { confirm: true }, "battle reset");
              }
            }}
          >Reset battle</button>
          {busy !== "" && <small className="playtest-busy">Applying {busy}…</small>}
        </div>
      )}
      {audio !== null && (
        <section className="playtest-audio" aria-label="Audio diagnostics">
          <strong>Audio {audio.contextState}</strong>
          <span>{audio.oneShotTotal} one-shots · {audio.voiceGroups["remote-shot"] ?? 0} remote shots · {audio.voiceGroups.artillery ?? 0} artillery</span>
          <span>{audio.positionalLoops.length} positional loops · {audio.ambientLoops.length} ambient · {audio.pendingLoads} loading</span>
          {audio.longRunners.length > 0 && <b className="playtest-error">Long runners: {audio.longRunners.length}</b>}
        </section>
      )}
      {error !== "" && <p className="playtest-note playtest-error">{error}</p>}
    </aside>
  );
}
