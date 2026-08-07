import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for the Docker image only — `next start` warns/fails
  // when standalone is always on (Playwright e2e uses `npm run start`).
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  // Pin the workspace root so Turbopack ignores lockfiles above this directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
