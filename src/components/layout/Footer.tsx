import Link from "next/link";
import { branches } from "@/data/branches";
import { footerLinks, legalLinks, site } from "@/data/site";

const year = new Date().getFullYear();

export function Footer() {
    
    return (
        <footer className="bg-evergreen text-white">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-3">
                <div>
                    <p className="font-heading text-xl font-extrabold">
                        Kazi<span className="text-emerald">Turf</span>
                    </p>
                    <p className="mt-2 text-sm text-white/80">{site.tagline}</p>
                </div>

                <div>
                    <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-emerald">Branches</h2>
                    <ul className="mt-3 space-y-4 text-sm">
                        {branches.map((b) => (
                            <li key={b.id}>
                                <p className="font-semibold">{b.name}</p>
                                {b.status === "ACTIVE" ? (
                                    <>
                                        <p className="text-white/80">{b.address}</p>
                                        <p className="text-white/80">{b.hours}</p>
                                        <p className="flex flex-wrap gap-x-4">
                                            <a href={`tel:${b.phone}`} className="underline underline-offset-2">
                                                {b.phone}
                                            </a>
                                            <a href={b.mapUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                                                Open in Maps
                                            </a>
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-white/70">Coming Soon</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-emerald">Quick links</h2>
                        <ul className="mt-3 space-y-2">
                            {footerLinks.map((l) => (
                                <li key={l.label}>
                                    <Link href={l.href} className="underline-offset-2 hover:underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-emerald">Legal</h2>
                        <ul className="mt-3 space-y-2">
                            {legalLinks.map((l) => (
                                <li key={l.label}>
                                    <Link href={l.href} className="underline-offset-2 hover:underline">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="border-t border-white/10 py-4 text-center text-xs text-white/70">
                © {year} {site.name}. All rights reserved.
            </div>
        </footer>
    );
}