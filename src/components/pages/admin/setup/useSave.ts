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

    async function save(
        schema: ZodType | null,
        payload: unknown,
        url: string,
        method: "POST" | "PATCH" | "DELETE",
        onDone: () => void
    ) {
        setError(null);
        setFields({});
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
            if (e instanceof ApiError) {
                if (e.fields) setFields(e.fields);
                setError(e.message);
            } else {
                setError("Something went wrong. Please try again.");
            }
        } finally {
            setBusy(false);
        }
    }

    return { busy, error, fields, save };
}