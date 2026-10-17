import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The public marketing page is the preserved static landing page (public/landing).
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/landing/index.html" }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Authenticated pages must never be cached by shared caches.
      { source: "/app/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  experimental: {
    // Vercel functions accept request bodies up to 4.5 MB; imports are capped at 4 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
