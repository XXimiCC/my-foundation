import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { SHELLS, type Shell } from '@/lib/core/shells';
import { touchRollup } from '@/lib/core/rollup';
import { loadState, recordAct } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Текущее состояние оболочек. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });

  return NextResponse.json(await loadState(prisma, user.id, user.tz));
}

/**
 * Акт применения оболочки — Завет АКТ.
 *
 * До Оснащения Заветы закрыты: Договор ещё не принят, и укреплять нечего.
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });
  if (!user.oathAt) {
    return NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    shell?: string;
    minutes?: number;
    note?: string;
  };

  if (!body.shell || !SHELLS.includes(body.shell as Shell)) {
    return NextResponse.json({ error: 'не указана оболочка' }, { status: 400 });
  }

  const minutes =
    typeof body.minutes === 'number' && body.minutes > 0 && body.minutes <= 24 * 60
      ? Math.round(body.minutes)
      : null;

  const note = typeof body.note === 'string' ? body.note.slice(0, 2000).trim() || null : null;

  const now = new Date();
  await recordAct(prisma, user.id, body.shell as Shell, { minutes, note }, now);

  // Свод дня — кеш для Следа: Силу конкретного дня задним числом не восстановить.
  const state = await loadState(prisma, user.id, user.tz, now);
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json(state);
}
