import { describe, expect, it } from 'vitest';
import {
  DURATIONS,
  MAX_MINUTES,
  MIN_MINUTES,
  STAGE_AT,
  creditedMinutes,
  normalizeDuration,
  progressOf,
  qualifies,
  stageAt,
  stagesReached,
} from './duh';

describe('Стадии Тишины', () => {
  it('идут в порядке Основы 7 и только вперёд', () => {
    expect(stageAt(0)).toBe('PLOT');
    expect(stageAt(7.9)).toBe('PLOT');
    expect(stageAt(8)).toBe('INSIGHT');
    expect(stageAt(19.9)).toBe('INSIGHT');
    expect(stageAt(20)).toBe('BOREDOM');
    expect(stageAt(100)).toBe('BOREDOM');
  });

  it('минимальная практика честно остаётся Сюжетом', () => {
    expect(stageAt(MIN_MINUTES)).toBe('PLOT');
    expect(stagesReached(MIN_MINUTES)).toEqual(['PLOT']);
  });

  it('полная практика доходит до Скуки', () => {
    expect(stagesReached(MAX_MINUTES)).toEqual(['PLOT', 'INSIGHT', 'BOREDOM']);
  });

  it('стадию нельзя перепрыгнуть', () => {
    expect(stagesReached(10)).toEqual(['PLOT', 'INSIGHT']);
    expect(STAGE_AT.PLOT).toBeLessThan(STAGE_AT.INSIGHT);
    expect(STAGE_AT.INSIGHT).toBeLessThan(STAGE_AT.BOREDOM);
  });
});

describe('Учёт времени практики', () => {
  const start = new Date('2026-08-09T20:00:00Z');

  it('считает от метки начала, а не от тиков', () => {
    const now = new Date('2026-08-09T20:12:00Z');
    expect(creditedMinutes(start, 30, now)).toBeCloseTo(12, 6);
  });

  it('сверх запланированного не начисляет: забытая вкладка не есть Тишина', () => {
    const muchLater = new Date('2026-08-09T23:00:00Z');
    expect(creditedMinutes(start, 20, muchLater)).toBe(20);
  });

  it('никогда не превышает ста минут', () => {
    const muchLater = new Date('2026-08-10T20:00:00Z');
    expect(creditedMinutes(start, 500, muchLater)).toBe(MAX_MINUTES);
  });

  it('отрицательного времени не бывает', () => {
    const before = new Date('2026-08-09T19:50:00Z');
    expect(creditedMinutes(start, 30, before)).toBe(0);
  });

  it('короче пяти минут — это пауза, а не Тишина', () => {
    expect(qualifies(4.9)).toBe(false);
    expect(qualifies(5)).toBe(true);
  });
});

describe('Длительность практики', () => {
  it('принимает только диапазон из текста Завета', () => {
    expect(normalizeDuration(5)).toBe(5);
    expect(normalizeDuration(100)).toBe(100);
    expect(normalizeDuration(4)).toBeNull();
    expect(normalizeDuration(101)).toBeNull();
    expect(normalizeDuration('20')).toBeNull();
    expect(normalizeDuration(Number.NaN)).toBeNull();
  });

  it('все готовые длительности допустимы', () => {
    for (const d of DURATIONS) expect(normalizeDuration(d)).toBe(d);
  });
});

describe('Кольцо-часы', () => {
  it('идёт от нуля до единицы', () => {
    expect(progressOf(0, 20)).toBe(0);
    expect(progressOf(10, 20)).toBe(0.5);
    expect(progressOf(30, 20)).toBe(1);
  });

  it('не ломается на нулевой длительности', () => {
    expect(progressOf(5, 0)).toBe(0);
  });
});
