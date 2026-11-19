import Script from "next/script";
import { GA_MEASUREMENT_ID, GTM_CONTAINER_ID } from "@/lib/analytics";

/**
 * Google Tag Manager (preferred) or Google Analytics 4 via gtag.js, loaded once from the
 * root layout after the page becomes interactive. IDs come from lib/analytics.
 *
 * GTM: Google's standard container snippet (`gtm.start` + gtm.js). GA4 is a "Google tag"
 * inside the container, fired on "Initialization – All Pages". The direct gtag.js tag is
 * then NOT loaded, so nothing is counted twice.
 *
 * Page views, without duplicates:
 *  - The first page load is counted by the GA4 Google tag (GTM) / `gtag('config', …)`.
 *  - Every client-side route change (Next.js <Link>, router.push) goes through the
 *    browser History API, which GA4's Enhanced measurement option "Page changes based
 *    on browser history events" (on by default) counts as a page_view.
 * This component therefore never sends page_view itself.
 */
export function GoogleAnalytics() {
    const gtm = GTM_CONTAINER_ID;
    if (gtm) {
        return (
            <Script id="gtm-init" strategy="afterInteractive">
                {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtm)});`}
            </Script>
        );
    }
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

/** GTM's <noscript> fallback; goes right after <body> opens. Nothing when GTM is off. */
export function GoogleTagManagerNoScript() {
    const gtm = GTM_CONTAINER_ID;
    if (!gtm) return null;
    return (
        <noscript>
            <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtm)}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
                title="Google Tag Manager"
            />
        </noscript>
    );
}
