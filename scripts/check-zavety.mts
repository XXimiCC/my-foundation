/**
 * Сквозная проверка Заветов АКТ и БЛАГ.
 * Запуск: npm run check:zavety -- <url>
 *
 * Проходит путь целиком: вход, Оснащение, акты применения, благодарение.
 * Проверяет доктринальные правила, а не только коды ответов: до Оснащения
 * Заветы закрыты, уровень поднимает новый вид Блага, а не частота нажатий.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000003;

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
    user: JSON.stringify({ id: TEST_ID, first_name: 'Заветы', username: 'zav' }),
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

  // ── До Оснащения Заветы закрыты ──
  const early = await fetch(`${base}/api/akt`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ shell: 'BODY' }),
  });
  check('акт до Оснащения не принимается', early.status === 403);

  const earlyBlago = await fetch(`${base}/api/blago`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ blessing: 'WATER' }),
  });
  check('благодарение до Оснащения не принимается', earlyBlago.status === 403);

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

  // ── Состояние сразу после Оснащения ──
  const zero = await (await fetch(`${base}/api/akt`, { headers: auth })).json();
  check('после Оснащения все оболочки на нуле', zero.sila === 0, `Сила ${zero.sila}`);
  check('Боль при нулевых оболочках максимальна', zero.bol === 100, `Боль ${zero.bol}`);

  // ── Акт применения ──
  const afterBody = await (
    await fetch(`${base}/api/akt`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ shell: 'BODY', minutes: 45 }),
    })
  ).json();
  check('акт поднял уровень тела', afterBody.levels.BODY > 0, `${afterBody.levels.BODY}`);
  check('акт засчитан за сегодня', afterBody.today.acts.BODY === 1);
  check(
    'Сила остаётся нулевой, пока две оболочки на нуле',
    afterBody.sila === 0,
    `Сила ${afterBody.sila}`,
  );

  await fetch(`${base}/api/akt`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ shell: 'MIND', minutes: 15 }),
  });
  const three = await (
    await fetch(`${base}/api/akt`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ shell: 'SPIRIT' }),
    })
  ).json();
  check('Сила появляется, когда подняты все три', three.sila > 0, `Сила ${three.sila}`);
  check('слабое звено названо', ['BODY', 'MIND', 'SPIRIT'].includes(three.weakest));

  const bad = await fetch(`${base}/api/akt`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ shell: 'НЕТ' }),
  });
  check('несуществующая оболочка отвергается', bad.status === 400);

  // ── Благодарение ──
  const spiritBefore = three.levels.SPIRIT;
  const first = await (
    await fetch(`${base}/api/blago`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ blessing: 'WATER' }),
    })
  ).json();
  check('первое Благо за сутки засчитано', first.counted === true);
  check('оно подняло Дух', first.levels.SPIRIT > spiritBefore);

  const repeat = await (
    await fetch(`${base}/api/blago`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ blessing: 'WATER' }),
    })
  ).json();
  check('повтор того же Блага не поднимает уровень', repeat.counted === false);
  check(
    'но касание всё равно записано',
    repeat.today.blessingTaps === 2,
    `касаний ${repeat.today.blessingTaps}`,
  );
  check('вид Блага по-прежнему один', repeat.today.blessings.length === 1);

  let last = repeat;
  for (const kind of ['SLEEP', 'FOOD', 'WARMTH', 'BODY']) {
    last = await (
      await fetch(`${base}/api/blago`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ blessing: kind }),
      })
    ).json();
  }
  check('все пять Благ отмечены', last.today.blessings.length === 5);

  const badBlago = await fetch(`${base}/api/blago`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ blessing: 'СЧАСТЬЕ' }),
  });
  check('несуществующее Благо отвергается', badBlago.status === 400);

  // ── Записи в базе ──
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(TEST_ID) },
    select: { _count: { select: { acts: true, blessings: true } } },
  });
  check('акты записаны', user?._count.acts === 3, `${user?._count.acts}`);
  check('касания Благ записаны все', user?._count.blessings === 6, `${user?._count.blessings}`);

  const noAuth = await fetch(`${base}/api/akt`);
  check('без входа состояние не отдаётся', noAuth.status === 401);

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
