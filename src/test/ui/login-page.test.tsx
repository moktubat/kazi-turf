// @vitest-environment happy-dom
// /login page (2026-11-17): ?reset=… reaches LoginCard as resetToken; ?mode and ?next still work;
// a signed-in user is redirected.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

const getSessionUser = vi.fn();
const redirect = vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
});
vi.mock("@/server/auth/session", () => ({ getSessionUser: () => getSessionUser() }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to), useRouter: () => ({}) }));

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
});
afterEach(() => vi.clearAllMocks());

describe("/login", () => {
    it("passes ?reset= to LoginCard as resetToken", async () => {
        expect((await cardProps({ reset: "tok-abc" })).resetToken).toBe("tok-abc");
    });

    it("resetToken is null without ?reset=", async () => {
        expect((await cardProps({})).resetToken).toBeNull();
    });

    it("takes the first value when a param repeats", async () => {
        const p = await cardProps({ reset: ["first", "second"], mode: ["signup", "signin"] });
        expect(p.resetToken).toBe("first");
        expect(p.initialMode).toBe("signup");
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
