/**
 * Три оболочки, Сила и Боль.
 *
 * Каждое правило здесь выведено из текста Философии Основания, а не придумано:
 *  — «То что используем — развиваем, то что не используем — теряем» (Завет АКТ)
 *    → уровень растёт от актов и распадается от простоя.
 *  — «Тело тренирую через день, разум каждый день, а дух весь день» (Завет АКТ)
 *    → у каждой оболочки свой льготный период до начала распада.
 *  — «Лезвие, ножны и рукоятка навсегда связанны и должны быть соразмерны»,
 *    «слабый разум ограничит потенциал тела, а слабый дух ограничит потенциал разума»
 *    → Сила есть ГАРМОНИЧЕСКОЕ среднее: дисбаланс наказывается математически.
 *  — «Если ничего не делать боль всегда растет» (Догмат)
 *    → накопитель пассивности добавляется к Боли.
 */

export type Shell = 'BODY' | 'MIND' | 'SPIRIT';

export const SHELLS: readonly Shell[] = ['BODY', 'MIND', 'SPIRIT'] as const;

export const SHELL_LABEL: Record<Shell, string> = {
  BODY: 'Тело',
  MIND: 'Разум',
  SPIRIT: 'Дух',
};

export interface ShellRule {
  /** Сколько дней без акта прощается до начала распада. */
  graceDays: number;
  /** Сколько единиц уровня теряется за сутки простоя после льготного периода. */
  decayPerDay: number;
  /** Базовый прирост за один акт применения. */
  gainPerAct: number;
}

/** Нормы взяты из Завета АКТ буквально. */
export const SHELL_RULES: Record<Shell, ShellRule> = {
  // «Хороший ориентир — три физических тренировки в неделю от 30 минут»
  BODY: { graceDays: 2, decayPerDay: 4, gainPerAct: 6 },
  // «Хороший ориентир — ежедневные тренировки от 10 минут»
  MIND: { graceDays: 1, decayPerDay: 5, gainPerAct: 4.5 },
  // «Дух весь день» — одно благое дело в день
  SPIRIT: { graceDays: 1, decayPerDay: 5, gainPerAct: 4.5 },
};

export const MAX_LEVEL = 100;

export type Levels = Record<Shell, number>;

export interface ShellState {
  level: number;
  /** Момент последнего акта применения. null — акта не было ни разу. */
  lastActAt: Date | null;
}

export type TriquetraState = Record<Shell, ShellState>;

export const DAY_MS = 86_400_000;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * СИЛА — гармоническое среднее трёх уровней.
 *
 * Ключевое отличие от арифметического: (90, 90, 10) даёт ~24, а (63, 63, 63)
 * при той же сумме даёт 63. Накачать одну оболочку и получить Силу нельзя —
 * ядро Триквестра не загорится. Это и есть триединение.
 *
 * Полностью мёртвая оболочка гасит Силу целиком: «тело без мозга — идиот,
 * а тело без души труп».
 */
export function sila(levels: Levels): number {
  const values = SHELLS.map((s) => clamp(levels[s], 0, MAX_LEVEL));
  if (values.some((v) => v <= 0)) return 0;
  const harmonic = values.length / values.reduce((acc, v) => acc + 1 / v, 0);
  return round1(harmonic);
}

/**
 * БОЛЬ — обратная сторона Силы плюс накопитель пассивности.
 * «Тот кто избегает боли, страдает больше» — простой сам по себе повышает Боль
 * сверх дефицита Силы.
 */
export function bol(levels: Levels, passivityDays = 0): number {
  const deficit = MAX_LEVEL - sila(levels);
  const passivity = Math.max(0, passivityDays) * 3;
  return round1(clamp(deficit + passivity, 0, MAX_LEVEL));
}

/** «Найди свой самый слабый компонент и устрани отставание» — Основа 3. */
export function weakestShell(levels: Levels): Shell {
  return SHELLS.reduce((weakest, s) =>
    levels[s] < levels[weakest] ? s : weakest,
  );
}

/**
 * Сколько полных суток простоя у оболочки сверх её льготного периода.
 * Именно эта величина, а не «пропущенные дни», управляет распадом.
 */
export function idleDaysBeyondGrace(
  state: ShellState,
  shell: Shell,
  now: Date,
): number {
  const rule = SHELL_RULES[shell];
  if (!state.lastActAt) return 0;
  const idle = (now.getTime() - state.lastActAt.getTime()) / DAY_MS;
  return Math.max(0, idle - rule.graceDays);
}

/** Применяет естественный распад к одной оболочке. Чистая функция. */
export function decayShell(
  state: ShellState,
  shell: Shell,
  now: Date,
): ShellState {
  const overdue = idleDaysBeyondGrace(state, shell, now);
  if (overdue <= 0) return state;
  const lost = overdue * SHELL_RULES[shell].decayPerDay;
  return { ...state, level: round1(clamp(state.level - lost, 0, MAX_LEVEL)) };
}

/**
 * Прирост за акт с затуханием у потолка: чем выше уровень, тем меньше даёт
 * очередной акт. «Прогресс, а не совершенство» — совершенство недостижимо
 * асимптотически.
 */
export function gainForAct(level: number, shell: Shell): number {
  const base = SHELL_RULES[shell].gainPerAct;
  const headroom = 1 - clamp(level, 0, MAX_LEVEL) / (MAX_LEVEL * 1.2);
  return round1(base * headroom);
}

/** Акт применения: уровень растёт, счётчик простоя обнуляется. */
export function applyAct(
  state: ShellState,
  shell: Shell,
  now: Date,
): ShellState {
  const decayed = decayShell(state, shell, now);
  const level = clamp(decayed.level + gainForAct(decayed.level, shell), 0, MAX_LEVEL);
  return { level: round1(level), lastActAt: now };
}

/** Приводит все три оболочки к состоянию «на сейчас». */
export function decayAll(state: TriquetraState, now: Date): TriquetraState {
  return {
    BODY: decayShell(state.BODY, 'BODY', now),
    MIND: decayShell(state.MIND, 'MIND', now),
    SPIRIT: decayShell(state.SPIRIT, 'SPIRIT', now),
  };
}

export function levelsOf(state: TriquetraState): Levels {
  return { BODY: state.BODY.level, MIND: state.MIND.level, SPIRIT: state.SPIRIT.level };
}

/**
 * Дни пассивности — сколько суток подряд не было ни одного акта ни по одной
 * оболочке. Растёт, пока человек стоит на месте; сбрасывается любым актом.
 */
export function passivityDays(state: TriquetraState, now: Date): number {
  const stamps = SHELLS.map((s) => state[s].lastActAt?.getTime()).filter(
    (t): t is number => typeof t === 'number',
  );
  if (stamps.length === 0) return 0;
  const last = Math.max(...stamps);
  return Math.max(0, Math.floor((now.getTime() - last) / DAY_MS));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
