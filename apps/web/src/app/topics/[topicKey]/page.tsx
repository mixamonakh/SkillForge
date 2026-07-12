import { TopicDetail } from '@/features/topics/topic-detail';

export default async function TopicPage({ params }: { params: Promise<{ topicKey: string }> }) {
  const { topicKey } = await params;
  return <TopicDetail topicKey={topicKey} />;
}
