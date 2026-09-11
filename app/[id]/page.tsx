import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SuperChat } from '@/components/superchat'
import { auth } from '@/lib/auth'

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')
  if ((session.user as { banned?: boolean }).banned) redirect('/sign-in?error=suspended')
  return <SuperChat initialChatId={id} />
}
