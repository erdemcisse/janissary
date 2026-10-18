import type { CollisionResult, MovementState } from "@janissary/shared";

/** Apply a shared sweep result exactly as the authoritative server does. */
export function applyPredictionCollision(
  next: MovementState,
  collision: Readonly<CollisionResult>,
  predictedY: number,
): MovementState {
  next.x = collision.x;
  next.y = collision.y;
  next.z = collision.z;
  next.grounded = collision.grounded;
  // A step-up may raise the capsule before the grounded classification settles;
  // retaining downward velocity here diverges from server movement next tick.
  if (collision.grounded || collision.y > predictedY + 0.001) next.velocityY = 0;
  return next;
}
