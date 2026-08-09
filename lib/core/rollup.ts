/**
 * Свод локального дня, След и состояние Пути — всё, что Завет ПУТЬ читает из
 * базы. Чистая логика (валидатор, даты, арифметика) живёт в put.ts.
 *
 * Уровни оболочек выводятся от даты и всегда верны задним числом (см. state.ts),
 * а вот Сила КОНКРЕТНОГО прошедшего дня задним числом невосстановима: истории
 * уровней мы не храним. Поэтому свод пишется в момент действия, а дни без
 * записи остаются в Следе пустыми. Это честнее, чем достраивать прошлое.
 *
 * Планировщик для этого не нужен — ровно по той же причине, что и для распада.
 */

import type { PrismaClient } from '@prisma/client';
import {
  dateFromKey,
  keyFromDate,
  localDateKey,
  progressOf,
  readItems,
  shiftKey,
  streakOf,
  tomorrowKey,
  weekScroll,
  type PutView,
  type TrailDay,
} from './put';
import { weakestShell } from './shells';
import { loadState, type CoreState } from './state';

/** Сколько дней показывает След: шесть недель — виден ритм, но не бесконечная лента. */
export const TRAIL_DAYS = 42;

/**
 * Записывает свод за сегодняшний локальный день.
 * Вызывается после каждого действия — акта, благодарения, отметки пункта.
 */
export async function touchRollup(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
  /** Уже посчитанное состояние — чтобы не читать оболочки дважды за запрос. */
  known?: CoreState,
): Promise<void> {
  const key = localDateKey(now, tz);
  const forDate = dateFromKey(key);

  const [state, declaration] = await Promise.all([
    known ? Promise.resolve(known) : loadState(prisma, userId, tz, now),
    prisma.declaration.findUnique({
      where: { userId_forDate: { userId, forDate } },
      select: { items: true },
    }),
  ]);

  const { done, total } = progressOf(readItems(declaration?.items));
  const acts = state.today.acts.BODY + state.today.acts.MIND + state.today.acts.SPIRIT;

  const values = {
    sila: state.sila,
    bol: state.bol,
    bodyLevel: state.levels.BODY,
    mindLevel: state.levels.MIND,
    spiritLevel: state.levels.SPIRIT,
    acts,
    // Виды Благ, а не касания: уровень поднимает разнообразие.
    blessings: state.today.blessings.length,
    declarationDone: done,
    declarationTotal: total,
  };

  await prisma.dailyRollup.upsert({
    where: { userId_date: { userId, date: forDate } },
    create: { userId, date: forDate, ...values },
    update: values,
  });
}

/**
 * След пройденного: непрерывный ряд дней до сегодняшнего включительно.
 *
 * Декларации подмешиваются отдельно: человек мог задекларировать день и не
 * открыть приложение назавтра — свода тогда нет, но намерение было, и в Следе
 * оно должно остаться видимым.
 */
export async function loadTrail(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  days = TRAIL_DAYS,
  now = new Date(),
): Promise<TrailDay[]> {
  const todayKey = localDateKey(now, tz);
  const fromKey = shiftKey(todayKey, -(days - 1));
  const from = dateFromKey(fromKey);
  const to = dateFromKey(todayKey);

  const [rollups, declarations] = await Promise.all([
    prisma.dailyRollup.findMany({
      where: { userId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    }),
    prisma.declaration.findMany({
      where: { userId, forDate: { gte: from, lte: to } },
      select: { forDate: true, items: true },
    }),
  ]);

  const byDay = new Map(rollups.map((r) => [keyFromDate(r.date), r]));
  const plans = new Map(
    declarations.map((d) => [keyFromDate(d.forDate), progressOf(readItems(d.items))]),
  );

  const trail: TrailDay[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = shiftKey(fromKey, i);
    const rollup = byDay.get(date);
    const plan = plans.get(date);

    trail.push({
      date,
      sila: rollup?.sila ?? 0,
      bol: rollup?.bol ?? 0,
      declared: plan !== undefined,
      done: plan?.done ?? rollup?.declarationDone ?? 0,
      total: plan?.total ?? rollup?.declarationTotal ?? 0,
    });
  }

  return trail;
}

/**
 * Состояние Пути целиком: сегодняшний чек-лист, завтрашняя Декларация, След и
 * Свиток. Один и тот же вид отдают и страница, и все методы `/api/put` —
 * иначе экран после действия расходится с тем, что было при загрузке.
 */
export async function loadPutView(
  prisma: PrismaClient,
  user: { id: string; tz: string },
  now = new Date(),
): Promise<PutView> {
  const todayKey = localDateKey(now, user.tz);
  const nextKey = tomorrowKey(now, user.tz);

  await touchRollup(prisma, user.id, user.tz, now);

  const [today, tomorrow, trail, shells] = await Promise.all([
    prisma.declaration.findUnique({
      where: { userId_forDate: { userId: user.id, forDate: dateFromKey(todayKey) } },
    }),
    prisma.declaration.findUnique({
      where: { userId_forDate: { userId: user.id, forDate: dateFromKey(nextKey) } },
    }),
    loadTrail(prisma, user.id, user.tz, undefined, now),
    prisma.shellState.findMany({ where: { userId: user.id } }),
  ]);

  const levels = { BODY: 0, MIND: 0, SPIRIT: 0 };
  for (const shell of shells) levels[shell.shell] = shell.level;

  const todayItems = readItems(today?.items);

  return {
    today: {
      date: todayKey,
      exists: Boolean(today),
      items: todayItems,
      reflection: today?.reflection ?? null,
      closedAt: today?.closedAt?.toISOString() ?? null,
      ...progressOf(todayItems),
    },
    tomorrow: {
      date: nextKey,
      exists: Boolean(tomorrow),
      items: readItems(tomorrow?.items),
    },
    trail,
    week: weekScroll(trail),
    streak: streakOf(trail, todayKey),
    weakest: weakestShell(levels),
  };
}
