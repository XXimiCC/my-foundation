/**
 * Сквозная проверка входа и Оснащения.
 * Запуск: npm run check:osnashenie -- <url>
 *
 * Подписывает initData настоящим токеном бота из окружения и проходит ритуал
 * целиком: вход, приём десяти Основ по порядку, завершение. Проверяет и то,
 * что нарушить порядок нельзя, и что повторное завершение отвергается.
 *
 * Тестовый человек удаляется в конце — база остаётся чистой.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();

// Заведомо служебный идентификатор: с настоящим Telegram ID не столкнётся.
const TEST_ID = 990000000001;

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
    user: JSON.stringify({ id: TEST_ID, first_name: 'Проверка', username: 'probe' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  // ── Вход ──
  const bad = await fetch(`${base}/api/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'miniapp', initData: initData.replace(/hash=\w/, 'hash=0') }),
  });
  check('подделанная подпись отвергается', bad.status === 401);

  const login = await fetch(`${base}/api/auth/telegram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'miniapp', initData }),
  });
  const session = await login.json();
  check(
    'вход по подлинной initData',
    login.ok && Boolean(session.accessToken),
    login.ok ? '' : `${login.status} ${JSON.stringify(session)}`,
  );

  if (!login.ok) {
    console.log(
      '\n  Подсказка: подпись собирается токеном из локального окружения.\n' +
        '  Против прода она и должна отвергаться — там другой бот.\n' +
        '  Проверять сквозной ритуал на проде нужно токеном боевого бота.\n',
    );
    await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
    return;
  }
  check('новый человек — Неофит', session.user?.rank === 'NEOPHYTE');

  const auth = { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' };

  const shells = await prisma.shellState.count({
    where: { user: { telegramId: BigInt(TEST_ID) } },
  });
  check('три оболочки заведены при входе', shells === 3, `создано ${shells}`);

  // ── Порядок Основ ──
  const skip = await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ foundationNo: 5 }),
  });
  check('перескочить через Основу нельзя', skip.status === 409);

  const early = await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ finish: true }),
  });
  check('завершить до принятия всех нельзя', early.status === 409);

  // ── Приём десяти Основ ──
  let lastCount = 0;
  for (let no = 1; no <= 10; no += 1) {
    const res = await fetch(`${base}/api/osnashenie`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ foundationNo: no }),
    });
    const data = await res.json();
    if (!res.ok) {
      check(`Основа ${no} принята`, false, JSON.stringify(data));
      break;
    }
    lastCount = data.accepted;
  }
  check('все десять Основ приняты по порядку', lastCount === 10);

  const twice = await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ foundationNo: 10 }),
  });
  check('повторный приём той же Основы отвергается', twice.status === 409);

  // ── Завершение ──
  const done = await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ finish: true }),
  });
  const doneData = await done.json();
  check('ритуал завершён', done.ok && doneData.rank === 'PREDTECHA');

  const again = await fetch(`${base}/api/osnashenie`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ finish: true }),
  });
  check('пройти Оснащение дважды нельзя', again.status === 409);

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(TEST_ID) },
    select: { rank: true, oathAt: true, _count: { select: { oath: true } } },
  });
  check('в базе ранг Предтеча', user?.rank === 'PREDTECHA');
  check('дата Оснащения проставлена', Boolean(user?.oathAt));
  check('принятие каждой Основы записано отдельно', user?._count.oath === 10);

  const noAuth = await fetch(`${base}/api/osnashenie`);
  check('без входа состояние не отдаётся', noAuth.status === 401);

  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
  const left = await prisma.user.count({ where: { telegramId: BigInt(TEST_ID) } });
  check('тестовый человек удалён', left === 0);

  console.log(`\n  Пройдено ${passed}, провалено ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
