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
        default: "Kazi Sports Arena — Indoor Turf & Sports Court Booking in Bogura",
        template: "%s | Kazi Sports Arena",
    },
    description: site.seoDescription,
    keywords: site.seoKeywords,
    authors: [{ name: "Kazi Sports Arena" }],
    creator: "Kazi Sports Arena",
    publisher: "Kazi Sports Arena",
    applicationName: "Kazi Sports Arena",
    category: "Sports & Recreation",
    alternates: {
        canonical: site.url,
    },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: site.url,
        siteName: "Kazi Sports Arena",
        title: "Kazi Sports Arena — Indoor Turf & Sports Court Booking in Bogura",
        description: site.seoDescription,
        images: [
            {
                url: "/sports/logo2.png",
                width: 1200,
                height: 630,
                alt: "Kazi Sports Arena — Indoor sports facility in Bogura",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Kazi Sports Arena — Indoor Sports in Bogura",
        description: site.seoDescription,
        images: ["/sports/logo2.png"],
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
    icons: {
        icon: "/favicon.ico",
        apple: "/sports/logo2.png",
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

                <main id="main" className="min-h-[70vh] pb-14 md:pb-0">
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