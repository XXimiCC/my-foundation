import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import type { SessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import {
  DEFAULT_EAT_FROM,
  DEFAULT_EAT_TO,
  EAT_WINDOW_HOURS,
  isKept,
  loadPost,
  redemptionEndKey,
  redemptionPhase,
  redemptionStartKey,
} from '@/lib/core/post';
import { dateFromKey, keyFromDate, localDateKey, shiftKey } from '@/lib/core/put';
import { touchRollup } from '@/lib/core/rollup';
import { loadState, recordAct, startOfLocalDay } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Завет ПОСТ.
 *
 * Ни один эндпоинт не наказывает. Сорванный день записывается как опыт —
 * «это не значит, что я плохой; это значит, что я плохо проконтролировал
 * мысли, эмоции или ситуацию» (Основа 5), — и уровень за него не отнимается.
 */

type Guard = { user: SessionUser; error: null } | { user: null; error: NextResponse };

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

/** Метка акта, начисленного за соблюдённый день поста. */
const ACT_NOTE = 'Пост';

export async function GET() {
  const { user, error } = await guard();
  if (error) return error;

  return NextResponse.json(await loadPost(prisma, user.id, user.tz));
}

/**
 * Начало поста.
 *
 * День Очищения начинается сегодня: «его можно использовать если мне грустно
 * или плохо» — ждать понедельника в такой момент бессмысленно. Месяц
 * Искупления начинается только в декабре, потому что он и есть декабрь.
 */
export async function POST(request: Request) {
  const { user, error } = await guard();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    eatFrom?: number;
    eatTo?: number;
  };

  const now = new Date();
  const todayKey = localDateKey(now, user.tz);
  const dayStart = startOfLocalDay(now, user.tz);

  const running = await prisma.fastPeriod.findFirst({
    where: { userId: user.id, startAt: { lte: now }, endAt: { gt: now } },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json({ error: 'пост уже идёт' }, { status: 409 });
  }

  const eatFrom = clampMinutes(body.eatFrom, DEFAULT_EAT_FROM);
  const eatTo = clampMinutes(body.eatTo, DEFAULT_EAT_TO);
  if (eatTo - eatFrom > EAT_WINDOW_HOURS * 60) {
    return NextResponse.json(
      { error: `окно еды не длиннее ${EAT_WINDOW_HOURS} часов` },
      { status: 400 },
    );
  }

  if (body.kind === 'CLEANSING_DAY') {
    const period = await prisma.fastPeriod.create({
      data: {
        userId: user.id,
        kind: 'CLEANSING_DAY',
        status: 'ACTIVE',
        startAt: dayStart,
        endAt: new Date(dayStart.getTime() + 86_400_000),
        eatFrom,
        eatTo,
      },
      select: { id: true },
    });
    return NextResponse.json({ ...(await loadPost(prisma, user.id, user.tz, now)), id: period.id });
  }

  if (body.kind === 'REDEMPTION_MONTH') {
    const phase = redemptionPhase(todayKey);
    if (phase !== 'идёт' && phase !== 'итоги') {
      return NextResponse.json(
        { error: 'Месяц Искупления начинается 1 декабря' },
        { status: 400 },
      );
    }

    // Начали позже первого — пост идёт с сегодняшнего дня и всё равно до 31-го.
    const startKey = maxKey(redemptionStartKey(todayKey), todayKey);
    const period = await prisma.fastPeriod.create({
      data: {
        userId: user.id,
        kind: 'REDEMPTION_MONTH',
        status: 'ACTIVE',
        startAt: dateStartInZone(startKey, user.tz),
        // Конец — полночь после последнего дня: пост длится весь 31-й.
        endAt: dateStartInZone(shiftKey(redemptionEndKey(todayKey), 1), user.tz),
        eatFrom,
        eatTo,
      },
      select: { id: true },
    });
    return NextResponse.json({ ...(await loadPost(prisma, user.id, user.tz, now)), id: period.id });
  }

  return NextResponse.json({ error: 'не указан вид поста' }, { status: 400 });
}

/**
 * Ход поста: отметка дня, дневниковая запись, итоги, досрочное завершение.
 */
export async function PATCH(request: Request) {
  const { user, error } = await guard();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as {
    foodOk?: boolean;
    infoOk?: boolean;
    note?: string;
    cause?: string;
    summary?: string;
    finish?: boolean;
  };

  const now = new Date();
  const todayKey = localDateKey(now, user.tz);

  const period = await prisma.fastPeriod.findFirst({
    where: { userId: user.id, startAt: { lte: now }, endAt: { gt: now } },
    include: { logs: true },
  });
  if (!period) {
    return NextResponse.json({ error: 'пост не идёт' }, { status: 404 });
  }

  if (body.finish === true) {
    // «Дни очищения желательны, но не обязательны» — выйти можно в любой
    // момент, и это не срыв. Конец переносится на «сейчас», прошлое цело.
    await prisma.fastPeriod.update({
      where: { id: period.id },
      data: { endAt: now, status: 'COMPLETED' },
    });
    return NextResponse.json(await loadPost(prisma, user.id, user.tz, now));
  }

  if (typeof body.summary === 'string') {
    await prisma.fastPeriod.update({
      where: { id: period.id },
      data: { summary: body.summary.trim().slice(0, 20_000) || null },
    });
    return NextResponse.json(await loadPost(prisma, user.id, user.tz, now));
  }

  const date = dateFromKey(todayKey);
  // FastLog.date — колонка @db.Date, то есть полночь UTC: ключ берётся срезом.
  const previous = period.logs.find((l) => keyFromDate(l.date) === todayKey) ?? null;

  const day = {
    foodOk: body.foodOk ?? previous?.foodOk ?? true,
    infoOk: body.infoOk ?? previous?.infoOk ?? true,
    note: typeof body.note === 'string' ? body.note.trim().slice(0, 2000) || null : previous?.note ?? null,
  };

  await prisma.fastLog.upsert({
    where: { fastId_date: { fastId: period.id, date } },
    create: { fastId: period.id, date, ...day },
    update: day,
  });

  /**
   * Соблюдённый день поста — акт Духа: «Пост даёт духовную силу и мотивацию
   * двигаться вперёд». Не чаще одного за сутки: акт ищется по метке, поэтому
   * снятая и заново поставленная галочка ничего не добавляет.
   */
  let counted = false;
  if (isKept(day)) {
    const already = await prisma.act.findFirst({
      where: {
        userId: user.id,
        note: ACT_NOTE,
        doneAt: { gte: startOfLocalDay(now, user.tz) },
      },
      select: { id: true },
    });
    if (!already) {
      await recordAct(prisma, user.id, 'SPIRIT', { note: ACT_NOTE }, now);
      counted = true;
    }
  }

  /**
   * Срыв фиксируется как ОПЫТ и не отнимает уровень (Основа 5). Причина
   * называется словами самой Основы: мысли, эмоции или ситуация.
   */
  let lapse = false;
  if (!isKept(day) && isCause(body.cause)) {
    await prisma.lapse.create({
      data: { userId: user.id, cause: body.cause, note: day.note, at: now },
    });
    lapse = true;
  }

  const state = await loadState(prisma, user.id, user.tz, now);
  await touchRollup(prisma, user.id, user.tz, now, state);

  return NextResponse.json({
    ...(await loadPost(prisma, user.id, user.tz, now)),
    counted,
    lapse,
  });
}

const CAUSES = ['THOUGHTS', 'EMOTIONS', 'SITUATION'] as const;

function isCause(value: unknown): value is (typeof CAUSES)[number] {
  return typeof value === 'string' && (CAUSES as readonly string[]).includes(value);
}

function clampMinutes(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(24 * 60 - 1, Math.max(0, Math.round(value)));
}

function maxKey(a: string, b: string): string {
  return a > b ? a : b;
}

/** Полночь указанного локального дня — в тот же момент, что и startOfLocalDay. */
function dateStartInZone(key: string, tz: string): Date {
  // Полдень UTC как зонд: в этот момент дата совпадает с искомой почти в любой
  // зоне, а точную полночь вычисляет startOfLocalDay.
  return startOfLocalDay(new Date(`${key}T12:00:00.000Z`), tz);
}
