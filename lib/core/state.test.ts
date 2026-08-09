import { describe, expect, it } from 'vitest';
import { BLESSING_KINDS, isSameLocalDay, spiritShareForBlessing, startOfLocalDay } from './state';

describe('Локальные сутки', () => {
  it('полночь в Киеве наступает раньше, чем в UTC', () => {
    const now = new Date('2026-08-09T10:00:00Z');
    const kyiv = startOfLocalDay(now, 'Europe/Kyiv');
    const utc = startOfLocalDay(now, 'UTC');
    expect(kyiv.getTime()).toBeLessThan(utc.getTime());
  });

  it('поздний вечер по Киеву — это уже следующие сутки относительно UTC', () => {
    // 22:30 в Киеве = 19:30 UTC того же дня, но ночной ритуал должен попасть
    // в текущие киевские сутки, а не в предыдущие.
    const night = new Date('2026-08-09T19:30:00Z');
    const day = startOfLocalDay(night, 'Europe/Kyiv');
    expect(day.toISOString()).toBe('2026-08-08T21:00:00.000Z');
  });

  it('два момента одних суток совпадают, разных — нет', () => {
    const tz = 'Europe/Kyiv';
    const morning = new Date('2026-08-09T05:00:00Z');
    const evening = new Date('2026-08-09T18:00:00Z');
    const nextDay = new Date('2026-08-10T05:00:00Z');
    expect(isSameLocalDay(morning, evening, tz)).toBe(true);
    expect(isSameLocalDay(evening, nextDay, tz)).toBe(false);
  });

  it('переживает зону с получасовым сдвигом', () => {
    const now = new Date('2026-08-09T10:00:00Z');
    expect(() => startOfLocalDay(now, 'Asia/Kolkata')).not.toThrow();
  });
});

describe('Благодарение растит Дух разнообразием', () => {
  it('пять Благ дают ровно один акт в сумме', () => {
    const total = BLESSING_KINDS.reduce((acc) => acc + spiritShareForBlessing(1), 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('одно Благо даёт пятую часть', () => {
    expect(spiritShareForBlessing(1)).toBeCloseTo(0.2, 9);
  });

  it('сверх пяти видов ничего не начисляется', () => {
    expect(spiritShareForBlessing(0)).toBe(0);
    expect(spiritShareForBlessing(6)).toBe(0);
  });

  it('Благ ровно пять — как в Завете БЛАГ', () => {
    expect(BLESSING_KINDS).toEqual(['SLEEP', 'WATER', 'FOOD', 'WARMTH', 'BODY']);
  });
});
