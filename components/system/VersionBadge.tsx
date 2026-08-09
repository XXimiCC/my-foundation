'use client';

import { useEffect, useState } from 'react';

/**
 * Версия работающей сборки.
 *
 * Webview Telegram кеширует страницу цепко, и понять, доехали правки или нет,
 * иначе нечем: интерфейс выглядит одинаково. Здесь видна версия, которая
 * СЕЙЧАС выполняется в браузере, и отдельно — расходится ли она с серверной.
 */

type State =
  | { kind: 'проверяется' }
  | { kind: 'свежая' }
  | { kind: 'устарела'; server: string }
  | { kind: 'сервер молчит' };

/** Сверяем по коммиту — он точнее версии, а показываем версию. */
interface VersionResponse {
  version?: string;
  commit?: string;
}

export function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const client = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? 'dev';
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME;
  const [state, setState] = useState<State>({ kind: 'проверяется' });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/version', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('нет ответа'))))
      .then((data: VersionResponse) => {
        if (cancelled) return;
        const serverCommit = data.commit ?? '';
        setState(
          !serverCommit || serverCommit === client
            ? { kind: 'свежая' }
            : { kind: 'устарела', server: data.version ?? serverCommit },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'сервер молчит' });
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  if (state.kind === 'устарела') {
    return (
      <button
        onClick={() => window.location.reload()}
        className="text-[0.62rem] tracking-[0.12em] text-gold-200 underline decoration-gold-600/50 underline-offset-4"
      >
        v{version} устарела · на сервере v{state.server} · обновить
      </button>
    );
  }

  return (
    <p
      className="text-[0.62rem] tracking-[0.12em] text-mute"
      title={`Коммит ${client}. ${buildTitle(builtAt)}`}
    >
      v{version}
      {state.kind === 'свежая' && ' · актуальна'}
      {state.kind === 'сервер молчит' && ' · сервер не ответил'}
      {formatBuiltAt(builtAt) && ` · ${formatBuiltAt(builtAt)}`}
    </p>
  );
}

function formatBuiltAt(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildTitle(iso?: string): string {
  return iso ? `Собрано ${iso}` : 'Время сборки неизвестно';
}
