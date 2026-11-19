// Content and SEO regressions: one business identity everywhere, per-page canonical URLs,
// crawl rules, verified structured data, FAQ and policies built from the live booking rules,
// and no invented refund amounts, deadlines or facilities.
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { getFaqItems } from "@/data/faq";
import { getLegalDocs, hasRefundRules, REFUND_RULES_PENDING, type RefundView } from "@/data/legal";
import { policies as livePolicies, site } from "@/data/site";
import { businessJsonLd, NOINDEX, pageMetadata } from "@/lib/seo";
import { CODE_TTL_MS } from "@/server/auth/emailOtp";
import { passwordResetEmailTemplate, verificationCodeTemplate } from "@/server/email/templates";
import { receiptHtml } from "@/lib/printReceipt";
import type { Policies } from "@/types";

const pol = (over: Partial<Policies> = {}): Policies => ({ ...livePolicies, ...over });
const allText = (docs: ReturnType<typeof getLegalDocs>) =>
    docs.flatMap((d) => [d.intro, ...d.sections.flatMap((s) => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])])]).join("\n");
const NO_RULES: RefundView = { tiers: [], method: "", timing: "", exceptions: [] };

describe("business identity (owner-supplied facts)", () => {
    it("matches the supplied details exactly", () => {
        expect(site).toMatchObject({
            name: "Kazi Sports Arena",
            shortName: "Kazi Sports",
            phone: "+8801354490362",
            whatsapp: "8801354490362",
            email: "kazisportsarena@gmail.com",
            url: "https://kazisports.com",
            timezone: "Asia/Dhaka",
            currency: "BDT",
            hours: "Open 24 hours, every day",
        });
        expect(site.address).toEqual({ area: "Shabgram", city: "Bogura", country: "Bangladesh", countryCode: "BD" });
        expect(site.tagline).toMatch(/24\/7/);
    });

    it("the default description is a sensible length and makes no unverifiable claims", () => {
        expect(site.seoDescription.length).toBeGreaterThanOrEqual(120);
        expect(site.seoDescription.length).toBeLessThanOrEqual(165);
        expect(site.seoDescription).not.toMatch(/premier|best|no\.? ?1|leading|cheapest/i);
        expect(site.seoKeywords.length).toBeLessThanOrEqual(8);
    });

    it("customer emails and receipts use the business name, not the old KaziTurf brand", () => {
        const code = verificationCodeTemplate({ code: "123456", purpose: "REGISTER", minutes: 10 });
        const reset = passwordResetEmailTemplate({ name: "Rahim", resetUrl: "https://kazisports.com/login?reset=x" });
        for (const t of [code.subject, code.html, code.text, reset.subject, reset.html, reset.text]) {
            expect(t).not.toMatch(/KaziTurf/);
        }
        expect(code.subject).toBe("123456 is your Kazi Sports Arena verification code");
        expect(code.text).toMatch(/code: 123456/); // the format other flows rely on
        const receipt = receiptHtml({
            code: "KT-ABC234", branchAddress: "Shabgram, Bogura", customerName: "A", pitchName: "Field", sport: "Football",
            date: "2026-11-18", start: "18:00", end: "19:30", subtotal: 2000, total: 2000, vatAmount: 0, vatRatePercent: null,
            payments: [{ id: "p", provider: "BKASH", kind: "ADVANCE", amount: 600, status: "SUCCESS", reference: "T1", at: "" }],
            vatRegistrationNo: "",
        } as unknown as Parameters<typeof receiptHtml>[0]);
        expect(receipt).toContain("<h1>Kazi Sports Arena</h1>");
    });
});

describe("SEO metadata", () => {
    it("each public page gets its own canonical URL, title and social preview", () => {
        const home = pageMetadata({ path: "/", description: site.seoDescription });
        const book = pageMetadata({ path: "/book", title: "Book Indoor Football, Cricket & Badminton", description: "x".repeat(140) });
        expect(home.alternates?.canonical).toBe("/");
        expect(book.alternates?.canonical).toBe("/book");
        expect(book.openGraph?.url).toBe("/book");
        expect(book.title).toBe("Book Indoor Football, Cricket & Badminton");
        expect(home.title).toEqual({ absolute: expect.stringContaining("Kazi Sports Arena") });
        // The share image is declared at its real size (the logo is 500×500).
        expect(book.openGraph?.images).toEqual([expect.objectContaining({ width: 500, height: 500 })]);
        expect(book.twitter).toMatchObject({ card: "summary" });
    });

    it("robots allows the public site, blocks private areas and points to the sitemap", () => {
        const r = robots();
        const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
        expect(rule.allow).toBe("/");
        expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/account", "/api/", "/login"]));
        expect(r.sitemap).toBe("https://kazisports.com/sitemap.xml");
        expect(NOINDEX).toEqual({ index: false, follow: false });
    });

    it("the sitemap lists only public pages", () => {
        const urls = sitemap().map((e) => e.url);
        expect(urls).toEqual(["https://kazisports.com/", "https://kazisports.com/book", "https://kazisports.com/legal"]);
    });

    it("structured data uses only verified facts", () => {
        const ld = businessJsonLd({ name: "Kazi Sports Arena", mapUrl: "https://maps.app.goo.gl/x", sports: ["Football", "Cricket", "Badminton"] });
        expect(ld).toMatchObject({
            "@type": "SportsActivityLocation",
            name: "Kazi Sports Arena",
            telephone: "+8801354490362",
            email: "kazisportsarena@gmail.com",
            url: "https://kazisports.com",
            address: { streetAddress: "Shabgram", addressLocality: "Bogura", addressCountry: "BD" },
            sport: ["Football", "Cricket", "Badminton"],
            currenciesAccepted: "BDT",
        });
        expect(ld.openingHoursSpecification[0]).toMatchObject({ opens: "00:00", closes: "23:59" });
        expect(ld.openingHoursSpecification[0].dayOfWeek).toHaveLength(7);
        // Nothing we cannot back up: no ratings, reviews, price range or coordinates.
        for (const k of ["aggregateRating", "review", "priceRange", "geo", "award"]) expect(ld).not.toHaveProperty(k);
    });
});

describe("FAQ follows the live booking rules", () => {
    const words = (t: string) => t.trim().split(/\s+/).length;

    it("has exactly seven questions, each answered in 25–28 words, with valid internal links", () => {
        for (const p of [pol(), pol({ advancePercent: 40, nightAdvancePercent: 100, bookingHorizonDays: 7 }), pol({ advancePercent: 25, nightAdvancePercent: 25, bookingHorizonDays: 30 })]) {
            const faq = getFaqItems(p);
            expect(faq.map((f) => f.id)).toEqual(["open-24-7", "how-book", "advance", "confirmed", "payment-failed", "cancel", "location"]);
            for (const f of faq) {
                const n = words(f.answer);
                expect(n, `${f.id}: ${n} words`).toBeGreaterThanOrEqual(25);
                expect(n, `${f.id}: ${n} words`).toBeLessThanOrEqual(28);
            }
        }
        const valid = /^\/(book|account|legal#refund|#contact)?$/;
        for (const f of getFaqItems(pol())) if (f.link) expect(f.link.href, f.id).toMatch(valid);
    });

    it("numbers come from the policy, so admin changes show up; no fixed advance percentage", () => {
        const text = getFaqItems(pol({ advancePercent: 40, bookingHorizonDays: 21, nightAdvancePercent: 100 })).map((f) => f.answer).join(" ");
        expect(text).toContain("21 days ahead");
        // The advance is set per sport: the FAQ explains it without one fixed number.
        expect(text).toContain("It depends on the sport and start time.");
        expect(text).not.toMatch(/\d+% advance/);
        expect(text).toContain("+8801354490362");
        expect(text).toContain("kazisportsarena@gmail.com");
    });

    it("promises nothing unconfirmed (facilities, reply times, refund amounts)", () => {
        const text = getFaqItems(pol()).map((f) => `${f.question} ${f.answer}`).join(" ");
        expect(text).not.toMatch(/floodlit|floodlight|5-a-side|6-a-side|turf wicket|same day|within \d|business days|\d+% (of your advance )?(is )?refund/i);
    });
});

describe("Terms, Privacy and Refund", () => {
    it("without owner refund rules: no amounts, deadlines or fees, and the honest 'being finalised' text", () => {
        const docs = getLegalDocs(NO_RULES);
        const refund = allText([docs[2]]);
        expect(hasRefundRules(NO_RULES)).toBe(false);
        expect(refund).toContain(REFUND_RULES_PENDING);
        expect(refund).not.toMatch(/\d+% (of your advance )?(is )?refund|administrative fee|business days|48 hours|24 hours before/i);
    });

    it("with owner rules saved, exactly those rules are shown", () => {
        const r: RefundView = { tiers: [{ when: "More than 2 days before", outcome: "Advance refunded" }], method: "Paid back by bKash.", timing: "", exceptions: ["No-shows are not refunded."] };
        const refund = allText([getLegalDocs(r)[2]]);
        expect(refund).toContain("More than 2 days before: Advance refunded");
        expect(refund).toContain("Paid back by bKash.");
        expect(refund).toContain("No-shows are not refunded.");
        expect(refund).not.toContain(REFUND_RULES_PENDING);
    });

    it("explains failed, late and duplicate payments the way the system handles them", () => {
        const refund = allText([getLegalDocs(NO_RULES)[2]]);
        expect(refund).toMatch(/payment fails or you cancel it, the booking is not confirmed/);
        expect(refund).toMatch(/completed after your hold has ended/);
        expect(refund).toMatch(/paid twice/);
        expect(refund).toMatch(/Refund pending/);
    });

    it("tabs keep short labels (three fit on a 375px phone); each document keeps its full title", () => {
        const docs = getLegalDocs(NO_RULES);
        expect(docs.map((d) => d.label)).toEqual(["Terms", "Privacy", "Refund"]);
        expect(docs.map((d) => d.title)).toEqual(["Terms & Conditions", "Privacy Policy", "Refund Policy"]);
    });

    it("terms state the real sport-wise advance rules, including night slots, and the live hold time", () => {
        const terms = allText([getLegalDocs(NO_RULES)[0]]);
        expect(terms).toContain("depends on the sport you book");
        expect(terms).toMatch(/12 AM and 6 AM/);
        expect(terms).toContain("Where a sport needs no advance");
        // Each active sport's live percentage is listed (here: the venue-wide fallback).
        expect(terms).toContain(`Football: ${livePolicies.advancePercent}%`);
        expect(terms).toContain(`${livePolicies.holdMinutes} minutes`);
        expect(terms).not.toMatch(/peak and off-peak/i); // price tiers are not shown to customers
    });

    it("privacy policy covers what the system stores, says email is required, and claims no certifications", () => {
        const privacy = allText([getLegalDocs(NO_RULES)[1]]);
        for (const s of ["mobile number", "email address", "booking code", "transaction ID", "IP address", "contact form"]) expect(privacy).toContain(s);
        expect(privacy).not.toMatch(/optional email/i);
        expect(privacy).toContain(`expire after ${CODE_TTL_MS / 60_000} minutes`);
        expect(privacy).not.toMatch(/ISO|PCI|GDPR[- ]compliant|certified/i);
        expect(privacy).not.toMatch(/We We/);
    });
});
