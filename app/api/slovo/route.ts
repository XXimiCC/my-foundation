import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { touchRollup } from '@/lib/core/rollup';
import { gainForAct } from '@/lib/core/shells';
import { ACT_NOTE, MIND_SHARE, loadSlovo, recordRecall } from '@/lib/core/slovo';
import { RECALLS, type Recall } from '@/lib/core/srs';
import { loadState, startOfLocalDay } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Слово Дня — активное припоминание Канона (Основа 6).
 *
 * Оценку ставит человек сам: машине неоткуда знать, вспомнил он или узнал.
 * Отсюда три честные оценки вместо проверки ответа.
 */

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  return NextResponse.json(await loadSlovo(prisma, user.id, user.tz));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    thesisId?: string;
    recall?: string;
  };

  if (!body.thesisId || typeof body.thesisId !== 'string') {
    return NextResponse.json({ error: 'не указан тезис' }, { status: 400 });
  }
  if (!body.recall || !RECALLS.includes(body.recall as Recall)) {
    return NextResponse.json({ error: 'нет такой оценки' }, { status: 400 });
  }

  const thesis = await prisma.thesis.findUnique({
    where: { id: body.thesisId },
    select: { id: true },
  });
  if (!thesis) {
    return NextResponse.json({ error: 'нет такого тезиса' }, { status: 404 });
  }

  const now = new Date();
  await recordRecall(prisma, user.id, thesis.id, body.recall as Recall, user.tz, now);

  const view = await loadSlovo(prisma, user.id, user.tz, now);

  /**
   * Пройденный заход поднимает Разум на треть акта — и только один раз за
   * сутки. Повторять сверх нормы можно, но платить за это уровнем нельзя:
   * «регулярность познания важнее скорости».
   */
  let counted = false;
  if (view.complete) {
    const already = await prisma.act.findFirst({
      where: {
        userId: user.id,
        note: ACT_NOTE,
        doneAt: { gte: startOfLocalDay(now, user.tz) },
      },
      select: { id: true },
    });

    if (!already) {
      const shell = await prisma.shellState.findUnique({
        where: { userId_shell: { userId: user.id, shell: 'MIND' } },
      });
      const level = shell?.level ?? 0;
      const gain = gainForAct(level, 'MIND') * MIND_SHARE;

      await prisma.$transaction([
        prisma.shellState.upsert({
          where: { userId_shell: { userId: user.id, shell: 'MIND' } },
          create: { userId: user.id, shell: 'MIND', level: Math.min(100, gain), lastActAt: now },
          update: { level: Math.min(100, level + gain), lastActAt: now },
        }),
        prisma.act.create({
          data: { userId: user.id, shell: 'MIND', note: ACT_NOTE, doneAt: now },
        }),
      ]);
      counted = true;
    }
  }

  const state = await loadState(prisma, user.id, user.tz, now);
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json({ ...view, counted, sila: state.sila });
}
