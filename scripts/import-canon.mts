/**
 * Импорт хранилища «Философия Основания» в базу.
 * Запуск: npm run canon:import
 *
 * Идемпотентен и безопасен для повторного запуска:
 *  — документы и секции переписываются целиком;
 *  — тезисы НЕ удаляются, а помечаются неактивными, если исчезли из текста,
 *    иначе повторный импорт снёс бы историю припоминания (ThesisReview).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type CanonKind, type ThesisKind } from '@prisma/client';
import { findBrokenLinks, parseVault } from '../lib/canon/parse.ts';

const prisma = new PrismaClient();
const VAULT = join(process.cwd(), 'Философия Основания');

async function main() {
  const files = readdirSync(VAULT)
    .filter((f) => f.endsWith('.md'))
    .map((fileName) => ({ fileName, content: readFileSync(join(VAULT, fileName), 'utf8') }));

  const { docs, skipped } = parseVault(files);

  if (skipped.length) {
    console.log(`  Не распознаны и пропущены: ${skipped.join(', ')}`);
  }

  const broken = findBrokenLinks(docs).filter((b) => b.reason === 'нет якоря');
  if (broken.length) {
    console.error('  Битые якоря — импорт остановлен:');
    for (const b of broken) console.error(`    ${b.from} → ${b.rawTarget}`);
    process.exitCode = 1;
    return;
  }

  // Один и тот же тезис может встретиться в двух документах. Отпечаток
  // глобально уникален, поэтому оставляем первое вхождение по порядку Канона.
  const claimed = new Set<string>();
  let duplicates = 0;

  let sectionCount = 0;
  let thesisCount = 0;

  for (const d of docs) {
    const doc = await prisma.canonDoc.upsert({
      where: { slug: d.slug },
      create: {
        slug: d.slug,
        kind: d.kind as CanonKind,
        order: d.order,
        title: d.title,
        sourcePath: d.sourcePath,
        bodyMd: d.bodyMd,
      },
      update: {
        kind: d.kind as CanonKind,
        order: d.order,
        title: d.title,
        sourcePath: d.sourcePath,
        bodyMd: d.bodyMd,
      },
    });

    // Секции ни от чего не зависят — переписываем целиком.
    await prisma.canonSection.deleteMany({ where: { docId: doc.id } });
    if (d.sections.length) {
      await prisma.canonSection.createMany({
        data: d.sections.map((s) => ({
          docId: doc.id,
          anchor: s.anchor,
          heading: s.heading,
          level: s.level,
          order: s.order,
          bodyMd: s.bodyMd,
        })),
      });
      sectionCount += d.sections.length;
    }

    const fresh = d.theses.filter((t) => {
      if (claimed.has(t.fingerprint)) {
        duplicates += 1;
        return false;
      }
      claimed.add(t.fingerprint);
      return true;
    });

    for (const t of fresh) {
      await prisma.thesis.upsert({
        where: { fingerprint: t.fingerprint },
        create: {
          docId: doc.id,
          kind: t.kind as ThesisKind,
          text: t.text,
          fingerprint: t.fingerprint,
          active: true,
        },
        update: { docId: doc.id, kind: t.kind as ThesisKind, text: t.text, active: true },
      });
    }
    thesisCount += fresh.length;

    // Исчезнувшие из текста тезисы гасим, но не удаляем: за ними стоит
    // история припоминания.
    const retired = await prisma.thesis.updateMany({
      where: { docId: doc.id, fingerprint: { notIn: fresh.map((t) => t.fingerprint) } },
      data: { active: false },
    });
    if (retired.count) {
      console.log(`  ${d.slug}: снято с показа тезисов — ${retired.count}`);
    }
  }

  const totals = {
    docs: await prisma.canonDoc.count(),
    sections: await prisma.canonSection.count(),
    theses: await prisma.thesis.count({ where: { active: true } }),
  };

  console.log(
    `\n  Импортировано: ${totals.docs} документов · ${totals.sections} секций · ${totals.theses} активных тезисов`,
  );
  if (duplicates) {
    console.log(`  Повторов текста между документами: ${duplicates} (оставлено первое вхождение)`);
  }
  console.log(`  Секций записано за проход: ${sectionCount}, тезисов: ${thesisCount}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
