import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { getSessionUser } from "@/server/auth/session";
import { connectDb } from "@/server/db/connect";
import { Suspense } from "react";

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
  title: { default: "KaziTurf — Turf & Sports Court Booking", template: "%s | KaziTurf" },
  description: "Book turf and sports courts in Bangladesh. Pay a bKash advance, pay the balance at the venue.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B6E4F",
};

async function HeaderWithUser() {
  await connectDb();
  const u = await getSessionUser();
  const user = u ? { id: u.id, name: u.name, role: u.role } : null;
  return <Header user={user} />;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connectDb(); // keep this if you still need the side-effect of loading Setup

  return (
    <html lang="en" className={`${jakarta.variable} ${vietnam.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <Suspense fallback={<Header user={null} />}>
          <HeaderWithUser />
        </Suspense>
        <main id="main" className="min-h-[70vh] pb-24 md:pb-0">
          {children}
        </main>
        <Footer />
        <MobileActionBar />
      </body>
    </html>
  );
}