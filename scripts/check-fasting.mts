/**
 * Проверка обесцвечивания интерфейса на время поста.
 * Запуск: npm run check:fasting -- <url> [папка для снимков]
 *
 * «Развитие не там, где потребление, а там где ограничения»: пока идёт Завет
 * ПОСТ, приложение снижает собственную сенсорную награду — золото уходит в
 * кость. Проверяется по пикселям, потому что подмена CSS-переменных легко
 * ломается молча: класс остаётся, переменная не доходит, экран как был.
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
const TEST_ID = 990000000009;

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
 * Доля «золотых» пикселей: тёплых и достаточно ярких.
 *
 * Костяной монохром теплее нейтрального, но разрыв между каналами у него
 * втрое меньше: у Золота 400 разница R−B равна 106, у его костяной замены — 18.
 * Порог в 25 разделяет их с запасом.
 */
async function goldShare(shot: Buffer): Promise<number> {
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  let gold = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, , b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 80 && r - b > 25) gold += 1;
    count += 1;
  }
  return gold / count;
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Пост', username: 'fast' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  // Субпиксельное сглаживание красит края букв в оранжевый и синий, и мера
  // «золотого» получает шумовой пол в полпроцента экрана — больше, чем всё
  // настоящее золото. Отключаем: измеряем цвет интерфейса, а не рендер шрифта.
  const browser = await chromium.launch({
    args: ['--disable-lcd-text', '--force-color-profile=srgb'],
  });
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

  // Поднимем оболочки, чтобы на экране было чему золотиться.
  for (const shell of ['BODY', 'MIND', 'SPIRIT']) {
    await page.request.post(`${base}/api/akt`, { data: { shell } });
  }

  const seen = async (text: string | RegExp) => {
    try {
      await page.getByText(text).first().waitFor({ state: 'visible', timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  };

  consoleErrors.length = 0;

  // ── До поста ──
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const beforeShot = await page.screenshot();
  await page.screenshot({ path: `${outDir}/post-1-do.png` });
  const goldBefore = await goldShare(beforeShot);
  check('до поста интерфейс золотой', goldBefore > 0.01, `${(goldBefore * 100).toFixed(2)}%`);

  // ── Экран Поста ──
  await page.goto(`${base}/post`, { waitUntil: 'networkidle' });
  check('правила поста названы', await seen('Нельзя есть вкусное'));
  check('правило сомнения приведено дословно', await seen(/лучше остаться голодным/));
  await page.screenshot({ path: `${outDir}/post-2-pravila.png` });

  await page.getByRole('button', { name: 'НАЧАТЬ СЕГОДНЯ' }).click();
  check('пост начался и показал окно еды', await seen('ОКНО ЕДЫ'));
  check('оба запрета на экране', (await page.getByRole('button', { name: 'СОБЛЮДАЮ' }).count()) === 2);
  await page.screenshot({ path: `${outDir}/post-3-idet.png` });

  // ── Во время поста ──
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const duringShot = await page.screenshot();
  await page.screenshot({ path: `${outDir}/post-4-vo-vremya.png` });
  const goldDuring = await goldShare(duringShot);

  check(
    'во время поста золото уходит в кость',
    goldDuring < goldBefore * 0.25,
    `${(goldDuring * 100).toFixed(2)}% против ${(goldBefore * 100).toFixed(2)}%`,
  );
  check('пост виден в Заветах дня', await seen('день 1 из 1'));

  // ── Срыв не наказывает ──
  await page.goto(`${base}/post`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'СОБЛЮДАЮ' }).first().click();
  check('срыв объяснён словами Основы 5', await seen(/Срыв — это не «я плохой»/));
  check('причины названы: мысли, эмоции, ситуация', await seen('ситуация'));
  await page.screenshot({ path: `${outDir}/post-5-sryv.png` });

  // ── После поста ──
  await page.getByRole('button', { name: 'ЗАВЕРШИТЬ ПОСТ' }).click();
  // Проверять по заголовку нельзя: «ДЕНЬ ОЧИЩЕНИЯ» стоит и в идущем посте.
  // Кнопка начала есть только тогда, когда пост не идёт.
  check('пост завершается', await seen('НАЧАТЬ СЕГОДНЯ'));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const afterShot = await page.screenshot();
  await page.screenshot({ path: `${outDir}/post-6-posle.png` });
  const goldAfter = await goldShare(afterShot);
  check(
    'после поста золото возвращается',
    goldAfter > goldBefore * 0.8,
    `${(goldAfter * 100).toFixed(2)}% против ${(goldBefore * 100).toFixed(2)}%`,
  );

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
