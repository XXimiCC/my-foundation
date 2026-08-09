/**
 * Состояние оболочек человека на «сейчас».
 *
 * Распад НЕ хранится и не считается по расписанию: в базе лежит уровень на
 * момент последнего акта, а падение выводится от даты. Так состояние всегда
 * верно, даже если человек не заходил месяц и никакой фоновый пересчёт не
 * работал.
 */

import type { PrismaClient } from '@prisma/client';
import {
  DAY_MS,
  SHELLS,
  applyAct,
  bol,
  decayShell,
  levelsOf,
  passivityDays,
  sila,
  weakestShell,
  type Shell,
  type TriquetraState,
} from './shells';

export interface DailyCounts {
  acts: Record<Shell, number>;
  /** Виды Благ, отмеченные сегодня. */
  blessings: string[];
  blessingTaps: number;
}

export interface CoreState {
  levels: Record<Shell, number>;
  sila: number;
  bol: number;
  weakest: Shell;
  passivityDays: number;
  today: DailyCounts;
}

/** Начало сегодняшних суток в таймзоне человека. */
export function startOfLocalDay(now: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const local = `${get('year')}-${get('month')}-${get('day')}T00:00:00`;

  // Смещение зоны на этот момент — чтобы получить ту же полночь в UTC.
  const asUtc = new Date(`${local}Z`);
  const shifted = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localised = new Date(asUtc.toLocaleString('en-US', { timeZone: tz }));
  return new Date(asUtc.getTime() + (shifted.getTime() - localised.getTime()));
}

/** Читает оболочки и приводит их к «сейчас». */
export async function loadShells(
  prisma: PrismaClient,
  userId: string,
  now: Date,
): Promise<TriquetraState> {
  const rows = await prisma.shellState.findMany({ where: { userId } });

  const state = {} as TriquetraState;
  for (const shell of SHELLS) {
    const row = rows.find((r) => r.shell === shell);
    state[shell] = decayShell(
      { level: row?.level ?? 0, lastActAt: row?.lastActAt ?? null },
      shell,
      now,
    );
  }
  return state;
}

export async function loadState(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<CoreState> {
  const dayStart = startOfLocalDay(now, tz);
  const [state, acts, blessings] = await Promise.all([
    loadShells(prisma, userId, now),
    prisma.act.findMany({
      where: { userId, doneAt: { gte: dayStart } },
      select: { shell: true },
    }),
    prisma.blessing.findMany({
      where: { userId, at: { gte: dayStart } },
      select: { blessing: true },
    }),
  ]);

  const levels = levelsOf(state);
  const actCounts = { BODY: 0, MIND: 0, SPIRIT: 0 } as Record<Shell, number>;
  for (const a of acts) actCounts[a.shell] += 1;

  return {
    levels,
    sila: sila(levels),
    bol: bol(levels, passivityDays(state, now)),
    weakest: weakestShell(levels),
    passivityDays: passivityDays(state, now),
    today: {
      acts: actCounts,
      blessings: [...new Set(blessings.map((b) => b.blessing))],
      blessingTaps: blessings.length,
    },
  };
}

/**
 * Записывает акт применения: распад до «сейчас», затем прирост.
 *
 * Возвращает и уровень, и идентификатор акта: Декларация запоминает его в
 * пункте, чтобы повторная отметка того же пункта не начислила акт дважды.
 */
export async function recordAct(
  prisma: PrismaClient,
  userId: string,
  shell: Shell,
  input: { minutes?: number | null; note?: string | null },
  now = new Date(),
): Promise<{ level: number; actId: string }> {
  const row = await prisma.shellState.findUnique({
    where: { userId_shell: { userId, shell } },
  });

  const next = applyAct(
    { level: row?.level ?? 0, lastActAt: row?.lastActAt ?? null },
    shell,
    now,
  );

  const [, act] = await prisma.$transaction([
    prisma.shellState.upsert({
      where: { userId_shell: { userId, shell } },
      create: { userId, shell, level: next.level, lastActAt: now },
      update: { level: next.level, lastActAt: now },
    }),
    prisma.act.create({
      data: { userId, shell, minutes: input.minutes ?? null, note: input.note ?? null, doneAt: now },
    }),
  ]);

  return { level: next.level, actId: act.id };
}

/** Всего Благ в Завете БЛАГ: Сон, Вода, Еда, Тепло, Тело. */
export const BLESSING_KINDS = ['SLEEP', 'WATER', 'FOOD', 'WARMTH', 'BODY'] as const;
export type BlessingKind = (typeof BLESSING_KINDS)[number];

/**
 * Благодарение растит Дух: возвышенные эмоции прямо названы в Завете АКТ
 * способом тренировки духа.
 *
 * Но растит его РАЗНООБРАЗИЕ, а не количество нажатий. Благодарить воду
 * положено при каждом соприкосновении — записывается каждое, — а уровень
 * поднимает только новый вид Блага за сутки, и всего их пять.
 */
export function spiritShareForBlessing(distinctToday: number): number {
  return distinctToday >= 1 && distinctToday <= BLESSING_KINDS.length
    ? 1 / BLESSING_KINDS.length
    : 0;
}

export function isSameLocalDay(a: Date, b: Date, tz: string): boolean {
  return startOfLocalDay(a, tz).getTime() === startOfLocalDay(b, tz).getTime();
}

export { DAY_MS };
