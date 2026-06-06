import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: false, // TEMP baseline test
  // Explicit root: the root pnpm-lock.yaml (monorepo DX scripts) would otherwise
  // make Turbopack infer the workspace root one level up and warn on every start.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
