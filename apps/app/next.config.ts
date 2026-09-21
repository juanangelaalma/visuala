import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Product images upload up to 10 MB through a Server Action. The default 1 MB action limit and
    // the 10 MB proxy body buffer both have to clear a single image plus multipart overhead.
    serverActions: { bodySizeLimit: "12mb" },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
