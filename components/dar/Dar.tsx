'use client';

import Link from 'next/link';
import { useState } from 'react';
import { VersionBadge } from '@/components/system/VersionBadge';
import {
  GIFT_RESOURCES,
  RESOURCE_HINT,
  RESOURCE_LABEL,
  type DarView,
  type GiftResource,
} from '@/lib/core/dar';

/**
 * Завет ДАР.
 *
 * Экран умеет ровно одно: записать уже совершённое. Кнопки «запланировать
 * дар» нет — «не обещай благие деяния... если я не выполню своё обещание, то
 * мои невидимые потери будут во много раз больше». Кнопок «поделиться» и
 * «выгрузить» нет тем более: «не хвастайся своими благими деяниями».
 */

export function Dar({ initial }: { initial: DarView }) {
  const [view, setView] = useState(initial);
  const [resource, setResource] = useState<GiftResource | null>(null);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState<boolean | null>(null);

  const save = async () => {
    if (!resource) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resource, recipient, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не записалось');
      setView(data as DarView);
      setCounted(data.counted === true);
      setResource(null);
      setRecipient('');
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
    } finally {
      setBusy(false);
    }
  };

  const given = view.week.gifts.length;

  return (
    <main className="mx-auto flex h-full max-w-md flex-col gap-6 overflow-y-auto px-5 py-6">
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ДАР
        </h1>
        <p className="mt-2 text-sm text-mute">
          Силу даёт не то, что я имею, а то, что я могу.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЭТА НЕДЕЛЯ</h2>
          <span className="text-[0.62rem] tabular-nums text-mute">
            {given > 0 ? `${given} · норма закрыта` : 'нормы ещё нет'}
          </span>
        </div>

        {given === 0 && (
          <p className="text-sm text-mute">
            Начать стоит с простого: поздороваться, быть вежливым, озвучить достоинства
            человека при разговоре с третьими лицами.
          </p>
        )}

        <ul className="flex flex-col">
          {view.week.gifts.map((gift) => (
            <li key={gift.id} className="border-b border-warm-line py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-bone">
                  {RESOURCE_LABEL[gift.resource]}
                  {gift.recipient ? ` → ${gift.recipient}` : ''}
                </span>
                <span className="shrink-0 text-[0.62rem] tabular-nums text-mute">
                  {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
                    new Date(gift.at),
                  )}
                </span>
              </div>
              {gift.note && <p className="mt-0.5 text-[0.68rem] text-mute">{gift.note}</p>}
            </li>
          ))}
        </ul>

        <p className="text-[0.62rem] text-mute">
          {view.streak > 0
            ? `Недель подряд с Даром: ${view.streak}. `
            : ''}
          На прошлой неделе {view.previousWeek}.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ЧТО ОТДАНО</h2>

        <div className="grid grid-cols-3 gap-1.5">
          {GIFT_RESOURCES.map((r) => (
            <button
              key={r}
              onClick={() => setResource(resource === r ? null : r)}
              className={`rounded-sm border px-1 py-2.5 text-[0.68rem] transition-colors ${
                resource === r
                  ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                  : 'border-coal-lift text-mute hover:border-gold-600/40'
              }`}
            >
              {RESOURCE_LABEL[r]}
            </button>
          ))}
        </div>

        {resource && (
          <>
            <p className="text-[0.62rem] text-mute">{RESOURCE_HINT[resource]}</p>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Кому — можно без имени"
              maxLength={120}
              className="rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Что именно"
              className="rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
            />
            <button
              onClick={save}
              disabled={busy}
              className="self-start rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
            >
              {busy ? '…' : 'ЗАПИСАТЬ'}
            </button>
          </>
        )}

        {counted !== null && (
          <p className="text-[0.68rem] text-mute">
            {counted
              ? 'Недельная норма закрыта, Дух вырос. Пусть говорят поступки, пока я молчу.'
              : 'Записано. Уровень поднимает недельная норма, а не число записей.'}
          </p>
        )}
      </section>

      <p className="text-[0.62rem] text-mute">
        Записи видны только вам: делиться ими нельзя и незачем. Ответных действий
        ждать не нужно — это корысть, а она уничтожает смысл Завета.
      </p>

      {error && (
        <p className="text-sm text-frost" role="alert">
          {error}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-2">
        <Link href="/" className="text-[0.62rem] tracking-[0.15em] text-mute">
          ← НАЗАД
        </Link>
        <VersionBadge />
      </div>
    </main>
  );
}
