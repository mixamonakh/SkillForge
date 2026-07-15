export const APP_CONTENT_SCHEMA_VERSION = '2.0.0';
export const SUPPORTED_APP_CONTENT_SCHEMA_VERSIONS = ['1.0.0', APP_CONTENT_SCHEMA_VERSION] as const;

type SemanticVersion = readonly [major: number, minor: number, patch: number];

const supportedRangePattern = /^>=(\d+)\.(\d+)\.(\d+) <(\d+)\.(\d+)\.(\d+)$/u;

function compareVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function supportsAppSchema(range: string): boolean {
  const match = supportedRangePattern.exec(range);
  if (match === null) {
    return false;
  }
  const values = match.slice(1).map(Number);
  const lower: SemanticVersion = [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
  const upper: SemanticVersion = [values[3] ?? 0, values[4] ?? 0, values[5] ?? 0];
  return SUPPORTED_APP_CONTENT_SCHEMA_VERSIONS.some((version) => {
    const currentParts = version.split('.').map(Number);
    const current: SemanticVersion = [
      currentParts[0] ?? 0,
      currentParts[1] ?? 0,
      currentParts[2] ?? 0,
    ];
    return compareVersions(current, lower) >= 0 && compareVersions(current, upper) < 0;
  });
}
