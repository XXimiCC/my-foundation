import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_TTL_SEC,
  cookieOptions,
  startSession,
} from '@/lib/auth/session';
import { verifyInitData, verifyLoginWidget } from '@/lib/auth/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вход через Telegram — обе ветки в одном месте, чтобы схемы вывода секрета
 * не разъезжались по файлам.
 *
 *   { source: "miniapp", initData: "<строка от Telegram>" }
 *   { source: "widget",  data: { id, first_name, username, auth_date, hash } }
 */
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'бот не настроен' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'тело запроса не разобрано' }, { status: 400 });
  }

  const payload = body as { source?: string; initData?: string; data?: Record<string, string> };

  const result =
    payload.source === 'widget'
      ? verifyLoginWidget(payload.data ?? {}, token)
      : verifyInitData(payload.initData ?? '', token);

  if (!result.ok) {
    // Причину возвращаем: она не раскрывает секрета, но экономит часы отладки.
    return NextResponse.json({ error: result.reason }, { status: 401 });
  }

  const { user, access, refresh } = await startSession(result.user);

  const response = NextResponse.json({
    // Токен отдаётся и телом: в webview Telegram страница открыта во фрейме,
    // и сторонние куки могут не дойти.
    accessToken: access,
    user: {
      id: user.id,
      rank: user.rank,
      role: user.role,
      firstName: user.firstName,
      username: user.username,
      oathAt: user.oathAt,
    },
  });

  response.cookies.set(ACCESS_COOKIE, access, cookieOptions(ACCESS_TTL_SEC));
  response.cookies.set(REFRESH_COOKIE, refresh, cookieOptions(REFRESH_TTL_SEC));
  return response;
}
