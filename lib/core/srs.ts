/**
 * Интервальное повторение для Слова Дня.
 *
 * «Для того чтобы запомнить факты, нужно их активно припоминать. Не
 * просматривать информацию, а пытаться извлечь из своей памяти. Чем больше
 * повторений, тем лучше запоминание» — Основа 6.
 *
 * Отсюда вся механика: сначала человек ПЫТАЕТСЯ вспомнить, и только потом
 * видит текст, а оценку ставит себе сам. Просмотр без попытки припоминания
 * Основе прямо противоречит, поэтому раскрыть тезис нельзя, не нажав «вспомнил
 * или нет».
 *
 * Алгоритм — SM-2 без его тонкостей: у личного тренажёра нет ни данных, ни
 * нужды в точной подгонке кривой забывания. Важна регулярность, а не точность:
 * «знания достигаются не быстрым бегом, а медленной ходьбой».
 */

/** Три оценки — больше человек о себе честно не различает. */
export type Recall = 'ЗАБЫЛ' | 'С ТРУДОМ' | 'ВСПОМНИЛ';

export const RECALLS: readonly Recall[] = ['ЗАБЫЛ', 'С ТРУДОМ', 'ВСПОМНИЛ'] as const;

export interface ReviewState {
  /** Лёгкость: во сколько раз растёт интервал при уверенном припоминании. */
  ease: number;
  /** Текущий интервал в сутках. Ноль — тезис ещё ни разу не припоминали. */
  interval: number;
  /** Сколько раз подряд припомнили. Сбрасывается забытым. */
  reps: number;
  /** Сколько раз забывали за всю жизнь тезиса. Это счётчик опыта, не штраф. */
  lapses: number;
}

export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 2.8;

/** Первые два интервала фиксированы: дальше их считает лёгкость. */
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 3;
/** Дальше года не откладываем: Канон живой, и его перечитывают. */
export const MAX_INTERVAL = 365;

export const INITIAL: ReviewState = { ease: EASE_START, interval: 0, reps: 0, lapses: 0 };

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Новое состояние тезиса после попытки припоминания.
 *
 * Забытый тезис возвращается на завтра, но НЕ обнуляет опыт: `lapses` растёт
 * как счётчик встреч, а не как штраф. «Ошибки — это начало опыта, а опыт — это
 * начало мудрости» (Основа 6), и в Основании ничего не отнимают за срыв.
 */
export function grade(state: ReviewState, recall: Recall): ReviewState {
  const ease = clamp(
    state.ease + (recall === 'ВСПОМНИЛ' ? 0.1 : recall === 'С ТРУДОМ' ? -0.15 : -0.2),
    EASE_MIN,
    EASE_MAX,
  );

  if (recall === 'ЗАБЫЛ') {
    return { ease, interval: FIRST_INTERVAL, reps: 0, lapses: state.lapses + 1 };
  }

  if (recall === 'С ТРУДОМ') {
    // Припомнил, но тяжело: интервал почти не растёт — повторить скоро.
    const interval = clamp(Math.round(Math.max(state.interval, 1) * 1.2), 1, MAX_INTERVAL);
    return { ease, interval, reps: state.reps + 1, lapses: state.lapses };
  }

  const interval =
    state.reps === 0
      ? FIRST_INTERVAL
      : state.reps === 1
        ? SECOND_INTERVAL
        : clamp(Math.round(state.interval * ease), 1, MAX_INTERVAL);

  return { ease, interval, reps: state.reps + 1, lapses: state.lapses };
}

/** Когда тезис вернётся: интервал отсчитывается от сегодняшних суток. */
export function nextDue(interval: number, todayKey: string): string {
  const date = new Date(`${todayKey}T00:00:00.000Z`);
  return new Date(date.getTime() + Math.max(1, interval) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Тезис созрел, если его срок наступил или прошёл. */
export function isDue(dueKey: string, todayKey: string): boolean {
  return dueKey <= todayKey;
}
