/**
 * Управление вебхуком бота.
 * Запуск: npm run bot:webhook -- [set|info|delete] [адрес]
 *
 * Токен и секрет берутся из окружения и в вывод не попадают: адрес вебхука
 * печатается, секрет — нет.
 *
 * Без аргументов показывает состояние — это безопасно и отвечает на главный
 * вопрос «а он вообще привязан?».
 */

const command = process.argv[2] ?? 'info';
const explicitUrl = process.argv[3];

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан');

async function api(method: string, payload?: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: unknown };
}

async function main() {
  if (command === 'info') {
    const info = (await api('getWebhookInfo')).result as {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
      last_error_date?: number;
    };

    console.log(`\n  адрес:        ${info?.url || '— не привязан —'}`);
    console.log(`  в очереди:    ${info?.pending_update_count ?? 0}`);
    if (info?.last_error_message) {
      const when = info.last_error_date
        ? new Date(info.last_error_date * 1000).toISOString()
        : '—';
      console.log(`  последняя ошибка: ${info.last_error_message} (${when})`);
    }
    console.log('');
    return;
  }

  if (command === 'delete') {
    const result = await api('deleteWebhook', { drop_pending_updates: false });
    console.log(result.ok ? '\n  вебхук отвязан\n' : `\n  не вышло: ${result.description}\n`);
    return;
  }

  if (command === 'set') {
    if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET не задан');
    const target = explicitUrl ?? (appUrl ? `${appUrl.replace(/\/$/, '')}/api/bot` : null);
    if (!target) throw new Error('не задан ни адрес аргументом, ни NEXT_PUBLIC_APP_URL');

    const result = await api('setWebhook', {
      url: target,
      secret_token: secret,
      // Ничего, кроме сообщений и нажатий, боту не нужно: меньше трафика и
      // меньше поводов проснуться зря.
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });

    console.log(
      result.ok ? `\n  вебхук привязан к ${target}\n` : `\n  не вышло: ${result.description}\n`,
    );
    return;
  }

  console.log('\n  Использование: npm run bot:webhook -- [set|info|delete] [адрес]\n');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
