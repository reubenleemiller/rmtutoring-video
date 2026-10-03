/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.rmtutoringservices.com",
        pathname: "/assets/**"
      }
    ]
  }
};

export default nextConfig;
