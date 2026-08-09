import { NextResponse } from 'next/server';
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

  const build = {
    region: process.env.VERCEL_REGION ?? 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    env: process.env.VERCEL_ENV ?? 'development',
    // Переменная и так уходит в браузерный бандл — секретом не является.
    // Здесь она нужна, чтобы расхождение конфигурации ловилось запросом:
    // неверный адрес молча ломает ссылки бота на Mini App.
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
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
