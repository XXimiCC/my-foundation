/**
 * Сессии: короткий access-JWT и длинный ротируемый refresh.
 *
 * Приложение живёт внутри webview Telegram, где страница открыта во фрейме и
 * сторонние куки могут блокироваться. Поэтому access-токен принимается и из
 * куки, и из заголовка Authorization: клиент Mini App хранит его у себя, а
 * браузерная версия обходится куками.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Rank, Role } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { TelegramUser } from './telegram';

export const ACCESS_COOKIE = 'osn_access';
export const REFRESH_COOKIE = 'osn_refresh';

export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_SEC = 60 * 24 * 3600;

export interface SessionUser {
  id: string;
  telegramId: bigint;
  rank: Rank;
  role: Role;
  tz: string;
  oathAt: Date | null;
  firstName: string | null;
  username: string | null;
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error('JWT_SECRET не задан или слишком короткий');
  }
  return new TextEncoder().encode(value);
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret());
}

export async function readAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Refresh хранится только в виде отпечатка: утечка базы не даёт входа. */
function fingerprint(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Заводит или обновляет человека и открывает сессию.
 *
 * Здесь же создаются недостающие оболочки и настройки: без них первый экран
 * не на чем построить, а Оснащение не с чего начать.
 */
export async function startSession(tgUser: TelegramUser) {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isAdmin = adminIds.includes(tgUser.id.toString());

  const user = await prisma.user.upsert({
    where: { telegramId: tgUser.id },
    create: {
      telegramId: tgUser.id,
      firstName: tgUser.firstName,
      username: tgUser.username,
      langCode: tgUser.languageCode,
      role: isAdmin ? 'ADMIN' : 'USER',
      settings: { create: {} },
      shells: {
        create: [
          { shell: 'BODY', level: 0 },
          { shell: 'MIND', level: 0 },
          { shell: 'SPIRIT', level: 0 },
        ],
      },
    },
    update: {
      firstName: tgUser.firstName,
      username: tgUser.username,
      langCode: tgUser.languageCode,
      ...(isAdmin ? { role: 'ADMIN' as const } : {}),
    },
  });

  const refresh = newRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshHash: fingerprint(refresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });

  const access = await signAccessToken(user.id);
  return { user, access, refresh };
}

/** Обмен refresh на новую пару. Старый гасится — токен одноразовый. */
export async function rotateSession(refresh: string) {
  const session = await prisma.session.findUnique({
    where: { refreshHash: fingerprint(refresh) },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const next = newRefreshToken();
  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    }),
    prisma.session.create({
      data: {
        userId: session.userId,
        refreshHash: fingerprint(next),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    }),
  ]);

  return { userId: session.userId, access: await signAccessToken(session.userId), refresh: next };
}

export async function revokeSession(refresh: string): Promise<void> {
  await prisma.session.updateMany({
    where: { refreshHash: fingerprint(refresh), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Достаёт access-токен из заголовка либо из куки. */
export function extractAccessToken(headers: Headers, cookieValue?: string): string | null {
  const auth = headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim() || null;
  return cookieValue ?? null;
}

export async function loadUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      telegramId: true,
      rank: true,
      role: true,
      tz: true,
      oathAt: true,
      firstName: true,
      username: true,
    },
  });
  return user;
}

/** Сравнение отпечатков за постоянное время — для точечных проверок. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(fingerprint(a), 'hex');
  const right = Buffer.from(fingerprint(b), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Параметры куки: SameSite=None нужен, потому что Mini App открыт во фрейме. */
export function cookieOptions(maxAgeSec: number) {
  const production = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: maxAgeSec,
  };
}
