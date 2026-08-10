'use client';

import Link from 'next/link';
import { useState } from 'react';
import { VersionBadge } from '@/components/system/VersionBadge';
import type { SlovoView } from '@/lib/core/slovo';
import { RECALLS, type Recall } from '@/lib/core/srs';

/**
 * Слово Дня.
 *
 * Порядок экрана — это и есть механика Основы 6: сначала источник и начало
 * тезиса, попытка вспомнить, и только потом текст. Раскрыть, не попытавшись,
 * нельзя — иначе это просмотр, который Основа прямо отвергает.
 *
 * Заход конечен. Когда карточки кончились, экран говорит об этом и закрывается:
 * никакого «ещё немного» — Догма Лимита.
 */

const RECALL_HINT: Record<Recall, string> = {
  ЗАБЫЛ: 'вернётся завтра',
  'С ТРУДОМ': 'вернётся скоро',
  ВСПОМНИЛ: 'вернётся позже',
};

export function Slovo({ initial }: { initial: SlovoView }) {
  const [view, setView] = useState(initial);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState(false);

  const card = view.cards[index] ?? null;

  const answer = async (recall: Recall) => {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/slovo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thesisId: card.thesisId, recall }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не записалось');
      if (data.counted) setCounted(true);

      // Карточки этого захода отобраны заранее: подменять их на лету значило
      // бы удлинять заход, который человек уже видит конечным.
      setRevealed(false);
      setIndex((i) => i + 1);
      setView((v) => ({ ...v, done: data.done, complete: data.complete }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
    } finally {
      setBusy(false);
    }
  };

  const total = view.cards.length;

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          СЛОВО ДНЯ
        </h1>
        <p className="mt-1 text-[0.68rem] text-mute">
          {total > 0 && card
            ? `${index + 1} из ${total} · норма ${view.goal.target}`
            : 'Припоминать, а не просматривать'}
        </p>
      </header>

      {card ? (
        <section className="flex flex-1 flex-col gap-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.62rem] tracking-[0.22em] text-mute">
              {card.source.toUpperCase()}
            </span>
            {card.fresh && <span className="text-[0.62rem] text-gold-600">впервые</span>}
          </div>

          <p
            className="text-lg leading-relaxed text-bone"
            style={{ fontFamily: 'var(--font-canon)' }}
          >
            {revealed ? card.text : card.prompt}
          </p>

          {revealed ? (
            <div className="flex flex-col gap-2">
              <p className="text-[0.62rem] text-mute">Насколько получилось вспомнить?</p>
              <div className="flex flex-col gap-1.5">
                {RECALLS.map((recall) => (
                  <button
                    key={recall}
                    onClick={() => answer(recall)}
                    disabled={busy}
                    className="flex items-baseline justify-between rounded-sm border border-coal-lift px-3 py-2.5 text-left transition-colors hover:border-gold-600/40 disabled:opacity-40"
                  >
                    <span className="text-[0.68rem] tracking-[0.15em] text-bone">{recall}</span>
                    <span className="text-[0.62rem] text-mute">{RECALL_HINT[recall]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[0.62rem] text-mute">
                Продолжите про себя, а потом сверьтесь. Попытка важнее правильности:
                извлечение из памяти и есть то, что запоминает.
              </p>
              <button
                onClick={() => setRevealed(true)}
                className="self-start rounded border border-gold-600/60 px-4 py-2 text-[0.62rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15"
              >
                ПРОВЕРИТЬ
              </button>
            </div>
          )}

          <p className="mt-auto text-[0.62rem] text-mute">
            Знакомо {view.known} из {view.total} тезисов Канона.
          </p>
        </section>
      ) : (
        <section className="flex flex-1 flex-col gap-3">
          <p className="text-sm text-bone">
            {view.done > 0
              ? 'Заход пройден. Больше сегодня не нужно.'
              : 'Созревших тезисов на сегодня нет.'}
          </p>
          {counted && (
            <p className="text-[0.68rem] text-mute">
              Разум вырос на треть акта: припоминание — первая из трёх ступеней
              познания. Остаются понимание и практика.
            </p>
          )}
          <p className="text-[0.62rem] text-mute">
            {view.goal.trend === 'минимум'
              ? 'Норма опущена до минимума после перерыва — начните с малого, завтра сможете больше.'
              : view.goal.trend === 'рост'
                ? `Неделя подряд: норма выросла до ${view.goal.target}.`
                : `Норма на день — ${view.goal.target}. Регулярность важнее скорости.`}
          </p>
          <p className="text-[0.62rem] text-mute">
            Знакомо {view.known} из {view.total} тезисов Канона.
          </p>
        </section>
      )}

      {error && (
        <p className="text-sm text-frost" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <Link href="/" className="text-[0.62rem] tracking-[0.15em] text-mute">
          ← НАЗАД
        </Link>
        <VersionBadge />
      </div>
    </main>
  );
}
