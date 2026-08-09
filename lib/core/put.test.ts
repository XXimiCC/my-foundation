import { describe, expect, it } from 'vitest';
import {
  MAX_ITEMS,
  daysBetween,
  isFulfilled,
  localDateKey,
  progressOf,
  readItems,
  shiftKey,
  streakOf,
  tomorrowKey,
  validateDeclaration,
  validateItem,
  weekScroll,
  type DeclarationItem,
  type TrailDay,
} from './put';

describe('Валидатор Декларации', () => {
  it('принимает выполнимое и развивающее действие', () => {
    for (const good of [
      'Пробежка 5 км в парке',
      'Прочитать 20 страниц по системному дизайну',
      'Собрать стенд для проекта и запустить тесты',
      'Позвонить отцу и выслушать его',
    ]) {
      expect(validateItem(good).ok, good).toBe(true);
    }
  });

  it('отклоняет лень — «там нет развития»', () => {
    for (const lazy of ['Ничего не делать весь день', 'Поваляться до обеда', 'Отдохнуть от всего']) {
      const verdict = validateItem(lazy);
      expect(verdict.ok, lazy).toBe(false);
      expect(verdict.reason, lazy).toBe('лень');
    }
  });

  it('отклоняет потребление', () => {
    for (const idle of [
      'Досмотреть сериал до конца',
      'Полистать ленту перед сном',
      'Позалипать в ютуб',
    ]) {
      const verdict = validateItem(idle);
      expect(verdict.ok, idle).toBe(false);
      expect(verdict.reason, idle).toBe('потребление');
    }
  });

  it('отклоняет удовольствие', () => {
    for (const fun of ['Выпить пива с друзьями', 'Поиграть в приставку вечером']) {
      const verdict = validateItem(fun);
      expect(verdict.ok, fun).toBe(false);
      expect(verdict.reason, fun).toBe('удовольствие');
    }
  });

  it('различает залипание и обучение: смотреть можно, если учишься', () => {
    expect(validateItem('Посмотреть новую серию').ok).toBe(false);
    expect(validateItem('Посмотреть лекцию по статистике и законспектировать').ok).toBe(true);
    expect(validateItem('Посмотреть разбор партии и записать выводы').ok).toBe(true);
  });

  it('у каждого отказа есть выход, а не упрёк', () => {
    const verdict = validateItem('Полежать весь вечер');
    expect(verdict.ok).toBe(false);
    expect(verdict.hint?.length ?? 0).toBeGreaterThan(0);
  });

  it('ярлык — не действие: «задачу всегда можно разбить на части»', () => {
    expect(validateItem('спорт').reason).toBe('коротко');
    expect(validateItem('  ').reason).toBe('пусто');
  });

  it('не принимает простыню вместо шага', () => {
    expect(validateItem('а'.repeat(200)).reason).toBe('длинно');
  });

  it('нечувствителен к регистру и букве ё', () => {
    expect(validateItem('СЕРИАЛЫ ВЕСЬ ВЕЧЕР').ok).toBe(false);
    expect(validateItem('Полежать на диване').ok).toBe(false);
  });
});

describe('Декларация целиком', () => {
  it('одного действия достаточно', () => {
    expect(validateDeclaration(['Пробежка 5 км']).ok).toBe(true);
  });

  it('пустая Декларация не принимается', () => {
    expect(validateDeclaration(['', '  ']).ok).toBe(false);
    expect(validateDeclaration([]).reason).toBe('пусто');
  });

  it('потолок пунктов защищает от нереалистичных планов', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => `Задача номер ${i + 1} на завтра`);
    const verdict = validateDeclaration(many);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('много');
  });

  it('один запрещённый пункт роняет всю Декларацию', () => {
    const verdict = validateDeclaration(['Пробежка 5 км в парке', 'Досмотреть сериал']);
    expect(verdict.ok).toBe(false);
    expect(verdict.verdicts[0].ok).toBe(true);
    expect(verdict.verdicts[1].reason).toBe('потребление');
  });
});

describe('Пункты из базы', () => {
  it('мусор отбрасывается, а не роняет экран', () => {
    expect(readItems(null)).toEqual([]);
    expect(readItems([{ text: '' }, 42, null, { done: true }])).toEqual([]);
  });

  it('оболочка читается только из трёх известных', () => {
    const items = readItems([
      { text: 'Пробежка', shell: 'BODY', done: true, doneAt: '2026-08-09T10:00:00.000Z' },
      { text: 'Чтение', shell: 'ДУША' },
    ]);
    expect(items[0].shell).toBe('BODY');
    expect(items[0].done).toBe(true);
    expect(items[1].shell).toBeNull();
    expect(items[1].done).toBe(false);
  });
});

describe('Локальные даты Пути', () => {
  it('завтра наступает по часам человека, а не по UTC', () => {
    // 23:40 в Киеве — по UTC ещё 20:40 того же дня, но декларируется
    // послезавтрашняя по UTC дата.
    const late = new Date('2026-08-09T20:40:00Z');
    expect(localDateKey(late, 'Europe/Kyiv')).toBe('2026-08-09');
    expect(tomorrowKey(late, 'Europe/Kyiv')).toBe('2026-08-10');
    expect(localDateKey(late, 'UTC')).toBe('2026-08-09');
  });

  it('сдвиг ключа переживает границу месяца', () => {
    expect(shiftKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-08-09', '2026-08-10')).toBe(1);
    expect(daysBetween('2026-08-10', '2026-08-09')).toBe(-1);
  });
});

function item(text: string, done = false): DeclarationItem {
  return { text, shell: null, done, doneAt: null, actId: null };
}

function day(date: string, sila: number, done: number, total: number): TrailDay {
  return { date, sila, bol: 100 - sila, declared: total > 0, done, total };
}

describe('Выполнение', () => {
  it('день закрыт, когда выполнено всё задекларированное', () => {
    expect(isFulfilled([item('раз', true), item('два', true)])).toBe(true);
    expect(isFulfilled([item('раз', true), item('два')])).toBe(false);
    expect(isFulfilled([])).toBe(false);
  });

  it('прогресс считает выполненное', () => {
    expect(progressOf([item('раз', true), item('два')])).toEqual({ done: 1, total: 2 });
  });
});

describe('Свиток недели', () => {
  const trail: TrailDay[] = [
    day('2026-08-03', 30, 2, 2),
    day('2026-08-04', 34, 1, 2),
    day('2026-08-05', 36, 3, 3),
    day('2026-08-06', 0, 0, 0),
    day('2026-08-07', 40, 2, 2),
    day('2026-08-08', 42, 2, 2),
    day('2026-08-09', 45, 1, 2),
  ];

  it('сворачивает семь дней в один взгляд назад', () => {
    const week = weekScroll(trail);
    expect(week).not.toBeNull();
    expect(week?.declaredDays).toBe(6);
    expect(week?.fulfilledDays).toBe(4);
    expect(week?.doneItems).toBe(11);
    expect(week?.totalItems).toBe(13);
  });

  it('сравнивает только с собой: начало недели против конца', () => {
    const week = weekScroll(trail);
    expect(week?.silaFrom).toBe(30);
    expect(week?.silaTo).toBe(45);
  });

  it('дни без записи не занижают среднюю Силу', () => {
    const week = weekScroll(trail);
    // Шесть дней с записью: (30+34+36+40+42+45)/6 = 37.8
    expect(week?.avgSila).toBeCloseTo(37.8, 1);
  });

  it('пустого Следа не бывает молча', () => {
    expect(weekScroll([])).toBeNull();
  });
});

describe('Цепь выполненных дней', () => {
  it('считает подряд идущие закрытые дни', () => {
    const trail = [
      day('2026-08-06', 40, 0, 2),
      day('2026-08-07', 40, 2, 2),
      day('2026-08-08', 42, 2, 2),
      day('2026-08-09', 45, 2, 2),
    ];
    expect(streakOf(trail, '2026-08-09')).toBe(3);
  });

  it('сегодняшний незакрытый день цепь не рвёт — он ещё идёт', () => {
    const trail = [
      day('2026-08-07', 40, 2, 2),
      day('2026-08-08', 42, 2, 2),
      day('2026-08-09', 45, 0, 2),
    ];
    expect(streakOf(trail, '2026-08-09')).toBe(2);
  });

  it('пропущенный день обрывает цепь, но ничего не отнимает', () => {
    const trail = [
      day('2026-08-07', 40, 2, 2),
      day('2026-08-08', 42, 0, 0),
      day('2026-08-09', 45, 2, 2),
    ];
    expect(streakOf(trail, '2026-08-09')).toBe(1);
  });
});
