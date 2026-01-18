/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 允许跨域请求到本地 API
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
