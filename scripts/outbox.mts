/**
 * Очередь ритуалов: что ушло, что застряло, на чём споткнулось.
 * Запуск: npm run outbox [-- <сколько дней>]
 *
 * Внешний пингер — единственная точка контура, которую мы не контролируем.
 * Если он замолчит, ритуалы просто не придут, и приложение об этом не узнает.
 * Косвенный признак — пустая очередь за сутки, и виден он только отсюда.
 */

import { PrismaClient } from '@prisma/client';

const days = Number(process.argv[2] ?? 3) || 3;
const prisma = new PrismaClient();

function when(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

async function main() {
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await prisma.outboxMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { scheduledFor: 'desc' },
    select: {
      kind: true,
      scheduledFor: true,
      sentAt: true,
      attempts: true,
      lastError: true,
      user: { select: { username: true, firstName: true, tz: true } },
    },
  });

  console.log(`\n  Очередь за ${days} ${days === 1 ? 'день' : 'дня(ей)'}: ${rows.length} записей\n`);

  if (rows.length === 0) {
    console.log('  Пусто. Если бот включён, а окна за сутки были — молчит пингер.\n');
  }

  for (const row of rows) {
    const who = row.user.username ?? row.user.firstName ?? '—';
    const state = row.sentAt
      ? `ушло ${when(row.sentAt)}`
      : row.attempts > 0
        ? `НЕ УШЛО, попыток ${row.attempts}: ${row.lastError ?? '—'}`
        : 'ждёт';
    console.log(`  ${when(row.scheduledFor)}  ${row.kind.padEnd(20)} ${who.padEnd(16)} ${state}`);
  }

  const stuck = rows.filter((r) => !r.sentAt && r.attempts > 0).length;
  const waiting = rows.filter((r) => !r.sentAt && r.attempts === 0).length;
  console.log(`\n  Ушло ${rows.filter((r) => r.sentAt).length}, ждёт ${waiting}, застряло ${stuck}\n`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
