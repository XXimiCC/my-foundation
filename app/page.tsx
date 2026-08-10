import { Poligon } from '@/components/poligon/Poligon';
import { Today } from '@/components/today/Today';
import { currentUser } from '@/lib/auth/current';
import { loadGoals } from '@/lib/core/goal';
import { loadRituals } from '@/lib/core/rituals';
import { loadState } from '@/lib/core/state';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Главный экран.
 *
 * Прошедшему Оснащение показывается его собственное состояние и два Завета,
 * которые закрываются одним касанием. Остальным — полигон: Триквестр без
 * данных, на котором видно, как устроен прибор. Заветы до принятия Договора
 * закрыты, и подсовывать их пустыми было бы обманом.
 */
export default async function HomePage() {
  const user = await currentUser();

  if (!user?.oathAt) return <Poligon />;

  const now = new Date();
  const [state, rituals, goals] = await Promise.all([
    loadState(prisma, user.id, user.tz, now),
    loadRituals(prisma, user.id, user.tz, now),
    loadGoals(prisma, user.id, user.tz, now),
  ]);

  return (
    <Today
      initial={state}
      rituals={rituals}
      goals={goals}
      name={user.firstName ?? user.username}
    />
  );
}
