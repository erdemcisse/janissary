import { useEffect, useRef, type CSSProperties } from "react";
import {
  CAPTURE_POINTS,
  RIVER_BRIDGES,
  RIVER_FORDS,
  RIVER_HALF_WIDTH,
  RIVER_HEADWATER,
  RIVER_SEGMENTS,
  SIEGE_BLOCKOUT,
  TERRAIN_PROPS,
  Team,
  WALL_SEGMENTS,
  WATER_SHORE_Z,
  WORLD_HALF_EXTENT,
  WallState,
  ZONE_GRID_CELLS,
  ZONE_GRID_CELL_SIZE,
  teamPointCounts,
  zoneOwnerForPosition,
} from "@janissary/shared";
import type { MinimapBlip } from "../game/GameClient";

/**
 * Top-down cartographic view of the siege, drawn in three layers:
 *
 *  - STATIC — land, sea, river, fords, bridges, road strip, city walls,
 *    defender platform, hill-fort stacks. Pre-rendered once to an offscreen
 *    canvas per size (module-level lazy init); none of these change during a
 *    war.
 *  - TERRITORY — the deliberately blocky 18×18 zone fill (100 m cells, same
 *    grid as shared/territory.ts) tinted by zoneOwnerForPosition. Cached on
 *    its own offscreen canvas per size and recomputed ONLY when the owners
 *    array or the team palette actually changes.
 *  - DYNAMIC — wall-state strips (walls break mid-war), capture-point glyphs
 *    distinguished by type with tweened ownership color and contest pulse,
 *    entity blips, and the self chevron. Redrawn every rAF.
 *
 * Blips come from DebugStats.blips, which GameClient builds exclusively from
 * the client's existing AOI interest set (the bible's hard no-wallhack rule:
 * no new server feed for the map). Green is deliberately unused anywhere —
 * it is reserved for a future squad layer.
 *
 * The default size is the HUD corner map; the 8e-13 death screen renders the
 * same component at a larger size and overlays spawn markers positioned with
 * worldToMapFor(size).
 */

/** The original HUD footprint; the death-screen chart supplies its own size. */
export const MINIMAP_DEFAULT_SIZE = 224;
/** Modest 1.29× HUD zoom: 1,400 m across instead of the full 1,800 m world. */
export const HUD_MINIMAP_HALF_EXTENT = 700;
const PAD = 10;
const EXTENT = WORLD_HALF_EXTENT;
/** Offscreen layers render at 2× so they stay crisp on DPR-2 displays. */
const LAYER_DPR = 2;
/** Territory zone fill alpha — visible, but the cartography reads through it. */
const TERRITORY_ALPHA = 0.28;

function scaleFor(size: number): number {
  return (size - PAD * 2) / (EXTENT * 2);
}

function worldToMapSized(size: number, x: number, z: number): [number, number] {
  const scale = scaleFor(size);
  return [PAD + (x + EXTENT) * scale, PAD + (z + EXTENT) * scale];
}

export interface MinimapViewport {
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfExtent: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps the HUD chart centred on the player until the map edge is reached.
 * Clamping avoids revealing empty canvas outside the authored world.
 */
export function hudMinimapViewport(selfX: number, selfZ: number): MinimapViewport {
  const maxCenter = EXTENT - HUD_MINIMAP_HALF_EXTENT;
  return {
    centerX: clamp(selfX, -maxCenter, maxCenter),
    centerZ: clamp(selfZ, -maxCenter, maxCenter),
    halfExtent: HUD_MINIMAP_HALF_EXTENT,
  };
}

function worldToViewportMap(size: number, viewport: MinimapViewport, x: number, z: number): [number, number] {
  const scale = (size - PAD * 2) / (viewport.halfExtent * 2);
  return [
    size / 2 + (x - viewport.centerX) * scale,
    size / 2 + (z - viewport.centerZ) * scale,
  ];
}

/** Player-centred HUD projection, exported for a deterministic chart contract. */
export function worldToHudMapFor(size: number, selfX: number, selfZ: number): (x: number, z: number) => [number, number] {
  const viewport = hudMinimapViewport(selfX, selfZ);
  return (x, z) => worldToViewportMap(size, viewport, x, z);
}

/** World → canvas-pixel projection for a given map size (death-screen spawn markers). */
export function worldToMapFor(size: number): (x: number, z: number) => [number, number] {
  return (x, z) => worldToMapSized(size, x, z);
}

export const MINIMAP_LEGEND = [
  { key: "ally", label: "ALLY" },
  { key: "enemy", label: "ENEMY" },
  { key: "ship", label: "SHIP" },
  { key: "gun", label: "GUN" },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  if (value.length !== 6) return [255, 255, 255];
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.body).getPropertyValue(name);
  return value === "" ? fallback : value.trim();
}

/** Hill-fortress stack sites (the three hill forts + the landmark mountain), derived from the shared terrain props — tier-0 plateaus sit exactly on the site center. */
const HILL_SITES: readonly { x: number; z: number }[] = TERRAIN_PROPS
  .filter((prop) => prop.collider.id.startsWith("terrain-stack-") && prop.collider.id.endsWith("-0"))
  .map((prop) => ({ x: prop.x, z: prop.z }));

function createLayer(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | undefined {
  const layer = document.createElement("canvas");
  layer.width = size * LAYER_DPR;
  layer.height = size * LAYER_DPR;
  const context = layer.getContext("2d");
  if (context === null) return undefined;
  context.scale(LAYER_DPR, LAYER_DPR);
  return [layer, context];
}

/** Muted cartographic base: parchment/olive land, blue-grey water, stone-grey structures. Team colors are reserved for ownership. */
function paintStaticLayer(context: CanvasRenderingContext2D, size: number): void {
  const scale = scaleFor(size);
  const wtm = (x: number, z: number): [number, number] => worldToMapSized(size, x, z);
  // land
  const land = context.createLinearGradient(0, 0, 0, size);
  land.addColorStop(0, "#2c3122");
  land.addColorStop(1, "#22271b");
  context.fillStyle = land;
  context.fillRect(0, 0, size, size);

  // packed-earth road strip along the wall lane (z ∈ [-15, 15], full width)
  const [, roadTop] = wtm(0, -15);
  const [, roadBottom] = wtm(0, 15);
  context.fillStyle = "rgba(196, 172, 128, 0.13)";
  context.fillRect(PAD, roadTop, size - PAD * 2, roadBottom - roadTop);

  // the sea (z ≥ WATER_SHORE_Z) + shoreline
  const [, shoreY] = wtm(0, WATER_SHORE_Z);
  context.fillStyle = "#20333d";
  context.fillRect(PAD, shoreY, size - PAD * 2, size - PAD - shoreY);
  context.strokeStyle = "rgba(232, 220, 192, 0.3)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(PAD, shoreY);
  context.lineTo(size - PAD, shoreY);
  context.stroke();

  // river channel: 30 m-wide stroked polyline + headwater lake
  context.strokeStyle = "#2a4653";
  context.lineWidth = RIVER_HALF_WIDTH * 2 * scale;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  for (let index = 0; index < RIVER_SEGMENTS.length; index += 1) {
    const segment = RIVER_SEGMENTS[index];
    if (segment === undefined) continue;
    const [x1, y1] = wtm(segment.x1, segment.z1);
    const [x2, y2] = wtm(segment.x2, segment.z2);
    if (index === 0) context.moveTo(x1, y1);
    context.lineTo(x2, y2);
  }
  context.stroke();
  const [lakeX, lakeY] = wtm(RIVER_HEADWATER.x, RIVER_HEADWATER.z);
  context.fillStyle = "#2a4653";
  context.beginPath();
  context.arc(lakeX, lakeY, RIVER_HEADWATER.radius * scale, 0, Math.PI * 2);
  context.fill();

  // fords: sandy shallows patches over the channel
  context.fillStyle = "rgba(206, 184, 138, 0.5)";
  for (const ford of RIVER_FORDS) {
    const [fx, fy] = wtm(ford.x, ford.z);
    context.beginPath();
    context.arc(fx, fy, ford.radius * scale, 0, Math.PI * 2);
    context.fill();
  }

  // bridge decks
  context.fillStyle = "rgba(158, 132, 96, 0.9)";
  for (const bridge of RIVER_BRIDGES) {
    const [bx, by] = wtm(bridge.x - bridge.width / 2, bridge.z - bridge.depth / 2);
    context.fillRect(bx, by, Math.max(2, bridge.width * scale), Math.max(2, bridge.depth * scale));
  }

  // the wall line — a faint baseline only; live wall STATE is drawn per-frame above it
  context.fillStyle = "rgba(160, 154, 140, 0.35)";
  for (const segment of WALL_SEGMENTS) {
    const [wx, wy] = wtm(segment.box.x - segment.box.width / 2, segment.box.z);
    context.fillRect(wx, wy - 0.5, Math.max(2, segment.box.width * scale), 1);
  }

  // city-wall blockout + defender platform
  for (const box of SIEGE_BLOCKOUT) {
    if (box.id.startsWith("city-wall-")) {
      const [bx, by] = wtm(box.x - box.width / 2, box.z - box.depth / 2);
      context.fillStyle = "rgba(150, 146, 136, 0.55)";
      context.fillRect(bx, by, Math.max(1.2, box.width * scale), Math.max(1.2, box.depth * scale));
    } else if (box.id === "defender-platform") {
      const [bx, by] = wtm(box.x - box.width / 2, box.z - box.depth / 2);
      context.fillStyle = "rgba(139, 135, 125, 0.3)";
      context.fillRect(bx, by, box.width * scale, box.depth * scale);
    }
  }

  // hill-fort stacks + landmark mountain: paired-peak glyphs
  context.strokeStyle = "rgba(150, 138, 108, 0.8)";
  context.lineWidth = 1.1;
  for (const site of HILL_SITES) {
    const [hx, hy] = wtm(site.x, site.z);
    context.beginPath();
    context.moveTo(hx - 6, hy + 3.5);
    context.lineTo(hx - 1.5, hy - 3.5);
    context.lineTo(hx + 1.5, hy + 1);
    context.lineTo(hx + 3.5, hy - 1.5);
    context.lineTo(hx + 7, hy + 3.5);
    context.stroke();
  }

}

/** Fixed-pixel frame and compass; drawn after local-map cropping so they never scale or drift. */
function paintMapFrame(context: CanvasRenderingContext2D, size: number): void {
  context.strokeStyle = "rgba(232, 220, 192, 0.18)";
  context.lineWidth = 1;
  context.strokeRect(PAD - 0.5, PAD - 0.5, size - PAD * 2 + 1, size - PAD * 2 + 1);

  const compassX = size - PAD - 15;
  const compassY = PAD + 16;
  context.strokeStyle = "rgba(232, 220, 192, 0.62)";
  context.fillStyle = "rgba(232, 220, 192, 0.82)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(compassX, compassY - 8);
  context.lineTo(compassX - 3, compassY + 2);
  context.lineTo(compassX, compassY);
  context.lineTo(compassX + 3, compassY + 2);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(compassX, compassY + 8);
  context.lineTo(compassX - 2, compassY - 1);
  context.lineTo(compassX + 2, compassY - 1);
  context.closePath();
  context.stroke();
  context.font = "600 8px IBM Plex Mono, monospace";
  context.textAlign = "center";
  context.fillText("N", compassX, compassY - 10);
}

const staticLayerCache = new Map<number, HTMLCanvasElement>();

function staticLayer(size: number): HTMLCanvasElement | undefined {
  const cached = staticLayerCache.get(size);
  if (cached !== undefined) return cached;
  const layer = createLayer(size);
  if (layer === undefined) return undefined;
  paintStaticLayer(layer[1], size);
  staticLayerCache.set(size, layer[0]);
  return layer[0];
}

const territoryCache = new Map<number, { key: string; layer: HTMLCanvasElement }>();

/** Blocky 18×18 zone fill. Cached per size; the key changes only when ownership or the team palette does. */
function territoryLayer(size: number, owners: readonly Team[], teamOt: string, teamBz: string): HTMLCanvasElement | undefined {
  const key = `${owners.join(",")}|${teamOt}|${teamBz}`;
  const cached = territoryCache.get(size);
  if (cached !== undefined && cached.key === key) return cached.layer;
  const created = createLayer(size);
  if (created === undefined) return undefined;
  const [layer, context] = created;
  const cellPx = (size - PAD * 2) / ZONE_GRID_CELLS;
  const ot = hexToRgb(teamOt);
  const bz = hexToRgb(teamBz);
  for (let cellZ = 0; cellZ < ZONE_GRID_CELLS; cellZ += 1) {
    for (let cellX = 0; cellX < ZONE_GRID_CELLS; cellX += 1) {
      const worldX = -EXTENT + (cellX + 0.5) * ZONE_GRID_CELL_SIZE;
      const worldZ = -EXTENT + (cellZ + 0.5) * ZONE_GRID_CELL_SIZE;
      const owner = zoneOwnerForPosition(worldX, worldZ, owners);
      if (owner === Team.None) continue;
      const [r, g, b] = owner === Team.Ottoman ? ot : bz;
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${TERRITORY_ALPHA})`;
      // +1px overlap avoids hairline seams between cells after downscaling.
      context.fillRect(PAD + cellX * cellPx, PAD + cellZ * cellPx, cellPx + 1, cellPx + 1);
    }
  }
  territoryCache.set(size, { key, layer });
  return layer;
}

type PointGlyph = "fort" | "hillfort" | "building";

/** Capture-point markers distinguished by type: core gate/harbor → fort, hill forts → hill + keep, inner city → building. */
function glyphFor(pointId: string): PointGlyph {
  if (pointId.startsWith("HILL_FORT")) return "hillfort";
  if (pointId === "INNER_CITY") return "building";
  return "fort";
}

function traceFort(context: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  context.moveTo(cx - s, cy + s);
  context.lineTo(cx - s, cy - s * 0.35);
  context.lineTo(cx - s * 0.6, cy - s * 0.35);
  context.lineTo(cx - s * 0.6, cy - s);
  context.lineTo(cx - s * 0.2, cy - s);
  context.lineTo(cx - s * 0.2, cy - s * 0.35);
  context.lineTo(cx + s * 0.2, cy - s * 0.35);
  context.lineTo(cx + s * 0.2, cy - s);
  context.lineTo(cx + s * 0.6, cy - s);
  context.lineTo(cx + s * 0.6, cy - s * 0.35);
  context.lineTo(cx + s, cy - s * 0.35);
  context.lineTo(cx + s, cy + s);
  context.closePath();
}

function traceGlyph(context: CanvasRenderingContext2D, glyph: PointGlyph, cx: number, cy: number): void {
  context.beginPath();
  if (glyph === "fort") {
    traceFort(context, cx, cy, 4.2);
  } else if (glyph === "building") {
    context.moveTo(cx - 4, cy + 3.8);
    context.lineTo(cx - 4, cy - 0.4);
    context.lineTo(cx, cy - 4.2);
    context.lineTo(cx + 4, cy - 0.4);
    context.lineTo(cx + 4, cy + 3.8);
    context.closePath();
  } else {
    // hill with a small keep at its apex
    context.moveTo(cx - 5.4, cy + 4);
    context.lineTo(cx, cy - 4.4);
    context.lineTo(cx + 5.4, cy + 4);
    context.closePath();
    traceFort(context, cx, cy - 1.4, 2.2);
  }
}

interface Props {
  points: readonly { owner: Team; progress: number }[];
  occupancy: readonly number[];
  walls: readonly WallState[];
  /** Per-segment wall HP in sixteenths (0–16) — drives continuous strip color. */
  wallHp: readonly number[];
  /** Freshest combat cluster snapped to an objective glyph (contested-front pulse). */
  hotspot?: { x: number; z: number } | null;
  blips: readonly MinimapBlip[];
  selfX: number;
  selfZ: number;
  selfYaw: number;
  team: Team;
  /** Squad entity ids (Phase 8c-7) — squad blips render in the squad token with a ring. */
  squadEntityIds?: ReadonlySet<number>;
  /** Canvas edge length in px (default 224 — the HUD corner map). */
  size?: number;
  /** False hides the HUD chrome (map gauge + legend) — the death screen supplies its own. */
  chrome?: boolean;
}

/** Map-control proportion bar: Ottoman from the left, Byzantine from the right, neutral desaturated in the middle. */
function MapGauge({ points }: { points: Props["points"] }): React.JSX.Element {
  const owners = CAPTURE_POINTS.map((_, index) => points[index]?.owner ?? Team.None);
  const counts = teamPointCounts(owners);
  return (
    <div className="map-gauge" title={`Map control — Ottoman ${counts.ottoman}, neutral ${counts.neutral}, Byzantine ${counts.byzantine} of ${owners.length}`}>
      <div className="map-gauge-bar">
        <span className="ot" style={{ flexGrow: counts.ottoman, flexBasis: 0 }} />
        <span className="none" style={{ flexGrow: counts.neutral, flexBasis: 0 }} />
        <span className="bz" style={{ flexGrow: counts.byzantine, flexBasis: 0 }} />
      </div>
      <span className="map-gauge-count">{counts.ottoman} · {owners.length} · {counts.byzantine}</span>
    </div>
  );
}

export function Minimap(props: Props): React.JSX.Element {
  const size = props.size ?? MINIMAP_DEFAULT_SIZE;
  const chrome = props.chrome ?? true;
  const chartStyle = { "--minimap-size": `${size}px` } as CSSProperties;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  // Per-point ownership fill tween state (rgb channels), keyed by point index.
  const fills = useRef(new Map<number, [number, number, number, number]>());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    let paletteAt = 0;
    let teamOtCss = "#e0695c";
    let teamBzCss = "#9a7bd8";
    let teamOt: [number, number, number] = [224, 105, 92];
    let teamBz: [number, number, number] = [154, 123, 216];
    let squadRgb: [number, number, number] = [99, 224, 122];
    let raf = 0;

    const draw = (now: number): void => {
      const { points, occupancy, walls, wallHp, hotspot, blips, selfX, selfZ, selfYaw, team, squadEntityIds } = latest.current;
      const viewport: MinimapViewport = chrome
        ? hudMinimapViewport(selfX, selfZ)
        : { centerX: 0, centerZ: 0, halfExtent: EXTENT };
      const scale = (size - PAD * 2) / (viewport.halfExtent * 2);
      const wtm = (x: number, z: number): [number, number] => worldToViewportMap(size, viewport, x, z);
      if (now >= paletteAt) {
        paletteAt = now + 500;
        teamOtCss = cssVar("--team-ot", "#e0695c");
        teamBzCss = cssVar("--team-bz", "#9a7bd8");
        teamOt = hexToRgb(teamOtCss);
        teamBz = hexToRgb(teamBzCss);
        squadRgb = hexToRgb(cssVar("--team-squad", "#63e07a"));
      }
      const teamColor = (side: Team): [number, number, number] => (side === Team.Ottoman ? teamOt : teamBz);

      context.clearRect(0, 0, size, size);
      context.fillStyle = "#22271b";
      context.fillRect(PAD, PAD, size - PAD * 2, size - PAD * 2);
      context.save();
      context.beginPath();
      context.rect(PAD, PAD, size - PAD * 2, size - PAD * 2);
      context.clip();

      // Static cartography and territory stay cached as a full-world chart.
      // A canvas transform crops that cached layer into the moving HUD viewport,
      // preserving the one-time render cost on potato hardware.
      const zoom = EXTENT / viewport.halfExtent;
      const [baseCenterX, baseCenterY] = worldToMapSized(size, viewport.centerX, viewport.centerZ);
      context.save();
      context.translate(size / 2, size / 2);
      context.scale(zoom, zoom);
      context.translate(-baseCenterX, -baseCenterY);
      const base = staticLayer(size);
      if (base !== undefined) context.drawImage(base, 0, 0, base.width, base.height, 0, 0, size, size);
      const owners = CAPTURE_POINTS.map((_, index) => points[index]?.owner ?? Team.None);
      const zones = territoryLayer(size, owners, teamOtCss, teamBzCss);
      if (zones !== undefined) context.drawImage(zones, 0, 0, zones.width, zones.height, 0, 0, size, size);
      context.restore();

      // live wall-state strips (walls change during a war — never part of the static prerender).
      // Color is continuous in hpFrac (siege loop §2.2): intact stone shifts
      // toward amber as the segment weakens; a breach flips to gold.
      for (const segment of WALL_SEGMENTS) {
        const state = walls[segment.id] ?? WallState.Intact;
        const [wx, wy] = wtm(segment.box.x - segment.box.width / 2, segment.box.z - 2);
        if (state === WallState.Breached) {
          context.fillStyle = "#d5b554";
        } else {
          const weak = 1 - Math.min(16, Math.max(0, wallHp[segment.id] ?? 16)) / 16;
          const r = Math.round(139 + (214 - 139) * weak);
          const g = Math.round(135 + (158 - 135) * weak);
          const b = Math.round(125 + (74 - 125) * weak);
          context.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }
        context.fillRect(wx, wy, Math.max(2, segment.box.width * scale), 3);
      }

      // capture points: density blob, typed glyph with tweened ownership fill, contest pulse
      for (let index = 0; index < CAPTURE_POINTS.length; index += 1) {
        const point = CAPTURE_POINTS[index];
        if (point === undefined) continue;
        const state = points[index];
        const owner = state?.owner ?? Team.None;
        const contested = owner === Team.None && (state?.progress ?? 0) !== 0;
        const density = occupancy[index] ?? 0;
        const [cx, cy] = wtm(point.x, point.z);
        const radius = 7;

        if (density > 0) {
          const blob = context.createRadialGradient(cx, cy, 1, cx, cy, radius * 2.4);
          const blobAlpha = Math.min(0.5, 0.12 + density / 24);
          blob.addColorStop(0, `rgba(244, 224, 178, ${blobAlpha.toFixed(3)})`);
          blob.addColorStop(1, "rgba(244, 224, 178, 0)");
          context.fillStyle = blob;
          context.beginPath();
          context.arc(cx, cy, radius * 2.4, 0, Math.PI * 2);
          context.fill();
        }

        const target: [number, number, number, number] = owner !== Team.None
          ? [...teamColor(owner), 0.9]
          : contested ? [244, 213, 141, 0.8] : [139, 135, 125, 0.45];
        const current = fills.current.get(index) ?? target;
        const blend = 0.16;
        const next: [number, number, number, number] = [
          current[0] + (target[0] - current[0]) * blend,
          current[1] + (target[1] - current[1]) * blend,
          current[2] + (target[2] - current[2]) * blend,
          current[3] + (target[3] - current[3]) * blend,
        ];
        fills.current.set(index, next);

        context.fillStyle = `rgba(${Math.round(next[0])}, ${Math.round(next[1])}, ${Math.round(next[2])}, ${next[3].toFixed(3)})`;
        traceGlyph(context, glyphFor(point.id), cx, cy);
        context.fill();
        context.strokeStyle = "rgba(10, 12, 9, 0.7)";
        context.lineWidth = 1.2;
        context.stroke();
        if (contested) {
          const pulse = 0.45 + 0.4 * Math.sin(now / 180);
          context.strokeStyle = `rgba(244, 213, 141, ${pulse.toFixed(3)})`;
          context.lineWidth = 1.6;
          context.beginPath();
          context.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
          context.stroke();
        }
      }

      // contested-front pulse (siege loop §3.2): the objective glyph nearest
      // the freshest combat cluster gets the same pulse treatment as a
      // contested point, so a freshly spawned player sees where the war is.
      if (hotspot !== undefined && hotspot !== null) {
        const [hx, hy] = wtm(hotspot.x, hotspot.z);
        const pulse = 0.45 + 0.4 * Math.sin(now / 180);
        context.strokeStyle = `rgba(244, 213, 141, ${pulse.toFixed(3)})`;
        context.lineWidth = 1.6;
        context.beginPath();
        context.arc(hx, hy, 9.5, 0, Math.PI * 2);
        context.stroke();
      }

      // entity blips — teammates round, enemies diamond (silhouette first);
      // squad members render in the squad token with a ring so they stay
      // legible over the team-colour territory fill (Phase 8c-7).
      for (const blip of blips) {
        const [bx, by] = wtm(blip.x, blip.z);
        const friendly = blip.team === team;
        const inSquad = squadEntityIds !== undefined && squadEntityIds.has(blip.entityId);
        const [r, g, b] = inSquad ? squadRgb : teamColor(blip.team);
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${friendly ? 0.95 : 0.85})`;
        if (blip.artillery) {
          // A small heraldic gun silhouette keeps artillery distinct from both
          // troop diamonds and the long galley bars without adding a legend.
          context.save();
          context.translate(bx, by);
          context.rotate(Math.PI / 4);
          context.fillRect(-3.6, -1.2, 7.2, 2.4);
          context.beginPath();
          context.arc(-2.6, 2.2, 2.1, 0, Math.PI * 2);
          context.arc(2.6, 2.2, 2.1, 0, Math.PI * 2);
          context.fill();
          context.restore();
          continue;
        }
        if (blip.ship) {
          context.fillRect(bx - 3, by - 1.6, 6, 3.2);
          if (inSquad) {
            context.strokeStyle = "rgba(255,255,255,0.9)";
            context.strokeRect(bx - 4, by - 2.6, 8, 5.2);
          }
          continue;
        }
        if (inSquad) {
          context.beginPath();
          context.arc(bx, by, 3.4, 0, Math.PI * 2);
          context.strokeStyle = "rgba(255,255,255,0.9)";
          context.lineWidth = 1;
          context.stroke();
          context.beginPath();
          context.arc(bx, by, 2.4, 0, Math.PI * 2);
          context.fill();
        } else if (friendly) {
          context.beginPath();
          context.arc(bx, by, 2.4, 0, Math.PI * 2);
          context.fill();
        } else {
          context.beginPath();
          context.moveTo(bx, by - 3);
          context.lineTo(bx + 3, by);
          context.lineTo(bx, by + 3);
          context.lineTo(bx - 3, by);
          context.closePath();
          context.fill();
        }
      }

      // self: bright chevron facing the camera yaw
      const [sx, sy] = wtm(selfX, selfZ);
      const angle = Math.atan2(-Math.cos(selfYaw), -Math.sin(selfYaw));
      context.save();
      context.translate(sx, sy);
      context.rotate(angle);
      context.strokeStyle = "rgba(255, 255, 255, 0.28)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, -4);
      context.lineTo(0, -13);
      context.stroke();
      context.fillStyle = "#ffffff";
      context.strokeStyle = "rgba(10, 12, 9, 0.8)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(5.5, 0);
      context.lineTo(-3.5, -3.4);
      context.lineTo(-1.6, 0);
      context.lineTo(-3.5, 3.4);
      context.closePath();
      context.fill();
      context.stroke();
      context.restore();

      context.restore();
      paintMapFrame(context, size);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [chrome, size]);

  return (
    <div className={`minimap ${chrome ? "minimap-hud hud-panel" : "minimap-full"}`} style={chartStyle}>
      {chrome && (
        <div className="minimap-head">
          <b>GOLDEN HORN · N ↑</b>
          <span className="minimap-toggle"><kbd>M</kbd> MAP</span>
        </div>
      )}
      <canvas ref={canvasRef} width={size} height={size} aria-label="Siege minimap" />
      {chrome && <MapGauge points={props.points} />}
      {chrome && (
        <div className="minimap-key" aria-label="Map symbols">
          {MINIMAP_LEGEND.map((item) => <span key={item.key}><i className={`map-key-symbol ${item.key}`} aria-hidden="true" />{item.label}</span>)}
        </div>
      )}
    </div>
  );
}
