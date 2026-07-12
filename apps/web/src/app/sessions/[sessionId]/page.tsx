import { ActiveSession } from '@/features/sessions/active-session';

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ActiveSession sessionId={sessionId} />;
}
