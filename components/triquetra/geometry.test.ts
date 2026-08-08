import { describe, expect, it } from 'vitest';
import {
  AXIS_LENGTH,
  D,
  H,
  INNER,
  MASK_RECT,
  MASK_REGION,
  PETAL_HALF_WIDTH,
  R,
  RING_INNER,
  TIP,
  Y_INNER,
  Y_TIP,
  maskOffset,
  petalPath,
} from './geometry';

describe('Построение Триквестра', () => {
  it('центры окружностей ближе к центру, чем их радиус — иначе ядра не будет', () => {
    expect(D).toBeLessThan(R);
  });

  it('половина хорды пересечения совпадает с аналитическим значением', () => {
    expect(H).toBeCloseTo(Math.sqrt(R * R - (3 * D * D) / 4), 10);
    expect(H).toBeCloseTo(0.667308, 5);
  });

  it('вершина лепестка лежит на ожидаемом радиусе', () => {
    expect(TIP).toBeCloseTo(1.097308, 5);
  });

  it('внутренний конец лепестка уходит ЗА центр — это и создаёт ядро', () => {
    expect(INNER).toBeLessThan(0);
    expect(INNER).toBeCloseTo(-0.237308, 5);
  });

  it('вершины лепестков не выходят за внутреннее кольцо', () => {
    expect(TIP).toBeLessThan(RING_INNER);
  });
});

describe('Ось заполнения', () => {
  it('идёт от вершины (сверху) к внутреннему концу (снизу)', () => {
    expect(Y_TIP).toBeLessThan(0);
    expect(Y_INNER).toBeGreaterThan(0);
    expect(AXIS_LENGTH).toBeCloseTo(Y_INNER - Y_TIP, 10);
  });

  it('пустая оболочка не смещает маску, полная смещает на всю ось', () => {
    expect(maskOffset(0)).toBe(0);
    expect(maskOffset(1)).toBeCloseTo(AXIS_LENGTH, 10);
  });

  it('уровень зажимается в границы', () => {
    expect(maskOffset(-5)).toBe(0);
    expect(maskOffset(5)).toBeCloseTo(AXIS_LENGTH, 10);
  });
});

describe('Область маски', () => {
  // Регрессия: у <mask> область по умолчанию -10%/-10%/120%/120%, и при
  // maskUnits="userSpaceOnUse" проценты считаются от вьюпорта. Вершины
  // лепестков обрезались, и заполнение шло полосой у центра.
  it('полностью накрывает лепесток по вертикали', () => {
    const top = MASK_REGION.y;
    const bottom = MASK_REGION.y + MASK_REGION.height;
    expect(top).toBeLessThan(Y_TIP);
    expect(bottom).toBeGreaterThan(Y_INNER);
  });

  it('полностью накрывает лепесток по горизонтали', () => {
    const left = MASK_REGION.x;
    const right = MASK_REGION.x + MASK_REGION.width;
    expect(left).toBeLessThan(-PETAL_HALF_WIDTH);
    expect(right).toBeGreaterThan(PETAL_HALF_WIDTH);
  });

  it('при нулевом заполнении прямоугольник не задевает лепесток', () => {
    const rectBottom = MASK_RECT.y + MASK_RECT.height + maskOffset(0);
    expect(rectBottom).toBeCloseTo(Y_TIP, 6);
  });

  it('при полном заполнении прямоугольник накрывает лепесток до внутреннего конца', () => {
    const rectBottom = MASK_RECT.y + MASK_RECT.height + maskOffset(1);
    expect(rectBottom).toBeGreaterThanOrEqual(Y_INNER - 1e-9);
  });

  it('верхний край прямоугольника остаётся выше вершины при любом уровне', () => {
    for (const f of [0, 0.25, 0.5, 0.83, 1]) {
      expect(MASK_RECT.y + maskOffset(f)).toBeLessThan(Y_TIP);
    }
  });

  it('на половине заполнена ровно половина оси лепестка', () => {
    const rectBottom = MASK_RECT.y + MASK_RECT.height + maskOffset(0.5);
    const revealed = rectBottom - Y_TIP;
    expect(revealed / AXIS_LENGTH).toBeCloseTo(0.5, 9);
  });

  it('заполнение растёт ОТ ВЕРШИНЫ к центру, а не наоборот', () => {
    const low = MASK_RECT.y + MASK_RECT.height + maskOffset(0.2);
    const high = MASK_RECT.y + MASK_RECT.height + maskOffset(0.8);
    // Граница золота движется от вершины вниз, к внутреннему концу.
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThan(Y_TIP);
    expect(high).toBeLessThan(Y_INNER);
  });
});

describe('Путь лепестка', () => {
  const d = petalPath();

  it('замкнут и состоит из двух дуг', () => {
    expect(d).toMatch(/^M /);
    expect(d.trimEnd()).toMatch(/Z$/);
    expect(d.match(/A /g)).toHaveLength(2);
  });

  it('обе дуги малые и в одном направлении обхода', () => {
    // "A rx ry rotation large-arc sweep x y" — оба флага 0, выведено в системе SVG
    const arcs = d.match(/A 1 1 0 (\d) (\d)/g) ?? [];
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) expect(arc).toBe('A 1 1 0 0 0');
  });

  it('начинается во внутреннем конце и проходит через вершину', () => {
    expect(d).toContain(Y_INNER.toFixed(6));
    expect(d).toContain(Y_TIP.toFixed(6));
  });
});
