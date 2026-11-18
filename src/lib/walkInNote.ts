// Staff note on a walk-in booking (e.g. "Paid", "Unpaid · pay at check-in").
// Quick picks fill the note with one tap; staff can still type anything.

export const WALKIN_NOTE_MAX = 200;

export const WALKIN_NOTE_PICKS = ["Paid", "Unpaid", "Paid by bKash", "Balance at check-in"] as const;
export type WalkInNotePick = (typeof WALKIN_NOTE_PICKS)[number];

/** "Paid" and "Unpaid" contradict each other, so picking one drops the other. */
const OPPOSITE: Partial<Record<WalkInNotePick, WalkInNotePick>> = { Paid: "Unpaid", Unpaid: "Paid" };

const SEP = " · ";

function parts(note: string): string[] {
    return note
        .split(SEP)
        .map((p) => p.trim())
        .filter(Boolean);
}

/** True when the pick is one of the note's " · "-separated parts (exact, case-insensitive). */
export function hasNotePick(note: string, pick: WalkInNotePick): boolean {
    const want = pick.toLowerCase();
    return parts(note).some((p) => p.toLowerCase() === want);
}

/**
 * Tap a quick pick: adds it to the note, or removes it when it is already there.
 * Free text staff typed is kept. Never grows past WALKIN_NOTE_MAX.
 */
export function toggleNotePick(note: string, pick: WalkInNotePick): string {
    const same = (p: string, q: string) => p.toLowerCase() === q.toLowerCase();
    let list = parts(note);
    if (list.some((p) => same(p, pick))) {
        return list.filter((p) => !same(p, pick)).join(SEP);
    }
    const opposite = OPPOSITE[pick];
    if (opposite) list = list.filter((p) => !same(p, opposite));
    const next = [...list, pick].join(SEP);
    return next.length > WALKIN_NOTE_MAX ? note : next;
}
