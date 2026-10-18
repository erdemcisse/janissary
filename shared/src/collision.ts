import {
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  GROUND_CONTACT_EPSILON,
  GROUND_SUPPORT_HYSTERESIS,
  MAX_STEP_UP,
} from "./constants";
import { isBridgeRailing, isWallBoxSolid, type StaticBox } from "./map";
import { heightAt } from "./terrain";

export interface CollisionPosition {
  x: number;
  y: number;
  z: number;
}

export interface CollisionState extends CollisionPosition {
  grounded: boolean;
}

export interface CollisionResult extends CollisionPosition {
  grounded: boolean;
}

function inside(value: number, center: number, size: number): boolean {
  return value >= center - size / 2 && value <= center + size / 2;
}

const CAPSULE_HALF_HEIGHT = CAPSULE_HEIGHT / 2;

const EMPTY_EXTRA_BOXES: readonly StaticBox[] = [];

export function sweepCapsuleAgainstBoxes(
  previous: Readonly<CollisionState>,
  proposed: Readonly<CollisionPosition>,
  boxes: readonly StaticBox[],
  wallStates?: Uint8Array,
  ignoreRubble = false,
  extraBoxes: readonly StaticBox[] = EMPTY_EXTRA_BOXES,
  extraCount = extraBoxes.length,
  maximumStepUp = MAX_STEP_UP,
): CollisionResult {
  let x = proposed.x;
  let y = proposed.y;
  let z = proposed.z;
  // Box supports only; the terrain floor is applied after the push-out so it
  // samples the heightfield at the resolved position (Phase 8e-11).
  let boxFloor = -Infinity;
  const baseCount = boxes.length;
  for (let index = 0; index < baseCount + extraCount; index += 1) {
    const box = index < baseCount ? boxes[index] : extraBoxes[index - baseCount];
    if (box === undefined) continue;
    if (ignoreRubble && box.id.startsWith("rubble-segment-")) continue;
    if (!isWallBoxSolid(box, wallStates)) continue;
    const top = box.y + box.height / 2;
    const restY = top + CAPSULE_HALF_HEIGHT;
    const wasSupported = previous.grounded && Math.abs(previous.y - restY) <= GROUND_CONTACT_EPSILON;
    const supportMargin = CAPSULE_RADIUS + (wasSupported ? GROUND_SUPPORT_HYSTERESIS : 0);
    const withinX = inside(x, box.x, box.width + supportMargin * 2);
    const withinZ = inside(z, box.z, box.depth + supportMargin * 2);
    // Floor support is feet-based so a player standing on a box keeps its
    // support instead of toggling off every other tick and bouncing. An
    // obstacle taller than the caller's step-up limit still behaves as a wall.
    const previousFeet = previous.y - CAPSULE_HALF_HEIGHT;
    const feet = y - CAPSULE_HALF_HEIGHT;
    if (!isBridgeRailing(box) && withinX && withinZ && previousFeet >= top - maximumStepUp && feet >= top - maximumStepUp) {
      boxFloor = Math.max(boxFloor, restY);
      continue;
    }
    const bodyBottom = y - CAPSULE_HALF_HEIGHT;
    const bodyTop = y + CAPSULE_HALF_HEIGHT;
    if (bodyTop < box.y - box.height / 2 || bodyBottom > top || !withinX || !withinZ) continue;
    const minX = box.x - box.width / 2 - CAPSULE_RADIUS;
    const maxX = box.x + box.width / 2 + CAPSULE_RADIUS;
    const minZ = box.z - box.depth / 2 - CAPSULE_RADIUS;
    const maxZ = box.z + box.depth / 2 + CAPSULE_RADIUS;
    const pushX = Math.min(Math.abs(x - minX), Math.abs(maxX - x));
    const pushZ = Math.min(Math.abs(z - minZ), Math.abs(maxZ - z));
    if (pushX < pushZ) x = x < box.x ? minX : maxX;
    else z = z < box.z ? minZ : maxZ;
  }
  const floor = Math.max(boxFloor, heightAt(x, z) + CAPSULE_HALF_HEIGHT);
  const resolvedY = Math.max(y, floor);
  const ascending = proposed.y > previous.y + GROUND_CONTACT_EPSILON;
  return {
    x,
    y: resolvedY,
    z,
    grounded: !ascending && resolvedY <= floor + GROUND_CONTACT_EPSILON,
  };
}

export function raycastBoxes(
  origin: Readonly<CollisionPosition>,
  direction: Readonly<CollisionPosition>,
  maximumDistance: number,
  boxes: readonly StaticBox[],
  wallStates?: Uint8Array,
  extraBoxes: readonly StaticBox[] = EMPTY_EXTRA_BOXES,
  extraCount = extraBoxes.length,
): number | undefined {
  let nearest: number | undefined;
  const baseCount = boxes.length;
  for (let index = 0; index < baseCount + extraCount; index += 1) {
    const box = index < baseCount ? boxes[index] : extraBoxes[index - baseCount];
    if (box === undefined) continue;
    if (!isWallBoxSolid(box, wallStates)) continue;
    const minX = box.x - box.width / 2;
    const maxX = box.x + box.width / 2;
    const minY = box.y - box.height / 2;
    const maxY = box.y + box.height / 2;
    const minZ = box.z - box.depth / 2;
    const maxZ = box.z + box.depth / 2;
    let start = 0;
    let end = maximumDistance;
    for (const [from, delta, min, max] of [[origin.x, direction.x, minX, maxX], [origin.y, direction.y, minY, maxY], [origin.z, direction.z, minZ, maxZ]] as const) {
      if (Math.abs(delta) < 0.000001) {
        if (from < min || from > max) { start = 1; end = 0; break; }
        continue;
      }
      const inverse = 1 / delta;
      const first = (min - from) * inverse;
      const second = (max - from) * inverse;
      start = Math.max(start, Math.min(first, second));
      end = Math.min(end, Math.max(first, second));
    }
    if (start <= end && start >= 0 && start <= maximumDistance && (nearest === undefined || start < nearest)) nearest = start;
  }
  return nearest;
}
