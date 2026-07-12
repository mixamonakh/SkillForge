import { ActiveAssessment } from '@/features/assessment/active-assessment';

export default async function AssessmentRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ActiveAssessment runId={runId} />;
}
