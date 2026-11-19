// Google Tag Manager / Google Analytics 4: the ONE place the IDs are read.
// See docs/google-analytics-4.md.
//
// - NEXT_PUBLIC_GTM_ID: the Google Tag Manager container. Defaults to the venue's
//   container (below); set it to another GTM-XXXXXXX to change it, or to an empty value
//   to turn GTM off. GA4 then runs as a tag inside the container (configured in GTM).
// - NEXT_PUBLIC_GA_ID: a GA4 Measurement ID loaded directly with gtag.js. Used ONLY when
//   no GTM container is set — loading both would count every page view twice.
//
// NEXT_PUBLIC_ variables are inlined at build time, so this works in server and client
// code alike (the root layout and proxy.ts's Content-Security-Policy both use it).

/** Kazi Sports Arena's Google Tag Manager container (supplied by the owner). Public by design. */
export const DEFAULT_GTM_ID = "GTM-M59FHC4F";

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,12}$/;

const clean = (raw: string | undefined | null) => raw?.trim().toUpperCase() ?? "";

/** A valid GA4 Measurement ID, or null when unset or malformed (never loads a broken tag). */
export function parseGaId(raw: string | undefined | null): string | null {
    const id = clean(raw);
    return GA_ID_PATTERN.test(id) ? id : null;
}

/** A valid GTM container ID, or null when malformed or switched off with an empty value. */
export function parseGtmId(raw: string | undefined | null): string | null {
    const id = clean(raw);
    return GTM_ID_PATTERN.test(id) ? id : null;
}

/** Unset = the venue's default container; set (even to "") = exactly that value. */
export const GTM_CONTAINER_ID: string | null = parseGtmId(process.env.NEXT_PUBLIC_GTM_ID ?? DEFAULT_GTM_ID);

/** Direct gtag.js only when there is no GTM container (GTM loads GA4 itself). */
export const GA_MEASUREMENT_ID: string | null = GTM_CONTAINER_ID ? null : parseGaId(process.env.NEXT_PUBLIC_GA_ID);

export const ANALYTICS_ENABLED = !!(GTM_CONTAINER_ID || GA_MEASUREMENT_ID);

/**
 * Hosts the Google tag / Tag Manager need, per Google's CSP guidance:
 * https://developers.google.com/tag-platform/security/guides/csp
 * Includes GA4 with Google signals (*.g.doubleclick.net, *.google.com) and GTM's
 * Preview / Tag Assistant mode (tagmanager.google.com, gstatic), used to debug tags.
 */
export const GA_CSP = {
    script: ["https://*.googletagmanager.com", "https://tagmanager.google.com"],
    style: ["https://tagmanager.google.com"],
    img: [
        "https://*.google-analytics.com", "https://*.googletagmanager.com", "https://*.g.doubleclick.net",
        "https://*.google.com", "https://ssl.gstatic.com", "https://www.gstatic.com",
    ],
    connect: [
        "https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com",
        "https://*.g.doubleclick.net", "https://*.google.com",
    ],
    frame: ["https://www.googletagmanager.com"],
} as const;
