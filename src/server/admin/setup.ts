// Setup rules: branches, pitches, rates, staff, policies. Authorization, validation and audit live here.
// Edits mutate the shared config in place, so Home, /book and the Desk see them immediately.
import "server-only";
import { randomUUID } from "crypto";
import { branches } from "@/data/branches";
import { legalStatus, refundConfig } from "@/data/legal";
import { pitches } from "@/data/pitches";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { daysLabel } from "@/lib/grid";
import { slugify } from "@/lib/slug";
import { dhakaParts, toHHMM, toMinutes, todayDhaka } from "@/lib/time";
import type {
    BranchInput, BranchUpdateInput, PitchInput, PitchUpdateInput, PolicyInput,
    RateInput, RateUpdateInput, StaffCreateInput, StaffUpdateInput,
} from "@/schemas/setup";
import { logAudit } from "@/server/audit";
import { canAccessBranch } from "@/server/auth/guards";
import { hashPassword } from "@/server/auth/password";
import { assertPitchEditor, assertSetupAccess } from "@/server/auth/permissions";
import { endOtherSessions, type ServerUser } from "@/server/auth/session";
import { assertUnique } from "@/server/auth/users";
import { settle } from "@/server/bookings";
import { AppError } from "@/server/http";
import { store } from "@/server/store";
import type { Branch, Pitch, PricingRule } from "@/types";
import type { AuditMeta } from "@/types/ops";
import type { PolicyForm, SetupData, SetupRate, SetupStaff, SetupTab } from "@/types/setup";
import type { User } from "@/types/user";
import { assertSuperAdmin } from "./access";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- helpers ---------- */
const show = (v: unknown) =>
    Array.isArray(v) ? v.join(", ") || "none" : v === null || v === undefined || v === "" ? "empty" : String(v);

function diff(before: Record<string, unknown>, after: Record<string, unknown>): AuditMeta {
    const out: AuditMeta = {};
    for (const k of Object.keys(after)) {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
            out[k] = `${show(before[k])} → ${show(after[k])}`.slice(0, 160);
        }
    }
    return out;
}

const uniq = (list: string[]) => {
    const seen = new Set<string>();
    return list.filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
};

const tel = (v: string) => v.replace(/[\s-]/g, "");
const waDigits = (v: string) => {
    const d = v.replace(/\D/g, "");
    return d.startsWith("01") ? `88${d}` : d;
};
const inRange = (r: { effectiveFrom?: string; effectiveTo?: string }, d: string) =>
    (!r.effectiveFrom || d >= r.effectiveFrom) && (!r.effectiveTo || d <= r.effectiveTo);

/* ---------- branches ---------- */
export function createBranch(user: ServerUser, input: BranchInput) {
    assertSuperAdmin(user);
    if (branches.some((b) => b.id === input.slug)) {
        throw new AppError("SLUG_TAKEN", "A branch with this slug already exists.", 409, { slug: "Already used" });
    }
    const b: Branch = {
        id: input.slug,
        slug: input.slug,
        name: input.name,
        address: input.address,
        phone: tel(input.phone),
        whatsapp: waDigits(input.whatsapp),
        mapUrl: input.mapUrl,
        hours: input.hours,
        status: input.status,
        sports: uniq(input.sports),
    };
    branches.push(b);
    logAudit(user, {
        action: "BRANCH_CHANGED",
        entityType: "BRANCH",
        entityId: b.id,
        branchId: b.id,
        meta: { change: "created", name: b.name, status: b.status },
    });
}

export function updateBranch(user: ServerUser, input: BranchUpdateInput) {
    assertSuperAdmin(user);
    const b = branches.find((x) => x.id === input.id);
    if (!b) throw new AppError("NOT_FOUND", "Branch not found.", 404);

    const sports = uniq(input.sports);
    for (const p of pitches) {
        if (p.branchId === b.id && !sports.includes(p.sport)) {
            throw new AppError("SPORT_IN_USE", `${p.name} is a ${p.sport} pitch. Change the pitch first.`, 409, {
                sports: `${p.name} uses ${p.sport}`,
            });
        }
    }

    const next = {
        name: input.name,
        address: input.address,
        phone: tel(input.phone),
        whatsapp: waDigits(input.whatsapp),
        mapUrl: input.mapUrl,
        hours: input.hours,
        status: input.status,
        sports,
    };
    const changes = diff(b as unknown as Record<string, unknown>, next);
    Object.assign(b, next); // the slug/ID never changes
    if (Object.keys(changes).length > 0) {
        logAudit(user, { action: "BRANCH_CHANGED", entityType: "BRANCH", entityId: b.id, branchId: b.id, meta: changes });
    }
}

/* ---------- pitches ---------- */
function assertPitchRules(branch: Branch, input: { name: string; sport: string }, selfId?: string) {
    if (!branch.sports.includes(input.sport)) {
        throw new AppError("SPORT_NOT_OFFERED", `Add "${input.sport}" to the branch's sports first.`, 400, {
            sport: "Not offered at this branch",
        });
    }
    const clash = pitches.some(
        (p) => p.branchId === branch.id && p.id !== selfId && p.name.toLowerCase() === input.name.toLowerCase()
    );
    if (clash) throw new AppError("NAME_TAKEN", "Another pitch here already has this name.", 409, { name: "Already used" });
}

/** New hours must still fit every upcoming booking, hold and block (spec 7.8). */
function assertScheduleSafe(pitchId: string, openTime: string, closeTime: string, now: Date) {
    const step = policies.slotMinutes;
    const open = toMinutes(openTime);
    const close = toMinutes(closeTime);
    for (const c of store.claims) {
        if (c.pitchId !== pitchId) continue;
        const t = new Date(c.cellStart);
        if (t.getTime() + step * 60_000 <= now.getTime()) continue; // already past
        if (c.state === "HELD" && c.expiresAt && new Date(c.expiresAt) <= now) continue;
        const { minutes } = dhakaParts(t);
        if (!(minutes >= open && minutes + step <= close && (minutes - open) % step === 0)) {
            throw new AppError(
                "SCHEDULE_CONFLICT",
                "Upcoming bookings or blocks would fall outside the new hours. Move or cancel them first.",
                409,
                { openTime: "Conflicts with upcoming bookings", closeTime: "Conflicts with upcoming bookings" }
            );
        }
    }
}

export function createPitch(user: ServerUser, input: PitchInput) {
    assertPitchEditor(user, input.branchId);
    const branch = branches.find((b) => b.id === input.branchId);
    if (!branch) throw new AppError("NOT_FOUND", "Branch not found.", 404);
    assertPitchRules(branch, input);

    const base = `${branch.id}-${slugify(input.name)}`;
    let id = base;
    for (let n = 2; pitches.some((p) => p.id === id); n++) id = `${base}-${n}`;

    const p: Pitch = {
        id,
        branchId: branch.id,
        name: input.name,
        sport: input.sport,
        format: input.format,
        dimensions: input.dimensions,
        surface: input.surface,
        openTime: input.openTime,
        closeTime: input.closeTime,
        maxConsecutiveSlots: input.maxConsecutiveSlots,
        facilities: uniq(input.facilities),
        image: input.image || null,
        status: input.status,
    };
    pitches.push(p);
    logAudit(user, {
        action: "PITCH_CHANGED",
        entityType: "PITCH",
        entityId: p.id,
        branchId: p.branchId,
        meta: { change: "created", name: p.name, sport: p.sport, hours: `${p.openTime}–${p.closeTime}` },
    });
}

export function updatePitch(user: ServerUser, input: PitchUpdateInput, now: Date = new Date()) {
    const p = pitches.find((x) => x.id === input.id);
    if (!p) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertPitchEditor(user, p.branchId);

    const branch = branches.find((b) => b.id === p.branchId);
    if (!branch) throw new AppError("NOT_FOUND", "Branch not found.", 404);
    assertPitchRules(branch, input, p.id);

    if (p.openTime !== input.openTime || p.closeTime !== input.closeTime) {
        assertScheduleSafe(p.id, input.openTime, input.closeTime, now);
    }

    const next = {
        name: input.name,
        sport: input.sport,
        format: input.format,
        dimensions: input.dimensions,
        surface: input.surface,
        openTime: input.openTime,
        closeTime: input.closeTime,
        maxConsecutiveSlots: input.maxConsecutiveSlots,
        facilities: uniq(input.facilities),
        image: input.image || null,
        status: input.status,
    };
    const changes = diff(p as unknown as Record<string, unknown>, next); // the branch never changes here
    Object.assign(p, next);
    if (Object.keys(changes).length > 0) {
        logAudit(user, {
            action: "PITCH_CHANGED",
            entityType: "PITCH",
            entityId: p.id,
            branchId: p.branchId,
            meta: { pitch: p.name, ...changes },
        });
    }
}

/* ---------- rates ---------- */
const describeRule = (r: Pick<PricingRule, "days" | "startTime" | "endTime" | "tier">) =>
    `${daysLabel(r.days)} ${r.startTime}–${r.endTime} ${r.tier}`;

function assertRule(pitch: Pitch, input: RateInput, selfId?: string) {
    const step = policies.slotMinutes;
    const open = toMinutes(pitch.openTime);
    const close = toMinutes(pitch.closeTime);
    const s = toMinutes(input.startTime);
    const e = toMinutes(input.endTime);

    if (s < open || e > close || (s - open) % step !== 0 || (e - open) % step !== 0) {
        throw new AppError(
            "OFF_GRID",
            `Times must sit on this pitch's ${step}-minute schedule (${pitch.openTime}–${pitch.closeTime}).`,
            400,
            { startTime: "Not on the schedule", endTime: "Not on the schedule" }
        );
    }

    const from = input.effectiveFrom || "0000-00-00";
    const to = input.effectiveTo || "9999-99-99";
    for (const r of pricingRules) {
        if (r.id === selfId || r.pitchId !== pitch.id) continue;
        if (!r.days.some((d) => input.days.includes(d))) continue;
        if (!(from <= (r.effectiveTo || "9999-99-99") && (r.effectiveFrom || "0000-00-00") <= to)) continue;
        if (!(s < toMinutes(r.endTime) && toMinutes(r.startTime) < e)) continue;
        throw new AppError("RATE_OVERLAP", `This overlaps an existing rate: ${describeRule(r)}.`, 409, {
            startTime: "Overlaps another rate",
        });
    }
}

function ruleFields(input: RateInput) {
    return {
        days: [...new Set(input.days)].sort((a, b) => a - b),
        startTime: input.startTime,
        endTime: input.endTime,
        pricePerSlot: input.pricePerSlot,
        tier: input.tier,
        effectiveFrom: input.effectiveFrom || undefined,
        effectiveTo: input.effectiveTo || undefined,
    };
}

export function createRate(user: ServerUser, input: RateInput) {
    const pitch = pitches.find((p) => p.id === input.pitchId);
    if (!pitch) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertPitchEditor(user, pitch.branchId);
    assertRule(pitch, input);

    const rule: PricingRule = { id: `${pitch.id}-${randomUUID().slice(0, 8)}`, pitchId: pitch.id, ...ruleFields(input) };
    pricingRules.push(rule);
    logAudit(user, {
        action: "PRICE_CHANGED",
        entityType: "PITCH",
        entityId: pitch.id,
        branchId: pitch.branchId,
        meta: { change: "added", pitch: pitch.name, rate: describeRule(rule), price: rule.pricePerSlot },
    });
}

export function updateRate(user: ServerUser, input: RateUpdateInput) {
    const rule = pricingRules.find((r) => r.id === input.id);
    const pitch = rule && pitches.find((p) => p.id === rule.pitchId);
    if (!rule || !pitch) throw new AppError("NOT_FOUND", "Rate not found.", 404);
    assertPitchEditor(user, pitch.branchId);
    assertRule(pitch, { ...input, pitchId: pitch.id }, rule.id);

    const before = `${describeRule(rule)} ৳${rule.pricePerSlot}`;
    Object.assign(rule, ruleFields(input)); // the pitch of a rate never changes
    logAudit(user, {
        action: "PRICE_CHANGED",
        entityType: "PITCH",
        entityId: pitch.id,
        branchId: pitch.branchId,
        meta: { change: "updated", pitch: pitch.name, before, after: `${describeRule(rule)} ৳${rule.pricePerSlot}` },
    });
}

export function deleteRate(user: ServerUser, id: string) {
    const i = pricingRules.findIndex((r) => r.id === id);
    const rule = pricingRules[i];
    const pitch = rule && pitches.find((p) => p.id === rule.pitchId);
    if (!rule || !pitch) throw new AppError("NOT_FOUND", "Rate not found.", 404);
    assertPitchEditor(user, pitch.branchId);

    pricingRules.splice(i, 1);
    logAudit(user, {
        action: "PRICE_CHANGED",
        entityType: "PITCH",
        entityId: pitch.id,
        branchId: pitch.branchId,
        meta: { change: "removed", pitch: pitch.name, rate: describeRule(rule), price: rule.pricePerSlot },
    });
}

/* ---------- staff ---------- */
export async function createStaff(user: ServerUser, input: StaffCreateInput) {
    assertSuperAdmin(user);
    const isAdmin = input.role === "SUPER_ADMIN";
    const branchIds = isAdmin ? [] : [...new Set(input.branchIds)];
    for (const id of branchIds) {
        if (!branches.some((b) => b.id === id)) throw new AppError("NOT_FOUND", "Unknown branch.", 400, { branchIds: "Unknown branch" });
    }

    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;
    const passwordHash = await hashPassword(input.password);
    assertUnique(input.phone, email); // hash first, then check + insert with no await between

    const u: User = {
        id: randomUUID(),
        name: input.name.trim(),
        email,
        phone: input.phone,
        passwordHash,
        role: input.role,
        branchIds,
        permissions: isAdmin ? [] : [...new Set(input.permissions)],
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
    };
    store.users.push(u);
    logAudit(user, {
        action: "STAFF_CREATED",
        entityType: "USER",
        entityId: u.id,
        meta: { name: u.name, role: u.role, branches: branchIds.join(", ") || "all", permissions: u.permissions.join(", ") || "none" },
    });
}

export async function updateStaff(user: ServerUser, input: StaffUpdateInput) {
    assertSuperAdmin(user);
    const u = store.users.find((x) => x.id === input.id && x.role !== "CUSTOMER");
    if (!u) throw new AppError("NOT_FOUND", "Staff account not found.", 404);
    if (u.id === user.id) {
        throw new AppError("SELF_EDIT", "You cannot change your own role or access here. Another Super Admin can do it.", 409);
    }

    const losesAdmin = u.role === "SUPER_ADMIN" && (input.role !== "SUPER_ADMIN" || input.status !== "ACTIVE");
    const otherAdmins = store.users.filter((x) => x.id !== u.id && x.role === "SUPER_ADMIN" && x.status === "ACTIVE");
    if (losesAdmin && otherAdmins.length === 0) {
        throw new AppError("LAST_ADMIN", "Keep at least one active Super Admin.", 409);
    }

    const isAdmin = input.role === "SUPER_ADMIN";
    const branchIds = isAdmin ? [] : [...new Set(input.branchIds)];
    for (const id of branchIds) {
        if (!branches.some((b) => b.id === id)) throw new AppError("NOT_FOUND", "Unknown branch.", 400, { branchIds: "Unknown branch" });
    }

    const newHash = input.newPassword ? await hashPassword(input.newPassword) : null;

    const before = { role: u.role, status: u.status, branches: u.branchIds.join(", "), permissions: u.permissions.join(", ") };
    const permissions = isAdmin ? [] : [...new Set(input.permissions)];
    const after = { role: input.role, status: input.status, branches: branchIds.join(", "), permissions: permissions.join(", ") };
    const changes = diff(before, after);

    u.role = input.role;
    u.status = input.status;
    u.branchIds = branchIds;
    u.permissions = permissions;

    if (Object.keys(changes).length > 0) {
        logAudit(user, { action: "ROLE_CHANGED", entityType: "USER", entityId: u.id, meta: { name: u.name, ...changes } });
    }
    if (newHash) {
        u.passwordHash = newHash;
        endOtherSessions(u.id); // signs them out everywhere
        logAudit(user, { action: "PASSWORD_RESET", entityType: "USER", entityId: u.id, meta: { name: u.name } });
    }
}

/* ---------- policies ---------- */
export function getPolicyForm(): PolicyForm {
    return {
        holdMinutes: policies.holdMinutes,
        advancePercent: policies.advancePercent,
        checkInOpensMinutesBefore: policies.checkInOpensMinutesBefore,
        bookingHorizonDays: policies.bookingHorizonDays,
        vatRatePercent: policies.vatRatePercent,
        vatMode: policies.vatMode,
        vatRegistrationNo: policies.vatRegistrationNo,
        refund: {
            tiers: refundConfig.tiers.map((t) => ({ ...t })),
            method: refundConfig.method ?? "",
            timing: refundConfig.timing ?? "",
            rainCheckEligibility: refundConfig.rainCheckEligibility ?? "",
            rainCheckExpiryDays: refundConfig.rainCheckExpiryDays,
            exceptions: [...refundConfig.exceptions],
        },
        legalReviewed: legalStatus.reviewed,
    };
}

export function updatePolicies(user: ServerUser, input: PolicyInput) {
    assertSuperAdmin(user);
    const before = getPolicyForm();

    const scalars = {
        holdMinutes: input.holdMinutes,
        advancePercent: input.advancePercent,
        checkInOpensMinutesBefore: input.checkInOpensMinutesBefore,
        bookingHorizonDays: input.bookingHorizonDays,
        vatRatePercent: input.vatRatePercent,
        vatMode: input.vatMode,
        vatRegistrationNo: input.vatRegistrationNo,
    };
    const changes = diff(before as unknown as Record<string, unknown>, { ...scalars, legalReviewed: input.legalReviewed });
    if (JSON.stringify(before.refund) !== JSON.stringify(input.refund)) changes.refundPolicy = "updated";

    // Only future bookings are affected: existing bookings keep their saved snapshots (spec 8.4, 10.3).
    Object.assign(policies, scalars);
    Object.assign(refundConfig, {
        tiers: input.refund.tiers,
        method: input.refund.method || null,
        timing: input.refund.timing || null,
        rainCheckEligibility: input.refund.rainCheckEligibility || null,
        rainCheckExpiryDays: input.refund.rainCheckExpiryDays,
        exceptions: input.refund.exceptions,
    });
    legalStatus.reviewed = input.legalReviewed;

    if (Object.keys(changes).length > 0) {
        logAudit(user, { action: "POLICY_CHANGED", entityType: "POLICY", entityId: "policies", meta: changes });
    }
}

/* ---------- page data ---------- */
function gapLines(p: Pitch, today: string): string[] {
    const step = policies.slotMinutes;
    const open = toMinutes(p.openTime);
    const close = toMinutes(p.closeTime);
    const lines: string[] = [];
    for (let dow = 0; dow < 7; dow++) {
        let total = 0;
        const missing: string[] = [];
        for (let m = open; m + step <= close; m += step) {
            total++;
            const priced = pricingRules.some(
                (r) =>
                    r.pitchId === p.id &&
                    r.days.includes(dow) &&
                    m >= toMinutes(r.startTime) &&
                    m < toMinutes(r.endTime) &&
                    inRange(r, today)
            );
            if (!priced) missing.push(toHHMM(m));
        }
        if (total > 0 && missing.length === total) lines.push(`${DAY[dow]}: no price for any slot`);
        else if (missing.length > 0) lines.push(`${DAY[dow]}: no price at ${missing.join(", ")}`);
    }
    return lines;
}

export function getSetupData(user: ServerUser, now: Date = new Date()): SetupData {
    assertSetupAccess(user);
    const isAdmin = user.role === "SUPER_ADMIN";
    const step = policies.slotMinutes;
    const today = todayDhaka(now);

    for (const b of store.bookings) settle(b, now); // expired holds do not count as upcoming

    const myBranches = branches.filter((b) => canAccessBranch(user, b.id));
    const branchIds = new Set(myBranches.map((b) => b.id));
    const myPitches = pitches.filter((p) => branchIds.has(p.branchId));
    const pitchById = new Map(myPitches.map((p) => [p.id, p]));

    const rates: SetupRate[] = pricingRules
        .filter((r) => pitchById.has(r.pitchId))
        .map((r) => {
            const p = pitchById.get(r.pitchId)!;
            const open = toMinutes(p.openTime);
            const s = toMinutes(r.startTime);
            const e = toMinutes(r.endTime);
            return {
                id: r.id,
                pitchId: r.pitchId,
                days: [...r.days],
                startTime: r.startTime,
                endTime: r.endTime,
                pricePerSlot: r.pricePerSlot,
                tier: r.tier,
                effectiveFrom: r.effectiveFrom ?? "",
                effectiveTo: r.effectiveTo ?? "",
                aligned: s >= open && e <= toMinutes(p.closeTime) && (s - open) % step === 0 && (e - open) % step === 0,
            };
        });

    const coverage: Record<string, string[]> = {};
    for (const p of myPitches) coverage[p.id] = gapLines(p, today);

    const staff: SetupStaff[] = isAdmin
        ? store.users
            .filter((u) => u.role !== "CUSTOMER")
            .map((u) => ({
                id: u.id,
                name: u.name,
                phone: u.phone,
                email: u.email ?? "",
                role: u.role as "STAFF" | "SUPER_ADMIN",
                branchIds: [...u.branchIds],
                permissions: [...u.permissions],
                status: u.status,
                isSelf: u.id === user.id,
            }))
        : [];

    const live = new Set(["CONFIRMED", "CHECKED_IN", "PENDING_PAYMENT"]);
    const tabs: SetupTab[] = isAdmin ? ["branches", "pitches", "rates", "staff", "policies"] : ["pitches", "rates"];

    return {
        tabs,
        isAdmin,
        slotMinutes: step,
        branches: myBranches.map((b) => ({ ...b, sports: [...b.sports] })),
        pitches: myPitches.map((p) => ({
            ...p,
            facilities: [...p.facilities],
            upcomingBookings: store.bookings.filter(
                (b) => b.pitchId === p.id && live.has(b.bookingStatus) && new Date(b.endAt) > now
            ).length,
        })),
        rates,
        coverage,
        staff,
        policies: isAdmin ? getPolicyForm() : null,
    };
}