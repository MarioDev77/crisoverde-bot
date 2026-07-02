/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Cabeçalhos de segurança extra — o backend já manda os dele via Helmet,
  // mas como o front é servido pela Vercel, reforçamos aqui também.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
