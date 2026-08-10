/**
 * Короткая сводка по Заветам для главного экрана.
 *
 * Ровно те числа, которые нужны, чтобы понять, сделан ли ритуал сегодня, — и
 * ни одного лишнего запроса. Полное состояние живёт на своих экранах: главный
 * должен открываться мгновенно и заканчиваться, а не втягивать.
 *
 * Пригодится и боту в фазе 8: ритуальные окна спрашивают ровно это.
 */

import type { PrismaClient } from '@prisma/client';
import { startOfLocalWeek } from './dar';
import { dayNumber } from './post';
import { dateFromKey, localDateKey, progressOf, readItems, shiftKey } from './put';
import { startOfLocalDay } from './state';
import { MIN_MINUTES } from './duh';
import { ACT_NOTE as SLOVO_ACT } from './slovo';

export interface RitualCounts {
  put: { exists: boolean; done: number; total: number };
  duh: { practiced: boolean; minutes: number };
  dar: { week: number };
  /** Идущий пост. Пока он идёт, интерфейс обесцвечивается. */
  post: { active: boolean; day: number; total: number };
  slovo: { done: number; complete: boolean };
}

export async function loadRituals(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<RitualCounts> {
  const dayStart = startOfLocalDay(now, tz);
  const todayKey = localDateKey(now, tz);

  const [declaration, silences, gifts, fast, recalled, slovoAct] = await Promise.all([
    prisma.declaration.findUnique({
      where: {
        userId_forDate: { userId, forDate: dateFromKey(localDateKey(now, tz)) },
      },
      select: { items: true },
    }),
    prisma.silence.findMany({
      where: { userId, startedAt: { gte: dayStart } },
      select: { minutes: true },
    }),
    prisma.gift.count({ where: { userId, at: { gte: startOfLocalWeek(now, tz) } } }),
    prisma.fastPeriod.findFirst({
      where: { userId, startAt: { lte: now }, endAt: { gt: now } },
      select: { startAt: true, endAt: true },
    }),
    prisma.thesisReview.count({ where: { userId, lastAt: { gte: dayStart } } }),
    prisma.act.findFirst({
      where: { userId, note: SLOVO_ACT, doneAt: { gte: dayStart } },
      select: { id: true },
    }),
  ]);

  const items = readItems(declaration?.items);

  return {
    put: { exists: Boolean(declaration), ...progressOf(items) },
    duh: {
      practiced: silences.some((s) => s.minutes >= MIN_MINUTES),
      minutes: silences.reduce((acc, s) => acc + s.minutes, 0),
    },
    dar: { week: gifts },
    post: fast
      ? {
          active: true,
          day: dayNumber(localDateKey(fast.startAt, tz), todayKey),
          // Конец — полночь после последних суток поста.
          total: dayNumber(localDateKey(fast.startAt, tz), shiftKey(localDateKey(fast.endAt, tz), -1)),
        }
      : { active: false, day: 0, total: 0 },
    slovo: { done: recalled, complete: Boolean(slovoAct) },
  };
}
