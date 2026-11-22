import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { AppError, handleError, ok } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { cloudinaryConfigured, uploadImage } from "@/server/cloudinary";
import { validateImageMagicBytes } from "@/server/cloudinary/magic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const FOLDERS: Record<string, { superAdminOnly: boolean }> = {
    "kaziturf/pitches": { superAdminOnly: false },
    "kaziturf/sports": { superAdminOnly: true },
};

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await staffGuard(req, true);

        if (!(await rateLimitAsync(`upload:${user.id}`, 10, 60_000))) {
            throw new AppError("RATE_LIMITED", "Too many uploads. Please wait a moment.", 429);
        }

        if (user.role !== "SUPER_ADMIN" && !user.permissions.includes("pitches.edit")) {
            throw new AppError("FORBIDDEN", "You do not have permission to upload images.", 403);
        }

        // In production, Cloudinary MUST be configured — no local fallback.
        if (!cloudinaryConfigured()) {
            if (process.env.NODE_ENV === "production") {
                throw new AppError("UPLOAD_UNAVAILABLE", "Image upload is not available.", 503);
            }
            // dev: allow local fallback (handled inside uploadImage)
        }

        // Refuse oversized bodies before formData() buffers them all in memory.
        const declared = Number(req.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES + 64 * 1024) {
            throw new AppError("VALIDATION", `Image must be under ${MAX_BYTES / 1024 / 1024} MB.`, 400, { file: "File too large" });
        }

        const form = await req.formData();
        const file = form.get("file");
        const folderRaw = (form.get("folder") as string | null) || "kaziturf/pitches";
        const publicIdRaw = (form.get("publicId") as string | null) || "";

        // The server decides where an upload may go. Field photos: anyone allowed to edit
        // fields; sport backgrounds: Super Admin only (the same rule as saving them).
        const folder = Object.hasOwn(FOLDERS, folderRaw) ? FOLDERS[folderRaw] : undefined;
        if (!folder) throw new AppError("VALIDATION", "Unknown upload location.", 400, { file: "Unknown upload location" });
        if (folder.superAdminOnly && user.role !== "SUPER_ADMIN") {
            throw new AppError("FORBIDDEN", "Only a Super Admin can change sport images.", 403);
        }

        if (!(file instanceof File)) {
            throw new AppError("VALIDATION", "No file uploaded.", 400, { file: "Select an image" });
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new AppError("VALIDATION", "Only JPEG, PNG, WebP or AVIF images are accepted.", 400, { file: "Unsupported image type" });
        }
        if (file.size > MAX_BYTES) {
            throw new AppError("VALIDATION", `Image must be under ${MAX_BYTES / 1024 / 1024} MB.`, 400, { file: "File too large" });
        }

        // The client's name is only a readable prefix; the random suffix means an upload can
        // never land on (and replace) an existing image, even with a guessed name.
        const prefix = publicIdRaw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
        const slug = `${prefix}-${randomBytes(6).toString("hex")}`;

        const buffer = Buffer.from(await file.arrayBuffer());

        // Magic-byte validation — defence against spoofed Content-Type.
        const detected = validateImageMagicBytes(buffer);
        if (!detected || !ALLOWED_TYPES.includes(detected)) {
            throw new AppError("VALIDATION", "The file content does not match its declared type.", 400, { file: "Corrupted or mismatched image" });
        }

        const result = await uploadImage(buffer, { publicId: slug, folder: folderRaw });
        return ok(
            {
                url: result.secureUrl,
                publicId: result.publicId,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
                format: result.format,
            },
            201
        );
    } catch (e) {
        return handleError(e);
    }
}