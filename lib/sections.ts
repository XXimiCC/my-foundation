/**
 * Карта разделов приложения.
 *
 * Единственное место, где записано, что уже работает, а что впереди. Отсюда
 * строятся и нижняя панель, и страница «Разделы» — иначе они разъедутся, и
 * панель начнёт вести в пустоту.
 */

export type SectionState = 'готово' | 'в работе' | 'впереди';

/**
 * Где у раздела вход.
 *
 * Панель намеренно бедная: в неё попадают только постоянные места. Заветы
 * живут на главном экране — они ритуалы дня, а не вкладки, и сессия должна
 * заканчиваться, когда ритуал выполнен. Оснащение не попадает никуда: оно
 * одноразовое, зовёт с полигона и после прохождения ведёт редиректом на «/».
 */
export type SectionEntry = 'панель' | 'ритуал' | 'нет';

export interface Section {
  key: string;
  title: string;
  /** Чему служит — словами Основания, а не описанием экрана. */
  purpose: string;
  href: string | null;
  state: SectionState;
  entry: SectionEntry;
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
    entry: 'панель',
    source: 'Основа 3. Триединение',
  },
  {
    key: 'kanon',
    title: 'Канон',
    purpose: 'Догмат, 10 Основ и 6 Заветов целиком, со ссылками и якорями.',
    href: '/kanon',
    state: 'готово',
    entry: 'панель',
  },
  {
    key: 'osnashenie',
    title: 'Оснащение',
    purpose: 'Принятие Договора Консенсуса. До него Заветы закрыты.',
    href: '/osnashenie',
    state: 'готово',
    entry: 'нет',
    source: '02 Декларация, Оснащение',
  },
  {
    key: 'akt',
    title: 'Акт',
    purpose: 'Акты применения тела, разума и духа. Уровни растут и распадаются.',
    href: '/',
    state: 'готово',
    entry: 'нет',
    source: 'Завет 1. АКТ',
  },
  {
    key: 'blag',
    title: 'Благо',
    purpose: 'Пять Благ с ритуальными фразами: Сон, Вода, Еда, Тепло, Тело.',
    href: '/',
    state: 'готово',
    entry: 'нет',
    source: 'Завет 3. БЛАГ',
  },
  {
    key: 'put',
    title: 'Путь',
    purpose: 'Вечерняя Декларация на завтра, её выполнение и След пройденного.',
    href: '/put',
    state: 'готово',
    entry: 'ритуал',
    source: 'Завет 5. ПУТЬ',
  },
  {
    key: 'duh',
    title: 'Тишина',
    purpose: 'Ежедневное замедление: Сюжет, Озарение, Скука.',
    href: '/tishina',
    state: 'готово',
    entry: 'ритуал',
    source: 'Завет 6. ДУХ',
  },
  {
    key: 'post',
    title: 'Пост',
    purpose: 'Дни Очищения и Месяц Искупления: два запрета, окно еды, дневник.',
    href: '/post',
    state: 'готово',
    entry: 'ритуал',
    source: 'Завет 2. ПОСТ',
  },
  {
    key: 'dar',
    title: 'Дар',
    purpose: 'Недельный журнал даров. Приватный: хвастаться нельзя.',
    href: '/dar',
    state: 'готово',
    entry: 'ритуал',
    source: 'Завет 4. ДАР',
  },
  {
    key: 'slovo',
    title: 'Слово Дня',
    purpose: 'Припоминание 418 тезисов Канона с нарастающими интервалами.',
    href: '/slovo',
    state: 'готово',
    entry: 'ритуал',
    source: 'Основа 6. Познание',
  },
  {
    key: 'svitok',
    title: 'Свиток',
    purpose: 'Ретроспективы недели, месяца и года. Срывы — как опыт.',
    href: null,
    state: 'впереди',
    entry: 'нет',
    source: 'Догма Следа',
  },
  {
    key: 'orden',
    title: 'Орден',
    purpose: 'Домены, гости и братья. Вторая очередь целиком.',
    href: null,
    state: 'впереди',
    entry: 'нет',
    source: 'Орден Основания',
  },
];

type Reachable = Section & { href: string };

function reachable(entry: SectionEntry): Reachable[] {
  return SECTIONS.filter(
    (s): s is Reachable => s.state === 'готово' && s.href !== null && s.entry === entry,
  );
}

/**
 * Разделы нижней панели. Их намеренно мало: панель не должна приглашать к
 * блужданию. Ритуалы сюда не попадают — семь вкладок не помещаются на экране
 * телефона, и это не вопрос вёрстки: вкладка зовёт зайти, а ритуал должен
 * звать в свой час.
 */
export const NAV_SECTIONS = reachable('панель');

/** Заветы дня — входы с главного экрана. */
export const RITUAL_SECTIONS = reachable('ритуал');

export function countByState(state: SectionState): number {
  return SECTIONS.filter((s) => s.state === state).length;
}
