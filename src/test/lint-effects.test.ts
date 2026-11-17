// Guards the react-hooks/set-state-in-effect fixes: the UI must stay free of synchronous setState
// in effects, and the rule must not be silenced with eslint-disable comments.
import { readFileSync } from "fs";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const FIXED = [
    "src/components/pages/admin/BookingPanel.tsx",
    "src/components/pages/admin/FindBooking.tsx",
    "src/components/pages/admin/StaffDesk.tsx",
    "src/components/pages/admin/WalkInForm.tsx",
    "src/components/pages/booking/BookingResult.tsx",
    "src/components/pages/home/QuickFinder.tsx",
    "src/components/ui/SideSheet.tsx",
];

describe("react-hooks/set-state-in-effect", () => {
    it("no component sets state synchronously inside an effect", async () => {
        const eslint = new ESLint({ cwd: process.cwd() });
        const results = await eslint.lintFiles(["src/components/**/*.tsx", "src/app/**/*.tsx"]);
        const hits = results.flatMap((r) =>
            r.messages.filter((m) => m.ruleId === "react-hooks/set-state-in-effect").map((m) => `${r.filePath}:${m.line}`)
        );
        expect(hits).toEqual([]);
    }, 180_000);

    it("the fixed files do not silence the rule", () => {
        for (const f of FIXED) {
            const src = readFileSync(f, "utf8");
            expect(src, f).not.toMatch(/eslint-disable[^\n]*set-state-in-effect/);
            expect(src, f).not.toMatch(/eslint-disable(-next-line)?\s*$/m); // no blanket disables either
        }
    });

    it("every BookingPanel is keyed by its booking code (fresh state per booking)", () => {
        for (const f of [
            "src/components/pages/admin/BookingsView.tsx",
            "src/components/pages/admin/StaffDesk.tsx",
            "src/components/pages/admin/insights/AttentionPanel.tsx",
            "src/components/pages/admin/customers/CustomerBookings.tsx",
        ]) {
            const uses = readFileSync(f, "utf8").match(/<BookingPanel\b[^>]*>/g) ?? [];
            expect(uses.length, f).toBeGreaterThan(0);
            for (const u of uses) expect(u, f).toMatch(/\bkey=\{/);
        }
    });
});
