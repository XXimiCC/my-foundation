import type { NextConfig } from 'next';
import { version } from './package.json';

const nextConfig: NextConfig = {
  // Версия сборки запекается в клиентский код, чтобы приложение могло
  // заметить, что webview Telegram держит устаревшую копию.
  env: {
    // Человекочитаемая версия. Патч поднимает хук pre-commit, чтобы она
    // росла сама и на экране всегда было видно, та ли сборка перед тобой.
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    // Вычисляется в момент сборки — по нему видно, когда версия собрана.
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
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
