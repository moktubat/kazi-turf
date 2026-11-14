// File-magic-byte validation: defence against spoofed Content-Type.
// Reference: https://en.wikipedia.org/wiki/List_of_file_signatures

export type ImageKind = "image/jpeg" | "image/png" | "image/webp" | "image/avif" | null;

/**
 * Inspect the first bytes of `buffer` and return the detected image MIME type.
 * Returns null if the buffer doesn't match any supported image signature.
 */
export function validateImageMagicBytes(buffer: Buffer): ImageKind {
    if (buffer.length < 12) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        return "image/png";
    }

    // WebP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        return "image/webp";
    }

    // AVIF / HEIF: bytes 4-7 = "ftyp", bytes 8-11 in { "avif", "avis", "heic", "heix", "mif1" }
    if (
        buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
        (
            (buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 && (buffer[11] === 0x66 || buffer[11] === 0x73)) || // avif / avis
            (buffer[8] === 0x68 && buffer[9] === 0x65 && (buffer[10] === 0x69 || buffer[10] === 0x69) && (buffer[11] === 0x63 || buffer[11] === 0x78)) || // heic / heix
            (buffer[8] === 0x6d && buffer[9] === 0x69 && buffer[10] === 0x66 && buffer[11] === 0x31) // mif1
        )
    ) {
        return "image/avif";
    }

    return null;
}