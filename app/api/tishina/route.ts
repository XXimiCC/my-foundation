import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import {
  creditedMinutes,
  loadDuh,
  normalizeDuration,
  qualifies,
  stageAt,
} from '@/lib/core/duh';
import { touchRollup } from '@/lib/core/rollup';
import { loadState, recordAct, startOfLocalDay } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завет ДУХ — Тишина.
 *
 * Запись приходит одна, по завершении: пока идёт практика, приложению нечего
 * делать. «Без устройств, без звуков» — значит и без сетевых тиканий.
 */

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  return NextResponse.json(await loadDuh(prisma, user.id, user.tz));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    startedAt?: string;
    minutes?: number;
    insights?: string;
  };

  const planned = normalizeDuration(body.minutes);
  if (planned === null) {
    return NextResponse.json({ error: 'Тишина длится от 5 до 100 минут' }, { status: 400 });
  }

  const now = new Date();
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: 'не указано начало практики' }, { status: 400 });
  }
  // Сутки — потолок разумного: всё старше пришло не из этой практики.
  if (startedAt.getTime() > now.getTime() + 60_000 || now.getTime() - startedAt.getTime() > 86_400_000) {
    return NextResponse.json({ error: 'начало практики вне сегодняшних суток' }, { status: 400 });
  }

  const minutes = creditedMinutes(startedAt, planned, now);
  const insights =
    typeof body.insights === 'string' ? body.insights.trim().slice(0, 4000) || null : null;

  /**
   * Уровень поднимает ЕЖЕДНЕВНАЯ практика, а не число подходов: «ежедневно я
   * практикую тишину». Вторая и третья практика за сутки записываются целиком,
   * но Дух уже не растят — иначе пять пятиминуток били бы часовое замедление.
   */
  const already = await prisma.silence.findFirst({
    where: {
      userId: user.id,
      startedAt: { gte: startOfLocalDay(now, user.tz) },
      minutes: { gte: 5 },
    },
    select: { id: true },
  });

  const counted = qualifies(minutes) && !already;

  await prisma.silence.create({
    data: {
      userId: user.id,
      startedAt,
      minutes: Math.round(minutes),
      // Стадия, до которой человек дошёл: она выводится из времени, а не из
      // самоощущения — так велит порядок этапов в Основе 7.
      stage: qualifies(minutes) ? stageAt(minutes) : null,
      insights,
    },
  });

  if (counted) {
    await recordAct(
      prisma,
      user.id,
      'SPIRIT',
      { minutes: Math.round(minutes), note: insights },
      now,
    );
  }

  const state = await loadState(prisma, user.id, user.tz, now);
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json({
    ...(await loadDuh(prisma, user.id, user.tz, now)),
    counted,
    minutes: Math.round(minutes),
    stage: qualifies(minutes) ? stageAt(minutes) : null,
    sila: state.sila,
  });
}

/**
 * Запись озарений к только что завершённой практике.
 *
 * Отдельным запросом, а не вместе с завершением: практика записывается сразу,
 * иначе закрытое приложение стирало бы уже прожитую Тишину. Час — окно, в
 * котором запись ещё относится к этой практике.
 */
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { insights?: string };
  const insights =
    typeof body.insights === 'string' ? body.insights.trim().slice(0, 4000) || null : null;

  const now = new Date();
  const recent = await prisma.silence.findFirst({
    where: { userId: user.id, startedAt: { gte: new Date(now.getTime() - 3_600_000) } },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });

  if (!recent) {
    return NextResponse.json({ error: 'нет свежей практики' }, { status: 404 });
  }

  await prisma.silence.update({ where: { id: recent.id }, data: { insights } });

  return NextResponse.json(await loadDuh(prisma, user.id, user.tz, now));
}
