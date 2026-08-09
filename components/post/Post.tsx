'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FastingSkin } from '@/components/system/FastingSkin';
import { VersionBadge } from '@/components/system/VersionBadge';
import {
  ALLOWED,
  DOUBT_RULE,
  FOOD_ALLOWED,
  FOOD_BANS,
  INFO_BANS,
  SUMMARY_QUESTIONS,
  formatClock,
  type PostView,
} from '@/lib/core/post';

/**
 * Завет ПОСТ.
 *
 * Пока пост идёт, экран обесцвечен: `data-fasting` подменяет золото костью.
 * Это не украшение — приложение снижает собственную сенсорную награду вместе
 * с остальными источниками быстрых удовольствий.
 *
 * Сорванный день здесь фиксируется, но не наказывается: уровень не отнимается
 * никогда, а причина называется словами Основы 5 — мысли, эмоции, ситуация.
 */

const CAUSES = [
  { key: 'THOUGHTS', label: 'мысли' },
  { key: 'EMOTIONS', label: 'эмоции' },
  { key: 'SITUATION', label: 'ситуация' },
] as const;

function human(key: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00.000Z`));
}

function hoursMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
}

export function Post({ initial }: { initial: PostView }) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [cause, setCause] = useState<string | null>(null);
  const [summary, setSummary] = useState(initial.active?.summary ?? '');

  const send = async (method: 'POST' | 'PATCH', body: object, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch('/api/post', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не записалось');
      setView(data as PostView);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const active = view.active;
  const today = active?.today;

  return (
    <main className="mx-auto flex h-full max-w-md flex-col gap-6 overflow-y-auto px-5 py-6">
      <FastingSkin active={active !== null} />

      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ПОСТ
        </h1>
        <p className="mt-2 text-sm text-mute">
          Развитие не там, где потребление, а там где ограничения.
        </p>
      </header>

      {active ? (
        <>
          {/* ── Окно еды ─────────────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ОКНО ЕДЫ</h2>
              <span className="text-[0.62rem] tabular-nums text-mute">
                {formatClock(active.eat.from)} — {formatClock(active.eat.to)}
              </span>
            </div>
            <p className="text-lg text-bone" style={{ fontFamily: 'var(--font-display)' }}>
              {active.eat.open
                ? `Открыто, осталось ${hoursMinutes(active.eat.left)}`
                : `Закрыто, откроется через ${hoursMinutes(active.eat.until)}`}
            </p>
            <p className="text-[0.62rem] text-mute">
              Есть можно только днём: {FOOD_ALLOWED}.
            </p>
          </section>

          {/* ── Два запрета ──────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">
                {active.kind === 'REDEMPTION_MONTH' ? 'МЕСЯЦ ИСКУПЛЕНИЯ' : 'ДЕНЬ ОЧИЩЕНИЯ'}
              </h2>
              <span className="text-[0.62rem] tabular-nums text-mute">
                день {active.progress.day} из {active.progress.total} · соблюдено{' '}
                {active.progress.kept}
              </span>
            </div>

            <Ban
              title="Запрет на еду"
              hint={FOOD_BANS.join(', ')}
              ok={today?.foodOk ?? true}
              busy={busy === 'food'}
              onToggle={(ok) => send('PATCH', { foodOk: ok, cause }, 'food')}
            />
            <Ban
              title="Запрет на информацию"
              hint={INFO_BANS.join(' · ')}
              ok={today?.infoOk ?? true}
              busy={busy === 'info'}
              onToggle={(ok) => send('PATCH', { infoOk: ok, cause }, 'info')}
            />

            {today && !(today.foodOk && today.infoOk) && (
              <div className="flex flex-col gap-2 border-l-2 border-patina pl-3">
                <p className="text-[0.68rem] text-mute">
                  Срыв — это не «я плохой». Это значит, что я плохо проконтролировал
                  мысли, эмоции или ситуацию. Опыт вырос, уровень не отнят.
                </p>
                <div className="flex gap-1.5">
                  {CAUSES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => {
                        setCause(c.key);
                        void send('PATCH', { cause: c.key, note }, 'cause');
                      }}
                      className={`rounded-sm border px-2 py-1 text-[0.6rem] transition-colors ${
                        cause === c.key
                          ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                          : 'border-coal-lift text-mute hover:border-gold-600/40'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note.trim() && void send('PATCH', { note }, 'note')}
              rows={2}
              maxLength={2000}
              placeholder={
                active.journalDay
                  ? 'Дневниковый день: как идёт пост?'
                  : 'Заметка дня — необязательно'
              }
              className={`rounded-sm border bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600 ${
                active.journalDay ? 'border-gold-600/60' : 'border-ash'
              }`}
            />

            <p className="text-[0.62rem] text-mute">{DOUBT_RULE}</p>
          </section>

          {/* ── Итоги ────────────────────────────────────────────────── */}
          {active.kind === 'REDEMPTION_MONTH' &&
            active.progress.day >= active.progress.total && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ИТОГИ</h2>
                <ul className="flex flex-col gap-1">
                  {SUMMARY_QUESTIONS.map((q) => (
                    <li key={q} className="text-[0.68rem] text-mute">
                      — {q}
                    </li>
                  ))}
                </ul>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={8}
                  maxLength={20000}
                  className="rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
                  style={{ fontFamily: 'var(--font-canon)' }}
                />
                <button
                  onClick={() => send('PATCH', { summary }, 'summary')}
                  disabled={busy !== null}
                  className="self-start rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
                >
                  {busy === 'summary' ? '…' : 'СОХРАНИТЬ ИТОГИ'}
                </button>
              </section>
            )}

          <button
            onClick={() => send('PATCH', { finish: true }, 'finish')}
            disabled={busy !== null}
            className="self-start text-[0.62rem] tracking-[0.15em] text-mute transition-colors hover:text-gold-400 disabled:opacity-40"
          >
            {busy === 'finish' ? '…' : 'ЗАВЕРШИТЬ ПОСТ'}
          </button>
        </>
      ) : (
        <>
          {/* ── Ничего не идёт ───────────────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ДЕНЬ ОЧИЩЕНИЯ</h2>
            <p className="text-sm text-mute">
              Сутки без вкусной еды и развлекательной информации. Желателен, но не
              обязателен — и его можно использовать, если грустно или плохо.
            </p>
            {view.nextCleansing && (
              <p className="text-[0.68rem] text-mute">
                Ближайший по вашим дням:{' '}
                {view.nextCleansing === view.todayKey
                  ? 'сегодня'
                  : human(view.nextCleansing)}
                {view.recentCleansings > 0
                  ? ` · за месяц соблюдено ${view.recentCleansings}`
                  : ''}
              </p>
            )}
            <button
              onClick={() => send('POST', { kind: 'CLEANSING_DAY' }, 'start-day')}
              disabled={busy !== null}
              className="self-start rounded border border-gold-600/60 px-4 py-2 text-[0.62rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
            >
              {busy === 'start-day' ? '…' : 'НАЧАТЬ СЕГОДНЯ'}
            </button>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">МЕСЯЦ ИСКУПЛЕНИЯ</h2>
            <p className="text-sm text-mute">
              Обязательный пост: с 1 по 31 декабря. Каждый брат Основания обязан в конце
              года очистить свой мозг и тело.
            </p>

            {view.redemption.phase === 'далеко' && (
              <p className="text-[0.68rem] text-mute">
                До начала {view.redemption.daysUntil}{' '}
                {plural(view.redemption.daysUntil, 'день', 'дня', 'дней')}. Подготовка
                начинается 25 ноября.
              </p>
            )}

            {view.redemption.phase === 'подготовка' && (
              <p className="text-[0.68rem] text-gold-400">
                Подготовка: осталось {view.redemption.daysUntil}{' '}
                {plural(view.redemption.daysUntil, 'день', 'дня', 'дней')}. Соберите
                список того, чем займётесь вместо развлечений, и продумайте еду.
              </p>
            )}

            {(view.redemption.phase === 'идёт' || view.redemption.phase === 'итоги') && (
              <button
                onClick={() => send('POST', { kind: 'REDEMPTION_MONTH' }, 'start-month')}
                disabled={busy !== null}
                className="self-start rounded border border-gold-600/60 px-4 py-2 text-[0.62rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
              >
                {busy === 'start-month' ? '…' : 'НАЧАТЬ МЕСЯЦ ИСКУПЛЕНИЯ'}
              </button>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ПРАВИЛА</h2>
            <p className="text-sm text-bone">Нельзя есть вкусное: {FOOD_BANS.join(', ')}.</p>
            <p className="text-[0.68rem] text-mute">Можно: {FOOD_ALLOWED}.</p>
            <p className="mt-2 text-sm text-bone">Нельзя потреблять развлекательное:</p>
            <ul className="flex flex-col gap-0.5">
              {INFO_BANS.map((b) => (
                <li key={b} className="text-[0.68rem] text-mute">
                  — {b}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.68rem] text-mute">Можно: {ALLOWED.join(', ')}.</p>
            <p className="mt-2 text-[0.62rem] text-mute">{DOUBT_RULE}</p>
          </section>
        </>
      )}

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

/**
 * Запрет — не галочка «выполнено», а состояние: по умолчанию он соблюдён, и
 * человек отмечает нарушение. Так честнее: пост идёт, пока его не нарушили.
 */
function Ban({
  title,
  hint,
  ok,
  busy,
  onToggle,
}: {
  title: string;
  hint: string;
  ok: boolean;
  busy: boolean;
  onToggle: (ok: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-warm-line py-2">
      <div className="flex-1">
        <div className="text-sm text-bone">{title}</div>
        <div className="text-[0.62rem] text-mute">{hint}</div>
      </div>
      <button
        onClick={() => onToggle(!ok)}
        disabled={busy}
        className={`shrink-0 rounded border px-3 py-1.5 text-[0.6rem] tracking-[0.12em] transition-colors disabled:opacity-40 ${
          ok
            ? 'border-gold-600/60 text-gold-200 hover:bg-gold-600/15'
            : 'border-ash text-mute'
        }`}
      >
        {busy ? '…' : ok ? 'СОБЛЮДАЮ' : 'НАРУШЕН'}
      </button>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return many;
  switch (mod % 10) {
    case 1:
      return one;
    case 2:
    case 3:
    case 4:
      return few;
    default:
      return many;
  }
}
