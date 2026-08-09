import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Post } from '@/components/post/Post';
import { currentUser } from '@/lib/auth/current';
import { loadPost } from '@/lib/core/post';
import { prisma } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Пост — Основание',
  description: 'Дни Очищения и Месяц Искупления: два запрета и окно еды.',
};

export const dynamic = 'force-dynamic';

export default async function PostPage() {
  const user = await currentUser();
  if (!user) redirect('/vhod?next=/post');
  if (!user.oathAt) redirect('/osnashenie');

  return <Post initial={await loadPost(prisma, user.id, user.tz)} />;
}
