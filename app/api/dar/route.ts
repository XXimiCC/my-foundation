import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { isGiftResource, loadDar, startOfLocalWeek } from '@/lib/core/dar';
import { touchRollup } from '@/lib/core/rollup';
import { loadState, recordAct } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завет ДАР.
 *
 * Только POST и GET: метода «запланировать Дар» здесь нет и не будет —
 * «не обещай благие деяния, ибо обещание создаёт обязательство». Фиксируется
 * лишь то, что уже совершено.
 */

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  return NextResponse.json(await loadDar(prisma, user.id, user.tz));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    resource?: string;
    recipient?: string;
    note?: string;
  };

  if (!isGiftResource(body.resource)) {
    return NextResponse.json({ error: 'не указан ресурс' }, { status: 400 });
  }

  const now = new Date();
  const weekStart = startOfLocalWeek(now, user.tz);

  /**
   * Дух поднимает НЕДЕЛЬНАЯ норма, а не количество записей: «каждую неделю
   * необходимо делиться». Второй и третий Дар за ту же неделю записываются
   * целиком — «мало даю, мало получаю; много даю, много получаю, однако этот
   * закон никогда не работает линейно».
   */
  const already = await prisma.gift.findFirst({
    where: { userId: user.id, at: { gte: weekStart } },
    select: { id: true },
  });

  await prisma.gift.create({
    data: {
      userId: user.id,
      resource: body.resource,
      // Настоящие имена не требуются: «благие деяния — очень интимный процесс».
      recipient:
        typeof body.recipient === 'string' ? body.recipient.trim().slice(0, 120) || null : null,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 2000) || null : null,
      at: now,
    },
  });

  const counted = !already;
  if (counted) {
    await recordAct(prisma, user.id, 'SPIRIT', { note: 'Дар' }, now);
  }

  const state = await loadState(prisma, user.id, user.tz, now);
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json({
    ...(await loadDar(prisma, user.id, user.tz, now)),
    counted,
    sila: state.sila,
  });
}
