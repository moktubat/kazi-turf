// Logout must land on the Home page of the address the browser is using, even when the
// server listens on 0.0.0.0 (Next builds req.nextUrl from the listen address, not the Host).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/payments/settle", () => ({ settlePayment: vi.fn() }));
// connection() needs a real Next request scope; the route logic under test does not.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));

import { POST as signout } from "@/app/api/auth/signout/route";
import { GET as bkashCallback } from "@/app/api/payments/bkash/callback/route";
import { SessionModel } from "@/models";
import { SESSION_COOKIE, createSession, hashToken } from "@/server/auth/session";
import { startDb, stopDb } from "./helpers";

beforeAll(startDb, 180_000);
afterAll(stopDb);

// What the dev server hands the route under `next dev -H 0.0.0.0`: the URL carries the
// listen address while the browser's real address is in Host / Origin.
const logoutReq = (token: string, browser = "localhost:3000", origin = `http://${browser}`) =>
    new NextRequest("https://0.0.0.0:3000/api/auth/signout", {
        method: "POST",
        headers: { host: browser, origin, cookie: `${SESSION_COOKIE}=${token}` },
    });

describe("logout redirect", () => {
    for (const role of ["CUSTOMER", "STAFF", "SUPER_ADMIN"]) {
        it(`${role}: ends the session, clears the cookie and goes to "/" (never 0.0.0.0)`, async () => {
            const { token } = await createSession(`user-${role}`);
            const res = await signout(logoutReq(token));

            expect(res.status).toBe(303);
            expect(res.headers.get("location")).toBe("/");
            expect(res.headers.get("location")).not.toContain("0.0.0.0");
            const cookie = res.headers.get("set-cookie") ?? "";
            expect(cookie).toContain(`${SESSION_COOKIE}=;`);
            expect(cookie.toLowerCase()).toContain("httponly");
            expect(cookie).toContain("Path=/");
            expect(await SessionModel.countDocuments({ keyHash: hashToken(token) })).toBe(0);
        });
    }

    it("works the same from a phone on the LAN or the live domain (browser resolves '/')", async () => {
        for (const host of ["192.168.0.10:3000", "kazisports.com"]) {
            const { token } = await createSession("u-lan");
            const res = await signout(logoutReq(token, host, host.includes(":") ? `http://${host}` : `https://${host}`));
            expect(res.headers.get("location")).toBe("/");
        }
    });

    it("still refuses a cross-site logout post", async () => {
        const { token } = await createSession("u-x");
        const res = await signout(logoutReq(token, "localhost:3000", "https://evil.example"));
        expect(res.status).toBe(403);
        expect(await SessionModel.countDocuments({ keyHash: hashToken(token) })).toBe(1); // session kept
    });
});

describe("bKash return redirect (same root cause)", () => {
    it("an unknown payment goes back to /book on the browser's own address", async () => {
        const res = await bkashCallback(new NextRequest("https://0.0.0.0:3000/api/payments/bkash/callback?paymentID=abc123xyz&status=success", { headers: { host: "localhost:3000" } }));
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe("/book");
    });
});
