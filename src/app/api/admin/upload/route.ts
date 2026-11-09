import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { AppError, handleError, ok } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";
import { cloudinaryConfigured, uploadImage } from "@/server/cloudinary";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function POST(req: NextRequest) {
    try {
        assertSameOrigin(req);
        const user = await staffGuard(req, true);

        if (!rateLimit(`upload:${user.id}`, 10, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many uploads. Please wait a moment.", 429);
        }

        if (user.role !== "SUPER_ADMIN" && !user.permissions.includes("pitches.edit")) {
            throw new AppError("FORBIDDEN", "You do not have permission to upload images.", 403);
        }

        if (!cloudinaryConfigured()) {
            throw new AppError(
                "CLOUDINARY_NOT_CONFIGURED",
                "Image upload is not configured. Ask a Super Admin to set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the server environment.",
                500
            );
        }

        const form = await req.formData();
        const file = form.get("file");
        const folder = (form.get("folder") as string | null) || "kaziturf";
        const publicIdRaw = (form.get("publicId") as string | null) || "";

        if (!(file instanceof File)) {
            throw new AppError("VALIDATION", "No file uploaded.", 400, { file: "Select an image" });
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
            throw new AppError(
                "VALIDATION",
                "Only JPEG, PNG, WebP or AVIF images are accepted.",
                400,
                { file: "Unsupported image type" }
            );
        }
        if (file.size > MAX_BYTES) {
            throw new AppError(
                "VALIDATION",
                `Image must be under ${MAX_BYTES / 1024 / 1024} MB.`,
                400,
                { file: "File too large" }
            );
        }

        const slugSource = publicIdRaw || `${Date.now()}`;
        const slug = slugSource
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80);
        if (slug.length < 3) {
            throw new AppError("VALIDATION", "publicId must slug to at least 3 characters.", 400, {
                publicId: "Too short",
            });
        }

        const folderSlug = folder
            .toLowerCase()
            .replace(/[^a-z0-9-/]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 80) || "kaziturf";

        const buffer = Buffer.from(await file.arrayBuffer());
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