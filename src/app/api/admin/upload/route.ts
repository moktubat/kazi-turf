import type { NextRequest } from "next/server";
import { staffGuard } from "@/server/admin/guard";
import { AppError, handleError, ok } from "@/server/http";
import { assertSameOrigin } from "@/server/security/origin";
import { rateLimit } from "@/server/security/rateLimit";
import { cloudinaryConfigured, uploadImage } from "@/server/cloudinary";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    console.log("[upload] === START ===", new Date().toISOString());

    try {
        console.log("[upload] step 1: assertSameOrigin");
        assertSameOrigin(req);
        console.log("[upload] step 1 done:", Date.now() - startTime, "ms");

        console.log("[upload] step 2: staffGuard");
        const user = await staffGuard(req, true);
        console.log("[upload] step 2 done:", Date.now() - startTime, "ms", "user:", user.id, "role:", user.role);

        console.log("[upload] step 3: rateLimit");
        if (!rateLimit(`upload:${user.id}`, 10, 60_000)) {
            throw new AppError("RATE_LIMITED", "Too many uploads. Please wait a moment.", 429);
        }
        console.log("[upload] step 3 done:", Date.now() - startTime, "ms");

        console.log("[upload] step 4: permission check");
        if (user.role !== "SUPER_ADMIN" && !user.permissions.includes("pitches.edit")) {
            throw new AppError("FORBIDDEN", "You do not have permission to upload images.", 403);
        }
        console.log("[upload] step 4 done:", Date.now() - startTime, "ms");

        console.log("[upload] step 5: cloudinaryConfigured check");
        const isConfigured = cloudinaryConfigured();
        console.log("[upload] cloudinary configured:", isConfigured);
        // Don't throw — let uploadImage handle the fallback
        console.log("[upload] step 5 done:", Date.now() - startTime, "ms");

        console.log("[upload] step 6: parse formData");
        const form = await req.formData();
        const file = form.get("file");
        const folder = (form.get("folder") as string | null) || "kaziturf";
        const publicIdRaw = (form.get("publicId") as string | null) || "";
        console.log("[upload] step 6 done:", Date.now() - startTime, "ms", "file:", file instanceof File ? `${file.name} (${file.size} bytes, ${file.type})` : "NO FILE");

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

        console.log("[upload] step 7: convert to buffer");
        const buffer = Buffer.from(await file.arrayBuffer());
        console.log("[upload] step 7 done:", Date.now() - startTime, "ms", "buffer size:", buffer.length);

        console.log("[upload] step 8: uploadImage", { slug, folderSlug });
        const result = await uploadImage(buffer, { publicId: slug, folder: folderSlug });
        console.log("[upload] step 8 done:", Date.now() - startTime, "ms", "url:", result.secureUrl);

        console.log("[upload] === SUCCESS ===", Date.now() - startTime, "ms");
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
        console.error("[upload] === ERROR ===", Date.now() - startTime, "ms");
        console.error("[upload] error name:", e instanceof Error ? e.name : typeof e);
        console.error("[upload] error message:", e instanceof Error ? e.message : String(e));
        console.error("[upload] error stack:", e instanceof Error ? e.stack : "no stack");
        return handleError(e);
    }
}