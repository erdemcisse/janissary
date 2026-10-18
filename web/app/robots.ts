import type { MetadataRoute } from "next";

// Required for static export: these metadata routes are generated at build time.
export const dynamic = "force-static";
import { SITE_ORIGIN } from "../lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
