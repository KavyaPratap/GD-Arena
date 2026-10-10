import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.1.128",
    "*.local",
  ],
};

export default nextConfig;
