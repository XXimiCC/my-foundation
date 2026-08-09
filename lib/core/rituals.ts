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
import { dateFromKey, localDateKey, progressOf, readItems } from './put';
import { startOfLocalDay } from './state';
import { MIN_MINUTES } from './duh';

export interface RitualCounts {
  put: { exists: boolean; done: number; total: number };
  duh: { practiced: boolean; minutes: number };
  dar: { week: number };
}

export async function loadRituals(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<RitualCounts> {
  const dayStart = startOfLocalDay(now, tz);

  const [declaration, silences, gifts] = await Promise.all([
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
  ]);

  const items = readItems(declaration?.items);

  return {
    put: { exists: Boolean(declaration), ...progressOf(items) },
    duh: {
      practiced: silences.some((s) => s.minutes >= MIN_MINUTES),
      minutes: silences.reduce((acc, s) => acc + s.minutes, 0),
    },
    dar: { week: gifts },
  };
}
