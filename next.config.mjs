/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: "https://holwa-412aa.firebaseapp.com/__/auth/:path*",
      },
    ];
  },
};

export default nextConfig;
