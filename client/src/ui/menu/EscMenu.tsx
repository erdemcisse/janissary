import type { FormEvent } from "react";
import { CLASS_TUNING, SquadOp, type PlayerClass, type Team } from "@janissary/shared";
import type { ClanDisplay, DebugStats } from "../../game/GameClient";
import type { StoredSettings } from "../settings";
import { ProfileTab } from "./ProfileTab";
import { SettingsTab } from "./SettingsTab";
import { KeybindsTab } from "./KeybindsTab";
import { SocialTab } from "./SocialTab";
import { CosmeticsTab } from "./CosmeticsTab";
import { ClanTab, type ClanInviteRow, type ClanView, type LeaderboardEntry } from "./ClanTab";
import { ClassPicker } from "../ClassPicker";

export type MenuTab = "class" | "profile" | "clan" | "social" | "settings" | "keybinds" | "cosmetics";

const TAB_LABELS: Readonly<Record<MenuTab, string>> = {
  class: "Class",
  profile: "Profile",
  clan: "Clan",
  social: "Social",
  settings: "Settings",
  keybinds: "Keybinds",
  cosmetics: "Cosmetics",
};

export function EscMenu({ tab, onSelectTab, onClose, onSelectClass, stats, settings, onSettings, chatVisible, onToggleChat, latencyEnabled, onToggleLatency, onSwitchTeam, onSaveProgress, clan, onSquadCommand, onJoinWar, selfEntityId }: {
  tab: MenuTab;
  onSelectTab: (tab: MenuTab) => void;
  /** Resume button — closes the menu (ESC also toggles, handled in App). */
  onClose: () => void;
  /** 8e-13: queue a class for the next spawn from the Class tab. */
  onSelectClass: (playerClass: PlayerClass) => void;
  stats: DebugStats;
  settings: StoredSettings;
  onSettings: (settings: StoredSettings) => void;
  chatVisible: boolean;
  onToggleChat: (visible: boolean) => void;
  latencyEnabled: boolean;
  onToggleLatency: (enabled: boolean) => void;
  onSwitchTeam: () => void;
  onSaveProgress: () => void;
  onSquadCommand: (op: SquadOp, targetPlayerId: number) => void;
  onJoinWar: (team: Team) => void;
  selfEntityId: number;
  clan: {
    view: ClanView | undefined;
    invites: readonly ClanInviteRow[];
    status: string;
    createName: string;
    createTag: string;
    joinTag: string;
    inviteName: string;
    search: string;
    searchResults: readonly { clanId: number; name: string; tag: string; memberCount: number }[];
    window: "daily" | "weekly" | "alltime";
    leaderboard: readonly LeaderboardEntry[];
    onSetCreateName: (value: string) => void;
    onSetCreateTag: (value: string) => void;
    onSetJoinTag: (value: string) => void;
    onSetInviteName: (value: string) => void;
    onSetSearch: (value: string) => void;
    onCreate: (event: FormEvent) => void;
    onJoin: (event: FormEvent) => void;
    onInvite: (event: FormEvent) => void;
    onAcceptInvite: (clanId: number) => void;
    onLeave: () => void;
    onKick: (playerId: number) => void;
    onSearch: (event: FormEvent) => void;
    onSelectWindow: (window: "daily" | "weekly" | "alltime") => void;
  };
}): React.JSX.Element {
  const statsClan: ClanDisplay | undefined = stats.clan;
  return (
    <aside className="menu-panel">
      <div className="menu-head">
        <h2>War menu</h2>
        <nav className="menu-tabs" role="tablist" aria-label="War menu sections">
          {(Object.keys(TAB_LABELS) as readonly MenuTab[]).map((value) => (
            // Phase 8e-25 (D17): proper tab semantics — aria-selected drives
            // screen readers now that Tab is free for keyboard focus cycling.
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => onSelectTab(value)}>{TAB_LABELS[value]}</button>
          ))}
        </nav>
        <button type="button" className="menu-resume" onClick={onClose}>Resume <kbd>Esc</kbd></button>
      </div>
      <div className="tab-content">
        {tab === "class" && (
          <div className="menu-class-tab">
            <p className="menu-class-live">
              Now fighting as <b>{CLASS_TUNING[stats.playerClass].title}</b> — a new pick applies to your next life, never mid-fight.
            </p>
            <ClassPicker
              team={stats.team}
              queuedClass={stats.queuedClass}
              classStatus={stats.classStatus}
              inputEnabled
              onSelect={onSelectClass}
              hint="Queued for your next deploy."
            />
          </div>
        )}
        {tab === "profile" && <ProfileTab stats={stats} clan={statsClan} onSwitchTeam={onSwitchTeam} onSaveProgress={onSaveProgress} />}
        {tab === "clan" && (
          <ClanTab
            clan={clan.view}
            invites={clan.invites}
            status={clan.status}
            createName={clan.createName}
            createTag={clan.createTag}
            joinTag={clan.joinTag}
            inviteName={clan.inviteName}
            search={clan.search}
            searchResults={clan.searchResults}
            window={clan.window}
            leaderboard={clan.leaderboard}
            playerId={stats.playerId}
            claimed={stats.claimed}
            onSetCreateName={clan.onSetCreateName}
            onSetCreateTag={clan.onSetCreateTag}
            onSetJoinTag={clan.onSetJoinTag}
            onSetInviteName={clan.onSetInviteName}
            onSetSearch={clan.onSetSearch}
            onCreate={clan.onCreate}
            onJoin={clan.onJoin}
            onInvite={clan.onInvite}
            onAcceptInvite={clan.onAcceptInvite}
            onLeave={clan.onLeave}
            onKick={clan.onKick}
            onSearch={clan.onSearch}
            onSelectWindow={clan.onSelectWindow}
          />
        )}
        {tab === "social" && (
          <SocialTab stats={stats} onSquadCommand={onSquadCommand} onJoinWar={onJoinWar} selfEntityId={selfEntityId} />
        )}
        {tab === "settings" && <SettingsTab settings={settings} onChange={onSettings} chatVisible={chatVisible} onToggleChat={onToggleChat} latencyEnabled={latencyEnabled} onToggleLatency={onToggleLatency} />}
        {tab === "keybinds" && <KeybindsTab />}
        {tab === "cosmetics" && <CosmeticsTab claimed={stats.claimed} />}
      </div>
    </aside>
  );
}
