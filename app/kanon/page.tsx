import type { Metadata } from 'next';
import Link from 'next/link';
import { VersionBadge } from '@/components/system/VersionBadge';
import { prisma } from '@/lib/db';
import { docHref } from '@/lib/canon/links';

export const metadata: Metadata = {
  title: 'Канон — Основание',
  description: 'Догмат, 10 Благородных Основ и 6 Ритуальных Заветов.',
};

// Канон меняется только при импорте или правке в админке — держать его
// динамическим значило будить базу на каждый заход. Отсюда и был лаг.
export const revalidate = 3600;

/**
 * Оглавление Канона.
 *
 * Порядок разделов не алфавитный и не по дате: он повторяет устройство
 * Основания — Догмат объясняет ЗАЧЕМ, Основы отвечают КАК, Заветы говорят ЧТО
 * конкретно делать. Поэтому у каждого раздела стоит своя строка назначения.
 */

const SECTIONS = [
  {
    kind: 'DOGMA' as const,
    title: 'Догмат',
    hint: 'Зачем мы здесь. Истина, которая не подлежит сомнению.',
  },
  {
    kind: 'FOUNDATION' as const,
    title: '10 Благородных Основ',
    hint: 'Как реализовать Замысел. Мысли, которые дают силу.',
  },
  {
    kind: 'COVENANT' as const,
    title: '6 Ритуальных Заветов',
    hint: 'Что конкретно делать. Действия, которые дают силу.',
  },
  {
    kind: 'ORDER' as const,
    title: 'Орден',
    hint: 'Устройство братства и Доменов.',
  },
  {
    kind: 'JOURNAL' as const,
    title: 'Свидетельства',
    hint: 'Пройденные посты и их итоги.',
  },
];

export default async function KanonPage() {
  const docs = await prisma.canonDoc.findMany({
    where: { kind: { not: 'INDEX' } },
    orderBy: [{ kind: 'asc' }, { order: 'asc' }],
    select: { slug: true, kind: true, order: true, title: true, _count: { select: { theses: true } } },
  });

  const byKind = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = byKind.get(d.kind) ?? [];
    list.push(d);
    byKind.set(d.kind, list);
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-10 text-center">
        <Link
          href="/"
          className="text-[0.68rem] tracking-[0.2em] text-mute hover:text-gold-200"
        >
          ← ТРИКВЕСТР
        </Link>
        <h1
          className="mt-4 text-2xl tracking-[0.3em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          КАНОН
        </h1>
      </header>

      <div className="flex flex-col gap-10">
        {SECTIONS.map((section) => {
          const list = (byKind.get(section.kind) ?? []).sort((a, b) => a.order - b.order);
          if (list.length === 0) return null;

          return (
            <section key={section.kind}>
              <h2
                className="text-lg text-gold-200"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {section.title}
              </h2>
              <p className="mt-1 text-sm text-mute">{section.hint}</p>

              <ul className="mt-4 flex flex-col">
                {list.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={docHref(doc.slug)}
                      className="flex items-baseline gap-3 border-b border-warm-line py-3 transition-colors hover:bg-coal/60"
                    >
                      {doc.order > 0 && doc.kind !== 'JOURNAL' && (
                        <span className="w-5 shrink-0 text-right text-sm tabular-nums text-gold-600">
                          {doc.order}
                        </span>
                      )}
                      <span className="flex-1 text-bone">{stripPrefix(doc.title)}</span>
                      <span className="text-[0.7rem] tabular-nums text-mute">
                        {doc._count.theses}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="mt-10 flex flex-col items-center gap-3">
        <p className="text-center text-xs text-mute">
          Число справа — сколько тезисов документа участвует в Слове Дня.
        </p>
        <VersionBadge />
      </footer>
    </main>
  );
}

/** Номер уже показан отдельной колонкой — в заголовке он лишний. */
function stripPrefix(title: string): string {
  return title.replace(/^(Основа|Завет)\s+\d+\.\s*/, '');
}
