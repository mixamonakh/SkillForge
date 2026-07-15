import { sha256, stableStringify } from '@skillforge/content-schema';

export type TrackSemantics = {
  title: string;
  description: string;
  position: number;
  status: string;
};

export type TopicSemantics = {
  trackKey: string;
  title: string;
  shortDescription: string;
  whyImportant: string;
  atWork: string;
  atInterview: string;
  position: number;
  defaultHalfLifeDays: number;
  status: string;
  metadata: unknown;
};

export function areSemanticsEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function semanticChecksum(value: unknown): string {
  return sha256(value);
}

export function normalizedPrerequisiteKeys(keys: readonly string[]): string[] {
  return [...keys].sort((left, right) => left.localeCompare(right));
}
