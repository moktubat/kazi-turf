// @vitest-environment happy-dom
// AuthForm + LoginCard (2026-11-17): "Forgot password?" flow, reset-link card, and the
// reset token handed down from /login?reset=….
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const apiMock = vi.fn();
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: (...a: unknown[]) => apiMock(...a) }));
const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { AuthForm } = await import("@/components/auth/AuthForm");
const { LoginCard } = await import("@/components/auth/LoginCard");

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    router.replace.mockReset();
    router.refresh.mockReset();
});
afterEach(cleanup);

const body = (url: string) => JSON.parse(apiMock.mock.calls.find(([u]) => u === url)![1].body);

describe("AuthForm: forgot password", () => {
    it("Sign in shows a Forgot password? link that opens the forgot form without the tabs", () => {
        render(<AuthForm onSuccess={vi.fn()} />);
        expect(screen.getByRole("tablist")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
        expect(screen.getByRole("form", { name: "Forgot password" })).toBeTruthy();
        expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("validates the identifier before posting", async () => {
        render(<AuthForm onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
        expect(await screen.findByText("Enter your email or phone")).toBeTruthy();
        expect(apiMock).not.toHaveBeenCalled();
    });

    it("posts to /api/auth/forgot-password and shows a neutral confirmation", async () => {
        render(<AuthForm onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
        fireEvent.change(screen.getByLabelText("Email or phone"), { target: { value: "  karim@example.com " } });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
        const status = await screen.findByRole("status");
        expect(status.textContent).toMatch(/If an account exists/);
        expect(body("/api/auth/forgot-password")).toEqual({ identifier: "karim@example.com" });
    });

    it("shows the server's message when sending fails", async () => {
        apiMock.mockRejectedValueOnce(new ApiError("RATE_LIMITED", "Too many attempts. Try again later.", 429));
        render(<AuthForm onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
        fireEvent.change(screen.getByLabelText("Email or phone"), { target: { value: "01733334444" } });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
        expect(await screen.findByText("Too many attempts. Try again later.")).toBeTruthy();
    });

    it("Back to sign in returns to the login tabs", () => {
        render(<AuthForm onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
        fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
        expect(screen.getByRole("form", { name: "Sign in" })).toBeTruthy();
        expect(screen.getByRole("tablist")).toBeTruthy();
    });
});

describe("AuthForm: reset link", () => {
    it("a reset token opens the set-new-password card", () => {
        render(<AuthForm onSuccess={vi.fn()} initialResetToken="tok-123" />);
        expect(screen.getByRole("form", { name: "Set a new password" })).toBeTruthy();
        expect(screen.queryByRole("tablist")).toBeNull();
    });

    it("rejects a weak password client-side", async () => {
        render(<AuthForm onSuccess={vi.fn()} initialResetToken="tok-123" />);
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
        fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
        await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
        expect(apiMock).not.toHaveBeenCalled();
    });

    it("posts the token with the new password, then offers Go to sign in", async () => {
        render(<AuthForm onSuccess={vi.fn()} initialResetToken="tok-123" />);
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpass123" } });
        fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
        expect((await screen.findByRole("status")).textContent).toMatch(/password is updated/);
        expect(body("/api/auth/reset-password")).toEqual({ token: "tok-123", newPassword: "newpass123" });
        fireEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
        expect(screen.getByRole("form", { name: "Sign in" })).toBeTruthy();
    });

    it("a server field error stays on the form under the field", async () => {
        apiMock.mockRejectedValueOnce(new ApiError("VALIDATION", "Weak password", 400, { newPassword: "Too common" }));
        render(<AuthForm onSuccess={vi.fn()} initialResetToken="tok-123" />);
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "kazi2026goal" } });
        fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
        expect(await screen.findByText("Too common")).toBeTruthy();
        expect(screen.getByRole("form", { name: "Set a new password" })).toBeTruthy();
    });

    it("an expired link shows the server message", async () => {
        apiMock.mockRejectedValueOnce(new ApiError("INVALID_TOKEN", "This reset link has expired.", 400));
        render(<AuthForm onSuccess={vi.fn()} initialResetToken="tok-123" />);
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "newpass123" } });
        fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
        expect(await screen.findByText("This reset link has expired.")).toBeTruthy();
    });
});

describe("LoginCard", () => {
    it("passes the reset token through to AuthForm", () => {
        render(<LoginCard next={null} initialMode="signin" resetToken="tok-9" />);
        expect(screen.getByRole("form", { name: "Set a new password" })).toBeTruthy();
    });

    it("without a token it opens the requested tab", () => {
        render(<LoginCard next={null} initialMode="signup" />);
        expect(screen.getByRole("tab", { name: "Register" }).getAttribute("aria-selected")).toBe("true");
    });

    it("after sign-in it goes to ?next, or /account by default", async () => {
        render(<LoginCard next="/book" initialMode="signin" />);
        fireEvent.change(screen.getByLabelText("Email or phone"), { target: { value: "01733334444" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/book"));
        expect(router.refresh).toHaveBeenCalled();
        cleanup();

        render(<LoginCard next={null} initialMode="signin" />);
        fireEvent.change(screen.getByLabelText("Email or phone"), { target: { value: "01733334444" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/account"));
    });
});
