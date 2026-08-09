import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVault } from './parse';
import { isOnTopic, pickTheses, rootsFor, titleStem } from './relevance';

const VAULT = join(process.cwd(), 'Философия Основания');
const files = readdirSync(VAULT)
  .filter((f) => f.endsWith('.md'))
  .map((fileName) => ({ fileName, content: readFileSync(join(VAULT, fileName), 'utf8') }));
const { docs } = parseVault(files);
const foundations = docs.filter((d) => d.kind === 'FOUNDATION');

describe('Корень названия', () => {
  it('снимает отглагольные окончания', () => {
    expect(titleStem('Основа 10. Благодарение')).toBe('благодар');
    expect(titleStem('Основа 1. Творение')).toBe('твор');
    expect(titleStem('Основа 9. Опекание')).toBe('опек');
    // «-ие» снимается, «-ство» остаётся: «спокойств» ловит и «беспокойство».
    expect(titleStem('Основа 4. Спокойствие')).toBe('спокойств');
    expect(titleStem('Основа 6. Познание')).toBe('позн');
    expect(titleStem('Основа 3. Триединение')).toBe('триедин');
  });

  it('не срезает слишком много у коротких слов', () => {
    expect(titleStem('Дар').length).toBeGreaterThanOrEqual(3);
  });
});

describe('Отбор тезисов для ритуала', () => {
  it('у каждой Основы хватает тезисов по её же теме', () => {
    for (const d of foundations) {
      const roots = rootsFor(d.slug, d.title);
      const onTopic = d.theses.filter((t) => isOnTopic(t.text, roots));
      expect(onTopic.length, `${d.title}: по теме ${onTopic.length}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('все три показанных тезиса относятся к теме Основы', () => {
    for (const d of foundations) {
      const roots = rootsFor(d.slug, d.title);
      for (const t of pickTheses(d.theses, d.slug, d.title, 3)) {
        expect(isOnTopic(t.text, roots), `${d.title}: «${t.text.slice(0, 50)}»`).toBe(true);
      }
    }
  });

  it('отступление про турбо-режим больше не попадает в Благодарение', () => {
    const blagodarenie = foundations.find((d) => d.order === 10)!;
    const picked = pickTheses(blagodarenie.theses, blagodarenie.slug, blagodarenie.title, 3).map((t) => t.text);
    expect(picked.join(' ')).not.toContain('есть угроза');
    for (const text of picked) expect(text.toLowerCase()).toContain('благодар');
  });

  it('сохраняет порядок документа среди подходящих', () => {
    const first = foundations[0];
    const picked = pickTheses(first.theses, first.slug, first.title, 3);
    const indexes = picked.map((p) => first.theses.findIndex((t) => t.text === p.text));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('добирает остальными, если по теме не набралось', () => {
    const theses = [{ text: 'Про другое совсем' }, { text: 'И это тоже мимо' }];
    expect(pickTheses(theses, 'нет-такого', 'Благодарение', 2)).toHaveLength(2);
  });
});
