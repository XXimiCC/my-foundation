/**
 * Завет ПУТЬ — Декларация и её Выполнение.
 *
 * «Каждый вечер, когда я нахожусь наедине с собой, необходимо зафиксировать...
 * то, что я совершу завтра: план своих действий. Эти действия должны быть
 * ВЫПОЛНИМЫМИ и РАЗВИВАЮЩИМИ. Запрещено декларировать лень, потребление и
 * удовольствие. Там нет развития.»
 *
 * Поэтому валидатор здесь — не забота об удобстве, а исполнение прямого
 * запрета Завета. Без него Декларация превращается в список желаний, а Завет
 * прямо называет это течением вниз.
 *
 * В файле только чистая логика: локальные даты, валидатор, арифметика Следа и
 * Свитка. Всё, что ходит в базу, живёт в rollup.ts и в роуте.
 */

import { SHELLS, type Shell } from './shells';

/** Пункт Декларации в том виде, в каком он лежит в Declaration.items. */
export interface DeclarationItem {
  text: string;
  /**
   * Необязательная привязка к оболочке. Если она есть, выполнение пункта и
   * есть Акт применения: «Делаю, планирую, фиксирую» замыкается в одно
   * касание, и одно и то же усилие не считается дважды.
   */
  shell: Shell | null;
  done: boolean;
  doneAt: string | null;
  /** Акт, записанный при выполнении. Хранится, чтобы не начислить его дважды. */
  actId: string | null;
}

/**
 * «Не планируйте заведомо сложные для выполнения действия»,
 * «Можно декларировать всего одно действие, но обязательно его выполнить».
 *
 * Точка отказа зафиксирована в отчёте за 2024: «мало сделал из того что
 * планировал, ибо планы были не реалистичными». Потолок в пять пунктов — это
 * и есть защита от того провала.
 */
export const MAX_ITEMS = 5;
export const MAX_LEN = 140;
/** Короче — это не действие, а ярлык: «спорт», «код». Разбить на части. */
export const MIN_LEN = 6;

export type RejectReason =
  | 'пусто'
  | 'коротко'
  | 'длинно'
  | 'много'
  | 'лень'
  | 'потребление'
  | 'удовольствие';

export interface Verdict {
  ok: boolean;
  /** Нормализованный текст — именно он уходит в базу. */
  text: string;
  reason?: RejectReason;
  /** Что сделать, чтобы пункт стал развивающим. Не упрёк, а выход. */
  hint?: string;
}

interface BanRule {
  /** Корни: слово считается пойманным, если начинается с одного из них. */
  roots?: string[];
  /** Устойчивые обороты, которые одним корнем не выражаются. */
  phrases?: RegExp[];
  reason: Extract<RejectReason, 'лень' | 'потребление' | 'удовольствие'>;
  hint: string;
  /** Развивающий контекст, снимающий подозрение с общего глагола. */
  unless?: string[];
}

/**
 * Сопоставление идёт по НАЧАЛУ слова, а не по подстроке: русский язык
 * склоняется, и «пиво» в декларации почти всегда стоит как «пива». Корень
 * «пив» ловит все формы сразу.
 *
 * Границу слова `\b` использовать нельзя — она определена по ASCII и перед
 * кириллицей не срабатывает вовсе.
 */
const BANS: BanRule[] = [
  // ── Лень ────────────────────────────────────────────────────────────────
  {
    phrases: [/(?:^| )ничего не (?:делать|буду|сделаю)/],
    roots: ['прокрастин', 'ничегонеделан'],
    reason: 'лень',
    hint: 'Назовите хотя бы один маленький шаг: тот кто двигает горы, начинал с камушков.',
  },
  {
    roots: [
      'полежат',
      'повалят',
      'валят',
      'отоспат',
      'отосплю',
      'проспат',
      'ленит',
      'ленюс',
      'полени',
      'забить',
      'забью',
    ],
    reason: 'лень',
    hint: 'Это течение вниз. Замените на действие, которое даст усилие.',
  },
  {
    roots: ['отдых', 'отдохн', 'отдыха'],
    reason: 'лень',
    hint: 'Восстановление — это Благо, а не Путь. Поблагодарите Сон в Завете БЛАГ.',
  },
  // ── Потребление ─────────────────────────────────────────────────────────
  {
    roots: [
      'сериал',
      'ютуб',
      'youtube',
      'тикток',
      'tiktok',
      'инстаграм',
      'instagram',
      'рилс',
      'reels',
      'шортс',
      'аниме',
      'новост',
      'соцсет',
      'мем',
    ],
    reason: 'потребление',
    hint: 'Потребление не развивает. Что вы после этого сможете такого, чего не можете сейчас?',
  },
  {
    roots: ['залип', 'скролл', 'листат', 'полистат', 'полазит', 'потупит'],
    reason: 'потребление',
    hint: 'Это и есть затхлое болото из Завета. Поставьте вместо него один развивающий шаг.',
  },
  {
    // Общий глагол: смотреть можно, если это обучение. Отсюда `unless`.
    roots: ['посмотрет', 'досмотрет', 'смотрет', 'глянут'],
    reason: 'потребление',
    hint: 'Смотреть можно, если это обучение: назовите, чему учитесь — лекция, курс, разбор.',
    unless: [
      'лекц',
      'курс',
      'урок',
      'разбор',
      'обучающ',
      'документальн',
      'туториал',
      'вебинар',
      'мастер-класс',
      'конспект',
      'доклад',
    ],
  },
  // ── Удовольствие ────────────────────────────────────────────────────────
  {
    roots: [
      'поиграт',
      'игрушк',
      'катк',
      'дота',
      'dota',
      'приставк',
      'плойк',
      'стрим',
      'погамат',
    ],
    reason: 'удовольствие',
    hint: 'Игра не строит оболочку. Что из этого времени можно отдать телу, разуму или духу?',
  },
  {
    roots: [
      'алкогол',
      'бухл',
      'бухат',
      'пив',
      'вино',
      'винишк',
      'виски',
      'покурит',
      'курить',
      'вейп',
      'кальян',
      'казино',
      'ставк',
      'букмекер',
      'порн',
    ],
    phrases: [/(?:^| )выпить/],
    reason: 'удовольствие',
    hint: 'Тело торгуется с разумом. Подчините его воле Завета — назовите усилие.',
  },
  {
    roots: [
      'вкусняш',
      'фастфуд',
      'бургер',
      'пицц',
      'тортик',
      'сладост',
      'сладк',
      'шоколадк',
      'шопинг',
      'потусит',
      'тусовк',
    ],
    reason: 'удовольствие',
    hint: 'Удовольствие — не цель Пути. Оставьте его вне Декларации.',
  },
];

const REASON_LABEL: Record<RejectReason, string> = {
  пусто: 'Пункт пустой',
  коротко: 'Это ярлык, а не действие',
  длинно: 'Слишком длинно',
  много: 'Слишком много пунктов',
  лень: 'Это лень',
  потребление: 'Это потребление',
  удовольствие: 'Это удовольствие',
};

export function reasonLabel(reason: RejectReason): string {
  return REASON_LABEL[reason];
}

/** Нижний регистр, ё→е, одиночные пробелы: сравнение идёт по корням. */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я-]+/g, ' ')
    .trim();
}

/** Убирает лишние пробелы, но сохраняет написание человека. */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Проверка одного пункта. Отклонение — не наказание: у каждого отказа есть
 * подсказка, как переформулировать. Основа 5 запрещает наказывать, но Завет
 * ПУТЬ прямо запрещает и пропускать.
 */
export function validateItem(raw: string): Verdict {
  const text = normalizeText(raw ?? '');
  if (!text) return { ok: false, text, reason: 'пусто', hint: 'Впишите действие.' };
  if (text.length > MAX_LEN) {
    return {
      ok: false,
      text,
      reason: 'длинно',
      hint: 'Разбейте на доступные составные части — так велит сам Завет.',
    };
  }
  if (text.length < MIN_LEN) {
    return {
      ok: false,
      text,
      reason: 'коротко',
      hint: 'Назовите конкретное действие: не «спорт», а «пробежка 5 км».',
    };
  }

  const probe = normalizeForMatch(text);
  const words = probe.split(' ').filter(Boolean);
  const hasRoot = (roots: string[]) =>
    words.some((word) => roots.some((root) => word.startsWith(root)));

  for (const ban of BANS) {
    const hit =
      (ban.roots !== undefined && hasRoot(ban.roots)) ||
      (ban.phrases?.some((phrase) => phrase.test(probe)) ?? false);
    if (!hit) continue;
    if (ban.unless && hasRoot(ban.unless)) continue;
    return { ok: false, text, reason: ban.reason, hint: ban.hint };
  }

  return { ok: true, text };
}

export interface DeclarationVerdict {
  ok: boolean;
  verdicts: Verdict[];
  /** Общая причина отказа — например, превышен потолок пунктов. */
  reason?: RejectReason;
  hint?: string;
}

/** Проверка Декларации целиком: пункты плюс потолок их числа. */
export function validateDeclaration(items: string[]): DeclarationVerdict {
  const verdicts = items.map(validateItem);
  const filled = items.filter((i) => normalizeText(i ?? '').length > 0);

  if (filled.length === 0) {
    return {
      ok: false,
      verdicts,
      reason: 'пусто',
      hint: 'Достаточно одного действия — но его нужно выполнить.',
    };
  }
  if (filled.length > MAX_ITEMS) {
    return {
      ok: false,
      verdicts,
      reason: 'много',
      hint: `Не больше ${MAX_ITEMS}: постоянство важнее скорости.`,
    };
  }

  return { ok: verdicts.every((v) => v.ok || !v.text), verdicts };
}

export function isShell(value: unknown): value is Shell {
  return typeof value === 'string' && SHELLS.includes(value as Shell);
}

/** Приводит запись из Json к типизированному пункту, отбрасывая мусор. */
export function readItems(raw: unknown): DeclarationItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const it = entry as Record<string, unknown>;
    const text = typeof it.text === 'string' ? normalizeText(it.text) : '';
    if (!text) return [];
    return [
      {
        text,
        shell: isShell(it.shell) ? it.shell : null,
        done: it.done === true,
        doneAt: typeof it.doneAt === 'string' ? it.doneAt : null,
        actId: typeof it.actId === 'string' ? it.actId : null,
      },
    ];
  });
}

// ─── Локальные даты ─────────────────────────────────────────────────────────

/**
 * Ключ локального дня, `YYYY-MM-DD`.
 *
 * Декларация привязана к дню человека, а не к UTC: составленная в 23:40 в
 * Киеве, она относится к завтрашнему киевскому дню, хотя по UTC это ещё
 * сегодня.
 */
export function localDateKey(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Дата для колонки `@db.Date` — полночь UTC, без времени. */
export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Сдвиг ключа на целые сутки. Через UTC — сдвиг зоны здесь не участвует. */
export function shiftKey(key: string, days: number): string {
  return keyFromDate(new Date(dateFromKey(key).getTime() + days * 86_400_000));
}

export function tomorrowKey(now: Date, tz: string): string {
  return shiftKey(localDateKey(now, tz), 1);
}

/** Сколько суток между ключами: положительное значит, что `b` позже. */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateFromKey(b).getTime() - dateFromKey(a).getTime()) / 86_400_000);
}

// ─── След и Свиток ──────────────────────────────────────────────────────────

/** Один день Следа. Дни без записи существуют — они просто пустые. */
export interface TrailDay {
  date: string;
  /** Сила дня. Она же яркость точки: яркость означает только заполнение. */
  sila: number;
  bol: number;
  declared: boolean;
  done: number;
  total: number;
}

export function progressOf(items: DeclarationItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

/** День закрыт, когда выполнено всё задекларированное. */
export function isFulfilled(items: DeclarationItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}

export interface WeekScroll {
  from: string;
  to: string;
  /** Дней, на которые была Декларация. */
  declaredDays: number;
  /** Дней, где выполнено всё задекларированное. */
  fulfilledDays: number;
  doneItems: number;
  totalItems: number;
  /** Средняя Сила по дням, о которых есть запись. */
  avgSila: number;
  /**
   * Своё же начало и конец недели: «мы оцениваем свой прогресс завтра
   * относительно себя сегодня» (Основа 1). Ни с кем, кроме себя, сравнения нет.
   */
  silaFrom: number;
  silaTo: number;
}

/** Свиток недели: последние семь дней Следа, свёрнутые в один взгляд назад. */
export function weekScroll(trail: TrailDay[]): WeekScroll | null {
  const week = trail.slice(-7);
  if (week.length === 0) return null;

  const known = week.filter((d) => d.sila > 0 || d.declared);
  const avg = known.length
    ? known.reduce((acc, d) => acc + d.sila, 0) / known.length
    : 0;

  return {
    from: week[0].date,
    to: week[week.length - 1].date,
    declaredDays: week.filter((d) => d.declared).length,
    fulfilledDays: week.filter((d) => d.total > 0 && d.done === d.total).length,
    doneItems: week.reduce((acc, d) => acc + d.done, 0),
    totalItems: week.reduce((acc, d) => acc + d.total, 0),
    avgSila: Math.round(avg * 10) / 10,
    silaFrom: week[0].sila,
    silaTo: week[week.length - 1].sila,
  };
}

/** Всё, что экран Пути показывает за один заход. Один ответ на все методы. */
export interface PutView {
  today: {
    date: string;
    exists: boolean;
    items: DeclarationItem[];
    reflection: string | null;
    closedAt: string | null;
    done: number;
    total: number;
  };
  tomorrow: {
    date: string;
    exists: boolean;
    items: DeclarationItem[];
  };
  trail: TrailDay[];
  week: WeekScroll | null;
  streak: number;
  /** Слабое звено — подсказка, что декларировать (Основа 3). */
  weakest: Shell;
}

/**
 * Сколько дней подряд, считая от последнего, Декларация выполнена целиком.
 * «Чем дольше я это делаю, тем меньше хаос».
 *
 * Сегодняшний незакрытый день цепь не рвёт: он ещё идёт.
 */
export function streakOf(trail: TrailDay[], todayKey: string): number {
  let streak = 0;
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const day = trail[i];
    if (day.date === todayKey && !(day.total > 0 && day.done === day.total)) continue;
    if (day.total > 0 && day.done === day.total) streak += 1;
    else break;
  }
  return streak;
}
