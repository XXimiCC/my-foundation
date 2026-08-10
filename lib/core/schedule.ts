/**
 * Ритуальный день: какие окна наступили и что можно отправлять.
 *
 * Здесь только чистая логика — время, тихие часы, идемпотентность. Она вынесена
 * из эндпоинта намеренно: уведомления и есть продукт, и проверять их надо на
 * подменённых часах, а не «потом» на живых людях. Ошибка в этом файле нарушает
 * Основу 4 — «приложение не имеет права быть источником стресса».
 */

import { localDateKey } from './put';
import { localMinutes, localWeekday } from './post';

export type RitualKind =
  | 'MORNING_BLESSING'
  | 'WORD_OF_DAY'
  | 'MIND_REMINDER'
  | 'EVENING_DECLARATION'
  | 'NIGHT_CLOSING'
  | 'GIFT_WEEKLY'
  | 'FAST_OFFER'
  | 'FAST_JOURNAL'
  | 'SCROLL_WEEKLY';

/**
 * Сколько минут окно остаётся годным к отправке.
 *
 * Пингер внешний и может пропустить тик — но приходить через три часа после
 * своего времени ритуал не должен: ночное закрытие дня, доставленное в два
 * часа ночи, это ровно тот стресс, который запрещён. Полтора часа покрывают
 * несколько пропущенных тиков и не превращают ритуал в случайность.
 */
export const GRACE_MINUTES = 90;

/** Интенсивность из настроек: 0 — минимум, 1 — норма, 2 — полная. */
export type Intensity = 0 | 1 | 2;

export interface ScheduleSettings {
  morningAt: number;
  mindAt: number;
  eveningAt: number;
  nightAt: number;
  quietFrom: number;
  quietTo: number;
  fastWeekdays: number[];
  intensity: number;
}

/** Что известно о человеке на сегодня — от этого зависит, звать ли вообще. */
export interface DayFacts {
  /** Идёт ли пост и какой сегодня его день. */
  fastDay: number | null;
  fastKind: 'CLEANSING_DAY' | 'REDEMPTION_MONTH' | null;
  /** Декларация на завтра уже составлена. */
  tomorrowDeclared: boolean;
  /** Сегодняшняя Декларация закрыта. */
  todayClosed: boolean;
  /** Благо Сна сегодня уже отмечено. */
  sleepBlessed: boolean;
  /** Заход Слова Дня сегодня пройден. */
  slovoDone: boolean;
  /** Дар на этой неделе уже был. */
  giftThisWeek: boolean;
}

export interface Window {
  kind: RitualKind;
  /** Минуты от полуночи в часах человека. */
  at: number;
}

/** Тихие часы могут переходить через полночь — это норма, а не край. */
export function inQuietHours(minutes: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from > to ? minutes >= from || minutes < to : minutes >= from && minutes < to;
}

/** Дни поста и дневниковые записи — из отчёта «Месяц искупления 2024». */
const JOURNAL_DAYS = [8, 15, 22, 29];

/**
 * Окна ритуального дня.
 *
 * Ритуал не зовут, если он уже сделан: «уведомления редкие». Приложение,
 * которое напоминает о закрытом деле, обучает игнорировать себя.
 */
export function windowsFor(
  settings: ScheduleSettings,
  weekday: number,
  facts: DayFacts,
): Window[] {
  const intensity = Math.max(0, Math.min(2, settings.intensity)) as Intensity;
  const windows: Window[] = [];

  // Вечер — единственное окно, которое остаётся даже на минимуме: без
  // Декларации на завтра Завет ПУТЬ не работает вовсе.
  if (!facts.tomorrowDeclared) {
    windows.push({ kind: 'EVENING_DECLARATION', at: settings.eveningAt });
  }

  if (intensity >= 1) {
    if (!facts.sleepBlessed || !facts.slovoDone) {
      windows.push({ kind: 'MORNING_BLESSING', at: settings.morningAt });
    }
    if (!facts.todayClosed) {
      windows.push({ kind: 'NIGHT_CLOSING', at: settings.nightAt });
    }
    // Воскресенье — день Дара: «каждую неделю необходимо делиться».
    if (weekday === 7 && !facts.giftThisWeek) {
      windows.push({ kind: 'GIFT_WEEKLY', at: settings.mindAt });
    }
    // Дневниковые дни Месяца Искупления.
    if (
      facts.fastKind === 'REDEMPTION_MONTH' &&
      facts.fastDay !== null &&
      JOURNAL_DAYS.includes(facts.fastDay)
    ) {
      windows.push({ kind: 'FAST_JOURNAL', at: settings.nightAt });
    }
  }

  if (intensity >= 2) {
    windows.push({ kind: 'MIND_REMINDER', at: settings.mindAt });
    // День Очищения предлагают в его день и только если пост не идёт.
    if (settings.fastWeekdays.includes(weekday) && facts.fastDay === null) {
      windows.push({ kind: 'FAST_OFFER', at: settings.morningAt });
    }
    if (weekday === 7) {
      // Свиток недели — за час до Декларации, чтобы взгляд назад шёл первым.
      windows.push({ kind: 'SCROLL_WEEKLY', at: settings.eveningAt - 60 });
    }
  }

  return windows.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/**
 * Окна, которые пора отправлять прямо сейчас.
 *
 * Тихие часы проверяются дважды: и по времени окна, и по «сейчас». Первое
 * отсекает ритуал, чьё время само попало в тишину; второе — доставку, которая
 * доползла до неё из-за пропущенных тиков.
 */
export function dueWindows(
  windows: Window[],
  nowMinutes: number,
  settings: ScheduleSettings,
  grace = GRACE_MINUTES,
): Window[] {
  if (inQuietHours(nowMinutes, settings.quietFrom, settings.quietTo)) return [];

  return windows.filter((w) => {
    if (inQuietHours(w.at, settings.quietFrom, settings.quietTo)) return false;
    const waited = nowMinutes - w.at;
    return waited >= 0 && waited <= grace;
  });
}

/**
 * Ключ идемпотентности: человек, ритуал и ЛОКАЛЬНАЯ дата.
 *
 * Именно локальная: тики пингера идут по UTC и на границе суток дважды попали
 * бы в одно и то же окно. Уникальный индекс в базе гарантирует, что ритуал не
 * придёт дважды, даже если два тика перекрылись.
 */
export function dedupeKey(userId: string, kind: RitualKind, dateKey: string): string {
  return `${userId}:${kind}:${dateKey}`;
}

/** Локальные координаты человека на момент тика. */
export interface LocalNow {
  dateKey: string;
  minutes: number;
  weekday: number;
}

export function localNow(now: Date, tz: string): LocalNow {
  return {
    dateKey: localDateKey(now, tz),
    minutes: localMinutes(now, tz),
    weekday: localWeekday(now, tz),
  };
}
