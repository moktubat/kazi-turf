// Google Tag Manager / Google Analytics 4. GTM is on by default with the venue's container
// (NEXT_PUBLIC_GTM_ID overrides it; an empty value turns it off). A direct GA4 tag
// (NEXT_PUBLIC_GA_ID) is used only without GTM, so page views are never counted twice. The
// Content-Security-Policy opens Google's hosts only when one of them is on.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { DEFAULT_GTM_ID, parseGaId, parseGtmId } from "@/lib/analytics";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

async function load(env: { gtm?: string; ga?: string }) {
    vi.resetModules();
    if (env.gtm !== undefined) vi.stubEnv("NEXT_PUBLIC_GTM_ID", env.gtm);
    else delete process.env.NEXT_PUBLIC_GTM_ID;
    vi.stubEnv("NEXT_PUBLIC_GA_ID", env.ga ?? "");
    const { proxy } = await import("@/proxy");
    const mod = await import("@/components/analytics/GoogleAnalytics");
    const ids = await import("@/lib/analytics");
    const csp = proxy(new NextRequest("https://kazisports.com/")).headers.get("Content-Security-Policy")!;
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))!;
    return { ...ids, directive, noscript: renderToStaticMarkup(<mod.GoogleTagManagerNoScript />), mod };
}

const source = () =>
    import("node:fs").then((fs) => fs.readFileSync(new URL("../components/analytics/GoogleAnalytics.tsx", import.meta.url), "utf8"));

describe("IDs", () => {
    it("accepts GA4 and GTM IDs, normalising case and spaces", () => {
        expect(parseGaId("  g-abc123xyz9 ")).toBe("G-ABC123XYZ9");
        expect(parseGtmId(" gtm-m59fhc4f ")).toBe("GTM-M59FHC4F");
        expect(DEFAULT_GTM_ID).toBe("GTM-M59FHC4F");
    });

    it.each([undefined, null, "", "UA-12345-1", "G-", "G-abc def", "GTM-ABC123", "G-<script>"])("GA4 ignores %j", (raw) => {
        expect(parseGaId(raw as string | undefined)).toBeNull();
    });

    it.each(["", "G-ABC12345", "GTM-", "GTM-<x>", "GTM-ABC 123"])("GTM ignores %j", (raw) => {
        expect(parseGtmId(raw)).toBeNull();
    });
});

describe("default: the venue's GTM container", () => {
    it("loads GTM, not a second direct GA4 tag, and opens the CSP for it", async () => {
        const { GTM_CONTAINER_ID, GA_MEASUREMENT_ID, directive, noscript } = await load({ ga: "G-TEST12345" });
        expect(GTM_CONTAINER_ID).toBe("GTM-M59FHC4F");
        expect(GA_MEASUREMENT_ID).toBeNull(); // GA4 runs inside GTM: never both
        expect(noscript).toContain("https://www.googletagmanager.com/ns.html?id=GTM-M59FHC4F");
        expect(directive("script-src")).toContain("https://*.googletagmanager.com");
        expect(directive("connect-src")).toContain("https://*.google-analytics.com");
        expect(directive("connect-src")).toContain("https://*.analytics.google.com");
        expect(directive("img-src")).toContain("https://*.google-analytics.com");
        expect(directive("frame-src")).toContain("https://www.googletagmanager.com");
    });

    it("uses Google's standard container snippet and never sends page_view itself", async () => {
        const src = await source();
        expect(src).toContain("'gtm.start':new Date().getTime(),event:'gtm.js'");
        expect(src).toContain("https://www.googletagmanager.com/gtm.js?id=");
        expect(src).not.toMatch(/['"]event['"]\s*,\s*['"]page_view['"]/);
        expect(src).not.toContain("send_page_view");
    });

    it("NEXT_PUBLIC_GTM_ID overrides the container", async () => {
        const { GTM_CONTAINER_ID } = await load({ gtm: "GTM-ABCD123" });
        expect(GTM_CONTAINER_ID).toBe("GTM-ABCD123");
    });
});

describe("GTM switched off", () => {
    it("with no GA4 ID either: nothing loads and the CSP stays closed", async () => {
        const { GTM_CONTAINER_ID, GA_MEASUREMENT_ID, directive, noscript } = await load({ gtm: "" });
        expect(GTM_CONTAINER_ID).toBeNull();
        expect(GA_MEASUREMENT_ID).toBeNull();
        expect(noscript).toBe("");
        expect(directive("script-src")).not.toContain("googletagmanager");
        expect(directive("connect-src")).not.toContain("google-analytics");
        expect(directive("frame-src")).not.toContain("googletagmanager");
    });

    it("with a GA4 ID: the direct gtag.js tag is used, configured once", async () => {
        const { GA_MEASUREMENT_ID, directive } = await load({ gtm: "", ga: "G-TEST12345" });
        expect(GA_MEASUREMENT_ID).toBe("G-TEST12345");
        expect(directive("script-src")).toContain("https://*.googletagmanager.com");
        const src = await source();
        expect(src).toContain("https://www.googletagmanager.com/gtag/js?id=");
        expect(src.match(/gtag\('config',\$\{JSON\.stringify\(id\)\}\)/g)).toHaveLength(1);
    });
});
