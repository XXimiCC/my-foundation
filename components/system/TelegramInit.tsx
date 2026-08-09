'use client';

import { useEffect } from 'react';

/**
 * Настройка окна Mini App.
 *
 * Тема принудительно тёмная: у Триквестра нет светлой версии — Сила есть
 * свет, Боль есть темнота вокруг, и на белом фоне эта метафора рассыпается.
 * Вертикальные свайпы отключаются, иначе жест закрывает приложение прямо
 * посреди Тишины или перетаскивания ползунка.
 */

interface WebApp {
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  initData?: string;
}

const OBSIDIAN = '#07070A';

export function TelegramInit() {
  useEffect(() => {
    const app = (window as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
    if (!app) return;

    app.ready?.();
    app.expand?.();
    // Методы появились в разных версиях клиента — старые их просто не знают.
    app.setHeaderColor?.(OBSIDIAN);
    app.setBackgroundColor?.(OBSIDIAN);
    app.disableVerticalSwipes?.();
  }, []);

  return null;
}
