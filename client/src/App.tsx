import { Suspense, lazy, useEffect, useRef, useState, type FormEvent } from "react";
import { GameClient, type DebugStats } from "./game/GameClient";
import { playUiClick, playUiHover } from "./game/audio/uiSfx";
import {
  ChatChannel,
  MEDAL_CATEGORY_COUNT,
  MOVING_SPREAD_RADIANS,
  PlayerClass,
  RoundPhase,
  Team,
  rangedWeaponForClass,
  weaponDefAtSlot,
} from "@janissary/shared";
import { defaultServerUrl, httpServerUrl } from "./net/serverUrl";
import { loadSettings, type StoredSettings } from "./ui/settings";
import { DamageIndicator, FloatyLayer, HudPips, InteractHint, OwnKillNotification, Reticle, SignedInPill, Vitals, WarScore, XpHud } from "./ui/Hud";
import { Fanfare, MedalCeremony, ToastLayer, type UiToast } from "./ui/ToastLayer";
import { Minimap } from "./ui/Minimap";
import { KillFeed } from "./ui/KillFeed";
import { LoadoutHud } from "./ui/LoadoutHud";
// Phase 8e-25 (A-004): the F8 playtest panel and the Esc menu (with its
// clan/social/cosmetics tabs) are rarely opened, so they load as async chunks
// instead of inflating the eager entry — the battle HUD above stays eager.
const PlaytestPanel = lazy(() => import("./ui/PlaytestPanel").then((module) => ({ default: module.PlaytestPanel })));
const EscMenu = lazy(() => import("./ui/menu/EscMenu").then((module) => ({ default: module.EscMenu })));
import { Scoreboard } from "./ui/Scoreboard";
import { DeathScreen } from "./ui/DeathScreen";
import { deathPhase, deathScreenVisible } from "./ui/deathFlow";
import { WarCeremony } from "./ui/Ceremony";
import type { MenuTab } from "./ui/menu/EscMenu";
import type { ClanInviteRow, ClanView, LeaderboardEntry } from "./ui/menu/ClanTab";

class ApiFailure extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function friendlyAuthMessage(status: number, raw: string): string {
  if (status === 410) return "You're already signed in — no action needed";
  if (status === 429) return "Too many link requests — try again in an hour";
  if (status === 401) return "Magic link is invalid or expired — request a new one";
  return raw;
}

const initialStats: DebugStats = {
  pingMs: 0,
  tick: 0,
  corrections: 0,
  frameP95Ms: 0,
  reconciliationErrorP95Cm: 0,
  reconciliationErrorMaxCm: 0,
  squadEntityIds: new Set<number>(),
  bytesInPerSecond: 0,
  bytesOutPerSecond: 0,
  entityCount: 0,
  visibleEntityCount: 0,
  drawCalls: 0,
  interestSetSize: 0,
  snapshotAgeMs: 0,
  fps: 0,
  health: 100, ammo: 1, reloadTicks: 0, respawnTicks: 0, team: Team.None,
  captureOwner: Team.None, captureProgress: 0, ottomanTickets: 300, byzantineTickets: 300,
  roundPhase: RoundPhase.Active, phaseRemainingTicks: 0, kills: 0, deaths: 0, assists: 0,
  playerId: 0,
  entityId: 0,
  scoreboard: [], killFeed: [], hitMarker: false, headshotMarker: false, killMarker: false, reticleSpreadRadians: MOVING_SPREAD_RADIANS, damageDirection: 0,
  reloadFraction: 1, loaded: true, readyFlash: false,
  weaponSlot: 2, switchTarget: 0, switching: false, meleeCooldownFraction: 1,
  careers: [], contracts: [], medals: [],
  medalState: { wars: 0, counters: Array.from({ length: MEDAL_CATEGORY_COUNT }, (_, index) => ({ category: index + 1, value: 0, tier: 0 })) },
  clan: undefined,
  nameplateMedals: false,
  lifetime: { wars: 0, wins: 0, kills: 0, deaths: 0, captures: 0, medals: 0 },
  warTally: { ottoman: 0, byzantine: 0 },
  fxEvents: [],
  warSummary: undefined,
  playerClass: PlayerClass.None, queuedClass: PlayerClass.None, mounted: false, horseHp: 0, torchOn: false, points: [], pointOccupancy: [], walls: [], classStatus: "", buffed: false, flags: 0,
  wallHp: [], cannons: [], hotspot: null, interactHint: "",
  claimed: false, chatMessages: [], chatNotice: "",
  blips: [], selfX: 0, selfZ: 0, selfYaw: 0, lastDeath: undefined,
};

function formatRate(bytes: number): string {
  return `${(bytes / 1_024).toFixed(1)} KB/s`;
}

/** Reticle kind follows the equipped slot (mounted cavalry always melee). */
function reticleSlotKind(stats: DebugStats): "melee" | "ranged" {
  if (stats.mounted) return "melee";
  return weaponDefAtSlot(stats.playerClass, stats.weaponSlot).kind === "melee" ? "melee" : "ranged";
}

function claimedEmail(): string {
  const stored = localStorage.getItem("janissary-email");
  return stored !== null && stored !== "" ? stored : "your account";
}

export function App(): React.JSX.Element {
  const gameContainer = useRef<HTMLDivElement>(null);
  const game = useRef<GameClient | undefined>(undefined);
  const [name, setName] = useState(() => localStorage.getItem("janissary-name") ?? "Player");
  const [session, setSession] = useState<{ name: string; url: string; nonce?: number }>();
  const [preferredTeam, setPreferredTeam] = useState<Team>(Team.None);
  const [preferredClass, setPreferredClass] = useState<PlayerClass>(PlayerClass.Janissary);
  const [scoreboardVisible, setScoreboardVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [playtestVisible, setPlaytestVisible] = useState(false);
  const [menuTab, setMenuTab] = useState<MenuTab>("class");
  const [mapVisible, setMapVisible] = useState(true);
  const [stats, setStats] = useState(initialStats);
  const [debugVisible, setDebugVisible] = useState(false);
  const [latencyEnabled, setLatencyEnabled] = useState(false);
  const [error, setError] = useState("");
  const [warTally, setWarTally] = useState<{ ottoman: number; byzantine: number }>({ ottoman: 0, byzantine: 0 });
  const [chatVisible, setChatVisible] = useState(() => localStorage.getItem("janissary-chat-visible") !== "false");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatChannel, setChatChannel] = useState<ChatChannel>(ChatChannel.Team);
  const [chatText, setChatText] = useState("");
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradePending, setUpgradePending] = useState(false);
  const [restoreEmail, setRestoreEmail] = useState("");
  const [restorePending, setRestorePending] = useState(false);
  const [uiToasts, setUiToasts] = useState<UiToast[]>([]);
  const [pointerLocked, setPointerLocked] = useState(() => document.pointerLockElement !== null);
  const uiToastSequence = useRef(0);
  const pushUiToast = (text: string, sub = "", tone: UiToast["tone"] = "info"): number => {
    const id = uiToastSequence.current++;
    setUiToasts((current) => [...current.slice(-3), { id, text, sub, tone, at: performance.now() }]);
    return id;
  };
  const replaceUiToast = (id: number, text: string, sub = "", tone: UiToast["tone"] = "info"): void => {
    setUiToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, text, sub, tone, at: performance.now() } : toast)));
  };
  const [settings, setSettings] = useState<StoredSettings>(loadSettings);
  const [clanView, setClanView] = useState<ClanView | undefined>();
  const [clanInvites, setClanInvites] = useState<readonly ClanInviteRow[]>([]);
  const [clanStatus, setClanStatus] = useState("");
  const [clanCreateName, setClanCreateName] = useState("");
  const [clanCreateTag, setClanCreateTag] = useState("");
  const [clanJoinTag, setClanJoinTag] = useState("");
  const [clanInviteName, setClanInviteName] = useState("");
  const [clanSearch, setClanSearch] = useState("");
  const [clanSearchResults, setClanSearchResults] = useState<readonly { clanId: number; name: string; tag: string; memberCount: number }[]>([]);
  const [clanWindow, setClanWindow] = useState<"daily" | "weekly" | "alltime">("daily");
  const [clanLeaderboard, setClanLeaderboard] = useState<readonly LeaderboardEntry[]>([]);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = fragment.get("access_token");
    if (accessToken === null) return;
    const state = new URLSearchParams(window.location.search).get("upgrade_state") ?? undefined;
    const inFlight = pushUiToast("Sending link…", "", "info");
    void fetch(`${httpServerUrl()}/auth/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken, state }) })
      .then(async (response) => {
        const value = await response.json() as { token?: string; error?: string };
        if (!response.ok || value.token === undefined) throw new ApiFailure(response.status, value.error ?? "Could not restore saved progress");
        localStorage.setItem("janissary-token", value.token);
        replaceUiToast(inFlight, "Progress saved", "Enter the field to restore your soldier.", "success");
      })
      .catch((reason: unknown) => {
        const message = reason instanceof ApiFailure ? friendlyAuthMessage(reason.status, reason.message) : "Could not restore saved progress";
        replaceUiToast(inFlight, message, "", "error");
      })
      .finally(() => window.history.replaceState({}, "", `${window.location.pathname}`));
  }, []);

  useEffect(() => {
    const expiry = window.setInterval(() => {
      const now = performance.now();
      setUiToasts((current) => current.filter((toast) => now - toast.at < 9_000));
    }, 1_000);
    return () => window.clearInterval(expiry);
  }, []);

  useEffect(() => {
    const onUiPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Element && target.closest("button") !== null) playUiClick();
    };
    const onUiPointerOver = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (button === null) return;
      // pointerover bubbles through every icon/span inside a button. Only
      // cue when entering the button itself, otherwise moving across a card's
      // children sounds like a rapid futuristic loop.
      const from = event.relatedTarget;
      if (from instanceof Node && button.contains(from)) return;
      playUiHover();
    };
    document.addEventListener("pointerdown", onUiPointerDown);
    document.addEventListener("pointerover", onUiPointerOver);
    return () => {
      document.removeEventListener("pointerdown", onUiPointerDown);
      document.removeEventListener("pointerover", onUiPointerOver);
    };
  }, []);

  // Phase 8e-25 (D11): the F8 handler reads the live panel visibility, so the
  // keydown effect re-binds when it changes (the lock release moved out of
  // the state updater for StrictMode safety).
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const toggleDebug = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "F3") {
        event.preventDefault();
        setDebugVisible((visible) => !visible);
      }
      if (event.code === "F8") {
        event.preventDefault();
        const next = !playtestVisible;
        setPlaytestVisible(next);
        if (next) game.current?.releaseLock();
      }
    };
    const toggleMenu = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "Escape") {
        event.preventDefault();
        setMenuVisible((visible) => !visible);
      }
    };
    const toggleMap = (event: KeyboardEvent): void => { if (isTypingTarget(event.target)) return; if (event.code === "KeyM") { event.preventDefault(); setMapVisible((visible) => !visible); } };
    window.addEventListener("keydown", toggleDebug);
    window.addEventListener("keydown", toggleMenu);
    window.addEventListener("keydown", toggleMap);
    return () => {
      window.removeEventListener("keydown", toggleDebug);
      window.removeEventListener("keydown", toggleMenu);
      window.removeEventListener("keydown", toggleMap);
    };
  }, [playtestVisible]);

  useEffect(() => {
    void fetch(`${httpServerUrl()}/war-history`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then((tally: { ottoman?: number; byzantine?: number } | undefined) => {
        if (tally !== undefined && tally.ottoman !== undefined && tally.byzantine !== undefined) {
          setWarTally({ ottoman: tally.ottoman, byzantine: tally.byzantine });
        }
      })
      .catch(() => {
        // The tally is decorative on the join screen; the server provides it again in-game.
      });
  }, []);

  useEffect(() => {
    if (session === undefined || gameContainer.current === null) return;
    const token = localStorage.getItem("janissary-token") ?? "";
    const instance = new GameClient(
      gameContainer.current,
      session.url,
      session.name,
      preferredTeam,
      preferredClass,
      token,
      setStats,
      (reason) => {
        setError(reason);
        setSession(undefined);
      },
    );
    instance.setArtificialLatency(latencyEnabled);
    instance.setSensitivity(0.002 * settings.sensitivityScale);
    instance.setVolumes({ master: settings.master, sfx: settings.sfx, music: settings.music });
    instance.setNameplateMedals(settings.nameplateMedals);
    instance.setFov(settings.fov);
    instance.setQuality(settings.quality);
    instance.setColorblindPalette(settings.colorblindPalette);
    game.current = instance;
    return () => {
      instance.dispose();
      game.current = undefined;
    };
  }, [session]);

  // 8e-13: death is read from health (not the respawn timer) — the timer is
  // now only the deploy floor, and the death screen replaces the countdown.
  const dead = deathScreenVisible(deathPhase(stats.health, stats.respawnTicks));
  const deadRef = useRef(false);
  deadRef.current = dead;

  useEffect(() => {
    const toggleScoreboard = (event: KeyboardEvent): void => {
      if (event.code !== "Tab") return;
      // Phase 8e-25 (D8/D15): Tab is only the scoreboard when the game owns
      // the keyboard — typing in an input, an open Esc menu (whose tab row
      // needs Tab to focus-cycle), or the death screen must not be covered.
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
      if (typing || menuVisible || chatOpen || deadRef.current) return;
      event.preventDefault();
      setScoreboardVisible(true);
    };
    const hideScoreboard = (event: KeyboardEvent): void => { if (event.code === "Tab") setScoreboardVisible(false); };
    window.addEventListener("keydown", toggleScoreboard); window.addEventListener("keyup", hideScoreboard);
    return () => { window.removeEventListener("keydown", toggleScoreboard); window.removeEventListener("keyup", hideScoreboard); };
  }, [menuVisible, chatOpen]);

  useEffect(() => game.current?.setArtificialLatency(latencyEnabled), [latencyEnabled]);
  useEffect(() => game.current?.setSensitivity(0.002 * settings.sensitivityScale), [settings.sensitivityScale]);
  useEffect(() => game.current?.setVolumes({ master: settings.master, sfx: settings.sfx, music: settings.music }), [settings.master, settings.sfx, settings.music]);
  useEffect(() => game.current?.setNameplateMedals(settings.nameplateMedals), [settings.nameplateMedals]);
  useEffect(() => game.current?.setFov(settings.fov), [settings.fov]);
  useEffect(() => game.current?.setQuality(settings.quality), [settings.quality]);
  useEffect(() => {
    game.current?.setColorblindPalette(settings.colorblindPalette);
    document.body.classList.toggle("palette-cb", settings.colorblindPalette);
  }, [settings.colorblindPalette]);
  useEffect(() => { localStorage.setItem("janissary-settings", JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem("janissary-chat-visible", String(chatVisible)); }, [chatVisible]);
  useEffect(() => game.current?.setTextInputActive(chatOpen || upgradeVisible || menuVisible), [chatOpen, upgradeVisible, menuVisible]);

  useEffect(() => {
    if (menuVisible) document.exitPointerLock();
    if (!menuVisible) return;
    if (menuTab === "clan") void refreshClanData();
  }, [menuVisible, menuTab]);

  useEffect(() => {
    const syncPointerLock = (): void => setPointerLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", syncPointerLock);
    document.addEventListener("pointerlockerror", syncPointerLock);
    return () => {
      document.removeEventListener("pointerlockchange", syncPointerLock);
      document.removeEventListener("pointerlockerror", syncPointerLock);
    };
  }, []);

  const blockingUiOpen = menuVisible || chatOpen || upgradeVisible || dead;
  useEffect(() => {
    if (dead) document.exitPointerLock();
  }, [dead]);
  useEffect(() => {
    // Dying with the menu or chat open closes both — the death screen is
    // what you see, and a hidden focused chat input must not swallow the
    // keyboard deploy (Phase 8e-25, D7). ESC may still reopen the menu over
    // the death screen.
    if (dead) {
      setMenuVisible(false);
      setChatOpen(false);
    }
  }, [dead]);
  const previousBlockingUiOpen = useRef(false);
  useEffect(() => {
    // Closing blocking UI asks for pointer lock again. Browsers that require a
    // fresh user gesture leave it unlocked and the field's click hint handles
    // that path; this is expected after choosing a respawn point.
    if (previousBlockingUiOpen.current && !blockingUiOpen) game.current?.requestLock();
    previousBlockingUiOpen.current = blockingUiOpen;
  }, [blockingUiOpen]);

  useEffect(() => {
    const openChat = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      // While dead, Enter deploys on the death screen (see DeathScreen.tsx); T/Y still open chat.
      if (event.code === "Enter" && deadRef.current) return;
      if (event.code === "Enter" || event.code === "KeyT" || event.code === "KeyY") {
        event.preventDefault();
        if (event.code === "KeyY") setChatChannel(ChatChannel.All);
        if (event.code === "KeyT") setChatChannel(ChatChannel.Team);
        setChatVisible(true); setChatOpen(true);
        document.exitPointerLock();
      } else if (event.code === "KeyH") {
        event.preventDefault(); setChatVisible((visible) => !visible);
      }
    };
    window.addEventListener("keydown", openChat);
    return () => window.removeEventListener("keydown", openChat);
  }, []);

  useEffect(() => {
    if (stats.claimed || localStorage.getItem("janissary-upgrade-dismissed") === "true") return;
    const promoted = stats.fxEvents.some((event) => event.kind === "fanfare");
    const won = stats.warSummary?.winner === stats.team;
    if (promoted || won) setUpgradeVisible(true);
  }, [stats.claimed, stats.fxEvents, stats.team, stats.warSummary]);

  const connect = (event: FormEvent): void => {
    event.preventDefault();
    const cleanName = name.trim().slice(0, 24) || "Player";
    localStorage.setItem("janissary-name", cleanName);
    setError("");
    setStats(initialStats);
    setSession({ name: cleanName, url: defaultServerUrl() });
  };

  const sendChat = (event: FormEvent): void => {
    event.preventDefault();
    const text = chatText.trim();
    if (text !== "" && stats.claimed) game.current?.sendChat(chatChannel, text);
    setChatText(""); setChatOpen(false);
  };

  const requestUpgrade = (event: FormEvent): void => {
    event.preventDefault();
    localStorage.setItem("janissary-email", upgradeEmail.trim().toLowerCase());
    setUpgradePending(true);
    const inFlight = pushUiToast("Sending link…", "Check your inbox shortly.", "info");
    void fetch(`${httpServerUrl()}/auth/request-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: upgradeEmail, token: localStorage.getItem("janissary-token") ?? "" }) })
      .then(async (response) => {
        const value = await response.json() as { message?: string; error?: string };
        if (!response.ok) throw new ApiFailure(response.status, value.error ?? "Could not send magic link");
        replaceUiToast(inFlight, value.message ?? "Check your email for the secure link.", "You can close this window and keep playing.", "success");
      })
      .catch((reason: unknown) => {
        const message = reason instanceof ApiFailure ? friendlyAuthMessage(reason.status, reason.message) : "Could not send magic link";
        replaceUiToast(inFlight, message, "", "error");
      })
      .finally(() => setUpgradePending(false));
  };

  const dismissUpgrade = (): void => { localStorage.setItem("janissary-upgrade-dismissed", "true"); setUpgradeVisible(false); };

  const requestRestore = (event: FormEvent): void => {
    event.preventDefault();
    localStorage.setItem("janissary-email", restoreEmail.trim().toLowerCase());
    setRestorePending(true);
    const inFlight = pushUiToast("Sending link…", "Check your inbox shortly.", "info");
    void fetch(`${httpServerUrl()}/auth/request-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: restoreEmail }) })
      .then(async (response) => {
        const value = await response.json() as { message?: string; error?: string };
        if (!response.ok) throw new ApiFailure(response.status, value.error ?? "Could not send sign-in link");
        replaceUiToast(inFlight, value.message ?? "Check your email for the secure link.", "", "success");
      })
      .catch((reason: unknown) => {
        const message = reason instanceof ApiFailure ? friendlyAuthMessage(reason.status, reason.message) : "Could not send sign-in link";
        replaceUiToast(inFlight, message, "", "error");
      })
      .finally(() => setRestorePending(false));
  };

  const clanToken = (): string => localStorage.getItem("janissary-token") ?? "";

  const clanApi = async (path: string, body?: unknown): Promise<unknown> => {
    const response = await fetch(`${httpServerUrl()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clanToken()}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = await response.json() as { error?: string };
    if (!response.ok) throw new Error(value.error ?? "Clan request failed");
    return value;
  };

  const refreshClanData = async (): Promise<void> => {
    setClanStatus("");
    try {
      const value = await clanApi("/clans/my") as { clan?: ClanView; invites?: readonly ClanInviteRow[] };
      setClanView(value.clan);
      setClanInvites(value.invites ?? []);
      if (value.clan !== undefined) void refreshClanLeaderboard(value.clan.clanId, clanWindow);
    } catch (reason: unknown) {
      setClanStatus(reason instanceof Error ? reason.message : "Could not load your clan");
    }
  };

  const refreshClanLeaderboard = async (clanId: number, window: "daily" | "weekly" | "alltime"): Promise<void> => {
    try {
      const value = await clanApi(`/leaderboard?scope=clan&clan=${clanId}&window=${window}&limit=20`) as { entries?: readonly LeaderboardEntry[] };
      setClanLeaderboard(value.entries ?? []);
    } catch {
      setClanLeaderboard([]);
    }
  };

  const runClanAction = async (action: () => Promise<void>): Promise<void> => {
    setClanStatus("");
    try {
      await action();
      await refreshClanData();
    } catch (reason: unknown) {
      setClanStatus(reason instanceof Error ? reason.message : "Clan action failed");
    }
  };

  const createClan = (event: FormEvent): void => {
    event.preventDefault();
    void runClanAction(async () => { await clanApi("/clans/create", { name: clanCreateName, tag: clanCreateTag }); setClanCreateName(""); setClanCreateTag(""); });
  };

  const joinClan = (event: FormEvent): void => {
    event.preventDefault();
    void runClanAction(async () => { await clanApi("/clans/join", { tag: clanJoinTag }); setClanJoinTag(""); });
  };

  const invitePlayer = (event: FormEvent): void => {
    event.preventDefault();
    void runClanAction(async () => { await clanApi("/clans/invite", { name: clanInviteName }); setClanInviteName(""); });
  };

  const acceptInvite = (clanId: number): void => {
    void runClanAction(async () => { await clanApi("/clans/accept-invite", { clanId }); });
  };

  const leaveClan = (): void => {
    void runClanAction(async () => { await clanApi("/clans/leave"); });
  };

  const kickMember = (playerId: number): void => {
    void runClanAction(async () => { await clanApi("/clans/kick", { playerId }); });
  };

  const searchClans = (event: FormEvent): void => {
    event.preventDefault();
    void clanApi(`/clans/search?q=${encodeURIComponent(clanSearch)}`)
      .then((value) => setClanSearchResults((value as { clans?: readonly { clanId: number; name: string; tag: string; memberCount: number }[] }).clans ?? []))
      .catch(() => setClanSearchResults([]));
  };

  const selectClanWindow = (window: "daily" | "weekly" | "alltime"): void => {
    setClanWindow(window);
    if (clanView !== undefined) void refreshClanLeaderboard(clanView.clanId, window);
  };

  const switchTeam = (): void => {
    const other = stats.team === Team.Byzantine ? Team.Ottoman : Team.Byzantine;
    setPreferredTeam(other);
    setMenuVisible(false);
    setStats(initialStats);
    setSession((current) => (current === undefined ? undefined : { ...current, nonce: Date.now() }));
  };

  // Phase 8c-7 join-their-war: re-queue the join with the friend's team as
  // the preference. The server honors it when the balance allows (sides
  // within two) and steps in otherwise — the Social tab says so plainly.
  const joinTheirWar = (team: Team): void => {
    setPreferredTeam(team);
    setMenuVisible(false);
    setStats(initialStats);
    setSession((current) => (current === undefined ? undefined : { ...current, nonce: Date.now() }));
  };

  const activeCareer = stats.careers[stats.team === Team.Byzantine ? 1 : 0] ?? stats.careers[0];
  const floaties = stats.fxEvents.filter((event) => event.kind === "floaty").slice(-6);
  const fxToasts = stats.fxEvents.filter((event) => event.kind === "toast").slice(-3);
  const fanfare = [...stats.fxEvents].reverse().find((event) => event.kind === "fanfare");
  const medalCeremony = [...stats.fxEvents].reverse().find((event) => event.kind === "ceremony");

  if (session === undefined) {
    return (
      <main className="connect-shell">
        <form className="connect-card" onSubmit={connect}>
          <p className="eyebrow">1453 · PROGRESSION</p>
          <h1>Enter the field</h1>
          <p className="lede">Guest progress persists on this browser. Move with WASD; click the field to capture the mouse. Press Tab for scores, Esc for the war menu.</p>
          <label>
            Display name
            <input value={name} maxLength={24} autoFocus onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Allegiance
            <select value={preferredTeam} onChange={(event) => setPreferredTeam(Number(event.target.value) as Team)}>
              <option value={Team.None}>Auto-balance</option>
              <option value={Team.Ottoman}>Ottoman Janissary · Arquebus</option>
              <option value={Team.Byzantine}>Byzantine Guardsman · Crossbow</option>
            </select>
          </label>
          <label>
            Class
            <select value={preferredClass} onChange={(event) => setPreferredClass(Number(event.target.value) as PlayerClass)}>
              <option value={PlayerClass.Janissary}>Janissary · Arquebus</option>
              <option value={PlayerClass.Sipahi}>Sipahi · Cavalry</option>
              <option value={PlayerClass.Topcu}>Topçu · Bombard crew</option>
              <option value={PlayerClass.Guardsman}>Guardsman · Crossbow</option>
              <option value={PlayerClass.Knight}>Knight · Cavalry</option>
              <option value={PlayerClass.WallGunner}>Wall Gunner · Wall gun crew</option>
              <option value={PlayerClass.Mehter}>Mehter · War drums</option>
              <option value={PlayerClass.Priest}>Priest · Standard-bearer</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">Play</button>
          <p className="war-tally">All-time wars — Ottoman {warTally.ottoman} · Byzantine {warTally.byzantine}</p>
        </form>
        <form className="restore-card" onSubmit={requestRestore}>
          <strong>Already saved?</strong>
          <input type="email" required maxLength={254} placeholder="you@example.com" value={restoreEmail} onChange={(event) => setRestoreEmail(event.target.value)} />
          <button type="submit" disabled={restorePending}>{restorePending ? "Sending link…" : "Email sign-in link"}</button>
        </form>
        <ToastLayer uiToasts={uiToasts} fxToasts={[]} />
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div className="game-container" ref={gameContainer} />
      <Reticle hit={stats.hitMarker} headshot={stats.headshotMarker} kill={stats.killMarker} reloadFraction={stats.reloadFraction} loaded={stats.loaded} ready={stats.readyFlash} slotKind={reticleSlotKind(stats)} meleeCooldownFraction={stats.meleeCooldownFraction} spreadRadians={stats.reticleSpreadRadians} />
      {stats.damageDirection !== 0 && <DamageIndicator direction={stats.damageDirection} />}
      {stats.claimed && <SignedInPill email={claimedEmail()} />}
      <p className="pointer-hint">WASD move · Space jump · click fire · R reload · F mount/man gun · Tab scores · M map · Esc menu · F3 diagnostics</p>
      {stats.interactHint !== "" && <InteractHint text={stats.interactHint} />}
      {!pointerLocked && !blockingUiOpen && <p className="pointer-unlocked-hint">Click to resume</p>}
      {chatVisible && (
        <aside className="chat-panel">
          <div className="chat-log">
            {stats.chatMessages.slice(-8).map((message) => (
              <p key={message.messageId} className={message.channel === ChatChannel.Team ? "team" : "all"}>
                <b>[{message.channel === ChatChannel.Team ? "TEAM" : "ALL"}] {message.name}</b> {message.text}
                <button type="button" title="Report message" onClick={() => game.current?.reportChat(message.messageId)}>!</button>
              </p>
            ))}
          </div>
          {chatOpen && (
            <form onSubmit={sendChat}>
              <select value={chatChannel} onChange={(event) => setChatChannel(Number(event.target.value) as ChatChannel)} disabled={!stats.claimed}>
                <option value={ChatChannel.Team}>Team</option><option value={ChatChannel.All}>All</option>
              </select>
              <input autoFocus maxLength={160} value={chatText} disabled={!stats.claimed} title={stats.claimed ? "" : "Save your progress to unlock chat"} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.code === "Escape") setChatOpen(false); }} />
              {!stats.claimed && <button type="button" onClick={() => setUpgradeVisible(true)}>Save progress to chat</button>}
            </form>
          )}
          {stats.chatNotice && <small>{stats.chatNotice}</small>}
        </aside>
      )}
      <WarScore stats={stats} />
      <Vitals health={stats.health} ammo={stats.ammo} reloadTicks={stats.reloadTicks} weaponName={rangedWeaponForClass(stats.playerClass, stats.team).name} />
      <LoadoutHud playerClass={stats.playerClass} queuedClass={stats.queuedClass} mounted={stats.mounted} torchOn={stats.torchOn} activeSlot={stats.weaponSlot} switching={stats.switching} switchTarget={stats.switchTarget} loaded={stats.loaded} />
      {activeCareer !== undefined && <XpHud career={activeCareer} />}
      <FloatyLayer events={floaties} />
      {/* 8e-13: the corner minimap + kill feed stand down while the death
          screen or the ESC menu owns the display — the death screen renders
          its own large live map, and fresh feed rows painted over the class
          cards during the first seconds after a death. */}
      {!dead && !menuVisible && (
        <div className="hud-right">
          {mapVisible && (
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
            />
          )}
          <KillFeed feed={stats.killFeed} />
        </div>
      )}
      <OwnKillNotification events={stats.fxEvents} />
      <HudPips pingMs={stats.pingMs} buffed={stats.buffed} />
      <ToastLayer uiToasts={uiToasts} fxToasts={fxToasts} />
      {fanfare !== undefined && <Fanfare event={fanfare} team={stats.team} />}
      {medalCeremony !== undefined && <MedalCeremony event={medalCeremony} team={stats.team} />}
      {dead && (
        <DeathScreen
          stats={stats}
          inputEnabled={!chatOpen && !menuVisible}
          onSelectSpawn={(pointIndex) => game.current?.selectSpawn(pointIndex)}
          onSelectClass={(playerClass) => game.current?.selectClass(playerClass)}
          onDeploy={() => game.current?.deploy()}
        />
      )}
      {stats.roundPhase === RoundPhase.Victory && (
        <div className="victory">
          {stats.warSummary === undefined
            ? <><span>WAR DECIDED</span><small>New round in {(stats.phaseRemainingTicks / 20).toFixed(1)} s</small></>
            : <WarCeremony summary={stats.warSummary} remainingTicks={stats.phaseRemainingTicks} />}
        </div>
      )}
      {scoreboardVisible && <Scoreboard rows={stats.scoreboard} selfId={stats.entityId} squadEntityIds={stats.squadEntityIds} />}
      {playtestVisible && <Suspense fallback={null}><PlaytestPanel onClose={() => setPlaytestVisible(false)} /></Suspense>}
      {menuVisible && (
        <Suspense fallback={null}>
        <EscMenu
          tab={menuTab}
          onSelectTab={setMenuTab}
          onClose={() => setMenuVisible(false)}
          onSelectClass={(playerClass) => game.current?.selectClass(playerClass)}
          stats={stats}
          settings={settings}
          onSettings={setSettings}
          chatVisible={chatVisible}
          onToggleChat={setChatVisible}
          latencyEnabled={latencyEnabled}
          onToggleLatency={setLatencyEnabled}
          onSwitchTeam={switchTeam}
          onSaveProgress={() => setUpgradeVisible(true)}
          onSquadCommand={(op, targetPlayerId) => game.current?.sendSquadCommand(op, targetPlayerId)}
          onJoinWar={(team) => joinTheirWar(team)}
          selfEntityId={stats.entityId}
          clan={{
            view: clanView,
            invites: clanInvites,
            status: clanStatus,
            createName: clanCreateName,
            createTag: clanCreateTag,
            joinTag: clanJoinTag,
            inviteName: clanInviteName,
            search: clanSearch,
            searchResults: clanSearchResults,
            window: clanWindow,
            leaderboard: clanLeaderboard,
            onSetCreateName: setClanCreateName,
            onSetCreateTag: setClanCreateTag,
            onSetJoinTag: setClanJoinTag,
            onSetInviteName: setClanInviteName,
            onSetSearch: setClanSearch,
            onCreate: createClan,
            onJoin: joinClan,
            onInvite: invitePlayer,
            onAcceptInvite: acceptInvite,
            onLeave: leaveClan,
            onKick: kickMember,
            onSearch: searchClans,
            onSelectWindow: selectClanWindow,
          }}
        />
        </Suspense>
      )}
      {upgradeVisible && !stats.claimed && (
        <div className="upgrade-backdrop">
          <form className="upgrade-card" onSubmit={requestUpgrade}>
            <p className="eyebrow">OPTIONAL ACCOUNT</p><h2>Save your progress</h2>
            <p>Email yourself a one-time magic link. Your current XP, ranks, medals, and clan stay exactly where they are.</p>
            <input type="email" required autoFocus maxLength={254} placeholder="you@example.com" value={upgradeEmail} onChange={(event) => setUpgradeEmail(event.target.value)} />
            <button type="submit" disabled={upgradePending}>{upgradePending ? "Sending link…" : "Send magic link"}</button><button type="button" className="secondary" onClick={dismissUpgrade}>Not now</button>
          </form>
        </div>
      )}
      {debugVisible && (
        <aside className="debug-overlay">
          <strong>NETWORK / SIM</strong>
          <dl>
            <dt>Ping</dt><dd>{stats.pingMs} ms</dd>
            <dt>Server tick</dt><dd>{stats.tick}</dd>
            <dt>Corrections</dt><dd>{stats.corrections}</dd>
            <dt>Correction p95 / max</dt><dd>{stats.reconciliationErrorP95Cm.toFixed(1)} / {stats.reconciliationErrorMaxCm.toFixed(1)} cm</dd>
            <dt>Inbound</dt><dd>{formatRate(stats.bytesInPerSecond)}</dd>
            <dt>Outbound</dt><dd>{formatRate(stats.bytesOutPerSecond)}</dd>
            <dt>Entities</dt><dd>{stats.entityCount}</dd>
            <dt>Visible</dt><dd>{stats.visibleEntityCount}</dd>
            <dt>Interest set</dt><dd>{stats.interestSetSize} / 150</dd>
            <dt>Draw calls</dt><dd>{stats.drawCalls}</dd>
            <dt>Snapshot age</dt><dd>{stats.snapshotAgeMs} ms</dd>
            <dt>Frame rate</dt><dd>{stats.fps} fps</dd>
            <dt>Frame p95</dt><dd>{stats.frameP95Ms.toFixed(1)} ms</dd>
          </dl>
          <label className="latency-toggle">
            <input
              type="checkbox"
              checked={latencyEnabled}
              onChange={(event) => setLatencyEnabled(event.target.checked)}
            />
            Simulate +100 ms RTT
          </label>
        </aside>
      )}
    </main>
  );
}
