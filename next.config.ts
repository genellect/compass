import type { NextConfig } from "next";
import path from "node:path";

const productionAdminPreviewStub = path.resolve(
  process.cwd(),
  "src/library-registration/admin/adminPreviewUnavailable.ts"
);

const nextConfig: NextConfig = {
  output: "export",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  devIndicators: false,
  reactStrictMode: true,
  webpack(config) {
    if (process.env.NEXT_PUBLIC_LIBRARY_ADMIN_MODE === "google") {
      config.resolve.alias = {
        ...config.resolve.alias,
        "./adminMock$": productionAdminPreviewStub
      };
    }
    return config;
  }
};

export default nextConfig;
