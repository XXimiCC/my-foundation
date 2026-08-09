import { NextResponse } from 'next/server';
import { normalizeAppUrl } from '@/lib/config';
import { prisma } from '@/lib/db';

/**
 * Проверка живости: доступна ли база из serverless-функции и наполнен ли Канон.
 *
 * Наружу отдаются только факты состояния — счётчики, задержка, регион.
 * Ни значений переменных окружения, ни их перечня: знание о том, какие
 * секреты настроены, само по себе полезно атакующему.
 */

export const runtime = 'nodejs'; // Prisma не работает на Edge
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const appUrlCheck = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);

  const build = {
    region: process.env.VERCEL_REGION ?? 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    env: process.env.VERCEL_ENV ?? 'development',
    // Переменная и так уходит в браузерный бандл — секретом не является.
    // Показываем и исходное значение, и нормализованное: чинить расхождение
    // нужно в конфигурации, а не полагаться на то, что код его переварил.
    appUrl: appUrlCheck.url,
    appUrlRaw: process.env.NEXT_PUBLIC_APP_URL ?? null,
    appUrlWarning: appUrlCheck.warning,
  };

  try {
    const [docs, sections, theses] = await Promise.all([
      prisma.canonDoc.count(),
      prisma.canonSection.count(),
      prisma.thesis.count({ where: { active: true } }),
    ]);

    const canonReady = docs === 22 && theses > 0;

    return NextResponse.json(
      {
        ok: canonReady,
        db: { up: true, latencyMs: Date.now() - startedAt },
        canon: { docs, sections, theses },
        build,
      },
      { status: canonReady ? 200 : 503, headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    // Сообщение драйвера может содержать хост и имя пользователя базы,
    // поэтому наружу уходит только код ошибки Prisma.
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'UNKNOWN';

    return NextResponse.json(
      {
        ok: false,
        db: { up: false, code, latencyMs: Date.now() - startedAt },
        build,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
