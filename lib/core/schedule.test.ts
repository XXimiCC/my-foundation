import { describe, expect, it } from 'vitest';
import {
  GRACE_MINUTES,
  dedupeKey,
  dueWindows,
  inQuietHours,
  localNow,
  windowsFor,
  type DayFacts,
  type ScheduleSettings,
} from './schedule';

const SETTINGS: ScheduleSettings = {
  morningAt: 420, // 07:00
  mindAt: 780, // 13:00
  eveningAt: 1260, // 21:00
  nightAt: 1350, // 22:30
  quietFrom: 1380, // 23:00
  quietTo: 390, // 06:30
  fastWeekdays: [1, 5],
  intensity: 1,
};

const NOTHING_DONE: DayFacts = {
  fastDay: null,
  fastKind: null,
  tomorrowDeclared: false,
  todayClosed: false,
  sleepBlessed: false,
  slovoDone: false,
  giftThisWeek: false,
};

const kinds = (settings: ScheduleSettings, weekday: number, facts: DayFacts) =>
  windowsFor(settings, weekday, facts).map((w) => w.kind);

describe('Тихие часы', () => {
  it('переходят через полночь', () => {
    expect(inQuietHours(1380, 1380, 390)).toBe(true); // 23:00
    expect(inQuietHours(60, 1380, 390)).toBe(true); // 01:00
    expect(inQuietHours(389, 1380, 390)).toBe(true); // 06:29
    expect(inQuietHours(390, 1380, 390)).toBe(false); // 06:30
    expect(inQuietHours(720, 1380, 390)).toBe(false); // полдень
  });

  it('работают и без перехода через полночь', () => {
    expect(inQuietHours(800, 780, 900)).toBe(true);
    expect(inQuietHours(700, 780, 900)).toBe(false);
  });

  it('пустое окно не глушит ничего', () => {
    expect(inQuietHours(1000, 600, 600)).toBe(false);
  });
});

describe('Окна ритуального дня', () => {
  it('на минимуме остаётся только вечерняя Декларация', () => {
    const list = kinds({ ...SETTINGS, intensity: 0 }, 3, NOTHING_DONE);
    expect(list).toEqual(['EVENING_DECLARATION']);
  });

  it('на норме зовут утром, вечером и ночью', () => {
    const list = kinds(SETTINGS, 3, NOTHING_DONE);
    expect(list).toEqual(['MORNING_BLESSING', 'EVENING_DECLARATION', 'NIGHT_CLOSING']);
  });

  it('сделанный ритуал не зовут повторно', () => {
    const done: DayFacts = {
      ...NOTHING_DONE,
      sleepBlessed: true,
      slovoDone: true,
      tomorrowDeclared: true,
      todayClosed: true,
    };
    expect(kinds(SETTINGS, 3, done)).toEqual([]);
  });

  it('утро зовут, если сделана только половина', () => {
    const half: DayFacts = { ...NOTHING_DONE, sleepBlessed: true };
    expect(kinds(SETTINGS, 3, half)).toContain('MORNING_BLESSING');
  });

  it('воскресенье добавляет Дар, и только если его ещё не было', () => {
    expect(kinds(SETTINGS, 7, NOTHING_DONE)).toContain('GIFT_WEEKLY');
    expect(kinds(SETTINGS, 7, { ...NOTHING_DONE, giftThisWeek: true })).not.toContain(
      'GIFT_WEEKLY',
    );
    expect(kinds(SETTINGS, 6, NOTHING_DONE)).not.toContain('GIFT_WEEKLY');
  });

  it('День Очищения предлагают только на полной интенсивности и только в его день', () => {
    const full = { ...SETTINGS, intensity: 2 };
    expect(kinds(full, 1, NOTHING_DONE)).toContain('FAST_OFFER');
    expect(kinds(full, 3, NOTHING_DONE)).not.toContain('FAST_OFFER');
    expect(kinds(SETTINGS, 1, NOTHING_DONE)).not.toContain('FAST_OFFER');
  });

  it('во время поста его же и не предлагают', () => {
    const full = { ...SETTINGS, intensity: 2 };
    const fasting: DayFacts = { ...NOTHING_DONE, fastDay: 1, fastKind: 'CLEANSING_DAY' };
    expect(kinds(full, 1, fasting)).not.toContain('FAST_OFFER');
  });

  it('дневниковые вопросы приходят на 8, 15, 22 и 29 день Месяца', () => {
    for (const day of [8, 15, 22, 29]) {
      const facts: DayFacts = { ...NOTHING_DONE, fastDay: day, fastKind: 'REDEMPTION_MONTH' };
      expect(kinds(SETTINGS, 3, facts)).toContain('FAST_JOURNAL');
    }
    const ordinary: DayFacts = { ...NOTHING_DONE, fastDay: 9, fastKind: 'REDEMPTION_MONTH' };
    expect(kinds(SETTINGS, 3, ordinary)).not.toContain('FAST_JOURNAL');
  });

  it('в День Очищения дневниковых вопросов нет: они про Месяц', () => {
    const facts: DayFacts = { ...NOTHING_DONE, fastDay: 8, fastKind: 'CLEANSING_DAY' };
    expect(kinds(SETTINGS, 3, facts)).not.toContain('FAST_JOURNAL');
  });

  it('Свиток недели идёт раньше Декларации: взгляд назад первым', () => {
    const full = { ...SETTINGS, intensity: 2 };
    const windows = windowsFor(full, 7, NOTHING_DONE);
    const scroll = windows.find((w) => w.kind === 'SCROLL_WEEKLY')!;
    const evening = windows.find((w) => w.kind === 'EVENING_DECLARATION')!;
    expect(scroll.at).toBeLessThan(evening.at);
  });
});

describe('Что отправлять сейчас', () => {
  const windows = windowsFor(SETTINGS, 3, NOTHING_DONE);

  it('окно наступает в свою минуту', () => {
    expect(dueWindows(windows, 420, SETTINGS).map((w) => w.kind)).toEqual([
      'MORNING_BLESSING',
    ]);
  });

  it('до срока не отправляется ничего', () => {
    expect(dueWindows(windows, 419, SETTINGS)).toEqual([]);
  });

  it('пропущенный тик прощается в пределах льготы', () => {
    expect(dueWindows(windows, 420 + GRACE_MINUTES, SETTINGS)).toHaveLength(1);
    expect(dueWindows(windows, 420 + GRACE_MINUTES + 1, SETTINGS)).toHaveLength(0);
  });

  it('в тихие часы не отправляется ничего, что бы ни накопилось', () => {
    // 23:30 — тишина. Ночное окно было в 22:30 и ещё в льготе, но молчим.
    expect(dueWindows(windows, 1410, SETTINGS)).toEqual([]);
  });

  it('окно, попавшее в тишину настройками, не отправляется вовсе', () => {
    const late = { ...SETTINGS, nightAt: 1400 };
    const list = windowsFor(late, 3, NOTHING_DONE);
    expect(dueWindows(list, 1400, late)).toEqual([]);
  });

  it('ночное закрытие после полуночи не догоняет: сутки уже другие', () => {
    // 00:20 — и тишина, и отрицательное ожидание.
    expect(dueWindows(windows, 20, SETTINGS)).toEqual([]);
  });
});

describe('Идемпотентность', () => {
  it('ключ собирается из человека, ритуала и локальной даты', () => {
    expect(dedupeKey('u1', 'MORNING_BLESSING', '2026-08-10')).toBe(
      'u1:MORNING_BLESSING:2026-08-10',
    );
  });

  it('два тика в одни локальные сутки дают один и тот же ключ', () => {
    const kyiv = 'Europe/Kyiv';
    const a = localNow(new Date('2026-08-10T04:05:00Z'), kyiv);
    const b = localNow(new Date('2026-08-10T04:20:00Z'), kyiv);
    expect(dedupeKey('u1', 'MORNING_BLESSING', a.dateKey)).toBe(
      dedupeKey('u1', 'MORNING_BLESSING', b.dateKey),
    );
  });

  it('а тики по разные стороны локальной полуночи — разные', () => {
    const kyiv = 'Europe/Kyiv';
    // 20:50 UTC = 23:50 в Киеве, 21:10 UTC = 00:10 следующего дня.
    const before = localNow(new Date('2026-08-10T20:50:00Z'), kyiv);
    const after = localNow(new Date('2026-08-10T21:10:00Z'), kyiv);
    expect(before.dateKey).not.toBe(after.dateKey);
  });

  it('локальные координаты берутся в зоне человека', () => {
    const local = localNow(new Date('2026-08-10T04:05:00Z'), 'Europe/Kyiv');
    expect(local.dateKey).toBe('2026-08-10');
    expect(local.minutes).toBe(7 * 60 + 5);
    expect(local.weekday).toBe(1); // понедельник
  });
});
