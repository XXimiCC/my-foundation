import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Put } from '@/components/put/Put';
import { currentUser } from '@/lib/auth/current';
import { loadPutView } from '@/lib/core/rollup';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Путь — Основание',
  description: 'Вечерняя Декларация, её выполнение и След пройденного.',
};

export const dynamic = 'force-dynamic';

/**
 * Завет ПУТЬ. До Оснащения Заветы закрыты — как и у АКТ с БЛАГ, здесь не
 * заглушка, а отправка к Договору: незачем показывать ритуал тому, кто ещё
 * не принял Основы.
 */
export default async function PutPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/put');
  if (!user.oathAt) redirect('/osnashenie');

  return <Put initial={await loadPutView(prisma, user)} />;
}
