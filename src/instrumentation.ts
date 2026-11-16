// Runs once when a server instance starts. Production only: lists missing or unsafe
// configuration by NAME (never by value) so a bad deploy is obvious in the logs.
// It does not stop the server; each feature still refuses safely on its own.
export function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;

    const env = process.env;
    const problems: string[] = [];
    const need = (name: string, why: string) => {
        if (!env[name]) problems.push(`${name} is not set (${why})`);
    };

    need("MONGODB_URI", "database");
    need("AUTH_URL", "bKash return URL and password-reset links");
    need("CRON_SECRET", "cron endpoint and email-code hashing");
    need("RESEND_API_KEY", "all emails, including sign-up codes");
    need("EMAIL_FROM", "sender on the verified domain; without it customers get no email");
    for (const n of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) need(n, "image uploads");
    for (const n of ["BKASH_BASE_URL", "BKASH_APP_KEY", "BKASH_APP_SECRET", "BKASH_USERNAME", "BKASH_PASSWORD"]) need(n, "online payments");

    if (env.AUTH_URL && !env.AUTH_URL.startsWith("https://")) problems.push("AUTH_URL should start with https:// in production");
    if (env.AUTH_URL && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(env.AUTH_URL)) problems.push("AUTH_URL points to a local address");
    if (env.CRON_SECRET && env.CRON_SECRET.length < 32) problems.push("CRON_SECRET is shorter than 32 characters");

    if (problems.length > 0) {
        console.warn(`[config] Production configuration problems:\n  - ${problems.join("\n  - ")}`);
    }
}
