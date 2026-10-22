import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the container image does not need
  // node_modules. See deploy/app.Dockerfile.
  output: "standalone",

  // There are lockfiles above this directory on some machines, and an inferred
  // root outside the repository would trace the wrong files into the standalone
  // build. Next.js requires this to match outputFileTracingRoot.
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),

  // Fixtures live outside app/ and are read at request time. Tracing them keeps
  // the standalone build honest about what it needs on disk.
  outputFileTracingIncludes: {
    "/api/v1/analyst/**": ["../fixtures/analyst/**"],
  },
};

export default nextConfig;
