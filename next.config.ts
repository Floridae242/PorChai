import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A separate output lets presentation automation coexist with the developer server.
  ...(process.env.PORCHAI_PRESENTATION === "1" ? {
    distDir: ".next-presentation",
    devIndicators: false,
    typescript: { tsconfigPath: "tests/presentation/tsconfig.next.json" },
  } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
