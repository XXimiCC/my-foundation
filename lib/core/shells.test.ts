import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  applyAct,
  bol,
  decayShell,
  gainForAct,
  passivityDays,
  sila,
  weakestShell,
  type TriquetraState,
} from './shells';

const NOW = new Date('2026-08-08T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('Сила — гармоническое среднее наказывает дисбаланс', () => {
  it('при равной сумме уровней перекос даёт заметно меньшую Силу', () => {
    const balanced = sila({ BODY: 63, MIND: 63, SPIRIT: 63 });
    const skewed = sila({ BODY: 90, MIND: 90, SPIRIT: 10 });
    expect(balanced).toBeCloseTo(63, 1);
    expect(skewed).toBeLessThan(30);
    expect(skewed).toBeLessThan(balanced / 2);
  });

  it('мёртвая оболочка гасит Силу целиком', () => {
    expect(sila({ BODY: 100, MIND: 100, SPIRIT: 0 }), 'тело без души — труп').toBe(0);
  });

  it('на равных уровнях совпадает с самим уровнем', () => {
    expect(sila({ BODY: 40, MIND: 40, SPIRIT: 40 })).toBeCloseTo(40, 1);
  });
});

describe('Боль', () => {
  it('обратна Силе', () => {
    expect(bol({ BODY: 70, MIND: 70, SPIRIT: 70 })).toBeCloseTo(30, 1);
  });

  it('растёт от пассивности сверх дефицита Силы', () => {
    const still = bol({ BODY: 70, MIND: 70, SPIRIT: 70 }, 0);
    const passive = bol({ BODY: 70, MIND: 70, SPIRIT: 70 }, 4);
    expect(passive).toBeGreaterThan(still);
  });

  it('не превышает 100', () => {
    expect(bol({ BODY: 1, MIND: 1, SPIRIT: 1 }, 90)).toBe(100);
  });
});

describe('Распад: что не используем — теряем', () => {
  it('тело не распадается внутри льготных двух суток («через день»)', () => {
    const s = { level: 50, lastActAt: ago(1.5) };
    expect(decayShell(s, 'BODY', NOW).level).toBe(50);
  });

  it('тело теряет уровень после трёх суток простоя', () => {
    const s = { level: 50, lastActAt: ago(3) };
    expect(decayShell(s, 'BODY', NOW).level).toBeLessThan(50);
  });

  it('разум распадается уже на вторые сутки — ему положено ежедневно', () => {
    const s = { level: 50, lastActAt: ago(2) };
    expect(decayShell(s, 'MIND', NOW).level).toBeLessThan(50);
  });

  it('распад не уводит уровень ниже нуля', () => {
    const s = { level: 3, lastActAt: ago(400) };
    expect(decayShell(s, 'MIND', NOW).level).toBe(0);
  });
});

describe('Акт применения', () => {
  it('поднимает уровень и обнуляет простой', () => {
    const after = applyAct({ level: 40, lastActAt: ago(10) }, 'BODY', NOW);
    expect(after.lastActAt).toEqual(NOW);
    expect(after.level).toBeGreaterThan(0);
  });

  it('прирост затухает у потолка — прогресс, а не совершенство', () => {
    expect(gainForAct(95, 'BODY')).toBeLessThan(gainForAct(10, 'BODY'));
  });

  it('уровень не превышает 100', () => {
    const after = applyAct({ level: 99.8, lastActAt: NOW }, 'SPIRIT', NOW);
    expect(after.level).toBeLessThanOrEqual(100);
  });
});

describe('Слабое звено', () => {
  it('называет минимальную оболочку', () => {
    expect(weakestShell({ BODY: 80, MIND: 30, SPIRIT: 55 })).toBe('MIND');
  });
});

describe('Пассивность', () => {
  const state = (days: number): TriquetraState => ({
    BODY: { level: 50, lastActAt: ago(days) },
    MIND: { level: 50, lastActAt: ago(days) },
    SPIRIT: { level: 50, lastActAt: ago(days) },
  });

  it('копится за сутки без единого акта', () => {
    expect(passivityDays(state(5), NOW)).toBe(5);
  });

  it('сбрасывается любым актом по любой оболочке', () => {
    const s = state(5);
    s.BODY = applyAct(s.BODY, 'BODY', NOW);
    expect(passivityDays(s, NOW)).toBe(0);
  });

  it('без единого акта в истории равна нулю, а не бесконечности', () => {
    const virgin: TriquetraState = {
      BODY: { level: 0, lastActAt: null },
      MIND: { level: 0, lastActAt: null },
      SPIRIT: { level: 0, lastActAt: null },
    };
    expect(passivityDays(virgin, NOW)).toBe(0);
  });
});
