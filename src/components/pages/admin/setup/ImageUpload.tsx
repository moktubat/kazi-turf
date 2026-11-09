"use client";
import { useState } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { ApiError } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function ImageUpload({
    label,
    value,
    onChange,
    folder = "kaziturf",
    publicIdPrefix = "image",
    error,
    hint,
}: {
    label: string;
    value: string;
    onChange: (url: string) => void;
    folder?: string;
    publicIdPrefix?: string;
    error?: string;
    hint?: string;
}) {
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [imgError, setImgError] = useState(false);

    async function uploadFile(file: File) {
        if (!ACCEPTED.includes(file.type)) {
            setUploadError("Only JPEG, PNG, WebP or AVIF images are accepted.");
            return;
        }
        if (file.size > MAX_BYTES) {
            setUploadError(`Image must be under ${MAX_BYTES / 1024 / 1024} MB.`);
            return;
        }

        setUploading(true);
        setUploadError(null);
        setImgError(false);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("folder", folder);
            fd.append("publicId", `${publicIdPrefix}-${Date.now()}`);

            const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
            if (!res.ok) {
                const err = (await res.json().catch(() => null)) as
                    | { message?: string; fields?: Record<string, string> }
                    | null;
                const msg =
                    err?.fields?.file ??
                    err?.message ??
                    "Upload failed. Please try again.";
                throw new ApiError("UPLOAD_FAILED", msg, res.status);
            }
            const data = (await res.json()) as { url: string; publicId: string };
            onChange(data.url);
        } catch (e) {
            setUploadError(
                e instanceof ApiError ? e.message : "Could not upload image. Please try again."
            );
        } finally {
            setUploading(false);
        }
    }

    function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) void uploadFile(file);
        e.target.value = "";
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void uploadFile(file);
    }

    function clear() {
        onChange("");
        setUploadError(null);
        setImgError(false);
    }

    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold text-evergreen">{label}</p>

            {value && (
                <div className="relative h-40 w-full overflow-hidden rounded-xl border border-evergreen/10">
                    {imgError ? (
                        <div className="flex h-full w-full items-center justify-center bg-booked-soft px-3 text-center text-xs font-medium text-booked">
                            Image could not load — check the URL or CSP allows res.cloudinary.com
                        </div>
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={value}
                            alt={label}
                            className="h-full w-full object-cover"
                            onError={() => setImgError(true)}
                            onLoad={() => setImgError(false)}
                        />
                    )}
                    <button
                        type="button"
                        onClick={clear}
                        aria-label={`Remove ${label}`}
                        className="absolute right-1 top-1 inline-flex size-9 items-center justify-center rounded-lg bg-surface/90 text-booked shadow-sm hover:bg-surface"
                    >
                        <X size={18} aria-hidden />
                    </button>
                </div>
            )}

            <label
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-sm font-semibold text-evergreen transition-colors hover:border-teal ${dragOver ? "border-teal bg-mint" : "border-evergreen/20"
                    }`}
            >
                {uploading ? (
                    <>
                        <Loader2 size={16} aria-hidden className="animate-spin" /> Uploading…
                    </>
                ) : value ? (
                    <>
                        <ImageIcon size={16} aria-hidden /> Replace image
                    </>
                ) : (
                    <>
                        <Upload size={16} aria-hidden /> Upload image
                    </>
                )}
                <input
                    type="file"
                    accept={ACCEPTED.join(",")}
                    onChange={onFile}
                    className="sr-only"
                    disabled={uploading}
                    aria-label={`Upload ${label}`}
                />
            </label>

            {hint && !uploadError && !error && (
                <p className="text-xs text-evergreen/70">{hint}</p>
            )}

            {(uploadError || error) && (
                <p role="alert" className="text-sm font-medium text-booked">
                    {uploadError ?? error}
                </p>
            )}

            {value && (
                <p className="break-all text-xs text-evergreen/50">{value}</p>
            )}
        </div>
    );
}