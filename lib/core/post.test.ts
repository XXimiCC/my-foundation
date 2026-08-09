import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EAT_FROM,
  DEFAULT_EAT_TO,
  EAT_WINDOW_HOURS,
  JOURNAL_DAYS,
  SUMMARY_QUESTIONS,
  dayNumber,
  daysUntilRedemption,
  eatWindow,
  formatClock,
  isJournalDay,
  isKept,
  localMinutes,
  localWeekday,
  nextCleansingKey,
  progressOf,
  redemptionEndKey,
  redemptionPhase,
  redemptionStartKey,
} from './post';

describe('Окно еды', () => {
  it('длится ровно восемь часов, как велит Завет', () => {
    expect(DEFAULT_EAT_TO - DEFAULT_EAT_FROM).toBe(EAT_WINDOW_HOURS * 60);
  });

  it('открыто днём и закрыто утром и вечером', () => {
    expect(eatWindow(12 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).open).toBe(true);
    expect(eatWindow(9 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).open).toBe(false);
    expect(eatWindow(21 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).open).toBe(false);
  });

  it('в момент открытия окно уже открыто, в момент закрытия — уже нет', () => {
    expect(eatWindow(DEFAULT_EAT_FROM, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).open).toBe(true);
    expect(eatWindow(DEFAULT_EAT_TO, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).open).toBe(false);
  });

  it('считает, сколько осталось есть', () => {
    const w = eatWindow(18 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO);
    expect(w.left).toBe(60);
    expect(w.until).toBe(0);
  });

  it('утром считает до открытия, вечером — до завтрашнего', () => {
    expect(eatWindow(9 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).until).toBe(120);
    // 21:00 → до 11:00 следующего дня четырнадцать часов.
    expect(eatWindow(21 * 60, DEFAULT_EAT_FROM, DEFAULT_EAT_TO).until).toBe(14 * 60);
  });

  it('часы читаются человеком', () => {
    expect(formatClock(DEFAULT_EAT_FROM)).toBe('11:00');
    expect(formatClock(DEFAULT_EAT_TO)).toBe('19:00');
    expect(formatClock(0)).toBe('00:00');
  });

  it('минуты берутся в часах человека, а не машины', () => {
    // 09:30 UTC = 12:30 в Киеве летом.
    const now = new Date('2026-08-09T09:30:00Z');
    expect(localMinutes(now, 'Europe/Kyiv')).toBe(12 * 60 + 30);
    expect(localMinutes(now, 'UTC')).toBe(9 * 60 + 30);
  });

  it('полночь — это ноль, а не двадцать четыре часа', () => {
    expect(localMinutes(new Date('2026-08-09T21:00:00Z'), 'Europe/Kyiv')).toBe(0);
  });
});

describe('Месяц Искупления', () => {
  it('идёт весь декабрь и заканчивается итогами', () => {
    expect(redemptionPhase('2026-12-01')).toBe('идёт');
    expect(redemptionPhase('2026-12-15')).toBe('идёт');
    expect(redemptionPhase('2026-12-31')).toBe('итоги');
  });

  it('подготовка начинается 25 ноября', () => {
    expect(redemptionPhase('2026-11-24')).toBe('далеко');
    expect(redemptionPhase('2026-11-25')).toBe('подготовка');
    expect(redemptionPhase('2026-11-30')).toBe('подготовка');
  });

  it('в остальное время он просто далеко', () => {
    expect(redemptionPhase('2026-08-09')).toBe('далеко');
    expect(redemptionPhase('2026-01-15')).toBe('далеко');
  });

  it('ближайший декабрь — этого года, а после декабря — следующего', () => {
    expect(redemptionStartKey('2026-08-09')).toBe('2026-12-01');
    expect(redemptionEndKey('2026-08-09')).toBe('2026-12-31');
    expect(redemptionStartKey('2026-12-15')).toBe('2026-12-01');
  });

  it('обратный отсчёт честен', () => {
    expect(daysUntilRedemption('2026-11-25')).toBe(6);
    expect(daysUntilRedemption('2026-12-01')).toBe(0);
  });

  it('дневниковые дни взяты из отчёта за 2024', () => {
    expect(JOURNAL_DAYS).toEqual([8, 15, 22, 29]);
    expect(isJournalDay(8)).toBe(true);
    expect(isJournalDay(9)).toBe(false);
  });

  it('вопросов итогов четыре', () => {
    expect(SUMMARY_QUESTIONS).toHaveLength(4);
  });
});

describe('Дни Очищения', () => {
  it('ближайший — сегодняшний, если сегодня и есть день поста', () => {
    // 10 августа 2026 — понедельник.
    expect(nextCleansingKey('2026-08-10', 1, [1, 5])).toBe('2026-08-10');
  });

  it('со вторника ближайший — пятница', () => {
    expect(nextCleansingKey('2026-08-11', 2, [1, 5])).toBe('2026-08-14');
  });

  it('с субботы ближайший — понедельник', () => {
    expect(nextCleansingKey('2026-08-15', 6, [1, 5])).toBe('2026-08-17');
  });

  it('без выбранных дней ближайшего нет: пост желателен, но не обязателен', () => {
    expect(nextCleansingKey('2026-08-10', 1, [])).toBeNull();
  });

  it('день недели берётся в часах человека', () => {
    // Воскресенье 22:30 по Киеву — это ещё воскресенье.
    expect(localWeekday(new Date('2026-08-09T19:30:00Z'), 'Europe/Kyiv')).toBe(7);
    // А 21:30 UTC — это уже понедельник по Киеву.
    expect(localWeekday(new Date('2026-08-09T21:30:00Z'), 'Europe/Kyiv')).toBe(1);
  });
});

describe('Ход поста', () => {
  it('день соблюдён, только когда выдержаны оба запрета', () => {
    expect(isKept({ foodOk: true, infoOk: true })).toBe(true);
    expect(isKept({ foodOk: true, infoOk: false })).toBe(false);
    expect(isKept({ foodOk: false, infoOk: true })).toBe(false);
  });

  it('День Очищения — это один день', () => {
    expect(dayNumber('2026-08-10', '2026-08-10')).toBe(1);
  });

  it('декабрь — тридцать один', () => {
    expect(dayNumber('2026-12-01', '2026-12-31')).toBe(31);
  });

  it('считает соблюдённые дни, не наказывая за сорванные', () => {
    const logs = [
      { date: '2026-12-01', foodOk: true, infoOk: true, note: null },
      { date: '2026-12-02', foodOk: false, infoOk: true, note: 'булочка' },
      { date: '2026-12-03', foodOk: true, infoOk: true, note: null },
    ];
    const p = progressOf('2026-12-01', '2026-12-31', '2026-12-03', logs);
    expect(p).toEqual({ day: 3, total: 31, kept: 2, logged: 3 });
  });
});
