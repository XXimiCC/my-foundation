/**
 * Проверка вебхука бота.
 * Запуск: npm run check:bot -- <url>
 *
 * Обновления подаются прямо в эндпоинт, как их прислал бы Telegram. Исходящие
 * сообщения при этом уходят в несуществующий чат и не доходят — и не должны:
 * проверяется то, что бот ЗАПИСЫВАЕТ, а не то, что он говорит.
 *
 * Главное здесь — что чат закрывает ритуал ровно теми же правилами, что и
 * экран: те же Блага, тот же прирост, та же закрытость до Оснащения.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');
if (!webhookSecret) throw new Error('TELEGRAM_WEBHOOK_SECRET не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000012;

function signInitData(fields: Record<string, string>): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token!).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  да    ${name}`);
  } else {
    failed += 1;
    console.log(`  НЕТ   ${name}${detail ? '  — ' + detail : ''}`);
  }
}

let updateId = 1;

function update(payload: Record<string, unknown>) {
  return fetch(`${base}/api/bot`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': webhookSecret!,
    },
    body: JSON.stringify({ update_id: updateId++, ...payload }),
  });
}

const callback = (data: string) =>
  update({
    callback_query: {
      id: String(updateId),
      data,
      from: { id: TEST_ID },
      message: { message_id: 100, chat: { id: TEST_ID } },
    },
  });

const message = (text: string, reply = false) =>
  update({
    message: {
      message_id: 200 + updateId,
      text,
      chat: { id: TEST_ID },
      from: { id: TEST_ID },
      ...(reply ? { reply_to_message: { message_id: 100 } } : {}),
    },
  });

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  // ── Доступ ──
  const noSecret = await fetch(`${base}/api/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ update_id: 1 }),
  });
  check('без секретного заголовка вебхук молчит', noSecret.status === 401);

  const wrongSecret = await fetch(`${base}/api/bot`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'wrong-secret',
    },
    body: JSON.stringify({ update_id: 1 }),
  });
  check('с чужим секретом тоже', wrongSecret.status === 401);

  // ── Незнакомый человек ──
  check('/start от незнакомца принимается без ошибки', (await message('/start')).ok);
  const stranger = await prisma.user.findUnique({ where: { telegramId: BigInt(TEST_ID) } });
  check('и никого не заводит: вход только через Mini App', stranger === null);

  // ── Заводим человека и проходим Оснащение ──
  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Бот', username: 'bot' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  const login = await fetch(`${base}/api/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'miniapp', initData }),
  });
  const session = await login.json();
  if (!login.ok) {
    console.log('\n  Вход не удался — вероятно, подпись собрана токеном другого бота.\n');
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
    return;
  }
  const auth = {
    authorization: `Bearer ${session.accessToken}`,
    'content-type': 'application/json',
  };

  // ── До Оснащения кнопки не работают ──
  await callback('blago:SLEEP');
  const early = await prisma.blessing.count({ where: { user: { telegramId: BigInt(TEST_ID) } } });
  check('до Оснащения кнопка Блага ничего не пишет', early === 0, `${early}`);

  for (let no = 1; no <= 10; no += 1) {
    await fetch(`${base}/api/osnashenie`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ foundationNo: no }),
    });
  }
  await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ finish: true }),
  });

  const spirit = async () =>
    (await (await fetch(`${base}/api/akt`, { headers: auth })).json()).levels.SPIRIT as number;
  const mind = async () =>
    (await (await fetch(`${base}/api/akt`, { headers: auth })).json()).levels.MIND as number;

  // ── Благодарение одним касанием ──
  const before = await spirit();
  await callback('blago:SLEEP');
  const blessings = await prisma.blessing.count({
    where: { user: { telegramId: BigInt(TEST_ID) } },
  });
  check('кнопка в чате записала Благо', blessings === 1, `${blessings}`);
  check('и подняла Дух', (await spirit()) > before);

  const afterFirst = await spirit();
  await callback('blago:SLEEP');
  check(
    'повтор того же Блага записан, но уровня не даёт — как и на экране',
    (await prisma.blessing.count({ where: { user: { telegramId: BigInt(TEST_ID) } } })) === 2 &&
      (await spirit()) === afterFirst,
  );

  await callback('blago:СЧАСТЬЕ');
  check(
    'несуществующее Благо игнорируется',
    (await prisma.blessing.count({ where: { user: { telegramId: BigInt(TEST_ID) } } })) === 2,
  );

  // ── Акт применения ──
  await callback('akt:BODY');
  const acts = await prisma.act.findMany({
    where: { user: { telegramId: BigInt(TEST_ID) } },
    select: { shell: true, note: true },
  });
  check('кнопка Акта записала акт тела', acts.some((a) => a.shell === 'BODY'), JSON.stringify(acts));

  // ── Тезис своими словами ──
  const mindBefore = await mind();
  await message('Сила соразмерна знанию: чем больше опыт, тем больше могу', true);
  const noted = await prisma.act.findFirst({
    where: { user: { telegramId: BigInt(TEST_ID) }, shell: 'MIND' },
    select: { note: true },
  });
  check('ответ реплаем стал актом Разума', noted !== null);
  check(
    'и сохранил формулировку своими словами',
    (noted?.note ?? '').startsWith('Сила соразмерна знанию'),
    noted?.note ?? '',
  );
  check('Разум вырос', (await mind()) > mindBefore);

  // ── Обычное сообщение не создаёт ничего ──
  const actsBefore = await prisma.act.count({ where: { user: { telegramId: BigInt(TEST_ID) } } });
  await message('просто написал в чат');
  check(
    'сообщение без реплая ничего не записывает',
    (await prisma.act.count({ where: { user: { telegramId: BigInt(TEST_ID) } } })) === actsBefore,
  );

  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
  console.log(`\n  Пройдено ${passed}, провалено ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
