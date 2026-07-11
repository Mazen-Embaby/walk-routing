/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose'],
}

export default nextConfig;
