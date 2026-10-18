# Janissary

A browser-based multiplayer shooter set during the 1453 Siege of Constantinople. Ottoman Janissaries with arquebuses fight Byzantine guardsmen with crossbows for seven objectives on a 1.8 km battlefield. The game includes cavalry, crewed artillery and breachable walls.

Built with TypeScript: a Node.js game server, a three.js client and Supabase for accounts.

## Highlights

- **Server-authoritative netcode.** A 20 Hz simulation and 10 Hz snapshot replication, sent over a custom versioned binary protocol (`shared/PROTOCOL.md`). Clients predict their own movement, reconcile with the server and interpolate other players. Snapshots are delta-encoded against the last state each client confirmed.
- **Built to scale.** Each player only receives nearby entities (area of interest). Snapshot templates are shared across groups of players, and object pools avoid memory churn. A headless bot harness (`tools/`) load-tests the server with many simulated players across multiple processes and reports per-phase timings.
- **Progression and accounts.** Guests play straight away and can save their progress with a Supabase email magic link. Includes XP, contracts, tiered medals, clans, leaderboards and chat.
- **Security.** Exact binary framing, admission caps, rate limits, allowlisted origins, signed session tokens and an authenticated metrics endpoint.
- **Bots.** When few players are online, server-side bots fill each team and step aside as real players join.
- **Rendering and audio.** Custom lighting and colour grading, a water shader, instanced crowds and procedural textures. Spatial audio runs on the WebAudio API.
- **Operations.** Docker, a Caddy reverse proxy, provisioning and deploy scripts, and SQLite backup and restore with recovery checks (`ops/`).

## Tech stack

| Area | Tools |
| --- | --- |
| Server | Node.js 22, uWebSockets.js, better-sqlite3 |
| Client | Vite, three.js, React (menus), WebAudio |
| Shared | Binary protocol, movement and collision maths, game tuning |
| Accounts | Supabase Auth (magic link) |
| Tests | Vitest (server, client and shared packages) |
| Ops | Docker, Caddy, systemd timers, Hetzner VPS scripts |

## Project structure

```
shared/  Protocol, constants, deterministic movement and collision
server/  Authoritative simulation, replication, progression, storage
client/  three.js game client, HUD, audio
tools/   Load-test bots and asset audit
web/     Landing page (Next.js)
ops/     Deployment, backup and restore scripts
```

## Running locally

Requires Node.js 22 and pnpm.

```bash
corepack enable
pnpm install
pnpm dev
```

Open http://localhost:5173 in two browser tabs. WASD moves, left click fires, R reloads, F mounts a horse or mans a cannon, and Tab shows the scoreboard.

Run the tests with `pnpm test`. Run a load test with `pnpm loadtest`.

## Asset credits

Third-party models, sounds and fonts are CC0, CC-BY or OFL licensed. The models generated with Meshy are owned under its commercial licence. See [CREDITS.md](CREDITS.md). `pnpm audit:assets` fails the build if an asset ships without a credit entry.
