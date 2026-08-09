/**
 * Сквозная проверка Заветов ДУХ и ДАР.
 * Запуск: npm run check:duhdar -- <url>
 *
 * Проверяется доктрина, а не коды ответов: стадия выводится из времени,
 * уровень поднимает ежедневная практика и недельная норма, а не число
 * подходов; запланировать Дар нельзя в принципе.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000006;
const MINUTE = 60_000;

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

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Дух', username: 'duh' }),
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

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  const spirit = async () =>
    (await (await fetch(`${base}/api/akt`, { headers: auth })).json()).levels.SPIRIT as number;

  // ── До Оснащения Заветы закрыты ──
  check(
    'Тишина до Оснащения закрыта',
    (await fetch(`${base}/api/tishina`, { headers: auth })).status === 403,
  );
  check('Дар до Оснащения закрыт', (await fetch(`${base}/api/dar`, { headers: auth })).status === 403);

  for (let no = 1; no <= 10; no += 1) {
    await post('/api/osnashenie', { foundationNo: no });
  }
  await post('/api/osnashenie', { finish: true });

  // ── ДУХ ──
  const empty = await (await fetch(`${base}/api/tishina`, { headers: auth })).json();
  check('сегодня тишины ещё не было', empty.today.practiced === false);
  check('записей практики нет', empty.last.length === 0);

  check(
    'короче пяти минут не заказать',
    (await post('/api/tishina', { startedAt: new Date().toISOString(), minutes: 3 })).status === 400,
  );
  check(
    'дольше ста минут не заказать',
    (await post('/api/tishina', { startedAt: new Date().toISOString(), minutes: 120 })).status ===
      400,
  );
  check('без начала практики запись не принимается', (await post('/api/tishina', { minutes: 20 })).status === 400);
  check(
    'начало из будущего не принимается',
    (await post('/api/tishina', { startedAt: new Date(Date.now() + 10 * MINUTE).toISOString(), minutes: 20 }))
      .status === 400,
  );

  const before = await spirit();
  const long = await (
    await post('/api/tishina', {
      startedAt: new Date(Date.now() - 25 * MINUTE).toISOString(),
      minutes: 20,
    })
  ).json();
  check('сверх заказанного не начисляется', long.minutes === 20, `${long.minutes}`);
  check('двадцать минут доводят до Скуки', long.stage === 'BOREDOM', `${long.stage}`);
  check('практика засчитана', long.counted === true);
  check('Дух вырос', (await spirit()) > before, `${before} → ${await spirit()}`);

  const afterFirst = await spirit();
  const second = await (
    await post('/api/tishina', {
      startedAt: new Date(Date.now() - 12 * MINUTE).toISOString(),
      minutes: 10,
    })
  ).json();
  check('вторая практика за сутки записана', second.today.sessions === 2);
  check('но уровень она не поднимает', second.counted === false);
  check(
    'Дух остался прежним — ежедневность, а не число подходов',
    (await spirit()) === afterFirst,
    `${afterFirst} → ${await spirit()}`,
  );

  const short = await (
    await post('/api/tishina', {
      startedAt: new Date(Date.now() - 2 * MINUTE).toISOString(),
      minutes: 10,
    })
  ).json();
  check('двухминутная пауза стадии не имеет', short.stage === null, `${short.stage}`);
  check('и Тишиной не считается', short.counted === false);

  const noted = await (
    await fetch(`${base}/api/tishina`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify({ insights: 'Мысли — объекты в комнате' }),
    })
  ).json();
  check('озарение записано к свежей практике', noted.last[0]?.insights === 'Мысли — объекты в комнате');
  check('записей показано не больше трёх', noted.last.length <= 3, `${noted.last.length}`);
  check('за неделю посчитаны все практики', noted.week.sessions === 3, `${noted.week.sessions}`);

  const silences = await prisma.silence.count({ where: { user: { telegramId: BigInt(TEST_ID) } } });
  check('в базе три практики', silences === 3, `${silences}`);

  // ── ДАР ──
  const darEmpty = await (await fetch(`${base}/api/dar`, { headers: auth })).json();
  check('на этой неделе Даров нет', darEmpty.week.gifts.length === 0);
  check('цепи недель ещё нет', darEmpty.streak === 0);

  check('несуществующий ресурс отвергается', (await post('/api/dar', { resource: 'СЛАВА' })).status === 400);

  const spiritBeforeGift = await spirit();
  const gift = await (
    await post('/api/dar', {
      resource: 'TIME',
      recipient: 'сосед',
      note: 'помог собрать шкаф',
    })
  ).json();
  check('Дар записан', gift.week.gifts.length === 1);
  check('недельная норма закрыта', gift.counted === true);
  check('Дух вырос от Дара', (await spirit()) > spiritBeforeGift);
  check('получатель и заметка сохранены', gift.week.gifts[0].recipient === 'сосед');
  check('цепь недель началась', gift.streak === 1, `${gift.streak}`);

  const spiritAfterGift = await spirit();
  const secondGift = await (await post('/api/dar', { resource: 'RESPECT' })).json();
  check('второй Дар за неделю записан', secondGift.week.gifts.length === 2);
  check('но норму второй раз не закрывает', secondGift.counted === false);
  check(
    'и уровень не поднимает — закон не линеен',
    (await spirit()) === spiritAfterGift,
    `${spiritAfterGift} → ${await spirit()}`,
  );

  const anonymous = await (await post('/api/dar', { resource: 'INFO' })).json();
  check('имя получателя не обязательно', anonymous.week.gifts[0].recipient === null);

  // ── Доктринальные запреты ──
  const plan = await fetch(`${base}/api/dar`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ resource: 'MONEY', planned: true }),
  });
  check('запланировать Дар нельзя — такого метода нет', plan.status === 405, `${plan.status}`);

  const raw = JSON.stringify(anonymous);
  check(
    'в ответе нет ни шеринга, ни публичности',
    !/share|export|public|friend|leader/i.test(raw),
  );

  check('без входа Тишина не отдаётся', (await fetch(`${base}/api/tishina`)).status === 401);
  check('без входа Дар не отдаётся', (await fetch(`${base}/api/dar`)).status === 401);

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
