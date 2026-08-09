/**
 * Проверка Следа в живом браузере.
 * Запуск: npm run check:sled -- <url> [папка для снимков]
 *
 * Юнит-тесты держат геометрию спирали, но не отвечают на главный вопрос:
 * читается ли День на экране. Здесь смотрят пиксели — яркость точки обязана
 * следовать Силе дня и ничему больше, а выделение сегодняшнего идти обводкой,
 * а не приглушением остальных.
 *
 * Заодно проходит вечерний ритуал целиком: отказ валидатора, приём Декларации,
 * отметка пункта. В конце служебный человек удаляется — база остаётся чистой.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import sharp from 'sharp';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const outDir = (process.argv[3] ?? '.').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000005;

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
    user: JSON.stringify({ id: TEST_ID, first_name: 'След', username: 'sled' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Ошибки браузера юнит-тестам не видны — поэтому их слушают здесь.
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const badResponses: string[] = [];
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      badResponses.push(`${res.request().method()} ${res.url()} → ${res.status()}`);
    }
  });

  await page.goto(`${base}/vhod`, { waitUntil: 'networkidle' });
  const login = await page.request.post(`${base}/api/auth/telegram`, {
    data: { source: 'miniapp', initData },
  });
  if (!login.ok()) throw new Error(`вход не удался: ${login.status()}`);

  for (let no = 1; no <= 10; no += 1) {
    await page.request.post(`${base}/api/osnashenie`, { data: { foundationNo: no } });
  }
  await page.request.post(`${base}/api/osnashenie`, { data: { finish: true } });

  // Даты берём у сервера: они в таймзоне человека, а не машины.
  const view = await (await page.request.get(`${base}/api/put`)).json();
  const trail: { date: string }[] = view.trail;
  const dayOf = (fromEnd: number) => trail[trail.length - 1 - fromEnd].date;

  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: BigInt(TEST_ID) },
    select: { id: true },
  });

  const bright = dayOf(10);
  const dim = dayOf(9);
  const blank = dayOf(8);

  // Два дня с заведомо разной Силой — на них и проверяется яркость.
  for (const [date, sila] of [
    [bright, 90],
    [dim, 12],
  ] as [string, number][]) {
    await prisma.dailyRollup.create({
      data: {
        userId: user.id,
        date: new Date(`${date}T00:00:00.000Z`),
        sila,
        bol: 100 - sila,
        bodyLevel: sila,
        mindLevel: sila,
        spiritLevel: sila,
      },
    });
  }

  // Считаем ошибки только с экрана Пути: скрипт Telegram правит <html> до
  // гидратации, и на входе React законно ворчит про несовпадение — это не наше.
  consoleErrors.length = 0;

  await page.goto(`${base}/put`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/put-1-empty.png` });

  // ── Пиксели Следа ──
  const shot = await page.screenshot();
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });

  async function sample(date: string): Promise<[number, number, number]> {
    const box = await page.locator(`[data-day="${date}"] circle`).first().boundingBox();
    if (!box) throw new Error(`точка ${date} не найдена`);
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  }

  const [rBright] = await sample(bright);
  const [rDim] = await sample(dim);
  const [rBlank] = await sample(blank);

  check('день с большой Силой ярче дня со слабой', rBright > rDim + 40, `${rBright} против ${rDim}`);
  check('день без записи темнее любого прожитого', rBlank < rDim, `${rBlank} против ${rDim}`);
  check('точки вообще нарисованы', rBright > 120, `${rBright}`);

  const dots = await page.locator('[data-day]').count();
  check('в Следе все шесть недель', dots === 42, `${dots}`);

  // Экран ходит в базу через Neon: ждём появления текста, а не отмеряем паузу.
  const seen = async (text: string | RegExp) => {
    try {
      await page.getByText(text).first().waitFor({ state: 'visible', timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  };

  // ── Валидатор в живом интерфейсе ──
  await page.getByRole('button', { name: 'ЗАДЕКЛАРИРОВАТЬ СЕГОДНЯ' }).click();
  await page.getByPlaceholder('Что я совершу').fill('Досмотреть сериал вечером');
  await page.getByRole('button', { name: 'ЗАДЕКЛАРИРОВАТЬ', exact: true }).click();

  check('валидатор назвал потребление на экране', await seen('Это потребление'));
  check('и подсказал, чем его заменить', await seen(/Потребление не развивает/));
  await page.screenshot({ path: `${outDir}/put-2-rejected.png` });

  await page.getByPlaceholder('Что я совершу').fill('Пробежка 5 км в парке');
  await page.getByRole('button', { name: 'Тело', exact: true }).first().click();
  await page.getByRole('button', { name: 'ЗАДЕКЛАРИРОВАТЬ', exact: true }).click();

  check('Декларация принята и стала чек-листом', await seen('0 из 1'));
  await page.screenshot({ path: `${outDir}/put-3-checklist.png` });

  await page.getByText('Пробежка 5 км в парке').click();

  check('выполнение отмечено', await seen('задекларированное выполнено'));
  await page.screenshot({ path: `${outDir}/put-4-done.png` });

  const today = dayOf(0);
  const ring = await page.locator(`[data-day="${today}"] circle`).count();
  check('сегодняшний день выделен обводкой, а не яркостью', ring >= 2, `окружностей ${ring}`);

  check('запросы экрана прошли без отказов', badResponses.length === 0, badResponses.join('; '));
  check('в консоли браузера чисто', consoleErrors.length === 0, consoleErrors.join(' | '));

  await browser.close();
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
