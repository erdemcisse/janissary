export function defaultServerUrl(): string {
  const configured = import.meta.env.VITE_GAME_URL as string | undefined;
  if (configured !== undefined) return configured;
  // Vite's dev server hops to the next free port (5174, 5175, ...) whenever 5173 is
  // already taken (e.g. a stale process from a previous run), so hardcoding "5173"
  // silently misroutes every WS/HTTP call at the client itself instead of the game
  // server on any dev session that didn't land on exactly 5173. Use import.meta.env.DEV
  // instead, which Vite sets for every dev-mode session regardless of the port it bound.
  if (import.meta.env.DEV) return `ws://${window.location.hostname}:9001`;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
}

export function httpServerUrl(): string {
  const url = defaultServerUrl();
  // "wss:" is 4 characters, "ws:" is 3 - slicing a fixed 4 off a plain "ws://" URL
  // drops one of the two slashes and silently turns every request into a broken
  // page-relative path (e.g. "http:/localhost:9001/..." -> resolved against the
  // Vite dev origin, 404 with an empty body). Strip exactly the scheme length.
  return url.startsWith("wss:") ? `https:${url.slice(4)}` : `http:${url.slice(3)}`;
}
