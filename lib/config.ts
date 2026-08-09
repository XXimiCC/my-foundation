/**
 * Публичный адрес приложения.
 *
 * Значение вводится человеком в панели хостинга, поэтому схему легко забыть.
 * Цена опечатки высокая и отложенная: Telegram молча отклоняет кнопки web_app
 * с адресом без схемы, а конкатенация `${appUrl}/path` без схемы даёт
 * относительный путь. Поэтому значение нормализуется, но исходная строка
 * остаётся видимой в /api/health — чтобы расхождение чинили в конфигурации,
 * а не прятали в коде.
 */

export interface AppUrlResult {
  /** Нормализованный адрес без хвостового слэша, либо null если непригоден. */
  url: string | null;
  /** Что пришлось поправить или почему значение непригодно. */
  warning: string | null;
}

export function normalizeAppUrl(raw: string | undefined | null): AppUrlResult {
  const value = raw?.trim();
  if (!value) return { url: null, warning: 'NEXT_PUBLIC_APP_URL не задан' };

  const hasScheme = /^https?:\/\//i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { url: null, warning: `NEXT_PUBLIC_APP_URL не разбирается как адрес: ${value}` };
  }

  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol === 'http:' && !isLocal) {
    return {
      url: null,
      warning: 'Telegram требует HTTPS: адрес по http допустим только для localhost',
    };
  }

  const url = parsed.origin + parsed.pathname.replace(/\/+$/, '');
  const warning = hasScheme ? null : 'в NEXT_PUBLIC_APP_URL не хватало схемы, подставлен https://';

  return { url, warning };
}

/** Нормализованный адрес приложения. Бросает, если значение непригодно. */
export function appUrl(): string {
  const { url, warning } = normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (!url) throw new Error(warning ?? 'NEXT_PUBLIC_APP_URL непригоден');
  return url;
}
