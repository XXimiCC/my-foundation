/**
 * Карта разделов приложения.
 *
 * Единственное место, где записано, что уже работает, а что впереди. Отсюда
 * строятся и нижняя панель, и страница «Разделы» — иначе они разъедутся, и
 * панель начнёт вести в пустоту.
 */

export type SectionState = 'готово' | 'в работе' | 'впереди';

export interface Section {
  key: string;
  title: string;
  /** Чему служит — словами Основания, а не описанием экрана. */
  purpose: string;
  href: string | null;
  state: SectionState;
  /** Завет или Основа, из которых раздел вырос. */
  source?: string;
}

export const SECTIONS: Section[] = [
  {
    key: 'triquetra',
    title: 'Триквестр',
    purpose: 'Сила, Боль и слабое звено. Прибор, а не картинка.',
    href: '/',
    state: 'готово',
    source: 'Основа 3. Триединение',
  },
  {
    key: 'kanon',
    title: 'Канон',
    purpose: 'Догмат, 10 Основ и 6 Заветов целиком, со ссылками и якорями.',
    href: '/kanon',
    state: 'готово',
  },
  {
    key: 'osnashenie',
    title: 'Оснащение',
    purpose: 'Принятие Договора Консенсуса. До него Заветы закрыты.',
    href: '/osnashenie',
    state: 'готово',
    source: '02 Декларация, Оснащение',
  },
  {
    key: 'akt',
    title: 'Акт',
    purpose: 'Акты применения тела, разума и духа. Уровни растут и распадаются.',
    href: null,
    state: 'в работе',
    source: 'Завет 1. АКТ',
  },
  {
    key: 'blag',
    title: 'Благо',
    purpose: 'Пять Благ с ритуальными фразами: Сон, Вода, Еда, Тепло, Тело.',
    href: null,
    state: 'в работе',
    source: 'Завет 3. БЛАГ',
  },
  {
    key: 'put',
    title: 'Путь',
    purpose: 'Вечерняя Декларация на завтра и След пройденного.',
    href: null,
    state: 'впереди',
    source: 'Завет 5. ПУТЬ',
  },
  {
    key: 'duh',
    title: 'Тишина',
    purpose: 'Таймер замедления: Сюжет, Озарение, Скука.',
    href: null,
    state: 'впереди',
    source: 'Завет 6. ДУХ',
  },
  {
    key: 'post',
    title: 'Пост',
    purpose: 'Дни Очищения и Месяц Искупления с окном еды и дневником.',
    href: null,
    state: 'впереди',
    source: 'Завет 2. ПОСТ',
  },
  {
    key: 'dar',
    title: 'Дар',
    purpose: 'Недельный журнал даров. Приватный: хвастаться нельзя.',
    href: null,
    state: 'впереди',
    source: 'Завет 4. ДАР',
  },
  {
    key: 'slovo',
    title: 'Слово Дня',
    purpose: 'Припоминание 418 тезисов Канона с нарастающими интервалами.',
    href: null,
    state: 'впереди',
    source: 'Основа 6. Познание',
  },
  {
    key: 'svitok',
    title: 'Свиток',
    purpose: 'Ретроспективы недели, месяца и года. Срывы — как опыт.',
    href: null,
    state: 'впереди',
    source: 'Догма Следа',
  },
  {
    key: 'orden',
    title: 'Орден',
    purpose: 'Домены, гости и братья. Вторая очередь целиком.',
    href: null,
    state: 'впереди',
    source: 'Орден Основания',
  },
];

/** Разделы для нижней панели: только то, куда действительно можно перейти. */
export const NAV_SECTIONS = SECTIONS.filter(
  (s): s is Section & { href: string } => s.state === 'готово' && s.href !== null,
);

export function countByState(state: SectionState): number {
  return SECTIONS.filter((s) => s.state === state).length;
}
