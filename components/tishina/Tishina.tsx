'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VersionBadge } from '@/components/system/VersionBadge';
import { RING_OUTER, VIEW_BOX } from '@/components/triquetra/geometry';
import { Triquetra } from '@/components/triquetra/Triquetra';
import {
  DURATIONS,
  STAGE_HINT,
  STAGE_LABEL,
  progressOf,
  stageAt,
  type DuhView,
  type Stage,
} from '@/lib/core/duh';
import type { Levels } from '@/lib/core/shells';

/**
 * Завет ДУХ — Тишина.
 *
 * Пока идёт практика, экран гаснет: остаётся вращающийся контур и кольцо-часы.
 * Цифр обратного отсчёта нет намеренно — «отключиться от реальности» плохо
 * сочетается с секундомером перед глазами, а взгляд на убывающие минуты и есть
 * тот самый внешний стимул, от которого Завет уводит.
 *
 * Ход времени считается от метки начала, а не тиканьем: webview Telegram
 * засыпает в фоне, и таймер на интервалах врёт. По той же причине начало
 * практики лежит в localStorage — перезагрузка вкладки не отменяет Тишину.
 */

const STORAGE_KEY = 'osnovanie:tishina';

/** Практика идёт вне сети: единственный запрос уходит по её завершении. */
interface Started {
  startedAt: number;
  minutes: number;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; started: Started }
  | { kind: 'done'; minutes: number; stage: Stage | null; counted: boolean };

export function Tishina({ initial, levels }: { initial: DuhView; levels: Levels }) {
  const [view, setView] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [planned, setPlanned] = useState<number>(20);
  const [elapsed, setElapsed] = useState(0);
  const [insights, setInsights] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finishing = useRef(false);

  // Незавершённая практика переживает перезагрузку вкладки.
  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const started = JSON.parse(raw) as Started;
      const done = (Date.now() - started.startedAt) / 60_000 >= started.minutes;
      if (done) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }
      setPlanned(started.minutes);
      setPhase({ kind: 'running', started });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const finish = useCallback(
    async (started: Started) => {
      if (finishing.current) return;
      finishing.current = true;
      setBusy(true);
      setError(null);
      window.localStorage.removeItem(STORAGE_KEY);

      try {
        const res = await fetch('/api/tishina', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            startedAt: new Date(started.startedAt).toISOString(),
            minutes: started.minutes,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'не записалось');
        setView(data as DuhView);
        setPhase({ kind: 'done', minutes: data.minutes, stage: data.stage, counted: data.counted });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'не записалось');
        setPhase({ kind: 'idle' });
      } finally {
        setBusy(false);
        finishing.current = false;
      }
    },
    [],
  );

  // Ход практики. Секунда — достаточная точность для кольца без цифр.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const started = phase.started;

    const tick = () => {
      const passed = (Date.now() - started.startedAt) / 60_000;
      setElapsed(passed);
      if (passed >= started.minutes) {
        // Единственный сигнал — короткий отклик Telegram, если он есть:
        // глаза во время практики закрыты, а звук нарушил бы саму Тишину.
        const haptic = (
          window as {
            Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred?: (t: string) => void } } };
          }
        ).Telegram?.WebApp?.HapticFeedback;
        haptic?.notificationOccurred?.('success');
        void finish(started);
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  const start = () => {
    const started: Started = { startedAt: Date.now(), minutes: planned };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(started));
    setElapsed(0);
    setInsights('');
    setPhase({ kind: 'running', started });
  };

  const saveInsights = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tishina', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ insights }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'не записалось');
      setView(data as DuhView);
      setPhase({ kind: 'idle' });
      setInsights('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не записалось');
    } finally {
      setBusy(false);
    }
  };

  // ── Практика ──────────────────────────────────────────────────────────
  if (phase.kind === 'running') {
    const stage = stageAt(elapsed);
    const progress = progressOf(elapsed, phase.started.minutes);

    return (
      // min-h-dvh, а не h-full: процент высоты у main разрешается по родителю,
      // у которого задан только min-height, и фигура прижималась к верху.
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-8">
        <div className="relative aspect-square w-full max-w-[19rem]">
          <Triquetra levels={levels} sila={0} silence className="absolute inset-0 h-full w-full" />
          {/* Кольцо-часы: единственный указатель времени. Патина, а не золото —
              оно не должно тянуть на себя внимание. */}
          <svg viewBox={VIEW_BOX} className="absolute inset-0 h-full w-full" aria-hidden>
            <circle
              r={RING_OUTER * 1.06}
              fill="none"
              stroke="var(--color-patina)"
              strokeWidth={0.01}
              pathLength={1}
              strokeDasharray={`${progress} 1`}
              transform="rotate(-90)"
            />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-[0.62rem] tracking-[0.22em] text-mute/70">
            {STAGE_LABEL[stage].toUpperCase()}
          </p>
          <p className="mt-2 max-w-xs text-sm text-mute/60">{STAGE_HINT[stage]}</p>
        </div>

        <button
          onClick={() => void finish(phase.started)}
          disabled={busy}
          className="text-[0.62rem] tracking-[0.2em] text-mute/60 transition-colors hover:text-mute disabled:opacity-40"
        >
          {busy ? '…' : 'ЗАВЕРШИТЬ'}
        </button>
      </main>
    );
  }

  // ── После практики ────────────────────────────────────────────────────
  if (phase.kind === 'done') {
    return (
      <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-5 overflow-y-auto px-5 py-10">
        <header className="text-center">
          <h1
            className="text-lg tracking-[0.4em] text-gold-200"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            ВОЗНЕСЕНИЕ
          </h1>
          <p className="mt-2 text-sm text-mute">
            {phase.minutes} мин тишины
            {phase.stage ? ` · ${STAGE_LABEL[phase.stage]}` : ''}
          </p>
          <p className="mt-1 text-[0.68rem] text-mute">
            {phase.counted
              ? 'Дух вырос. Завтра он будет лучше, чем сегодня.'
              : 'Практика записана. Уровень поднимает ежедневная тишина, а не число подходов.'}
          </p>
        </header>

        <div className="flex flex-col gap-2">
          <label htmlFor="insights" className="text-[0.62rem] tracking-[0.22em] text-mute">
            МЫСЛИ И ОЗАРЕНИЯ
          </label>
          <textarea
            id="insights"
            value={insights}
            onChange={(e) => setInsights(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="Что пришло в тишине"
            className="rounded-sm border border-ash bg-coal px-3 py-2 text-sm text-bone outline-none focus:border-gold-600"
            style={{ fontFamily: 'var(--font-canon)' }}
          />
          <p className="text-[0.62rem] text-mute">
            «Это нужно делать каждый день и записывать свои мысли и озарения.»
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={saveInsights}
            disabled={busy || insights.trim().length === 0}
            className="rounded border border-gold-600/60 px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15 disabled:opacity-40"
          >
            {busy ? '…' : 'ЗАПИСАТЬ'}
          </button>
          <button
            onClick={() => setPhase({ kind: 'idle' })}
            className="px-3 py-1.5 text-[0.62rem] tracking-[0.15em] text-mute"
          >
            БЕЗ ЗАПИСИ
          </button>
        </div>

        {error && (
          <p className="text-sm text-frost" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  // ── До практики ───────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-6 overflow-y-auto px-5 py-6">
      <header className="text-center">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ТИШИНА
        </h1>
        <p className="mt-2 text-sm text-mute">
          Без устройств, без звуков, без людей. Только я и мои свободно блуждающие
          мысли.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">СКОЛЬКО</h2>
        <div className="grid grid-cols-4 gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setPlanned(d)}
              className={`rounded-sm border py-2.5 text-sm tabular-nums transition-colors ${
                planned === d
                  ? 'border-gold-400 bg-gold-600/20 text-gold-200'
                  : 'border-coal-lift text-mute hover:border-gold-600/40'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <p className="text-[0.62rem] text-mute">
          Стадии приходят по времени: Сюжет сразу, Озарение с восьмой минуты, Скука
          с двадцатой. Пятиминутка честно остаётся Сюжетом.
        </p>
        <button
          onClick={start}
          className="self-start rounded border border-gold-600/60 px-4 py-2 text-[0.62rem] tracking-[0.2em] text-gold-200 transition-colors hover:bg-gold-600/15"
        >
          ЗАМЕДЛИТЬСЯ
        </button>
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ПРАКТИКА</h2>
        <p className="text-sm text-bone">
          {view.today.practiced
            ? `Сегодня ${view.today.minutes} мин`
            : 'Сегодня тишины ещё не было'}
        </p>
        <p className="text-[0.68rem] text-mute">
          За неделю {view.week.sessions} {plural(view.week.sessions, 'практика', 'практики', 'практик')} ·{' '}
          {view.week.minutes} мин
        </p>
      </section>

      {view.last.some((s) => s.insights) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[0.62rem] tracking-[0.22em] text-mute">ПОСЛЕДНИЕ ОЗАРЕНИЯ</h2>
          {view.last
            .filter((s) => s.insights)
            .map((s) => (
              <div key={s.at} className="border-l-2 border-patina pl-3">
                <p className="text-[0.62rem] text-mute">
                  {new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
                    new Date(s.at),
                  )}{' '}
                  · {s.minutes} мин
                  {s.stage ? ` · ${STAGE_LABEL[s.stage]}` : ''}
                </p>
                <p
                  className="mt-1 whitespace-pre-line text-sm text-bone/85"
                  style={{ fontFamily: 'var(--font-canon)' }}
                >
                  {s.insights}
                </p>
              </div>
            ))}
        </section>
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
