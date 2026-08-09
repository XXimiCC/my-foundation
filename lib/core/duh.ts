/**
 * Завет ДУХ — Тишина.
 *
 * «Ежедневно я практикую тишину с самим собой, чтобы приобрести духовную силу,
 * интеллектуальную мощь и желание делать полезные вещи... от 5 до 100 минут на
 * то чтобы отключиться от реальности».
 *
 * Три стадии взяты из Основы 7 буквально и именно в этом порядке: Создание
 * Сюжета → Поток Озарения → Рождение Скуки. Стадия выводится из прожитого
 * времени, а не выбирается человеком: «в состоянии суперпозиции моё сознание
 * ПОСЛЕДОВАТЕЛЬНО проходит через три этапа».
 */

import type { PrismaClient } from '@prisma/client';
import { startOfLocalDay } from './state';

/** «от 5 до 100 минут» — границы названы в тексте прямо. */
export const MIN_MINUTES = 5;
export const MAX_MINUTES = 100;

/** Готовые длительности. Ползунок здесь лишний: настройка — это тоже шум. */
export const DURATIONS = [5, 10, 20, 30, 45, 60, 100] as const;

export type Stage = 'PLOT' | 'INSIGHT' | 'BOREDOM';

export const STAGES: readonly Stage[] = ['PLOT', 'INSIGHT', 'BOREDOM'] as const;

/**
 * Минуты, на которых наступает стадия.
 *
 * Точных чисел в тексте нет — есть направление: «чем дольше тишина, тем точнее
 * мои представления», «чем дольше длится замедление без внешних стимулов, тем
 * больше скука». Пороги выбраны так, чтобы минимальная пятиминутка честно
 * оставалась Сюжетом, а до Скуки нужно было действительно замедлиться.
 */
export const STAGE_AT: Record<Stage, number> = {
  PLOT: 0,
  INSIGHT: 8,
  BOREDOM: 20,
};

export const STAGE_LABEL: Record<Stage, string> = {
  PLOT: 'Создание Сюжета',
  INSIGHT: 'Поток Озарения',
  BOREDOM: 'Рождение Скуки',
};

/** Что происходит на стадии — словами Основы 7. */
export const STAGE_HINT: Record<Stage, string> = {
  PLOT: 'Мозг рисует цели, желания и мотивацию.',
  INSIGHT: 'Мысли блуждают — приходят ответы на вопросы.',
  BOREDOM: 'Чем больше скука, тем выше желание действовать.',
};

/** Стадия, на которой находится сознание к этой минуте практики. */
export function stageAt(minutes: number): Stage {
  if (minutes >= STAGE_AT.BOREDOM) return 'BOREDOM';
  if (minutes >= STAGE_AT.INSIGHT) return 'INSIGHT';
  return 'PLOT';
}

/** Все пройденные стадии по порядку — их видно в записи практики. */
export function stagesReached(minutes: number): Stage[] {
  return STAGES.filter((stage) => minutes >= STAGE_AT[stage]);
}

/**
 * Сколько минут практики засчитывается.
 *
 * Считается от метки начала, а не тиканьем в кадре: webview Telegram уходит в
 * фон, вкладка засыпает, и таймер, живущий на интервалах, врёт. Сверх
 * запланированного не начисляется — иначе забытая открытой вкладка выдала бы
 * сто минут тишины.
 */
export function creditedMinutes(startedAt: Date, planned: number, now: Date): number {
  const elapsed = (now.getTime() - startedAt.getTime()) / 60_000;
  const limit = Math.min(Math.max(planned, 0), MAX_MINUTES);
  return Math.max(0, Math.min(elapsed, limit));
}

/** Практика короче пяти минут — это не Тишина, а пауза. Уровень она не растит. */
export function qualifies(minutes: number): boolean {
  return minutes >= MIN_MINUTES;
}

/** Допустимая длительность практики. */
export function normalizeDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) return null;
  return minutes;
}

/** Доля пройденного — ею живёт кольцо-часы. Цифр во время Тишины нет. */
export function progressOf(elapsed: number, planned: number): number {
  if (planned <= 0) return 0;
  return Math.max(0, Math.min(1, elapsed / planned));
}

// ─── Чтение из базы ─────────────────────────────────────────────────────────

/**
 * Состояние Завета: было ли сегодня, сколько за последнюю неделю и три
 * последние записи.
 *
 * Именно три: «записывать свои мысли и озарения» — требование Завета, а не
 * повод для ленты. Экран заканчивается, когда практика записана.
 */
export interface DuhView {
  today: { practiced: boolean; minutes: number; sessions: number };
  week: { sessions: number; minutes: number };
  last: {
    at: string;
    minutes: number;
    stage: Stage | null;
    insights: string | null;
  }[];
}

export async function loadDuh(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<DuhView> {
  const dayStart = startOfLocalDay(now, tz);
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);

  const [todayRows, weekRows, last] = await Promise.all([
    prisma.silence.findMany({
      where: { userId, startedAt: { gte: dayStart } },
      select: { minutes: true },
    }),
    prisma.silence.findMany({
      where: { userId, startedAt: { gte: weekStart } },
      select: { minutes: true },
    }),
    prisma.silence.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      take: 3,
      select: { startedAt: true, minutes: true, stage: true, insights: true },
    }),
  ]);

  const counted = todayRows.filter((s) => qualifies(s.minutes));

  return {
    today: {
      practiced: counted.length > 0,
      minutes: todayRows.reduce((acc, s) => acc + s.minutes, 0),
      sessions: todayRows.length,
    },
    week: {
      sessions: weekRows.length,
      minutes: weekRows.reduce((acc, s) => acc + s.minutes, 0),
    },
    last: last.map((s) => ({
      at: s.startedAt.toISOString(),
      minutes: s.minutes,
      stage: s.stage,
      insights: s.insights,
    })),
  };
}
