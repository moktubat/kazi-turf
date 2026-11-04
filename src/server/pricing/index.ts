import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { dhakaParts, toMinutes } from "@/lib/time";
import { AppError } from "@/server/http";
import type { PricingRule } from "@/types";

export function ruleFor(pitchId: string, cellStart: Date): PricingRule | null {
    const { dow, minutes, date } = dhakaParts(cellStart);
    return (
        pricingRules.find(
            (r) =>
                r.pitchId === pitchId &&
                r.days.includes(dow) &&
                minutes >= toMinutes(r.startTime) &&
                minutes < toMinutes(r.endTime) &&
                (!r.effectiveFrom || date >= r.effectiveFrom) &&
                (!r.effectiveTo || date <= r.effectiveTo)
        ) ?? null
    );
}

export function priceForCell(pitchId: string, cellStart: Date) {
    const rule = ruleFor(pitchId, cellStart);
    return rule ? { price: rule.pricePerSlot, tier: rule.tier } : null;
}

export interface Quote {
    lines: { cellStart: string; price: number; tier: string }[];
    subtotal: number;
    vat: number;
    total: number;
    advance: number;
    balance: number;
    advancePercent: number;
    vatRatePercent: number | null;
}

export function quote(pitchId: string, cellStarts: Date[]): Quote {
    const { advancePercent, vatRatePercent, vatMode } = policies;

    if (typeof advancePercent !== "number" || !Number.isFinite(advancePercent)) {
        throw new AppError(
            "NO_RATE_FOR_SLOT",
            "Booking is not configured yet. Please contact the venue.",
            500
        );
    }

    const lines = cellStarts.map((c) => {
        const p = priceForCell(pitchId, c);
        if (!p || !Number.isFinite(p.price) || p.price <= 0) {
            throw new AppError(
                "NO_RATE_FOR_SLOT",
                "We could not price this slot. Pick another time.",
                400
            );
        }
        return { cellStart: c.toISOString(), price: p.price, tier: p.tier };
    });

    const subtotal = lines.reduce((s, l) => s + l.price, 0);

    let vat = 0;
    let total = subtotal;
    if (vatRatePercent && vatMode === "exclusive") {
        vat = Math.round((subtotal * vatRatePercent) / 100);
        total = subtotal + vat;
    } else if (vatRatePercent) {
        vat = Math.round(subtotal - subtotal / (1 + vatRatePercent / 100));
    }

    const advance = Math.round((total * advancePercent) / 100);
    const balance = total - advance;

    if (![subtotal, vat, total, advance, balance].every(Number.isFinite)) {
        throw new AppError(
            "NO_RATE_FOR_SLOT",
            "We could not price this slot. Pick another time.",
            400
        );
    }

    return {
        lines,
        subtotal,
        vat,
        total,
        advance,
        balance,
        advancePercent,
        vatRatePercent: vatRatePercent ?? null,
    };
}