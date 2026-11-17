import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Plus_Jakarta_Sans, Be_Vietnam_Pro } from "next/font/google";
import { Suspense } from "react";

import "./globals.css";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { getSessionUser } from "@/server/auth/session";
import { connectDb } from "@/server/db/connect";
import { HideOnRoutes } from "@/components/layout/HideOnRoutes";
import { getPublicVenue } from "@/server/public-data";
import { site } from "@/data/site";
import { DEFAULT_TITLE, SHARE_IMAGE } from "@/lib/seo";

const jakarta = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["500", "600", "700", "800"],
    variable: "--font-jakarta",
    display: "swap",
});

const vietnam = Be_Vietnam_Pro({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-vietnam",
    display: "swap",
});

export const metadata: Metadata = {
    metadataBase: new URL(site.url),
    title: {
        default: DEFAULT_TITLE,
        template: `%s | ${site.name}`,
    },
    description: site.seoDescription,
    keywords: site.seoKeywords,
    authors: [{ name: site.name }],
    creator: site.name,
    publisher: site.name,
    applicationName: site.name,
    category: "Sports & Recreation",
    // No site-wide canonical: every page inherited the home URL, telling search engines that
    // /book and /legal were copies of the home page. Public pages set their own (lib/seo).
    openGraph: {
        type: "website",
        locale: "en_US",
        siteName: site.name,
        title: DEFAULT_TITLE,
        description: site.seoDescription,
        // The logo is 500×500 (it was declared 1200×630), so a square card is the honest preview.
        images: [SHARE_IMAGE],
    },
    twitter: {
        card: "summary",
        title: DEFAULT_TITLE,
        description: site.seoDescription,
        images: [SHARE_IMAGE.url],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    // The site favicon is public/favicon.ico (32×32). There must be no app/favicon.ico:
    // that file convention would serve a different icon at the same /favicon.ico URL.
    icons: {
        icon: [{ url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" }],
        shortcut: "/favicon.ico",
        apple: "/sports/logo2.png", // iOS home screen needs a PNG; .ico is not used there
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: "#0B6E4F",
};

async function HeaderWithUser() {
    await connection();
    await connectDb();
    const u = await getSessionUser();
    const user = u ? { id: u.id, name: u.name, role: u.role } : null;
    return <Header user={user} />;
}

async function FooterWithVenue() {
    const venue = await getPublicVenue();
    return <Footer venue={venue} />;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${jakarta.variable} ${vietnam.variable}`}>
            <body>
                <a href="#main" className="skip-link">Skip to content</a>

                <Suspense fallback={<Header user={null} />}>
                    <HeaderWithUser />
                </Suspense>

                <main id="main" className="min-h-[70vh] pb-16 md:pb-0">
                    {children}
                </main>

                <HideOnRoutes prefixes={["/login", "/admin", "/account"]}>
                    <Suspense fallback={null}>
                        <FooterWithVenue />
                    </Suspense>
                </HideOnRoutes>

                <MobileActionBar />
            </body>
        </html>
    );
}