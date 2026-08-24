import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  serverExternalPackages: ["mysql2"],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/welcome/",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/dehknghwm/**",
      },
    ],
  },
};

export default nextConfig;
