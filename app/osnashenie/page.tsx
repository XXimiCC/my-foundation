import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OsnashenieRitual } from '@/components/osnashenie/OsnashenieRitual';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Оснащение — Основание',
  description: 'Принятие Договора Консенсуса из десяти Благородных Основ.',
};

export const dynamic = 'force-dynamic';

/**
 * Оснащение. Текст Основ берётся из Канона в базе, а не дублируется в коде:
 * правка в админке должна менять и ритуал тоже.
 */
export default async function OsnasheniePage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/osnashenie');
  if (user.oathAt) redirect('/');

  const [docs, accepted] = await Promise.all([
    prisma.canonDoc.findMany({
      where: { kind: 'FOUNDATION' },
      orderBy: { order: 'asc' },
      select: {
        order: true,
        title: true,
        slug: true,
        theses: {
          where: { active: true, kind: 'BELIEF' },
          orderBy: { id: 'asc' },
          take: 3,
          select: { text: true },
        },
      },
    }),
    prisma.oathAcceptance.findMany({
      where: { userId: user.id },
      select: { foundationNo: true },
    }),
  ]);

  return (
    <OsnashenieRitual
      foundations={docs.map((d) => ({
        no: d.order,
        title: d.title.replace(/^Основа\s+\d+\.\s*/, ''),
        slug: d.slug,
        theses: d.theses.map((t) => t.text),
      }))}
      alreadyAccepted={accepted.map((a) => a.foundationNo)}
    />
  );
}
