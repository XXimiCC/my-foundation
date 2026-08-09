/**
 * Та же проверка заполнения, но для автономной страницы-стенда.
 * Запуск: npm run check:artifact -- <путь к html>
 */

import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const file = process.argv[2];
if (!file) {
  console.error('Укажите путь к html-файлу стенда.');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'Триединение' }).click();
await page.waitForTimeout(1500);

const points: { shell: string; f: number; x: number; y: number }[] = await page.evaluate(`
  (function () {
    function P(g, x, y) { var m = g.getScreenCTM(); return { x: m.a*x + m.c*y + m.e, y: m.b*x + m.d*y + m.f }; }
    var out = [];
    ['SPIRIT', 'MIND', 'BODY'].forEach(function (shell) {
      var g = document.querySelector('[data-petal="' + shell + '"]');
      [0.1, 0.35, 0.6].forEach(function (f) {
        var p = P(g, 0, -1.097308 + f * 1.334616);
        out.push({ shell: shell, f: f, x: Math.round(p.x), y: Math.round(p.y) });
      });
    });
    return out;
  })()
`);

const shot = await page.screenshot();
await page.screenshot({ path: file.replace(/\.html$/, '-check.png') });
await browser.close();

const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });

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
    `    ${String(Math.round(p.f * 100)).padStart(3)}%  rgb(${r},${g},${b})  ` +
      (lit ? 'залито' : 'ПУСТО'),
  );
}

if (failures > 0) {
  console.error(`\n  Стенд: заполнение сломано, пустых точек ${failures}.\n`);
  process.exit(1);
}
console.log('\n  Стенд: все три лепестка заливаются от вершины.\n');
