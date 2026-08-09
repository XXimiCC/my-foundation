'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Вход двумя путями, сходящимися в один аккаунт.
 *
 * Внутри Telegram страница получает initData и входит сама — лишний экран там
 * только мешает. В обычном браузере показывается Login Widget: у него другая
 * схема подписи, но тот же человек на выходе.
 */

declare global {
  interface Window {
    Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

export function LoginForm({ botUsername, next }: { botUsername: string; next: string }) {
  const router = useRouter();
  const [state, setState] = useState<'ждём' | 'входим' | 'ошибка'>('ждём');
  const [error, setError] = useState<string | null>(null);
  const widgetHost = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (payload: object) => {
      setState('входим');
      setError(null);
      try {
        const res = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'вход не удался');
        router.push(next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'вход не удался');
        setState('ошибка');
      }
    },
    [next, router],
  );

  // Внутри Telegram вход происходит сам.
  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      window.Telegram?.WebApp?.ready?.();
      window.Telegram?.WebApp?.expand?.();
      void send({ source: 'miniapp', initData });
    }
  }, [send]);

  // В браузере — виджет Telegram.
  useEffect(() => {
    if (window.Telegram?.WebApp?.initData) return;
    if (!botUsername || !widgetHost.current) return;
    if (widgetHost.current.childElementCount > 0) return;

    window.onTelegramAuth = (user) => void send({ source: 'widget', data: user });

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername.replace(/^@/, ''));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '4');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    widgetHost.current.appendChild(script);
  }, [botUsername, send]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-5 py-10 text-center">
      <h1
        className="text-2xl tracking-[0.35em] text-gold-200"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        ОСНОВАНИЕ
      </h1>

      <p className="text-bone/80" style={{ fontFamily: 'var(--font-canon)' }}>
        Вход через Telegram. Он же приносит ритуалы в тот момент, когда им положено
        произойти.
      </p>

      {state === 'входим' && <p className="text-sm text-mute">Входим…</p>}

      <div ref={widgetHost} className="min-h-[3rem]" />

      {!botUsername && (
        <p className="text-sm text-frost">
          Имя бота не настроено: задайте TELEGRAM_BOT_USERNAME.
        </p>
      )}

      {error && (
        <p className="text-sm text-frost" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-mute">
        Мы не запрашиваем ничего сверх того, что Telegram передаёт сам: имя, ник и
        идентификатор.
      </p>
    </main>
  );
}
