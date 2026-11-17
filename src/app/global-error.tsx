"use client"; // Error boundaries must be Client Components

// Shown when the ROOT layout fails (e.g. the database is unreachable while the header loads
// the signed-in user). app/error.tsx cannot catch that, because it sits inside the layout.
// This file replaces the whole document, so it brings its own <html>, <body> and styles:
// global CSS and fonts are not loaded here. Same wording and reference as app/error.tsx.
// No error details reach the browser; the digest matches the entry in the server log.

const C = { evergreen: "#013220", teal: "#0b6e4f", canvas: "#e8f3ee", mint: "#d1f2eb", white: "#ffffff" };
const font = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const button: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "0 24px",
    borderRadius: 12,
    fontFamily: font,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
};

function referenceOf(error: unknown): string {
    return error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
}

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
    const digest = referenceOf(error);
    return (
        <html lang="en">
            <body style={{ margin: 0, background: C.canvas, color: C.evergreen, fontFamily: font, lineHeight: 1.6 }}>
                <title>Something went wrong · Kazi Sports Arena</title>
                {/* This page replaces the root layout, so its metadata (and favicon link) is not applied. */}
                <link rel="icon" href="/favicon.ico" sizes="32x32" type="image/x-icon" />
                <link rel="apple-touch-icon" href="/sports/logo2.png" />
                <main
                    style={{
                        boxSizing: "border-box",
                        minHeight: "100vh",
                        maxWidth: 448,
                        margin: "0 auto",
                        padding: "0 16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                    }}
                >
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                        Kazi <span style={{ color: C.teal }}>Sports Arena</span>
                    </p>
                    <h1 style={{ margin: "16px 0 0", fontSize: 24, lineHeight: 1.2 }}>Something went wrong</h1>
                    <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.7 }}>
                        This page couldn&apos;t load right now. Please try again in a moment.
                    </p>
                    {digest && <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.6, userSelect: "all" }}>Reference: {digest}</p>}
                    <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                        <button type="button" onClick={() => retry()} style={{ ...button, border: 0, background: C.teal, color: C.white }}>
                            Try again
                        </button>
                        {/* A full page load on purpose: the root layout just failed, so a client-side
                            <Link> navigation would go through the same broken layout. */}
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                        <a href="/" style={{ ...button, border: `2px solid ${C.teal}`, color: C.teal, background: "transparent" }}>
                            Back to Home
                        </a>
                    </div>
                </main>
            </body>
        </html>
    );
}
