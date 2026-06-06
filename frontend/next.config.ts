import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Re-enabled 2026-06-06 after measuring under the capped VM (5GB RAM/6GB swap):
  // +56MB peak RSS on next-server (~4%), steady state identical to off (~1.3GB).
  reactCompiler: true,
  // Explicit root: the root pnpm-lock.yaml (monorepo DX scripts) would otherwise
  // make Turbopack infer the workspace root one level up and warn on every start.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
