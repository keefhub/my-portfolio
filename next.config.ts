import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Emit each route as a directory + index.html (out/blog/hello-world/index.html)
  // instead of out/blog/hello-world.html. Firebase Hosting only serves
  // exact-match files, so the flat .html form left every blog URL unmatched and
  // falling through to the SPA rewrite.
  trailingSlash: true,
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
