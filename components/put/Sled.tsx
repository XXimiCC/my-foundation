import type { TrailDay } from '@/lib/core/put';
import { spiralPath, spiralPoints } from './spiral';

/**
 * След пройденного — «в конце тяжёлого дня обернитесь назад и рассмотрите свои
 * следы: как много вы прошли» (Догма Следа).
 *
 * Не тепловая карта: карта показывает «сколько закрашено», а Завет требует
 * увидеть ПУТЬ — непрерывную линию, по которой человек шёл. Отсюда спираль,
 * идущая из центра наружу к сегодняшнему дню.
 *
 * Яркость точки означает ровно одно — Силу того дня, то есть заполнение. Тот
 * же закон, что в Триквестре: приглушённый полный день читался бы как
 * наполовину пустой. Поэтому выделение сегодняшнего дня и выполненной
 * Декларации идёт обводкой, а не яркостью.
 */

const DOT = 0.045;

/** Сила 0 → едва тлеет, Сила 100 → горит. Ниже 0.25 точка неразличима. */
function glow(sila: number): number {
  return 0.25 + (Math.max(0, Math.min(100, sila)) / 100) * 0.75;
}

function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function Sled({
  trail,
  today,
  className,
}: {
  trail: TrailDay[];
  today: string;
  className?: string;
}) {
  const points = spiralPoints(trail.length);
  if (points.length === 0) return null;

  const walked = trail.filter((d) => d.sila > 0 || d.declared).length;

  return (
    <svg
      viewBox="-1.14 -1.14 2.28 2.28"
      className={className}
      role="img"
      aria-label={`След: ${trail.length} дней, из них с записью ${walked}`}
    >
      {/* Нить пути под точками: сам след, а не украшение. */}
      <path
        d={spiralPath(points)}
        fill="none"
        stroke="var(--color-patina)"
        strokeWidth={0.008}
        strokeLinecap="round"
      />

      {trail.map((day, i) => {
        const p = points[i];
        const isToday = day.date === today;
        const fulfilled = day.total > 0 && day.done === day.total;
        const empty = day.sila <= 0 && !day.declared;

        return (
          // data-day читает проверка по пикселям: она сверяет, что яркость
          // точки следует Силе дня, а не чему-то ещё.
          <g key={day.date} data-day={day.date} data-sila={day.sila}>
            <circle
              cx={p.x}
              cy={p.y}
              r={DOT}
              fill={empty ? 'var(--color-patina)' : 'var(--color-gold-400)'}
              opacity={empty ? 0.5 : glow(day.sila)}
            />
            {fulfilled && (
              <circle
                cx={p.x}
                cy={p.y}
                r={DOT + 0.032}
                fill="none"
                stroke="var(--color-gold-600)"
                strokeWidth={0.014}
              />
            )}
            {isToday && (
              <circle
                cx={p.x}
                cy={p.y}
                r={DOT + 0.062}
                fill="none"
                stroke="var(--color-gold-200)"
                strokeWidth={0.016}
              />
            )}
            <title>
              {dayLabel(day.date)}
              {day.sila > 0 ? ` · Сила ${day.sila.toFixed(0)}` : ' · записи нет'}
              {day.total > 0 ? ` · Путь ${day.done} из ${day.total}` : ''}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
