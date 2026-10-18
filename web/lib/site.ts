/** Shared site identity. The production origin must be the real domain — set
 * NEXT_PUBLIC_SITE_ORIGIN at build time (see docs/launch/LAUNCH-CHECKLIST.md).
 * The placeholder keeps canonicals/OG absolute-URL-correct during local work. */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://janissary.example";
export const SITE_NAME = "Janissary";
export const SITE_DESCRIPTION =
  "Play Janissary, a free browser FPS set during the 1453 siege of Constantinople. Multiplayer cannons, cavalry, and galleys — no download.";
export const SITE_URL = `${SITE_ORIGIN}/`;

export const PLAY_URL = `${SITE_ORIGIN}/play`;
