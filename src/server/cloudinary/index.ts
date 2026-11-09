import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

// FIX: Configure the Cloudinary SDK with env vars.
// Without this, the SDK doesn't know your credentials even though
// cloudinaryConfigured() returns true (it only checks env vars exist).
if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
    console.log("[cloudinary] SDK configured with env vars");
} else {
    console.log("[cloudinary] SDK NOT configured — missing one or more env vars");
}

/**
 * Check if Cloudinary env vars are set.
 */
export function cloudinaryConfigured(): boolean {
    const configured = !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
    console.log("[cloudinary] configured:", configured, "| cloud_name:", process.env.CLOUDINARY_CLOUD_NAME ? "set" : "missing");
    return configured;
}

export interface UploadResult {
    secureUrl: string;
    publicId: string;
    width: number;
    height: number;
    bytes: number;
    format: string;
}

/**
 * Upload an image buffer. Falls back to local storage if Cloudinary is not
 * configured or if the Cloudinary API fails/times out.
 */
export async function uploadImage(
    buffer: Buffer,
    opts: { publicId: string; folder: string }
): Promise<UploadResult> {
    const start = Date.now();
    console.log("[cloudinary] uploadImage start", {
        publicId: opts.publicId,
        folder: opts.folder,
        bytes: buffer.length,
    });

    if (!cloudinaryConfigured()) {
        console.log("[cloudinary] NOT configured → using local fallback");
        const local = await uploadLocal(buffer, opts);
        console.log("[cloudinary] local fallback done:", Date.now() - start, "ms");
        return local;
    }

    try {
        console.log("[cloudinary] uploading to Cloudinary...");
        const result = await Promise.race([
            uploadToCloudinary(buffer, opts),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error("Cloudinary upload timed out after 15 seconds")),
                    15_000
                )
            ),
        ]);
        console.log("[cloudinary] Cloudinary upload success:", Date.now() - start, "ms");
        return result;
    } catch (error) {
        console.error("[cloudinary] Cloudinary upload FAILED:", Date.now() - start, "ms");
        console.error("[cloudinary] error:", error instanceof Error ? error.message : String(error));
        console.log("[cloudinary] falling back to local storage...");
        const local = await uploadLocal(buffer, opts);
        console.log("[cloudinary] local fallback done:", Date.now() - start, "ms");
        return local;
    }
}

/**
 * Upload to Cloudinary using upload_stream.
 */
async function uploadToCloudinary(
    buffer: Buffer,
    opts: { publicId: string; folder: string }
): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: "image",
                public_id: opts.publicId,
                folder: opts.folder,
                overwrite: true,
            },
            (error, result) => {
                if (error) {
                    console.error("[cloudinary] API error:", error.message);
                    reject(error);
                    return;
                }
                if (!result) {
                    reject(new Error("Cloudinary returned no result"));
                    return;
                }
                resolve({
                    secureUrl: result.secure_url,
                    publicId: result.public_id,
                    width: result.width || 0,
                    height: result.height || 0,
                    bytes: result.bytes || buffer.length,
                    format: result.format || "jpg",
                });
            }
        );
        stream.end(buffer);
    });
}

/**
 * Local fallback: save the image to /public/uploads/ and return a URL.
 */
async function uploadLocal(
    buffer: Buffer,
    opts: { publicId: string; folder: string }
): Promise<UploadResult> {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = opts.publicId.replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
    const filename = `${Date.now()}-${safeName}.jpg`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);

    const url = `/uploads/${filename}`;
    console.log("[cloudinary] local file saved:", filepath);

    return {
        secureUrl: url,
        publicId: opts.publicId,
        width: 0,
        height: 0,
        bytes: buffer.length,
        format: "jpg",
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE + PUBLIC ID extraction — required by src/server/admin/setup.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the Cloudinary public ID from an image URL.
 *
 * Cloudinary URLs look like:
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<publicId>.jpg
 *
 * For local fallback URLs like /uploads/123456-name.jpg, returns null
 * (there is no Cloudinary asset to delete — the file is local).
 */
export function publicIdFromImage(url: string): string | null {
    if (!url || typeof url !== "string") return null;

    // Local fallback URL — no Cloudinary public ID
    if (url.startsWith("/uploads/")) {
        console.log("[cloudinary] publicIdFromImage: local URL, returning null");
        return null;
    }

    // Also handle relative URLs that aren't /uploads/
    if (url.startsWith("/") && !url.startsWith("http")) {
        return null;
    }

    try {
        const u = new URL(url);
        // Path format: /<cloud_name>/image/upload/v123/<folder>/<publicId>.<ext>
        const parts = u.pathname.split("/");
        const uploadIdx = parts.indexOf("upload");
        if (uploadIdx === -1) return null;

        // Everything after "upload", skipping the version segment (v123) if present
        let relevantParts = parts.slice(uploadIdx + 1);
        if (relevantParts[0]?.startsWith("v")) {
            relevantParts = relevantParts.slice(1);
        }

        // Join remaining parts and remove the file extension
        const fullId = relevantParts.join("/");
        const lastDot = fullId.lastIndexOf(".");
        const publicId = lastDot > 0 ? fullId.slice(0, lastDot) : fullId;

        console.log("[cloudinary] publicIdFromImage:", url, "→", publicId || null);
        return publicId || null;
    } catch {
        // Not a valid URL — might be a relative path or something else
        return null;
    }
}

/**
 * Delete an image from Cloudinary by its public ID.
 *
 * If Cloudinary is not configured, or the public ID is null (local fallback),
 * this is a no-op. Errors are logged but never thrown — deleting the old
 * image should not break a pitch update or save.
 *
 * For local fallback images, optionally deletes the local file too.
 */
export async function deleteImage(publicId: string | null): Promise<void> {
    if (!publicId) {
        console.log("[cloudinary] deleteImage: no publicId, skipping");
        return;
    }

    // If it looks like a local path, try to delete the local file
    if (publicId.startsWith("/uploads/")) {
        try {
            const filepath = path.join(process.cwd(), "public", publicId);
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
                console.log("[cloudinary] deleteImage: local file deleted:", filepath);
            } else {
                console.log("[cloudinary] deleteImage: local file not found:", filepath);
            }
        } catch (e) {
            console.error("[cloudinary] deleteImage: local delete error (non-fatal):", e instanceof Error ? e.message : e);
        }
        return;
    }

    if (!cloudinaryConfigured()) {
        console.log("[cloudinary] deleteImage: Cloudinary not configured, skipping");
        return;
    }

    try {
        console.log("[cloudinary] deleteImage: destroying", publicId);
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        console.log("[cloudinary] deleteImage: result:", result?.result);
    } catch (error) {
        // Non-fatal: don't let a failed delete break the save operation
        console.error("[cloudinary] deleteImage error (non-fatal):", error instanceof Error ? error.message : error);
    }
}