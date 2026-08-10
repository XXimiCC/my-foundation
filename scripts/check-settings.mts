/**
 * Сквозная проверка настроек ритуального дня.
 * Запуск: npm run check:settings -- <url>
 *
 * Главное — что нерабочие настройки не сохраняются. Окно, накрытое тихими
 * часами, не сработает ни разу; сохранить такое молча значит сломать контур
 * уведомлений так, что человек будет думать на бота.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const outDir = (process.argv[3] ?? '.').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000013;

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
 * Проверяется то, ради чего экран и сделан: ловушка тишины должна быть видна
 * ДО сохранения и объяснена словами, а кнопка — заблокирована.
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

  // networkidle здесь не наступает: версия опрашивается по таймеру.
  await page.goto(`${base}/vhod`, { waitUntil: 'domcontentloaded' });
  await page.request.post(`${base}/api/auth/telegram`, { data: { source: 'miniapp', initData } });

  await page.goto(`${base}/nastroyki`, { waitUntil: 'domcontentloaded' });
  await page.getByText('КОГДА ЗВАТЬ').waitFor({ timeout: 20_000 });
  check('экран настроек открывается', true);
  const previewList = page.locator('[data-preview] li');
  check(
    'предпросмотр показывает часы словами',
    (await previewList.allInnerTexts()).some((line) => line.includes('Декларация на завтра')),
  );
  await page.screenshot({ path: `${outDir}/nastroyki-1.png` });

  /**
   * Ставим вечер внутрь тихих часов — экран обязан возразить до сохранения.
   *
   * Набор с клавиатуры, а не `fill`: заполнение подставляет значение мимо
   * событий, и проверка прошла бы даже на сломанном поле. Клик в левый край
   * попадает в сегмент часов, уход фокуса отдаёт значение React.
   */
  const evening = page.locator('input[type="time"]').nth(2);
  await evening.click({ position: { x: 8, y: 12 } });
  await evening.pressSequentially('2330');
  await page.getByText('ТИХИЕ ЧАСЫ').click();
  await page.waitForTimeout(300);

  check('ловушка тишины видна до сохранения', await page.getByText(/не придёт ни разу/).isVisible());
  check(
    'сохранение заблокировано',
    await page.getByRole('button', { name: 'СОХРАНИТЬ' }).isDisabled(),
  );
  check(
    'предпросмотр показывает набранное время',
    (await previewList.allInnerTexts()).some((line) => line.includes('23:30')),
  );
  await page.screenshot({ path: `${outDir}/nastroyki-2-lovushka.png` });

  await browser.close();
  await prisma.user.deleteMany({ where: { telegramId: BigInt(SCREEN_ID) } });
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Часы', username: 'chasy' }),
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

  const get = () => fetch(`${base}/api/settings`, { headers: auth });
  const patch = (body: unknown) =>
    fetch(`${base}/api/settings`, { method: 'PATCH', headers: auth, body: JSON.stringify(body) });

  check('без входа настройки не отдаются', (await fetch(`${base}/api/settings`)).status === 401);

  const initial = await (await get()).json();
  check('настройки по умолчанию отдаются', initial.morningAt === 420 && initial.eveningAt === 1260);
  check('часовой пояс приходит вместе с ними', initial.tz === 'Europe/Kyiv', initial.tz);

  // ── Ловушка тишины ──
  const trap = await patch({ eveningAt: 1410 }); // 23:30 при тишине с 23:00
  check('окно в тихих часах не сохраняется', trap.status === 422, `${trap.status}`);
  const trapBody = await trap.json();
  check('и объясняет почему', /не придёт/.test(trapBody.error ?? ''), trapBody.error);
  check(
    'старое значение уцелело',
    (await (await get()).json()).eveningAt === 1260,
  );

  // ── Обычная правка ──
  const moved = await patch({ morningAt: 480, nightAt: 1320, intensity: 2 });
  check('время окон правится', moved.ok, `${moved.status}`);
  const afterMove = await moved.json();
  check('утро переехало на восемь', afterMove.morningAt === 480);
  check('интенсивность сохранена', afterMove.intensity === 2);

  const partial = await (await patch({ intensity: 1 })).json();
  check(
    'присланное поле правится, остальные не съезжают',
    partial.morningAt === 480 && partial.nightAt === 1320 && partial.intensity === 1,
    JSON.stringify(partial),
  );

  // ── Границы ──
  check('интенсивность вне трёх значений отклоняется', (await patch({ intensity: 5 })).status === 422);
  check('чужой часовой пояс отклоняется', (await patch({ tz: 'Средиземье/Шир' })).status === 422);
  check('день недели вне недели отклоняется', (await patch({ fastWeekdays: [9] })).status === 422);

  const zoned = await (await patch({ tz: 'Asia/Kolkata' })).json();
  check('часовой пояс меняется', zoned.tz === 'Asia/Kolkata');

  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: BigInt(TEST_ID) },
    select: { tz: true, settings: { select: { morningAt: true, intensity: true } } },
  });
  check('зона легла человеку, а не в настройки', user.tz === 'Asia/Kolkata');
  check(
    'настройки легли в базу',
    user.settings?.morningAt === 480 && user.settings?.intensity === 1,
    JSON.stringify(user.settings),
  );

  // ── Планировщик видит новые часы ──
  // Настройки правятся и до Оснащения — часы у человека свои с самого начала.
  // А вот зовёт планировщик только прошедших Договор, поэтому здесь он нужен.
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

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const at = new Date();
    // 08:05 по Калькутте — только что переставленное утреннее окно.
    const probe = await (
      await fetch(
        `${base}/api/cron/rituals?only=${TEST_ID}&dry=1&at=${encodeURIComponent(
          new Date(
            Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 2, 35),
          ).toISOString(),
        )}`,
        { headers: { 'x-cron-secret': cronSecret } },
      )
    ).json();
    check(
      'планировщик считает окна по новым настройкам',
      probe.planned >= 1,
      JSON.stringify(probe),
    );
  }

  await checkScreen();

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
