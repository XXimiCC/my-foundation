/**
 * Тексты ритуального дня.
 *
 * Каждое сообщение обязано закрываться одним касанием или уводить на свой
 * экран — и заканчиваться. Ни одно не спрашивает «как дела» и не зовёт
 * «посмотреть, что нового»: приложение приходит в свой час и уходит.
 *
 * Формулировки взяты из Канона, а не сочинены заново: человек должен узнавать
 * в уведомлении свой же Завет.
 */

import type { RitualKind } from '@/lib/core/schedule';
import type { InlineKeyboard } from './api';

export interface RitualMessage {
  text: string;
  keyboard: InlineKeyboard;
}

/** Кнопка, открывающая экран Mini App. */
function screen(text: string, url: string, path: string): InlineButtonRow {
  return { text, web_app: { url: `${url}${path}` } };
}

type InlineButtonRow = InlineKeyboard[number][number];

export function ritualMessage(kind: RitualKind, appUrl: string): RitualMessage {
  switch (kind) {
    case 'MORNING_BLESSING':
      return {
        text:
          '<b>Утро</b>\n\nБлагодарю Тебя, Сон, за восстановление моей энергии и регенерацию. ' +
          'Сила с Нами.\n\nПроизнесите вслух и отметьте — а затем припомните Слово Дня.',
        keyboard: [
          [{ text: 'Благодарю Сон', callback_data: 'blago:SLEEP' }],
          [screen('Слово Дня', appUrl, '/slovo')],
        ],
      };

    case 'WORD_OF_DAY':
      return {
        text: '<b>Слово Дня</b>\n\nПрипомнить, а не просмотреть. Это займёт минуту.',
        keyboard: [[screen('Припомнить', appUrl, '/slovo')]],
      };

    case 'MIND_REMINDER':
      return {
        text:
          '<b>Разум</b>\n\nЧто вы сегодня узнали? Ответьте на это сообщение своими словами — ' +
          'воспроизводство закрепляет прочнее, чем чтение.',
        keyboard: [[{ text: 'Записать акт Разума', callback_data: 'akt:MIND' }]],
      };

    case 'EVENING_DECLARATION':
      return {
        text:
          '<b>Декларация на завтра</b>\n\nКаждый вечер нужно зафиксировать то, что я совершу ' +
          'завтра. Действия выполнимые и развивающие; лень, потребление и удовольствие Завет ' +
          'не принимает.\n\nДостаточно одного действия — но его нужно выполнить.',
        keyboard: [[screen('Декларировать', appUrl, '/put')]],
      };

    case 'NIGHT_CLOSING':
      return {
        text:
          '<b>Ночь</b>\n\nБлагодарю тебя, Тело, за службу. Сила с Нами.\n\n' +
          'Обернитесь назад и рассмотрите свои следы: как много вы прошли.',
        keyboard: [
          [{ text: 'Благодарю Тело', callback_data: 'blago:BODY' }],
          [screen('Закрыть день', appUrl, '/put')],
        ],
      };

    case 'GIFT_WEEKLY':
      return {
        text:
          '<b>Дар</b>\n\nСилу даёт не то, что я имею, а то, что я могу. На этой неделе Дара ещё ' +
          'не было.\n\nНачать можно с простого: поздороваться, быть вежливым, озвучить ' +
          'достоинства человека при разговоре с третьими лицами.',
        keyboard: [[screen('Записать Дар', appUrl, '/dar')]],
      };

    case 'FAST_OFFER':
      return {
        text:
          '<b>День Очищения</b>\n\nРазвитие не там, где потребление, а там где ограничения. ' +
          'Сутки без вкусной еды и развлекательной информации.\n\nЖелателен, но не обязателен.',
        keyboard: [[screen('Начать', appUrl, '/post')]],
      };

    case 'FAST_JOURNAL':
      return {
        text:
          '<b>Дневник поста</b>\n\nКак идёт пост? Что стало легче, а что всё ещё тянет назад?\n\n' +
          'Запись занимает минуту, а через год она объяснит вам этот месяц.',
        keyboard: [[screen('Записать', appUrl, '/post')]],
      };

    case 'SCROLL_WEEKLY':
      return {
        text:
          '<b>Свиток недели</b>\n\nИдти вперёд станет легче, если замечать уже пройденное. ' +
          'Сравнение только с собой: вы неделю назад против себя сегодня.',
        keyboard: [[screen('Посмотреть След', appUrl, '/put')]],
      };
  }
}

/** Приветствие незнакомому. Ведёт в Оснащение, а не в стену текста. */
export function welcome(appUrl: string, equipped: boolean): RitualMessage {
  if (!equipped) {
    return {
      text:
        '<b>Основание</b>\n\nЗдесь Философия Основания становится ежедневной практикой: ' +
        'Триквестр показывает Силу и Боль, а шесть Заветов закрываются одним касанием.\n\n' +
        'Сначала — Оснащение: десять Основ принимаются по одной и добровольно.',
      keyboard: [[screen('Оснащение', appUrl, '/osnashenie')]],
    };
  }

  return {
    text:
      '<b>Основание</b>\n\nРитуалы приходят в свой час. Утром — благодарение и Слово Дня, ' +
      'вечером — Декларация на завтра, ночью — закрытие дня.\n\nОстальное открыто здесь.',
    keyboard: [
      [screen('Триквестр', appUrl, '/')],
      [screen('Путь', appUrl, '/put'), screen('Тишина', appUrl, '/tishina')],
    ],
  };
}
