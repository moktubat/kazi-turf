import "server-only";
import { v2 as cloudinary } from "cloudinary";

let configured = false;

function ensureConfigured() {
    if (configured) return;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
            "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET must be set in .env.local to use image upload."
        );
    }
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });
    configured = true;
}

export function cloudinaryConfigured(): boolean {
    return !!(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

export interface UploadedImage {
    secureUrl: string;
    publicId: string;
    width: number;
    height: number;
    bytes: number;
    format: string;
}

export async function uploadImage(
    buffer: Buffer,
    options: { publicId: string; folder?: string }
): Promise<UploadedImage> {
    ensureConfigured();
    const folder = options.folder ?? "kaziturf";
    const slug = options.publicId
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    if (slug.length < 3) {
        throw new Error("uploadImage: publicId must slug to at least 3 characters.");
    }
    const fullPublicId = `${folder}/${slug}`;

    return new Promise<UploadedImage>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: "image",
                public_id: fullPublicId,
                overwrite: true,
                unique_filename: false,
            },
            (err, result) => {
                if (err) return reject(err);
                if (!result) return reject(new Error("Cloudinary returned no result."));
                resolve({
                    secureUrl: result.secure_url,
                    publicId: result.public_id,
                    width: result.width,
                    height: result.height,
                    bytes: result.bytes,
                    format: result.format,
                });
            }
        );
        stream.end(buffer);
    });
}

export async function deleteImage(publicId: string): Promise<void> {
    if (!publicId) return;
    ensureConfigured();
    try {
        const r = await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        if (r.result !== "ok" && r.result !== "not found") {
            console.error(`[cloudinary] unexpected delete result for ${publicId}:`, r.result);
        }
    } catch (e) {
        console.error(
            `[cloudinary] failed to delete ${publicId}:`,
            e instanceof Error ? e.message : e
        );
    }
}

export function extractPublicId(url: string): string | null {
    if (!url || typeof url !== "string") return null;
    if (url.startsWith("/")) return null;
    try {
        const u = new URL(url);
        if (!u.hostname.endsWith("cloudinary.com")) return null;
        const m = u.pathname.match(/\/(?:image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
        if (!m) return null;
        const withExt = m[1];
        const dot = withExt.lastIndexOf(".");
        const publicId = dot === -1 ? withExt : withExt.slice(0, dot);
        return publicId || null;
    } catch {
        return null;
    }
}

export function publicIdFromImage(image: string | null | undefined): string | null {
    if (!image) return null;
    return extractPublicId(image);
}