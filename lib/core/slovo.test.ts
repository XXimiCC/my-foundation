import { describe, expect, it } from 'vitest';
import { MIND_SHARE, kindWeight, promptOf } from './slovo';

describe('Подсказка для припоминания', () => {
  const thesis =
    'Для того чтобы запомнить факты, нужно их активно припоминать, а не просматривать информацию';

  it('показывает начало, а не весь тезис — иначе это просмотр', () => {
    const prompt = promptOf(thesis);
    expect(thesis.startsWith(prompt.replace('…', ''))).toBe(true);
    expect(prompt.length).toBeLessThan(thesis.length);
    expect(prompt.endsWith('…')).toBe(true);
  });

  it('оставляет меньше половины слов', () => {
    const words = thesis.split(/\s+/).length;
    const shown = promptOf(thesis).replace('…', '').trim().split(/\s+/).length;
    expect(shown).toBeLessThan(words / 2 + 1);
  });

  it('длинный тезис не выдаёт восемью словами больше', () => {
    const long = Array.from({ length: 60 }, (_, i) => `слово${i}`).join(' ');
    expect(promptOf(long).replace('…', '').trim().split(/\s+/)).toHaveLength(8);
  });

  it('у короткого тезиса подсказка — одно слово', () => {
    expect(promptOf('Сила соразмерна знанию')).toBe('Сила…');
  });

  it('не спотыкается о лишние пробелы', () => {
    expect(promptOf('  Ошибки   это начало опыта  ')).toBe('Ошибки…');
  });
});

describe('Порядок изучения', () => {
  it('«сначала базовые принципы»: Догмат, потом Основы, потом Заветы', () => {
    expect(kindWeight('DOGMA')).toBeLessThan(kindWeight('FOUNDATION'));
    expect(kindWeight('FOUNDATION')).toBeLessThan(kindWeight('COVENANT'));
  });

  it('незнакомый вид документа уходит в конец, а не ломает сортировку', () => {
    expect(kindWeight('ЧТО-ТО')).toBeGreaterThan(kindWeight('JOURNAL'));
  });
});

describe('Вклад в Разум', () => {
  it('заход даёт треть акта: припоминание — первая из трёх ступеней', () => {
    expect(MIND_SHARE).toBeCloseTo(1 / 3, 9);
    expect(MIND_SHARE * 3).toBeCloseTo(1, 9);
  });
});
