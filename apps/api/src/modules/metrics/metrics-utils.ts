import { objectValue } from '../../common/json.js';

export type DataSufficiency = { sufficient: boolean; coverage: number; reason: string };

export function sufficiency(assessed: number, total: number, minimum = 0.6): DataSufficiency {
  const coverage = total === 0 ? 0 : assessed / total;
  return {
    sufficient: total > 0 && coverage >= minimum,
    coverage,
    reason: `Оценено ${String(assessed)} из ${String(total)} тем`,
  };
}

export function topicRelevance(metadata: unknown): number {
  const value = objectValue(metadata).yandexRelevance;
  return typeof value === 'number' ? value : 0;
}
