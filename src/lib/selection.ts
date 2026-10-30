// Pure slot-selection rules: one slot, or consecutive slots up to the pitch maximum.
import type { Cell } from "@/server/availability";

export function toggleCell(selected: string[], cells: Cell[], target: Cell, max: number): string[] {
    if (target.status !== "AVAILABLE") return selected;

    const indexOf = (iso: string) => cells.findIndex((c) => c.cellStart === iso);
    const picked = selected.map(indexOf).filter((i) => i >= 0).sort((a, b) => a - b);
    const t = indexOf(target.cellStart);
    const toIso = (list: number[]) => list.map((i) => cells[i].cellStart);

    if (picked.length === 0) return [target.cellStart];

    const first = picked[0];
    const last = picked[picked.length - 1];

    if (picked.includes(t)) {
        if (picked.length === 1) return []; // tap again to clear
        if (t === first || t === last) return toIso(picked.filter((i) => i !== t)); // trim an end
        return [target.cellStart]; // tapped the middle: restart from this slot
    }

    const adjacent = t === first - 1 || t === last + 1;
    if (adjacent && picked.length < max) return toIso([...picked, t].sort((a, b) => a - b));

    return [target.cellStart]; // not adjacent or at the limit: start over here
}