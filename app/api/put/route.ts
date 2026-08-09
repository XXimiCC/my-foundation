import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import type { SessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import {
  MAX_ITEMS,
  dateFromKey,
  daysBetween,
  isShell,
  localDateKey,
  normalizeText,
  readItems,
  tomorrowKey,
  validateDeclaration,
  type DeclarationItem,
} from '@/lib/core/put';
import { loadPutView } from '@/lib/core/rollup';
import { recordAct } from '@/lib/core/state';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завет ПУТЬ.
 *
 * Цикл замкнут вечером и утром: вечером человек закрывает сегодняшний день
 * (Догма Следа — «обернитесь назад и рассмотрите свои следы») и декларирует
 * завтрашний; утром получает чек-лист. Никакого шеринга и экспорта тут нет и
 * не будет: «никому не рассказывайте о своих намерениях».
 */

type Guard =
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse };

async function guard(): Promise<Guard> {
  const user = await currentUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'нужен вход' }, { status: 401 }) };
  }
  if (!user.oathAt) {
    return {
      user: null,
      error: NextResponse.json({ error: 'сначала Оснащение' }, { status: 403 }),
    };
  }
  return { user, error: null };
}

export async function GET() {
  const { user, error } = await guard();
  if (error) return error;

  return NextResponse.json(await loadPutView(prisma, user, new Date()));
}

/**
 * Составление Декларации.
 *
 * Декларировать можно только завтрашний день — как и велит Завет — либо
 * сегодняшний, если Декларации на него ещё нет: человек мог начать утром.
 * Но однажды поданную СЕГОДНЯШНЮЮ Декларацию переписывать нельзя: подгонка
 * плана под уже сделанное убивает то самое «напряжение для её реализации».
 */
export async function POST(request: Request) {
  const { user, error } = await guard();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    date?: string;
    items?: { text?: string; shell?: string }[];
  };

  const now = new Date();
  const todayKey = localDateKey(now, user.tz);
  const date = typeof body.date === 'string' ? body.date : tomorrowKey(now, user.tz);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'не та дата' }, { status: 400 });
  }

  const offset = daysBetween(todayKey, date);
  if (offset < 0) {
    return NextResponse.json({ error: 'прошлое не переписывают' }, { status: 400 });
  }
  if (offset > 1) {
    return NextResponse.json(
      { error: 'декларируют завтрашний день, а не далёкое будущее' },
      { status: 400 },
    );
  }

  const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS + 1) : [];
  const verdict = validateDeclaration(raw.map((i) => (typeof i?.text === 'string' ? i.text : '')));
  if (!verdict.ok) {
    // 422: форма запроса верна, а содержание Завету не соответствует.
    return NextResponse.json(
      { error: verdict.hint ?? 'Завет ПУТЬ не принимает эти пункты', ...verdict },
      { status: 422 },
    );
  }

  const items: DeclarationItem[] = raw
    .map((entry, i) => ({
      text: verdict.verdicts[i].text,
      shell: isShell(entry?.shell) ? entry.shell : null,
      done: false,
      doneAt: null,
      actId: null,
    }))
    .filter((i) => i.text.length > 0);

  const forDate = dateFromKey(date);
  const existing = await prisma.declaration.findUnique({
    where: { userId_forDate: { userId: user.id, forDate } },
    select: { id: true },
  });

  if (existing && offset === 0) {
    return NextResponse.json(
      { error: 'сегодняшнюю Декларацию не переписывают — её выполняют' },
      { status: 409 },
    );
  }

  await prisma.declaration.upsert({
    where: { userId_forDate: { userId: user.id, forDate } },
    create: { userId: user.id, forDate, items: items as unknown as Prisma.InputJsonValue },
    update: { items: items as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json(await loadPutView(prisma, user, now));
}

/**
 * Выполнение: отметка пункта и закрытие дня.
 *
 * Пункт, привязанный к оболочке, при выполнении записывает Акт — ровно один
 * раз за всю жизнь пункта. Снятие отметки Акт не удаляет и уровень не
 * отнимает: наказаний и потери очков в Основании нет (Основа 5).
 */
export async function PATCH(request: Request) {
  const { user, error } = await guard();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    index?: number;
    done?: boolean;
    close?: boolean;
    reflection?: string;
  };

  const now = new Date();
  const todayKey = localDateKey(now, user.tz);
  const forDate = dateFromKey(todayKey);

  const declaration = await prisma.declaration.findUnique({
    where: { userId_forDate: { userId: user.id, forDate } },
  });
  if (!declaration) {
    return NextResponse.json({ error: 'на сегодня Декларации нет' }, { status: 404 });
  }

  const items = readItems(declaration.items);

  if (body.close === true) {
    const reflection =
      typeof body.reflection === 'string'
        ? normalizeText(body.reflection).slice(0, 2000) || null
        : null;

    await prisma.declaration.update({
      where: { id: declaration.id },
      data: { reflection, closedAt: new Date() },
    });

    return NextResponse.json(await loadPutView(prisma, user, now));
  }

  const index = typeof body.index === 'number' ? body.index : -1;
  if (index < 0 || index >= items.length) {
    return NextResponse.json({ error: 'нет такого пункта' }, { status: 400 });
  }

  const item = items[index];
  const done = body.done !== false;

  if (done && !item.done) {
    item.done = true;
    item.doneAt = now.toISOString();
    if (item.shell && !item.actId) {
      const act = await recordAct(
        prisma,
        user.id,
        item.shell,
        { note: item.text },
        now,
      );
      item.actId = act.actId;
    }
  } else if (!done && item.done) {
    item.done = false;
    item.doneAt = null;
    // actId сохраняется намеренно: акт был, и он не отменяется.
  }

  await prisma.declaration.update({
    where: { id: declaration.id },
    data: { items: items as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json(await loadPutView(prisma, user, now));
}
