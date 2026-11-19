// Google Analytics 4: configured only by NEXT_PUBLIC_GA_ID. Without it nothing loads and the
// Content-Security-Policy is unchanged; with it the Google tag loads once (initial page view
// from `config`, route changes from GA4's history-based Enhanced measurement — the component
// itself never sends page_view, so nothing is counted twice) and the CSP allows Google's hosts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { parseGaId } from "@/lib/analytics";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

async function load(gaId: string | undefined) {
    vi.resetModules();
    if (gaId === undefined) vi.stubEnv("NEXT_PUBLIC_GA_ID", "");
    else vi.stubEnv("NEXT_PUBLIC_GA_ID", gaId);
    const { proxy } = await import("@/proxy");
    const { GoogleAnalytics } = await import("@/components/analytics/GoogleAnalytics");
    const { GA_MEASUREMENT_ID } = await import("@/lib/analytics");
    const csp = proxy(new NextRequest("https://kazisports.com/")).headers.get("Content-Security-Policy")!;
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `))!;
    return { GA_MEASUREMENT_ID, directive, html: renderToStaticMarkup(<GoogleAnalytics />) };
}

describe("Measurement ID", () => {
    it("accepts a GA4 ID and normalises case and spaces", () => {
        expect(parseGaId("G-ABC123XYZ9")).toBe("G-ABC123XYZ9");
        expect(parseGaId("  g-abc123xyz9 ")).toBe("G-ABC123XYZ9");
    });

    it.each([undefined, null, "", "UA-12345-1", "G-", "G-abc def", "GTM-ABC123", "G-<script>"])("ignores %j", (raw) => {
        expect(parseGaId(raw as string | undefined)).toBeNull();
    });
});

describe("without NEXT_PUBLIC_GA_ID", () => {
    it("loads nothing and keeps the CSP closed to Google", async () => {
        const { GA_MEASUREMENT_ID, directive, html } = await load(undefined);
        expect(GA_MEASUREMENT_ID).toBeNull();
        expect(html).toBe("");
        expect(directive("script-src")).not.toContain("googletagmanager");
        expect(directive("connect-src")).not.toContain("google-analytics");
    });
});

describe("with NEXT_PUBLIC_GA_ID", () => {
    it("allows exactly Google's GA4 hosts in the CSP", async () => {
        const { directive } = await load("G-TEST12345");
        expect(directive("script-src")).toContain("https://*.googletagmanager.com");
        expect(directive("img-src")).toContain("https://*.google-analytics.com");
        expect(directive("connect-src")).toContain("https://*.google-analytics.com");
        expect(directive("connect-src")).toContain("https://*.analytics.google.com");
        expect(directive("frame-src")).not.toContain("googletagmanager");
    });

    it("the tag is configured once and never sends page_view itself (no double counting)", async () => {
        const { GA_MEASUREMENT_ID } = await load("G-TEST12345");
        expect(GA_MEASUREMENT_ID).toBe("G-TEST12345");
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync(new URL("../components/analytics/GoogleAnalytics.tsx", import.meta.url), "utf8")
        );
        expect(src).toContain("https://www.googletagmanager.com/gtag/js?id=");
        expect(src.match(/gtag\('config',\$\{JSON\.stringify\(id\)\}\)/g)).toHaveLength(1);
        expect(src).not.toMatch(/['"]event['"]\s*,\s*['"]page_view['"]/);
        expect(src).not.toContain("send_page_view");
    });
});
