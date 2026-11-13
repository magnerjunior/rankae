import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/legal/termos", "/legal/privacidade", "/legal/cookies", "/legal/direitos"].map((path) => ({ url: new URL(path, siteUrl).href }));
}
