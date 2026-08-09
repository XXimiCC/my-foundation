import { describe, expect, it } from 'vitest';
import { anchorId, docHref, resolveHref, resolveWikiTarget } from './links';

describe('Якоря', () => {
  it('сохраняют кириллицу и сворачивают пробелы', () => {
    expect(anchorId('Создание Сюжета')).toBe('Создание-Сюжета');
    expect(anchorId('  Поток   Озарения ')).toBe('Поток-Озарения');
  });
});

describe('Ссылки Канона', () => {
  it('переводит ссылку на Основу в маршрут приложения', () => {
    expect(resolveHref('Основа%207.%20Замедление.md').href).toBe('/kanon/osnova-7');
  });

  it('сохраняет якорь — на нём держится переход из Завета ДУХ', () => {
    const r = resolveHref('Основа%207.%20Замедление.md#Создание%20Сюжета');
    expect(r.href).toBe('/kanon/osnova-7#Создание-Сюжета');
    expect(r.anchor).toBe('Создание Сюжета');
    expect(r.external).toBe(false);
  });

  it('разбирает Заветы, Догмат и оглавление', () => {
    expect(resolveHref('Завет%205.%20ПУТЬ.md').href).toBe('/kanon/zavet-5');
    expect(resolveHref('02%20Декларация,%20Оснащение.md').href).toBe('/kanon/dogmat-2');
    expect(resolveHref('Философия%20Основания.md').href).toBe('/kanon/index');
    expect(resolveHref('Месяц%20искупления%202024.md').href).toBe('/kanon/mesyats-2024');
  });

  it('ссылка только на якорь остаётся внутри документа', () => {
    expect(resolveHref('#Пять благ').href).toBe('#Пять-благ');
  });

  it('внешний адрес отдаётся как есть', () => {
    const r = resolveHref('https://nosurf.net/activity-list/');
    expect(r.href).toBe('https://nosurf.net/activity-list/');
    expect(r.external).toBe(true);
  });

  it('заметка за пределами хранилища не получает маршрута', () => {
    // Ровно этот случай в Основе 4: `../../стресс.md`
    const r = resolveHref('../../стресс.md');
    expect(r.href).toBeNull();
    expect(r.external).toBe(true);
  });

  it('неизвестный файл не превращается в битую ссылку', () => {
    expect(resolveHref('Посторонняя заметка.md').href).toBeNull();
  });

  it('переживает испорченное процентное кодирование', () => {
    expect(() => resolveHref('%E0%A4%A')).not.toThrow();
  });
});

describe('Wiki-ссылки', () => {
  it('без подписи цель служит подписью', () => {
    expect(resolveWikiTarget('депрессия')).toEqual({ target: 'депрессия', label: 'депрессия' });
  });

  it('с подписью цель и подпись разделяются', () => {
    expect(resolveWikiTarget('депрессия|тоска')).toEqual({
      target: 'депрессия',
      label: 'тоска',
    });
  });
});

describe('Построение адреса документа', () => {
  it('без якоря и с якорем', () => {
    expect(docHref('osnova-3')).toBe('/kanon/osnova-3');
    expect(docHref('osnova-3', 'Как развивать?')).toBe('/kanon/osnova-3#Как-развивать?');
  });
});
