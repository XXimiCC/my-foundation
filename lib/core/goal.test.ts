import { describe, expect, it } from 'vitest';
import {
  CARDS_NORM,
  MISSES_TO_DROP,
  PERIODS_TO_GROW,
  SHELL_NORMS,
  goalFor,
  missedPeriods,
  periodOf,
  streakOfPeriods,
} from './goal';

const BODY = SHELL_NORMS.BODY!;
const MIND = SHELL_NORMS.MIND!;

describe('Точка оптимальных усилий', () => {
  it('обычный день держит норму Завета', () => {
    expect(goalFor(BODY, 2, 0).target).toBe(30);
    expect(goalFor(MIND, 2, 0).target).toBe(10);
  });

  it('после трёх пропусков падает к минимуму — «начните с 10 отжиманий»', () => {
    const goal = goalFor(BODY, 0, MISSES_TO_DROP);
    expect(goal.target).toBe(BODY.min);
    expect(goal.trend).toBe('минимум');
  });

  it('неделя подряд поднимает норму на шаг', () => {
    const goal = goalFor(BODY, PERIODS_TO_GROW, 0);
    expect(goal.target).toBe(BODY.base + BODY.step);
    expect(goal.trend).toBe('рост');
  });

  it('две недели — на два шага, и так до потолка', () => {
    expect(goalFor(MIND, 14, 0).target).toBe(MIND.base + MIND.step * 2);
    expect(goalFor(MIND, 700, 0).target).toBe(MIND.max);
  });

  it('пропуски сильнее цепи: вернувшийся получает минимум', () => {
    // Держал полгода, потом пропал на неделю — встречает минимум, а не 90.
    expect(goalFor(BODY, 180, 4).target).toBe(BODY.min);
  });

  it('у Духа нормы в минутах нет — в тексте её не названо', () => {
    expect(SHELL_NORMS.SPIRIT).toBeNull();
  });

  it('норма Слова Дня тоже подстраивается', () => {
    expect(goalFor(CARDS_NORM, 0, 5).target).toBe(CARDS_NORM.min);
    expect(goalFor(CARDS_NORM, 7, 0).target).toBe(CARDS_NORM.base + CARDS_NORM.step);
  });
});

describe('Цепь периодов', () => {
  it('считает дни подряд для ежедневной оболочки', () => {
    const days = ['2026-08-10', '2026-08-09', '2026-08-08'];
    expect(streakOfPeriods(days, 1, '2026-08-10')).toBe(3);
  });

  it('сегодняшний незакрытый день цепь не рвёт — он ещё идёт', () => {
    const days = ['2026-08-09', '2026-08-08'];
    expect(streakOfPeriods(days, 1, '2026-08-10')).toBe(2);
  });

  it('пропуск обрывает цепь', () => {
    const days = ['2026-08-09', '2026-08-06', '2026-08-05'];
    expect(streakOfPeriods(days, 1, '2026-08-10')).toBe(1);
  });

  it('телу довольно акта через день', () => {
    // Тренировки через день закрывают двухдневные периоды целиком.
    const days = ['2026-08-10', '2026-08-08', '2026-08-06', '2026-08-04'];
    expect(streakOfPeriods(days, 2, '2026-08-10')).toBe(4);
  });

  it('без актов цепи нет', () => {
    expect(streakOfPeriods([], 1, '2026-08-10')).toBe(0);
  });

  it('период оболочки — её же льготный срок из Завета АКТ', () => {
    expect(periodOf('BODY')).toBe(2);
    expect(periodOf('MIND')).toBe(1);
    expect(periodOf('SPIRIT')).toBe(1);
  });
});

describe('Пропущенные периоды', () => {
  it('считаются от последнего акта', () => {
    expect(missedPeriods('2026-08-10', 1, '2026-08-10')).toBe(0);
    expect(missedPeriods('2026-08-07', 1, '2026-08-10')).toBe(3);
  });

  it('у тела период двухдневный, поэтому пропусков вдвое меньше', () => {
    expect(missedPeriods('2026-08-04', 2, '2026-08-10')).toBe(3);
  });

  it('новичку норма минимальна: истории ещё нет', () => {
    expect(missedPeriods(null, 1, '2026-08-10')).toBe(MISSES_TO_DROP);
  });
});
