import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/config';
import { prisma } from '@/lib/db';
import { answerCallback, editMessage, sendMessage } from '@/lib/bot/api';
import { welcome } from '@/lib/bot/messages';
import { touchRollup } from '@/lib/core/rollup';
import { SHELLS, SHELL_LABEL, type Shell } from '@/lib/core/shells';
import {
  BLESSING_KINDS,
  loadState,
  recordAct,
  recordBlessing,
  type BlessingKind,
} from '@/lib/core/state';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Вебхук бота.
 *
 * Бот — основная точка входа: утренние и ночные ритуалы закрываются одним
 * касанием прямо в чате, без открытия приложения. Всё, что требует экрана,
 * уходит в Mini App кнопкой.
 *
 * Ответ всегда 200, даже на внутренней ошибке: Telegram повторяет доставку при
 * любом другом коде, и одна кривая запись превратилась бы в шторм повторов.
 */

interface Update {
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number };
    reply_to_message?: { message_id: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
  };
}

/** Просьба Разума приходит реплаем — по ней узнают тезис своими словами. */
const MIND_PROMPT = 'Что вы сегодня узнали';

function authorized(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return request.headers.get('x-telegram-bot-api-secret-token') === expected;
}

async function findUser(telegramId: number) {
  return prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    select: { id: true, tz: true, oathAt: true },
  });
}

/** До Оснащения Заветы закрыты — и в чате тоже. */
function locked(chatId: number) {
  return sendMessage(
    chatId,
    'Заветы открываются после Оснащения: десять Основ принимаются по одной.',
    [[{ text: 'Оснащение', web_app: { url: `${appUrl()}/osnashenie` } }]],
  );
}

/**
 * След обработки: что бот попытался сделать и чем это кончилось.
 *
 * Telegram тело ответа игнорирует, а вот увидеть причину молчания больше
 * негде: логи serverless-функции доступны не всегда, а сбой исходящего вызова
 * снаружи выглядит точно как успех. Читать след может только тот, у кого есть
 * секрет вебхука.
 */
const trace: string[] = [];

function note(step: string, result?: { ok: boolean; description?: string }) {
  if (!result) trace.push(step);
  else trace.push(`${step}: ${result.ok ? 'ок' : (result.description ?? 'отказ')}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'нет доступа' }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as Update;
  trace.length = 0;

  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
    else note('обновление без сообщения и без нажатия');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('бот:', e);
    note(`сбой: ${message}`);
  }

  // Всегда 200: на любом другом коде Telegram устраивает шторм повторов.
  return NextResponse.json({ ok: true, trace: [...trace] });
}

async function onMessage(message: NonNullable<Update['message']>) {
  const telegramId = message.from?.id;
  const text = message.text?.trim();
  if (!telegramId || !text) return;

  const user = await findUser(telegramId);

  if (text.startsWith('/start')) {
    const { text: body, keyboard } = welcome(appUrl(), Boolean(user?.oathAt));
    note('приветствие', await sendMessage(message.chat.id, body, keyboard));
    return;
  }

  if (!user) return;
  if (!user.oathAt) {
    await locked(message.chat.id);
    return;
  }

  /**
   * Ответ на просьбу Разума: «тезисное воспроизводство своими словами».
   * Именно воспроизводство, а не отметка — поэтому текст сохраняется в акт.
   */
  if (message.reply_to_message) {
    const now = new Date();
    await recordAct(prisma, user.id, 'MIND', { note: text }, now);
    const state = await loadState(prisma, user.id, user.tz, now);
    await touchRollup(prisma, user.id, user.tz, now, state);

    await sendMessage(
      message.chat.id,
      `Акт Разума записан. Разум — ${state.levels.MIND.toFixed(0)}, Сила — ${state.sila.toFixed(0)}.`,
    );
    return;
  }
}

async function onCallback(query: NonNullable<Update['callback_query']>) {
  const [action, argument] = (query.data ?? '').split(':');
  const user = await findUser(query.from.id);

  if (!user || !user.oathAt) {
    await answerCallback(query.id, 'Сначала Оснащение');
    if (query.message) await locked(query.message.chat.id);
    return;
  }

  const now = new Date();

  if (action === 'blago' && BLESSING_KINDS.includes(argument as BlessingKind)) {
    const { counted } = await recordBlessing(
      prisma,
      user.id,
      argument as BlessingKind,
      user.tz,
      now,
    );
    const state = await loadState(prisma, user.id, user.tz, now);
    await touchRollup(prisma, user.id, user.tz, now, state);

    await answerCallback(query.id, counted ? 'Дух вырос' : 'Записано');
    if (query.message) {
      await editMessage(
        query.message.chat.id,
        query.message.message_id,
        `Благодарение принято. Дух — ${state.levels.SPIRIT.toFixed(0)}, Сила — ${state.sila.toFixed(0)}.\n\n` +
          (counted
            ? 'Новый вид Блага за сутки — уровень поднялся.'
            : 'Это Благо сегодня уже было: уровень поднимает разнообразие, а не частота.'),
      );
    }
    return;
  }

  if (action === 'akt' && SHELLS.includes(argument as Shell)) {
    const shell = argument as Shell;
    await recordAct(prisma, user.id, shell, {}, now);
    const state = await loadState(prisma, user.id, user.tz, now);
    await touchRollup(prisma, user.id, user.tz, now, state);

    await answerCallback(query.id, 'Акт записан');
    if (query.message) {
      await editMessage(
        query.message.chat.id,
        query.message.message_id,
        `Акт применения записан: ${SHELL_LABEL[shell]} — ${state.levels[shell].toFixed(0)}, ` +
          `Сила — ${state.sila.toFixed(0)}.\n\n${MIND_PROMPT}? Ответьте на это сообщение своими словами.`,
      );
    }
    return;
  }

  await answerCallback(query.id);
}
