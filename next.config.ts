import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every route is emitted as a directory (/blog/hello-world/) and the host
  // redirects the unslashed form to the slashed one. Must agree with
  // "trailingSlash" in vercel.json and absoluteUrl() in src/lib/site.ts.
  trailingSlash: true,
  images: {
    unoptimized: true, // Vercel's free image optimisation has a monthly allowance; unoptimized images keep the bill at $0
  },
};

export default nextConfig;
