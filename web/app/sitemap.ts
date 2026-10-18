import type { MetadataRoute } from "next";

// Required for static export: these metadata routes are generated at build time.
export const dynamic = "force-static";
import { SITE_ORIGIN } from "../lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = SITE_ORIGIN;
  const now = new Date();
  return [
    { url: `${origin}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${origin}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
