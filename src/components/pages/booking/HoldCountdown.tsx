"use client";
import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";

/**
 * Display only. The server decides expiry. We offset by the server clock so a wrong
 * device clock does not skew the display, and call onExpire once at zero.
 */
export function HoldCountdown({
    expiresAt,
    serverNow,
    onExpire,
}: {
    expiresAt: string;
    serverNow: string;
    onExpire: () => void;
}) {
    const offset = useRef(Date.parse(serverNow) - Date.now());
    const onExpireRef = useRef(onExpire);
    onExpireRef.current = onExpire;
    const fired = useRef(false);

    const remaining = () => Math.max(0, Date.parse(expiresAt) - (Date.now() + offset.current));
    const [left, setLeft] = useState(remaining);

    useEffect(() => {
        const tick = () => {
            const ms = remaining();
            setLeft(ms);
            if (ms === 0 && !fired.current) {
                fired.current = true;
                onExpireRef.current();
            }
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expiresAt]);

    const total = Math.ceil(left / 1000);
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