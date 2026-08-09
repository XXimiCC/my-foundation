import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { currentUser } from '@/lib/auth/current';

export const metadata: Metadata = {
  title: 'Вход — Основание',
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [user, params] = await Promise.all([currentUser(), searchParams]);
  if (user) redirect(params.next ?? '/');

  return (
    <LoginForm
      botUsername={process.env.TELEGRAM_BOT_USERNAME ?? ''}
      next={params.next ?? '/'}
    />
  );
}
