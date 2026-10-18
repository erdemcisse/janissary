import {
  EARTHWORK_ENTITY_BASE,
  EARTHWORK_MAX,
  EARTHWORK_MOUND_DEPTH,
  EARTHWORK_MOUND_HEIGHT,
  EARTHWORK_MOUND_WIDTH,
  EARTHWORK_TRENCH_DEPTH,
  EARTHWORK_TRENCH_HEIGHT,
  EARTHWORK_TRENCH_WIDTH,
  EarthworkKind,
  type StaticBox,
} from "@janissary/shared";

export function earthworkEntityId(index: number): number {
  return EARTHWORK_ENTITY_BASE + index;
}

export function isEarthworkEntityId(entityId: number): boolean {
  return entityId >= EARTHWORK_ENTITY_BASE && entityId < EARTHWORK_ENTITY_BASE + EARTHWORK_MAX;
}

export function earthworkIndexForEntityId(entityId: number): number {
  return entityId - EARTHWORK_ENTITY_BASE;
}

/**
 * Collider box for an earthwork, in the same shape terrain-props.ts uses for
 * rocks/trees (id, position, collider). The base sits on the feet plane the
 * player aimed at; mounds are climbable low rises (top 1.2 ≤ MAX_STEP_UP) and
 * trenches are crouch-height cover (top 0.6) that movement steps over.
 */
export function earthworkCollider(index: number, kind: EarthworkKind, x: number, baseY: number, z: number): StaticBox {
  const height = kind === EarthworkKind.Trench ? EARTHWORK_TRENCH_HEIGHT : EARTHWORK_MOUND_HEIGHT;
  const width = kind === EarthworkKind.Trench ? EARTHWORK_TRENCH_WIDTH : EARTHWORK_MOUND_WIDTH;
  const depth = kind === EarthworkKind.Trench ? EARTHWORK_TRENCH_DEPTH : EARTHWORK_MOUND_DEPTH;
  return { id: `earthwork-${index}`, x, y: baseY + height / 2, z, width, height, depth, material: "earth" };
}
