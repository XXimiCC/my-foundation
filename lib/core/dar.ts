/**
 * Завет ДАР.
 *
 * «Каждую неделю необходимо заботиться и делиться своими ресурсами (время,
 * информация, деньги, силы) с другими людьми... Главный признак — это
 * безвозмездный переход моего ресурса в пользу другого человека.»
 *
 * Три запрета Завета закреплены в устройстве, а не в подсказках интерфейса:
 *  — «не хвастайся своими благими деяниями» → записи приватны, у Дара нет ни
 *    кнопки шеринга, ни выгрузки, и в модели нет полей публикации;
 *  — «не нужно ждать от людей ответных действий, ибо это корысть» → нигде не
 *    считается, кто и что вернул;
 *  — «не обещай благие деяния... обещание создаёт обязательство» → ЗАПЛАНИРОВАТЬ
 *    Дар нельзя в принципе. Фиксируется только уже совершённое.
 */

import type { PrismaClient } from '@prisma/client';
import { localDateKey, shiftKey } from './put';
import { startOfLocalDay } from './state';

export const GIFT_RESOURCES = ['TIME', 'EFFORT', 'INFO', 'RESPECT', 'MONEY', 'THING'] as const;
export type GiftResource = (typeof GIFT_RESOURCES)[number];

export const RESOURCE_LABEL: Record<GiftResource, string> = {
  TIME: 'Время',
  EFFORT: 'Силы',
  INFO: 'Информация',
  RESPECT: 'Уважение',
  MONEY: 'Деньги',
  THING: 'Вещь',
};

/** Примеры — цитаты из Завета, а не выдумка: по ним узнают свой поступок. */
export const RESOURCE_HINT: Record<GiftResource, string> = {
  TIME: 'обучаю, нахожусь рядом или тренирую',
  EFFORT: 'помогаю перенести, отремонтировать или сдвинуть',
  INFO: 'рассказываю секрет, способ, решение или опыт',
  RESPECT: 'успокаиваю, вдохновляю, озвучиваю достоинства человека',
  MONEY: 'оплачиваю, даю в дар или покрываю чужую нужду',
  THING: 'неожиданно дарю книгу, устройство, услугу',
};

export function isGiftResource(value: unknown): value is GiftResource {
  return typeof value === 'string' && GIFT_RESOURCES.includes(value as GiftResource);
}

/** Понедельник как начало недели: он же принят в настройках Дней Очищения. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Начало текущей недели в часах человека.
 *
 * Неделя доктринальна: «каждую неделю необходимо делиться». Поэтому это
 * календарная неделя, а не скользящие семь дней — иначе граница ползёт и
 * «раз в неделю» перестаёт что-либо значить.
 */
export function startOfLocalWeek(now: Date, tz: string): Date {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  const index = Math.max(0, WEEKDAYS.indexOf(short));
  const monday = shiftKey(localDateKey(now, tz), -index);
  // Полдень UTC как зонд: в этот момент дата совпадает с искомой почти в любой
  // зоне, а точную полночь всё равно вычисляет startOfLocalDay.
  return startOfLocalDay(new Date(`${monday}T12:00:00.000Z`), tz);
}

export interface GiftRecord {
  id: string;
  resource: GiftResource;
  recipient: string | null;
  note: string | null;
  at: string;
}

export interface DarView {
  /** Дары этой недели. Норма Завета — хотя бы один. */
  week: { from: string; gifts: GiftRecord[] };
  /** Прошлая неделя одной цифрой: сравнение с собой, а не с кем-то. */
  previousWeek: number;
  /** Недель подряд с хотя бы одним Даром. */
  streak: number;
}

const WEEK_MS = 7 * 86_400_000;

export async function loadDar(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<DarView> {
  const weekStart = startOfLocalWeek(now, tz);
  // Восемь недель назад — глубина, на которой считается цепь. Дальше история
  // не нужна: у Дара нет ленты.
  const since = new Date(weekStart.getTime() - 8 * WEEK_MS);

  const rows = await prisma.gift.findMany({
    where: { userId, at: { gte: since } },
    orderBy: { at: 'desc' },
  });

  const thisWeek = rows.filter((g) => g.at >= weekStart);
  const previous = rows.filter(
    (g) => g.at >= new Date(weekStart.getTime() - WEEK_MS) && g.at < weekStart,
  );

  return {
    week: {
      from: localDateKey(weekStart, tz),
      gifts: thisWeek.map(toRecord),
    },
    previousWeek: previous.length,
    streak: streakOfWeeks(rows.map((g) => g.at), weekStart),
  };
}

function toRecord(gift: {
  id: string;
  resource: string;
  recipient: string | null;
  note: string | null;
  at: Date;
}): GiftRecord {
  return {
    id: gift.id,
    resource: gift.resource as GiftResource,
    recipient: gift.recipient,
    note: gift.note,
    at: gift.at.toISOString(),
  };
}

/**
 * Сколько недель подряд, считая назад, был хотя бы один Дар.
 *
 * Текущая неделя ещё идёт: пустая — она цепь не рвёт, ровно как незакрытый
 * сегодняшний день в Следе Пути.
 */
export function streakOfWeeks(stamps: Date[], weekStart: Date): number {
  const times = stamps.map((d) => d.getTime());
  let streak = 0;

  // Глубина та же, что у выборки: дальше восьми недель данных всё равно нет.
  for (let back = 0; back <= 8; back += 1) {
    const from = weekStart.getTime() - back * WEEK_MS;
    const to = from + WEEK_MS;
    const has = times.some((t) => t >= from && t < to);
    if (has) streak += 1;
    else if (back > 0) break;
  }

  return streak;
}
