import Link from "next/link";
import { CalendarCheck, MapPin, Phone } from "lucide-react";
import { footerLinks, legalLinks, site } from "@/data/site";
import type { Branch } from "@/types";

const head = "font-heading text-xs font-bold uppercase text-teal underline";
const link = "text-evergreen/70 underline-offset-2 transition-colors hover:text-evergreen hover:underline";

export async function Footer({ venue }: { venue: Branch }) {
    return (
        <footer className="border-t border-evergreen/10 bg-canvas text-evergreen">
            <div className="mx-auto grid max-w-main gap-10 px-4 py-12 md:grid-cols-[1.2fr_1fr_1fr]">
                <div className="space-y-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/sports/logo2.png"
                        alt={site.name}
                        className="h-28 w-auto"
                        width={48}
                        height={48}
                    />
                    <p className="max-w-xs text-sm text-evergreen/70">{site.tagline}</p>
                    <Link
                        href="/book"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal px-4 text-sm font-bold text-white transition-colors hover:bg-evergreen"
                    >
                        <CalendarCheck size={18} aria-hidden /> Book a slot
                    </Link>
                </div>

                <div>
                    <h2 className={head}>Visit us</h2>
                    <ul className="mt-4 space-y-2 text-sm">
                        <li className="flex items-start gap-2 text-evergreen/70">
                            <MapPin size={16} aria-hidden className="mt-0.5 shrink-0 text-teal" /> {venue.address}
                        </li>
                        <li className="flex items-center gap-2">
                            <Phone size={16} aria-hidden className="shrink-0 text-teal" />
                            <a href={`tel:${venue.phone}`} className={link}>{venue.phone}</a>
                        </li>
                        <li className="pl-6">
                            <a href={venue.mapUrl} target="_blank" rel="noopener noreferrer" className={link}>
                                Open in Maps
                            </a>
                        </li>
                    </ul>
                </div>

                <div className="grid grid-cols-2 gap-6 text-sm">
                    <div>
                        <h2 className={head}>Quick links</h2>
                        <ul className="mt-4 space-y-2">
                            {footerLinks.map((l) => (
                                <li key={l.label}><Link href={l.href} className={link}>{l.label}</Link></li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className={head}>Legal</h2>
                        <ul className="mt-4 space-y-2">
                            {legalLinks.map((l) => (
                                <li key={l.label}><Link href={l.href} className={link}>{l.label}</Link></li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <div className="border-t border-evergreen/10">
                <div className="mx-auto flex max-w-main flex-col gap-1 px-4 py-4 text-center text-xs text-evergreen/70 md:flex-row md:items-center md:justify-between md:text-left">
                    <p>© 2026 {site.name}. All rights reserved.</p>
                    <p>{venue.address}</p>
                </div>
            </div>
        </footer>
    );
}