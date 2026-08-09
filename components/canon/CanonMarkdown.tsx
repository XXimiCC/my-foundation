import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { anchorId, resolveHref, resolveWikiTarget } from '@/lib/canon/links';

/**
 * Отрисовка текста Канона.
 *
 * Типографика подчинена тому, что это догмат, а не статья: канонический
 * шрифт, крупный интерлиньяж, выделенные утверждения золотом — в тексте
 * жирным набраны именно убеждения, и они же становятся тезисами Слова Дня.
 */

interface Props {
  markdown: string;
  /** Заголовок документа уже показан в шапке — первый H1 не дублируем. */
  skipFirstHeading?: boolean;
}

export function CanonMarkdown({ markdown, skipFirstHeading = false }: Props) {
  const source = prepare(markdown, skipFirstHeading);

  return (
    <div className="canon-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <Heading level={1} {...p} />,
          h2: (p) => <Heading level={2} {...p} />,
          h3: (p) => <Heading level={3} {...p} />,
          h4: (p) => <Heading level={4} {...p} />,
          h5: (p) => <Heading level={5} {...p} />,
          h6: (p) => <Heading level={6} {...p} />,

          p: ({ children }) => <p className="my-4 leading-[1.75]">{children}</p>,

          // В Каноне жирный — это убеждение, а не акцент верстальщика.
          strong: ({ children }) => (
            <strong className="font-normal text-gold-200">{children}</strong>
          ),
          em: ({ children }) => <em className="text-bone/80">{children}</em>,
          del: ({ children }) => (
            <del className="text-mute decoration-mute/60">{children}</del>
          ),

          blockquote: ({ children }) => (
            <blockquote className="my-6 border-l-2 border-patina pl-4 text-bone/75 italic">
              {children}
            </blockquote>
          ),

          ul: ({ children }) => (
            <ul className="my-4 list-disc space-y-1.5 pl-5 marker:text-gold-600">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 list-decimal space-y-1.5 pl-5 marker:text-gold-600">{children}</ol>
          ),

          hr: () => <hr className="my-8 border-0 border-t border-warm-line" />,

          a: ({ href, children }) => <CanonLink href={href}>{children}</CanonLink>,

          img: () => null, // изображения хранилища в приложение не переносятся

          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-warm-line py-2 pr-4 text-left font-normal text-mute">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-warm-line py-2 pr-4 align-top">{children}</td>
          ),

          code: ({ children }) => (
            <code className="rounded bg-coal px-1.5 py-0.5 text-[0.9em] text-gold-200">
              {children}
            </code>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function Heading({
  level,
  children,
}: {
  level: number;
  children?: React.ReactNode;
}) {
  const text = plainText(children);
  const id = anchorId(text);
  const Tag = `h${Math.min(level + 1, 6)}` as 'h2';

  const size =
    level <= 1
      ? 'text-2xl mt-10'
      : level === 2
        ? 'text-xl mt-9'
        : level === 3
          ? 'text-lg mt-7'
          : 'text-base mt-6';

  return (
    <Tag
      id={id}
      className={`${size} mb-3 scroll-mt-20 text-gold-200`}
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </Tag>
  );
}

function CanonLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const resolved = resolveHref(href ?? '');

  // Цель за пределами Канона: показываем текст, но не ведём в никуда.
  if (!resolved.href) {
    return (
      <span
        className="text-bone/70 underline decoration-dotted decoration-patina underline-offset-4"
        title="Заметка лежит за пределами Канона"
      >
        {children}
      </span>
    );
  }

  if (resolved.external) {
    return (
      <a
        href={resolved.href}
        target="_blank"
        rel="noreferrer noopener"
        className="text-gold-400 underline decoration-gold-600/50 underline-offset-4 hover:text-gold-200"
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={resolved.href}
      className="text-gold-400 underline decoration-gold-600/50 underline-offset-4 hover:text-gold-200"
    >
      {children}
    </Link>
  );
}

/**
 * Wiki-ссылки Obsidian markdown не понимает, поэтому переводим их в обычные
 * до разбора. Цели вроде `[[депрессия]]` в Каноне нет — она станет
 * неактивной подписью, а не битой ссылкой.
 */
function prepare(markdown: string, skipFirstHeading: boolean): string {
  let out = markdown.replace(/\[\[([^\]]+)\]\]/g, (_, inner: string) => {
    const { target, label } = resolveWikiTarget(inner);
    return `[${label}](${encodeURI(target)}.md)`;
  });

  if (skipFirstHeading) {
    out = out.replace(/^\s*#\s+.+\r?\n/, '');
  }

  return out.trim();
}

function plainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return plainText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}
