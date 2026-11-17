import type { MetadataRoute } from "next";
import { site } from "@/data/site";

// Public pages are crawlable. Private areas (staff tools, customer accounts, API, sign-in) are not;
// those pages also send `noindex` themselves.
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/admin", "/account", "/api/", "/login"],
        },
        sitemap: `${site.url}/sitemap.xml`,
        host: site.url,
    };
}
