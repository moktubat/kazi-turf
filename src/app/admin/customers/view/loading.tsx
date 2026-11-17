// Shown at once when opening a customer, while their history renders on the server.
export default function CustomerLoading({ bare = false }: { bare?: boolean }) {
    const body = (
        <div role="status" aria-busy aria-label="Loading customer" className="space-y-5">
            <div aria-hidden className="h-9 w-56 animate-pulse rounded-lg bg-evergreen/10" />
            <div aria-hidden className="h-16 animate-pulse rounded-2xl bg-evergreen/10" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} aria-hidden className="h-28 animate-pulse rounded-2xl bg-evergreen/10" />
                ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} aria-hidden className="h-36 animate-pulse rounded-2xl bg-evergreen/10" />
            ))}
        </div>
    );
    if (bare) return body;
    return <div className="mx-auto max-w-main space-y-5 px-4 py-5 pb-24">{body}</div>;
}
