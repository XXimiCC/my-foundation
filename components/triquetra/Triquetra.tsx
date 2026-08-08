'use client';

import { useId } from 'react';
import {
  MASK_RECT,
  MASK_REGION,
  RING_INNER,
  RING_OUTER,
  SHELLS,
  SHELL_ROTATION,
  VIEW_BOX,
  clamp01,
  maskOffset,
  petalPath,
  type Shell,
} from './geometry';

export interface TriquetraProps {
  /** Уровни оболочек, 0..100. */
  levels: Record<Shell, number>;
  /** Сила, 0..100. Управляет яркостью ядра и свечения. */
  sila: number;
  /**
   * Режим Поста: интерфейс намеренно обесцвечивается до костяного монохрома.
   * Приложение снижает собственную сенсорную награду, пока идёт Завет ПОСТ.
   */
  fasting?: boolean;
  /** Режим Тишины: всё гаснет, остаётся медленно вращающийся контур. */
  silence?: boolean;
  /** Подсветить одну оболочку — например слабое звено. */
  highlight?: Shell | null;
  className?: string;
  onShellClick?: (shell: Shell) => void;
}

const PETAL = petalPath();

export function Triquetra({
  levels,
  sila,
  fasting = false,
  silence = false,
  highlight = null,
  className,
  onShellClick,
}: TriquetraProps) {
  // useId даёт уникальные id при нескольких Триквестрах на странице —
  // иначе ссылки url(#...) перехватят чужие определения.
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;

  const s = clamp01(sila / 100);

  // Ядро загорается нелинейно: пока хоть одна оболочка отстаёт, центр тёмный.
  // Показатель 1.6 делает загорание поздним и заметным событием.
  const coreOpacity = silence ? 0 : Math.pow(s, 1.6);
  const bloomOpacity = silence ? 0.1 : 0.12 + s * 0.5;

  return (
    <svg
      viewBox={VIEW_BOX}
      className={className}
      role="img"
      aria-label={`Триквестр. Сила ${Math.round(sila)} из 100.`}
      data-fasting={fasting || undefined}
      data-silence={silence || undefined}
    >
      <defs>
        {/* Свечение запечено в радиальный градиент: feGaussianBlur в кадре
            уронил бы fps в webview Telegram на среднем Android. */}
        <radialGradient id={id('bloom')}>
          <stop offset="0%" stopColor="var(--tq-glow)" stopOpacity="0.55" />
          <stop offset="45%" stopColor="var(--tq-glow)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--tq-glow)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id('core')}>
          <stop offset="0%" stopColor="var(--tq-core-hot)" />
          <stop offset="60%" stopColor="var(--tq-gold-200)" />
          <stop offset="100%" stopColor="var(--tq-gold-600)" />
        </radialGradient>

        {/* Золото заполнения: у вершины ярче, к центру глубже. */}
        <linearGradient
          id={id('fill')}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={-RING_INNER}
          x2="0"
          y2={RING_INNER}
        >
          <stop offset="0%" stopColor="var(--tq-gold-200)" />
          <stop offset="55%" stopColor="var(--tq-gold-400)" />
          <stop offset="100%" stopColor="var(--tq-gold-600)" />
        </linearGradient>

        {/* По маске на оболочку: сдвиг по Y открывает лепесток от вершины внутрь. */}
        {SHELLS.map((shell) => (
          <mask
            key={shell}
            id={id(`mask-${shell}`)}
            maskUnits="userSpaceOnUse"
            {...MASK_REGION}
          >
            <rect
              {...MASK_RECT}
              fill="#fff"
              className="tq-fill"
              style={{ transform: `translateY(${maskOffset(levels[shell] / 100)}px)` }}
            />
          </mask>
        ))}

        {/* Ядро — пересечение всех трёх лепестков. Берём вложенными clipPath:
            корректно по построению, без подбора флагов дуг. */}
        <clipPath id={id('clip-0')}>
          <path d={PETAL} transform={`rotate(${SHELL_ROTATION.SPIRIT})`} />
        </clipPath>
        <clipPath id={id('clip-01')}>
          <path
            d={PETAL}
            transform={`rotate(${SHELL_ROTATION.MIND})`}
            clipPath={`url(#${id('clip-0')})`}
          />
        </clipPath>
        <clipPath id={id('clip-012')}>
          <path
            d={PETAL}
            transform={`rotate(${SHELL_ROTATION.BODY})`}
            clipPath={`url(#${id('clip-01')})`}
          />
        </clipPath>
      </defs>

      {/* Пепел вокруг — это Боль. Она не красная: в Догмате боль не зло,
          а инструмент Замысла. Она просто гасит золото. */}
      {/* Дыхание: чем ниже Сила, тем слабее и холоднее пульсация. */}
      <circle
        r={RING_OUTER * 1.02}
        fill={`url(#${id('bloom')})`}
        className="tq-bloom"
        style={
          {
            opacity: bloomOpacity,
            '--tq-breathe-low': bloomOpacity * (0.72 + s * 0.2),
            '--tq-breathe-high': bloomOpacity,
          } as React.CSSProperties
        }
      />

      <g className="tq-knot" data-spin={silence || undefined}>
        {/* Кольца обрамления, как на знаке Основания. */}
        <circle r={RING_OUTER} fill="none" stroke="var(--tq-ring)" strokeWidth={0.055} />
        <circle r={RING_INNER} fill="none" stroke="var(--tq-ring-thin)" strokeWidth={0.016} />

        {SHELLS.map((shell) => {
          const isDim = highlight !== null && highlight !== shell;
          return (
            <g
              key={shell}
              transform={`rotate(${SHELL_ROTATION[shell]})`}
              opacity={isDim ? 0.45 : 1}
              onClick={onShellClick ? () => onShellClick(shell) : undefined}
              style={{
                transition: 'opacity 400ms ease',
                cursor: onShellClick ? 'pointer' : undefined,
              }}
            >
              {/* Незаполненная часть — патина, потускневшее золото. */}
              <path d={PETAL} fill="var(--tq-patina)" fillOpacity={0.22} />
              {/* Заполненная часть. */}
              <path
                d={PETAL}
                fill={`url(#${id('fill')})`}
                mask={`url(#${id(`mask-${shell}`)})`}
              />
              {/* Контур существует всегда: он и есть принятая Основа. */}
              <path
                d={PETAL}
                fill="none"
                stroke={highlight === shell ? 'var(--tq-gold-200)' : 'var(--tq-outline)'}
                strokeWidth={0.02}
                style={{ transition: 'stroke 400ms ease' }}
              />
            </g>
          );
        })}

        {/* Ядро: загорается только при триединении всех трёх оболочек. */}
        <g clipPath={`url(#${id('clip-012')})`}>
          <rect
            x={-1}
            y={-1}
            width={2}
            height={2}
            fill={`url(#${id('core')})`}
            className="tq-core"
            style={{ opacity: coreOpacity }}
          />
        </g>
      </g>
    </svg>
  );
}
