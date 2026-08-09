import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SEC,
  REFRESH_COOKIE,
  REFRESH_TTL_SEC,
  cookieOptions,
  revokeSession,
  rotateSession,
} from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Обмен refresh на новую пару. Токен одноразовый: старый гасится. */
export async function POST(request: Request) {
  const fromBody = await request
    .json()
    .then((b: unknown) => (b as { refreshToken?: string }).refreshToken)
    .catch(() => undefined);

  const fromCookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REFRESH_COOKIE}=`))
    ?.slice(REFRESH_COOKIE.length + 1);

  const refresh = fromBody ?? fromCookie;
  if (!refresh) return NextResponse.json({ error: 'нет refresh-токена' }, { status: 401 });

  const rotated = await rotateSession(refresh);
  if (!rotated) return NextResponse.json({ error: 'сессия недействительна' }, { status: 401 });

  const response = NextResponse.json({ accessToken: rotated.access });
  response.cookies.set(ACCESS_COOKIE, rotated.access, cookieOptions(ACCESS_TTL_SEC));
  response.cookies.set(REFRESH_COOKIE, rotated.refresh, cookieOptions(REFRESH_TTL_SEC));
  return response;
}

/** Выход: гасим refresh и стираем куки. */
export async function DELETE(request: Request) {
  const refresh = request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${REFRESH_COOKIE}=`))
    ?.slice(REFRESH_COOKIE.length + 1);

  if (refresh) await revokeSession(refresh);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
  return response;
}
