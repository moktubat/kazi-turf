import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";

/**
 * Google Analytics 4 via the Google tag (gtag.js), loaded once from the root layout
 * after the page becomes interactive — the same approach as Next.js's own
 * @next/third-parties GoogleAnalytics component, without the extra dependency.
 *
 * Page views, without duplicates:
 *  - The first page load is counted by `gtag('config', …)`.
 *  - Every client-side route change (Next.js <Link>, router.push) goes through the
 *    browser History API, which GA4's Enhanced measurement option "Page changes based
 *    on browser history events" (on by default) counts as a page_view.
 * This component therefore never sends page_view itself: doing so as well would count
 * each navigation twice.
 *
 * Renders nothing when NEXT_PUBLIC_GA_ID is not set.
 */
export function GoogleAnalytics() {
    const id = GA_MEASUREMENT_ID;
    if (!id) return null;
    return (
        <>
            <Script id="ga4-src" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
                {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});`}
            </Script>
        </>
    );
}
