/**
 * Геометрия Следа — спираль дней.
 *
 * Единственный источник координат для Следа, как geometry.ts для Триквестра:
 * отрисовка не считает ничего сама.
 *
 * Спираль архимедова, а не логарифмическая («золотая»). Логарифмическая растёт
 * экспоненциально, и уже к третьей неделе дни вылетают за кадр, а первые
 * слипаются в точку. Равный шаг ещё и вернее по смыслу: «во время преодоления
 * скорость не так важна, как постоянство. Маленькие, но регулярные шаги»
 * (Завет ПУТЬ). Каждый день — ровно один одинаковый шаг следа.
 *
 * Центр — начало окна, край — сегодня: «обернитесь назад и рассмотрите свои
 * следы: как много вы прошли».
 */

export interface SpiralPoint {
  index: number;
  /** Координаты в единичном круге: край спирали лежит на радиусе 1. */
  x: number;
  y: number;
  r: number;
  theta: number;
}

export interface SpiralOptions {
  /** Сколько оборотов делает спираль от центра до края. */
  turns?: number;
  /** Доля радиуса, с которой начинается первый день. Ноль — из самого центра. */
  innerRatio?: number;
}

export const DEFAULT_TURNS = 2.5;

/**
 * Первый день стоит не в самой точке центра. У нуля кривизна спирали
 * бесконечна, и равные по дуге шаги там расходятся по хорде на треть — начало
 * пути выглядело бы рваным. Со сдвига в 0.12 радиуса расхождение падает до
 * шести процентов.
 */
export const DEFAULT_INNER = 0.12;

/** Длина дуги архимедовой спирали r = b·θ от нуля до θ. */
export function arcLength(theta: number, b: number): number {
  return (b / 2) * (theta * Math.hypot(1, theta) + Math.asinh(theta));
}

/**
 * Обратная задача: угол, на котором набирается заданная длина дуги.
 * Аналитического обращения нет, поэтому Ньютон от приближения s ≈ bθ²/2 —
 * оно тем точнее, чем больше θ, а сходится за считаные шаги и у нуля.
 */
export function thetaForArc(s: number, b: number): number {
  if (s <= 0 || b <= 0) return 0;
  let theta = Math.sqrt((2 * s) / b);
  for (let i = 0; i < 32; i += 1) {
    const derivative = b * Math.hypot(1, theta);
    if (derivative === 0) break;
    const step = (arcLength(theta, b) - s) / derivative;
    theta -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return Math.max(0, theta);
}

/**
 * Точки дней от центра к краю, равноудалённые ПО ДУГЕ.
 *
 * Равный шаг по дуге, а не по углу: иначе дни у центра стояли бы вплотную, и
 * начало пути читалось бы как одно пятно.
 *
 * Отсчёт с верхней точки по часовой стрелке; координаты уже в системе SVG,
 * где ось Y направлена вниз.
 */
export function spiralPoints(count: number, options: SpiralOptions = {}): SpiralPoint[] {
  if (count <= 0) return [];

  const turns = options.turns ?? DEFAULT_TURNS;
  const innerRatio = options.innerRatio ?? DEFAULT_INNER;
  const thetaMax = 2 * Math.PI * turns;
  const b = 1 / thetaMax; // край спирали приходится ровно на радиус 1

  const thetaMin = innerRatio > 0 ? innerRatio * thetaMax : 0;
  const from = arcLength(thetaMin, b);
  const total = arcLength(thetaMax, b);

  const points: SpiralPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    // Последняя точка — сегодня — всегда на краю, даже если день один.
    const t = count === 1 ? 1 : i / (count - 1);
    const theta = thetaForArc(from + (total - from) * t, b);
    const r = b * theta;
    points.push({
      index: i,
      x: r * Math.sin(theta),
      y: -r * Math.cos(theta),
      r,
      theta,
    });
  }

  return points;
}

/** Путь-нить, соединяющая дни. Рисуется под точками — это и есть след. */
export function spiralPath(points: SpiralPoint[]): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(4)} ${p.y.toFixed(4)}`)
    .join(' ');
}
