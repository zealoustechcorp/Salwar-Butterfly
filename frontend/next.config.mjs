/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Product, category and banner photography for the storefront lives on the
    // live shop's own Cloudinary account (see scripts/snapshot-live-catalogue.mjs).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/ddvui6pi4/**",
      },
    ],
  },
};

export default nextConfig;
