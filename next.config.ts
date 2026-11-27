import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Emit each route as a directory + index.html (out/blog/hello-world/index.html)
  // instead of out/blog/hello-world.html. The static host serves exact-match
  // files, so the flat .html form leaves every blog URL unmatched. Must agree
  // with "trailingSlash" in vercel.json and absoluteUrl() in src/lib/site.ts.
  trailingSlash: true,
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
