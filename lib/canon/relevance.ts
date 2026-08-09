/**
 * Отбор тезисов, относящихся к теме документа.
 *
 * Брать первые попавшиеся по порядку нельзя: у «Основы 10. Благодарение»
 * после двух вступительных фраз идёт длинный разбор турбо-режима, и в
 * подборку попадало «Это состояние активируется каждый раз когда есть
 * угроза» — верное утверждение, но не про благодарность.
 *
 * Поэтому тезис сначала проверяется на родство с названием Основы по корню.
 */

/**
 * Ключевые корни по документам.
 *
 * Одного корня из названия не хватает: у «Опекания» слово «опека» встречается
 * один раз, а разбирается опека через заботу и любовь; у «Борения» корень
 * «бор» цепляет «выбор», к борьбе отношения не имеющий. Названия Заветов —
 * и вовсе аббревиатуры, из них корень не вывести.
 *
 * Список короткий и обозримый; когда появится админка, он переедет туда,
 * к самим документам.
 */
const ROOTS: Record<string, string[]> = {
  'osnova-1': ['творени', 'творе', 'созида', 'творц'],
  'osnova-2': ['борьб', 'борот', 'борени', 'преодол'],
  'osnova-3': ['триедин', 'компонент', 'дух', 'разум'],
  'osnova-4': ['спокой', 'беспокой'],
  'osnova-5': ['огранич', 'удовольств'],
  'osnova-6': ['познан', 'знани', 'обучен', 'опыт'],
  'osnova-7': ['замедл', 'тишин', 'мышлени'],
  'osnova-8': ['уважен', 'уваж', 'довери'],
  'osnova-9': ['опек', 'забот', 'любв', 'любл'],
  'osnova-10': ['благодар'],
  'zavet-1': ['акт', 'тренир', 'применени'],
  'zavet-2': ['пост', 'ограничени', 'очищени'],
  'zavet-3': ['благодар', 'благ'],
  'zavet-4': ['дар', 'делит', 'отда'],
  'zavet-5': ['путь', 'деклара', 'преодол'],
  'zavet-6': ['тишин', 'пустот', 'замедл'],
};

/** Корни, по которым тезис считается относящимся к документу. */
export function rootsFor(slug: string, title: string): string[] {
  return ROOTS[slug] ?? [titleStem(title)];
}

/** Окончания русских отглагольных существительных, которые мешают сравнению. */
const ENDINGS = ['ение', 'ание', 'ство', 'ость', 'ние', 'ие', 'ье', 'я', 'а'];

/**
 * Корень названия: «Благодарение» → «благодар», «Опекание» → «опек».
 * Достаточно грубо, но для десяти названий Основ работает точно.
 */
export function titleStem(title: string): string {
  const word = title
    .replace(/^(Основа|Завет)\s+\d+\.\s*/i, '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();

  for (const ending of ENDINGS) {
    if (word.length - ending.length >= 3 && word.endsWith(ending)) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
}

export interface RankableThesis {
  text: string;
}

/** Относится ли тезис к теме — по любому из корней документа. */
export function isOnTopic(thesis: string, roots: string[]): boolean {
  const lower = thesis.toLowerCase();
  return roots.some((root) => root.length >= 3 && lower.includes(root));
}

/**
 * Тезисы для показа в ритуале: сначала те, что говорят о самом документе,
 * в порядке текста; если таких не хватает, добираются остальные.
 */
export function pickTheses<T extends RankableThesis>(
  theses: T[],
  slug: string,
  title: string,
  count: number,
): T[] {
  const roots = rootsFor(slug, title);
  const onTopic = theses.filter((t) => isOnTopic(t.text, roots));
  if (onTopic.length >= count) return onTopic.slice(0, count);

  const rest = theses.filter((t) => !isOnTopic(t.text, roots));
  return [...onTopic, ...rest].slice(0, count);
}
