import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Текущая версия сборки. Отдельно от health намеренно: сторож версии
 * опрашивает этот маршрут при каждом открытии, и будить ради этого базу
 * незачем — на бесплатном тарифе Neon она ещё и просыпается полсекунды.
 */
export async function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
      env: process.env.VERCEL_ENV ?? 'development',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
