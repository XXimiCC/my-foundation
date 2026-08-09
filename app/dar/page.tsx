import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Dar } from '@/components/dar/Dar';
import { currentUser } from '@/lib/auth/current';
import { loadDar } from '@/lib/core/dar';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Дар — Основание',
  description: 'Недельный журнал даров. Приватный: хвастаться нельзя.',
};

export const dynamic = 'force-dynamic';

export default async function DarPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/dar');
  if (!user.oathAt) redirect('/osnashenie');

  return <Dar initial={await loadDar(prisma, user.id, user.tz)} />;
}
