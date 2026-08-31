import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local development: the backend is the Python (FastAPI) server in backend/,
  // so /api/* is proxied to it BEFORE the Next.js API routes are considered.
  // In production (e.g. Vercel) no Python process exists - the built-in
  // app/api routes serve the same JSON instead.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: "http://127.0.0.1:8000/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
