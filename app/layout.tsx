import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { AppNav } from '@/components/system/AppNav';
import { TelegramInit } from '@/components/system/TelegramInit';
import { VersionGuard } from '@/components/system/VersionGuard';
import './globals.css';

export const metadata: Metadata = {
  title: 'Основание',
  description:
    'Догмат, 10 Благородных Основ и 6 Ритуальных Заветов как ежедневная практика.',
};

export const viewport: Viewport = {
  themeColor: '#07070A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Скрипт Telegram выполняется до гидратации и дописывает в <html> свои
    // переменные вьюпорта. React видит расхождение с серверной разметкой и
    // ругается в консоль у каждого, кто открыл приложение из Telegram.
    // Гасим предупреждение точечно на этом узле: атрибуты правит не наш код.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Скрипт Telegram обязан выполниться до нашего кода: без него
            window.Telegram отсутствует и вход внутри Telegram не сработает. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramInit />
        <VersionGuard />
        {/* Колонка на всю высоту: панель прижата книзу, а содержимое получает
            остаток. Иначе экран Триквестра с его h-dvh уезжал бы под панель.

            Вторая колонка внутри — чтобы экран мог растянуться на всю высоту
            через flex-1. Процентная высота (h-full) у родителя, которому задан
            только min-height, не разрешается: на коротких экранах подвал со
            ссылкой «назад» повисал посреди страницы. */}
        <div className="flex min-h-dvh flex-col">
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <AppNav />
        </div>
      </body>
    </html>
  );
}
