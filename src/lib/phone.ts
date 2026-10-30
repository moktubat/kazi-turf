const BD_PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;

const strip = (v: string) => v.replace(/[\s-]/g, "");

export function isBdPhone(v: string): boolean {
    return BD_PHONE.test(strip(v));
}

/** "+8801712345678" | "8801712345678" | "01712-345678" -> "01712345678" */
export function normalizePhone(v: string): string {
    return strip(v).replace(/^\+?88/, "");
}