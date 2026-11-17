// Shown at once when navigating to Customers, while the list renders on the server.
export default function CustomersLoading({ bare = false }: { bare?: boolean }) {
    const body = (
        <div role="status" aria-busy aria-label="Loading customers" className="space-y-5">
            <div aria-hidden className="h-40 animate-pulse rounded-2xl bg-evergreen/10" />
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} aria-hidden className="h-16 animate-pulse rounded-xl bg-evergreen/10" />
            ))}
        </div>
    );
    if (bare) return body;
    return (
        <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">
            <h1 className="text-2xl font-extrabold md:text-3xl">Customers</h1>
            {body}
        </div>
    );
}
