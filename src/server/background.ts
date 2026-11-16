import "server-only";
import { after } from "next/server";

/**
 * Run non-critical work (e.g. a confirmation email) after the response is sent, without
 * letting the platform freeze the function before it finishes (Next's `after`). Failures
 * are logged, never thrown. Outside a request (tests, scripts) it just runs in the background.
 */
export function runAfterResponse(label: string, task: () => Promise<unknown>): void {
    const safe = async () => {
        try {
            await task();
        } catch (e) {
            console.error(`[${label}] failed:`, e instanceof Error ? e.message : String(e));
        }
    };
    try {
        after(safe);
    } catch {
        void safe();
    }
}
