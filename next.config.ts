import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Версия сборки запекается в клиентский код, чтобы приложение могло
  // заметить, что webview Telegram держит устаревшую копию.
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
  },
  // Приложение открывается внутри webview Telegram, поэтому фрейминг разрешён,
  // но только для домена Telegram.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
