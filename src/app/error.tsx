"use client"; // Error boundaries must be Client Components

import Link from "next/link";

// Shown when a page fails to render (e.g. the database is briefly unreachable).
// No error details reach the browser: production errors carry only a `digest`,
// which matches the entry in the server log.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
    const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

    return (
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
            <h1 className="font-heading text-2xl font-bold text-evergreen">Something went wrong</h1>
            <p className="mt-2 text-sm text-evergreen/70">
                This page couldn&apos;t load right now. Please try again in a moment.
            </p>
            {digest && <p className="mt-2 text-xs text-evergreen/60">Reference: {digest}</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                    type="button"
                    onClick={() => retry()}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-6 font-heading text-sm font-bold text-white transition-colors hover:bg-evergreen"
                >
                    Try again
                </button>
                <Link
                    href="/"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-teal px-6 font-heading text-sm font-bold text-teal transition-colors hover:bg-mint"
                >
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
