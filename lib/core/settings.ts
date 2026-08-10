/**
 * Настройки ритуального дня.
 *
 * Здесь живёт единственная нетривиальная проверка: окно, попавшее в тихие
 * часы, не сработает НИКОГДА — планировщик молчит и по времени окна, и по
 * «сейчас». Без явного отказа человек поставил бы Декларацию на 23:30 и потом
 * решил, что бот сломался.
 *
 * Всё остальное — границы: минуты в сутках, дни недели, интенсивность и
 * пригодность часового пояса.
 */

import { inQuietHours, type ScheduleSettings } from './schedule';

export const INTENSITY_LABEL: Record<number, string> = {
  0: 'минимум',
  1: 'норма',
  2: 'полная',
};

/** Что приходит на каждой интенсивности — словами, а не догадками. */
export const INTENSITY_HINT: Record<number, string> = {
  0: 'только вечерняя Декларация',
  1: 'утро, вечер, ночь и Дар по воскресеньям',
  2: 'плюс напоминание Разума, Дни Очищения и Свиток недели',
};

export const WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export interface EditableSettings extends ScheduleSettings {
  tz: string;
}

export type Field =
  | 'morningAt'
  | 'mindAt'
  | 'eveningAt'
  | 'nightAt'
  | 'quietFrom'
  | 'quietTo'
  | 'fastWeekdays'
  | 'intensity'
  | 'tz';

export interface Problem {
  field: Field;
  message: string;
}

const WINDOW_LABEL: Record<string, string> = {
  morningAt: 'Утро',
  mindAt: 'День',
  eveningAt: 'Вечер',
  nightAt: 'Ночь',
};

/** `07:00` → 420. Возвращает null, если строка не похожа на время. */
export function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 420 → `07:00`. */
export function toClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1440;
}

/**
 * Проверка целиком. Возвращает список проблем, а не первую попавшуюся:
 * человек чинит форму один раз, а не по кругу.
 */
export function validateSettings(input: EditableSettings): Problem[] {
  const problems: Problem[] = [];

  for (const field of ['morningAt', 'mindAt', 'eveningAt', 'nightAt', 'quietFrom', 'quietTo'] as const) {
    if (!isMinute(input[field])) {
      problems.push({ field, message: 'время в пределах суток' });
    }
  }
  if (problems.length > 0) return problems;

  // Окно, накрытое тишиной, не сработает ни разу: планировщик молчит и по
  // времени окна, и по моменту доставки.
  for (const field of ['morningAt', 'mindAt', 'eveningAt', 'nightAt'] as const) {
    if (inQuietHours(input[field], input.quietFrom, input.quietTo)) {
      problems.push({
        field,
        message: `${WINDOW_LABEL[field]} попадает в тихие часы — ритуал не придёт ни разу`,
      });
    }
  }

  if (!Array.isArray(input.fastWeekdays) || input.fastWeekdays.some((d) => d < 1 || d > 7)) {
    problems.push({ field: 'fastWeekdays', message: 'дни недели от 1 до 7' });
  }

  if (![0, 1, 2].includes(input.intensity)) {
    problems.push({ field: 'intensity', message: 'интенсивность 0, 1 или 2' });
  }

  if (typeof input.tz !== 'string' || !isValidZone(input.tz)) {
    problems.push({ field: 'tz', message: 'неизвестный часовой пояс' });
  }

  return problems;
}

/**
 * Во сколько сегодня придут ритуалы — по одним лишь настройкам.
 *
 * Показывается на экране: минуты в полях абстрактны, а список «в 07:00, в
 * 21:00, в 22:30» отвечает на единственный вопрос, который человек и задаёт.
 */
export function preview(settings: EditableSettings): { label: string; at: string }[] {
  const list: { label: string; at: string; order: number }[] = [];

  if (settings.intensity >= 1) {
    list.push({ label: 'Благодарение Сна и Слово Дня', at: toClock(settings.morningAt), order: settings.morningAt });
  }
  if (settings.intensity >= 2) {
    list.push({ label: 'Напоминание Разума', at: toClock(settings.mindAt), order: settings.mindAt });
  }
  list.push({
    label: 'Декларация на завтра',
    at: toClock(settings.eveningAt),
    order: settings.eveningAt,
  });
  if (settings.intensity >= 1) {
    list.push({
      label: 'Благодарение Тела и закрытие дня',
      at: toClock(settings.nightAt),
      order: settings.nightAt,
    });
  }

  return list.sort((a, b) => a.order - b.order).map(({ label, at }) => ({ label, at }));
}
