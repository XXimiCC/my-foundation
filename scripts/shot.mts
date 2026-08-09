/**
 * Снимок страницы и разбор геометрии Триквестра в живом браузере.
 * Запуск: npm run shot -- <url> <файл.png>
 *
 * Существует потому, что вёрстку нельзя проверять по разметке: два бага
 * заполнения подряд были не в данных, а в том, как браузер разрешает маски.
 */

import { chromium } from 'playwright';

const [url = 'http://127.0.0.1:3000/', out = 'shot.png'] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 420, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// Третьим аргументом можно передать подпись кнопки, которую нажать до съёмки.
const click = process.argv[4];
if (click) {
  await page.getByRole('button', { name: click }).click();
  await page.waitForTimeout(1400);
}

await page.screenshot({ path: out });

// Доля залитого золота у каждого лепестка — измеряется по площади пересечения
// прямоугольника маски с самим лепестком, а не на глаз.
const fills: string[] = await page.evaluate(`(() => {
  var rows = [];
  var groups = document.querySelectorAll('[data-petal]');
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var shell = g.getAttribute('data-petal');
    var mask = document.querySelector('mask[id*="mask-' + shell + '"] rect');
    var pb = g.getBoundingClientRect();
    var mb = mask ? mask.getBoundingClientRect() : null;
    if (!mb) { rows.push(shell + ': маски нет'); continue; }
    var ix = Math.max(0, Math.min(pb.right, mb.right) - Math.max(pb.left, mb.left));
    var iy = Math.max(0, Math.min(pb.bottom, mb.bottom) - Math.max(pb.top, mb.top));
    var share = (ix * iy) / (pb.width * pb.height);
    rows.push((shell + '        ').slice(0, 8) + '   перекрытие маски с лепестком: ' + Math.round(share * 100) + '%');
  }
  return rows;
})()`);
console.log('\n  Заполнение:');
for (const r of fills) console.log('  ' + r);

/**
 * Ключевой вопрос: поворачивается ли содержимое маски вместе с группой
 * лепестка. Если да — матрица прямоугольника маски совпадает с матрицей
 * его лепестка. Если нет, заполнение режет лепесток по чужой оси.
 */
// Код уходит строкой: сборщик подставляет в функции свои хелперы, которых
// в браузере нет.
const report: string[] = await page.evaluate(`(() => {
  function fmt(m) {
    return m ? [m.a, m.b, m.c, m.d].map(function (v) { return v.toFixed(3) }).join(' ') : 'нет';
  }
  var rows = [];
  var rects = document.querySelectorAll('mask rect');
  for (var i = 0; i < rects.length; i++) {
    var rect = rects[i];
    var mask = rect.closest('mask');
    var shell = mask ? mask.id.split('-')[1] : '?';
    var petal = document.querySelector('[data-petal="' + shell + '"]');
    rows.push(
      (shell + '        ').slice(0, 8) +
      '   маска: ' + fmt(rect.getScreenCTM()) +
      '   лепесток: ' + fmt(petal ? petal.getScreenCTM() : null)
    );
  }
  return rows;
})()`);

console.log('\n  Матрицы преобразования (a b c d):');
for (const r of report) console.log('  ' + r);
console.log(`\n  Снимок: ${out}\n`);

await browser.close();
