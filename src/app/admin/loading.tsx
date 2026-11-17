// Every admin page is dynamic (it checks the session), so without a loading state a tap on a nav
// tab showed nothing until the server had rendered the whole page. This skeleton is prefetched
// and shown immediately while the next page renders (Next.js: "Dynamic routes without loading.tsx").
export default function AdminLoading() {
    return (
        <div role="status" aria-busy aria-label="Loading page" className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <div aria-hidden className="h-9 w-48 animate-pulse rounded-lg bg-evergreen/10" />
            <div aria-hidden className="h-32 animate-pulse rounded-2xl bg-evergreen/10" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} aria-hidden className="h-24 animate-pulse rounded-2xl bg-evergreen/10" />
                ))}
            </div>
            <div aria-hidden className="h-64 animate-pulse rounded-2xl bg-evergreen/10" />
        </div>
    );
}
