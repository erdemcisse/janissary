# Janissary wire protocol v14

All gameplay traffic is binary. Multi-byte numbers are little-endian. Every message starts with
two bytes: `version:u8` (`14`) and `type:u8`. A receiver must reject a different version, a
truncated payload, an unexpected type, or trailing bytes on any client-originated fixed-size
message. WebSocket text frames are never accepted on the hot path.

Angles are signed 16-bit values mapping `[-π, π]` to `[-32767, 32767]`. Positions are signed
16-bit **decimetres** since v9 (Phase 8c-4 grew the world to ±900 m, beyond the old 1 cm/unit
±327.67 m range): `±3276.7 m` at 10 cm resolution. Entity IDs are unsigned 16-bit values. These
choices make a worst-case snapshot of 100 moving entities about 26 KB/s at 20 Hz.

## Messages

| Type | Direction | Payload after the 2-byte header |
|---:|---|---|
| 1 Join | client → server | `tokenLength:u8`, `token:utf8[tokenLength]` (max 128), `nameLength:u8`, `name:utf8[nameLength]` (max 24 bytes), `preferredTeam:u8`, `preferredClass:u8` |
| 2 Welcome | server → client | `entityId:u16`, `serverTick:u32`, `tickRate:u8`, `x:f32`, `y:f32`, `z:f32`, `team:u8`, `class:u8`, `wallStateBits:u32`, `wallHpFrac:u8[12]` |
| 3 Input | client → server | `seq:u32`, `lastSnapshotTick:u32`, `buttons:u16`, `yaw:i16`, `pitch:i16`, `dtMs:u16`, `buttonsHigh:u16` |
| 4 EntityJoin | server → client | `entityId:u16`, `nameLength:u8`, `name:utf8[nameLength]`, `team:u8`, `rank:u8`, `prestige:u8`, `class:u8`, `kind:u8`, `tagLength:u8`, `tag:utf8[tagLength]`, `bot:u8` |
| 5 EntityLeave | server → client | `entityId:u16` |
| 6 Snapshot | server → client | described below |
| 7 Ping | client → server | `nonce:u32` |
| 8 Pong | server → client | `nonce:u32` |
| 9 Account | server → client | described below |
| 10 XpEvent | server → client | `amount:u16`, `xpIntoRank:u32`, `faction:u8`, `rank:u8`, `prestige:u8`, `leveled:u8`, `prestiged:u8`, `source:u8`, `headshot:u8` |
| 11 ContractEvent | server → client | `slot:u8`, `kind:u8`, `progress:u16`, `target:u16`, `reward:u16`, `completed:u8` |
| 12 WarSummary | server → client | described below |
| 13 ClassSelect | client → server | `class:u8` |
| 14 ClassStatus | server → client | `class:u8`, `accepted:u8`, `reason:u8` (`1` = capped/full) |
| 15 WallEvent | server → client | `segmentId:u8`, `state:u8`, `attackerEntityId:u16`, `hpFrac:u8` |
| 16 ShipEvent | server → client | `vehicleEntityId:u16`, `eventType:u8`, `occupantEntityId:u16` |
| 17 ChatSend | client → server | `channel:u8`, `textLength:u16`, `text:utf8[textLength]` (max 160 bytes) |
| 18 ChatMessage | server → client | `messageId:u32`, `playerId:u32`, `channel:u8`, `createdAtSeconds:u32`, `nameLength:u8`, `name:utf8`, `textLength:u16`, `text:utf8` |
| 19 ChatNotice | server → client | `code:u8`, `textLength:u16`, `text:utf8` |
| 20 ChatReport | client → server | `messageId:u32` |
| 21 MedalUnlock | server → client | `category:u8`, `tier:u8`, `nameLength:u8`, `name:utf8[nameLength]` |
| 22 MedalState | server → client | `wars:u32`, then eight `category:u8,value:u32,tier:u8` records |
| 23 ClanState | server → client | `clanId:u32`, `nameLength:u8`, `name:utf8`, `tagLength:u8`, `tag:utf8`, `founderPlayerId:u32`, `memberCount:u16`, `role:u8` |
| 24 SpawnSelect | client → server | `pointIndex:u8` (`0..6`, or `255` for home base) |
| 25 BlockedIds | server → client | `count:u8`, then `count` × `blockedId:u16` |
| 26 SquadState | server → client | `squadId:u32`, `count:u8`, then `count` × `memberEntityId:u16` (empty `count` = no squad) |
| 27 SquadCommand | client → server | `op:u8` (1 invite, 2 leave, 3 disband), `targetPlayerId:u32`, then 2 reserved bytes — fixed 7-byte payload, trailing bytes rejected |
| 28 Deploy | client → server | no payload — redeploy the sender's dead entity at its requested spawn point with its requested class; ignored while alive or before the deploy floor |

Input button bits are forward `0x01`, backward `0x02`, left `0x04`, right `0x08`, fire `0x10`,
reload `0x20`, melee `0x40`, crouch `0x80`, and interact `0x100`, raise-earthwork `0x200`,
dig-earthwork `0x400`, torch `0x800`, and jump `0x1000`. Since v14 the low word also carries
aim-down-sights `0x2000` (hold-to-aim, Phase 8e-7); bits `0x4000`/`0x8000` stay reserved. Since
v13 the full button word is 32
bits: weapon-slot select 1/2/3 are `0x10000`, `0x20000`, `0x40000` and travel in the Input
message's `buttonsHigh:u16` (the formerly reserved u16); the low word at `buttons:u16` is
unchanged. Team values are none `0`, Ottoman `1`, Byzantine
`2`. Sequence
numbers increase per client. The server acknowledges the newest input actually simulated in each
snapshot. `lastSnapshotTick` is the newest snapshot the client decoded successfully; it advances
the server's per-client delta baseline.

### Support classes and ships

`playerClass` adds Mehter (7, Ottoman) and Priest (8, Byzantine) support classes. `kind` in
EntityJoin distinguishes players (`0`) from galleys (`1`), earthworks (`2`), and siege cannons
(`3`); galley names are
the team label and earthwork names are empty (the subkind rides the EntityJoin `class` byte and
the snapshot torch field). ShipEvent types are helm/gun1/gun2/passenger claimed and released,
sunk, and respawned. The snapshot `Ship` field (`0x20`) carries `kind:u8`, `hullHp:u8` (in tens, 0–2550), and `state:u8`
with bits sinking `0x01`, helm `0x02`, gun1 `0x04`, gun2 `0x08`, and passenger count in bits 4–7.
Station occupancy is replicated through ShipEvent metadata, never per snapshot.

### Guests and the token

The `Join` token is empty for a brand-new guest: the server creates the account and returns a
signed opaque token in the `Account` message, which the client persists in localStorage and
presents on every later connect. A valid token resolves to the same persistent `playerId`;
a missing, malformed, or forged token is treated as a new guest. The token is
`base64url(version:u8 ‖ playerId:u32)` ‖ `.` ‖ `base64url(HMAC-SHA256(secret, payload))` and is
verified with a constant-time comparison. Rank and prestige changes are rare and travel only in
the `EntityJoin` metadata path, never per snapshot. XP/contract/war events are reliable
per-client messages (9–12), ordered after the control messages on the same socket.

Guest tokens retain payload version 1 unchanged. A claimed account uses payload version 2:
`version:u8 (2) ‖ playerId:u32 ‖ authId:uuid[16]`, signed by the same HMAC construction. The
server accepts it only when both the persistent account and `auth_links` row match that UUID.
Protocol v8 is independent from token payload versions.

### Account (9)

`playerId:u32`, `tokenLength:u8`, `token:utf8`, `nameLength:u8`, `name:utf8`, then two careers
(`xpIntoRank:u32`, `rank:u8`, `prestige:u8`, `headshots:u32` — Ottoman then Byzantine), `warTallyOttoman:u16`,
`warTallyByzantine:u16`, lifetime `wars:u16 wins:u16 kills:u32 deaths:u32 captures:u32
medals:u16`, three contracts of `kind:u8 progress:u16 target:u16 reward:u16 completed:u8`, then
four medals of `kind:u8 count:u16`, then `claimed:u8`.

### Chat (17–20)

Channels are team `1` and all `2`. Chat is reliable WebSocket control traffic and never enters a
snapshot or delta baseline. Only persistently claimed accounts may send; guests receive messages
but get notice code `1` when attempting to send. The server normalizes control characters and
whitespace, applies the shared word-list filter, enforces the 160-byte maximum and per-player
token bucket, then emits plain UTF-8 text. Clients render it as text nodes, never HTML. Notice
codes are claimed account required `1`, rate limited `2`, muted `3`, invalid `4`, report accepted
`5`.

### WarSummary (12)

`winner:u8`, `warTallyOttoman:u16`, `warTallyByzantine:u16`, `kills:u16`, `deaths:u16`,
`assists:u16`, `captures:u16`, `shots:u16`, `hits:u16`, `defenseKills:u16`,
`captureSeconds:u16`, `warXpEarned:u16`, `welcomeBackBonus:u16`, `medalMask:u8`. The mask has one
bit per medal kind: Most Captures `0x01`, Best Marksman `0x02`, Gate Keeper `0x04`, Veteran
Presence `0x08`.

## Delta snapshot

The fixed prefix is `tick:u32`, `ackInputSeq:u32`, `baseTick:u32`, `recordCount:u16`. A zero
`baseTick` means a full snapshot. Otherwise, the receiver clones the entity map from exactly that
previous tick and applies the records. If the baseline is unavailable, the client discards the
delta and its next input continues acknowledging its last valid snapshot, causing the server to
fall back to an available baseline or a full state.

Each record begins `entityId:u16`, `fields:u8`. Fields are position `0x01` (`x:i16,y:i16,z:i16`),
 yaw `0x02` (`yaw:i16`), pitch `0x04` (`pitch:i16`), gameplay `0x08`, vehicle `0x10`, ship `0x20`,
torch `0x40`, or removed `0x80` (no
remaining payload). Gameplay is `team:u8,health:u8,flags:u16,ammo:u8,reloadTicks:u8,
respawnTicks:u8,kills:u8,deaths:u8,assists:u8,captureSeconds:u16`, and since v13
`weaponState:u8` (active weapon slot 1–3 in bits 0–1, draw/holster ticks remaining 0–63 in
bits 2–7). Vehicle is
`class:u8,mounted:u8,horseHp:u8`. Ship is `kind:u8,hullHp:u8 (tens),state:u8`. The torch field
(`0x40`) is one byte: `torch:u8` on player records (0/1, the player-carried torch) and the
earthwork subkind (`1` mound, `2` trench) on earthwork entity records — it is only emitted when
non-default, so torch-off players cost nothing on the wire. Flags are alive `0x01`, reloading
`0x02`, spawn protected
`0x04`, crouched `0x08`, mounted `0x10`, manning artillery `0x20`, and pushing cannon `0x100`
(flags widened to u16 in v12 for the pushing bit).

After all entity records, every snapshot carries authoritative match metadata:
`pointCount:u8`, then each point as `owner:u8,progress:i16`, followed by
`ottomanTickets:u16,byzantineTickets:u16,roundPhase:u8,phaseRemainingTicks:u16,eventCount:u8`.
Point order is GATE, BREACH FIELD, HARBOR ROAD, INNER CITY, HILL FORT NW, HILL FORT NE,
HILL FORT S. Each event is
`id:u16,type:u8,sourceEntityId:u16,targetEntityId:u16,value:u8`. Event types are fire, hit,
death, capture, victory, and respawn. Clients de-duplicate event IDs for presentation only;
health, tickets, and objective state always come from the snapshot state.

New entities carry all state fields. Unchanged entities have no record. Components are compared
against the acknowledged authoritative baseline and encoded at decimetre precision. Phase 2
replicates snapshots at a staggered 10 Hz while simulation and input remain 20 Hz.

Protocol v10 (Phase 8c-4c) adds SpawnSelect. It carries only a capture-point index or the home-base
sentinel; ownership, enemy presence, terrain-safe coordinates, and final spawn position remain
server-authoritative and are revalidated at the respawn tick. Protocol v9 (Phase 8c-4) switches positions to 10 cm units (world grew to ±900 m), adds the
torch field bit (`0x40`) and the earthwork entity kind, and raises the capture-point count to
seven. Protocol v8 added the headshot flag to XpEvent (per-kill XP is the existing `amount`
field; a
headshot killing blow sets `headshot:u8` and the hit also emits its own `source=22` bonus event)
and a per-career `headshots` counter in Account. Protocol v7 added the optional clan tag and bot
marker to EntityJoin plus reliable medal/clan messages 21–23. The snapshot layout remains byte-for-byte identical to v6. Protocol v6 added
claimed state to Account and reliable chat messages 17–20. Earlier version history: v4 added class selection, mounted metadata, three-point
state, and reliable wall events. `wallStateBits` has two bits per one of twelve segments: intact
`0`, damaged `1`, breached `2`. Welcome always carries the full state; WallEvent updates it
reliably for existing clients. Since v12 both also carry `hpFrac`: the segment HP as a fraction
of full health quantized to 1/16 steps (`0`–`16`), one byte per segment (Welcome appends all
twelve after `wallStateBits`; WallEvent carries the one for its segment). WallEvents fire on
state changes and on every damage hit that crosses a 1/16 boundary. Each snapshot contains only the receiver's interest set: the
local entity plus at most 149 remotes plus galleys and nearby earthworks (earthworks are
distance-scoped like players and appear/disappear through EntityJoin/EntityLeave). Interest enters at 140 m and exits at 160 m, with reliable
EntityJoin/EntityLeave notifications and removal records covering transitions. Dense grid cells
use deterministic 150-slot spatial cohorts so clients receive a stable crowd and the server can
reuse an encoded delta template for peers with identical interest and baseline state. The input
acknowledgment at offset 6 is patched per receiver before send.

The server captures entity state once into a shared six-tick ring. A client delta is valid only
when both the acknowledged global state and that client's historical interest set remain present;
otherwise the server sends a full interest snapshot with `baseTick = 0`.

WebSocket ordering guarantees that join/leave notifications, progression messages, and snapshots
arrive in order. The snapshot's removal records are still authoritative for AOI transitions and
make the state robust if a client ignores a control notification.

Wall state is intentionally not rewound for lag compensation. Player and horse spheres rewind to
the shooter’s acknowledged snapshot, while static-map LOS uses the current authoritative wall
state. This keeps a newly breached route immediately real for all players and avoids mutable-world
rewind ambiguity.

Phase 5a changed only server-internal interest maintenance and cohort-template lookup. Phase 5b
used v5 for galley entity state and events. Phase 6A used v6 for account/chat control traffic;
Phase 6B used v7 for medals, clan state, tags, and bot identity. Phase 8A changed validation only
and did not alter the v7 wire layout. Phase 8c-0 uses v8 for the XpEvent headshot flag and the
per-career headshots counter in Account. Phase 8c-4 uses v9 for the ±900 m world (10 cm position
units), the torch field bit, the earthwork entity kind, and seven capture points. Phase 8c-4c uses
v10 for the client spawn-point selection message; snapshot metadata is unchanged. The siege-loop
phase uses v12: the snapshot Gameplay flags field widens to u16 (pushing-cannon bit), WallEvent
gains the `hpFrac` byte, Welcome appends twelve per-segment `hpFrac` bytes, and EntityJoin gains
the siege-cannon kind. Phase 8e-3 uses v13: the Input message's reserved u16 becomes
`buttonsHigh` (weapon-slot bits 16–18), and the snapshot Gameplay block appends the
`weaponState` byte (active slot + switch ticks). Phase 8e-7 uses v14: the low button word's
previously reserved bit 13 becomes aim-down-sights (`0x2000`) — a semantic change to an
already-masked bit, not a layout change; the version bump keeps v13 peers from disagreeing
about aimed-fire spread. Phase 8e-13 uses v15: adds Deploy (28) and changes respawn semantics —
human players no longer auto-respawn after `RESPAWN_SECONDS`; they redeploy only on an explicit
Deploy request once `DEPLOY_MIN_SECONDS` (1.5 s) has elapsed since death (bots unchanged). The
`respawnTicks` snapshot field now counts down only that floor for humans, then reads 0 while the
player waits on the deploy screen; own death is read from `health == 0` / the Alive flag.
