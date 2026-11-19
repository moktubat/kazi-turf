# Google Analytics 4 (GA4)

The website has Google Analytics 4 built in. It stays **off** until a Measurement ID is
configured, so nothing is tracked and no Google script loads until you set it up.

## 1. Create the GA4 property (one time)

1. Go to <https://analytics.google.com> and sign in with the Google account that should own the data.
2. **Admin → Create → Property**. Name it (e.g. "Kazi Sports Arena"), time zone **Bangladesh**, currency **BDT**.
3. **Data collection → Data streams → Add stream → Web**.
   - Website URL: `https://kazisports.com`
   - Stream name: e.g. "Website".
4. Open the new stream and copy the **Measurement ID**. It looks like `G-XXXXXXXXXX`.
5. In the same stream, open **Enhanced measurement** and make sure it is **on**, including
   **"Page changes based on browser history events"** (on by default). The site relies on it to
   count page views when visitors move between pages (see "How page views are counted" below).

## 2. Configure the website

Set one environment variable, then rebuild and redeploy:

| Variable            | Example        | Where                                   |
| ------------------- | -------------- | --------------------------------------- |
| `NEXT_PUBLIC_GA_ID` | `G-ABC123XYZ9` | Hosting environment variables (Vercel) |

**Vercel:** Project → **Settings → Environment Variables** → add `NEXT_PUBLIC_GA_ID` for the
**Production** environment → **Redeploy** the latest deployment. `NEXT_PUBLIC_` values are built
into the site, so a redeploy is required after adding or changing it.

**Local development (optional):** add `NEXT_PUBLIC_GA_ID=G-ABC123XYZ9` to `.env.local` and restart
`npm run dev`. `.env*` files are git-ignored and must never be committed.

The ID is read in exactly one place: `src/lib/analytics.ts`. An empty or malformed value (anything
that is not `G-` followed by letters/digits) is ignored and analytics stays off.

To turn analytics off again, delete the variable and redeploy.

## 3. Check that it works

1. Open the live site in a normal browser window (ad blockers can block GA).
2. In GA4 open **Reports → Realtime**. Within a minute you should see yourself as an active user.
3. Click between pages (Home → Book → Legal). Each page should appear once under
   "Views by Page title and screen name".
4. Optional: **Admin → DebugView** with the [Google Analytics Debugger](https://chromewebstore.google.com/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) extension for event-level detail.

## 4. Where to find the reports

All of these are standard GA4 reports and need no extra setup:

| What you want to see                  | Where in GA4                                                         |
| ------------------------------------- | -------------------------------------------------------------------- |
| Real-time visitors                    | Reports → **Realtime**                                               |
| Daily active users / visitors         | Reports → **Reports snapshot** or Engagement → **Overview**         |
| Page views per page                   | Reports → Engagement → **Pages and screens**                         |
| Traffic sources and referrals         | Reports → Acquisition → **Traffic acquisition** (Session source / medium) |
| Visitor locations and countries       | Reports → User → User attributes → **Demographic details** (Country, City) |
| Devices and browsers                  | Reports → Tech → **Tech details** (Device category, Browser)        |
| New vs. returning visitors            | Reports → User → **Retention**, or add the "New / established" dimension in Explore |

Data in standard reports can take 24–48 hours to fill in; Realtime is immediate.

## How page views are counted (no duplicates)

- The Google tag (`gtag.js`) is loaded once from the root layout (`src/app/layout.tsx` →
  `src/components/analytics/GoogleAnalytics.tsx`) after the page becomes interactive, the same way
  Next.js's own `@next/third-parties` component does it.
- The first page load is counted by `gtag('config', …)`.
- Moving between pages in the site uses the browser History API. GA4's Enhanced measurement
  option "Page changes based on browser history events" counts each of those as one page view.
- The site's code never sends a `page_view` event itself, so a navigation is never counted twice.
  **Do not** add a manual `page_view` event or a second GA tag (e.g. via Google Tag Manager) for
  the same Measurement ID, or page views will be doubled.

## Security (Content-Security-Policy)

`src/proxy.ts` only allows Google's analytics hosts (`*.googletagmanager.com`,
`*.google-analytics.com`, `*.analytics.google.com`) when `NEXT_PUBLIC_GA_ID` is set. With no ID,
the policy is exactly as strict as before.

## Notes

- Staff using `/admin` on the public domain are counted like any visitor. To exclude the venue's
  own devices, in GA4 use **Admin → Data streams → (stream) → Configure tag settings → Define
  internal traffic**, then activate the "Internal Traffic" data filter.
- If the site needs a cookie-consent banner for its audience, GA4 Consent Mode can be added later;
  it is not enabled today.
