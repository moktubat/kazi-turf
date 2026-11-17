// Insights loads several reports at once; show its outline immediately instead of a blank wait.
export default function InsightsLoading() {
    return (
        <div role="status" aria-busy aria-label="Loading insights" className="mx-auto max-w-main space-y-8 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Insights</h1>
            <div aria-hidden className="h-36 animate-pulse rounded-2xl bg-evergreen/10" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} aria-hidden className="h-28 animate-pulse rounded-2xl bg-evergreen/10" />
                ))}
            </div>
            <div aria-hidden className="h-72 animate-pulse rounded-2xl bg-evergreen/10" />
        </div>
    );
}
