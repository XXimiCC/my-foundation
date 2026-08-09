'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_SECTIONS } from '@/lib/sections';

/**
 * Нижняя панель. Ведёт только туда, что уже работает; всё остальное —
 * на странице «Разделы», где видно и то, что впереди.
 *
 * Панель намеренно бедная: приложение не должно приглашать к блужданию.
 * Сессия заканчивается, когда ритуал выполнен — иначе оно само нарушает
 * Завет ПОСТ.
 */

const MORE = { href: '/razdely', title: 'Разделы' };

export function AppNav() {
  const pathname = usePathname();

  // На ритуальных экранах панель мешает: Оснащение и вход проходят целиком.
  if (pathname.startsWith('/osnashenie') || pathname.startsWith('/vhod')) return null;

  const items = [...NAV_SECTIONS.map((s) => ({ href: s.href, title: s.title })), MORE];

  return (
    <nav className="sticky bottom-0 border-t border-warm-line bg-obsidian/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active =
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`block px-2 py-3 text-center text-[0.62rem] tracking-[0.14em] transition-colors ${
                  active ? 'text-gold-200' : 'text-mute hover:text-gold-400'
                }`}
              >
                {item.title.toUpperCase()}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
