// READ-ONLY audit: bookings whose stored end time may be wrong because, before
// the slot-length fix, every booking's end was computed as last slot + 90 min,
// even on fields with a different slot length.
//
//   npx tsx --env-file=.env.local src/scripts/audit-booking-end-times.ts [--csv report.csv]
//
// Safety:
//   - Does NOT use the app's connectDb()/models (those create indexes and seed
//     config on startup, i.e. they write). Uses the raw MongoDB driver only.
//   - Every collection is wrapped in readOnly(): only find / findOne /
//     countDocuments / estimatedDocumentCount / distinct / aggregate are allowed,
//     and aggregate rejects $out / $merge. Any write method throws before it runs.
//   - Personal data (names, phones, emails) is never read into the report.
//   - The only file it may write is the optional local CSV you name with --csv.
import { MongoClient, type Collection, type Db, type Document } from "mongodb";

const DEFAULT_SLOT = 90; // what the old code used for EVERY booking's end time
const DHAKA_MS = 6 * 60 * 60 * 1000;

/* ---------- read-only guard ---------- */
const READ_METHODS = new Set(["find", "findOne", "countDocuments", "estimatedDocumentCount", "distinct", "aggregate"]);

export interface ReadOnlyDb {
    collection(name: string): Collection<Document>;
}

/** Wraps a Db so that any non-read collection method throws. */
export function readOnly(db: Db): ReadOnlyDb {
    return {
        collection(name: string) {
            const c = db.collection(name);
            return new Proxy(c, {
                get(target, prop, receiver) {
                    const v = Reflect.get(target, prop, receiver);
                    if (typeof v !== "function" || typeof prop !== "string") return v;
                    if (!READ_METHODS.has(prop)) {
                        return () => {
                            throw new Error(`Read-only audit: "${prop}" on "${name}" is blocked.`);
                        };
                    }
                    if (prop === "aggregate") {
                        return (pipeline: Document[] = [], opts?: Document) => {
                            if (pipeline.some((s) => "$out" in s || "$merge" in s)) {
                                throw new Error(`Read-only audit: $out/$merge on "${name}" is blocked.`);
                            }
                            return target.aggregate(pipeline, opts);
                        };
                    }
                    return v.bind(target);
                },
            }) as Collection<Document>;
        },
    };
}

/* ---------- helpers ---------- */
const dhaka = (iso: string | Date | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(new Date(iso).getTime() + DHAKA_MS);
    if (Number.isNaN(d.getTime())) return "invalid";
    return d.toISOString().slice(0, 16).replace("T", " ");
};
const dhakaMinuteOfDay = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + DHAKA_MS);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
};

type Confidence = "high" | "medium" | "low";
type Source = "slot gaps" | "audit history" | "current setting" | "unknown";

export interface AuditRow {
    bookingId: string;
    bookingCode: string;
    field: string;
    fieldExists: boolean;
    configuredSlotMinutes: number | null; // the field's slot length TODAY
    slotMinutesAtBooking: number | null;  // best evidence of the length when booked
    source: Source;
    confidence: Confidence;
    slotCount: number;
    start: string;      // Dhaka
    storedEnd: string;  // Dhaka
    expectedEnd: string; // Dhaka
    deltaMinutes: number | null; // stored − expected
    status: string;
    payment: string;
    source_channel: string;
    stillUpcoming: boolean; // expected end is in the future → affects check-in
    affected: "YES" | "NO" | "REVIEW";
    note: string;
}

interface SlotEvent { at: string; from?: number; to: number }

/** PITCH_CHANGED audit entries → per-pitch timeline of slot-length values. */
async function slotTimelines(db: ReadOnlyDb) {
    const events = await db
        .collection("auditlogs")
        .find(
            { action: "PITCH_CHANGED", entityType: "PITCH" },
            { projection: { _id: 0, entityId: 1, at: 1, "meta.change": 1, "meta.slotMinutes": 1, "meta.name": 1, "meta.pitch": 1 } }
        )
        .sort({ at: 1 })
        .toArray();
    const byPitch = new Map<string, SlotEvent[]>();
    const names = new Map<string, string>();
    for (const e of events) {
        const id = String(e.entityId ?? "");
        const meta = (e.meta ?? {}) as Record<string, unknown>;
        const nm = (meta.pitch ?? meta.name) as string | undefined;
        if (nm) names.set(id, nm);
        const sm = meta.slotMinutes;
        let ev: SlotEvent | null = null;
        if (typeof sm === "number") ev = { at: String(e.at), to: sm };               // "created"
        else if (typeof sm === "string") {
            const m = /^(\d+)\s*→\s*(\d+)$/.exec(sm.trim());                          // "90 → 60"
            if (m) ev = { at: String(e.at), from: Number(m[1]), to: Number(m[2]) };
        }
        if (ev) byPitch.set(id, [...(byPitch.get(id) ?? []), ev]);
    }
    return { byPitch, names };
}

/** Slot length in effect at `when`, from the audit timeline (null if no evidence). */
function lengthAt(events: SlotEvent[] | undefined, when: string): number | null {
    if (!events || events.length === 0) return null;
    let value: number | null = null;
    for (const e of events) {
        if (e.at <= when) value = e.to;
        else {
            if (value === null && e.from !== undefined) value = e.from; // booked before the first recorded change
            break;
        }
    }
    return value;
}

/* ---------- the audit ---------- */
export async function runAudit(db: ReadOnlyDb, now: Date = new Date()) {
    const cfg = await db.collection("configs").findOne({ key: "pitches" }, { projection: { _id: 0, value: 1 } });
    const fields = new Map<string, { name: string; slotMinutes: number | null }>();
    for (const p of ((cfg?.value as Document[]) ?? [])) {
        fields.set(String(p.id), { name: String(p.name ?? p.id), slotMinutes: typeof p.slotMinutes === "number" ? p.slotMinutes : null });
    }
    const { byPitch, names } = await slotTimelines(db);

    // Only the fields needed for the report — no customer names/phones.
    const bookings = await db
        .collection("bookings")
        .find(
            {},
            {
                projection: {
                    _id: 0, id: 1, bookingCode: 1, pitchId: 1, startAt: 1, endAt: 1, cellStarts: 1, slotCount: 1,
                    bookingStatus: 1, paymentStatus: 1, source: 1, createdAt: 1,
                },
            }
        )
        .sort({ startAt: 1 })
        .toArray();

    const rows: AuditRow[] = [];
    let skipped90 = 0;

    for (const b of bookings) {
        const pitchId = String(b.pitchId);
        const field = fields.get(pitchId);
        const configured = field?.slotMinutes ?? null;
        const cells: string[] = Array.isArray(b.cellStarts) && b.cellStarts.length ? [...b.cellStarts].map(String).sort() : [String(b.startAt)];
        const notes: string[] = [];

        // 1) Strongest evidence: the gap between this booking's own consecutive slots.
        let len: number | null = null;
        let source: Source = "unknown";
        let confidence: Confidence = "low";
        if (cells.length >= 2) {
            const gaps = cells.slice(1).map((c, i) => (new Date(c).getTime() - new Date(cells[i]).getTime()) / 60_000);
            if (gaps.every((g) => g === gaps[0]) && gaps[0] > 0) {
                len = gaps[0];
                source = "slot gaps";
                confidence = "high";
            } else notes.push(`uneven slot gaps (${gaps.join(", ")} min)`);
        }
        // 2) The field's slot length at the time the booking was made (audit log).
        const hist = lengthAt(byPitch.get(pitchId), String(b.createdAt ?? b.startAt));
        if (len === null && hist !== null) {
            len = hist;
            source = "audit history";
            confidence = "high";
        } else if (len !== null && hist !== null && hist !== len) {
            notes.push(`audit history says ${hist} min`);
            confidence = "medium";
        }
        // 3) Fall back to today's setting (assumes it never changed).
        if (len === null && configured !== null) {
            len = configured;
            source = "current setting";
            confidence = "medium";
            notes.push("no history: assumes the slot length never changed");
        }

        // Skip plain 90-minute bookings (old code was right for them).
        if (len === DEFAULT_SLOT && (configured === null || configured === DEFAULT_SLOT)) {
            skipped90++;
            continue;
        }

        // Sanity: slot starts must sit on that grid (24 h field, grid from 00:00).
        if (len !== null && cells.some((c) => dhakaMinuteOfDay(c) % len! !== 0)) {
            notes.push(`a slot start is not on a ${len}-min grid`);
            confidence = "low";
        }
        if (typeof b.slotCount === "number" && b.slotCount !== cells.length) {
            notes.push(`slotCount ${b.slotCount} ≠ ${cells.length} stored slots`);
            confidence = "low";
        }
        if (!field) notes.push("field no longer exists");

        const last = cells[cells.length - 1];
        const expected = len !== null ? new Date(new Date(last).getTime() + len * 60_000) : null;
        const stored = b.endAt ? new Date(String(b.endAt)) : null;
        const delta = expected && stored ? Math.round((stored.getTime() - expected.getTime()) / 60_000) : null;

        let affected: AuditRow["affected"] = "REVIEW";
        if (expected && stored && confidence !== "low") affected = delta === 0 ? "NO" : "YES";

        rows.push({
            bookingId: String(b.id),
            bookingCode: String(b.bookingCode ?? ""),
            field: field?.name ?? names.get(pitchId) ?? pitchId,
            fieldExists: !!field,
            configuredSlotMinutes: configured,
            slotMinutesAtBooking: len,
            source,
            confidence,
            slotCount: cells.length,
            start: dhaka(String(b.startAt)),
            storedEnd: dhaka(stored),
            expectedEnd: dhaka(expected),
            deltaMinutes: delta,
            status: String(b.bookingStatus ?? ""),
            payment: String(b.paymentStatus ?? ""),
            source_channel: String(b.source ?? ""),
            stillUpcoming: !!expected && expected > now,
            affected,
            note: notes.join("; "),
        });
    }

    return {
        rows,
        summary: {
            bookingsScanned: bookings.length,
            ninetyMinuteSkipped: skipped90,
            listed: rows.length,
            affected: rows.filter((r) => r.affected === "YES").length,
            affectedUpcoming: rows.filter((r) => r.affected === "YES" && r.stillUpcoming).length,
            notAffected: rows.filter((r) => r.affected === "NO").length,
            needsReview: rows.filter((r) => r.affected === "REVIEW").length,
        },
    };
}

/* ---------- CLI ---------- */
const COLS: [keyof AuditRow, string][] = [
    ["bookingId", "Booking ID"], ["bookingCode", "Code"], ["field", "Field"],
    ["configuredSlotMinutes", "Slot now (min)"], ["slotMinutesAtBooking", "Slot when booked (min)"], ["source", "Evidence"],
    ["confidence", "Confidence"], ["slotCount", "Slots"], ["start", "Start (Dhaka)"], ["storedEnd", "Stored end"],
    ["expectedEnd", "Expected end"], ["deltaMinutes", "Stored − expected (min)"], ["status", "Status"], ["payment", "Payment"],
    ["stillUpcoming", "Upcoming"], ["affected", "Affected"], ["note", "Note"],
];

function toCsv(rows: AuditRow[]) {
    const esc = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [COLS.map(([, h]) => h).join(","), ...rows.map((r) => COLS.map(([k]) => esc(r[k])).join(","))].join("\n");
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set (run with --env-file=.env.local).");
    const csvIdx = process.argv.indexOf("--csv");
    const csvPath = csvIdx > -1 ? process.argv[csvIdx + 1] : null;

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, appName: "kazi-turf-readonly-audit" });
    await client.connect();
    try {
        const db = readOnly(client.db()); // database name comes from the URI
        const { rows, summary } = await runAudit(db);
        console.log("\nREAD-ONLY booking end-time audit (no data was changed)\n");
        console.table(summary);
        if (rows.length) {
            console.table(rows.map((r) => Object.fromEntries(COLS.map(([k, h]) => [h, r[k]]))));
        } else {
            console.log("No bookings on non-90-minute fields were found.");
        }
        if (csvPath) {
            const { writeFileSync } = await import("node:fs");
            writeFileSync(csvPath, toCsv(rows), "utf8"); // local file only
            console.log(`\nCSV written to ${csvPath}`);
        }
    } finally {
        await client.close();
    }
}

if (process.argv[1] && /audit-booking-end-times/.test(process.argv[1])) {
    main().catch((e) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
    });
}
