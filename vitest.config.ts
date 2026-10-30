import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@": r("./src"),
            "server-only": r("./src/test/server-only.ts"),
        },
    },
    test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 180_000 },
});