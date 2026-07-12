import { z } from 'zod';

export const TOPIC_STATUSES = ['UNKNOWN', 'WEAK', 'UNSTABLE', 'SOLID', 'MASTERED'] as const;
export const SESSION_MODES = [
  'ASSESSMENT',
  'TRAINING',
  'REVIEW',
  'INTERVIEW',
  'RETURN',
  'BATTLE',
] as const;
export const LOAD_MODES = ['MINIMAL', 'NORMAL', 'DEEP', 'RETURN'] as const;
export const RUN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
export const TASK_KINDS = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'EXPLAIN',
  'PREDICT_OUTPUT',
  'FIND_BUG',
  'CODE',
  'COMPARE_SOLUTIONS',
  'AI_REVIEW',
  'FLASHCARD',
] as const;
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export const HELP_LEVELS = ['NONE', 'NUDGE', 'HINT', 'MULTIPLE_HINTS', 'SOLUTION_VIEWED'] as const;
export const EVALUATOR_TYPES = [
  'EXACT_MATCH',
  'TEST_RUNNER',
  'MANUAL',
  'EXTERNAL_AI',
  'API_AI',
  'SELF_REPORT',
] as const;
export const EVIDENCE_KINDS = [
  'RECALL',
  'EXPLANATION',
  'PREDICT_OUTPUT',
  'DEBUGGING',
  'CODE_CORRECTNESS',
  'EDGE_CASES',
  'COMPLEXITY_REASONING',
  'INTERVIEW_RESPONSE',
  'TRANSFER',
  'BATTLE',
  'AI_REVIEW',
  'SELF_REPORT',
] as const;
export const IMPORT_STATUSES = [
  'RECEIVED',
  'VALIDATED',
  'PREVIEWED',
  'APPLIED',
  'REJECTED',
] as const;
export const CONTENT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

export const TopicStatusSchema = z.enum(TOPIC_STATUSES);
export const SessionModeSchema = z.enum(SESSION_MODES);
export const LoadModeSchema = z.enum(LOAD_MODES);
export const RunStatusSchema = z.enum(RUN_STATUSES);
export const TaskKindSchema = z.enum(TASK_KINDS);
export const DifficultySchema = z.enum(DIFFICULTIES);
export const HelpLevelSchema = z.enum(HELP_LEVELS);
export const EvaluatorTypeSchema = z.enum(EVALUATOR_TYPES);
export const EvidenceKindSchema = z.enum(EVIDENCE_KINDS);
export const ImportStatusSchema = z.enum(IMPORT_STATUSES);
export const ContentStatusSchema = z.enum(CONTENT_STATUSES);

export type TopicStatus = z.infer<typeof TopicStatusSchema>;
export type SessionMode = z.infer<typeof SessionModeSchema>;
export type LoadMode = z.infer<typeof LoadModeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
export type Difficulty = z.infer<typeof DifficultySchema>;
export type HelpLevel = z.infer<typeof HelpLevelSchema>;
export type EvaluatorType = z.infer<typeof EvaluatorTypeSchema>;
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
export type ImportStatus = z.infer<typeof ImportStatusSchema>;
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
