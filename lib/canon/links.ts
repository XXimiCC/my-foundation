/**
 * Перевод ссылок хранилища в маршруты приложения.
 *
 * В тексте живут ссылки двух видов: markdown вида
 * `[Основа 7](Основа%207.%20Замедление.md#Создание%20Сюжета)` и wiki вида
 * `[[депрессия]]`. Тела документов хранятся в базе как есть — переписывание
 * происходит при отрисовке, чтобы исходный текст оставался пригодным для
 * выгрузки обратно в Obsidian.
 */

import { classify } from './parse';

export const CANON_BASE = '/kanon';

export interface ResolvedHref {
  href: string | null;
  anchor: string | null;
  /** Цель вне Канона: внешний сайт или заметка за пределами папки. */
  external: boolean;
}

/**
 * Идентификатор заголовка. Кириллица в id и фрагментах допустима, поэтому
 * достаточно свернуть пробелы — так якорь остаётся читаемым в адресной строке.
 */
export function anchorId(heading: string): string {
  return heading.trim().replace(/\s+/g, '-');
}

export function docHref(slug: string, anchor?: string | null): string {
  const base = `${CANON_BASE}/${slug}`;
  return anchor ? `${base}#${anchorId(anchor)}` : base;
}

/** Разбирает цель ссылки из текста Канона. */
export function resolveHref(rawHref: string): ResolvedHref {
  const raw = safeDecode(rawHref.trim());

  if (!raw) return { href: null, anchor: null, external: false };

  // Внешние адреса отдаём как есть.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith('mailto:')) {
    return { href: raw, anchor: null, external: true };
  }

  // Ссылка только на якорь внутри текущего документа.
  if (raw.startsWith('#')) {
    const anchor = raw.slice(1);
    return { href: `#${anchorId(anchor)}`, anchor, external: false };
  }

  const hash = raw.indexOf('#');
  const pathPart = hash === -1 ? raw : raw.slice(0, hash);
  const anchor = hash === -1 ? null : raw.slice(hash + 1) || null;

  // Путь, выходящий за пределы папки хранилища, ведёт в заметку, которой
  // в Каноне нет: в тексте это `../../стресс.md`.
  if (pathPart.includes('../')) {
    return { href: null, anchor, external: true };
  }

  const fileName = pathPart.split('/').pop() ?? pathPart;
  const meta = classify(ensureMd(fileName));

  if (!meta) return { href: null, anchor, external: true };

  return { href: docHref(meta.slug, anchor), anchor, external: false };
}

/** Цель wiki-ссылки `[[имя]]` или `[[имя|подпись]]`. */
export function resolveWikiTarget(inner: string): { target: string; label: string } {
  const [target, label] = inner.split('|');
  return { target: target.trim(), label: (label ?? target).trim() };
}

function ensureMd(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
