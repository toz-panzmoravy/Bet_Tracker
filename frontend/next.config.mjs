/** @type {import('next').NextConfig} */
const nextConfig = {
  // Povolí přístup k dev serveru z localhost, 127.0.0.1 i z LAN (odstraní warning o blocked cross-origin)
  allowedDevOrigins: [
    "localhost:3001",
    "127.0.0.1:3001",
    "10.0.1.42:3001",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://10.0.1.42:3001",
  ],
};

export default nextConfig;
