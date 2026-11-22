// @vitest-environment happy-dom
// /login page: the reset token arrives in an httpOnly cookie set by /api/auth/reset-link
// (2026-11-22, so it never sits in the page URL that analytics records); a legacy ?reset=…
// is bounced through that route; ?mode and ?next still work; a signed-in user is redirected
// unless they are completing a reset.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const getSessionUser = vi.fn();
const redirect = vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
});
vi.mock("@/server/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: () => ({}) }));
let jar: Record<string, string> = {};
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (name: string) => (name in jar ? { name, value: jar[name] } : undefined) }),
}));
const TOKEN = "A".repeat(43);

const { default: LoginPage } = await import("@/app/(auth)/login/page");
const { LoginCard } = await import("@/components/auth/LoginCard");

type Props = Record<string, unknown> & { children?: ReactNode };

/** Runs the async LoginContent inside the page's Suspense and returns the LoginCard element's props. */
async function cardProps(sp: Record<string, string | string[] | undefined>) {
    const page = LoginPage({ searchParams: Promise.resolve(sp) }) as ReactElement<Props>;
    const content = page.props.children as ReactElement<Props>;
    const Content = content.type as (p: Props) => Promise<ReactElement>;
    const tree = await Content(content.props);
    const find = (n: ReactNode): ReactElement<Props> | null => {
        if (!isValidElement(n)) return null;
        const el = n as ReactElement<Props>;
        if (el.type === LoginCard) return el;
        const kids = el.props.children;
        for (const k of Array.isArray(kids) ? kids : [kids]) {
            const hit = find(k);
            if (hit) return hit;
        }
        return null;
    };
    const card = find(tree);
    expect(card).not.toBeNull();
    return card!.props;
}

beforeEach(() => {
    getSessionUser.mockReset();
    getSessionUser.mockResolvedValue(null);
    redirect.mockClear();
    jar = {};
});
afterEach(() => vi.clearAllMocks());

describe("/login", () => {
    it("bounces a legacy ?reset= link through /api/auth/reset-link (token leaves the URL)", async () => {
        await expect(cardProps({ reset: "tok-abc" })).rejects.toThrow("REDIRECT:/api/auth/reset-link?reset=tok-abc");
    });

    it("?mode=reset takes the token from the reset cookie", async () => {
        jar = { kt_reset: TOKEN };
        expect((await cardProps({ mode: "reset" })).resetToken).toBe(TOKEN);
    });

    it("ignores the cookie without ?mode=reset, and a malformed cookie", async () => {
        jar = { kt_reset: TOKEN };
        expect((await cardProps({})).resetToken).toBeNull();
        jar = { kt_reset: "<script>" };
        expect((await cardProps({ mode: "reset" })).resetToken).toBeNull();
    });

    it("resetToken is null without a reset", async () => {
        expect((await cardProps({})).resetToken).toBeNull();
    });

    it("takes the first value when a param repeats", async () => {
        const p = await cardProps({ mode: ["signup", "signin"] });
        expect(p.initialMode).toBe("signup");
        await expect(cardProps({ reset: ["first", "second"] })).rejects.toThrow("REDIRECT:/api/auth/reset-link?reset=first");
    });

    it("a signed-in user can still complete a reset", async () => {
        getSessionUser.mockResolvedValue({ id: "u1" });
        jar = { kt_reset: TOKEN };
        expect((await cardProps({ mode: "reset" })).resetToken).toBe(TOKEN);
    });

    it("?mode=signup opens Register; anything else opens Login", async () => {
        expect((await cardProps({ mode: "signup" })).initialMode).toBe("signup");
        expect((await cardProps({ mode: "weird" })).initialMode).toBe("signin");
    });

    it("keeps a safe ?next and drops an off-site one", async () => {
        expect((await cardProps({ next: "/book" })).next).toBe("/book");
        expect((await cardProps({ next: "https://evil.example" })).next).toBeNull();
    });

    it("a signed-in user is redirected to ?next or /account", async () => {
        getSessionUser.mockResolvedValue({ id: "u1" });
        await expect(cardProps({ next: "/book" })).rejects.toThrow("REDIRECT:/book");
        await expect(cardProps({})).rejects.toThrow("REDIRECT:/account");
    });
});
