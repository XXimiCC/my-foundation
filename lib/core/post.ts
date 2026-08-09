/**
 * Завет ПОСТ — Дни Очищения и Месяц Искупления.
 *
 * «Развитие не там, где потребление, а там где ограничения... Ритуальный Завет
 * Пост — это временная самоизоляция от дешёвых удовольствий тут и сейчас, для
 * того чтобы мне захотелось стремиться к дорогим удовольствиям там и потом».
 *
 * Два запрета, оба названы в тексте прямо: на вкусную еду и на развлекательную
 * информацию. Длительность тоже названа: «Пост длится либо один месяц, если это
 * конец года. Либо один день, если это понедельник или пятница».
 *
 * Даты Месяца Искупления и дневниковые дни взяты из отчёта «Месяц искупления
 * 2024»: записи там сделаны на 8-й, 15-й, 22-й и 29-й день. Вопросы итогов —
 * оттуда же, дословно.
 */

import type { PrismaClient } from '@prisma/client';
import { dateFromKey, keyFromDate, localDateKey, shiftKey } from './put';
import { startOfLocalDay } from './state';

export type FastKind = 'CLEANSING_DAY' | 'REDEMPTION_MONTH';

/** «Приём пищи разрешён только в течении 8 часов». */
export const EAT_WINDOW_HOURS = 8;
/** «Кушать можно с 11:00 до 19:00» — окно из отчёта за 2024. */
export const DEFAULT_EAT_FROM = 11 * 60;
export const DEFAULT_EAT_TO = 19 * 60;

/** «Нельзя есть вкусное: жирное, сладкое, жаренное». */
export const FOOD_BANS = ['жирное', 'сладкое', 'жареное'] as const;
export const FOOD_ALLOWED = 'постная и варёная пища, без избыточного удовольствия';

/** Список запретной информации — перечислен в Завете поимённо. */
export const INFO_BANS = [
  'видео, шоу, фильмы, сериалы',
  'музыка, подкасты, аудиокниги',
  'игры',
  'социальные сети и новости',
  'юмористический контент и порно',
] as const;

/** «Можно: читать, думать, творить, изучать познавательную информацию». */
export const ALLOWED = ['читать', 'думать', 'творить', 'изучать познавательное'] as const;

/** Правило на случай сомнения. Приведено дословно: оно и есть решение. */
export const DOUBT_RULE = 'Если вы не уверены: можно это или нельзя, то лучше остаться голодным.';

// ─── Месяц Искупления ───────────────────────────────────────────────────────

/** «Начинается 1-го декабря и длится в течении всего месяца». */
export const REDEMPTION_MONTH = 12;
export const REDEMPTION_FIRST_DAY = 1;
export const REDEMPTION_LAST_DAY = 31;
/** Подготовка: закупка и список идей начинались за неделю до начала. */
export const PREPARATION_FROM = { month: 11, day: 25 };

/** Дни, на которые в отчёте за 2024 сделаны дневниковые записи. */
export const JOURNAL_DAYS = [8, 15, 22, 29] as const;

/** Вопросы итогов — дословно из отчёта «Месяц искупления 2024». */
export const SUMMARY_QUESTIONS = [
  'Как я чувствую себя физически после месяца искуплений?',
  'Было ли трудно соблюдать ограничения? Что помогало оставаться на пути?',
  'Появились ли новые полезные привычки?',
  'Что я узнал о себе за этот месяц?',
] as const;

export type RedemptionPhase = 'далеко' | 'подготовка' | 'идёт' | 'итоги';

/** Разбор ключа `YYYY-MM-DD` без часовых поясов — они уже учтены в ключе. */
function partsOf(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/**
 * Где сейчас год относительно Месяца Искупления.
 * «Итоги» — последний день: 31 декабря отчёт уже пишут.
 */
export function redemptionPhase(todayKey: string): RedemptionPhase {
  const { month, day } = partsOf(todayKey);
  if (month === REDEMPTION_MONTH) {
    return day === REDEMPTION_LAST_DAY ? 'итоги' : 'идёт';
  }
  if (month === PREPARATION_FROM.month && day >= PREPARATION_FROM.day) return 'подготовка';
  return 'далеко';
}

/** Ключ первого дня ближайшего Месяца Искупления. */
export function redemptionStartKey(todayKey: string): string {
  const { year, month } = partsOf(todayKey);
  const target = month === REDEMPTION_MONTH ? year : year + (month > REDEMPTION_MONTH ? 1 : 0);
  return `${target}-12-01`;
}

export function redemptionEndKey(todayKey: string): string {
  return `${partsOf(redemptionStartKey(todayKey)).year}-12-31`;
}

/** Сколько суток осталось до начала Месяца Искупления. */
export function daysUntilRedemption(todayKey: string): number {
  const start = dateFromKey(redemptionStartKey(todayKey)).getTime();
  return Math.round((start - dateFromKey(todayKey).getTime()) / 86_400_000);
}

// ─── Дни Очищения ───────────────────────────────────────────────────────────

/** 1 = понедельник. По умолчанию Пн и Пт — как советует сам Завет. */
export const DEFAULT_FAST_WEEKDAYS = [1, 5];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const WEEKDAY_LABEL = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
];

/** Номер дня недели в часах человека, 1 = понедельник. */
export function localWeekday(now: Date, tz: string): number {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return Math.max(0, WEEKDAYS.indexOf(short)) + 1;
}

/**
 * Ближайший День Очищения, считая с сегодняшнего.
 * «Сделайте День Очищения в ближайший Понедельник или Пятницу.»
 */
export function nextCleansingKey(
  todayKey: string,
  todayWeekday: number,
  weekdays: number[] = DEFAULT_FAST_WEEKDAYS,
): string | null {
  if (weekdays.length === 0) return null;
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const weekday = ((todayWeekday - 1 + ahead) % 7) + 1;
    if (weekdays.includes(weekday)) return shiftKey(todayKey, ahead);
  }
  return null;
}

// ─── Окно еды ───────────────────────────────────────────────────────────────

/** Минуты от полуночи в часах человека. */
export function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

export interface EatWindow {
  open: boolean;
  from: number;
  to: number;
  /** Минут до закрытия окна, если оно открыто. */
  left: number;
  /** Минут до открытия, если закрыто. */
  until: number;
}

/**
 * Окно приёма пищи. «Нельзя есть утром или вечером» — значит окно всегда
 * лежит внутри суток и через полночь не переходит.
 */
export function eatWindow(minutesNow: number, from: number, to: number): EatWindow {
  const open = minutesNow >= from && minutesNow < to;
  return {
    open,
    from,
    to,
    left: open ? to - minutesNow : 0,
    until: open ? 0 : minutesNow < from ? from - minutesNow : 24 * 60 - minutesNow + from,
  };
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ─── Ход поста ──────────────────────────────────────────────────────────────

export interface FastDay {
  date: string;
  foodOk: boolean;
  infoOk: boolean;
  note: string | null;
}

/** День соблюдён, когда выдержаны оба запрета. */
export function isKept(day: { foodOk: boolean; infoOk: boolean }): boolean {
  return day.foodOk && day.infoOk;
}

/** Какой это день поста, считая с первого. */
export function dayNumber(startKey: string, todayKey: string): number {
  return (
    Math.round(
      (dateFromKey(todayKey).getTime() - dateFromKey(startKey).getTime()) / 86_400_000,
    ) + 1
  );
}

export function isJournalDay(day: number): boolean {
  return (JOURNAL_DAYS as readonly number[]).includes(day);
}

export interface FastProgress {
  day: number;
  total: number;
  kept: number;
  logged: number;
}

export function progressOf(
  startKey: string,
  endKey: string,
  todayKey: string,
  logs: FastDay[],
): FastProgress {
  return {
    day: dayNumber(startKey, todayKey),
    total: dayNumber(startKey, endKey),
    kept: logs.filter(isKept).length,
    logged: logs.length,
  };
}

// ─── Чтение из базы ─────────────────────────────────────────────────────────

export interface PostView {
  /** Идущий пост, если он есть. */
  active: {
    id: string;
    kind: FastKind;
    startKey: string;
    endKey: string;
    eat: EatWindow;
    progress: FastProgress;
    today: FastDay | null;
    journalDay: boolean;
    summary: string | null;
    logs: FastDay[];
  } | null;
  todayKey: string;
  /** Ближайший День Очищения по настройкам человека. */
  nextCleansing: string | null;
  redemption: {
    phase: RedemptionPhase;
    startKey: string;
    endKey: string;
    daysUntil: number;
  };
  /** Сколько Дней Очищения соблюдено за последний месяц. */
  recentCleansings: number;
}

export async function loadPost(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<PostView> {
  const todayKey = localDateKey(now, tz);
  const dayStart = startOfLocalDay(now, tz);

  const [periods, settings] = await Promise.all([
    prisma.fastPeriod.findMany({
      where: { userId, endAt: { gte: new Date(dayStart.getTime() - 31 * 86_400_000) } },
      orderBy: { startAt: 'desc' },
      include: { logs: { orderBy: { date: 'asc' } } },
    }),
    prisma.settings.findUnique({ where: { userId }, select: { fastWeekdays: true } }),
  ]);

  // Идущим считается тот, в чьи сутки попадает «сейчас». Состояние выводится
  // от дат, а не хранится: та же причина, что у распада оболочек — иначе
  // пропущенный тик планировщика оставил бы пост «активным» навсегда.
  const active = periods.find((p) => p.startAt <= now && p.endAt > now) ?? null;

  const weekdays = settings?.fastWeekdays?.length
    ? settings.fastWeekdays
    : DEFAULT_FAST_WEEKDAYS;

  const recentCleansings = periods.filter(
    (p) => p.kind === 'CLEANSING_DAY' && p.logs.some(isKept),
  ).length;

  return {
    todayKey,
    nextCleansing: nextCleansingKey(todayKey, localWeekday(now, tz), weekdays),
    redemption: {
      phase: redemptionPhase(todayKey),
      startKey: redemptionStartKey(todayKey),
      endKey: redemptionEndKey(todayKey),
      daysUntil: daysUntilRedemption(todayKey),
    },
    recentCleansings,
    active: active
      ? (() => {
          // Ключи считаются форматированием В ЗОНЕ человека, а не через
          // toISOString: полночь в Киеве — это 21:00 предыдущих суток по UTC,
          // и срез ISO-строки дал бы вчерашнюю дату.
          const startKey = localDateKey(active.startAt, tz);
          // Конец хранится как момент ПОСЛЕ последних суток поста, поэтому
          // последний день — это минус сутки.
          const endKey = shiftKey(localDateKey(active.endAt, tz), -1);
          const logs: FastDay[] = active.logs.map((l) => ({
            date: keyFromDate(l.date),
            foodOk: l.foodOk,
            infoOk: l.infoOk,
            note: l.note,
          }));
          const progress = progressOf(startKey, endKey, todayKey, logs);

          return {
            id: active.id,
            kind: active.kind as FastKind,
            startKey,
            endKey,
            eat: eatWindow(localMinutes(now, tz), active.eatFrom, active.eatTo),
            progress,
            today: logs.find((l) => l.date === todayKey) ?? null,
            journalDay: isJournalDay(progress.day),
            summary: active.summary,
            logs,
          };
        })()
      : null,
  };
}
