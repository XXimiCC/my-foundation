import { cookies, headers } from 'next/headers';
import {
  ACCESS_COOKIE,
  extractAccessToken,
  loadUser,
  readAccessToken,
  type SessionUser,
} from './session';

/**
 * Текущий человек — для серверных компонентов и обработчиков.
 * Возвращает null, если входа нет: решение о том, что делать дальше,
 * принимает вызывающий.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const token = extractAccessToken(headerStore, cookieStore.get(ACCESS_COOKIE)?.value);
  if (!token) return null;

  const userId = await readAccessToken(token);
  if (!userId) return null;

  return loadUser(userId);
}

/** Прошёл ли человек Оснащение. До него Заветы закрыты. */
export function isEquipped(user: SessionUser | null): boolean {
  return Boolean(user?.oathAt);
}
