/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/**" },
      { protocol: "https", hostname: "media.discordapp.net", pathname: "/**" },
    ],
  },
};
module.exports = nextConfig;
