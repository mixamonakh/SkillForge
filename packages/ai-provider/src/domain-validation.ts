import {
  AiAttemptEvaluationCandidateSchema,
  AiNudgeCandidateSchema,
  ContentReviewResultSchema,
  EvaluateAttemptInputSchema,
  GenerateNudgeInputSchema,
  ReviewContentInputSchema,
  type AiAttemptEvaluationCandidate,
  type AiNudgeCandidate,
  type ContentReviewResult,
  type EvaluateAttemptInput,
  type GenerateNudgeInput,
  type ReviewContentInput,
} from './contracts.js';
import { AiProviderError } from './provider.js';

function domainError(message: string): never {
  throw new AiProviderError('AI_PROVIDER_DOMAIN_INVALID', message);
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateAttemptEvaluationCandidate(
  rawInput: EvaluateAttemptInput,
  rawCandidate: unknown,
): AiAttemptEvaluationCandidate {
  const input = EvaluateAttemptInputSchema.parse(rawInput);
  const candidate = AiAttemptEvaluationCandidateSchema.parse(rawCandidate);
  if (candidate.attemptId !== input.attemptId) domainError('Candidate attemptId does not match');
  if (
    candidate.taskStableKey !== input.task.stableKey ||
    candidate.taskVersion !== input.task.version
  ) {
    domainError('Candidate TaskVersion identity does not match');
  }
  const allowedDimensions = new Set(input.task.allowedDimensions);
  const scoredDimensions = Object.keys(candidate.dimensionScores);
  const coverageDimensions = [
    ...candidate.coverage.evaluatedDimensions,
    ...candidate.coverage.pendingDimensions,
    ...candidate.coverage.unsupportedDimensions,
  ];
  if (duplicateValues(coverageDimensions).length > 0) {
    domainError('Evaluation coverage dimensions must be disjoint and unique');
  }
  if (coverageDimensions.some((dimension) => !allowedDimensions.has(dimension))) {
    domainError('Candidate coverage contains a dimension outside the rubric');
  }
  if (scoredDimensions.some((dimension) => !allowedDimensions.has(dimension))) {
    domainError('Candidate score contains a dimension outside the rubric');
  }
  const evaluated = new Set(candidate.coverage.evaluatedDimensions);
  if (
    scoredDimensions.some((dimension) => !evaluated.has(dimension)) ||
    candidate.coverage.evaluatedDimensions.some(
      (dimension) => candidate.dimensionScores[dimension] === undefined,
    )
  ) {
    domainError('Evaluated dimensions and dimensionScores must match exactly');
  }
  if (candidate.coverage.isFinal && candidate.coverage.pendingDimensions.length > 0) {
    domainError('Final coverage cannot contain pending dimensions');
  }
  const allowedMisconceptions = new Set(input.task.allowedMisconceptionKeys);
  if (candidate.misconceptions.some((item) => !allowedMisconceptions.has(item.key))) {
    domainError('Candidate contains an unknown misconception key');
  }
  const allowedEvidenceKinds = new Set(input.task.allowedEvidenceKinds);
  if (
    candidate.evidenceCandidates.some(
      (item) => item.topicKey !== input.task.topicKey || !allowedEvidenceKinds.has(item.kind),
    )
  ) {
    domainError('Candidate evidence is outside the task topic or allowed evidence kinds');
  }
  return candidate;
}

function normalizedText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replaceAll(/[\u2018\u2019\u201c\u201d]/g, '"')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

const NUDGE_TOKEN_PATTERN = /[\p{L}\p{N}_$]+|===|!==|==|!=|=>|\+\+|--/gu;
const NUDGE_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'или',
  'как',
  'для',
  'при',
  'что',
  'это',
  'его',
  'ее',
  'они',
  'она',
  'оно',
  'так',
  'без',
  'над',
  'под',
  'из',
  'от',
  'до',
  'по',
  'на',
  'в',
  'во',
  'и',
  'а',
  'но',
  'не',
]);

function nudgeTokens(value: string): string[] {
  return normalizedText(value).match(NUDGE_TOKEN_PATTERN) ?? [];
}

function meaningfulNudgeTokens(value: string): string[] {
  return nudgeTokens(value).filter(
    (token) =>
      !NUDGE_STOP_WORDS.has(token) &&
      (token.length >= 3 || /^(?:\d+(?:[.,]\d+)?|true|false|null|undefined|nan)$/u.test(token)),
  );
}

function containsOrderedSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, offset) => haystack[index + offset] === token)) return true;
  }
  return false;
}

function containsMeaningfulTokenLeak(hint: string, fragment: string): boolean {
  const hintTokens = meaningfulNudgeTokens(hint);
  const fragmentTokens = meaningfulNudgeTokens(fragment);
  if (fragmentTokens.length === 0) return false;

  if (fragmentTokens.length <= 2) {
    return fragmentTokens.every((token) => hintTokens.includes(token));
  }

  const copiedSequenceLength = Math.min(4, fragmentTokens.length);
  for (let index = 0; index <= fragmentTokens.length - copiedSequenceLength; index += 1) {
    if (
      containsOrderedSequence(hintTokens, fragmentTokens.slice(index, index + copiedSequenceLength))
    ) {
      return true;
    }
  }

  const uniqueFragmentTokens = new Set(fragmentTokens);
  const hintTokenSet = new Set(hintTokens);
  const overlap = [...uniqueFragmentTokens].filter((token) => hintTokenSet.has(token)).length;
  return overlap >= 3 && overlap / uniqueFragmentTokens.size >= 0.7;
}

function compactCode(value: string): string {
  return normalizedText(value).replaceAll(/[\s`'";]+/g, '');
}

function looksLikeCode(value: string): boolean {
  return (
    /[`{}()[\];=<>+*/%]|(?:^|\s)(?:return|throw|const|let|var|function|class|new)(?:\s|$)/iu.test(
      value,
    ) || value.includes('=>')
  );
}

function containsForbiddenNudgeFragment(hint: string, fragment: string): boolean {
  const normalizedHint = normalizedText(hint);
  const normalizedFragment = normalizedText(fragment);
  if (normalizedFragment.length === 0) return false;

  if (looksLikeCode(fragment)) {
    const compactFragment = compactCode(fragment);
    if (compactFragment.length >= 2 && compactCode(hint).includes(compactFragment)) return true;
  }

  if (
    normalizedFragment.length >= 4 &&
    /[\s\p{P}]/u.test(normalizedFragment) &&
    normalizedHint.includes(normalizedFragment)
  ) {
    return true;
  }

  return containsMeaningfulTokenLeak(hint, fragment);
}

export function validateNudgeCandidate(
  rawInput: GenerateNudgeInput,
  rawCandidate: unknown,
): AiNudgeCandidate {
  const input = GenerateNudgeInputSchema.parse(rawInput);
  const candidate = AiNudgeCandidateSchema.parse(rawCandidate);
  if (candidate.attemptId !== input.attemptId) domainError('Nudge attemptId does not match');
  const leaked = input.forbiddenFragments.some((fragment) =>
    containsForbiddenNudgeFragment(candidate.hint, fragment),
  );
  if (leaked) domainError('Nudge contains a forbidden solution fragment');
  const codeBlocks = [...candidate.hint.matchAll(/```[\s\S]*?```/g)];
  if (codeBlocks.some((match) => (match[0]?.length ?? 0) > 120)) {
    domainError('Nudge contains an oversized code block');
  }
  return candidate;
}

export function validateContentReviewResult(
  rawInput: ReviewContentInput,
  rawResult: unknown,
): ContentReviewResult {
  const input = ReviewContentInputSchema.parse(rawInput);
  const result = ContentReviewResultSchema.parse(rawResult);
  if (result.stableKey !== input.stableKey || result.version !== input.version) {
    domainError('Content review identity does not match');
  }
  if (
    result.verdict === 'PASS' &&
    result.findings.some((finding) => finding.severity === 'BLOCKING')
  ) {
    domainError('PASS content review cannot contain blocking findings');
  }
  if (
    result.verdict !== 'BLOCK_IMPORT' &&
    result.findings.some((finding) => finding.severity === 'BLOCKING')
  ) {
    domainError('Blocking findings require BLOCK_IMPORT');
  }
  return result;
}
