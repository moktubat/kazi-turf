import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import path from "path";

// Configure the SDK from env vars (cloudinaryConfigured() only checks that they exist).
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
    });
}

export function cloudinaryConfigured(): boolean {
    return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

export interface UploadResult {
    secureUrl: string;
    publicId: string;
    width: number;
    height: number;
    bytes: number;
    format: string;
}

const PROD = process.env.NODE_ENV === "production";

/**
 * Upload an image buffer to Cloudinary. In development only, falls back to
 * /public/uploads when Cloudinary is not configured or fails. In production a
 * failure is an error: a local file would be lost or unservable on the host.
 */
export async function uploadImage(
    buffer: Buffer,
    opts: { publicId: string; folder: string }
): Promise<UploadResult> {
    if (!cloudinaryConfigured()) {
        if (PROD) throw new Error("Cloudinary is not configured. Set CLOUDINARY_* env vars in production.");
        return uploadLocal(buffer, opts);
    }

    const start = Date.now();
    try {
        return await Promise.race([
            uploadToCloudinary(buffer, opts),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Cloudinary upload timed out after 15 seconds")), 15_000)
            ),
        ]);
    } catch (error) {
        console.error(`[cloudinary] upload failed after ${Date.now() - start} ms:`, error instanceof Error ? error.message : String(error));
        if (PROD) throw new Error("Image upload failed");
        return uploadLocal(buffer, opts); // development only
    }
}

/** Upload to Cloudinary using upload_stream. Never overwrites an existing asset. */
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
                overwrite: false,
            },
            (error, result) => {
                if (error) {
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

/** Development fallback: save the image to /public/uploads/ and return its URL. */
async function uploadLocal(
    buffer: Buffer,
    opts: { publicId: string; folder: string }
): Promise<UploadResult> {
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const safeName = opts.publicId.replace(/[^a-z0-9-]/gi, "-").slice(0, 60);
    const filename = `${Date.now()}-${safeName}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    return {
        secureUrl: `/uploads/${filename}`,
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

    // Local or other relative URLs have no Cloudinary public ID.
    if (url.startsWith("/")) return null;

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
 */
export async function deleteImage(publicId: string | null): Promise<void> {
    if (!publicId) return;

    // Local fallback file (development).
    if (publicId.startsWith("/uploads/")) {
        try {
            const filepath = path.join(process.cwd(), "public", publicId);
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        } catch (e) {
            console.error("[cloudinary] local delete failed (non-fatal):", e instanceof Error ? e.message : e);
        }
        return;
    }

    if (!cloudinaryConfigured()) return;

    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    } catch (error) {
        // Non-fatal: a failed delete must not break the save that triggered it.
        console.error("[cloudinary] delete failed (non-fatal):", error instanceof Error ? error.message : error);
    }
}
