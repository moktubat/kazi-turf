"use client";

import { useMemo } from "react";

/* ------------------------------------------------------------------ */
/*  DateStrip — extra big flex-row date calendar                      */
/*  Pure UI. No polling, no auto refresh, no intervals.               */
/* ------------------------------------------------------------------ */

export interface DateStripProps {
    /** Selected date as "YYYY-MM-DD" (local time). */
    value: string;
    /** Called with "YYYY-MM-DD" when a day card is clicked. */
    onChange: (date: string) => void;
    /** How many days to render. Default 14. */
    days?: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Local-time "YYYY-MM-DD". Never use toISOString() — it shifts timezone. */
export function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

interface DayCell {
    key: string;
    weekday: string;
    day: number;
    month: string;
    isToday: boolean;
    isWeekend: boolean;
}

export default function DateStrip({
    value,
    onChange,
    days = 14,
}: DateStripProps) {
    const dayList = useMemo<DayCell[]>(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const cells: DayCell[] = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            cells.push({
                key: toDateKey(d),
                weekday: WEEKDAYS[d.getDay()],
                day: d.getDate(),
                month: MONTHS[d.getMonth()],
                isToday: i === 0,
                // Bangladesh weekend = Friday + Saturday. Change to 0/6 for Sun/Sat.
                isWeekend: d.getDay() === 5 || d.getDay() === 6,
            });
        }
        return cells;
    }, [days]);

    return (
        <div
            className="flex gap-3 overflow-x-auto scroll-smooth pb-3
        [&::-webkit-scrollbar]:h-2.5
        [&::-webkit-scrollbar-track]:rounded-full
        [&::-webkit-scrollbar-track]:bg-slate-100
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:bg-slate-300
        [scrollbar-width:thin]
        [scrollbar-color:#cbd5e1:#f1f5f9]"
        >
            {dayList.map((cell) => {
                const active = cell.key === value;
                return (
                    <button
                        key={cell.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(cell.key)}
                        className={`flex w-[104px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-5 transition-all duration-150 ${active
                                ? "border-transparent bg-emerald-600 text-white shadow-lg shadow-emerald-600/25"
                                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"
                            }`}
                    >
                        <span
                            className={`text-sm font-semibold ${active
                                    ? "text-emerald-50"
                                    : cell.isWeekend
                                        ? "text-rose-500"
                                        : "text-slate-500"
                                }`}
                        >
                            {cell.weekday}
                        </span>

                        <span
                            className={`text-4xl font-extrabold leading-none ${active ? "text-white" : "text-slate-800"
                                }`}
                        >
                            {cell.day}
                        </span>

                        <span
                            className={`text-sm font-medium ${active ? "text-emerald-50" : "text-slate-500"
                                }`}
                        >
                            {cell.month}
                        </span>

                        {cell.isToday && (
                            <span
                                className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
                                    }`}
                            >
                                Today
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}