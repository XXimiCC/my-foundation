/**
 * Снимки ритуала Оснащения на разных стадиях.
 * Запуск: npm run shot:osnashenie -- <url> <папка>
 *
 * Заводит служебного человека, входит его подписью и снимает предупреждение,
 * приём Основы и достроенный знак. В конце удаляет — база остаётся чистой.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const outDir = (process.argv[3] ?? '.').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000002;

function signInitData(fields: Record<string, string>): string {
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token!).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Съёмка', username: 'shot' }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Входим через тот же публичный маршрут, куки останутся в контексте.
  await page.goto(`${base}/vhod`, { waitUntil: 'networkidle' });
  const login = await page.request.post(`${base}/api/auth/telegram`, {
    data: { source: 'miniapp', initData },
  });
  if (!login.ok()) throw new Error(`вход не удался: ${login.status()}`);

  await page.goto(`${base}/osnashenie`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/osn-1-warning.png` });

  await page.getByRole('button', { name: 'НАЧАТЬ ОСНАЩЕНИЕ' }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outDir}/osn-2-foundation.png` });

  // Принимаем девять Основ: знак должен собраться почти целиком.
  for (let i = 0; i < 9; i += 1) {
    await page.getByRole('button', { name: 'ПРИНИМАЮ' }).click();
    await page.waitForTimeout(450);
  }
  await page.screenshot({ path: `${outDir}/osn-3-almost.png` });

  await page.getByRole('button', { name: 'ПРИНИМАЮ' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/osn-4-contract.png` });

  console.log('  четыре снимка готовы');

  await browser.close();
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
