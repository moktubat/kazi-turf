import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    cacheComponents: true,
    partialPrefetching: true,

    poweredByHeader: false,

    // Pin the Turbopack project root so it never picks up a stray
    // package-lock.json from a parent folder (e.g. C:\Users\shadhin).
    turbopack: {
        root: process.cwd(),
    },

    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "res.cloudinary.com",
                pathname: "/**",
            },
        ],
    },
};

export default nextConfig;