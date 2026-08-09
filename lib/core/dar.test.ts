import { describe, expect, it } from 'vitest';
import {
  GIFT_RESOURCES,
  RESOURCE_HINT,
  RESOURCE_LABEL,
  isGiftResource,
  startOfLocalWeek,
  streakOfWeeks,
} from './dar';

const KYIV = 'Europe/Kyiv';
const WEEK_MS = 7 * 86_400_000;

describe('Неделя Завета ДАР', () => {
  it('начинается в понедельник по часам человека', () => {
    // 9 августа 2026 — воскресенье; неделя началась 3 августа.
    const sunday = new Date('2026-08-09T18:00:00Z');
    expect(startOfLocalWeek(sunday, KYIV).toISOString()).toBe('2026-08-02T21:00:00.000Z');
  });

  it('в понедельник неделя начинается этим же днём', () => {
    const monday = new Date('2026-08-10T09:00:00Z');
    expect(startOfLocalWeek(monday, KYIV).toISOString()).toBe('2026-08-09T21:00:00.000Z');
  });

  it('поздний воскресный вечер ещё принадлежит уходящей неделе', () => {
    // 22:30 в Киеве = 19:30 UTC. По UTC это воскресенье, по Киеву — тоже.
    const lateSunday = new Date('2026-08-09T19:30:00Z');
    const start = startOfLocalWeek(lateSunday, KYIV);
    expect(lateSunday.getTime() - start.getTime()).toBeLessThan(WEEK_MS);
  });

  it('неделя длится ровно семь суток от границы до границы', () => {
    const start = startOfLocalWeek(new Date('2026-08-05T10:00:00Z'), KYIV);
    const nextWeek = startOfLocalWeek(new Date(start.getTime() + WEEK_MS + 3_600_000), KYIV);
    expect(nextWeek.getTime() - start.getTime()).toBe(WEEK_MS);
  });

  it('переживает зону с получасовым сдвигом', () => {
    expect(() => startOfLocalWeek(new Date('2026-08-09T10:00:00Z'), 'Asia/Kolkata')).not.toThrow();
  });
});

describe('Цепь недель с Даром', () => {
  const weekStart = new Date('2026-08-03T00:00:00Z');
  const inWeek = (back: number) => new Date(weekStart.getTime() - back * WEEK_MS + 3_600_000);

  it('считает недели подряд', () => {
    expect(streakOfWeeks([inWeek(0), inWeek(1), inWeek(2)], weekStart)).toBe(3);
  });

  it('пустая текущая неделя цепь не рвёт — она ещё идёт', () => {
    expect(streakOfWeeks([inWeek(1), inWeek(2)], weekStart)).toBe(2);
  });

  it('пропущенная неделя обрывает цепь', () => {
    expect(streakOfWeeks([inWeek(0), inWeek(2), inWeek(3)], weekStart)).toBe(1);
  });

  it('без Даров цепи нет', () => {
    expect(streakOfWeeks([], weekStart)).toBe(0);
  });
});

describe('Ресурсы Дара', () => {
  it('их шесть — по видам из Завета', () => {
    expect(GIFT_RESOURCES).toEqual(['TIME', 'EFFORT', 'INFO', 'RESPECT', 'MONEY', 'THING']);
  });

  it('у каждого есть имя и пример из текста', () => {
    for (const resource of GIFT_RESOURCES) {
      expect(RESOURCE_LABEL[resource].length).toBeGreaterThan(0);
      expect(RESOURCE_HINT[resource].length).toBeGreaterThan(0);
    }
  });

  it('чужого ресурса не бывает', () => {
    expect(isGiftResource('TIME')).toBe(true);
    expect(isGiftResource('СЛАВА')).toBe(false);
    expect(isGiftResource(null)).toBe(false);
  });
});
