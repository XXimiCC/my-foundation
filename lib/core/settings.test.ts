import { describe, expect, it } from 'vitest';
import {
  isValidZone,
  preview,
  toClock,
  toMinutes,
  validateSettings,
  type EditableSettings,
} from './settings';

const BASE: EditableSettings = {
  morningAt: 420,
  mindAt: 780,
  eveningAt: 1260,
  nightAt: 1350,
  quietFrom: 1380,
  quietTo: 390,
  fastWeekdays: [1, 5],
  intensity: 1,
  tz: 'Europe/Kyiv',
};

describe('Время туда и обратно', () => {
  it('разбирает часы и минуты', () => {
    expect(toMinutes('07:00')).toBe(420);
    expect(toMinutes('22:30')).toBe(1350);
    expect(toMinutes('00:00')).toBe(0);
  });

  it('не принимает несуществующее время', () => {
    expect(toMinutes('24:00')).toBeNull();
    expect(toMinutes('07:60')).toBeNull();
    expect(toMinutes('утро')).toBeNull();
    expect(toMinutes('')).toBeNull();
  });

  it('собирает обратно', () => {
    expect(toClock(420)).toBe('07:00');
    expect(toClock(0)).toBe('00:00');
    expect(toClock(1439)).toBe('23:59');
  });

  it('переживает круг: минуты → часы → минуты', () => {
    for (const m of [0, 1, 420, 780, 1260, 1439]) {
      expect(toMinutes(toClock(m))).toBe(m);
    }
  });
});

describe('Проверка настроек', () => {
  it('нормальные настройки проходят', () => {
    expect(validateSettings(BASE)).toEqual([]);
  });

  it('окно в тихих часах отклоняется: иначе ритуал не придёт ни разу', () => {
    const trap = { ...BASE, eveningAt: 1410 }; // 23:30 при тишине с 23:00
    const problems = validateSettings(trap);
    expect(problems).toHaveLength(1);
    expect(problems[0].field).toBe('eveningAt');
    expect(problems[0].message).toMatch(/не придёт/);
  });

  it('ловит окно и по другую сторону полуночи', () => {
    const trap = { ...BASE, morningAt: 300 }; // 05:00, тишина до 06:30
    expect(validateSettings(trap)[0].field).toBe('morningAt');
  });

  it('время вне суток отклоняется', () => {
    expect(validateSettings({ ...BASE, mindAt: 1440 })[0].field).toBe('mindAt');
    expect(validateSettings({ ...BASE, nightAt: -1 })[0].field).toBe('nightAt');
  });

  it('сообщает обо всех проблемах разом, а не о первой', () => {
    const broken = { ...BASE, intensity: 7, tz: 'Луна/Море_Спокойствия' };
    const fields = validateSettings(broken).map((p) => p.field);
    expect(fields).toContain('intensity');
    expect(fields).toContain('tz');
  });

  it('дни Очищения — от понедельника до воскресенья', () => {
    expect(validateSettings({ ...BASE, fastWeekdays: [1, 7] })).toEqual([]);
    expect(validateSettings({ ...BASE, fastWeekdays: [0] })[0].field).toBe('fastWeekdays');
    expect(validateSettings({ ...BASE, fastWeekdays: [8] })[0].field).toBe('fastWeekdays');
  });

  it('пустой список дней допустим: пост желателен, но не обязателен', () => {
    expect(validateSettings({ ...BASE, fastWeekdays: [] })).toEqual([]);
  });

  it('часовой пояс проверяется по-настоящему', () => {
    expect(isValidZone('Europe/Kyiv')).toBe(true);
    expect(isValidZone('Asia/Kolkata')).toBe(true);
    expect(isValidZone('Средиземье/Шир')).toBe(false);
  });
});

describe('Предпросмотр дня', () => {
  it('на минимуме остаётся только вечер', () => {
    const list = preview({ ...BASE, intensity: 0 });
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe('21:00');
  });

  it('на норме — три окна по возрастанию времени', () => {
    const list = preview(BASE);
    expect(list.map((l) => l.at)).toEqual(['07:00', '21:00', '22:30']);
  });

  it('на полной добавляется день', () => {
    expect(preview({ ...BASE, intensity: 2 }).map((l) => l.at)).toEqual([
      '07:00',
      '13:00',
      '21:00',
      '22:30',
    ]);
  });
});
