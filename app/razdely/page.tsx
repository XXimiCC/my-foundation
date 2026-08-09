import type { Metadata } from 'next';
import Link from 'next/link';
import { VersionBadge } from '@/components/system/VersionBadge';
import { SECTIONS, countByState, type SectionState } from '@/lib/sections';

export const metadata: Metadata = {
  title: 'Разделы — Основание',
  description: 'Что уже работает и что впереди.',
};

/**
 * Карта приложения.
 *
 * Показывает не только готовое, но и то, что впереди: иначе непонятно, чего
 * ждать, и сделанное кажется всем, что вообще будет.
 */

const ORDER: SectionState[] = ['готово', 'в работе', 'впереди'];

const HEADING: Record<SectionState, string> = {
  готово: 'Работает',
  'в работе': 'Делается сейчас',
  впереди: 'Впереди',
};

const MARK: Record<SectionState, string> = {
  готово: 'text-gold-400',
  'в работе': 'text-gold-600',
  впереди: 'text-mute',
};

export default function RazdelyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8 text-center">
        <h1
          className="text-2xl tracking-[0.3em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          РАЗДЕЛЫ
        </h1>
        <p className="mt-3 text-sm text-mute">
          Готово {countByState('готово')} из {SECTIONS.length}. Заветы открываются после
          Оснащения.
        </p>
      </header>

      <div className="flex flex-col gap-9">
        {ORDER.map((state) => {
          const list = SECTIONS.filter((s) => s.state === state);
          if (list.length === 0) return null;

          return (
            <section key={state}>
              <h2 className={`text-[0.68rem] tracking-[0.22em] ${MARK[state]}`}>
                {HEADING[state].toUpperCase()}
              </h2>

              <ul className="mt-3 flex flex-col">
                {list.map((section) => {
                  const body = (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <span
                          className={section.href ? 'text-bone' : 'text-bone/55'}
                          style={{ fontFamily: 'var(--font-display)' }}
                        >
                          {section.title}
                        </span>
                        {section.source && (
                          <span className="shrink-0 text-[0.62rem] text-mute">
                            {section.source}
                          </span>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-sm ${section.href ? 'text-mute' : 'text-mute/70'}`}
                      >
                        {section.purpose}
                      </p>
                    </>
                  );

                  return (
                    <li key={section.key} className="border-b border-warm-line">
                      {section.href ? (
                        <Link
                          href={section.href}
                          className="block py-3 transition-colors hover:bg-coal/60"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-10 flex justify-center">
        <VersionBadge />
      </footer>
    </main>
  );
}
