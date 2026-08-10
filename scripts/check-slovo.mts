/**
 * Сквозная проверка Слова Дня и точки оптимальных усилий.
 * Запуск: npm run check:slovo -- <url>
 *
 * Проверяется доктрина Основы 6: карточка не выдаёт текст заранее, порядок
 * идёт от базовых принципов к остальному, заход конечен, забытый тезис
 * возвращается завтра и ничего не отнимает, а норма подстраивается под силы.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const outDir = (process.argv[3] ?? '.').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000010;

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

/**
 * Экран в живом браузере.
 *
 * Главное здесь неочевидно и проверяется только в DOM: до нажатия «ПРОВЕРИТЬ»
 * текста тезиса на странице нет вообще. Иначе Слово Дня превращается в
 * просмотр, который Основа 6 отвергает прямым текстом.
 */
async function checkScreen() {
  const SCREEN_ID = TEST_ID + 1;
  await prisma.user.deleteMany({ where: { telegramId: BigInt(SCREEN_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: SCREEN_ID, first_name: 'Экран', username: 'ekran' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();

  await page.goto(`${base}/vhod`, { waitUntil: 'networkidle' });
  await page.request.post(`${base}/api/auth/telegram`, { data: { source: 'miniapp', initData } });
  for (let no = 1; no <= 10; no += 1) {
    await page.request.post(`${base}/api/osnashenie`, { data: { foundationNo: no } });
  }
  await page.request.post(`${base}/api/osnashenie`, { data: { finish: true } });

  const view = await (await page.request.get(`${base}/api/slovo`)).json();
  const text: string = view.cards[0].text;
  const tail = text.split(/\s+/).slice(-3).join(' ');

  await page.goto(`${base}/slovo`, { waitUntil: 'networkidle' });
  const hidden = await page.getByText(tail, { exact: false }).count();
  check('до попытки текста тезиса на странице нет', hidden === 0, `${hidden}`);
  check('видна только подсказка', (await page.getByText('…', { exact: false }).count()) > 0);
  await page.screenshot({ path: `${outDir}/slovo-1-popytka.png` });

  await page.getByRole('button', { name: 'ПРОВЕРИТЬ' }).click();
  const shown = await page.getByText(tail, { exact: false }).count();
  check('после попытки тезис раскрыт', shown > 0);
  check('оценок ровно три', (await page.getByRole('button', { name: /ЗАБЫЛ|С ТРУДОМ|ВСПОМНИЛ/ }).count()) === 3);
  await page.screenshot({ path: `${outDir}/slovo-2-proverka.png` });

  // Ждём появления, а не отмеряем паузу: запрос идёт в базу через Neon.
  await page.getByRole('button', { name: 'ВСПОМНИЛ' }).click();
  let moved = true;
  try {
    await page.getByText('2 из 3').first().waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    moved = false;
  }
  check('заход движется дальше', moved);

  await browser.close();
  await prisma.user.deleteMany({ where: { telegramId: BigInt(SCREEN_ID) } });
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Слово', username: 'slovo' }),
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

  const get = () => fetch(`${base}/api/slovo`, { headers: auth });
  const post = (body: unknown) =>
    fetch(`${base}/api/slovo`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
  const mind = async () =>
    (await (await fetch(`${base}/api/akt`, { headers: auth })).json()).levels.MIND as number;

  check('Слово Дня до Оснащения закрыто', (await get()).status === 403);

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

  // ── Первый заход ──
  const first = await (await get()).json();
  check('Канон разобран на тезисы', first.total > 400, `${first.total}`);
  check('знакомых пока нет', first.known === 0);
  check('новичку норма минимальна — «начните с малого»', first.goal.target === 3, `${first.goal.target}`);
  check('карточек ровно по норме', first.cards.length === 3, `${first.cards.length}`);

  const card = first.cards[0];
  check('карточка называет источник', typeof card.source === 'string' && card.source.length > 0, card.source);
  check(
    'текст заранее не выдаётся: подсказка короче тезиса',
    card.prompt.length < card.text.length && card.text.startsWith(card.prompt.replace('…', '')),
  );
  check('первым идёт базовое: Догмат или Основа', /Основание|Основа/.test(card.source), card.source);
  check('все карточки первого захода — новые', first.cards.every((c: { fresh: boolean }) => c.fresh));

  // ── Оценки ──
  check('несуществующая оценка отвергается', (await post({ thesisId: card.thesisId, recall: 'ОК' })).status === 400);
  check('без тезиса оценка не принимается', (await post({ recall: 'ВСПОМНИЛ' })).status === 400);
  check(
    'чужой тезис не принимается',
    (await post({ thesisId: 'нет-такого', recall: 'ВСПОМНИЛ' })).status === 404,
  );

  const mindBefore = await mind();
  const afterOne = await (await post({ thesisId: card.thesisId, recall: 'ВСПОМНИЛ' })).json();
  check('припоминание засчитано', afterOne.done === 1, `${afterOne.done}`);
  check('заход ещё не пройден', afterOne.complete === false);
  check('Разум пока не растёт: платит заход целиком', (await mind()) === mindBefore);

  const forgotten = await (await post({ thesisId: first.cards[1].thesisId, recall: 'ЗАБЫЛ' })).json();
  check('забытый тезис записан как опыт', forgotten.done === 2);

  const last = await (await post({ thesisId: first.cards[2].thesisId, recall: 'С ТРУДОМ' })).json();
  check('заход пройден', last.complete === true);
  check('Разум вырос на треть акта', last.counted === true && (await mind()) > mindBefore);

  const gain = (await mind()) - mindBefore;
  check('это именно треть, а не полный акт', gain > 0 && gain < 2, `прирост ${gain.toFixed(2)}`);

  // ── Повтор сверх нормы ──
  const afterSession = await (await get()).json();
  check('сверх нормы карточек не выдаётся', afterSession.cards.length === 0, `${afterSession.cards.length}`);
  check('знакомых стало три', afterSession.known === 3, `${afterSession.known}`);

  const mindAfter = await mind();
  const extra = await (await post({ thesisId: card.thesisId, recall: 'ВСПОМНИЛ' })).json();
  check(
    'повтор того же тезиса счёт не раздувает: считаются тезисы, а не нажатия',
    extra.done === 3,
    `${extra.done}`,
  );
  check(
    'но второй раз за сутки Разум не растёт',
    extra.counted === false && (await mind()) === mindAfter,
  );

  const repeated = await prisma.thesisReview.findFirst({
    where: { user: { telegramId: BigInt(TEST_ID) }, thesisId: card.thesisId },
    select: { reps: true, interval: true },
  });
  check(
    'повтор всё же учтён: интервал вырос',
    repeated?.reps === 2 && repeated.interval === 3,
    `повторов ${repeated?.reps}, интервал ${repeated?.interval}`,
  );

  // ── Сроки ──
  const reviews = await prisma.thesisReview.findMany({
    where: { user: { telegramId: BigInt(TEST_ID) } },
    select: { interval: true, reps: true, lapses: true, dueAt: true },
    orderBy: { lapses: 'desc' },
  });
  check('состояния записаны по каждому тезису', reviews.length === 3, `${reviews.length}`);
  check('забытый вернётся завтра', reviews[0].lapses === 1 && reviews[0].interval === 1);
  check(
    'ни один срок не в прошлом',
    reviews.every((r) => r.dueAt.getTime() > Date.now() - 86_400_000),
  );

  // ── Норма растёт от цепи ──
  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: BigInt(TEST_ID) },
    select: { id: true },
  });
  const DAY = 86_400_000;
  // Семь заходов в предыдущие дни: точка оптимальных усилий должна подняться.
  await prisma.act.createMany({
    data: Array.from({ length: 7 }, (_, i) => ({
      userId: user.id,
      shell: 'MIND' as const,
      note: 'Слово Дня',
      doneAt: new Date(Date.now() - (i + 1) * DAY),
    })),
  });

  const grown = await (await get()).json();
  check(
    'неделя подряд подняла норму',
    grown.goal.target === 7 && grown.goal.trend === 'рост',
    `${grown.goal.target} · ${grown.goal.trend}`,
  );

  check('без входа Слово Дня не отдаётся', (await fetch(`${base}/api/slovo`)).status === 401);

  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
  await checkScreen();
  console.log(`\n  Пройдено ${passed}, провалено ${failed}\n`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
