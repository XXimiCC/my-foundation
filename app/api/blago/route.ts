import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { touchRollup } from '@/lib/core/rollup';
import {
  BLESSING_KINDS,
  loadState,
  recordBlessing,
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
 * в частоте нажатий. Само правило живёт в state.ts — той же дорогой ходит бот.
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
  const { counted } = await recordBlessing(prisma, user.id, kind, user.tz, now);

  const state = await loadState(prisma, user.id, user.tz, now);
  // Свод дня — кеш для Следа: Силу конкретного дня задним числом не восстановить.
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json({ ...state, counted });
}
