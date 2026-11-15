"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ZodType } from "zod";
import { ApiError, api } from "@/lib/api";
import { zodFields } from "@/lib/formErrors";

/** Client pre-check with the SAME Zod schema the server uses, then save. The server always re-validates. */
export function useSave() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fields, setFields] = useState<Record<string, string>>({});
    // True after a 409 CONFIG_CONFLICT: this page's snapshot of the server
    // data is outdated. We refresh the server-rendered data behind the form;
    // the admin simply presses Save again with the same edits.
    const [stale, setStale] = useState(false);

    async function save(
        schema: ZodType | null,
        payload: unknown,
        url: string,
        method: "POST" | "PATCH" | "DELETE",
        onDone: () => void
    ) {
        setError(null);
        setFields({});
        setStale(false);
        if (schema) {
            const parsed = schema.safeParse(payload);
            if (!parsed.success) {
                setFields(zodFields(parsed.error));
                setError("Please check the highlighted fields.");
                return;
            }
        }
        setBusy(true);
        try {
            await api(url, { method, body: JSON.stringify(payload) });
            router.refresh();
            onDone();
        } catch (e) {
            console.error("[useSave] error saving to", url, e);
            if (e instanceof ApiError) {
                if (e.fields) setFields(e.fields);
                setError(e.message);
                // Optimistic-lock rejection: pull fresh server data in the
                // background so the next Save runs against the current
                // version. Local form edits survive router.refresh().
                if (e.code === "CONFIG_CONFLICT") {
                    setStale(true);
                    router.refresh();
                }
            } else if (e instanceof Error) {
                // Show the actual error message, not just "Something went wrong".
                setError(`Error: ${e.message}. Check the terminal for [setup/...] logs.`);
            } else {
                setError(`Unexpected error: ${String(e)}. Check the terminal.`);
            }
        } finally {
            setBusy(false);
        }
    }

    return { busy, error, fields, stale, save };
}