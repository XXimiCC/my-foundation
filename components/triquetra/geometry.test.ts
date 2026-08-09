import { describe, expect, it } from 'vitest';
import {
  AXIS_LENGTH,
  BAY_ANGLE,
  BAY_RADIUS,
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
  bayPosition,
  maskOffset,
  petalHalfAngleAt,
  petalHalfWidthAt,
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

describe('Заливы между лепестками', () => {
  const PETAL_AXES = [90, 210, 330];

  it('лежат ровно посередине между осями соседних лепестков', () => {
    for (const bay of Object.values(BAY_ANGLE)) {
      const gaps = PETAL_AXES.map((a) => angularDistance(bay, a)).sort((x, y) => x - y);
      expect(gaps[0]).toBeCloseTo(60, 6);
    }
  });

  it('надписи не наезжают на золото: лепесток там втрое уже зазора', () => {
    const half = petalHalfAngleAt(BAY_RADIUS);
    expect(half).toBeLessThan(20);
    // Ближайшая ось лепестка в 60°, значит просвет с каждой стороны:
    expect(60 - half).toBeGreaterThan(40);
  });

  it('радиус надписей лежит между вершиной лепестка и внутренним кольцом', () => {
    expect(BAY_RADIUS).toBeLessThan(RING_INNER);
    expect(BAY_RADIUS).toBeGreaterThan(0.5);
  });

  it('лепесток сужается к вершине', () => {
    expect(petalHalfWidthAt(0.95)).toBeLessThan(petalHalfWidthAt(0.43));
    expect(petalHalfWidthAt(TIP)).toBeCloseTo(0, 5);
  });

  it('самое широкое место лепестка — на середине образующей', () => {
    expect(petalHalfWidthAt(D / 2)).toBeCloseTo(PETAL_HALF_WIDTH, 9);
  });

  it('переводит углы в проценты контейнера', () => {
    const left = bayPosition(BAY_ANGLE.LEFT);
    const right = bayPosition(BAY_ANGLE.RIGHT);
    const bottom = bayPosition(BAY_ANGLE.BOTTOM);
    const pct = (v: string) => parseFloat(v);
    // Залив на 150° отстоит от центра на BAY_RADIUS·cos150 в долях полустороны.
    const expectedLeft = 50 + ((Math.cos((150 * Math.PI) / 180) * BAY_RADIUS) / 1.45) * 50;
    expect(pct(left.left)).toBeCloseTo(expectedLeft, 6);
    expect(pct(right.left)).toBeCloseTo(100 - expectedLeft, 6);
    expect(pct(bottom.left)).toBeCloseTo(50, 6);
    // Левый и правый залив симметричны и лежат выше центра.
    expect(left.top).toBe(right.top);
    expect(parseFloat(left.top)).toBeLessThan(50);
    expect(parseFloat(bottom.top)).toBeGreaterThan(50);
  });

  it('все надписи остаются внутри контейнера', () => {
    for (const bay of Object.values(BAY_ANGLE)) {
      const p = bayPosition(bay);
      expect(parseFloat(p.left)).toBeGreaterThan(5);
      expect(parseFloat(p.left)).toBeLessThan(95);
      expect(parseFloat(p.top)).toBeGreaterThan(5);
      expect(parseFloat(p.top)).toBeLessThan(95);
    }
  });
});

function angularDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

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
