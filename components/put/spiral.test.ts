import { describe, expect, it } from 'vitest';
import { DEFAULT_INNER, arcLength, spiralPath, spiralPoints, thetaForArc } from './spiral';

describe('Спираль Следа', () => {
  it('обращение длины дуги возвращает исходный угол', () => {
    const b = 0.0637;
    for (const theta of [0.1, 1, 5, 12, 15.7]) {
      expect(thetaForArc(arcLength(theta, b), b)).toBeCloseTo(theta, 9);
    }
  });

  it('сегодня всегда на краю, а начало пути — у центра', () => {
    const points = spiralPoints(42);
    expect(points).toHaveLength(42);
    expect(points[0].r).toBeCloseTo(DEFAULT_INNER, 9);
    expect(points[41].r).toBeCloseTo(1, 9);
  });

  it('дни идут строго наружу — путь не возвращается назад', () => {
    const points = spiralPoints(42);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i].r).toBeGreaterThan(points[i - 1].r);
    }
  });

  it('шаг между днями одинаков: постоянство важнее скорости', () => {
    const points = spiralPoints(42);
    const steps: number[] = [];
    for (let i = 1; i < points.length; i += 1) {
      steps.push(Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const max = Math.max(...steps);
    const min = Math.min(...steps);
    // По хорде шаг чуть короче, чем по дуге, и сильнее всего у центра, где
    // кривизна велика. Сдвиг первого дня от нуля удерживает расхождение
    // в пределах десятой части — на глаз шаг ровный.
    expect((max - min) / max).toBeLessThan(0.1);
  });

  it('единственный день стоит на краю, а не в центре', () => {
    const [only] = spiralPoints(1);
    expect(only.r).toBeCloseTo(1, 9);
  });

  it('пустой След не рисуется', () => {
    expect(spiralPoints(0)).toEqual([]);
    expect(spiralPath([])).toBe('');
  });

  it('точки не выходят за единичный круг — фигура не обрежется', () => {
    for (const point of spiralPoints(60)) {
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('нить проходит через все дни по порядку', () => {
    const points = spiralPoints(5);
    const path = spiralPath(points);
    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(4);
  });
});
