import { describe, expect, it } from 'vitest';
import {
  EASE_MAX,
  EASE_MIN,
  FIRST_INTERVAL,
  INITIAL,
  MAX_INTERVAL,
  SECOND_INTERVAL,
  grade,
  isDue,
  nextDue,
  type ReviewState,
} from './srs';

describe('Интервалы припоминания', () => {
  it('первое припоминание возвращает тезис завтра', () => {
    const s = grade(INITIAL, 'ВСПОМНИЛ');
    expect(s.interval).toBe(FIRST_INTERVAL);
    expect(s.reps).toBe(1);
  });

  it('второе — через три дня, дальше растёт лёгкостью', () => {
    let s = grade(INITIAL, 'ВСПОМНИЛ');
    s = grade(s, 'ВСПОМНИЛ');
    expect(s.interval).toBe(SECOND_INTERVAL);

    const third = grade(s, 'ВСПОМНИЛ');
    expect(third.interval).toBeGreaterThan(SECOND_INTERVAL);
    expect(third.interval).toBe(Math.round(SECOND_INTERVAL * third.ease));
  });

  it('«чем больше повторений, тем лучше запоминание»: интервал только растёт', () => {
    let s: ReviewState = INITIAL;
    let previous = 0;
    for (let i = 0; i < 8; i += 1) {
      s = grade(s, 'ВСПОМНИЛ');
      expect(s.interval).toBeGreaterThanOrEqual(previous);
      previous = s.interval;
    }
    expect(s.interval).toBeLessThanOrEqual(MAX_INTERVAL);
  });

  it('забытый тезис возвращается завтра', () => {
    let s = grade(INITIAL, 'ВСПОМНИЛ');
    s = grade(s, 'ВСПОМНИЛ');
    s = grade(s, 'ВСПОМНИЛ');
    const forgotten = grade(s, 'ЗАБЫЛ');
    expect(forgotten.interval).toBe(FIRST_INTERVAL);
    expect(forgotten.reps).toBe(0);
  });

  it('забывание считается опытом, а не штрафом', () => {
    const forgotten = grade(INITIAL, 'ЗАБЫЛ');
    expect(forgotten.lapses).toBe(1);
    // Ни одно поле не уходит в минус и ничего не «сгорает».
    expect(forgotten.interval).toBeGreaterThan(0);
    expect(forgotten.ease).toBeGreaterThanOrEqual(EASE_MIN);
  });

  it('«с трудом» почти не откладывает повтор', () => {
    let s = grade(INITIAL, 'ВСПОМНИЛ');
    s = grade(s, 'ВСПОМНИЛ');
    const hard = grade(s, 'С ТРУДОМ');
    expect(hard.interval).toBeLessThan(Math.round(s.interval * s.ease));
    expect(hard.reps).toBe(s.reps + 1);
  });

  it('лёгкость держится в берегах', () => {
    let easy: ReviewState = INITIAL;
    for (let i = 0; i < 20; i += 1) easy = grade(easy, 'ВСПОМНИЛ');
    expect(easy.ease).toBeLessThanOrEqual(EASE_MAX);

    let hard: ReviewState = INITIAL;
    for (let i = 0; i < 20; i += 1) hard = grade(hard, 'ЗАБЫЛ');
    expect(hard.ease).toBeGreaterThanOrEqual(EASE_MIN);
  });

  it('дальше года не откладывается: Канон живой', () => {
    let s: ReviewState = { ease: EASE_MAX, interval: 300, reps: 9, lapses: 0 };
    s = grade(s, 'ВСПОМНИЛ');
    expect(s.interval).toBe(MAX_INTERVAL);
  });
});

describe('Сроки', () => {
  it('срок отсчитывается от сегодняшних суток', () => {
    expect(nextDue(1, '2026-08-10')).toBe('2026-08-11');
    expect(nextDue(7, '2026-08-10')).toBe('2026-08-17');
  });

  it('переживает границу месяца', () => {
    expect(nextDue(2, '2026-08-31')).toBe('2026-09-02');
  });

  it('созревшим считается и просроченный', () => {
    expect(isDue('2026-08-10', '2026-08-10')).toBe(true);
    expect(isDue('2026-08-01', '2026-08-10')).toBe(true);
    expect(isDue('2026-08-11', '2026-08-10')).toBe(false);
  });
});
