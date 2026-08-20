/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: true,
  experimental: {
    serverSourceMaps: true,
  },
  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose', 'ws', '@neondatabase/serverless'],
}

export default nextConfig;
