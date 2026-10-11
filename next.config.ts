import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.MICKY_BUILD_DIR ?? ".next",
  images: { unoptimized: true },
  experimental: { isrFlushToDisk: false,cpus:2,webpackMemoryOptimizations:true },
  output: "standalone",
  outputFileTracingExcludes: { '*': ['./Bigfoot/**/*', './HeyJev/**/*', './OpenMausBot/**/*', './Rakazo/**/*', './runtimes/**/*', './.data/**/*', './work/**/*', './.logs/**/*'] },
  webpack(config) {
    // Next 15 filesystem packs intermittently crash incremental production builds.
    // Keep builds deterministic; this does not affect runtime renderer caching.
    if(process.env.MICKY_BUILD_DIR === ".next-native") config.cache=false;
    config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.data/**", "**/.logs/**", "**/work/**", "**/OpenMausBot/**"] };
    return config;
  },
};
export default nextConfig;
