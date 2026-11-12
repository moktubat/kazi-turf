import "server-only";
import { randomUUID } from "crypto";
import { branches } from "@/data/branches";
import { legalStatus, refundConfig } from "@/data/legal";
import { pitches } from "@/data/pitches";
import { pricingRules } from "@/data/pricing";
import { policies } from "@/data/site";
import { daysLabel } from "@/lib/grid";
import { slugify } from "@/lib/slug";
import { dhakaParts, toHHMM, toMinutes } from "@/lib/time";
import { BookingModel, SlotClaimModel, UserModel } from "@/models";
import type {
    BranchUpdateInput, PitchInput, PitchUpdateInput, PolicyInput,
    RateInput, RateUpdateInput, StaffCreateInput, StaffUpdateInput,
} from "@/schemas/setup";
import { logAudit } from "@/server/audit";
import { canAccessBranch } from "@/server/auth/guards";
import { hashPassword } from "@/server/auth/password";
import { assertPitchEditor, assertSetupAccess } from "@/server/auth/permissions";
import { endOtherSessions, type ServerUser } from "@/server/auth/session";
import { assertUnique, mapDup } from "@/server/auth/users";
import { settleExpired } from "@/server/bookings/expire";
import { deleteImage, publicIdFromImage } from "@/server/cloudinary";
import { ensureConfig, persistConfig } from "@/server/config";
import { connectDb } from "@/server/db/connect";
import { AppError } from "@/server/http";
import type { Branch, Pitch, PricingRule } from "@/types";
import type { AuditMeta } from "@/types/ops";
import type { PolicyForm, SetupData, SetupRate, SetupStaff, SetupTab } from "@/types/setup";
import type { User } from "@/types/user";
import { assertSuperAdmin } from "./access";
import { todayDhaka } from "@/lib/time.server";
import { revalidatePath } from "next/cache";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type StaffDoc = Pick<User, "id" | "name" | "phone" | "email" | "branchIds" | "permissions" | "status"> & {
    role: "STAFF" | "SUPER_ADMIN";
};

/** Every edit starts from the freshest saved config, so another instance's change is not overwritten. */
async function begin() {
    await connectDb();
    await ensureConfig(true);
}

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

/* ---------- venue ---------- */
export async function updateBranch(user: ServerUser, input: BranchUpdateInput) {
    assertSuperAdmin(user);
    await begin();
    const b = branches.find((x) => x.id === input.id);
    if (!b) throw new AppError("NOT_FOUND", "Venue not found.", 404);

    const sports = uniq(input.sportConfigs.filter((s) => s.active).map((s) => s.name));
    for (const p of pitches) {
        if (p.branchId === b.id && !sports.includes(p.sport)) {
            throw new AppError("SPORT_IN_USE", `${p.name} is a ${p.sport} pitch. Change the pitch first.`, 409, {
                sports: `${p.name} uses ${p.sport}`,
            });
        }
    }

    // [CLOUDINARY] Capture old sport background image URLs so we can delete any replaced/removed asset.
    const oldImages = new Map<string, string>();
    for (const s of b.sportConfigs ?? []) {
        if (s.image) oldImages.set(s.id, s.image);
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
        sportConfigs: input.sportConfigs,
    };
    const changes = diff(b as unknown as Record<string, unknown>, next);
    Object.assign(b, next);
    await persistConfig("branches");

    // Bust cached public pages so the new sport order / venue details show up immediately.
    // The admin dashboard already refreshes itself via router.refresh() — this is for the homepage
    // and /book, which are served by a different serverless instance and would otherwise show stale data.
    revalidatePath("/");
    revalidatePath("/book");

    // [CLOUDINARY] Delete any sport background that was replaced or removed.
    const newImageById = new Map<string, string | null>();
    for (const s of input.sportConfigs) {
        newImageById.set(s.id, s.image || null);
    }
    for (const [key, oldImg] of oldImages) {
        const newImg = newImageById.get(key) ?? null;
        if (oldImg && oldImg !== newImg) {
            const oldPublicId = publicIdFromImage(oldImg);
            if (oldPublicId) await deleteImage(oldPublicId);
        }
    }

    if (Object.keys(changes).length > 0) {
        await logAudit(user, { action: "BRANCH_CHANGED", entityType: "BRANCH", entityId: b.id, branchId: b.id, meta: changes });
    }
}

/* ---------- pitches ---------- */
function assertPitchRules(branch: Branch, input: { name: string; sport: string }, selfId?: string) {
    if (!branch.sports.includes(input.sport)) {
        throw new AppError("SPORT_NOT_OFFERED", `Add "${input.sport}" to the venue's sports first.`, 400, {
            sport: "Not offered at this venue",
        });
    }
    const clash = pitches.some(
        (p) => p.branchId === branch.id && p.id !== selfId && p.name.toLowerCase() === input.name.toLowerCase()
    );
    if (clash) throw new AppError("NAME_TAKEN", "Another pitch here already has this name.", 409, { name: "Already used" });
}

/** New hours must still fit every upcoming booking, hold and block. */
async function assertScheduleSafe(pitchId: string, openTime: string, closeTime: string, now: Date) {
    const pitch = pitches.find((p) => p.id === pitchId);
    const step = pitch?.slotMinutes ?? policies.slotMinutes;
    const open = toMinutes(openTime);
    const close = toMinutes(closeTime);
    const since = new Date(now.getTime() - step * 60_000).toISOString();

    const claims = await SlotClaimModel.find({
        pitchId,
        cellStart: { $gte: since },
    }).lean<Array<{ cellStart: string; state: string; expiresAt?: string }>>();
    for (const c of claims) {
        const t = new Date(c.cellStart);
        if (t.getTime() + step * 60_000 <= now.getTime()) continue;
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

export async function createPitch(user: ServerUser, input: PitchInput) {
    assertPitchEditor(user, input.branchId);
    await begin();
    const branch = branches.find((b) => b.id === input.branchId);
    if (!branch) throw new AppError("NOT_FOUND", "Venue not found.", 404);
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
        openTime: "00:00",     // 24-hour turf
        closeTime: "24:00",
        slotMinutes: input.slotMinutes,
        maxConsecutiveSlots: input.maxConsecutiveSlots,
        facilities: uniq(input.facilities),
        image: input.image || null,
        status: input.status,
    };
    pitches.push(p);
    await persistConfig("pitches");
    await logAudit(user, {
        action: "PITCH_CHANGED",
        entityType: "PITCH",
        entityId: p.id,
        branchId: p.branchId,
        meta: { change: "created", name: p.name, sport: p.sport, slotMinutes: p.slotMinutes },
    });
}

export async function updatePitch(user: ServerUser, input: PitchUpdateInput, now: Date = new Date()) {
    await begin();
    const p = pitches.find((x) => x.id === input.id);
    if (!p) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertPitchEditor(user, p.branchId);

    const branch = branches.find((b) => b.id === p.branchId);
    if (!branch) throw new AppError("NOT_FOUND", "Venue not found.", 404);
    assertPitchRules(branch, input, p.id);

    // 24-hour turf — openTime / closeTime are constants, no schedule conflict possible.
    // But changing slotMinutes can shift the grid, so still check that no upcoming
    // booking falls off the new grid.
    if (p.slotMinutes !== input.slotMinutes) {
        await assertScheduleSafe(p.id, "00:00", "24:00", now);
    }

    // [CLOUDINARY] Capture the old image URL BEFORE we overwrite the pitch.
    const oldImage = p.image;

    const next = {
        name: input.name,
        sport: input.sport,
        format: input.format,
        dimensions: input.dimensions,
        surface: input.surface,
        openTime: "00:00",
        closeTime: "24:00",
        slotMinutes: input.slotMinutes,
        maxConsecutiveSlots: input.maxConsecutiveSlots,
        facilities: uniq(input.facilities),
        image: input.image || null,
        status: input.status,
    };
    const changes = diff(p as unknown as Record<string, unknown>, next);
    Object.assign(p, next);
    await persistConfig("pitches");

    // [CLOUDINARY] If the image URL changed, delete the old Cloudinary asset.
    if (oldImage && oldImage !== next.image) {
        const oldPublicId = publicIdFromImage(oldImage);
        if (oldPublicId) await deleteImage(oldPublicId);
    }

    if (Object.keys(changes).length > 0) {
        await logAudit(user, {
            action: "PITCH_CHANGED",
            entityType: "PITCH",
            entityId: p.id,
            branchId: p.branchId,
            meta: { pitch: p.name, ...changes },
        });
    }
}

export async function deletePitch(user: ServerUser, id: string, now: Date = new Date()) {
    await begin();
    const idx = pitches.findIndex((x) => x.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND", "Pitch not found.", 404);

    const p = pitches[idx];
    assertPitchEditor(user, p.branchId);

    // Refuse if there are any upcoming live bookings.
    const upcoming = await BookingModel.countDocuments({
        pitchId: id,
        bookingStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] },
        startAt: { $gte: now.toISOString() },
    });
    if (upcoming > 0) {
        throw new AppError(
            "PITCH_IN_USE",
            `This pitch has ${upcoming} upcoming booking${upcoming === 1 ? "" : "s"}. Disable it instead of deleting, or cancel the bookings first.`,
            409
        );
    }

    // Cascade: delete every slot claim AND every pricing rule (slot price) for this pitch.
    await SlotClaimModel.deleteMany({ pitchId: id });

    // Capture BEFORE we mutate the arrays.
    const cloudinaryPublicId = p.image ? publicIdFromImage(p.image) : null;
    const removedRulesCount = pricingRules.reduce(
        (n, r) => (r.pitchId === id ? n + 1 : n),
        0
    );

    // Splice out the pricing rules (slots) for this pitch, then the pitch itself.
    for (let i = pricingRules.length - 1; i >= 0; i--) {
        if (pricingRules[i].pitchId === id) pricingRules.splice(i, 1);
    }
    pitches.splice(idx, 1);
    await persistConfig("pitches", "pricingRules");

    // Best-effort Cloudinary cleanup.
    if (cloudinaryPublicId) {
        await deleteImage(cloudinaryPublicId);
    }

    await logAudit(user, {
        action: "PITCH_CHANGED",
        entityType: "PITCH",
        entityId: p.id,
        branchId: p.branchId,
        meta: {
            change: "deleted",
            name: p.name,
            sport: p.sport,
            ratesRemoved: removedRulesCount,
            cloudinaryPublicId: cloudinaryPublicId ?? null,
        },
    });
}

/**
 * Cascade-delete a sport and everything attached to it:
 *   1. Every pitch of that sport (and each pitch's slot claims + pricing rules + Cloudinary image)
 *   2. The sport's own hero background image on Cloudinary
 *   3. The sport entry in branch.sportConfigs and branch.sports
 *
 * Refuses if any pitch of that sport has an upcoming live booking — cancel those first
 * or disable the sport instead.
 */
export async function deleteSport(user: ServerUser, sportId: string, now: Date = new Date()) {
    assertSuperAdmin(user);
    await begin();

    const branch = branches[0];
    if (!branch) throw new AppError("NOT_FOUND", "Venue not found.", 404);

    const sportConfig = (branch.sportConfigs ?? []).find((s) => s.id === sportId);
    if (!sportConfig) throw new AppError("NOT_FOUND", `Sport "${sportId}" not found.`, 404);

    const sportName = sportConfig.name;
    const doomedPitches = pitches.filter(
        (p) => p.branchId === branch.id && p.sport === sportName
    );
    const pitchIds = doomedPitches.map((p) => p.id);

    // Refuse if any of those pitches still have upcoming live bookings.
    if (pitchIds.length > 0) {
        const upcoming = await BookingModel.countDocuments({
            pitchId: { $in: pitchIds },
            bookingStatus: { $in: ["PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] },
            startAt: { $gte: now.toISOString() },
        });
        if (upcoming > 0) {
            throw new AppError(
                "SPORT_IN_USE",
                `${sportName} has ${upcoming} upcoming booking${upcoming === 1 ? "" : "s"}. Cancel them first, or disable the sport instead of deleting.`,
                409
            );
        }
    }

    // 1. Cascade: delete slot claims for every doomed pitch.
    if (pitchIds.length > 0) {
        await SlotClaimModel.deleteMany({ pitchId: { $in: pitchIds } });
    }

    // 2. Capture Cloudinary public_ids for every pitch image BEFORE we splice.
    const pitchImagePublicIds: string[] = [];
    for (const p of doomedPitches) {
        if (p.image) {
            const pid = publicIdFromImage(p.image);
            if (pid) pitchImagePublicIds.push(pid);
        }
    }

    // 3. Splice out pricing rules (slot prices) for those pitches.
    const removedRulesCount = pricingRules.reduce(
        (n, r) => (pitchIds.includes(r.pitchId) ? n + 1 : n),
        0
    );
    for (let i = pricingRules.length - 1; i >= 0; i--) {
        if (pitchIds.includes(pricingRules[i].pitchId)) pricingRules.splice(i, 1);
    }

    // 4. Splice out the pitches themselves.
    for (let i = pitches.length - 1; i >= 0; i--) {
        if (pitchIds.includes(pitches[i].id)) pitches.splice(i, 1);
    }

    // 5. Capture the sport's hero background public_id BEFORE we mutate the branch.
    const sportImagePublicId = sportConfig.image ? publicIdFromImage(sportConfig.image) : null;

    // 6. Remove the sport from branch.sportConfigs and branch.sports.
    branch.sportConfigs = (branch.sportConfigs ?? []).filter((s) => s.id !== sportId);
    branch.sports = branch.sports.filter((s) => s !== sportName);

    await persistConfig("pitches", "pricingRules", "branches");

    // Bust cached public pages so the homepage / book page reflect the removed sport.
    revalidatePath("/");
    revalidatePath("/book");
    revalidatePath("/admin/setup", "page");

    // 7. Best-effort Cloudinary cleanup — pitch images + sport hero background.
    for (const pid of pitchImagePublicIds) {
        await deleteImage(pid);
    }
    if (sportImagePublicId) {
        await deleteImage(sportImagePublicId);
    }

    await logAudit(user, {
        action: "BRANCH_CHANGED",
        entityType: "BRANCH",
        entityId: branch.id,
        branchId: branch.id,
        meta: {
            change: "sport_deleted",
            sport: sportName,
            sportId,
            pitchesRemoved: doomedPitches.length,
            ratesRemoved: removedRulesCount,
            cloudinaryImagesDeleted: pitchImagePublicIds.length + (sportImagePublicId ? 1 : 0),
        },
    });
}

/* ---------- rates ---------- */
const describeRule = (r: Pick<PricingRule, "days" | "startTime" | "endTime" | "tier">) =>
    `${daysLabel(r.days)} ${r.startTime}–${r.endTime} ${r.tier}`;

function assertRule(pitch: Pitch, input: RateInput, selfId?: string) {
    const step = pitch.slotMinutes ?? policies.slotMinutes;
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
        discountType: input.discountType ?? null,
        discountDirection: input.discountDirection ?? null,
        discountValue: input.discountValue ?? null,
    };
}

export async function createRate(user: ServerUser, input: RateInput) {
    await begin();
    const pitch = pitches.find((p) => p.id === input.pitchId);
    if (!pitch) throw new AppError("NOT_FOUND", "Pitch not found.", 404);
    assertPitchEditor(user, pitch.branchId);
    assertRule(pitch, input);

    const rule: PricingRule = { id: `${pitch.id}-${randomUUID().slice(0, 8)}`, pitchId: pitch.id, ...ruleFields(input) };
    pricingRules.push(rule);
    await persistConfig("pricingRules");
    await logAudit(user, {
        action: "PRICE_CHANGED",
        entityType: "PITCH",
        entityId: pitch.id,
        branchId: pitch.branchId,
        meta: { change: "added", pitch: pitch.name, rate: describeRule(rule), price: rule.pricePerSlot },
    });
}

export async function updateRate(user: ServerUser, input: RateUpdateInput) {
    await begin();
    const rule = pricingRules.find((r) => r.id === input.id);
    const pitch = rule && pitches.find((p) => p.id === rule.pitchId);
    if (!rule || !pitch) throw new AppError("NOT_FOUND", "Rate not found.", 404);
    assertPitchEditor(user, pitch.branchId);
    assertRule(pitch, { ...input, pitchId: pitch.id }, rule.id);

    const before = `${describeRule(rule)} ৳${rule.pricePerSlot}`;
    Object.assign(rule, ruleFields(input));
    await persistConfig("pricingRules");
    await logAudit(user, {
        action: "PRICE_CHANGED",
        entityType: "PITCH",
        entityId: pitch.id,
        branchId: pitch.branchId,
        meta: { change: "updated", pitch: pitch.name, before, after: `${describeRule(rule)} ৳${rule.pricePerSlot}` },
    });
}

export async function deleteRate(user: ServerUser, id: string) {
    await begin();
    const i = pricingRules.findIndex((r) => r.id === id);
    const rule = pricingRules[i];
    const pitch = rule && pitches.find((p) => p.id === rule.pitchId);
    if (!rule || !pitch) throw new AppError("NOT_FOUND", "Rate not found.", 404);
    assertPitchEditor(user, pitch.branchId);

    pricingRules.splice(i, 1);
    await persistConfig("pricingRules");
    await logAudit(user, {
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
    await begin();
    const isAdmin = input.role === "SUPER_ADMIN";
    const branchIds = isAdmin ? [] : [...new Set(input.branchIds)];
    for (const id of branchIds) {
        if (!branches.some((b) => b.id === id)) throw new AppError("NOT_FOUND", "Unknown venue.", 400, { branchIds: "Unknown venue" });
    }

    const email = input.email.trim() ? input.email.trim().toLowerCase() : null;
    const passwordHash = await hashPassword(input.password);
    await assertUnique(input.phone, email ?? "");

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
    try {
        await UserModel.create(u);
    } catch (e) {
        mapDup(e);
    }
    await logAudit(user, {
        action: "STAFF_CREATED",
        entityType: "USER",
        entityId: u.id,
        meta: { name: u.name, role: u.role, branches: branchIds.join(", ") || "all", permissions: u.permissions.join(", ") || "none" },
    });
}

export async function updateStaff(user: ServerUser, input: StaffUpdateInput) {
    assertSuperAdmin(user);
    await begin();
    const u = await UserModel.findOne({
        id: input.id,
        role: { $ne: "CUSTOMER" },
    }).lean<User | null>();

    if (!u) throw new AppError("NOT_FOUND", "Staff account not found.", 404);
    if (u.id === user.id) {
        throw new AppError("SELF_EDIT", "You cannot change your own role or access here. Another Super Admin can do it.", 409);
    }

    const losesAdmin = u.role === "SUPER_ADMIN" && (input.role !== "SUPER_ADMIN" || input.status !== "ACTIVE");
    if (losesAdmin) {
        const others = await UserModel.countDocuments({ id: { $ne: u.id }, role: "SUPER_ADMIN", status: "ACTIVE" });
        if (others === 0) throw new AppError("LAST_ADMIN", "Keep at least one active Super Admin.", 409);
    }

    const isAdmin = input.role === "SUPER_ADMIN";
    const branchIds = isAdmin ? [] : [...new Set(input.branchIds)];
    for (const id of branchIds) {
        if (!branches.some((b) => b.id === id)) throw new AppError("NOT_FOUND", "Unknown venue.", 400, { branchIds: "Unknown venue" });
    }

    const newHash = input.newPassword ? await hashPassword(input.newPassword) : null;
    const permissions = isAdmin ? [] : [...new Set(input.permissions)];

    const before = { role: u.role, status: u.status, branches: (u.branchIds ?? []).join(", "), permissions: (u.permissions ?? []).join(", ") };
    const after = { role: input.role, status: input.status, branches: branchIds.join(", "), permissions: permissions.join(", ") };
    const changes = diff(before, after);

    await UserModel.updateOne(
        { id: u.id },
        { $set: { role: input.role, status: input.status, branchIds, permissions, ...(newHash ? { passwordHash: newHash } : {}) } }
    );

    if (Object.keys(changes).length > 0) {
        await logAudit(user, { action: "ROLE_CHANGED", entityType: "USER", entityId: u.id, meta: { name: u.name, ...changes } });
    }
    if (newHash) {
        await endOtherSessions(u.id);
        await logAudit(user, { action: "PASSWORD_RESET", entityType: "USER", entityId: u.id, meta: { name: u.name } });
    }
}

/* ---------- policies ---------- */
export function getPolicyForm(): PolicyForm {
    return {
        holdMinutes: policies.holdMinutes,
        advancePercent: policies.advancePercent,
        nightAdvancePercent: policies.nightAdvancePercent ?? 100,
        checkInOpensMinutesBefore: policies.checkInOpensMinutesBefore,
        bookingHorizonDays: policies.bookingHorizonDays,
        vatRatePercent: policies.vatRatePercent,
        vatMode: policies.vatMode,
        vatRegistrationNo: policies.vatRegistrationNo,
        refund: {
            tiers: refundConfig.tiers.map((t) => ({ ...t })),
            method: refundConfig.method ?? "",
            timing: refundConfig.timing ?? "",
            exceptions: [...refundConfig.exceptions],
        },
        legalReviewed: legalStatus.reviewed,
    };
}

export async function updatePolicies(user: ServerUser, input: PolicyInput) {
    assertSuperAdmin(user);
    await begin();
    const before = getPolicyForm();

    const scalars = {
        holdMinutes: input.holdMinutes,
        advancePercent: input.advancePercent,
        nightAdvancePercent: input.nightAdvancePercent,
        checkInOpensMinutesBefore: input.checkInOpensMinutesBefore,
        bookingHorizonDays: input.bookingHorizonDays,
        vatRatePercent: input.vatRatePercent,
        vatMode: input.vatMode,
        vatRegistrationNo: input.vatRegistrationNo,
    };
    const changes = diff(before as unknown as Record<string, unknown>, { ...scalars, legalReviewed: input.legalReviewed });
    if (JSON.stringify(before.refund) !== JSON.stringify(input.refund)) changes.refundPolicy = "updated";

    Object.assign(policies, scalars);
    Object.assign(refundConfig, {
        tiers: input.refund.tiers,
        method: input.refund.method || null,
        timing: input.refund.timing || null,
        exceptions: input.refund.exceptions,
    });
    legalStatus.reviewed = input.legalReviewed;
    await persistConfig("policies", "refundConfig", "legalStatus");

    if (Object.keys(changes).length > 0) {
        await logAudit(user, { action: "POLICY_CHANGED", entityType: "POLICY", entityId: "policies", meta: changes });
    }
}

/* ---------- page data ---------- */
function gapLines(p: Pitch, today: string): string[] {
    const step = p.slotMinutes ?? policies.slotMinutes;
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

export async function getSetupData(user: ServerUser, now: Date): Promise<SetupData> {
    assertSetupAccess(user);
    await connectDb();
    const isAdmin = user.role === "SUPER_ADMIN";
    const step = policies.slotMinutes;
    const today = await todayDhaka(now);

    await settleExpired({}, now);

    const myVenue = branches.find((b) => canAccessBranch(user, b.id)) ?? null;
    const venueId = myVenue?.id;
    const myPitches = venueId ? pitches.filter((p) => p.branchId === venueId) : [];
    const pitchById = new Map(myPitches.map((p) => [p.id, p]));

    const rates: SetupRate[] = pricingRules
        .filter((r) => pitchById.has(r.pitchId))
        .map((r) => {
            const p = pitchById.get(r.pitchId)!;
            const pStep = p.slotMinutes ?? policies.slotMinutes;
            const open = toMinutes(p.openTime);
            const close = toMinutes(p.closeTime);
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
                aligned: s >= open && e <= close && (s - open) % pStep === 0 && (e - open) % pStep === 0,
                discountType: r.discountType ?? null,
                discountDirection: r.discountDirection ?? null,
                discountValue: r.discountValue ?? null,
            };
        });

    const coverage: Record<string, string[]> = {};
    for (const p of myPitches) coverage[p.id] = gapLines(p, today);

    const staffDocs: StaffDoc[] = isAdmin
        ? await UserModel.find({ role: { $ne: "CUSTOMER" } }).sort({ name: 1 }).lean<StaffDoc[]>()
        : [];
    const staff: SetupStaff[] = staffDocs.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email ?? "",
        role: u.role,
        branchIds: [...(u.branchIds ?? [])],
        permissions: [...(u.permissions ?? [])],
        status: u.status,
        isSelf: u.id === user.id,
    }));

    const counts = await BookingModel.aggregate<{ _id: string; n: number }>([
        {
            $match: {
                pitchId: { $in: myPitches.map((p) => p.id) },
                bookingStatus: { $in: ["CONFIRMED", "CHECKED_IN", "PENDING_PAYMENT"] },
                endAt: { $gt: now.toISOString() },
            },
        },
        { $group: { _id: "$pitchId", n: { $sum: 1 } } },
    ]);
    const upcoming = new Map(counts.map((c) => [c._id, c.n]));

    const tabs: SetupTab[] = isAdmin
        ? ["venue", "pitches", "rates", "staff", "policies"]
        : ["pitches", "rates"];

    return {
        tabs,
        slotMinutes: step,
        venue: myVenue,
        pitches: myPitches.map((p) => ({
            ...p,
            facilities: [...p.facilities],
            upcomingBookings: upcoming.get(p.id) ?? 0,
        })),
        rates,
        coverage,
        staff,
        policies: isAdmin ? getPolicyForm() : null,
    };
}