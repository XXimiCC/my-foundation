import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Tishina } from '@/components/tishina/Tishina';
import { currentUser } from '@/lib/auth/current';
import { loadDuh } from '@/lib/core/duh';
import { levelsOf } from '@/lib/core/shells';
import { loadShells } from '@/lib/core/state';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Тишина — Основание',
  description: 'Ежедневная практика замедления: Сюжет, Озарение, Скука.',
};

export const dynamic = 'force-dynamic';

/**
 * Завет ДУХ. Уровни нужны фигуре: во время практики она гаснет, но контур
 * остаётся её собственным — не декорацией, а тем же прибором.
 */
export default async function TishinaPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/tishina');
  if (!user.oathAt) redirect('/osnashenie');

  const [duh, shells] = await Promise.all([
    loadDuh(prisma, user.id, user.tz),
    loadShells(prisma, user.id, new Date()),
  ]);

  return <Tishina initial={duh} levels={levelsOf(shells)} />;
}
