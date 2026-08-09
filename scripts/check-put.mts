/**
 * Сквозная проверка Завета ПУТЬ.
 * Запуск: npm run check:put -- <url>
 *
 * Проверяет не коды ответов, а доктрину: валидатор отклоняет лень, потребление
 * и удовольствие; сегодняшняя Декларация не переписывается; снятие отметки не
 * отнимает уровень; в ответе нет ни намёка на шеринг.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000004;

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
    user: JSON.stringify({ id: TEST_ID, first_name: 'Путь', username: 'put' }),
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

  const get = () => fetch(`${base}/api/put`, { headers: auth });
  const post = (body: unknown) =>
    fetch(`${base}/api/put`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  const patch = (body: unknown) =>
    fetch(`${base}/api/put`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });

  // ── До Оснащения Завет закрыт ──
  check('Путь до Оснащения не открывается', (await get()).status === 403);

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

  // ── Пустой Путь ──
  const empty = await (await get()).json();
  const today: string = empty.today.date;
  const tomorrow: string = empty.tomorrow.date;
  check('на сегодня Декларации нет', empty.today.exists === false);
  check('на завтра Декларации нет', empty.tomorrow.exists === false);
  check('След длиной в шесть недель', empty.trail.length === 42, `${empty.trail.length}`);
  check('След заканчивается сегодняшним днём', empty.trail.at(-1)?.date === today);
  check('слабое звено названо', ['BODY', 'MIND', 'SPIRIT'].includes(empty.weakest));

  // ── Валидатор: прямой запрет Завета ──
  const lazy = await post({ date: tomorrow, items: [{ text: 'Полежать весь день' }] });
  const lazyBody = await lazy.json();
  check('лень не декларируется', lazy.status === 422, `${lazy.status}`);
  check('и названа по имени', lazyBody.verdicts?.[0]?.reason === 'лень', lazyBody.verdicts?.[0]?.reason);
  check('с подсказкой, а не упрёком', typeof lazyBody.verdicts?.[0]?.hint === 'string');

  const consume = await post({ date: tomorrow, items: [{ text: 'Досмотреть сериал вечером' }] });
  check('потребление не декларируется', consume.status === 422);

  const fun = await post({ date: tomorrow, items: [{ text: 'Выпить пива с друзьями' }] });
  check('удовольствие не декларируется', fun.status === 422);

  const learn = await post({
    date: tomorrow,
    items: [{ text: 'Посмотреть лекцию по статистике и законспектировать' }],
  });
  check('обучение через видео проходит', learn.ok, `${learn.status}`);

  const many = await post({
    date: tomorrow,
    items: Array.from({ length: 6 }, (_, i) => ({ text: `Задача номер ${i + 1} на завтра` })),
  });
  check('нереалистичный план отклоняется', many.status === 422);

  // ── Декларация на завтра ──
  const declared = await post({
    date: tomorrow,
    items: [
      { text: 'Пробежка 5 км в парке', shell: 'BODY' },
      { text: 'Прочитать 20 страниц по системному дизайну', shell: 'MIND' },
    ],
  });
  const afterDeclare = await declared.json();
  check('Декларация на завтра принята', declared.ok, `${declared.status}`);
  check('в ней два пункта', afterDeclare.tomorrow?.items?.length === 2);
  check('оболочка пункта сохранена', afterDeclare.tomorrow?.items?.[0]?.shell === 'BODY');

  const far = await post({
    date: new Date(Date.parse(`${tomorrow}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    items: [{ text: 'Планировать далёкое будущее' }],
  });
  check('послезавтра не декларируют', far.status === 400);

  const past = await post({
    date: new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10),
    items: [{ text: 'Переписать вчерашний день' }],
  });
  check('прошлое не переписывают', past.status === 400);

  // ── Выполнение ──
  check('отметка без сегодняшней Декларации невозможна', (await patch({ index: 0, done: true })).status === 404);

  const forToday = await post({
    date: today,
    items: [
      { text: 'Пробежка 5 км в парке', shell: 'BODY' },
      { text: 'Позвонить отцу и выслушать его' },
    ],
  });
  check('Декларацию на сегодня можно составить, пока её нет', forToday.ok, `${forToday.status}`);

  const rewrite = await post({ date: today, items: [{ text: 'Другой план на сегодня' }] });
  check('но переписать её нельзя', rewrite.status === 409, `${rewrite.status}`);

  const marked = await (await patch({ index: 0, done: true })).json();
  check('пункт отмечен', marked.today.items[0].done === true);
  check('счётчик выполненного вырос', marked.today.done === 1);

  const state = await (await fetch(`${base}/api/akt`, { headers: auth })).json();
  check('пункт с оболочкой записал Акт', state.levels.BODY > 0, `${state.levels.BODY}`);
  check('и Акт засчитан за сегодня', state.today.acts.BODY === 1, `${state.today.acts.BODY}`);

  const levelAfterAct = state.levels.BODY;
  const unmarked = await (await patch({ index: 0, done: false })).json();
  check('отметку можно снять', unmarked.today.items[0].done === false);

  const afterUnmark = await (await fetch(`${base}/api/akt`, { headers: auth })).json();
  check(
    'снятие отметки не отнимает уровень — наказаний нет',
    afterUnmark.levels.BODY === levelAfterAct,
    `${afterUnmark.levels.BODY} против ${levelAfterAct}`,
  );

  await patch({ index: 0, done: true });
  const acts = await prisma.act.count({
    where: { user: { telegramId: BigInt(TEST_ID) } },
  });
  check('повторная отметка не плодит Акты', acts === 1, `актов ${acts}`);

  // ── Закрытие дня: Догма Следа ──
  const closed = await (
    await patch({ close: true, reflection: 'Тело сопротивлялось, но вышел на пробежку' })
  ).json();
  check('день закрыт', typeof closed.today.closedAt === 'string');
  check('отражение сохранено', closed.today.reflection?.startsWith('Тело сопротивлялось'));

  // ── След и Свиток ──
  const last = closed.trail.at(-1);
  check('сегодняшний день попал в След', last?.date === today && last?.declared === true);
  check('в Следе видно выполнение', last?.done === 1 && last?.total === 2);
  check('Свиток недели собран', closed.week?.declaredDays >= 1, JSON.stringify(closed.week));

  const rollup = await prisma.dailyRollup.findFirst({
    where: { user: { telegramId: BigInt(TEST_ID) } },
    orderBy: { date: 'desc' },
  });
  check('свод дня записан', rollup?.declarationTotal === 2, `${rollup?.declarationTotal}`);

  // ── Доктринальные запреты ──
  const raw = JSON.stringify(closed);
  check(
    'в ответе нет ни шеринга, ни экспорта, ни публичности',
    !/share|export|public|friend|leader/i.test(raw),
  );
  check('без входа Путь не отдаётся', (await fetch(`${base}/api/put`)).status === 401);

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
