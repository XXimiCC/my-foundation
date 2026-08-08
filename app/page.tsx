'use client';

import { useMemo, useState } from 'react';
import { Triquetra } from '@/components/triquetra/Triquetra';
import {
  SHELL_LABEL,
  SHELLS,
  applyAct,
  bol,
  levelsOf,
  passivityDays,
  sila,
  weakestShell,
  type Shell,
  type TriquetraState,
} from '@/lib/core/shells';

const INITIAL: TriquetraState = {
  BODY: { level: 46, lastActAt: new Date() },
  MIND: { level: 62, lastActAt: new Date() },
  SPIRIT: { level: 18, lastActAt: new Date() },
};

/**
 * Полигон Триквестра. Это не финальный экран приложения, а стенд для проверки
 * визуального ядра: заполнение оболочек, загорание ядра при триединении,
 * режимы Поста и Тишины.
 */
export default function Page() {
  const [state, setState] = useState<TriquetraState>(INITIAL);
  const [fasting, setFasting] = useState(false);
  const [silence, setSilence] = useState(false);

  const levels = levelsOf(state);
  const now = useMemo(() => new Date(), []);
  const force = sila(levels);
  const pain = bol(levels, passivityDays(state, now));
  const weakest = weakestShell(levels);

  const act = (shell: Shell) =>
    setState((prev) => ({ ...prev, [shell]: applyAct(prev[shell], shell, new Date()) }));

  const setLevel = (shell: Shell, level: number) =>
    setState((prev) => ({ ...prev, [shell]: { ...prev[shell], level } }));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-10">
      <header className="text-center">
        <h1
          className="text-3xl tracking-[0.35em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ОСНОВАНИЕ
        </h1>
        <p className="mt-2 text-xs tracking-widest text-ash">ТРИКВЕСТР · ПОЛИГОН</p>
      </header>

      <Triquetra
        levels={levels}
        sila={force}
        fasting={fasting}
        silence={silence}
        highlight={weakest}
        className="mx-auto w-full max-w-[20rem]"
        onShellClick={act}
      />

      <section className="grid grid-cols-2 gap-3 text-center">
        <Metric label="СИЛА" value={force} tone="gold" />
        <Metric label="БОЛЬ" value={pain} tone="ash" />
      </section>

      <p className="text-center text-sm text-bone/70">
        Слабое звено — <span className="text-gold-200">{SHELL_LABEL[weakest]}</span>. Устрани
        отставание.
      </p>

      <section className="flex flex-col gap-5">
        {SHELLS.map((shell) => (
          <div key={shell} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="tracking-widest text-bone/80">
                {SHELL_LABEL[shell].toUpperCase()}
              </span>
              <span className="tabular-nums text-gold-400">{levels[shell].toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={levels[shell]}
                onChange={(e) => setLevel(shell, Number(e.target.value))}
                className="h-1 w-full appearance-none rounded bg-coal-lift accent-gold-400"
                aria-label={`Уровень оболочки ${SHELL_LABEL[shell]}`}
              />
              <button
                onClick={() => act(shell)}
                className="shrink-0 rounded border border-gold-600/50 px-3 py-1 text-xs tracking-widest text-gold-200 transition-colors hover:bg-gold-600/15"
              >
                АКТ
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex justify-center gap-3">
        <Toggle active={fasting} onClick={() => setFasting((v) => !v)}>
          ПОСТ
        </Toggle>
        <Toggle active={silence} onClick={() => setSilence((v) => !v)}>
          ТИШИНА
        </Toggle>
        <Toggle
          active={false}
          onClick={() => setState({
            BODY: { level: 92, lastActAt: new Date() },
            MIND: { level: 90, lastActAt: new Date() },
            SPIRIT: { level: 88, lastActAt: new Date() },
          })}
        >
          ТРИЕДИНЕНИЕ
        </Toggle>
      </section>

      <p className="mt-auto text-center text-xs leading-relaxed text-ash">
        Ядро загорается только когда подняты все три оболочки. Накачать одну и получить Силу
        нельзя — так работает соразмерность.
      </p>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'gold' | 'ash';
}) {
  return (
    <div className="rounded-sm border border-coal-lift bg-coal px-4 py-3">
      <div className="text-[0.65rem] tracking-[0.3em] text-ash">{label}</div>
      <div
        className={`mt-1 text-2xl tabular-nums ${tone === 'gold' ? 'text-gold-400' : 'text-ash'}`}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {value.toFixed(0)}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-sm border px-3 py-2 text-[0.65rem] tracking-[0.2em] transition-colors ${
        active
          ? 'border-gold-400 bg-gold-600/20 text-gold-200'
          : 'border-coal-lift text-ash hover:border-gold-600/40'
      }`}
    >
      {children}
    </button>
  );
}
