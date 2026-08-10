import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { appUrl } from '@/lib/config';
import { prisma } from '@/lib/db';
import { sendMessage } from '@/lib/bot/api';
import { ritualMessage } from '@/lib/bot/messages';
import { startOfLocalWeek } from '@/lib/core/dar';
import { dayNumber } from '@/lib/core/post';
import { dateFromKey, localDateKey, shiftKey } from '@/lib/core/put';
import {
  GRACE_MINUTES,
  dedupeKey,
  dueWindows,
  inQuietHours,
  localNow,
  windowsFor,
  type DayFacts,
  type RitualKind,
  type ScheduleSettings,
} from '@/lib/core/schedule';
import { ACT_NOTE as SLOVO_ACT } from '@/lib/core/slovo';
import { startOfLocalDay } from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Планировщик ритуального дня.
 *
 * На Vercel нет долгоживущего воркера, поэтому расписание — это эндпоинт,
 * который дёргает внешний пингер (cron-job.org) каждые 15 минут. Один тик
 * делает две вещи: раскладывает наступившие окна в очередь и отправляет то,
 * что в ней лежит.
 *
 * Идемпотентность держится не на аккуратности пингера, а на уникальном
 * `dedupeKey` в базе: перекрывшиеся тики физически не могут отправить ритуал
 * дважды.
 */

/** Сколько людей и сколько сообщений обрабатывается за один тик. */
const USERS_PER_TICK = 200;
const SENDS_PER_TICK = 30;
/** Больше пяти попыток — значит дело не во временной ошибке сети. */
const MAX_ATTEMPTS = 5;

const DEFAULTS: ScheduleSettings = {
  morningAt: 420,
  mindAt: 780,
  eveningAt: 1260,
  nightAt: 1350,
  quietFrom: 1380,
  quietTo: 390,
  fastWeekdays: [1, 5],
  intensity: 1,
};

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const url = new URL(request.url);
  const given =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    url.searchParams.get('key') ??
    '';

  // Сравнение постоянного времени: секрет ходит в открытом запросе, и
  // побайтовая утечка через тайминг здесь ни к чему.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Времена, в которые у человека вообще может что-то произойти.
 *
 * Считаются до фактов о дне: если ни одно не наступило, человека можно
 * пропустить, не читая ни одной таблицы. На тике это разница между шестью
 * запросами и нулём.
 */
function candidateTimes(settings: ScheduleSettings): number[] {
  return [
    settings.morningAt,
    settings.mindAt,
    settings.eveningAt - 60,
    settings.eveningAt,
    settings.nightAt,
  ];
}

async function loadFacts(
  db: PrismaClient,
  userId: string,
  tz: string,
  now: Date,
): Promise<DayFacts> {
  const todayKey = localDateKey(now, tz);
  const dayStart = startOfLocalDay(now, tz);

  const [fast, tomorrow, today, sleep, slovo, gift] = await Promise.all([
    db.fastPeriod.findFirst({
      where: { userId, startAt: { lte: now }, endAt: { gt: now } },
      select: { kind: true, startAt: true },
    }),
    db.declaration.findUnique({
      where: { userId_forDate: { userId, forDate: dateFromKey(shiftKey(todayKey, 1)) } },
      select: { id: true },
    }),
    db.declaration.findUnique({
      where: { userId_forDate: { userId, forDate: dateFromKey(todayKey) } },
      select: { closedAt: true },
    }),
    db.blessing.findFirst({
      where: { userId, blessing: 'SLEEP', at: { gte: dayStart } },
      select: { id: true },
    }),
    db.act.findFirst({
      where: { userId, note: SLOVO_ACT, doneAt: { gte: dayStart } },
      select: { id: true },
    }),
    db.gift.findFirst({
      where: { userId, at: { gte: startOfLocalWeek(now, tz) } },
      select: { id: true },
    }),
  ]);

  return {
    fastDay: fast ? dayNumber(localDateKey(fast.startAt, tz), todayKey) : null,
    fastKind: fast ? (fast.kind as DayFacts['fastKind']) : null,
    tomorrowDeclared: Boolean(tomorrow),
    todayClosed: Boolean(today?.closedAt),
    sleepBlessed: Boolean(sleep),
    slovoDone: Boolean(slovo),
    giftThisWeek: Boolean(gift),
  };
}

async function tick(now: Date, dry: boolean, only: bigint | null) {
  const users = await prisma.user.findMany({
    where: { oathAt: { not: null }, ...(only !== null ? { telegramId: only } : {}) },
    take: USERS_PER_TICK,
    select: { id: true, tz: true, telegramId: true, settings: true },
  });

  let planned = 0;
  let considered = 0;

  for (const user of users) {
    const settings: ScheduleSettings = user.settings
      ? {
          morningAt: user.settings.morningAt,
          mindAt: user.settings.mindAt,
          eveningAt: user.settings.eveningAt,
          nightAt: user.settings.nightAt,
          quietFrom: user.settings.quietFrom,
          quietTo: user.settings.quietTo,
          fastWeekdays: user.settings.fastWeekdays,
          intensity: user.settings.intensity,
        }
      : DEFAULTS;

    const local = localNow(now, user.tz);
    if (inQuietHours(local.minutes, settings.quietFrom, settings.quietTo)) continue;

    const anyDue = candidateTimes(settings).some((at) => {
      const waited = local.minutes - at;
      return waited >= 0 && waited <= GRACE_MINUTES;
    });
    if (!anyDue) continue;

    considered += 1;
    const facts = await loadFacts(prisma, user.id, user.tz, now);
    const due = dueWindows(windowsFor(settings, local.weekday, facts), local.minutes, settings);

    if (due.length === 0) continue;

    const created = await prisma.outboxMessage.createMany({
      data: due.map((w) => ({
        userId: user.id,
        kind: w.kind as RitualKind,
        dedupeKey: dedupeKey(user.id, w.kind, local.dateKey),
        scheduledFor: now,
      })),
      // Уникальный ключ и есть защита от повторов: перекрывшиеся тики просто
      // не создадут вторую запись.
      skipDuplicates: true,
    });
    planned += created.count;
  }

  if (dry) return { considered, planned, sent: 0, failed: 0 };

  // ── Отправка ──
  const pending = await prisma.outboxMessage.findMany({
    where: {
      ...(only !== null ? { user: { telegramId: only } } : {}),
      sentAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      // Просроченное не догоняем: ритуал, доставленный много позже своего
      // часа, перестаёт быть ритуалом.
      scheduledFor: { gte: new Date(now.getTime() - GRACE_MINUTES * 60_000), lte: now },
    },
    take: SENDS_PER_TICK,
    orderBy: { scheduledFor: 'asc' },
    select: { id: true, kind: true, user: { select: { telegramId: true } } },
  });

  let sent = 0;
  let failed = 0;
  const base = appUrl();

  for (const message of pending) {
    const { text, keyboard } = ritualMessage(message.kind as RitualKind, base);
    const result = await sendMessage(message.user.telegramId, text, keyboard).catch(
      (e: unknown) => ({ ok: false, description: e instanceof Error ? e.message : 'сбой сети' }),
    );

    if (result.ok) {
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: { sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      sent += 1;
    } else {
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: { attempts: { increment: 1 }, lastError: result.description ?? 'отказ' },
      });
      failed += 1;
    }
  }

  return { considered, planned, sent, failed };
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'нет доступа' }, { status: 401 });
  }

  const url = new URL(request.url);
  // Подменённые часы — единственный способ проверить ритуальные окна, не
  // дожидаясь семи утра. Доступно только по секрету, как и всё остальное.
  const at = url.searchParams.get('at');
  const now = at ? new Date(at) : new Date();
  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: 'не разбирается «at»' }, { status: 400 });
  }

  const onlyRaw = url.searchParams.get('only');
  let only: bigint | null = null;
  if (onlyRaw) {
    try {
      only = BigInt(onlyRaw);
    } catch {
      return NextResponse.json({ error: 'не разбирается «only»' }, { status: 400 });
    }
  }

  /**
   * Подменённые часы обязаны быть направлены на одного человека.
   *
   * Проверка на общей базе один раз уже разложила чужому живому аккаунту
   * ритуалы «на семь утра», которые потом молча не ушли бы, зато перекрыли бы
   * настоящие своим ключом идемпотентности. Час теста не должен доставать до
   * чужого дня — поэтому без `only` подмена времени не работает вовсе.
   */
  if (at && only === null) {
    return NextResponse.json(
      { error: 'подменённые часы требуют «only» — иначе тик заденет чужие дни' },
      { status: 400 },
    );
  }

  const dry = url.searchParams.get('dry') === '1';

  try {
    return NextResponse.json({ ok: true, at: now.toISOString(), ...(await tick(now, dry, only)) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'сбой тика' },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
