/**
 * Тонкая обёртка над Bot API.
 *
 * Библиотека здесь не нужна: используется пять методов, а лишняя зависимость в
 * serverless — это лишний холодный старт.
 */

export interface InlineButton {
  text: string;
  /** Действие внутри чата: ритуал закрывается одним касанием. */
  callback_data?: string;
  /** Открыть Mini App — для экранов, которые в чат не помещаются. */
  web_app?: { url: string };
}

export type InlineKeyboard = InlineButton[][];

function token(): string {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error('TELEGRAM_BOT_TOKEN не задан');
  return value;
}

export async function call(
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; description?: string; result?: unknown }> {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({ ok: false, description: 'ответ не разобран' }))) as {
    ok: boolean;
    description?: string;
    result?: unknown;
  };
  return data;
}

export async function sendMessage(
  chatId: bigint | number | string,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return call('sendMessage', {
    chat_id: String(chatId),
    text,
    parse_mode: 'HTML',
    // Ссылки в ритуальных текстах не нужны, а превью превращает сообщение
    // в ленту — ровно то, чего Завет ПОСТ не терпит.
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/** Ответ на нажатие кнопки. Без него кнопка «крутится» у человека в чате. */
export async function answerCallback(id: string, text?: string) {
  return call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
}

/** Правка отправленного сообщения: ритуал закрывается на месте, а не новым. */
export async function editMessage(
  chatId: bigint | number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return call('editMessageText', {
    chat_id: String(chatId),
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

/** Просьба ответить реплаем — так приходит тезис своими словами для Разума. */
export async function askReply(chatId: bigint | number | string, text: string) {
  return call('sendMessage', {
    chat_id: String(chatId),
    text,
    parse_mode: 'HTML',
    reply_markup: { force_reply: true, input_field_placeholder: 'Своими словами' },
  });
}
