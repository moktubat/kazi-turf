import type { MetadataRoute } from "next";
import { site } from "@/data/site";

// The public, indexable pages. Sign-in, account and staff pages are deliberately left out.
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${site.url}/`, changeFrequency: "weekly", priority: 1 },
        { url: `${site.url}/book`, changeFrequency: "daily", priority: 0.9 },
        { url: `${site.url}/legal`, changeFrequency: "monthly", priority: 0.3 },
    ];
}
