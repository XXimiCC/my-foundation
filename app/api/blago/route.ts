import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { gainForAct } from '@/lib/core/shells';
import {
  BLESSING_KINDS,
  loadState,
  spiritShareForBlessing,
  startOfLocalDay,
  type BlessingKind,
} from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завет БЛАГ — благодарение одному из пяти Благ.
 *
 * Записывается КАЖДОЕ касание: благодарить воду положено при каждом
 * соприкосновении, и счётчик за день — часть практики. А уровень Духа
 * поднимает только новый вид Блага за сутки: практика в разнообразии, а не
 * в частоте нажатий.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { blessing?: string };
  const kind = body.blessing as BlessingKind | undefined;

  if (!kind || !BLESSING_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'нет такого Блага' }, { status: 400 });
  }

  const now = new Date();
  const dayStart = startOfLocalDay(now, user.tz);

  const alreadyToday = await prisma.blessing.findFirst({
    where: { userId: user.id, blessing: kind, at: { gte: dayStart } },
    select: { id: true },
  });

  await prisma.blessing.create({ data: { userId: user.id, blessing: kind, at: now } });

  // Новый вид за сутки — поднимаем Дух на пятую часть акта.
  if (!alreadyToday) {
    const shell = await prisma.shellState.findUnique({
      where: { userId_shell: { userId: user.id, shell: 'SPIRIT' } },
    });
    const level = shell?.level ?? 0;
    const gain = gainForAct(level, 'SPIRIT') * spiritShareForBlessing(1);

    await prisma.shellState.upsert({
      where: { userId_shell: { userId: user.id, shell: 'SPIRIT' } },
      create: { userId: user.id, shell: 'SPIRIT', level: Math.min(100, gain), lastActAt: now },
      update: { level: Math.min(100, level + gain), lastActAt: now },
    });
  }

  return NextResponse.json({
    ...(await loadState(prisma, user.id, user.tz, now)),
    counted: !alreadyToday,
  });
}
