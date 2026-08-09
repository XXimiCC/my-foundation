/**
 * Проверка экрана Тишины в живом браузере.
 * Запуск: npm run check:tishina -- <url> [папка для снимков]
 *
 * Главное требование Завета ДУХ проверяется по пикселям: во время практики
 * экран обязан ГАСНУТЬ. «Без устройств, без звуков» — значит ни показаний, ни
 * нижней панели, ни цифр обратного отсчёта. Юнит-тест этого не увидит.
 *
 * Заодно снимается экран Дара: он простой, но пусть будет видно, что он есть.
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
const TEST_ID = 990000000007;

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
 * Доля светящихся пикселей — ею измеряется «экран гаснет».
 *
 * Средняя яркость кадра для этого не годится: фон Обсидиана почти чёрный и
 * забивает среднее в обоих состояниях. Считать надо именно то, что светится:
 * текст, кнопки, золото.
 */
async function litShare(shot: Buffer): Promise<number> {
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  let lit = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 60) lit += 1;
    count += 1;
  }
  return lit / count;
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Тишина', username: 'tish' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
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

  const seen = async (text: string | RegExp) => {
    try {
      await page.getByText(text).first().waitFor({ state: 'visible', timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  };

  // ── Главный экран: Заветы дня ──
  consoleErrors.length = 0;
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check('Заветы дня видны с главного', await seen('ЗАВЕТЫ ДНЯ'));
  const tabs = await page.locator('nav a').count();
  check('в панели не больше четырёх вкладок', tabs <= 4, `${tabs}`);
  await page.screenshot({ path: `${outDir}/glavnyi.png` });

  // ── Тишина до практики ──
  await page.goto(`${base}/tishina`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const idleShot = await page.screenshot();
  await page.screenshot({ path: `${outDir}/tishina-1-idle.png` });
  const idleLit = await litShare(idleShot);

  check('на экране Тишины панели нет', (await page.locator('nav').count()) === 0);

  // ── Практика ──
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'ЗАМЕДЛИТЬСЯ' }).click();
  await page.waitForTimeout(1200);
  const runShot = await page.screenshot();
  await page.screenshot({ path: `${outDir}/tishina-2-praktika.png` });
  const runLit = await litShare(runShot);

  check(
    'во время практики экран гаснет',
    runLit < idleLit * 0.35,
    `светится ${(runLit * 100).toFixed(2)}% против ${(idleLit * 100).toFixed(2)}%`,
  );
  check('показаний Силы и Боли не видно', (await page.getByText('СИЛА').count()) === 0);
  check(
    'цифр обратного отсчёта нет',
    (await page.getByText(/^\d+:\d\d$/).count()) === 0,
  );
  check('контур вращается', (await page.locator('.tq-knot[data-spin]').count()) === 1);
  check('стадия названа словами Основы 7', await seen('СОЗДАНИЕ СЮЖЕТА'));

  // ── Завершение ──
  await page.getByRole('button', { name: 'ЗАВЕРШИТЬ' }).click();
  check('практика завершается Вознесением', await seen('ВОЗНЕСЕНИЕ'));
  await page.screenshot({ path: `${outDir}/tishina-3-voznesenie.png` });

  await page.getByPlaceholder('Что пришло в тишине').fill('Мысли — объекты в комнате');
  await page.getByRole('button', { name: 'ЗАПИСАТЬ' }).click();
  check('озарение сохранилось и видно на экране', await seen('Мысли — объекты в комнате'));
  await page.screenshot({ path: `${outDir}/tishina-4-zapis.png` });

  // ── Дар ──
  await page.goto(`${base}/dar`, { waitUntil: 'networkidle' });
  check('экран Дара открывается', await seen('ЧТО ОТДАНО'));
  await page.getByRole('button', { name: 'Время', exact: true }).click();
  await page.getByPlaceholder('Что именно').fill('помог собрать шкаф');
  await page.getByRole('button', { name: 'ЗАПИСАТЬ' }).click();
  check('Дар записан и виден в журнале недели', await seen('помог собрать шкаф'));
  check(
    'на экране Дара нет ни шеринга, ни планирования',
    (await page.getByRole('button', { name: /подел|экспорт|заплан/i }).count()) === 0,
  );
  await page.screenshot({ path: `${outDir}/dar.png` });

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
