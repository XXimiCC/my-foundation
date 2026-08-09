import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CanonMarkdown } from '@/components/canon/CanonMarkdown';
import { anchorId, docHref } from '@/lib/canon/links';
import { prisma } from '@/lib/db';

// Все 22 документа известны заранее — их незачем собирать по запросу.
export const revalidate = 3600;

export async function generateStaticParams() {
  const docs = await prisma.canonDoc.findMany({ select: { slug: true } });
  return docs.map((d) => ({ slug: d.slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

const KIND_LABEL: Record<string, string> = {
  INDEX: 'Оглавление',
  DOGMA: 'Догмат',
  FOUNDATION: 'Благородная Основа',
  COVENANT: 'Ритуальный Завет',
  ORDER: 'Орден',
  JOURNAL: 'Свидетельство',
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const doc = await prisma.canonDoc.findUnique({
    where: { slug },
    select: { title: true },
  });
  return { title: doc ? `${doc.title} — Основание` : 'Канон — Основание' };
}

export default async function CanonDocPage({ params }: Params) {
  const { slug } = await params;

  const doc = await prisma.canonDoc.findUnique({
    where: { slug },
    include: {
      sections: { orderBy: { order: 'asc' }, select: { anchor: true, heading: true, level: true } },
    },
  });

  if (!doc) notFound();

  const [prev, next] = await Promise.all([
    prisma.canonDoc.findFirst({
      where: { kind: doc.kind, order: { lt: doc.order } },
      orderBy: { order: 'desc' },
      select: { slug: true, title: true },
    }),
    prisma.canonDoc.findFirst({
      where: { kind: doc.kind, order: { gt: doc.order } },
      orderBy: { order: 'asc' },
      select: { slug: true, title: true },
    }),
  ]);

  // В оглавлении показываем только верхние уровни: глубокая вложенность
  // превращает его в дубль текста.
  const outline = doc.sections.filter((s) => s.level <= 2);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <nav className="mb-8 flex items-center justify-between text-[0.68rem] tracking-[0.2em]">
        <Link href="/kanon" className="text-mute hover:text-gold-200">
          ← КАНОН
        </Link>
        <span className="text-mute">{KIND_LABEL[doc.kind] ?? ''}</span>
      </nav>

      <header className="border-b border-warm-line pb-6">
        {doc.order > 0 && doc.kind !== 'JOURNAL' && (
          <div className="text-sm tabular-nums text-gold-600">{doc.order}</div>
        )}
        <h1
          className="mt-1 text-3xl leading-tight text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {doc.title}
        </h1>
      </header>

      {outline.length > 2 && (
        <nav className="mt-6 border-l border-patina pl-4">
          <ul className="flex flex-col gap-1.5">
            {outline.map((s) => (
              <li key={s.anchor}>
                <a
                  href={`#${anchorId(s.anchor)}`}
                  className={`text-sm hover:text-gold-200 ${
                    s.level === 1 ? 'text-bone/80' : 'pl-3 text-mute'
                  }`}
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <article className="mt-8">
        <CanonMarkdown markdown={doc.bodyMd} skipFirstHeading />
      </article>

      <nav className="mt-14 flex items-stretch justify-between gap-4 border-t border-warm-line pt-6 text-sm">
        {prev ? (
          <Link href={docHref(prev.slug)} className="group flex-1 text-left">
            <div className="text-[0.62rem] tracking-[0.2em] text-mute">ПРЕДЫДУЩЕЕ</div>
            <div className="mt-1 text-bone/85 group-hover:text-gold-200">{prev.title}</div>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
        {next ? (
          <Link href={docHref(next.slug)} className="group flex-1 text-right">
            <div className="text-[0.62rem] tracking-[0.2em] text-mute">СЛЕДУЮЩЕЕ</div>
            <div className="mt-1 text-bone/85 group-hover:text-gold-200">{next.title}</div>
          </Link>
        ) : (
          <span className="flex-1" />
        )}
      </nav>
    </main>
  );
}
