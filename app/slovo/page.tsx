import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Slovo } from '@/components/slovo/Slovo';
import { currentUser } from '@/lib/auth/current';
import { loadSlovo } from '@/lib/core/slovo';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Слово Дня — Основание',
  description: 'Активное припоминание тезисов Канона с нарастающими интервалами.',
};

export const dynamic = 'force-dynamic';

export default async function SlovoPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/slovo');
  if (!user.oathAt) redirect('/osnashenie');

  return <Slovo initial={await loadSlovo(prisma, user.id, user.tz)} />;
}
