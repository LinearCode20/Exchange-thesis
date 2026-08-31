import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend is a separate Python (FastAPI) server - proxy /api/* to it so
  // the frontend keeps calling relative URLs like /api/stock?symbol=AAPL.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
