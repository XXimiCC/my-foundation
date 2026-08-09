/**
 * Сквозная проверка Завета ПОСТ.
 * Запуск: npm run check:post -- <url>
 *
 * Проверяется доктрина: окно еды не длиннее восьми часов, Месяц Искупления
 * начинается только в декабре, соблюдённый день поднимает Дух один раз в
 * сутки, а СОРВАННЫЙ день не отнимает ничего и записывается как опыт.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000008;

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
    user: JSON.stringify({ id: TEST_ID, first_name: 'Пост', username: 'post' }),
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

  const get = () => fetch(`${base}/api/post`, { headers: auth });
  const post = (body: unknown) =>
    fetch(`${base}/api/post`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  const patch = (body: unknown) =>
    fetch(`${base}/api/post`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });
  const spirit = async () =>
    (await (await fetch(`${base}/api/akt`, { headers: auth })).json()).levels.SPIRIT as number;

  check('Пост до Оснащения закрыт', (await get()).status === 403);

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

  // ── Ничего не идёт ──
  const idle = await (await get()).json();
  check('поста нет', idle.active === null);
  check('ближайший День Очищения назван', typeof idle.nextCleansing === 'string', idle.nextCleansing);
  check(
    'известна фаза Месяца Искупления',
    ['далеко', 'подготовка', 'идёт', 'итоги'].includes(idle.redemption.phase),
    idle.redemption.phase,
  );

  check('отметить день без поста нельзя', (await patch({ foodOk: false })).status === 404);
  check('вид поста обязателен', (await post({})).status === 400);
  check(
    'окно еды длиннее восьми часов не принимается',
    (await post({ kind: 'CLEANSING_DAY', eatFrom: 480, eatTo: 1200 })).status === 400,
  );

  const inDecember = idle.redemption.phase === 'идёт' || idle.redemption.phase === 'итоги';
  const month = await post({ kind: 'REDEMPTION_MONTH' });
  check(
    inDecember
      ? 'в декабре Месяц Искупления начинается'
      : 'вне декабря Месяц Искупления не начать',
    inDecember ? month.ok : month.status === 400,
    `${month.status}`,
  );
  if (month.ok) {
    await patch({ finish: true });
  }

  // ── День Очищения ──
  const started = await (await post({ kind: 'CLEANSING_DAY' })).json();
  check('День Очищения начался', started.active?.kind === 'CLEANSING_DAY');
  check('он длится один день', started.active?.progress.total === 1, `${started.active?.progress.total}`);
  check(
    'окно еды по умолчанию с 11 до 19',
    started.active?.eat.from === 660 && started.active?.eat.to === 1140,
  );
  check(
    'окно знает, открыто оно сейчас или нет',
    typeof started.active?.eat.open === 'boolean',
    `открыто: ${started.active?.eat.open}`,
  );

  check('второй пост поверх первого не начать', (await post({ kind: 'CLEANSING_DAY' })).status === 409);

  // ── Соблюдение ──
  const before = await spirit();
  const kept = await (await patch({ foodOk: true, infoOk: true, note: 'ел кашу' })).json();
  check('день отмечен соблюдённым', kept.active.today.foodOk && kept.active.today.infoOk);
  check('заметка сохранена', kept.active.today.note === 'ел кашу');
  check('соблюдённый день поднял Дух', kept.counted === true && (await spirit()) > before);

  const afterAct = await spirit();
  const again = await (await patch({ foodOk: true, infoOk: true })).json();
  check('повторная отметка второго акта не даёт', again.counted === false);
  check('уровень не изменился', (await spirit()) === afterAct);

  // ── Срыв ──
  const broken = await (
    await patch({ foodOk: false, cause: 'EMOTIONS', note: 'съел булочку' })
  ).json();
  check('нарушение записано', broken.active.today.foodOk === false);
  check('срыв зафиксирован как опыт', broken.lapse === true);
  check(
    'но уровень за срыв не отнят — наказаний нет',
    (await spirit()) === afterAct,
    `${afterAct} → ${await spirit()}`,
  );
  check(
    'день перестал считаться соблюдённым',
    broken.active.progress.kept === 0,
    `${broken.active.progress.kept}`,
  );

  const lapses = await prisma.lapse.count({ where: { user: { telegramId: BigInt(TEST_ID) } } });
  check('срыв лежит в базе с причиной', lapses === 1, `${lapses}`);

  // ── Завершение ──
  const finished = await (await patch({ finish: true })).json();
  check('пост завершается досрочно без наказания', finished.active === null);

  /**
   * Месяц Искупления вне декабря через API не начать — и правильно. Но его ход
   * проверить надо сейчас, а не в декабре, поэтому период досевается прямо в
   * базу: восемь дней назад, ещё двадцать три впереди. Восьмой день — как раз
   * дневниковый по отчёту за 2024.
   */
  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: BigInt(TEST_ID) },
    select: { id: true },
  });
  const DAY = 86_400_000;
  await prisma.fastPeriod.create({
    data: {
      userId: user.id,
      kind: 'REDEMPTION_MONTH',
      status: 'ACTIVE',
      startAt: new Date(Date.now() - 7 * DAY),
      endAt: new Date(Date.now() + 24 * DAY),
    },
  });

  const month2 = await (await get()).json();
  check('Месяц Искупления идёт', month2.active?.kind === 'REDEMPTION_MONTH');
  check('он длится тридцать один день', month2.active?.progress.total === 31, `${month2.active?.progress.total}`);
  check('сегодня восьмой день', month2.active?.progress.day === 8, `${month2.active?.progress.day}`);
  check('восьмой день — дневниковый', month2.active?.journalDay === true);

  const withSummary = await (
    await patch({ summary: 'Настроение стало более стабильным' })
  ).json();
  check('итоги сохраняются', withSummary.active?.summary?.startsWith('Настроение'));

  await patch({ finish: true });
  check('после завершения можно начать снова', (await post({ kind: 'CLEANSING_DAY' })).ok);

  check('без входа Пост не отдаётся', (await fetch(`${base}/api/post`)).status === 401);

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
