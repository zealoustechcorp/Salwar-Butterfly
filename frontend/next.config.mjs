/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Two Cloudinary accounts are in play, so the pathname is left open
    // rather than pinned to one cloud name:
    //
    //   the live shop's (ddvui6pi4) — the storefront photography that came
    //   across with the catalogue and is still what most products point at
    //
    //   this project's own — everything the admin uploads, category
    //   covers and product galleries alike. Its cloud name lives in the
    //   API's environment, so the frontend cannot name it at build time.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
