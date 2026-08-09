import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Оснащение — приём Договора Консенсуса.
 *
 * Запрет №1 требует, чтобы принятие было добровольным и сознательным, поэтому
 * каждая из десяти Основ принимается отдельным действием и ложится отдельной
 * записью. Одной кнопкой «согласен со всем» ритуал пройти нельзя — это
 * ограничение доктрины, а не интерфейсная придирка.
 */

const FOUNDATIONS_TOTAL = 10;

/** Состояние ритуала: что уже принято. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });

  const accepted = await prisma.oathAcceptance.findMany({
    where: { userId: user.id },
    orderBy: { foundationNo: 'asc' },
    select: { foundationNo: true, acceptedAt: true },
  });

  return NextResponse.json({
    rank: user.rank,
    oathAt: user.oathAt,
    total: FOUNDATIONS_TOTAL,
    accepted: accepted.map((a) => a.foundationNo),
  });
}

/** Принятие одной Основы либо завершение ритуала. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });

  if (user.oathAt) {
    return NextResponse.json({ error: 'Оснащение уже пройдено' }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    foundationNo?: number;
    finish?: boolean;
  };

  if (body.finish) return finish(user.id);

  const no = body.foundationNo;
  if (!Number.isInteger(no) || no! < 1 || no! > FOUNDATIONS_TOTAL) {
    return NextResponse.json({ error: 'нет такой Основы' }, { status: 400 });
  }

  // Порядок обязателен: Основы читаются подряд, а не выборочно.
  const accepted = await prisma.oathAcceptance.count({ where: { userId: user.id } });
  if (no !== accepted + 1) {
    return NextResponse.json(
      { error: `сейчас принимается Основа ${accepted + 1}`, expected: accepted + 1 },
      { status: 409 },
    );
  }

  await prisma.oathAcceptance.create({
    data: { userId: user.id, foundationNo: no! },
  });

  return NextResponse.json({ accepted: accepted + 1, total: FOUNDATIONS_TOTAL });
}

async function finish(userId: string) {
  const accepted = await prisma.oathAcceptance.count({ where: { userId } });

  if (accepted < FOUNDATIONS_TOTAL) {
    return NextResponse.json(
      { error: 'приняты не все Основы', accepted, total: FOUNDATIONS_TOTAL },
      { status: 409 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { rank: 'PREDTECHA', oathAt: new Date() },
    select: { rank: true, oathAt: true },
  });

  return NextResponse.json(user);
}
