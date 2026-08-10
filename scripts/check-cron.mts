/**
 * Проверка планировщика ритуального дня.
 * Запуск: npm run check:cron -- <url>
 *
 * Уведомления и есть продукт: небрежность здесь нарушает Основу 4 напрямую.
 * Поэтому проверяется на ПОДМЕНЁННЫХ часах — окна, тихие часы, льгота на
 * пропущенный тик и идемпотентность при перекрытии тиков.
 *
 * Раскладка идёт с `dry=1`: очередь наполняется, но в Telegram ничего не
 * уходит. Отдельно проверяется живая отправка — на заведомо несуществующий
 * чат, чтобы увидеть, что запрос до Telegram доходит и ошибка записывается.
 */

import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const token = process.env.TELEGRAM_BOT_TOKEN;
const cronSecret = process.env.CRON_SECRET;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');
if (!cronSecret) throw new Error('CRON_SECRET не задан');

const prisma = new PrismaClient();
const TEST_ID = 990000000011;
const TZ = 'Europe/Kyiv';

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

/** Момент UTC, в который в зоне человека наступают заданные минуты суток. */
function atLocal(dateKey: string, minutes: number, tz: string): Date {
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const asLocal = new Date(probe.toLocaleString('en-US', { timeZone: tz }));
  const asUtc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = asLocal.getTime() - asUtc.getTime();
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + minutes * 60_000 - offset);
}

function shiftKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_ID) } });

  const initData = signInitData({
    user: JSON.stringify({ id: TEST_ID, first_name: 'Крон', username: 'cron' }),
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

  const user = await prisma.user.findUniqueOrThrow({
    where: { telegramId: BigInt(TEST_ID) },
    select: { id: true },
  });
  await prisma.user.update({ where: { id: user.id }, data: { tz: TZ } });

  /**
   * Тик всегда направлен на служебного человека: подменённые часы не должны
   * доставать до чужого дня. Сервер этого и требует.
   */
  const tick = async (at: Date, dry = true) =>
    (
      await fetch(
        `${base}/api/cron/rituals?only=${TEST_ID}&dry=${dry ? 1 : 0}` +
          `&at=${encodeURIComponent(at.toISOString())}`,
        { headers: { 'x-cron-secret': cronSecret! } },
      )
    ).json();

  const outbox = () =>
    prisma.outboxMessage.findMany({
      where: { userId: user.id },
      select: { kind: true, dedupeKey: true, sentAt: true, attempts: true, lastError: true },
      orderBy: { createdAt: 'asc' },
    });

  // ── Доступ ──
  check('без секрета планировщик молчит', (await fetch(`${base}/api/cron/rituals`)).status === 401);
  check(
    'с чужим секретом тоже',
    // Заголовки допускают только байтовые строки, поэтому чужой секрет —
    // латиницей: кириллица тут падает в самом fetch, а не на сервере.
    (await fetch(`${base}/api/cron/rituals`, { headers: { 'x-cron-secret': 'wrong-secret' } }))
      .status === 401,
  );

  // Берём заведомо будний день: воскресенье добавляет свои окна.
  const monday = '2026-08-10';

  // ── Утро ──
  const morning = await tick(atLocal(monday, 7 * 60 + 5, TZ));
  check('утреннее окно наступило', morning.planned === 1, JSON.stringify(morning));
  const afterMorning = await outbox();
  check('в очереди утренний ритуал', afterMorning[0]?.kind === 'MORNING_BLESSING');
  check(
    'ключ идемпотентности собран из локальной даты',
    afterMorning[0]?.dedupeKey.endsWith(`:MORNING_BLESSING:${monday}`),
    afterMorning[0]?.dedupeKey,
  );

  // ── Перекрывшиеся тики ──
  const again = await tick(atLocal(monday, 7 * 60 + 20, TZ));
  check('второй тик того же утра ничего не добавляет', again.planned === 0);
  check('в очереди по-прежнему одна запись', (await outbox()).length === 1);

  // ── Льгота ──
  const late = await tick(atLocal(monday, 9 * 60, TZ));
  check('через два часа утро уже не догоняют', late.planned === 0, JSON.stringify(late));

  // ── Тихие часы ──
  const night = await tick(atLocal(monday, 23 * 60 + 30, TZ));
  check('в тихие часы не планируется ничего', night.planned === 0, JSON.stringify(night));

  // ── Вечер и ночь ──
  const evening = await tick(atLocal(monday, 21 * 60 + 5, TZ));
  check('вечернее окно наступило', evening.planned === 1, JSON.stringify(evening));
  const nightClose = await tick(atLocal(monday, 22 * 60 + 35, TZ));
  check('ночное окно наступило', nightClose.planned === 1, JSON.stringify(nightClose));

  const kinds = (await outbox()).map((m) => m.kind);
  check(
    'за сутки ровно три ритуала на норме',
    kinds.length === 3 && kinds.includes('EVENING_DECLARATION') && kinds.includes('NIGHT_CLOSING'),
    kinds.join(', '),
  );

  // ── Сделанный ритуал не зовут ──
  const tuesday = shiftKey(monday, 1);
  await fetch(`${base}/api/put`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      // Декларация составляется на завтрашний день ОТ СЕГОДНЯ, а не от
      // подменённых часов: экран живёт в настоящем времени.
      items: [{ text: 'Пробежка 5 км в парке' }],
    }),
  });

  const declared = await prisma.declaration.findFirst({
    where: { userId: user.id },
    select: { forDate: true },
  });
  const declaredKey = declared!.forDate.toISOString().slice(0, 10);
  const dayBefore = shiftKey(declaredKey, -1);

  const eveningDone = await tick(atLocal(dayBefore, 21 * 60 + 5, TZ));
  check(
    'вечером не зовут, если Декларация на завтра уже есть',
    eveningDone.planned === 0,
    JSON.stringify(eveningDone),
  );

  // ── Новые сутки — новый ключ ──
  const nextMorning = await tick(atLocal(tuesday, 7 * 60 + 5, TZ));
  check('назавтра утренний ритуал приходит снова', nextMorning.planned === 1);
  check(
    'и с другим ключом',
    (await outbox()).some((m) => m.dedupeKey.endsWith(`:MORNING_BLESSING:${tuesday}`)),
  );

  check(
    'подменённые часы без адресата отклоняются: чужой день не тронуть',
    (
      await fetch(`${base}/api/cron/rituals?at=${encodeURIComponent(new Date().toISOString())}`, {
        headers: { 'x-cron-secret': cronSecret! },
      })
    ).status === 400,
  );

  // ── Живая отправка ──
  // Чат 990000000011 не существует: Telegram обязан отказать по-человечески.
  // Это и проверяем — что запрос доходит и ошибка ложится в очередь.
  await prisma.outboxMessage.updateMany({
    where: { userId: user.id },
    data: { scheduledFor: new Date() },
  });
  const sending = await (
    await fetch(`${base}/api/cron/rituals?only=${TEST_ID}&dry=0`, {
      headers: { 'x-cron-secret': cronSecret! },
    })
  ).json();
  check('живой тик дошёл до отправки', sending.sent + sending.failed > 0, JSON.stringify(sending));

  const attempted = (await outbox()).filter((m) => m.attempts > 0);
  check('попытки записаны', attempted.length > 0, `${attempted.length}`);
  check(
    'Telegram ответил осмысленно, а не молча',
    attempted.every((m) => (m.lastError ?? '').length > 0),
    attempted[0]?.lastError ?? '',
  );
  check(
    'отказ — именно про чат, значит запрос собран верно',
    /chat not found/i.test(attempted[0]?.lastError ?? ''),
    attempted[0]?.lastError ?? '',
  );

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
