import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://waystation.world";
  return [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/chronicle`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/visit`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/charter`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
