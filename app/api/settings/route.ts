import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';
import { validateSettings, type EditableSettings } from '@/lib/core/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Настройки ритуального дня.
 *
 * Часовой пояс лежит у человека, а не в настройках: без него бессмысленны все
 * окна, и он нужен ещё до того, как появится строка Settings. Экран правит и
 * то, и другое одним запросом — для человека это одна вещь.
 */

const DEFAULTS = {
  morningAt: 420,
  mindAt: 780,
  eveningAt: 1260,
  nightAt: 1350,
  quietFrom: 1380,
  quietTo: 390,
  fastWeekdays: [1, 5],
  intensity: 1,
};

async function load(userId: string, tz: string): Promise<EditableSettings> {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  return {
    morningAt: settings?.morningAt ?? DEFAULTS.morningAt,
    mindAt: settings?.mindAt ?? DEFAULTS.mindAt,
    eveningAt: settings?.eveningAt ?? DEFAULTS.eveningAt,
    nightAt: settings?.nightAt ?? DEFAULTS.nightAt,
    quietFrom: settings?.quietFrom ?? DEFAULTS.quietFrom,
    quietTo: settings?.quietTo ?? DEFAULTS.quietTo,
    fastWeekdays: settings?.fastWeekdays ?? DEFAULTS.fastWeekdays,
    intensity: settings?.intensity ?? DEFAULTS.intensity,
    tz,
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });

  return NextResponse.json(await load(user.id, user.tz));
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'нужен вход' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Partial<EditableSettings>;
  const current = await load(user.id, user.tz);

  // Правится только присланное: экран может слать одно поле, и остальные не
  // должны молча съезжать к значениям по умолчанию.
  const next: EditableSettings = {
    morningAt: pickMinute(body.morningAt, current.morningAt),
    mindAt: pickMinute(body.mindAt, current.mindAt),
    eveningAt: pickMinute(body.eveningAt, current.eveningAt),
    nightAt: pickMinute(body.nightAt, current.nightAt),
    quietFrom: pickMinute(body.quietFrom, current.quietFrom),
    quietTo: pickMinute(body.quietTo, current.quietTo),
    fastWeekdays: Array.isArray(body.fastWeekdays)
      ? [...new Set(body.fastWeekdays.filter((d) => Number.isInteger(d)))].sort()
      : current.fastWeekdays,
    intensity: typeof body.intensity === 'number' ? body.intensity : current.intensity,
    tz: typeof body.tz === 'string' && body.tz.trim() ? body.tz.trim() : current.tz,
  };

  const problems = validateSettings(next);
  if (problems.length > 0) {
    // 422: форма запроса верна, а настройки нерабочие.
    return NextResponse.json({ error: problems[0].message, problems }, { status: 422 });
  }

  const { tz, ...settings } = next;

  await prisma.$transaction([
    prisma.settings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...settings },
      update: settings,
    }),
    prisma.user.update({ where: { id: user.id }, data: { tz } }),
  ]);

  return NextResponse.json(next);
}

function pickMinute(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}
