// Google Analytics 4: the ONE place the Measurement ID is read. Set NEXT_PUBLIC_GA_ID
// (e.g. G-ABC123XYZ9) in the hosting environment and rebuild; leave it unset and no
// analytics code is loaded at all. See docs/google-analytics-4.md.
//
// NEXT_PUBLIC_ variables are inlined at build time, so this works in server and client
// code alike (the root layout and proxy.ts's Content-Security-Policy both use it).

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/** A valid GA4 Measurement ID, or null when unset or malformed (never loads a broken tag). */
export function parseGaId(raw: string | undefined | null): string | null {
    const id = raw?.trim().toUpperCase();
    return id && GA_ID_PATTERN.test(id) ? id : null;
}

export const GA_MEASUREMENT_ID: string | null = parseGaId(process.env.NEXT_PUBLIC_GA_ID);

/**
 * Hosts the Google tag needs, per Google's CSP guidance for GA4:
 * https://developers.google.com/tag-platform/security/guides/csp
 */
export const GA_CSP = {
    script: ["https://*.googletagmanager.com"],
    img: ["https://*.google-analytics.com", "https://*.googletagmanager.com"],
    connect: ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
} as const;
