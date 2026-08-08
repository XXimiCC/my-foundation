import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalTitle,
  classify,
  cleanInline,
  extractSections,
  extractTheses,
  findBrokenLinks,
  firstHeading,
  parseVault,
  stripFrontmatter,
  type ParsedDoc,
} from './parse';

const VAULT = join(process.cwd(), 'Философия Основания');

function loadVault() {
  return readdirSync(VAULT)
    .filter((f) => f.endsWith('.md'))
    .map((fileName) => ({
      fileName,
      content: readFileSync(join(VAULT, fileName), 'utf8'),
    }));
}

const files = loadVault();
const { docs, skipped } = parseVault(files);
const bySlug = new Map(docs.map((d) => [d.slug, d]));
const doc = (slug: string): ParsedDoc => {
  const d = bySlug.get(slug);
  if (!d) throw new Error(`нет документа ${slug}`);
  return d;
};

describe('Хранилище распознано целиком', () => {
  it('в папке лежат все 22 markdown-файла', () => {
    expect(files).toHaveLength(22);
  });

  it('ни один файл не остался неклассифицированным', () => {
    expect(skipped).toEqual([]);
  });

  it('состав Канона соответствует Догмату: 3 + 10 + 6 и три служебных', () => {
    const count = (kind: string) => docs.filter((d) => d.kind === kind).length;
    expect(count('DOGMA')).toBe(3);
    expect(count('FOUNDATION')).toBe(10);
    expect(count('COVENANT')).toBe(6);
    expect(count('INDEX')).toBe(1);
    expect(count('ORDER')).toBe(1);
    expect(count('JOURNAL')).toBe(1);
  });

  it('слаги уникальны', () => {
    expect(new Set(docs.map((d) => d.slug)).size).toBe(docs.length);
  });

  it('Основы и Заветы пронумерованы без пропусков', () => {
    const nums = (kind: string) =>
      docs.filter((d) => d.kind === kind).map((d) => d.order).sort((a, b) => a - b);
    expect(nums('FOUNDATION')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(nums('COVENANT')).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('Классификация имён', () => {
  it('разбирает все виды файлов хранилища', () => {
    expect(classify('Основа 7. Замедление.md')).toMatchObject({
      kind: 'FOUNDATION',
      order: 7,
      slug: 'osnova-7',
    });
    expect(classify('Завет 5. ПУТЬ.md')).toMatchObject({ kind: 'COVENANT', order: 5 });
    expect(classify('01 Основание, Замысел.md')).toMatchObject({ kind: 'DOGMA', order: 1 });
    expect(classify('Месяц искупления 2024.md')).toMatchObject({
      kind: 'JOURNAL',
      order: 2024,
      slug: 'mesyats-2024',
    });
    expect(classify('Орден Основания.md')).toMatchObject({ kind: 'ORDER' });
  });

  it('возвращает null для посторонних файлов', () => {
    expect(classify('Заметка.md')).toBeNull();
  });
});

describe('Frontmatter и заголовок', () => {
  it('пустой frontmatter снимается', () => {
    expect(stripFrontmatter('---\n{}\n---\n\nТекст')).toBe('\nТекст');
  });

  it('текст без frontmatter не портится', () => {
    expect(stripFrontmatter('Текст')).toBe('Текст');
  });

  it('каноническое имя берётся из файла, а не из первого H1', () => {
    // Регрессия: у «Основа 3» первый H1 — «Развитие это и есть счастье»,
    // у «Основа 10» — «Турбо-режим». Это разделы, а не имена документов.
    expect(doc('osnova-3').title).toBe('Основа 3. Триединение');
    expect(doc('osnova-10').title).toBe('Основа 10. Благодарение');
    expect(doc('zavet-5').title).toBe('Завет 5. ПУТЬ');
    expect(doc('index').title).toBe('Философия Основания');
    expect(doc('orden').title).toBe('Орден Основания');
  });

  it('у Догмата числовой префикс отбрасывается — порядок хранится отдельно', () => {
    expect(canonicalTitle('01 Основание, Замысел.md', 'DOGMA')).toBe('Основание, Замысел');
    expect(doc('dogmat-2').title).toBe('Декларация, Оснащение');
  });

  it('первый H1 доступен отдельно как подзаголовок', () => {
    expect(firstHeading('# Завет АКТ\n\nтело')).toBe('Завет АКТ');
    expect(firstHeading('просто текст')).toBeNull();
  });

  it('все заголовки Канона непустые', () => {
    for (const d of docs) expect(d.title.length, d.slug).toBeGreaterThan(3);
  });
});

describe('Секции и якоря', () => {
  it('якоря внутри документа уникальны', () => {
    for (const d of docs) {
      const anchors = d.sections.map((s) => s.anchor);
      expect(new Set(anchors).size, `дубликат якоря в ${d.slug}`).toBe(anchors.length);
    }
  });

  it('якоря, на которые ссылается Завет ДУХ, действительно есть в Основе 7', () => {
    // Завет 6 ссылается на «Основа 7. Замедление.md#Создание Сюжета» и далее.
    const anchors = new Set(doc('osnova-7').sections.map((s) => s.anchor));
    expect(anchors).toContain('Создание Сюжета');
    expect(anchors).toContain('Поток Озарения');
    expect(anchors).toContain('Рождение Скуки');
  });

  it('уровень заголовка сохраняется', () => {
    const s = extractSections('# А\nтекст\n### Б\nтекст');
    expect(s.map((x) => x.level)).toEqual([1, 3]);
  });

  it('заголовок внутри блока кода не создаёт секцию', () => {
    const s = extractSections('# А\n```\n# не заголовок\n```\n## Б');
    expect(s.map((x) => x.heading)).toEqual(['А', 'Б']);
  });
});

describe('Тезисы для Слова Дня', () => {
  it('в каждой Основе и каждом Завете есть чем наполнить припоминание', () => {
    for (const d of docs.filter((x) => x.kind === 'FOUNDATION' || x.kind === 'COVENANT')) {
      expect(d.theses.length, `мало тезисов в ${d.slug}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('отпечатки тезисов уникальны в пределах документа', () => {
    for (const d of docs) {
      const fps = d.theses.map((t) => t.fingerprint);
      expect(new Set(fps).size).toBe(fps.length);
    }
  });

  it('в тезисах не остаётся markdown-разметки', () => {
    for (const d of docs) {
      for (const t of d.theses) {
        expect(t.text, `разметка в ${d.slug}`).not.toMatch(/\*\*|\[\[|\]\(|^>/);
      }
    }
  });

  it('вытаскивает ключевое убеждение Основы 1', () => {
    const texts = doc('osnova-1').theses.map((t) => t.text);
    expect(texts).toContain('Творение — это условие моего выживания');
  });

  it('берёт и выделенное, и цитаты', () => {
    const kinds = new Set(doc('osnova-2').theses.map((t) => t.kind));
    expect(kinds).toContain('BELIEF');
    expect(kinds).toContain('QUOTE');
  });

  it('обрывки и слишком длинные абзацы отбрасываются', () => {
    expect(extractTheses('**Да**')).toHaveLength(0);
    expect(extractTheses(`**${'о'.repeat(400)}**`)).toHaveLength(0);
  });
});

describe('Очистка разметки', () => {
  it('markdown-ссылка сводится к тексту', () => {
    expect(cleanInline('см. [Основа 3](Основа%203.%20Триединение.md)')).toBe('см. Основа 3');
  });

  it('wiki-ссылка сводится к цели или алиасу', () => {
    expect(cleanInline('это [[депрессия]]')).toBe('это депрессия');
    expect(cleanInline('это [[депрессия|тоска]]')).toBe('это тоска');
  });

  it('зачёркнутый текст сохраняется как текст', () => {
    expect(cleanInline('~~отвергнуть~~ можно')).toBe('отвергнуть можно');
  });
});

describe('Целостность ссылок Канона', () => {
  const broken = findBrokenLinks(docs);

  it('ни одна ссылка на якорь внутри Канона не битая', () => {
    const bad = broken.filter((b) => b.reason === 'нет якоря');
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  it('внутри хранилища нет ссылок на отсутствующие документы', () => {
    const bad = broken.filter((b) => b.reason === 'нет документа');
    // Единственный случай — [[депрессия]]: заметка живёт вне этой папки.
    expect(bad.map((b) => b.rawTarget)).toEqual(['депрессия', 'депрессия']);
  });

  it('за пределы папки ведёт ровно одна ссылка, и это известный случай', () => {
    const outside = broken.filter((b) => b.reason === 'вне хранилища');
    expect(outside).toEqual([
      { from: 'osnova-4', rawTarget: '../../стресс.md', reason: 'вне хранилища' },
    ]);
  });

  it('оглавление связывает Догмат, Основы, Заветы и отчёт — 20 документов', () => {
    const targets = new Set(
      doc('index').links.filter((l) => l.targetSlug).map((l) => l.targetSlug),
    );
    expect(targets.size).toBe(20);
    expect(targets).toContain('mesyats-2024');
    // Орден Основания в оглавлении не упомянут — попасть в него можно только
    // напрямую. Это факт хранилища, а не упущение парсера.
    expect(targets).not.toContain('orden');
  });
});
