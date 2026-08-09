'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  BAY_ANGLE,
  MASK_REGION,
  RING_INNER,
  RING_OUTER,
  SHELLS,
  SHELL_ROTATION,
  TIP,
  VIEW_BOX,
  MASK_RECT,
  bayPoint,
  clamp01,
  maskOffset,
  petalPath,
  type Shell,
} from './geometry';

/** Надпись в одном из свободных промежутков между лепестками. */
export interface Readout {
  label: string;
  value: string;
  tone?: 'gold' | 'frost';
}

export interface TriquetraReadouts {
  /** Слева — Сила. */
  left?: Readout;
  /** Справа — Боль. */
  right?: Readout;
  /** Снизу — слабое звено или текущая оболочка. */
  bottom?: Readout;
}

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
  /**
   * Показания в промежутках между лепестками. Рисуются внутри SVG, поэтому
   * привязаны к геометрии и не зависят от того, как контейнер вписал фигуру.
   */
  readouts?: TriquetraReadouts;
  /**
   * Сборка знака во время Оснащения, 0..1.
   *
   * До принятия Договора Триквестра не существует: контур достраивается по
   * мере принятых Основ. Девять вычерчивают три оболочки, по три сегмента на
   * каждую, десятая замыкает круг. Пока идёт сборка, заполнения и ядра нет —
   * их нечем заполнять.
   */
  assembly?: number;
  className?: string;
  onShellClick?: (shell: Shell) => void;
}

/** Доля контура, приходящаяся на лепестки. Остальное — замыкающее кольцо. */
const PETALS_SHARE = 0.9;

const PETAL = petalPath();

export function Triquetra({
  levels,
  sila,
  fasting = false,
  silence = false,
  highlight = null,
  readouts,
  assembly,
  className,
  onShellClick,
}: TriquetraProps) {
  const assembling = assembly !== undefined && assembly < 1;
  // useId даёт уникальные id при нескольких Триквестрах на странице —
  // иначе ссылки url(#...) перехватят чужие определения.
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${name}-${uid}`;

  // Заполнение анимируется твином, а не CSS-переходом: точки многоугольника
  // интерполировать переходом нельзя, а преобразования внутри маски
  // применять нельзя тем более.
  const shown = useTweenedLevels(levels);

  const s = clamp01(sila / 100);

  // Ядро загорается нелинейно: пока хоть одна оболочка отстаёт, центр тёмный.
  // Показатель 1.6 делает загорание поздним и заметным событием.
  const coreOpacity = silence || assembling ? 0 : Math.pow(s, 1.6);
  // Во время сборки свечения нет: светиться нечему, Договор ещё не принят.
  const bloomOpacity = silence ? 0.1 : assembling ? 0 : 0.12 + s * 0.5;

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

        {/* Золото заполнения: у вершины ярче, к центру глубже.
            Градиент радиальный, а не линейный: он симметричен относительно
            поворота, поэтому все три лепестка выглядят одинаково. Линейный
            разрешался в корневых координатах и делал нижние лепестки темнее
            верхнего — казалось, будто они залиты слабее. */}
        <radialGradient id={id('fill')} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={TIP}>
          <stop offset="0%" stopColor="var(--tq-gold-600)" />
          <stop offset="55%" stopColor="var(--tq-gold-400)" />
          <stop offset="100%" stopColor="var(--tq-gold-200)" />
        </radialGradient>

        {/* По маске на оболочку: сдвиг по Y открывает лепесток от вершины внутрь. */}
        {SHELLS.map((shell) => (
          <mask
            key={shell}
            id={id(`mask-${shell}`)}
            maskUnits="userSpaceOnUse"
            {...MASK_REGION}
          >
            {/* Ни одного transform — ни атрибутом, ни через CSS.
                Содержимое маски разрешается в системе координат ссылающегося
                элемента, то есть уже повёрнутой вместе с лепестком. Значит
                прямоугольник и так выровнен по оси лепестка, и достаточно
                двигать его атрибутом y. Любая попытка добавить сюда поворот
                или CSS-перенос ломала заливку у повёрнутых лепестков. */}
            <rect
              x={MASK_RECT.x}
              y={MASK_RECT.y + maskOffset(shown[shell] / 100)}
              width={MASK_RECT.width}
              height={MASK_RECT.height}
              fill="#fff"
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
        {/* Призрачный контур во время сборки: пустота на месте знака читалась
            бы как поломка, а так видно, что именно предстоит вычертить. */}
        {assembling && (
          <g stroke="var(--tq-patina)" fill="none" opacity={0.28}>
            <circle r={RING_OUTER} strokeWidth={0.012} />
            <circle r={RING_INNER} strokeWidth={0.008} />
            {SHELLS.map((shell) => (
              <path
                key={shell}
                d={PETAL}
                transform={`rotate(${SHELL_ROTATION[shell]})`}
                strokeWidth={0.01}
              />
            ))}
          </g>
        )}

        {/* Кольца обрамления, как на знаке Основания. Во время Оснащения
            внешнее кольцо замыкается последней, десятой Основой. */}
        <circle
          r={RING_OUTER}
          fill="none"
          stroke="var(--tq-ring)"
          strokeWidth={0.055}
          pathLength={1}
          strokeDasharray={assembling ? `${ringProgress(assembly)} 1` : undefined}
          className={assembling ? 'tq-assemble' : undefined}
        />
        <circle
          r={RING_INNER}
          fill="none"
          stroke="var(--tq-ring-thin)"
          strokeWidth={0.016}
          pathLength={1}
          strokeDasharray={assembling ? `${ringProgress(assembly)} 1` : undefined}
          className={assembling ? 'tq-assemble' : undefined}
        />

        {/* Яркость лепестка означает ТОЛЬКО уровень заполнения.
            Подсветка выбранной оболочки идёт контуром: раньше остальные
            приглушались до 0.45, и залитый лепесток выглядел полупустым —
            два разных смысла боролись за один канал. */}
        {SHELLS.map((shell, index) => {
          const isActive = highlight === shell;
          const drawn = assembling ? petalProgress(assembly, index) : 1;
          return (
            <g
              key={shell}
              data-petal={shell}
              transform={`rotate(${SHELL_ROTATION[shell]})`}
              onClick={onShellClick ? () => onShellClick(shell) : undefined}
              style={{ cursor: onShellClick ? 'pointer' : undefined }}
            >
              {/* Во время сборки заполнять нечего: Договор ещё не принят. */}
              {!assembling && (
                <>
                  {/* Незаполненная часть — патина, потускневшее золото. */}
                  <path d={PETAL} fill="var(--tq-patina)" fillOpacity={0.22} />
                  {/* Заполненная часть. */}
                  <path
                    d={PETAL}
                    fill={`url(#${id('fill')})`}
                    mask={`url(#${id(`mask-${shell}`)})`}
                  />
                </>
              )}
              {/* Контур существует всегда: он и есть принятая Основа.
                  Он же несёт подсветку выбранной оболочки. */}
              <path
                d={PETAL}
                fill="none"
                stroke={isActive ? 'var(--tq-gold-200)' : 'var(--tq-outline)'}
                strokeWidth={isActive ? 0.032 : 0.02}
                pathLength={1}
                strokeDasharray={assembling ? `${drawn} 1` : undefined}
                className={assembling ? 'tq-assemble' : undefined}
                style={{ transition: 'stroke 400ms ease, stroke-width 400ms ease' }}
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

      {!silence && readouts && (
        <g>
          <BayText point={bayPoint(BAY_ANGLE.LEFT)} readout={readouts.left} />
          <BayText point={bayPoint(BAY_ANGLE.RIGHT)} readout={readouts.right} />
          <BayText point={bayPoint(BAY_ANGLE.BOTTOM)} readout={readouts.bottom} small />
        </g>
      )}
    </svg>
  );
}

/**
 * Сколько контура лепестка вычерчено при общей готовности сборки.
 * Девять Основ распределяются по три на оболочку.
 */
function petalProgress(assembly: number, index: number): number {
  const per = PETALS_SHARE / SHELLS.length;
  return clamp01((clamp01(assembly) - index * per) / per);
}

/** Кольцо замыкается последней, десятой Основой. */
function ringProgress(assembly: number): number {
  return clamp01((clamp01(assembly) - PETALS_SHARE) / (1 - PETALS_SHARE));
}

const TWEEN_MS = 900;

/**
 * Плавно подтягивает показанные уровни к заданным.
 *
 * При включённом «уменьшить движение» значение проставляется сразу: в Основе 4
 * прямо сказано, что приложение не имеет права быть источником беспокойства.
 */
function useTweenedLevels(target: Record<Shell, number>): Record<Shell, number> {
  const [shown, setShown] = useState(target);
  const frame = useRef<number | null>(null);
  const from = useRef(target);
  const startedAt = useRef(0);

  const key = SHELLS.map((s) => target[s]).join(',');

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setShown(target);
      return;
    }

    from.current = shown;
    startedAt.current = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt.current) / TWEEN_MS);
      // Плавное замедление к концу — золото «доливается», а не щёлкает.
      const e = 1 - Math.pow(1 - t, 3);
      setShown({
        BODY: lerp(from.current.BODY, target.BODY, e),
        MIND: lerp(from.current.MIND, target.MIND, e),
        SPIRIT: lerp(from.current.SPIRIT, target.SPIRIT, e),
      });
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // Пересчёт запускается только при смене целевых уровней.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return shown;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Надпись в промежутке между лепестками. Размеры заданы в единицах viewBox,
 * поэтому композиция сохраняет пропорции при любом размере фигуры.
 */
function BayText({
  point,
  readout,
  small = false,
}: {
  point: { x: number; y: number };
  readout?: Readout;
  small?: boolean;
}) {
  if (!readout) return null;

  const valueFill =
    readout.tone === 'frost' ? 'var(--tq-readout-frost)' : 'var(--tq-readout-gold)';

  return (
    <>
      <text
        x={point.x}
        y={point.y - 0.06}
        textAnchor="middle"
        fill="var(--tq-readout-mute)"
        fontSize={0.075}
        letterSpacing={0.016}
      >
        {readout.label}
      </text>
      <text
        x={point.x}
        y={point.y + (small ? 0.11 : 0.16)}
        textAnchor="middle"
        fill={valueFill}
        fontSize={small ? 0.12 : 0.2}
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {readout.value}
      </text>
    </>
  );
}
