"use client";
import { useEffect, useState } from "react";

/** A 1-second countdown for "Resend code in 42s". `start(60)` (from an event handler) restarts it. */
export function useCountdown(initialSeconds = 0): [secondsLeft: number, start: (seconds: number) => void] {
    const [left, setLeft] = useState(initialSeconds);
    useEffect(() => {
        if (left <= 0) return;
        const t = setTimeout(() => setLeft((s) => Math.max(0, s - 1)), 1000);
        return () => clearTimeout(t);
    }, [left]);
    return [left, setLeft];
}
