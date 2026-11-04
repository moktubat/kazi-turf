"use client";
import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";


export function HoldCountdown({
    expiresAt,
    serverNow,
    onExpire,
}: {
    expiresAt: string;
    serverNow: string;
    onExpire: () => void;
}) {
    // Date.parse on a string is pure — same input always yields the same output.
    const expiresMs = Date.parse(expiresAt);
    const serverMs = Date.parse(serverNow);
    const valid = Number.isFinite(expiresMs) && Number.isFinite(serverMs);

    // Keep the latest onExpire in a ref so the interval doesn't capture a stale one.
    // Written inside an effect, never during render.
    const onExpireRef = useRef(onExpire);
    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    // Offset between server clock and client clock, computed once per (expires, now) pair.
    const offsetRef = useRef(0);
    const firedRef = useRef(false);

    // `left` is null until the first effect tick — we display "00:00" for that brief moment.
    const [left, setLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!valid) return;

        // Compute the clock offset here — Date.now() is allowed inside an effect.
        offsetRef.current = serverMs - Date.now();
        firedRef.current = false;

        const tick = () => {
            const ms = Math.max(0, expiresMs - (Date.now() + offsetRef.current));
            setLeft(ms);
            if (ms === 0 && !firedRef.current) {
                firedRef.current = true;
                onExpireRef.current();
            }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [valid, expiresMs, serverMs]);

    // Bad data: show a static label, never "NaN:NaN".
    if (!valid) {
        return (
            <p
                role="timer"
                className="inline-flex items-center gap-2 rounded-full bg-held-soft px-3 py-1.5 text-sm font-semibold text-held"
            >
                <Timer size={16} aria-hidden /> Slot is held — finish payment to confirm
            </p>
        );
    }

    const total = left === null ? 0 : Math.ceil(left / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, "0");
    const ss = String(total % 60).padStart(2, "0");

    return (
        <p
            role="timer"
            className="inline-flex items-center gap-2 rounded-full bg-held-soft px-3 py-1.5 text-sm font-semibold text-held"
        >
            <Timer size={16} aria-hidden /> Slot held for {mm}:{ss}
        </p>
    );
}