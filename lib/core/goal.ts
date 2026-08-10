/**
 * Точка оптимальных усилий.
 *
 * «Процесс познания не должен быть слишком сложным, тогда опустятся руки. И не
 * должен быть слишком лёгким, тогда пропадёт интерес. Всегда есть точка
 * оптимальных усилий. Её и используй» — Догма Оптимальности, Основа 6.
 * «Всегда есть точка оптимальных усилий тут и сейчас... Начните с уборки
 * комнаты и 10 отжиманий» — Основа 2.
 *
 * Отсюда правило: норма не постоянна. После пропусков она падает к минимуму,
 * чтобы было с чего начать, а после недели подряд растёт, чтобы не стало
 * слишком легко. Наказания в этом нет — есть подстройка под сегодняшние силы.
 */

import type { PrismaClient } from '@prisma/client';
import { SHELLS, SHELL_RULES, type Shell } from './shells';
import { localDateKey, shiftKey } from './put';

export interface Norm {
  /** С чего начинают после перерыва: «уборка комнаты и 10 отжиманий». */
  min: number;
  /** Ориентир Завета АКТ. */
  base: number;
  /** На сколько норма растёт за каждую выдержанную неделю. */
  step: number;
  max: number;
}

/**
 * Нормы взяты из Завета АКТ буквально: «хороший ориентир — три физических
 * тренировки в неделю от 30 минут», «ежедневные тренировки от 10 минут».
 * У Духа нормы в минутах нет: там «одно благое дело», и мерить его временем
 * значило бы придумать то, чего в тексте нет.
 */
export const SHELL_NORMS: Record<Shell, Norm | null> = {
  BODY: { min: 10, base: 30, step: 10, max: 90 },
  MIND: { min: 5, base: 10, step: 5, max: 60 },
  SPIRIT: null,
};

/** После скольких пропущенных периодов норма падает к минимуму. */
export const MISSES_TO_DROP = 3;
/** Сколько периодов подряд нужно выдержать, чтобы норма выросла. */
export const PERIODS_TO_GROW = 7;

export type GoalTrend = 'минимум' | 'норма' | 'рост';

export interface Goal {
  target: number;
  trend: GoalTrend;
  streak: number;
  missed: number;
}

/**
 * Норма на сегодня.
 *
 * Порядок проверок важен: пропуски сильнее цепи. Вернувшийся после перерыва
 * получает минимум, даже если до перерыва держал месяц, — иначе первый же день
 * возвращения встретит его требованием, из-за которого он не начнёт.
 */
export function goalFor(norm: Norm, streak: number, missed: number): Goal {
  if (missed >= MISSES_TO_DROP) {
    return { target: norm.min, trend: 'минимум', streak, missed };
  }
  if (streak >= PERIODS_TO_GROW) {
    const grown = norm.base + norm.step * Math.floor(streak / PERIODS_TO_GROW);
    return { target: Math.min(norm.max, grown), trend: 'рост', streak, missed };
  }
  return { target: norm.base, trend: 'норма', streak, missed };
}

/**
 * Сколько периодов подряд закрыто актами, считая назад от сегодняшнего.
 *
 * Период — льготный срок оболочки из Завета АКТ: телу через день, разуму и
 * духу каждый день. Текущий незакрытый период цепь не рвёт: он ещё идёт —
 * то же правило, что у Следа в Завете ПУТЬ.
 */
export function streakOfPeriods(
  actDays: Iterable<string>,
  periodDays: number,
  todayKey: string,
): number {
  const days = new Set(actDays);
  const covered = (index: number) => {
    for (let d = 0; d < periodDays; d += 1) {
      if (days.has(shiftKey(todayKey, -(index * periodDays + d)))) return true;
    }
    return false;
  };

  let streak = 0;
  for (let index = 0; index < 60; index += 1) {
    if (covered(index)) streak += 1;
    else if (index > 0) break;
  }
  return streak;
}

/**
 * Сколько периодов пропущено подряд.
 *
 * Без единого акта норма минимальна с самого начала: «начните с уборки комнаты
 * и 10 отжиманий» — новичку нельзя выдавать полную норму.
 */
export function missedPeriods(
  lastActKey: string | null,
  periodDays: number,
  todayKey: string,
): number {
  if (!lastActKey) return MISSES_TO_DROP;
  const days = Math.round(
    (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${lastActKey}T00:00:00Z`)) / 86_400_000,
  );
  return Math.max(0, Math.floor(days / periodDays));
}

/** Период оболочки — тот же льготный срок, что управляет распадом. */
export function periodOf(shell: Shell): number {
  return SHELL_RULES[shell].graceDays;
}

/** Норма Слова Дня: карточек за один заход. */
export const CARDS_NORM: Norm = { min: 3, base: 5, step: 2, max: 12 };

// ─── Чтение из базы ─────────────────────────────────────────────────────────

/**
 * Нормы на сегодня по всем оболочкам.
 *
 * Смотрим на два месяца назад: этого хватает и на цепь, и на пропуски, а
 * дальше история на норму уже не влияет.
 */
export async function loadGoals(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<Partial<Record<Shell, Goal>>> {
  const todayKey = localDateKey(now, tz);
  const since = new Date(now.getTime() - 60 * 86_400_000);

  const acts = await prisma.act.findMany({
    where: { userId, doneAt: { gte: since } },
    orderBy: { doneAt: 'desc' },
    select: { shell: true, doneAt: true },
  });

  const goals: Partial<Record<Shell, Goal>> = {};
  for (const shell of SHELLS) {
    const norm = SHELL_NORMS[shell];
    if (!norm) continue;

    const days = acts
      .filter((a) => a.shell === shell)
      .map((a) => localDateKey(a.doneAt, tz));
    const period = periodOf(shell);

    goals[shell] = goalFor(
      norm,
      streakOfPeriods(days, period, todayKey),
      missedPeriods(days[0] ?? null, period, todayKey),
    );
  }

  return goals;
}
