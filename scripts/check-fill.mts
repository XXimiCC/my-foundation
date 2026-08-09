/**
 * Проверка заполнения Триквестра в живом браузере.
 * Запуск: npm run check:fill -- <url>
 *
 * Юнит-тесты этот класс ошибок не ловят: математика была верной, а ломалось
 * то, в какой системе координат браузер разрешает содержимое <mask>. Проверка
 * смотрит на пиксели: золото обязано расти ОТ ВЕРШИНЫ лепестка внутрь, у всех
 * трёх одинаково.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const url = process.argv[2] ?? 'http://127.0.0.1:3000/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 820 } });
await page.goto(url, { waitUntil: 'networkidle' });

// Поднимаем все три оболочки: при высоких уровнях залито должно быть всё.
await page.getByRole('button', { name: 'ТРИЕДИНЕНИЕ' }).click();
await page.waitForTimeout(1600);

const SAMPLES = [0.1, 0.35, 0.6, 0.8];

const points: { shell: string; f: number; x: number; y: number }[] = await page.evaluate(`
  (function () {
    function P(g, x, y) { var m = g.getScreenCTM(); return { x: m.a*x + m.c*y + m.e, y: m.b*x + m.d*y + m.f }; }
    var out = [];
    ['SPIRIT', 'MIND', 'BODY'].forEach(function (shell) {
      var g = document.querySelector('[data-petal="' + shell + '"]');
      [${SAMPLES.join(', ')}].forEach(function (f) {
        var p = P(g, 0, -1.097308 + f * 1.334616);
        out.push({ shell: shell, f: f, x: Math.round(p.x), y: Math.round(p.y) });
      });
    });
    return out;
  })()
`);

const shot = await page.screenshot();
const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
await browser.close();

let failures = 0;
let current = '';

for (const p of points) {
  if (p.shell !== current) {
    current = p.shell;
    console.log(`  ${current}`);
  }
  const i = (p.y * info.width + p.x) * info.channels;
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const lit = r > 110 && r > b + 30;
  if (!lit) failures += 1;
  console.log(
    `    ${String(Math.round(p.f * 100)).padStart(3)}% от вершины  rgb(${r},${g},${b})  ` +
      (lit ? 'залито' : 'ПУСТО'),
  );
}

if (failures > 0) {
  console.error(`\n  Заполнение сломано: пустых точек ${failures} из ${points.length}.`);
  console.error('  Золото должно расти от вершины лепестка внутрь, у всех трёх одинаково.\n');
  process.exit(1);
}

console.log('\n  Все три лепестка заливаются от вершины.\n');
