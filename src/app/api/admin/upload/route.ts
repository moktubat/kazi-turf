import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { AppError, handleError, ok } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimitAsync } from "@/server/security/rateLimit";
import { cloudinaryConfigured, uploadImage } from "@/server/cloudinary";
import { validateImageMagicBytes } from "@/server/cloudinary/magic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

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

        const form = await req.formData();
        const file = form.get("file");
        const folder = (form.get("folder") as string | null) || "kaziturf";
        const publicIdRaw = (form.get("publicId") as string | null) || "";

        if (!(file instanceof File)) {
            throw new AppError("VALIDATION", "No file uploaded.", 400, { file: "Select an image" });
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new AppError("VALIDATION", "Only JPEG, PNG, WebP or AVIF images are accepted.", 400, { file: "Unsupported image type" });
        }
        if (file.size > MAX_BYTES) {
            throw new AppError("VALIDATION", `Image must be under ${MAX_BYTES / 1024 / 1024} MB.`, 400, { file: "File too large" });
        }

        const slugSource = publicIdRaw || `${Date.now()}`;
        const slug = slugSource.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
        if (slug.length < 3) {
            throw new AppError("VALIDATION", "publicId must slug to at least 3 characters.", 400, { publicId: "Too short" });
        }

        const folderSlug = folder.toLowerCase().replace(/[^a-z0-9-/]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "kaziturf";

        const buffer = Buffer.from(await file.arrayBuffer());

        // Magic-byte validation — defence against spoofed Content-Type.
        const detected = validateImageMagicBytes(buffer);
        if (!detected || !ALLOWED_TYPES.includes(detected)) {
            throw new AppError("VALIDATION", "The file content does not match its declared type.", 400, { file: "Corrupted or mismatched image" });
        }

        const result = await uploadImage(buffer, { publicId: slug, folder: folderSlug });
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