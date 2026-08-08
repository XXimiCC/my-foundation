/**
 * Отчёт по хранилищу: состав Канона, объём тезисов и целостность ссылок.
 * Запуск: npm run canon:report
 *
 * Гоняется перед импортом в БД — чтобы битые якоря обнаруживались до того,
 * как контент окажется в приложении.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findBrokenLinks, parseVault } from '../lib/canon/parse.ts';

const VAULT = join(process.cwd(), 'Философия Основания');

const files = readdirSync(VAULT)
  .filter((f) => f.endsWith('.md'))
  .map((fileName) => ({ fileName, content: readFileSync(join(VAULT, fileName), 'utf8') }));

const { docs, skipped } = parseVault(files);

const KIND_LABEL: Record<string, string> = {
  INDEX: 'оглавление',
  DOGMA: 'Догмат',
  FOUNDATION: 'Основа',
  COVENANT: 'Завет',
  ORDER: 'Орден',
  JOURNAL: 'отчёт',
};

console.log('\n  слаг            раздел        секций  тезисов   заголовок');
console.log('  ' + '─'.repeat(74));

let sections = 0;
let theses = 0;
for (const d of docs) {
  sections += d.sections.length;
  theses += d.theses.length;
  console.log(
    '  ' +
      d.slug.padEnd(16) +
      (KIND_LABEL[d.kind] ?? d.kind).padEnd(14) +
      String(d.sections.length).padStart(5) +
      String(d.theses.length).padStart(9) +
      '   ' +
      d.title.slice(0, 32),
  );
}

console.log('  ' + '─'.repeat(74));
console.log(
  `  ${docs.length} документов · ${sections} секций · ${theses} тезисов для Слова Дня`,
);
console.log(
  `  Первый проход припоминания: ${theses} дней ≈ ${(theses / 365).toFixed(1)} года по одному тезису в день`,
);

if (skipped.length) {
  console.log(`\n  Не распознаны: ${skipped.join(', ')}`);
}

const broken = findBrokenLinks(docs);
if (broken.length === 0) {
  console.log('\n  Ссылки: битых нет.\n');
} else {
  console.log('\n  Ссылки, требующие внимания:');
  for (const b of broken) {
    console.log(`    ${b.from.padEnd(14)} → ${b.rawTarget.padEnd(28)} ${b.reason}`);
  }
  console.log('');
}
