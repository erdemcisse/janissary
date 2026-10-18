/** @type {import("next").NextConfig} */
const nextConfig = {
  // ADR 0013: the marketing site is a static export served by Caddy at "/"
  // alongside the game client at "/play" — no server runtime needed.
  output: "export",
  // Plain <img> tags are used throughout; no image optimizer dependency.
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
