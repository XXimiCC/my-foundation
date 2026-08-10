/**
 * Слово Дня — активное припоминание Канона.
 *
 * «Для того чтобы запомнить факты, нужно их активно припоминать. Не
 * просматривать информацию, а пытаться извлечь из своей памяти» (Основа 6).
 * Поэтому карточка сначала показывает только НАЧАЛО тезиса и источник, а
 * целиком раскрывается лишь после того, как человек попытался вспомнить.
 *
 * Заход конечен: «вы не можете поддерживать высокий уровень концентрации
 * дольше получаса» (Догма Лимита). Карточек на день столько, сколько велит
 * точка оптимальных усилий, — и ни одной сверх. Ленты здесь нет.
 */

import type { PrismaClient } from '@prisma/client';
import { CARDS_NORM, goalFor, missedPeriods, streakOfPeriods, type Goal } from './goal';
import { dateFromKey, localDateKey } from './put';
import { INITIAL, grade, nextDue, type Recall, type ReviewState } from './srs';
import { startOfLocalDay } from './state';

/**
 * Метка акта Разума, начисленного за Слово Дня. По ней же считается цепь
 * дней: у ThesisReview хранится лишь последнее припоминание, а история
 * заходов нужна целиком.
 */
export const ACT_NOTE = 'Слово Дня';

/**
 * Доля акта Разума за пройденный заход.
 *
 * Основа 6 называет три ступени работы с информацией: запомнить —
 * припоминанием, понять — сравнением, познать — применением на практике.
 * Слово Дня закрывает первую из трёх, поэтому и даёт треть, а не акт целиком:
 * «знать недостаточно, нужно использовать то что я узнал».
 */
export const MIND_SHARE = 1 / 3;

/** Базовость документа: «всегда сначала нужно учить базовые принципы». */
const KIND_WEIGHT: Record<string, number> = {
  DOGMA: 0,
  FOUNDATION: 1,
  COVENANT: 2,
  INDEX: 3,
  ORDER: 4,
  JOURNAL: 5,
};

export function kindWeight(kind: string): number {
  return KIND_WEIGHT[kind] ?? 9;
}

/**
 * Подсказка для припоминания — начало тезиса.
 *
 * Не весь текст и не пустота: пустота превращает припоминание в угадайку,
 * а полный текст — в просмотр, который Основа 6 прямо отвергает.
 */
export function promptOf(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= 4) return `${words[0]}…`;
  const take = Math.min(8, Math.max(3, Math.round(words.length * 0.4)));
  return `${words.slice(0, take).join(' ')}…`;
}

export interface Card {
  thesisId: string;
  /** Откуда тезис: контекст для припоминания. */
  source: string;
  slug: string;
  prompt: string;
  text: string;
  /** Тезис встречается впервые. */
  fresh: boolean;
}

export interface SlovoView {
  todayKey: string;
  cards: Card[];
  /** Сколько тезисов уже припомнено сегодня. */
  done: number;
  goal: Goal;
  /** Заход на сегодня пройден целиком. */
  complete: boolean;
  /** Всего тезисов в Каноне и сколько из них уже знакомы. */
  total: number;
  known: number;
}

type ThesisRow = {
  id: string;
  text: string;
  doc: { slug: string; title: string; kind: string; order: number };
};

function toCard(row: ThesisRow, fresh: boolean): Card {
  return {
    thesisId: row.id,
    source: row.doc.title,
    slug: row.doc.slug,
    prompt: promptOf(row.text),
    text: row.text,
    fresh,
  };
}

function byBasics(a: ThesisRow, b: ThesisRow): number {
  return (
    kindWeight(a.doc.kind) - kindWeight(b.doc.kind) ||
    a.doc.order - b.doc.order ||
    a.id.localeCompare(b.id)
  );
}

export async function loadSlovo(
  prisma: PrismaClient,
  userId: string,
  tz: string,
  now = new Date(),
): Promise<SlovoView> {
  const todayKey = localDateKey(now, tz);
  const dayStart = startOfLocalDay(now, tz);
  // Срок сравнивается по суткам, а не по мгновению: тезис, назначенный на
  // сегодня, созрел с самого утра.
  const dueBefore = new Date(dateFromKey(todayKey).getTime() + 86_400_000);

  const [sessions, doneToday, dueReviews, freshTheses, total, known] = await Promise.all([
    prisma.act.findMany({
      where: { userId, note: ACT_NOTE },
      orderBy: { doneAt: 'desc' },
      take: 90,
      select: { doneAt: true },
    }),
    prisma.thesisReview.count({ where: { userId, lastAt: { gte: dayStart } } }),
    prisma.thesisReview.findMany({
      where: { userId, dueAt: { lt: dueBefore } },
      orderBy: { dueAt: 'asc' },
      take: 50,
      select: {
        thesis: {
          select: {
            id: true,
            text: true,
            doc: { select: { slug: true, title: true, kind: true, order: true } },
          },
        },
      },
    }),
    prisma.thesis.findMany({
      where: { active: true, reviews: { none: { userId } } },
      orderBy: [{ doc: { kind: 'asc' } }, { doc: { order: 'asc' } }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        text: true,
        doc: { select: { slug: true, title: true, kind: true, order: true } },
      },
    }),
    prisma.thesis.count({ where: { active: true } }),
    prisma.thesisReview.count({ where: { userId } }),
  ]);

  /**
   * Норма считается по ПРОШЛЫМ заходам, без сегодняшнего.
   *
   * Иначе она поехала бы прямо посреди захода: сегодняшний заход достроил бы
   * цепь до недели, норма выросла бы с пяти до семи, и только что законченная
   * работа снова оказалась бы незаконченной.
   */
  const sessionDays = sessions
    .map((s) => localDateKey(s.doneAt, tz))
    .filter((day) => day < todayKey);
  const goal = goalFor(
    CARDS_NORM,
    streakOfPeriods(sessionDays, 1, todayKey),
    missedPeriods(sessionDays[0] ?? null, 1, todayKey),
  );

  const left = Math.max(0, goal.target - doneToday);

  // Созревшие идут первыми: повторение важнее знакомства с новым.
  const due = dueReviews.map((r) => r.thesis as ThesisRow).sort(byBasics);
  const fresh = (freshTheses as ThesisRow[]).sort(byBasics);

  const cards = [
    ...due.slice(0, left).map((t) => toCard(t, false)),
    ...fresh.slice(0, Math.max(0, left - due.length)).map((t) => toCard(t, true)),
  ];

  return {
    todayKey,
    cards,
    done: doneToday,
    goal,
    complete: doneToday >= goal.target || (cards.length === 0 && doneToday > 0),
    total,
    known,
  };
}

/** Записывает попытку припоминания и возвращает новое состояние тезиса. */
export async function recordRecall(
  prisma: PrismaClient,
  userId: string,
  thesisId: string,
  recall: Recall,
  tz: string,
  now = new Date(),
): Promise<ReviewState> {
  const existing = await prisma.thesisReview.findUnique({
    where: { userId_thesisId: { userId, thesisId } },
    select: { ease: true, interval: true, reps: true, lapses: true },
  });

  const next = grade(existing ?? INITIAL, recall);
  const dueAt = dateFromKey(nextDue(next.interval, localDateKey(now, tz)));

  await prisma.thesisReview.upsert({
    where: { userId_thesisId: { userId, thesisId } },
    create: { userId, thesisId, ...next, dueAt, lastAt: now },
    update: { ...next, dueAt, lastAt: now },
  });

  return next;
}
