'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Сторож версии.
 *
 * Webview Telegram кеширует страницу очень цепко: после выката человек ещё
 * долго видит старую сборку и считает, что правки не доехали. Здесь клиент
 * сравнивает запечённую в него версию с той, что отдаёт сервер, и один раз
 * перезагружается, если они разошлись.
 *
 * Проверка идёт при запуске и при возвращении к вкладке — именно тогда, когда
 * Mini App поднимают из свёрнутого состояния.
 */

const RELOADED_KEY = 'osn:reloaded-for';

export function VersionGuard() {
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;

      const data = (await res.json()) as { commit?: string };
      const server = data.commit;
      const client = process.env.NEXT_PUBLIC_BUILD_COMMIT;

      if (!server || !client || server === client) return;
      // В разработке версии заведомо разные — перезагружать нечего.
      if (client === 'dev' || server === 'dev') return;

      // Защита от петли: на одну серверную версию перезагружаемся один раз.
      if (sessionStorage.getItem(RELOADED_KEY) === server) return;
      sessionStorage.setItem(RELOADED_KEY, server);

      window.location.reload();
    } catch {
      // Сеть могла отвалиться — это не повод мешать человеку.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  return null;
}
