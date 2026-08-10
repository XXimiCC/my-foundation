import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Nastroyki } from '@/components/settings/Nastroyki';
import { currentUser } from '@/lib/auth/current';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Настройки — Основание',
  description: 'Часы ритуального дня, тихие часы, интенсивность и часовой пояс.',
};

export const dynamic = 'force-dynamic';

/** Список зон берётся у среды выполнения, а не хранится списком в коде. */
function zones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf?.('timeZone');
  return supported && supported.length > 0
    ? supported
    : ['Europe/Kyiv', 'Europe/Warsaw', 'Europe/Berlin', 'Europe/London', 'UTC'];
}

export default async function NastroykiPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/nastroyki');

  const settings = await prisma.settings.findUnique({ where: { userId: user.id } });

  return (
    <Nastroyki
      zones={zones()}
      initial={{
        morningAt: settings?.morningAt ?? 420,
        mindAt: settings?.mindAt ?? 780,
        eveningAt: settings?.eveningAt ?? 1260,
        nightAt: settings?.nightAt ?? 1350,
        quietFrom: settings?.quietFrom ?? 1380,
        quietTo: settings?.quietTo ?? 390,
        fastWeekdays: settings?.fastWeekdays ?? [1, 5],
        intensity: settings?.intensity ?? 1,
        tz: user.tz,
      }}
    />
  );
}
