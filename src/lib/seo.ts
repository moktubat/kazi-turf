// One place for page metadata and structured data, so titles, descriptions, canonical URLs and
// social previews stay consistent. Uses only business facts from data/site (owner-supplied).
import type { Metadata } from "next";
import { site } from "@/data/site";

/** Logo used for social previews. Declared at its real size (500×500), so a square "summary" card. */
export const SHARE_IMAGE = { url: "/sports/logo2.png", width: 500, height: 500, alt: `${site.name} logo` };

/** Default <title> and description for pages that do not set their own. */
export const DEFAULT_TITLE = `${site.name} | Indoor Football, Cricket & Badminton in Bogura`;

/**
 * Metadata for one public page: its own title, description, canonical URL and social preview.
 * `path` is the page's path ("/" for home). The title template adds " | Kazi Sports Arena".
 */
export function pageMetadata(p: { path: string; title?: string; description: string }): Metadata {
    const fullTitle = p.title ? `${p.title} | ${site.name}` : DEFAULT_TITLE;
    return {
        ...(p.title ? { title: p.title } : { title: { absolute: DEFAULT_TITLE } }),
        description: p.description,
        alternates: { canonical: p.path },
        openGraph: {
            type: "website",
            locale: "en_US",
            url: p.path,
            siteName: site.name,
            title: fullTitle,
            description: p.description,
            images: [SHARE_IMAGE],
        },
        twitter: { card: "summary", title: fullTitle, description: p.description, images: [SHARE_IMAGE.url] },
    };
}

/** Private pages (sign-in, account, admin): kept out of search results. */
export const NOINDEX: Metadata["robots"] = { index: false, follow: false };

/**
 * schema.org structured data for the venue. Only verified facts: name, contact details, address
 * as supplied (no street number or coordinates invented), 24/7 hours, sports offered and how
 * customers pay (bKash advance online, balance in cash at the venue).
 */
export function businessJsonLd(venue: { name?: string; mapUrl?: string; sports?: string[] }) {
    return {
        "@context": "https://schema.org",
        "@type": "SportsActivityLocation",
        "@id": `${site.url}/#venue`,
        name: site.name,
        alternateName: site.shortName,
        description: site.seoDescription,
        url: site.url,
        logo: `${site.url}${SHARE_IMAGE.url}`,
        image: `${site.url}${SHARE_IMAGE.url}`,
        telephone: site.phone,
        email: site.email,
        address: {
            "@type": "PostalAddress",
            streetAddress: site.address.area,
            addressLocality: site.address.city,
            addressCountry: site.address.countryCode,
        },
        ...(venue.mapUrl ? { hasMap: venue.mapUrl } : {}),
        openingHoursSpecification: [
            {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                opens: "00:00",
                closes: "23:59",
            },
        ],
        ...(venue.sports?.length ? { sport: venue.sports } : {}),
        currenciesAccepted: site.currency,
        paymentAccepted: "bKash, Cash",
    };
}
