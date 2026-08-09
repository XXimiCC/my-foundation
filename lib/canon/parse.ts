/**
 * Разбор хранилища «Философия Основания» в структуру Канона.
 *
 * Разовый импорт: дальше Канон правится в админке. Но парсер остаётся —
 * им же проверяется целостность ссылок, и через него можно перезалить
 * хранилище заново.
 */

import { createHash } from 'node:crypto';

export type CanonKind = 'INDEX' | 'DOGMA' | 'FOUNDATION' | 'COVENANT' | 'ORDER' | 'JOURNAL';
export type ThesisKind = 'BELIEF' | 'QUOTE';

export interface ParsedSection {
  anchor: string;
  heading: string;
  level: number;
  order: number;
  bodyMd: string;
}

export interface ParsedThesis {
  kind: ThesisKind;
  text: string;
  fingerprint: string;
}

export interface ParsedLink {
  /** Слаг документа, на который ведёт ссылка, либо null если цель неизвестна. */
  targetSlug: string | null;
  /** Якорь внутри документа, если указан. */
  anchor: string | null;
  /** Исходный текст цели — для отчёта о битых ссылках. */
  rawTarget: string;
  /** Wiki-ссылка вида [[...]] против обычной markdown-ссылки. */
  wiki: boolean;
  /** Цель лежит за пределами папки хранилища (путь выходит через «../»). */
  external: boolean;
}

export interface ParsedDoc {
  slug: string;
  kind: CanonKind;
  order: number;
  title: string;
  sourcePath: string;
  bodyMd: string;
  sections: ParsedSection[];
  theses: ParsedThesis[];
  links: ParsedLink[];
}

/** Минимальная и максимальная длина тезиса для Слова Дня. */
const THESIS_MIN = 25;
const THESIS_MAX = 240;

/**
 * Классификация файла по имени. Слаги выводятся из вида и номера, а не из
 * транслитерации: они стабильны и безопасны в URL.
 */
export function classify(fileName: string): { kind: CanonKind; order: number; slug: string } | null {
  const name = fileName.replace(/\.md$/i, '').trim();

  if (name === 'Философия Основания') return { kind: 'INDEX', order: 0, slug: 'index' };
  if (name === 'Орден Основания') return { kind: 'ORDER', order: 0, slug: 'orden' };

  const dogma = name.match(/^0(\d)\s+(.+)$/);
  if (dogma) {
    const order = Number(dogma[1]);
    return { kind: 'DOGMA', order, slug: `dogmat-${order}` };
  }

  const osnova = name.match(/^Основа\s+(\d+)\./);
  if (osnova) {
    const order = Number(osnova[1]);
    return { kind: 'FOUNDATION', order, slug: `osnova-${order}` };
  }

  const zavet = name.match(/^Завет\s+(\d+)\./);
  if (zavet) {
    const order = Number(zavet[1]);
    return { kind: 'COVENANT', order, slug: `zavet-${order}` };
  }

  const journal = name.match(/^Месяц искупления\s+(\d{4})$/);
  if (journal) {
    const year = Number(journal[1]);
    return { kind: 'JOURNAL', order: year, slug: `mesyats-${year}` };
  }

  return null;
}

/** Снимает frontmatter вида `---\n{}\n---`. */
export function stripFrontmatter(raw: string): string {
  const normalized = raw.replace(/^﻿/, '');
  const match = normalized.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? normalized.slice(match[0].length) : normalized;
}

/**
 * Каноническое имя документа берётся из имени файла, а не из первого `#`.
 *
 * В хранилище многие файлы начинаются с текста, а первый заголовок — это
 * раздел внутри документа: у «Основа 3. Триединение» первый H1 называется
 * «Развитие это и есть счастье», у «Основа 10. Благодарение» — «Турбо-режим».
 * Именно имя файла совпадает с тем, как документ назван в оглавлении, поэтому
 * навигация Канона строится на нём.
 *
 * У файлов Догмата числовой префикс отбрасывается: порядок хранится отдельно.
 */
export function canonicalTitle(fileName: string, kind: CanonKind): string {
  const name = fileName.replace(/\.md$/i, '').trim();
  if (kind === 'DOGMA') return name.replace(/^\d+\s+/, '');
  return name;
}

/** Первый H1 документа, если он есть. Используется как подзаголовок. */
export function firstHeading(body: string): string | null {
  const h1 = body.match(/^#\s+(.+)$/m);
  return h1 ? h1[1].trim() : null;
}

/**
 * Разбивает документ на секции по заголовкам. Якорь — текст заголовка:
 * именно так адресуют ссылки Obsidian («…#Создание Сюжета»).
 */
export function extractSections(body: string): ParsedSection[] {
  const lines = body.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current) {
      current.bodyMd = buffer.join('\n').trim();
      sections.push(current);
    }
    buffer.length = 0;
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;

    const heading = inFence ? null : line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      flush();
      const text = heading[2].trim();
      current = {
        anchor: text,
        heading: text,
        level: heading[1].length,
        order: sections.length,
        bodyMd: '',
      };
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();

  return dedupeAnchors(sections);
}

/**
 * Одинаковые заголовки внутри документа встречаются — якорь должен остаться
 * уникальным, иначе связь «секция ↔ ссылка» станет неоднозначной.
 */
function dedupeAnchors(sections: ParsedSection[]): ParsedSection[] {
  const seen = new Map<string, number>();
  return sections.map((s) => {
    const n = seen.get(s.anchor) ?? 0;
    seen.set(s.anchor, n + 1);
    return n === 0 ? s : { ...s, anchor: `${s.anchor} (${n + 1})` };
  });
}

/**
 * Тезисы для активного припоминания.
 *
 * Берём два самых сигнальных вида текста: выделенные жирным утверждения
 * (это и есть убеждения — «мысли которые дают силу») и строки блоков-цитат.
 * Заголовки, ссылки и обрывки отбрасываются.
 */
export function extractTheses(body: string): ParsedThesis[] {
  const out: ParsedThesis[] = [];
  const seen = new Set<string>();

  const push = (kind: ThesisKind, raw: string) => {
    const text = capitalizeFirst(cleanInline(raw));
    if (text.length < THESIS_MIN || text.length > THESIS_MAX) return;
    // Отбрасываем обрывки без завершённой мысли.
    if (!/[.!?»]$/.test(text) && text.split(/\s+/).length < 6) return;
    const fingerprint = fingerprintOf(text);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    out.push({ kind, text, fingerprint });
  };

  const withoutHeadings = body.replace(/^#{1,6}\s+.*$/gm, '');

  for (const m of withoutHeadings.matchAll(/\*\*(.+?)\*\*/gs)) push('BELIEF', m[1]);

  for (const line of withoutHeadings.split(/\r?\n/)) {
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote && quote[1].trim()) push('QUOTE', quote[1]);
  }

  return out;
}

/**
 * Тезис нередко выдран из середины фразы и начинается со строчной буквы.
 * Как самостоятельное утверждение он читается плохо, поэтому первая буква
 * поднимается — но только если это буква, а не кавычка или цифра.
 */
export function capitalizeFirst(text: string): string {
  const first = text.charAt(0);
  if (!first || first !== first.toLowerCase() || first === first.toUpperCase()) {
    return text;
  }
  return first.toUpperCase() + text.slice(1);
}

/** Убирает разметку внутри строки, оставляя читаемый текст. */
export function cleanInline(raw: string): string {
  return raw
    .replace(/\r?\n+/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/(^|\s)\*(?=\S)/g, '$1')
    .replace(/(\S)\*(?=\s|$)/g, '$1')
    .replace(/`/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Ссылки: и markdown вида `[Основа 7](Основа%207.%20Замедление.md#Якорь)`,
 * и wiki вида `[[депрессия]]`. Цели, которых нет в хранилище, остаются
 * с targetSlug = null и попадают в отчёт.
 */
export function extractLinks(body: string, resolve: (fileName: string) => string | null): ParsedLink[] {
  const links: ParsedLink[] = [];

  for (const m of body.matchAll(/(!?)\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (m[1] === '!') continue; // картинка, не ссылка
    const raw = decodeURIComponent(m[3].trim());
    if (/^[a-z]+:\/\//i.test(raw)) continue; // внешняя ссылка
    const [pathPart, anchorPart] = splitAnchor(raw);
    const fileName = pathPart.split('/').pop() ?? pathPart;
    links.push({
      targetSlug: fileName ? resolve(fileName) : null,
      anchor: anchorPart,
      rawTarget: raw,
      wiki: false,
      external: escapesVault(pathPart),
    });
  }

  for (const m of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = m[1].split('|')[0].trim();
    const [pathPart, anchorPart] = splitAnchor(raw);
    links.push({
      targetSlug: resolve(ensureMd(pathPart)),
      anchor: anchorPart,
      rawTarget: raw,
      wiki: true,
      external: escapesVault(pathPart),
    });
  }

  return links;
}

function splitAnchor(raw: string): [string, string | null] {
  const hash = raw.indexOf('#');
  if (hash === -1) return [raw, null];
  return [raw.slice(0, hash), raw.slice(hash + 1) || null];
}

function ensureMd(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

/** Путь выходит за пределы папки хранилища. */
function escapesVault(pathPart: string): boolean {
  return pathPart.includes('../');
}

export function fingerprintOf(text: string): string {
  return createHash('sha256').update(text.toLowerCase()).digest('hex').slice(0, 32);
}

/**
 * Полный разбор набора файлов. Принимает содержимое, а не путь, — чтобы
 * функция оставалась чистой и тестируемой.
 */
export function parseVault(files: { fileName: string; content: string }[]): {
  docs: ParsedDoc[];
  skipped: string[];
} {
  const known = new Map<string, string>();
  const skipped: string[] = [];

  for (const f of files) {
    const meta = classify(f.fileName);
    if (meta) known.set(f.fileName, meta.slug);
    else skipped.push(f.fileName);
  }

  const resolve = (fileName: string) => known.get(fileName) ?? null;

  const docs: ParsedDoc[] = [];
  for (const f of files) {
    const meta = classify(f.fileName);
    if (!meta) continue;
    const bodyMd = stripFrontmatter(f.content);
    docs.push({
      slug: meta.slug,
      kind: meta.kind,
      order: meta.order,
      title: canonicalTitle(f.fileName, meta.kind),
      sourcePath: f.fileName,
      bodyMd,
      sections: extractSections(bodyMd),
      theses: extractTheses(bodyMd),
      links: extractLinks(bodyMd, resolve),
    });
  }

  const kindOrder: CanonKind[] = ['INDEX', 'DOGMA', 'FOUNDATION', 'COVENANT', 'ORDER', 'JOURNAL'];
  docs.sort(
    (a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || a.order - b.order,
  );

  return { docs, skipped };
}

/** Ссылки, ведущие в никуда, и якоря, которых нет в целевом документе. */
export type BrokenReason = 'нет документа' | 'нет якоря' | 'вне хранилища';

export function findBrokenLinks(docs: ParsedDoc[]): {
  from: string;
  rawTarget: string;
  reason: BrokenReason;
}[] {
  const anchorsBySlug = new Map(
    docs.map((d) => [d.slug, new Set(d.sections.map((s) => s.anchor))]),
  );
  const broken: { from: string; rawTarget: string; reason: BrokenReason }[] = [];

  for (const doc of docs) {
    for (const link of doc.links) {
      if (!link.targetSlug) {
        broken.push({
          from: doc.slug,
          rawTarget: link.rawTarget,
          reason: link.external ? 'вне хранилища' : 'нет документа',
        });
        continue;
      }
      if (link.anchor && !anchorsBySlug.get(link.targetSlug)?.has(link.anchor)) {
        broken.push({ from: doc.slug, rawTarget: link.rawTarget, reason: 'нет якоря' });
      }
    }
  }

  return broken;
}
