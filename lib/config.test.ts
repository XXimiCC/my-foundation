import { describe, expect, it } from 'vitest';
import { normalizeAppUrl } from './config';

describe('Публичный адрес приложения', () => {
  it('принимает корректный адрес без изменений', () => {
    expect(normalizeAppUrl('https://my-foundation-eight.vercel.app')).toEqual({
      url: 'https://my-foundation-eight.vercel.app',
      warning: null,
    });
  });

  it('подставляет схему, если её забыли', () => {
    // Ровно этот случай был на проде: адрес записали без https://
    const r = normalizeAppUrl('my-foundation-eight.vercel.app');
    expect(r.url).toBe('https://my-foundation-eight.vercel.app');
    expect(r.warning).toMatch(/схемы/);
  });

  it('снимает хвостовой слэш, иначе ссылки получат двойной', () => {
    expect(normalizeAppUrl('https://example.com/').url).toBe('https://example.com');
    expect(normalizeAppUrl('https://example.com///').url).toBe('https://example.com');
  });

  it('разрешает http только для localhost', () => {
    expect(normalizeAppUrl('http://localhost:3000').url).toBe('http://localhost:3000');
    expect(normalizeAppUrl('http://127.0.0.1:3000').url).toBe('http://127.0.0.1:3000');
    expect(normalizeAppUrl('http://example.com').url).toBeNull();
    expect(normalizeAppUrl('http://example.com').warning).toMatch(/HTTPS/);
  });

  it('отбивает пустое и мусорное значение', () => {
    expect(normalizeAppUrl(undefined).url).toBeNull();
    expect(normalizeAppUrl('   ').url).toBeNull();
    expect(normalizeAppUrl('http://').url).toBeNull();
  });

  it('обрезает пробелы по краям', () => {
    expect(normalizeAppUrl('  https://example.com  ').url).toBe('https://example.com');
  });
});
