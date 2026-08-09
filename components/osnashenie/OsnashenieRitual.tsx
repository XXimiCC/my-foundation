'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Triquetra } from '@/components/triquetra/Triquetra';

/**
 * Ритуал Оснащения.
 *
 * Запрет №1: принятие должно быть добровольным и сознательным. Отсюда весь
 * строй экрана — Основы принимаются по одной, в порядке, а Договор набирается
 * руками. Кнопки «согласен со всем» здесь нет и не будет.
 */

export interface FoundationCard {
  no: number;
  title: string;
  slug: string;
  theses: string[];
}

const CONTRACT_LINE = 'Нет другой правды кроме Основания и Благородных Основ';

const EMPTY_LEVELS = { BODY: 0, MIND: 0, SPIRIT: 0 };

export function OsnashenieRitual({
  foundations,
  alreadyAccepted,
}: {
  foundations: FoundationCard[];
  alreadyAccepted: number[];
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(alreadyAccepted.length);
  const [stage, setStage] = useState<'warning' | 'foundations' | 'contract'>(
    alreadyAccepted.length > 0 ? 'foundations' : 'warning',
  );
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = foundations.length;
  const assembly = accepted / total;
  const current = foundations.find((f) => f.no === accepted + 1);

  async function acceptFoundation(no: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/osnashenie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ foundationNo: no }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не удалось принять');
      setAccepted(data.accepted);
      if (data.accepted >= total) setStage('contract');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось принять');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/osnashenie', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ finish: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не удалось завершить');
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не удалось завершить');
      setBusy(false);
    }
  }

  const contractMatches =
    typed.trim().toLowerCase().replace(/\s+/g, ' ') === CONTRACT_LINE.toLowerCase();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 py-8">
      <header className="text-center">
        <h1
          className="text-lg tracking-[0.35em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ОСНАЩЕНИЕ
        </h1>
        {stage !== 'warning' && (
          <p className="mt-2 text-[0.68rem] tracking-[0.16em] text-mute">
            ПРИНЯТО {accepted} ИЗ {total}
          </p>
        )}
      </header>

      <Triquetra
        levels={EMPTY_LEVELS}
        sila={0}
        assembly={assembly}
        className="mx-auto h-52 w-52 shrink-0"
      />

      {stage === 'warning' && <Warning onStart={() => setStage('foundations')} />}

      {stage === 'foundations' && current && (
        <FoundationStep
          card={current}
          busy={busy}
          onAccept={() => acceptFoundation(current.no)}
        />
      )}

      {stage === 'contract' && (
        <Contract
          typed={typed}
          onType={setTyped}
          matches={contractMatches}
          busy={busy}
          onFinish={finish}
        />
      )}

      {error && (
        <p className="text-center text-sm text-frost" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function Warning({ onStart }: { onStart: () => void }) {
  return (
    <section className="flex flex-col gap-5">
      <p className="text-bone/85" style={{ fontFamily: 'var(--font-canon)' }}>
        Дальше — принятие Договора Консенсуса из десяти Благородных Основ. Тот, кто его
        принял, становится Братом Основания.
      </p>

      <blockquote className="border-l-2 border-patina pl-4 text-bone/70 italic">
        Запрещено заставлять принимать договор консенсуса силой или хитростью. Это должен
        быть свободный выбор человека, который понимает что он делает.
      </blockquote>

      <p className="text-sm text-mute">
        Основы принимаются по одной и по порядку. Пройти ритуал одним нажатием нельзя —
        так устроен Запрет №1, а не интерфейс. Прерваться можно в любой момент:
        принятое сохранится.
      </p>

      <button
        onClick={onStart}
        className="rounded-sm border border-gold-600/60 px-4 py-3 text-[0.7rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15"
      >
        НАЧАТЬ ОСНАЩЕНИЕ
      </button>

      <Link href="/kanon" className="text-center text-sm text-mute hover:text-gold-200">
        Сначала прочитать Канон
      </Link>
    </section>
  );
}

function FoundationStep({
  card,
  busy,
  onAccept,
}: {
  card: FoundationCard;
  busy: boolean;
  onAccept: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div>
        <div className="text-sm tabular-nums text-gold-600">Основа {card.no}</div>
        <h2
          className="mt-1 text-2xl text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {card.title}
        </h2>
      </div>

      <ul className="flex flex-col gap-3" style={{ fontFamily: 'var(--font-canon)' }}>
        {card.theses.map((t) => (
          <li key={t} className="border-l-2 border-patina pl-4 text-bone/85">
            {t}
          </li>
        ))}
      </ul>

      <Link
        href={`/kanon/${card.slug}`}
        className="text-sm text-mute underline decoration-patina underline-offset-4 hover:text-gold-200"
      >
        Прочитать Основу целиком
      </Link>

      <button
        onClick={onAccept}
        disabled={busy}
        className="rounded-sm border border-gold-600/60 px-4 py-3 text-[0.7rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-50"
      >
        {busy ? 'ЗАПИСЫВАЕТСЯ…' : 'ПРИНИМАЮ'}
      </button>
    </section>
  );
}

function Contract({
  typed,
  onType,
  matches,
  busy,
  onFinish,
}: {
  typed: string;
  onType: (v: string) => void;
  matches: boolean;
  busy: boolean;
  onFinish: () => void;
}) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-xl text-gold-200" style={{ fontFamily: 'var(--font-display)' }}>
        Договор Консенсуса
      </h2>

      <blockquote
        className="border-l-2 border-patina pl-4 text-bone/85"
        style={{ fontFamily: 'var(--font-canon)' }}
      >
        Я принимаю Договор Консенсуса, во имя Разума, Тела и сакрального Духа. Это часть
        меня, мой сознательный выбор, мой смысл. Находясь в здравом уме и твёрдой памяти, Я
        добровольно отказываюсь от всех альтернативных смыслов и интерпретаций реальности,
        потому что они мешают Замыслу.
      </blockquote>

      <div className="flex flex-col gap-2">
        <label htmlFor="contract" className="text-sm text-mute">
          Наберите руками: «{CONTRACT_LINE}»
        </label>
        <textarea
          id="contract"
          value={typed}
          onChange={(e) => onType(e.target.value)}
          rows={3}
          spellCheck={false}
          className="rounded-sm border border-coal-lift bg-coal px-3 py-2 text-bone outline-none focus:border-gold-600"
          style={{ fontFamily: 'var(--font-canon)' }}
        />
        <p className="text-xs text-mute">
          Набор руками — не формальность: он и есть сознательность, которой требует Запрет №1.
        </p>
      </div>

      <button
        onClick={onFinish}
        disabled={!matches || busy}
        className="rounded-sm border border-gold-400 bg-gold-600/20 px-4 py-3 text-[0.7rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/30 disabled:border-coal-lift disabled:bg-transparent disabled:text-mute"
      >
        {busy ? 'ЗАМЫКАЕТСЯ…' : 'ЗАМКНУТЬ КРУГ'}
      </button>
    </section>
  );
}
