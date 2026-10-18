import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  StoredAccount,
  StoredCareer,
  StoredClan,
  StoredClanInvite,
  StoredContract,
  StoredLifetime,
  StoredMedal,
  StoredMedalCounter,
  StoredSkinEquip,
  Storage,
  XpLedgerRow,
  AuthLink,
  PendingAuthUpgrade,
  StoredChatReport,
  StoredFriendRequest,
  LeaderboardRow,
} from "./storage";

function resolveDatabasePath(configured: string): string {
  if (configured === ":memory:") return configured;
  const path = resolve(configured);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

interface AccountRow {
  player_id: number;
  token_hash: string;
  name: string;
  auth_id: string | null;
}

interface CareerRow {
  player_id: number;
  faction: number;
  xp: number;
  prestige: number;
  headshots: number;
}

interface LifetimeRow {
  player_id: number;
  wars: number;
  wins: number;
  kills: number;
  deaths: number;
  captures: number;
  medals: number;
  shots: number;
  hits: number;
}

interface ContractRow {
  player_id: number;
  day: number;
  slot: number;
  kind: number;
  progress: number;
  target: number;
  reward: number;
  completed: number;
}

interface MedalRow {
  player_id: number;
  kind: number;
  count: number;
}

interface MedalCounterRow {
  player_id: number;
  category: number;
  value: number;
}

interface SkinUnlockRow {
  player_id: number;
  skin_id: string;
}

interface SkinEquipRow {
  player_id: number;
  class: number;
  skin_id: string;
}

interface ClanRow {
  clan_id: number;
  name: string;
  tag: string;
  founder_player_id: number;
  created_at: number;
}

interface ClanInviteRow {
  clan_id: number;
  invited_by: number;
  created_at: number;
}

interface LedgerRow {
  player_id: number;
  name: string;
  faction: number;
  amount: number;
  earned_at: number;
}

interface TallyRow {
  faction: number;
  wins: number;
}

export class SqliteStorage implements Storage {
  readonly #database: Database.Database;
  readonly #upsertAccount: Database.Statement;
  readonly #upsertCareer: Database.Statement;
  readonly #upsertLifetime: Database.Statement;
  readonly #upsertContract: Database.Statement;
  readonly #upsertMedal: Database.Statement;
  readonly #upsertMedalCounter: Database.Statement;
  readonly #insertLedger: Database.Statement;
  readonly #upsertTally: Database.Statement;

  /**
   * Pre-schema migration for databases created before the chat-report dedup
   * rename (Phase 8c-7): those have `chat_reports.id` and `message_id`; the
   * current schema uses `report_id`. CREATE TABLE IF NOT EXISTS cannot fix an
   * existing table, so the old `id` column is renamed in place before the
   * dedup statements (which reference report_id/message_id) run.
   */
  #migrateChatReports(): void {
    try {
      const columns = this.#database.prepare("PRAGMA table_info(chat_reports)").all() as { name: string }[];
      if (columns.some((column) => column.name === "report_id")) return;
      if (!columns.some((column) => column.name === "id")) return;
      this.#database.exec("ALTER TABLE chat_reports RENAME COLUMN id TO report_id");
    } catch {
      // The table may not exist yet (fresh database) — the CREATE below wins.
    }
  }

  constructor(configuredPath: string) {
    this.#database = new Database(resolveDatabasePath(configuredPath));
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("synchronous = NORMAL");
    this.#migrateChatReports();
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        player_id INTEGER PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        auth_id TEXT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS careers (
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        faction INTEGER NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        prestige INTEGER NOT NULL DEFAULT 0,
        headshots INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (player_id, faction)
      );
      CREATE TABLE IF NOT EXISTS lifetime_stats (
        player_id INTEGER NOT NULL PRIMARY KEY REFERENCES accounts(player_id),
        wars INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        captures INTEGER NOT NULL DEFAULT 0,
        medals INTEGER NOT NULL DEFAULT 0,
        shots INTEGER NOT NULL DEFAULT 0,
        hits INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS contracts (
        player_id INTEGER NOT NULL,
        day INTEGER NOT NULL,
        slot INTEGER NOT NULL,
        kind INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        target INTEGER NOT NULL,
        reward INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (player_id, day, slot)
      );
      CREATE TABLE IF NOT EXISTS medals (
        player_id INTEGER NOT NULL,
        kind INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (player_id, kind)
      );
      CREATE TABLE IF NOT EXISTS medal_counters (
        player_id INTEGER NOT NULL,
        category INTEGER NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (player_id, category)
      );
      CREATE TABLE IF NOT EXISTS clans (
        clan_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
        founder_player_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS clan_members (
        clan_id INTEGER NOT NULL REFERENCES clans(clan_id),
        player_id INTEGER NOT NULL PRIMARY KEY REFERENCES accounts(player_id),
        joined_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id, joined_at);
      CREATE TABLE IF NOT EXISTS clan_invites (
        clan_id INTEGER NOT NULL REFERENCES clans(clan_id),
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        invited_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (clan_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS war_tally (
        faction INTEGER PRIMARY KEY,
        wins INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS xp_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        faction INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        earned_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_xp_ledger_earned ON xp_ledger(earned_at);
      CREATE INDEX IF NOT EXISTS idx_xp_ledger_player_earned ON xp_ledger(player_id, earned_at);
      CREATE TABLE IF NOT EXISTS auth_links (
        auth_id TEXT PRIMARY KEY,
        player_id INTEGER NOT NULL UNIQUE REFERENCES accounts(player_id),
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_upgrade_requests (
        state_hash TEXT PRIMARY KEY,
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        email TEXT NOT NULL COLLATE NOCASE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS auth_rate_limits (
        key_hash TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_started ON auth_rate_limits(started_at);
      CREATE TABLE IF NOT EXISTS player_mutes (player_id INTEGER PRIMARY KEY, muted INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_reports (
        report_id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_player_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        sender_player_id INTEGER NOT NULL,
        channel INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_blocks (
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        blocked_player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, blocked_player_id)
      );
      CREATE TABLE IF NOT EXISTS friend_requests (
        from_id INTEGER NOT NULL REFERENCES accounts(player_id),
        to_id INTEGER NOT NULL REFERENCES accounts(player_id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (from_id, to_id)
      );
      CREATE TABLE IF NOT EXISTS friends (
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        friend_id INTEGER NOT NULL REFERENCES accounts(player_id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (player_id, friend_id)
      );
      DELETE FROM chat_reports
      WHERE report_id NOT IN (SELECT MIN(report_id) FROM chat_reports GROUP BY reporter_player_id, message_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_reports_reporter_message ON chat_reports(reporter_player_id, message_id);
      CREATE TABLE IF NOT EXISTS skin_unlocks (
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        skin_id TEXT NOT NULL,
        PRIMARY KEY (player_id, skin_id)
      );
      CREATE TABLE IF NOT EXISTS skin_equips (
        player_id INTEGER NOT NULL REFERENCES accounts(player_id),
        class INTEGER NOT NULL,
        skin_id TEXT NOT NULL,
        PRIMARY KEY (player_id, class)
      );
    `);
    const careerColumns = this.#database.prepare("PRAGMA table_info(careers)").all() as { name: string }[];
    if (!careerColumns.some((column) => column.name === "headshots")) {
      this.#database.exec("ALTER TABLE careers ADD COLUMN headshots INTEGER NOT NULL DEFAULT 0");
    }
    this.#upsertAccount = this.#database.prepare(`
      INSERT INTO accounts (player_id, token_hash, auth_id, name, created_at)
      VALUES (@playerId, @tokenHash, @authId, @name, @createdAt)
      ON CONFLICT(player_id) DO UPDATE SET token_hash = excluded.token_hash, auth_id = excluded.auth_id, name = excluded.name
    `);
    this.#upsertCareer = this.#database.prepare(`
      INSERT INTO careers (player_id, faction, xp, prestige, headshots)
      VALUES (@playerId, @faction, @xp, @prestige, @headshots)
      ON CONFLICT(player_id, faction) DO UPDATE SET xp = excluded.xp, prestige = excluded.prestige, headshots = excluded.headshots
    `);
    this.#upsertLifetime = this.#database.prepare(`
      INSERT INTO lifetime_stats (player_id, wars, wins, kills, deaths, captures, medals, shots, hits)
      VALUES (@playerId, @wars, @wins, @kills, @deaths, @captures, @medals, @shots, @hits)
      ON CONFLICT(player_id) DO UPDATE SET
        wars = excluded.wars, wins = excluded.wins, kills = excluded.kills,
        deaths = excluded.deaths, captures = excluded.captures,
        medals = excluded.medals, shots = excluded.shots, hits = excluded.hits
    `);
    this.#upsertContract = this.#database.prepare(`
      INSERT INTO contracts (player_id, day, slot, kind, progress, target, reward, completed)
      VALUES (@playerId, @day, @slot, @kind, @progress, @target, @reward, @completed)
      ON CONFLICT(player_id, day, slot) DO UPDATE SET
        kind = excluded.kind, progress = excluded.progress,
        target = excluded.target, reward = excluded.reward, completed = excluded.completed
    `);
    this.#upsertMedal = this.#database.prepare(`
      INSERT INTO medals (player_id, kind, count)
      VALUES (@playerId, @kind, @count)
      ON CONFLICT(player_id, kind) DO UPDATE SET count = excluded.count
    `);
    this.#upsertMedalCounter = this.#database.prepare(`
      INSERT INTO medal_counters (player_id, category, value)
      VALUES (@playerId, @category, @value)
      ON CONFLICT(player_id, category) DO UPDATE SET value = excluded.value
    `);
    this.#insertLedger = this.#database.prepare(
      "INSERT INTO xp_ledger (player_id, name, faction, amount, earned_at) VALUES (@playerId, @name, @faction, @amount, @earnedAt)",
    );
    this.#upsertTally = this.#database.prepare(`
      INSERT INTO war_tally (faction, wins) VALUES (@faction, @wins)
      ON CONFLICT(faction) DO UPDATE SET wins = excluded.wins
    `);
  }

  loadAccounts(): readonly StoredAccount[] {
    const accounts = this.#database.prepare("SELECT player_id, token_hash, auth_id, name FROM accounts").all() as AccountRow[];
    const careers = this.#database.prepare("SELECT player_id, faction, xp, prestige, headshots FROM careers").all() as CareerRow[];
    const lifetimeRows = this.#database.prepare("SELECT * FROM lifetime_stats").all() as LifetimeRow[];
    const contracts = this.#database.prepare("SELECT * FROM contracts").all() as ContractRow[];
    const medals = this.#database.prepare("SELECT * FROM medals").all() as MedalRow[];
    const medalCounterRows = this.#database.prepare("SELECT * FROM medal_counters").all() as MedalCounterRow[];
    const skinUnlockRows = this.#database.prepare("SELECT player_id, skin_id FROM skin_unlocks").all() as SkinUnlockRow[];
    const skinEquipRows = this.#database.prepare("SELECT player_id, class, skin_id FROM skin_equips").all() as SkinEquipRow[];
    const lifetimeByPlayer = new Map<number, StoredLifetime>();
    for (const row of lifetimeRows) {
      lifetimeByPlayer.set(row.player_id, {
        wars: row.wars,
        wins: row.wins,
        kills: row.kills,
        deaths: row.deaths,
        captures: row.captures,
        medals: row.medals,
        shots: row.shots,
        hits: row.hits,
      });
    }
    return accounts.map((account): StoredAccount => {
      const playerCareers: StoredCareer[] = [];
      for (const career of careers) {
        if (career.player_id !== account.player_id) continue;
        playerCareers.push({ faction: career.faction, xp: career.xp, prestige: career.prestige, headshots: career.headshots ?? 0 });
      }
      const playerContracts: StoredContract[] = [];
      for (const contract of contracts) {
        if (contract.player_id !== account.player_id) continue;
        playerContracts.push({
          day: contract.day,
          slot: contract.slot,
          kind: contract.kind,
          progress: contract.progress,
          target: contract.target,
          reward: contract.reward,
          completed: contract.completed !== 0,
        });
      }
      const playerMedals: StoredMedal[] = [];
      for (const medal of medals) {
        if (medal.player_id !== account.player_id) continue;
        playerMedals.push({ kind: medal.kind, count: medal.count });
      }
      const playerMedalCounters: StoredMedalCounter[] = [];
      for (const counter of medalCounterRows) {
        if (counter.player_id !== account.player_id) continue;
        playerMedalCounters.push({ category: counter.category, value: counter.value });
      }
      const lifetime = lifetimeByPlayer.get(account.player_id) ?? {
        wars: 0, wins: 0, kills: 0, deaths: 0, captures: 0, medals: 0, shots: 0, hits: 0,
      };
      const playerSkinUnlocks: string[] = [];
      for (const unlock of skinUnlockRows) {
        // Phase 8e-25: the old `!==` hydrated every account with EVERY OTHER
        // account's skins, and the next flush persisted the corruption.
        if (unlock.player_id !== account.player_id) continue;
        playerSkinUnlocks.push(unlock.skin_id);
      }
      const playerSkinEquips: StoredSkinEquip[] = [];
      for (const equip of skinEquipRows) {
        if (equip.player_id !== account.player_id) continue;
        playerSkinEquips.push({ class: equip.class, skinId: equip.skin_id });
      }
      return {
        playerId: account.player_id,
        tokenHash: account.token_hash,
        name: account.name,
        ...(account.auth_id === null ? {} : { authId: account.auth_id }),
        careers: playerCareers,
        lifetime,
        contracts: playerContracts,
        medals: playerMedals,
        medalCounters: playerMedalCounters,
        skinUnlocks: playerSkinUnlocks,
        skinEquips: playerSkinEquips,
      };
    });
  }

  flushAccounts(accounts: readonly StoredAccount[]): void {
    const flush = this.#database.transaction((batch: readonly StoredAccount[]) => {
      const clearSkinUnlocks = this.#database.prepare("DELETE FROM skin_unlocks WHERE player_id = ?");
      const insertSkinUnlock = this.#database.prepare("INSERT OR IGNORE INTO skin_unlocks (player_id, skin_id) VALUES (?, ?)");
      const clearSkinEquips = this.#database.prepare("DELETE FROM skin_equips WHERE player_id = ?");
      const insertSkinEquip = this.#database.prepare("INSERT OR IGNORE INTO skin_equips (player_id, class, skin_id) VALUES (?, ?, ?)");
      for (const account of batch) {
        this.#upsertAccount.run({ playerId: account.playerId, tokenHash: account.tokenHash, authId: account.authId ?? null, name: account.name, createdAt: Date.now() });
        for (const career of account.careers) {
          this.#upsertCareer.run({ playerId: account.playerId, faction: career.faction, xp: career.xp, prestige: career.prestige, headshots: career.headshots });
        }
        this.#upsertLifetime.run({ playerId: account.playerId, ...account.lifetime });
        for (const contract of account.contracts) {
          this.#upsertContract.run({
            playerId: account.playerId,
            day: contract.day,
            slot: contract.slot,
            kind: contract.kind,
            progress: contract.progress,
            target: contract.target,
            reward: contract.reward,
            completed: contract.completed ? 1 : 0,
          });
        }
        for (const medal of account.medals) {
          this.#upsertMedal.run({ playerId: account.playerId, kind: medal.kind, count: medal.count });
        }
        for (const counter of account.medalCounters) {
          this.#upsertMedalCounter.run({ playerId: account.playerId, category: counter.category, value: counter.value });
        }
        clearSkinUnlocks.run(account.playerId);
        for (const skinId of account.skinUnlocks) insertSkinUnlock.run(account.playerId, skinId);
        clearSkinEquips.run(account.playerId);
        for (const equip of account.skinEquips) insertSkinEquip.run(account.playerId, equip.class, equip.skinId);
      }
    });
    flush(accounts);
  }

  loadWarTally(): { readonly ottoman: number; readonly byzantine: number } {
    const rows = this.#database.prepare("SELECT faction, wins FROM war_tally").all() as TallyRow[];
    let ottoman = 0;
    let byzantine = 0;
    for (const row of rows) {
      if (row.faction === 1) ottoman = row.wins;
      else if (row.faction === 2) byzantine = row.wins;
    }
    return { ottoman, byzantine };
  }

  saveWarTally(tally: { readonly ottoman: number; readonly byzantine: number }): void {
    const save = this.#database.transaction((value: { readonly ottoman: number; readonly byzantine: number }) => {
      this.#upsertTally.run({ faction: 1, wins: value.ottoman });
      this.#upsertTally.run({ faction: 2, wins: value.byzantine });
    });
    save(tally);
  }

  appendXpLedger(rows: readonly XpLedgerRow[]): void {
    const append = this.#database.transaction((batch: readonly XpLedgerRow[]) => {
      for (const row of batch) {
        this.#insertLedger.run({ playerId: row.playerId, name: row.name, faction: row.faction, amount: row.amount, earnedAt: row.earnedAt });
      }
    });
    append(rows);
  }

  loadXpLedgerSince(since: number): readonly XpLedgerRow[] {
    const rows = this.#database.prepare("SELECT player_id, name, faction, amount, earned_at FROM xp_ledger WHERE earned_at >= ?").all(since) as LedgerRow[];
    return rows.map((row) => ({ playerId: row.player_id, name: row.name, faction: row.faction, amount: row.amount, earnedAt: row.earned_at }));
  }

  getAuthLinkByAuthId(authId: string): AuthLink | undefined {
    const row = this.#database.prepare("SELECT auth_id, player_id, email, created_at FROM auth_links WHERE auth_id = ?").get(authId) as { auth_id: string; player_id: number; email: string; created_at: number } | undefined;
    return row === undefined ? undefined : { authId: row.auth_id, playerId: row.player_id, email: row.email, createdAt: row.created_at };
  }

  getAuthLinkByEmail(email: string): AuthLink | undefined {
    const row = this.#database.prepare("SELECT auth_id, player_id, email, created_at FROM auth_links WHERE email = ? COLLATE NOCASE").get(email) as { auth_id: string; player_id: number; email: string; created_at: number } | undefined;
    return row === undefined ? undefined : { authId: row.auth_id, playerId: row.player_id, email: row.email, createdAt: row.created_at };
  }

  saveAuthLink(link: AuthLink): "linked" | "auth-conflict" | "email-conflict" | "player-conflict" {
    const save = this.#database.transaction(() => {
      const byAuth = this.getAuthLinkByAuthId(link.authId);
      if (byAuth !== undefined && byAuth.playerId !== link.playerId) return "auth-conflict" as const;
      const byEmail = this.getAuthLinkByEmail(link.email);
      if (byEmail !== undefined && byEmail.playerId !== link.playerId) return "email-conflict" as const;
      const byPlayer = this.#database.prepare("SELECT auth_id FROM auth_links WHERE player_id = ?").get(link.playerId) as { auth_id: string } | undefined;
      if (byPlayer !== undefined && byPlayer.auth_id !== link.authId) return "player-conflict" as const;
      this.#database.prepare("INSERT OR IGNORE INTO auth_links (auth_id, player_id, email, created_at) VALUES (?, ?, ?, ?)").run(link.authId, link.playerId, link.email, link.createdAt);
      this.#database.prepare("UPDATE accounts SET auth_id = ? WHERE player_id = ?").run(link.authId, link.playerId);
      return "linked" as const;
    });
    return save();
  }

  createPendingAuthUpgrade(upgrade: PendingAuthUpgrade): void {
    this.#database.prepare("INSERT INTO auth_upgrade_requests (state_hash, player_id, email, expires_at, consumed_at) VALUES (?, ?, ?, ?, NULL)").run(upgrade.stateHash, upgrade.playerId, upgrade.email, upgrade.expiresAt);
  }

  consumePendingAuthUpgrade(stateHash: string, now: number): PendingAuthUpgrade | undefined {
    const consume = this.#database.transaction(() => {
      // Phase 8e-25: bounded cleanup inside the same transaction — consumed
      // requests are one-time secrets (safe to delete immediately) and
      // expired ones are dead, so the table cannot grow without bound from
      // abandoned magic links.
      this.#database.prepare("DELETE FROM auth_upgrade_requests WHERE consumed_at IS NOT NULL OR expires_at < ?").run(now);
      const row = this.#database.prepare("SELECT state_hash, player_id, email, expires_at FROM auth_upgrade_requests WHERE state_hash = ? AND consumed_at IS NULL AND expires_at >= ?").get(stateHash, now) as { state_hash: string; player_id: number; email: string; expires_at: number } | undefined;
      if (row === undefined) return undefined;
      const changed = this.#database.prepare("UPDATE auth_upgrade_requests SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL").run(now, stateHash).changes;
      return changed === 1 ? { stateHash: row.state_hash, playerId: row.player_id, email: row.email, expiresAt: row.expires_at } : undefined;
    });
    return consume();
  }

  consumeRateLimit(keyHash: string, now: number, windowMs: number, limit: number): boolean {
    const consume = this.#database.transaction(() => {
      this.#database.prepare("DELETE FROM auth_rate_limits WHERE started_at < ?").run(now - windowMs);
      const row = this.#database.prepare("SELECT started_at, request_count FROM auth_rate_limits WHERE key_hash = ?").get(keyHash) as { started_at: number; request_count: number } | undefined;
      if (row === undefined || now - row.started_at >= windowMs) {
        this.#database.prepare("INSERT INTO auth_rate_limits (key_hash, started_at, request_count) VALUES (?, ?, 1) ON CONFLICT(key_hash) DO UPDATE SET started_at = excluded.started_at, request_count = 1").run(keyHash, now);
        return true;
      }
      if (row.request_count >= limit) return false;
      this.#database.prepare("UPDATE auth_rate_limits SET request_count = request_count + 1 WHERE key_hash = ?").run(keyHash);
      return true;
    });
    return consume();
  }

  isPlayerMuted(playerId: number): boolean {
    const row = this.#database.prepare("SELECT muted FROM player_mutes WHERE player_id = ?").get(playerId) as { muted: number } | undefined;
    return row?.muted === 1;
  }

  setPlayerMuted(playerId: number, muted: boolean): void {
    this.#database.prepare("INSERT INTO player_mutes (player_id, muted, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET muted = excluded.muted, updated_at = excluded.updated_at").run(playerId, muted ? 1 : 0, Date.now());
  }

  appendChatReport(report: StoredChatReport): void {
    this.#database.prepare("INSERT OR IGNORE INTO chat_reports (reporter_player_id, message_id, sender_player_id, channel, text, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(report.reporterPlayerId, report.messageId, report.senderPlayerId, report.channel, report.text, report.createdAt);
  }

  createClan(name: string, tag: string, founderPlayerId: number, createdAt: number): number | undefined {
    const create = this.#database.transaction((): number | undefined => {
      const existing = this.#database.prepare("SELECT clan_id FROM clans WHERE name = ? COLLATE NOCASE OR tag = ? COLLATE NOCASE").get(name, tag) as { clan_id: number } | undefined;
      if (existing !== undefined) return undefined;
      const result = this.#database.prepare("INSERT INTO clans (name, tag, founder_player_id, created_at) VALUES (?, ?, ?, ?)").run(name, tag, founderPlayerId, createdAt);
      this.#database.prepare("INSERT INTO clan_members (clan_id, player_id, joined_at) VALUES (?, ?, ?)").run(result.lastInsertRowid, founderPlayerId, createdAt);
      return Number(result.lastInsertRowid);
    });
    return create();
  }

  loadClanById(clanId: number): StoredClan | undefined {
    const row = this.#database.prepare("SELECT clan_id, name, tag, founder_player_id, created_at FROM clans WHERE clan_id = ?").get(clanId) as ClanRow | undefined;
    return row === undefined ? undefined : { clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at };
  }

  loadClanByTag(tag: string): StoredClan | undefined {
    const row = this.#database.prepare("SELECT clan_id, name, tag, founder_player_id, created_at FROM clans WHERE tag = ? COLLATE NOCASE").get(tag) as ClanRow | undefined;
    return row === undefined ? undefined : { clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at };
  }

  loadClanByName(name: string): StoredClan | undefined {
    const row = this.#database.prepare("SELECT clan_id, name, tag, founder_player_id, created_at FROM clans WHERE name = ? COLLATE NOCASE").get(name) as ClanRow | undefined;
    return row === undefined ? undefined : { clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at };
  }

  loadAllClans(): readonly StoredClan[] {
    const rows = this.#database.prepare("SELECT clan_id, name, tag, founder_player_id, created_at FROM clans ORDER BY clan_id").all() as ClanRow[];
    return rows.map((row) => ({ clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at }));
  }

  playerClan(playerId: number): StoredClan | undefined {
    const row = this.#database.prepare(
      "SELECT c.clan_id, c.name, c.tag, c.founder_player_id, c.created_at FROM clan_members m JOIN clans c ON c.clan_id = m.clan_id WHERE m.player_id = ?",
    ).get(playerId) as ClanRow | undefined;
    return row === undefined ? undefined : { clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at };
  }

  findPlayerIdByName(name: string): number | undefined {
    const rows = this.#database.prepare("SELECT player_id FROM accounts WHERE name = ? COLLATE NOCASE LIMIT 2").all(name) as { player_id: number }[];
    return rows.length === 1 ? rows[0]?.player_id : undefined;
  }

  clanMemberIds(clanId: number): readonly number[] {
    const rows = this.#database.prepare("SELECT player_id FROM clan_members WHERE clan_id = ? ORDER BY joined_at").all(clanId) as { player_id: number }[];
    return rows.map((row) => row.player_id);
  }

  clanMemberCount(clanId: number): number {
    const row = this.#database.prepare("SELECT COUNT(*) AS count FROM clan_members WHERE clan_id = ?").get(clanId) as { count: number };
    return row?.count ?? 0;
  }

  addClanMember(clanId: number, playerId: number, joinedAt: number): boolean {
    if (this.clanMemberCount(clanId) >= 50) return false;
    const result = this.#database.prepare("INSERT OR IGNORE INTO clan_members (clan_id, player_id, joined_at) VALUES (?, ?, ?)").run(clanId, playerId, joinedAt);
    return result.changes === 1;
  }

  removeClanMember(clanId: number, playerId: number): boolean {
    const result = this.#database.prepare("DELETE FROM clan_members WHERE clan_id = ? AND player_id = ?").run(clanId, playerId);
    return result.changes === 1;
  }

  updateClanFounder(clanId: number, playerId: number): void {
    this.#database.prepare("UPDATE clans SET founder_player_id = ? WHERE clan_id = ?").run(playerId, clanId);
  }

  deleteClan(clanId: number): void {
    const remove = this.#database.transaction(() => {
      this.#database.prepare("DELETE FROM clan_invites WHERE clan_id = ?").run(clanId);
      this.#database.prepare("DELETE FROM clan_members WHERE clan_id = ?").run(clanId);
      this.#database.prepare("DELETE FROM clans WHERE clan_id = ?").run(clanId);
    });
    remove();
  }

  createClanInvite(clanId: number, playerId: number, invitedBy: number, createdAt: number): void {
    this.#database.prepare("INSERT OR IGNORE INTO clan_invites (clan_id, player_id, invited_by, created_at) VALUES (?, ?, ?, ?)").run(clanId, playerId, invitedBy, createdAt);
  }

  loadClanInvites(playerId: number): readonly StoredClanInvite[] {
    const rows = this.#database.prepare("SELECT clan_id, invited_by, created_at FROM clan_invites WHERE player_id = ? ORDER BY created_at").all(playerId) as ClanInviteRow[];
    return rows.map((row) => ({ clanId: row.clan_id, invitedBy: row.invited_by, createdAt: row.created_at }));
  }

  consumeClanInvite(clanId: number, playerId: number): boolean {
    const result = this.#database.prepare("DELETE FROM clan_invites WHERE clan_id = ? AND player_id = ?").run(clanId, playerId);
    return result.changes === 1;
  }

  searchClans(query: string, limit: number): readonly StoredClan[] {
    const pattern = `%${query.replace(/[%_]/g, "")}%`;
    const rows = this.#database.prepare(
      "SELECT clan_id, name, tag, founder_player_id, created_at FROM clans WHERE name LIKE ? COLLATE NOCASE OR tag LIKE ? COLLATE NOCASE ORDER BY clan_id LIMIT ?",
    ).all(pattern, pattern, Math.max(1, Math.min(20, limit))) as ClanRow[];
    return rows.map((row) => ({ clanId: row.clan_id, name: row.name, tag: row.tag, founderPlayerId: row.founder_player_id, createdAt: row.created_at }));
  }

  loadClanLeaderboard(clanId: number, since: number, limit: number): readonly LeaderboardRow[] {
    const rows = this.#database.prepare(`
      SELECT x.player_id, MAX(x.name) AS name, SUM(x.amount) AS xp
      FROM xp_ledger x
      INNER JOIN clan_members m ON m.player_id = x.player_id
      WHERE m.clan_id = ? AND x.earned_at >= ?
      GROUP BY x.player_id
      HAVING SUM(x.amount) > 0
      ORDER BY xp DESC, x.player_id ASC
      LIMIT ?
    `).all(clanId, since, Math.max(1, Math.min(100, limit))) as { player_id: number; name: string; xp: number }[];
    return rows.map((row) => ({ playerId: row.player_id, name: row.name, xp: row.xp }));
  }

  blockPlayer(playerId: number, blockedPlayerId: number, createdAt: number): void {
    this.#database.prepare("INSERT OR IGNORE INTO player_blocks (player_id, blocked_player_id, created_at) VALUES (?, ?, ?)").run(playerId, blockedPlayerId, createdAt);
  }

  unblockPlayer(playerId: number, blockedPlayerId: number): boolean {
    const result = this.#database.prepare("DELETE FROM player_blocks WHERE player_id = ? AND blocked_player_id = ?").run(playerId, blockedPlayerId);
    return result.changes === 1;
  }

  isBlocked(playerId: number, blockedPlayerId: number): boolean {
    const row = this.#database.prepare("SELECT 1 AS found FROM player_blocks WHERE player_id = ? AND blocked_player_id = ?").get(playerId, blockedPlayerId) as { found: number } | undefined;
    return row !== undefined;
  }

  loadBlockedIds(playerId: number): readonly number[] {
    const rows = this.#database.prepare("SELECT blocked_player_id FROM player_blocks WHERE player_id = ? ORDER BY created_at").all(playerId) as { blocked_player_id: number }[];
    return rows.map((row) => row.blocked_player_id);
  }

  createFriendRequest(fromId: number, toId: number, createdAt: number): void {
    this.#database.prepare("INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)").run(fromId, toId, createdAt);
  }

  loadFriendRequests(toId: number): readonly StoredFriendRequest[] {
    const rows = this.#database.prepare("SELECT from_id, to_id, created_at FROM friend_requests WHERE to_id = ? ORDER BY created_at").all(toId) as { from_id: number; to_id: number; created_at: number }[];
    return rows.map((row) => ({ fromId: row.from_id, toId: row.to_id, createdAt: row.created_at }));
  }

  consumeFriendRequest(fromId: number, toId: number): boolean {
    const result = this.#database.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(fromId, toId);
    return result.changes === 1;
  }

  addFriendPair(firstId: number, secondId: number, createdAt: number): void {
    const [low, high] = firstId < secondId ? [firstId, secondId] : [secondId, firstId];
    this.#database.prepare("INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)").run(low, high, createdAt);
  }

  removeFriendPair(firstId: number, secondId: number): boolean {
    const [low, high] = firstId < secondId ? [firstId, secondId] : [secondId, firstId];
    const result = this.#database.prepare("DELETE FROM friends WHERE player_id = ? AND friend_id = ?").run(low, high);
    return result.changes === 1;
  }

  loadFriendIds(playerId: number): readonly number[] {
    const rows = this.#database.prepare(
      "SELECT friend_id FROM friends WHERE player_id = ? UNION SELECT player_id FROM friends WHERE friend_id = ? ORDER BY 1",
    ).all(playerId, playerId) as { friend_id: number }[];
    return rows.map((row) => row.friend_id);
  }

  close(): void {
    this.#database.close();
  }
}
