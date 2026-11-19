# Google Tag Manager and Google Analytics 4 (GA4)

The website loads the venue's **Google Tag Manager container `GTM-M59FHC4F`** on every page.
GA4 runs as a tag **inside that container**, so it is set up in Tag Manager, not in the code.

The IDs are read in exactly one place: `src/lib/analytics.ts`.

| Variable             | Default        | Meaning                                                                 |
| -------------------- | -------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_GTM_ID` | `GTM-M59FHC4F` | GTM container. Set another `GTM-…` to switch, or an empty value to turn GTM off. |
| `NEXT_PUBLIC_GA_ID`  | (none)         | Direct GA4 tag (`G-…`). Used **only when GTM is off**, so nothing is counted twice. |

`NEXT_PUBLIC_` values are built into the site: after changing one in Vercel (Project → Settings →
Environment Variables), **redeploy**. `.env*` files are git-ignored and must never be committed.

## 1. Get the GA4 Measurement ID

1. <https://analytics.google.com> → **Admin → Data collection → Data streams** → your web stream
   for `https://kazisports.com` (create one if there is none).
2. Copy the **Measurement ID** (`G-XXXXXXXXXX`).
3. In the same stream, open **Enhanced measurement**: keep it **on**, including
   **"Page changes based on browser history events"** (on by default). This counts page views when
   visitors move between pages of the site.

## 2. Add GA4 inside Tag Manager (required — otherwise GA shows "tag not detected")

1. <https://tagmanager.google.com> → container **GTM-M59FHC4F** → **Tags → New**.
2. Tag type **Google tag**. Tag ID: your `G-XXXXXXXXXX`.
3. Trigger: **Initialization – All Pages**.
4. Save, then **Submit → Publish**. Until the container is *published*, nothing reaches GA4.

Add only **one** GA4 Google tag for that Measurement ID, and do not add a separate "page_view"
event tag — either would double-count page views.

## 3. Check that it works

The code must be deployed first (merged to `main` / live on kazisports.com, or a Vercel preview URL).

1. Tag Manager → **Preview** → enter the site URL. Tag Assistant should show the container loaded
   and the Google tag **fired**.
2. GA4 → **Reports → Realtime**: you should appear within a minute. Clicking between pages should
   add one page view per page.
3. GA4's "Your Google tag wasn't detected" banner clears after it receives data (can take a while).

Ad blockers can block GTM/GA — test in a normal window without them.

## 4. Where to find the reports

| What you want to see            | Where in GA4                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| Real-time visitors              | Reports → **Realtime**                                               |
| Daily active users / visitors   | Reports → **Reports snapshot** or Engagement → **Overview**         |
| Page views per page             | Reports → Engagement → **Pages and screens**                         |
| Traffic sources and referrals   | Reports → Acquisition → **Traffic acquisition**                      |
| Visitor locations and countries | Reports → User → User attributes → **Demographic details**           |
| Devices and browsers            | Reports → Tech → **Tech details**                                    |
| New vs. returning visitors      | Reports → User → **Retention**, or "New / established" in Explore    |

Standard reports can take 24–48 hours to fill in; Realtime is immediate.

## How it is loaded

- `src/components/analytics/GoogleAnalytics.tsx` renders Google's standard GTM snippet
  (`gtm.start` + `gtm.js`) after the page becomes interactive, plus GTM's `<noscript>` iframe at the
  top of `<body>` (`src/app/layout.tsx`).
- The site code never sends `page_view` itself; the first view comes from the Google tag and later
  ones from GA4's history-based Enhanced measurement.
- `src/proxy.ts` (Content-Security-Policy) allows Google's Tag Manager / Analytics hosts — including
  GTM Preview mode and GA4 Google signals — only while GTM or GA4 is on.
- Custom HTML tags added in GTM run under the site's CSP. Tags that load scripts from other
  domains (Facebook Pixel, Hotjar, …) will be blocked until their hosts are added in `src/lib/analytics.ts`.

## Notes

- Staff using `/admin` are counted like any visitor. To exclude the venue's devices, use GA4
  **Admin → Data streams → (stream) → Configure tag settings → Define internal traffic**.
- If the site needs a cookie-consent banner for its audience, Consent Mode can be added in GTM later.
