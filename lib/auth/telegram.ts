/**
 * Проверка подписи Telegram.
 *
 * Схемы ДВЕ, и секретный ключ у них выводится по-разному. Перепутать легко,
 * а последствие — либо всё отвергается, либо, что хуже, принимается подделка:
 *
 *   Mini App (initData):  secret = HMAC_SHA256(ключ "WebAppData", токен бота)
 *   Login Widget:         secret = SHA256(токен бота)
 *
 * В обоих случаях строка проверки собирается одинаково: пары «ключ=значение»
 * без hash, отсортированные по ключу и склеенные переводом строки.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  isPremium: boolean;
}

export type VerifyFailure =
  | 'нет подписи'
  | 'нет даты'
  | 'подпись не совпадает'
  | 'подпись устарела'
  | 'нет данных пользователя'
  | 'данные пользователя испорчены';

export type VerifyResult =
  | { ok: true; user: TelegramUser; authDate: Date }
  | { ok: false; reason: VerifyFailure };

/** Окно свежести по умолчанию: сутки для Mini App, 5 минут для виджета. */
export const INITDATA_MAX_AGE_SEC = 86_400;
export const WIDGET_MAX_AGE_SEC = 300;

/** Строка проверки: пары без hash, по возрастанию ключа, через \n. */
export function dataCheckString(pairs: Iterable<[string, string]>): string {
  return [...pairs]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** Сравнение подписей за постоянное время. */
function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function sign(secret: Buffer, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Секрет для Mini App: HMAC от токена по ключу «WebAppData». */
export function initDataSecret(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

/** Секрет для Login Widget: обычный SHA-256 от токена. */
export function widgetSecret(botToken: string): Buffer {
  return createHash('sha256').update(botToken).digest();
}

function parseUser(raw: string | undefined): TelegramUser | null {
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Record<string, unknown>;
    if (typeof u.id !== 'number' && typeof u.id !== 'string') return null;
    return {
      id: BigInt(u.id as number | string),
      firstName: str(u.first_name),
      lastName: str(u.last_name),
      username: str(u.username),
      languageCode: str(u.language_code),
      isPremium: u.is_premium === true,
    };
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function checkAge(authDateRaw: string | undefined, maxAgeSec: number, now: Date) {
  if (!authDateRaw) return { ok: false as const, reason: 'нет даты' as const };
  const seconds = Number(authDateRaw);
  if (!Number.isFinite(seconds)) return { ok: false as const, reason: 'нет даты' as const };
  const authDate = new Date(seconds * 1000);
  const ageSec = (now.getTime() - authDate.getTime()) / 1000;
  // Небольшой запас назад: часы клиента могут немного опережать сервер.
  if (ageSec > maxAgeSec || ageSec < -60) {
    return { ok: false as const, reason: 'подпись устарела' as const };
  }
  return { ok: true as const, authDate };
}

/**
 * Проверка initData из Telegram Mini App.
 * На вход идёт строка ровно в том виде, в каком её дал Telegram.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSec?: number; now?: Date } = {},
): VerifyResult {
  const { maxAgeSec = INITDATA_MAX_AGE_SEC, now = new Date() } = options;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'нет подписи' };

  const expected = sign(initDataSecret(botToken), dataCheckString(params.entries()));
  if (!hashesEqual(hash, expected)) return { ok: false, reason: 'подпись не совпадает' };

  const age = checkAge(params.get('auth_date') ?? undefined, maxAgeSec, now);
  if (!age.ok) return { ok: false, reason: age.reason };

  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'нет данных пользователя' };

  const user = parseUser(rawUser);
  if (!user) return { ok: false, reason: 'данные пользователя испорчены' };

  return { ok: true, user, authDate: age.authDate };
}

/**
 * Проверка данных Telegram Login Widget — вход через браузер.
 * Поля приходят объектом, а не строкой запроса.
 */
export function verifyLoginWidget(
  data: Record<string, string | number | undefined>,
  botToken: string,
  options: { maxAgeSec?: number; now?: Date } = {},
): VerifyResult {
  const { maxAgeSec = WIDGET_MAX_AGE_SEC, now = new Date() } = options;

  const hash = data.hash;
  if (typeof hash !== 'string' || !hash) return { ok: false, reason: 'нет подписи' };

  const pairs: [string, string][] = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]);

  const expected = sign(widgetSecret(botToken), dataCheckString(pairs));
  if (!hashesEqual(hash, expected)) return { ok: false, reason: 'подпись не совпадает' };

  const age = checkAge(
    data.auth_date === undefined ? undefined : String(data.auth_date),
    maxAgeSec,
    now,
  );
  if (!age.ok) return { ok: false, reason: age.reason };

  if (data.id === undefined) return { ok: false, reason: 'нет данных пользователя' };

  const user: TelegramUser = {
    id: BigInt(data.id),
    firstName: str(data.first_name),
    lastName: str(data.last_name),
    username: str(data.username),
    languageCode: null,
    isPremium: false,
  };

  return { ok: true, user, authDate: age.authDate };
}
