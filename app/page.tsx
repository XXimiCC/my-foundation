'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Triquetra } from '@/components/triquetra/Triquetra';
import { BAY_ANGLE, bayPosition } from '@/components/triquetra/geometry';
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

/** Сколько подсветка держится на оболочке после того, как отпустили ползунок. */
const TOUCH_LINGER_MS = 700;

/**
 * Полигон Триквестра — стенд визуального ядра.
 *
 * Компоновка подчинена одному требованию: Триквестр и ползунки должны
 * помещаться на одном экране, иначе не видно, как движение ползунка меняет
 * Силу и Боль. Поэтому метрики вынесены в «заливы» — свободные промежутки
 * между лепестками, и не занимают высоту под фигурой.
 */
export default function Page() {
  const [state, setState] = useState<TriquetraState>(INITIAL);
  const [fasting, setFasting] = useState(false);
  const [silence, setSilence] = useState(false);

  // Пока человек двигает ползунок, подсвечивается ИМЕННО эта оболочка.
  // Иначе подсветка слабого звена перескакивает на другой лепесток ровно в
  // тот момент, когда оболочка обгоняет соседнюю, и выглядит это так, будто
  // ползунок управляет чужой лопастью.
  const [touched, setTouched] = useState<Shell | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdTouch = useCallback((shell: Shell) => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    setTouched(shell);
  }, []);

  const releaseTouch = useCallback(() => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setTouched(null), TOUCH_LINGER_MS);
  }, []);

  useEffect(() => () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
  }, []);

  const levels = levelsOf(state);
  const now = useMemo(() => new Date(), []);
  const force = sila(levels);
  const pain = bol(levels, passivityDays(state, now));
  const weakest = weakestShell(levels);

  const highlight = touched ?? weakest;

  const act = (shell: Shell) => {
    holdTouch(shell);
    setState((prev) => ({ ...prev, [shell]: applyAct(prev[shell], shell, new Date()) }));
    releaseTouch();
  };

  const setLevel = (shell: Shell, level: number) =>
    setState((prev) => ({ ...prev, [shell]: { ...prev[shell], level } }));

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col gap-3 px-5 py-4">
      <header className="flex items-baseline justify-between">
        <h1
          className="text-xl tracking-[0.4em] text-gold-200"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          ОСНОВАНИЕ
        </h1>
        <Link
          href="/kanon"
          className="text-[0.68rem] tracking-[0.2em] text-mute transition-colors hover:text-gold-200"
        >
          КАНОН →
        </Link>
      </header>

      {/* Квадрат подстраивается под остаток высоты, поэтому ползунки внизу
          никогда не уезжают за экран. */}
      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="relative aspect-square h-full max-h-full max-w-full">
          <Triquetra
            levels={levels}
            sila={force}
            fasting={fasting}
            silence={silence}
            highlight={highlight}
            className="absolute inset-0 h-full w-full"
            onShellClick={act}
          />

          <Bay angle={BAY_ANGLE.LEFT}>
            <Metric label="СИЛА" value={force} tone="gold" />
          </Bay>

          <Bay angle={BAY_ANGLE.RIGHT}>
            <Metric label="БОЛЬ" value={pain} tone="frost" />
          </Bay>

          <Bay angle={BAY_ANGLE.BOTTOM}>
            <div className="text-center leading-tight">
              <div className="text-[0.68rem] tracking-[0.16em] text-mute">
                {touched ? 'ОБОЛОЧКА' : 'СЛАБОЕ ЗВЕНО'}
              </div>
              <div
                className="text-base text-gold-200"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {SHELL_LABEL[highlight]}
              </div>
            </div>
          </Bay>
        </div>
      </div>

      <section className="flex shrink-0 flex-col gap-2.5">
        {SHELLS.map((shell) => (
          <div key={shell} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between text-xs">
              <span
                className={`tracking-[0.2em] transition-colors ${
                  highlight === shell ? 'text-gold-200' : 'text-bone/70'
                }`}
              >
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
                onChange={(e) => {
                  holdTouch(shell);
                  setLevel(shell, Number(e.target.value));
                }}
                onPointerDown={() => holdTouch(shell)}
                onPointerUp={releaseTouch}
                onPointerCancel={releaseTouch}
                onFocus={() => holdTouch(shell)}
                onBlur={releaseTouch}
                className="h-1 w-full appearance-none rounded bg-coal-lift accent-gold-400"
                aria-label={`Уровень оболочки ${SHELL_LABEL[shell]}`}
              />
              <button
                onClick={() => act(shell)}
                className="shrink-0 rounded border border-gold-600/50 px-2.5 py-1 text-[0.6rem] tracking-[0.15em] text-gold-200 transition-colors hover:bg-gold-600/15"
              >
                АКТ
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex shrink-0 justify-center gap-2">
        <Toggle active={fasting} onClick={() => setFasting((v) => !v)}>
          ПОСТ
        </Toggle>
        <Toggle active={silence} onClick={() => setSilence((v) => !v)}>
          ТИШИНА
        </Toggle>
        <Toggle
          active={false}
          onClick={() =>
            setState({
              BODY: { level: 92, lastActAt: new Date() },
              MIND: { level: 90, lastActAt: new Date() },
              SPIRIT: { level: 88, lastActAt: new Date() },
            })
          }
        >
          ТРИЕДИНЕНИЕ
        </Toggle>
      </section>
    </main>
  );
}

/** Абсолютное позиционирование в свободном промежутке между лепестками. */
function Bay({ angle, children }: { angle: number; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
      style={bayPosition(angle)}
    >
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'gold' | 'frost';
}) {
  return (
    <div className="text-center leading-none">
      <div className="text-[0.68rem] tracking-[0.16em] text-mute">{label}</div>
      <div
        className={`mt-1 text-3xl tabular-nums ${tone === 'gold' ? 'text-gold-400' : 'text-frost'}`}
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
      className={`rounded-sm border px-2.5 py-1.5 text-[0.6rem] tracking-[0.15em] transition-colors ${
        active
          ? 'border-gold-400 bg-gold-600/20 text-gold-200'
          : 'border-coal-lift text-mute hover:border-gold-600/40'
      }`}
    >
      {children}
    </button>
  );
}
