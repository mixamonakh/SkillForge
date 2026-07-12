export type ContentValidationIssue = {
  code: string;
  message: string;
  path?: string;
};

export class ContentValidationError extends Error {
  public readonly issues: readonly ContentValidationIssue[];

  public constructor(message: string, issues: readonly ContentValidationIssue[]) {
    super(message);
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}
